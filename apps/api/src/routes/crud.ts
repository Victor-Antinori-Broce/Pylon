import { comoSistema, conSavepoint, resolveExecutor, esUuid } from "@kitsuden/engine";
import { accesoADataset, agenteEscribePorPolitica, firmaDeAgente, publishedOrOwn } from "@kitsuden/shared";
import { and, eq, sql } from "drizzle-orm";
import { Hono } from "hono";

import { db } from "../db";
import { olvidarAjustesDelSitio } from "../lib/ajustes-del-sitio";
import { aplicarProcedenciaEnRest } from "../lib/procedencia";
import { invalidateRealtimePolicy } from "../lib/realtime-wiring";
import { dataSets, dataEntries, siteSettings } from "../db/schema";
import {
  addSchemaVersionToData,
  syncDatasetIndexes,
  validateDatasetEntry,
} from "../lib/dataset-optimizations";
import {
  buildDatasetWhere,
  checkReadAccess,
  checkWriteAccess,
  type PolicyJson,
  type RLSUser,
} from "../lib/rls-builder";
import { resolveEntryStatus } from "../middleware/permissions";
import { requireAuth } from "../middleware/auth";
import { exigirStaff } from "../middleware/auth-guard";
import type { AppVariables } from "../types/hono";

import { invalidateGraphQLCache } from "./graphql";

// ── Data Sets Lite (fallback when kon-datasets isn't loaded) ──
export const dataSetsRoutes = new Hono<{ Variables: AppVariables }>();

/**
 * El dataset (su definición, no sus filas) aplica la MISMA política de lectura
 * que sus entries.
 *
 * Antes el listado y la ficha por slug devolvían todos los datasets a
 * cualquiera: las filas de un dataset privado estaban protegidas, pero su
 * nombre, su esquema y su política se leían sin sesión.
 */
const usuarioDe = (c: { get: (k: "user") => unknown }) => (c.get("user") ?? null) as RLSUser | null;
/**
 * Fase E: los scopes POR DATASET del agente (`datasets:<slug>:read`, y las
 * denegaciones `!datasets:<slug>:*`) deciden antes que la política; si no
 * dicen nada, la política. Igual que en kon-datasets (`puedeVerDataset`).
 */
const scopesDe = (user: RLSUser | null) =>
  (user as { scopes?: unknown } | null)?.scopes as string[] | undefined;
const legible = (dataset: { policyJson: unknown; slug?: string | null }, user: RLSUser | null) => {
  const acceso = accesoADataset(scopesDe(user), dataset.slug ?? null, "read");
  if (acceso) return acceso === "concedido";
  // The team reaches every dataset, as in kon-datasets: an editor must be able to
  // use the dataset it just created, which is `admin`/`admin` by default.
  if (esDelEquipo(user)) return true;
  return checkReadAccess((dataset.policyJson ?? null) as PolicyJson | null, user);
};
const escribible = (dataset: { policyJson: unknown; slug?: string | null }, user: RLSUser | null) => {
  const acceso = accesoADataset(scopesDe(user), dataset.slug ?? null, "write");
  if (acceso) return acceso === "concedido";
  // An agent key is not a session: `writeAccess: "authenticated"` does not let a
  // read-only key write.
  if (user?.role === "agent") {
    return agenteEscribePorPolitica(scopesDe(user), (dataset.policyJson ?? null) as PolicyJson | null);
  }
  if (esDelEquipo(user)) return true;
  return checkWriteAccess((dataset.policyJson ?? null) as PolicyJson | null, user);
};

dataSetsRoutes.get("/", async (c) => {
  // 1000 y no 200: con más de 200 datasets, el sitio se quedaba sin los que van
  // detrás por nombre («Ranking · …», `proximos-juegos`), y sin ningún error.
  const limit = Math.min(Number(c.req.query("limit")) || 50, 1000);
  const offset = Math.max(Number(c.req.query("offset")) || 0, 0);
  const user = usuarioDe(c);
  // Se filtra DESPUÉS de leer: `limit` cuenta los visibles de la página, no
  // los que hay detrás. Con 1000 como máximo, no compensa traducir la política
  // a SQL aquí. El id desempata: sin él, dos nombres iguales pueden saltarse
  // o repetirse entre páginas.
  const docs = (
    await db.select().from(dataSets).orderBy(dataSets.name, dataSets.id).limit(limit).offset(offset)
  ).filter((ds) => legible(ds, user));
  return c.json({ docs, totalDocs: docs.length });
});

dataSetsRoutes.get("/slug/:slug", async (c) => {
  const result = await db
    .select()
    .from(dataSets)
    .where(eq(dataSets.slug, c.req.param("slug")))
    .limit(1);
  // 404 también sin permiso: no se confirma que exista
  if (!result.length || !legible(result[0], usuarioDe(c))) {
    return c.json({ error: "DataSet not found" }, 404);
  }
  return c.json(result[0]);
});

/**
 * Un dataset por id.
 *
 * El panel la llama (`api.ts` → `/data-sets/:id`) y no existía: sin kon-datasets
 * la ficha de un dataset respondía 404 siempre.
 */
dataSetsRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  if (!esUuid(id)) return c.json({ error: "DataSet not found" }, 404);

  const [dataset] = await db.select().from(dataSets).where(eq(dataSets.id, id)).limit(1);
  if (!dataset || !legible(dataset, usuarioDe(c))) {
    return c.json({ error: "DataSet not found" }, 404);
  }
  return c.json(dataset);
});

/**
 * Lista las entries de un dataset aplicando su policyJson.
 *
 * SEGURIDAD (dos niveles, ver ADR-002):
 *   - Nivel 1 (aquí): `checkReadAccess` decide si el usuario puede leer el
 *     dataset, y `buildDatasetWhere` traduce sus `rlsRules` a un WHERE de
 *     Drizzle (p.ej. ownerId = current_user). Esto es lo que realmente aísla,
 *     porque el contexto RLS vacío de un anónimo es escape hatch en Postgres.
 *   - Nivel 2: la transacción RLS montada en index.ts sobre esta ruta.
 *
 * Antes filtraba SOLO por dataSetId con la `db` global: cualquiera veía las
 * entries de todos los usuarios.
 */
dataSetsRoutes.get("/:id/entries", async (c) => {
  const datasetId = c.req.param("id");

  /**
   * Un id que no es UUID es un dataset inexistente, no un error del servidor.
   *
   * `eq(dataSets.id, datasetId)` con un texto cualquiera le llega a Postgres tal
   * cual y responde `invalid input syntax for type uuid`: 500. Cualquier enlace
   * viejo o mal escrito daba error de servidor en vez de 404 — y un 500 en una
   * ruta publica es ruido en los logs que tapa los que si importan.
   *
   * Lo detecto `scripts/humo-rutas.ts`.
   */
  if (!esUuid(datasetId)) return c.json({ error: "DataSet not found" }, 404);

  const limit = Math.min(Number(c.req.query("limit")) || 500, 1000);
  /**
   * Sin `offset` no había forma de leer un dataset de más de 1000 filas: el
   * sitio público se quedaba con las primeras y las demás no existían para él
   * (a un personaje de Star Rail le faltaban habilidades porque su fila caía
   * más allá del corte).
   */
  const offset = Math.max(Number(c.req.query("offset")) || 0, 0);
  const user = (c.get("user") ?? null) as RLSUser | null;

  const [dataset] = await db
    .select({ policyJson: dataSets.policyJson, slug: dataSets.slug })
    .from(dataSets)
    .where(eq(dataSets.id, datasetId))
    .limit(1);

  // 404 (no 403) para no filtrar la existencia del dataset.
  if (!dataset) return c.json({ error: "DataSet not found" }, 404);

  const policy = dataset.policyJson as PolicyJson | null;
  if (!legible(dataset, user)) {
    return c.json({ error: "DataSet not found" }, 404);
  }

  const { where } = buildDatasetWhere(datasetId, policy?.rlsRules, user);
  // Sin ser del equipo: publicadas o propias (auditoría 2026-10-25)
  const visibles = esDelEquipo(user) ? where : and(where, publishedOrOwn(user?.id));

  const ejecutor = resolveExecutor(db) as typeof db;

  /**
   * `?count=exact`: cuántas filas VE quien pregunta en total (no solo en esta
   * página), con el MISMO filtro de visibilidad y sobre la misma transacción
   * RLS que las filas. Va en `totalCount`; `totalDocs` sigue siendo el tamaño
   * de la página, como siempre. Con `limit=0` no se leen filas: solo se cuenta.
   *
   * Para «En números» de las webs, que para saber cuántas fichas había leía
   * TODAS las filas de cada dataset página a página (rendimiento, 2026-10-27).
   */
  const contar = c.req.query("count") === "exact";
  const soloContar = contar && c.req.query("limit") === "0";

  const totalCount = contar
    ? Number(
        (
          await ejecutor
            .select({ n: sql<number>`count(*)` })
            .from(dataEntries)
            .where(visibles)
        )[0]?.n ?? 0
      )
    : undefined;

  // Ejecuta sobre el tx RLS del request-scope si existe; si no, la db global.
  const docs = soloContar
    ? []
    : await ejecutor
        .select()
        .from(dataEntries)
        .where(visibles)
        // El id desempata: con dos filas del mismo `sortOrder`, el orden entre
        // páginas no está definido y una fila podría repetirse o perderse
        .orderBy(dataEntries.sortOrder, dataEntries.id)
        .limit(limit)
        .offset(offset);

  // Opcional (X-Kitsuden-Provenance: 1): quién escribió cada fila. Sin pedirlo, igual que siempre.
  const filas = await aplicarProcedenciaEnRest(c, docs, ejecutor);
  return c.json(
    contar
      ? { docs: filas, totalDocs: docs.length, offset, totalCount }
      : { docs: filas, totalDocs: docs.length, offset }
  );
});

/** Una entry. Mismas dos capas que el listado: política y `rlsRules`. */
dataSetsRoutes.get("/:id/entries/:entryId", async (c) => {
  const datasetId = c.req.param("id");
  const entryId = c.req.param("entryId");
  if (!esUuid(datasetId) || !esUuid(entryId)) return c.json({ error: "Not found" }, 404);

  const user = usuarioDe(c);
  const [dataset] = await db
    .select({ policyJson: dataSets.policyJson, slug: dataSets.slug })
    .from(dataSets)
    .where(eq(dataSets.id, datasetId))
    .limit(1);
  if (!dataset || !legible(dataset, user)) return c.json({ error: "Not found" }, 404);

  const policy = dataset.policyJson as PolicyJson | null;
  const { where } = buildDatasetWhere(datasetId, policy?.rlsRules, user);

  const ejecutor = resolveExecutor(db) as typeof db;
  const [entry] = await ejecutor
    .select()
    .from(dataEntries)
    .where(and(where, eq(dataEntries.id, entryId), esDelEquipo(user) ? undefined : publishedOrOwn(user?.id)))
    .limit(1);

  if (!entry) return c.json({ error: "Not found" }, 404);
  const [conProcedencia] = await aplicarProcedenciaEnRest(c, [entry], ejecutor);
  return c.json(conProcedencia);
});

/**
 * Crear un dataset es cosa del equipo (`admin`/`editor`).
 *
 * Antes bastaba `requireAuth`, y el alta es abierta: cualquier cuenta creaba
 * datasets con la `policyJson` que quisiera, ocupaba slugs que el sitio usará
 * después (`/api/data-sets/slug/<slug>`) y disparaba la creación de índices
 * sobre `data_entries`. Auditoría 2026-10-15.
 */
dataSetsRoutes.post("/", exigirStaff, async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body.name !== "string" || !body.name.trim()) {
    return c.json({ error: "name es obligatorio" }, 400);
  }
  // La política decide quién ve qué (`readAccess: "public"` publica las
  // filas): fijarla es solo de administración, como en el PATCH.
  if (body.policyJson !== undefined && usuarioDe(c)?.role !== "admin") {
    return c.json({ error: "Solo administración puede fijar la política de un dataset" }, 403);
  }
  const schema = body.schema ?? body.fields ?? [];
  const [row] = await db
    .insert(dataSets)
    .values({
      name: body.name,
      slug: body.slug || body.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      description: body.description,
      icon: body.icon,
      schema,
      displayConfig: body.displayConfig,
      // Closed by default, like `POST /api/datasets`: opening a dataset to every
      // account is a decision, and sign-up may be open to anyone. The owner rule
      // stays, so a dataset later opened with `writeAccess` is still per owner.
      policyJson: body.policyJson || {
        readAccess: "admin",
        writeAccess: "admin",
        enableRLS: true,
        // `__USER_ID__` es el marcador que entiende rls-builder. Antes ponía
        // "{{current_user_id}}", que se comparaba LITERALMENTE: la regla de
        // dueño no casaba nunca y nadie veía sus filas (2026-10-15).
        rlsRules: [{ field: "ownerId", operator: "eq", value: DATASET_RLS_DUENO }],
      },
    })
    .returning();

  // Create partial indexes for this dataset's filterable fields.
  // Failures are logged but do not block dataset creation.
  await syncDatasetIndexes(row.id, row.slug, schema);

  await invalidateGraphQLCache();
  return c.json(row, 201);
});

/**
 * Columnas que un PATCH puede tocar.
 *
 * Antes era `.set({ ...body })`: cualquier sesión podía cambiar el `id`, el
 * `slug` o la `policyJson` de un dataset AJENO — y cambiar la política a
 * `readAccess: "public"` publicaba las filas privadas de todos sus dueños.
 */
const EDITABLES_DE_DATASET = [
  "name",
  "description",
  "icon",
  "displayConfig",
  "workflowJson",
  "contentConfig",
] as const;

dataSetsRoutes.patch("/:id", requireAuth, async (c) => {
  const id = c.req.param("id");
  if (!esUuid(id)) return c.json({ error: "DataSet not found" }, 404);
  const body = await c.req.json();
  const user = usuarioDe(c);

  const [existing] = await db.select().from(dataSets).where(eq(dataSets.id, id)).limit(1);
  if (!existing || !legible(existing, user)) return c.json({ error: "DataSet not found" }, 404);

  // Cambiar la forma de un dataset afecta a las filas de TODOS sus dueños
  if (user?.role !== "admin" && user?.role !== "editor") {
    return c.json({ error: "Solo administración o edición pueden cambiar un dataset" }, 403);
  }
  // Y la política decide quién ve qué: solo administración
  if (body.policyJson !== undefined && user.role !== "admin") {
    return c.json({ error: "Solo administración puede cambiar la política de un dataset" }, 403);
  }

  const cambios: Record<string, unknown> = {};
  for (const clave of EDITABLES_DE_DATASET) {
    if (body[clave] !== undefined) cambios[clave] = body[clave];
  }
  if (body.policyJson !== undefined) cambios.policyJson = body.policyJson;

  const schema = body.schema ?? body.fields;
  const [updated] = await db
    .update(dataSets)
    .set({
      ...cambios,
      ...(schema !== undefined ? { schema } : {}),
      updatedAt: new Date(),
    })
    .where(eq(dataSets.id, id))
    .returning();

  if (schema !== undefined) {
    await syncDatasetIndexes(updated.id, updated.slug, schema, { dropRemoved: true });
  }

  await invalidateGraphQLCache();
  // La política del realtime se cachea por slug: la vieja y la nueva (si cambió).
  invalidateRealtimePolicy(existing.slug);
  if (updated?.slug && updated.slug !== existing.slug) invalidateRealtimePolicy(updated.slug);
  return c.json(updated);
});

/**
 * Decide de quién es una entry: de la sesión, salvo que quien escribe sea del
 * equipo y el payload diga otro dueño.
 *
 * Está extraído en vez de escrito en línea porque es una regla de SEGURIDAD —
 * `owner_id` es la columna sobre la que se apoyan las políticas RLS— y lo que
 * antes la "probaba" era un `expect(fuente).toContain("ownerId = e.ownerId ??")`.
 * Un grep sobre el código fuente no comprueba comportamiento: al refactorizar
 * esta línea sin cambiar lo que hace, el test se puso rojo; si alguien borrara
 * la asignación dejando el texto en un comentario, seguiría verde.
 *
 * Que el payload PISE a la sesión lo usan las importaciones que atribuyen
 * filas a otro usuario — y eso es cosa del equipo. Antes valía para cualquier
 * cuenta: un usuario recién registrado creaba entries A NOMBRE DE OTRO en un
 * dataset con `rlsRules` por dueño, es decir, le metía filas en su espacio
 * privado (auditoría 2026-10-15). Ahora, sin `puedeAtribuir`, el dueño es
 * siempre quien escribe.
 */
export function resolveEntryOwnerId(
  payload: Record<string, unknown>,
  sessionUserId: string | undefined,
  puedeAtribuir = false
): string | null {
  if (puedeAtribuir && payload.ownerId != null) return payload.ownerId as string;
  return sessionUserId ?? null;
}

/** El marcador de usuario que entiende `rls-builder` (ver `USER_ID_PLACEHOLDER`). */
export const DATASET_RLS_DUENO = "__USER_ID__";

const esDelEquipo = (user: RLSUser | null) => user?.role === "admin" || user?.role === "editor";

dataSetsRoutes.post("/:id/entries", requireAuth, async (c) => {
  const id = c.req.param("id");

  // Mismo motivo que en el GET.
  if (!esUuid(id)) return c.json({ error: "DataSet not found" }, 404);

  const body = await c.req.json();
  const entries = Array.isArray(body) ? body : [body];

  const [dataset] = await db.select().from(dataSets).where(eq(dataSets.id, id)).limit(1);
  const user = usuarioDe(c);
  if (!dataset || !(legible(dataset, user) || escribible(dataset, user))) {
    return c.json({ error: "DataSet not found" }, 404);
  }

  // La política tiene `writeAccess` y esta ruta no lo miraba: cualquier sesión
  // escribía en un dataset de solo administración.
  if (!escribible(dataset, user)) {
    return c.json({ error: "No tienes permiso para escribir en este dataset" }, 403);
  }

  const schema = dataset.schema ?? [];
  const validatedEntries: {
    original: { title?: string; thumbnailId?: string; sortOrder?: number; status?: string };
    data: Record<string, unknown>;
  }[] = [];

  for (const e of entries) {
    const payload = e.data ?? e;
    const validation = validateDatasetEntry(schema, payload);
    if (!validation.success) {
      return c.json(
        {
          error: "Validation failed",
          field: e,
          details: validation.error.format(),
        },
        400
      );
    }
    validatedEntries.push({ original: e, data: validation.data });
  }

  // Fase F: lo que crea un AGENTE lo firma su humano responsable (dueño);
  // sin firmante, sin dueño como antes. Ver @kitsuden/shared firmante.ts.
  const firmas = validatedEntries.map(({ data }) =>
    user?.role === "agent"
      ? firmaDeAgente(c.get("user") as never, (data as { ownerId?: string }).ownerId, "nadie")
      : null
  );
  const rechazo = firmas.find((f) => f && !f.ok);
  if (rechazo && !rechazo.ok) {
    return c.json({ error: "Forbidden", message: rechazo.mensaje, code: rechazo.code }, 403);
  }

  // On the request's RLS transaction, so that the `data_entries_*` policies also
  // decide. A human on the team attributes rows to others (`resolveEntryOwnerId`),
  // which the owner policy would refuse: that was authorized above, in the app.
  const ejecutor = resolveExecutor(db) as typeof db;
  const insertar = () => ejecutor
    .insert(dataEntries)
    .values(
      validatedEntries.map(({ original, data }, i) => {
        const versioned = addSchemaVersionToData(schema, data);
        const firma = firmas[i];
        const ownerId =
          firma && firma.ok
            ? firma.autor
            : resolveEntryOwnerId(versioned, c.get("user")?.id, esDelEquipo(user));
        return {
          title:
            (versioned.title as string) ||
            (versioned.name as string) ||
            original.title ||
            "Untitled",
          dataSetId: id,
          data: { ...versioned, ownerId },
          // Estado, orden y miniatura solo los fija el equipo; para el resto el
          // estado lo decide el flujo del dataset (`workflowJson.requireApproval`).
          // Antes cualquier cuenta publicaba sin revisión (auditoría 2026-10-25).
          thumbnailId: esDelEquipo(user) ? original.thumbnailId : undefined,
          sortOrder: esDelEquipo(user) ? original.sortOrder || 0 : 0,
          status: esDelEquipo(user)
            ? original.status || "published"
            : resolveEntryStatus(dataset.workflowJson as never),
          ownerId,
          createdById: c.get("user")?.id ?? null,
        };
      })
    )
    .returning();
  let rows: Awaited<ReturnType<typeof insertar>>;
  try {
    rows = await conSavepoint(() => (esDelEquipo(user) ? comoSistema(insertar) : insertar()));
  } catch (error) {
    // 42501: the database refused what the application let through.
    if ((error as { code?: string; cause?: { code?: string } })?.code === "42501" ||
        (error as { cause?: { code?: string } })?.cause?.code === "42501") {
      return c.json({ error: "No tienes permiso para escribir en este dataset" }, 403);
    }
    throw error;
  }
  await invalidateGraphQLCache();
  return c.json(rows, 201);
});

// ── Site Settings (singleton) ──
export const settingsRoutes = new Hono();

export async function getSettingsHandler(c: any) {
  const result = await db.select().from(siteSettings).limit(1);
  if (!result.length) {
    const [defaults] = await db.insert(siteSettings).values({}).returning();
    return c.json(defaults);
  }
  return c.json(result[0]);
}
settingsRoutes.get("/", getSettingsHandler);

/**
 * Lo que un PATCH de ajustes puede tocar. Antes era `.set({ ...body })`: con
 * el cuerpo entero se reescribía también `id` o `updatedAt` (la ruta es solo
 * admin, pero una lista blanca no depende de que la puerta siga ahí).
 */
export const AJUSTES_EDITABLES = [
  "siteName",
  "siteDescription",
  "siteUrl",
  "branding",
  "mainNav",
  "social",
  "analytics",
  "activeTheme",
  "footerText",
] as const;

export function soloAjustesEditables(body: unknown): Record<string, unknown> {
  const limpio: Record<string, unknown> = {};
  if (!body || typeof body !== "object") return limpio;
  for (const clave of AJUSTES_EDITABLES) {
    if ((body as Record<string, unknown>)[clave] !== undefined) {
      limpio[clave] = (body as Record<string, unknown>)[clave];
    }
  }
  return limpio;
}

export async function patchSettingsHandler(c: any) {
  const body = soloAjustesEditables(await c.req.json());
  const existing = await db.select().from(siteSettings).limit(1);
  if (!existing.length) {
    const [row] = await db
      .insert(siteSettings)
      .values({ ...body })
      .returning();
    olvidarAjustesDelSitio();
    return c.json(row);
  }
  const [updated] = await db
    .update(siteSettings)
    .set({ ...body, updatedAt: new Date() })
    .where(eq(siteSettings.id, existing[0].id))
    .returning();
  // Sin esto, cambiar el Site URL tardaría hasta 30 s en llegar a las wikis
  olvidarAjustesDelSitio();
  return c.json(updated);
}
settingsRoutes.patch("/", patchSettingsHandler);

/**
 * Estado en vivo del canal del grupo — el dato que pinta el banner
 * «Estamos en directo» de las webs.
 *
 * Público: lo que devuelve es lo mismo que cualquiera ve en la página del
 * canal de Twitch (título, juego, espectadores). Va cacheado 60 s en
 * memoria: helix permite 800 peticiones/minuto, pero una portada con tráfico
 * no debería necesitar ni una por minuto. Sin canal configurado o sin
 * credenciales responde `configurado: false` — el banner simplemente no se
 * pinta, y la página NO se cae por un tercero: ante un fallo de Twitch se
 * responde `live: null`, que se lee como «no hay directo».
 */
let cacheDirecto: { valor: unknown; caduca: number } | null = null;

settingsRoutes.get("/social-live", async (c) => {
  if (cacheDirecto && cacheDirecto.caduca > Date.now()) {
    return c.json(cacheDirecto.valor);
  }

  let respuesta: Record<string, unknown>;
  try {
    const [fila] = await db.select().from(siteSettings).limit(1);
    const login = (fila?.social?.twitch ?? "").trim();
    if (!login) {
      respuesta = { configurado: false, live: null };
    } else {
      const { getStreamStatusByLogin, isTwitchConfigured } = await import("../services/twitch");
      if (!isTwitchConfigured()) {
        respuesta = {
          configurado: false,
          live: null,
          razon: "Faltan TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET",
        };
      } else {
        const estados = await getStreamStatusByLogin([login]);
        const directo = [...estados.values()][0] ?? null;
        respuesta = {
          configurado: true,
          live: directo
            ? {
                login,
                url: `https://www.twitch.tv/${login}`,
                titulo: directo.title,
                juego: directo.gameName,
                espectadores: directo.viewerCount,
                miniatura: directo.thumbnailUrl,
              }
            : null,
        };
      }
    }
  } catch (error) {
    console.error("[social-live] consulta a Twitch:", error);
    respuesta = { configurado: true, live: null };
  }

  cacheDirecto = { valor: respuesta, caduca: Date.now() + 60_000 };
  return c.json(respuesta);
});

// ── Auth ──
// Auth is now handled by Better-Auth in lib/auth.ts
// Mounted via app.on(["POST", "GET"], "/api/auth/*") in index.ts

// ── Sync Routes ──
export const syncRoutes = new Hono();

export async function igdbSearchHandler(c: any) {
  const { query, limit } = await c.req.json();
  const { searchGames } = await import("../services/igdb");
  const results = await searchGames(query, limit);
  return c.json(results);
}
syncRoutes.post("/igdb/search", igdbSearchHandler);

// NOTE: IGDB import moved to kon-games. The core BaaS does not depend on gaming domain tables.
export async function igdbImportHandler(c: any) {
  return c.json(
    {
      error: "IGDB import is handled by kon-games. Install it with: kitsuden install kon-games",
    },
    501
  );
}
syncRoutes.post("/igdb/import/:igdbId", igdbImportHandler);

export async function twitchStatusHandler(c: any) {
  const { channelIds } = await c.req.json();
  const { getStreamStatus } = await import("../services/twitch");
  const statuses = await getStreamStatus(channelIds);
  return c.json(Object.fromEntries(statuses));
}
syncRoutes.post("/twitch/status", twitchStatusHandler);
