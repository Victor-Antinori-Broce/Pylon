/**
 * defineModelo — el MOTOR: del modelo a la tabla Drizzle y a las operaciones
 * ============================================================================
 *
 * El contrato (campos, política de acceso, esquemas, nombres, SQL) vive en
 * `@kitsuden/shared` (`modelos.ts`, `modelos-sql.ts`). Aquí está lo que lo
 * ejecuta, encajado en el SDK de kons (no al lado):
 *
 *   tablaDeModelo(m)                la tabla Drizzle (la misma forma que la
 *                                   migración que genera `makemigrations`)
 *   operacionesDeModelo(kon, m)     seis `defineOperacion` (describir, listar,
 *                                   obtener, crear, actualizar, borrar): de
 *                                   ellas salen REST, OpenAPI 3.1 y MCP
 *   defineKonDeModelos({…})         un `defineKonSdk` con las operaciones de
 *                                   sus modelos (y las propias que añada)
 *
 * ── LOS TRES MUROS ─────────────────────────────────────────────────────────
 *
 *   1. El PERMISO de la operación (antes de leer el cuerpo): el scope del
 *      modelo (`<modelo>:read|write`), uno fino o amplio del kon, `admin`, o
 *      la política `<modelo>` para las cuentas humanas. La política NO abre
 *      nada a un agente: un agente escribe solo con un scope de escritura.
 *   2. El FILTRO de filas del handler (dueño), igual que la RLS.
 *   3. La RLS de Postgres (la migración generada), con FORCE. La ruta corre
 *      en la transacción RLS que el anfitrión abre para toda ruta de un kon.
 *
 * Lo heredado del anfitrión sin hacer nada: la idempotencia (`Idempotency-Key`
 * en POST/PATCH; DELETE ya es idempotente), los errores problem+json
 * `KITSUDEN_E_*` (un UNIQUE repetido es 409 CONFLICT), la aprobación humana de
 * lo sensible (DELETE) y los límites de peticiones.
 */

import {
  descriptorDeModelo,
  eligeDueno,
  esquemaDescriptorDeModelo,
  esquemasDeModelo,
  idsDeOperacionesDeModelo,
  nombreCortoDeKon,
  rutasDeModelo,
  scopesDeModelo,
  tieneDueno,
  LIMITE_POR_DEFECTO,
  type Campo,
  type KonContext,
  type KonDefinition,
  type Modelo,
  type UsuarioDeOperacion,
  type DescriptorDeModelo,
  defineOperacion,
  columnaDeCampo,
} from "@kitsuden/shared";
import { and, asc, count, desc, eq, getTableColumns, sql, type SQL } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { z } from "zod";

import { agentePuedeEnKon, esAdminEfectivo, esAgente, esStaffEfectivo } from "./actor-efectivo";
import { queue } from "./cola";
import { COLA_DE_EMBEDDINGS, embeber, literalDeVector, type TrabajoDeEmbedding } from "./semantica";
import { definePolicy } from "./authz";
import { AppError } from "./errors";
import {
  defineKonSdk,
  operacionesMontadas,
  type DefinicionDeKonSdk,
  type OperacionCualquiera,
} from "./operaciones";

// ── La tabla ────────────────────────────────────────────────────────────────

function columna(clave: string, c: Campo) {
  const nombre = columnaDeCampo(clave);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- cada constructor de Drizzle tiene su tipo; la tabla es dinámica
  let col: any;
  switch (c.tipo) {
    case "texto":
      col = c.max !== undefined ? varchar(nombre, { length: c.max }) : text(nombre);
      break;
    case "textoLargo":
    case "enumerado":
      col = text(nombre);
      break;
    case "entero":
      col = integer(nombre);
      break;
    case "numero":
      col = doublePrecision(nombre);
      break;
    case "booleano":
      col = boolean(nombre);
      break;
    case "fecha":
      col = timestamp(nombre, { withTimezone: true });
      break;
    case "json":
      col = jsonb(nombre);
      break;
    case "uuid":
      col = uuid(nombre);
      break;
  }
  if (c.requerido) col = col.notNull();
  return col;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tabla construida en ejecución
export type TablaDeModelo = any;

const tablas = new WeakMap<Modelo, TablaDeModelo>();

/** La tabla Drizzle del modelo (una por modelo: se guarda). */
export function tablaDeModelo(m: Modelo): TablaDeModelo {
  const hecha = tablas.get(m);
  if (hecha) return hecha;
  const columnas: Record<string, unknown> = {
    id: uuid("id").primaryKey().defaultRandom(),
  };
  if (tieneDueno(m)) columnas.ownerId = text("owner_id");
  for (const [clave, c] of Object.entries(m.campos)) columnas[clave] = columna(clave, c);
  columnas.createdAt = timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
  columnas.updatedAt = timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ver TablaDeModelo
  const tabla = pgTable(m.tabla, columnas as any);
  tablas.set(m, tabla);
  return tabla;
}

// ── Política (cuentas humanas) ──────────────────────────────────────────────

const duenosDePolitica = new Map<string, string>();

/**
 * Registra la política `<modelo>` (acciones `read` y `write`). Solo decide por
 * cuentas HUMANAS: a un agente le devuelve `false` y entra únicamente por sus
 * scopes (`can()` concede `<modelo>:<acción>` por scope; el SDK, los finos y
 * amplios del kon). Así un agente nunca escribe «por ser usuario».
 *
 * Las pruebas que llaman a `resetAuthz()` la vuelven a registrar con
 * `registrarPoliticasDeModelos`.
 */
export function registrarPoliticaDeModelo(konId: string, m: Modelo): void {
  const otro = duenosDePolitica.get(m.nombre);
  if (otro && otro !== konId) {
    throw new Error(
      `modelo '${m.nombre}': ya lo declara ${otro}; el nombre de un modelo es su scope y no se puede repetir entre kons`
    );
  }
  duenosDePolitica.set(m.nombre, konId);
  const kon = nombreCortoDeKon(konId);
  const humano = (u: UsuarioDeOperacion | null) => !!u && !esAgente(u) && typeof u.id === "string" && u.id !== "";
  definePolicy(m.nombre, {
    read: (u) => {
      if (m.acceso.leer === "publico") return true;
      if (!humano(u)) return false;
      if (m.acceso.leer === "dueno") return true;
      return esStaffEfectivo(u, kon);
    },
    write: (u) => {
      if (!humano(u)) return false;
      return m.acceso.escribir === "dueno" ? true : esStaffEfectivo(u, kon);
    },
  });
}

export function registrarPoliticasDeModelos(konId: string, modelos: readonly Modelo[]): void {
  for (const m of modelos) registrarPoliticaDeModelo(konId, m);
}

// ── Filtros de filas (el segundo muro; los mismos que la RLS) ──────────────

/** ¿Ve este usuario TODAS las filas (no solo las suyas)? */
function veTodo(m: Modelo, u: UsuarioDeOperacion | null, kon: string): boolean {
  if (m.acceso.leer === "publico") return true;
  if (m.acceso.leer === "staff") return true; // el permiso ya exigió staff o el scope
  if (esAdminEfectivo(u, kon)) return true;
  if (m.acceso.escribir === "staff") {
    return esStaffEfectivo(u, kon) || agentePuedeEnKon(u, kon, scopesDeModelo(m).escribir);
  }
  return false;
}

/** ¿Escribe en TODAS las filas? */
function escribeTodo(m: Modelo, u: UsuarioDeOperacion | null, kon: string): boolean {
  return m.acceso.escribir === "staff" || esAdminEfectivo(u, kon);
}

function idDe(u: UsuarioDeOperacion | null): string {
  if (!u || typeof u.id !== "string" || !u.id) throw AppError.unauthenticated();
  return u.id;
}

// ── Las operaciones ─────────────────────────────────────────────────────────

const modeloPorOperacion = new WeakMap<object, { konId: string; modelo: Modelo }>();

/** El modelo del que salió una operación (o `null` si no es de un modelo). */
export function modeloDeOperacion(op: object): { konId: string; modelo: Modelo } | null {
  return modeloPorOperacion.get(op) ?? null;
}

type Fila = Record<string, unknown>;

/**
 * Las seis operaciones de un modelo, en el orden que exige Hono (lo literal,
 * `/_model`, antes que `/:id`).
 */
export function operacionesDeModelo(konId: string, m: Modelo): OperacionCualquiera[] {
  const kon = nombreCortoDeKon(konId);
  const tabla = tablaDeModelo(m);
  const esq = esquemasDeModelo(m);
  const ids = idsDeOperacionesDeModelo(m);
  const rutas = rutasDeModelo(m);
  const scopes = scopesDeModelo(m);
  const etiquetas = [`model:${m.nombre}`];
  const publico = m.acceso.leer === "publico";
  const conDueno = tieneDueno(m);
  const hayUnicos = Object.values(m.campos).some((c) => c.unico);

  // La comprobación ANTES del cuerpo (la del SDK) no ve el scope de recurso
  // (`scopeDeRecurso` necesita la entrada); `h.autorizar()` al empezar cada
  // handler sí, y así `!<modelo>:write` cierra aunque la clave traiga `admin`.
  const permisoLeer = {
    scopes: [scopes.leer],
    politica: { recurso: m.nombre, accion: "read" },
    scopeDeRecurso: () => scopes.leer,
  };
  const permisoEscribir = {
    scopes: [scopes.escribir],
    politica: { recurso: m.nombre, accion: "write" },
    scopeDeRecurso: () => scopes.escribir,
  };
  const accesoLeer = publico ? ("opcional" as const) : ("sesion" as const);
  const antes = [`Row ids come from ${konId.replace(/^kon-/, "")}__${ids.listar} (data[].id).`];

  const db = (h: { ctx: KonContext }) => h.ctx.db.instance;

  /**
   * D5: tras escribir una fila de un modelo con `semantica`, su embedding se
   * encola en la MISMA transacción (si la escritura se revierte, no hay
   * trabajo). Lo calcula el worker del host.
   */
  const encolarEmbedding = async (fila: Fila | undefined): Promise<void> => {
    if (!m.semantica || !fila?.id) return;
    const trabajo: TrabajoDeEmbedding = {
      tabla: m.tabla,
      id: String(fila.id),
      columnas: m.semantica.campos.map(columnaDeCampo),
      dimensiones: m.semantica.dimensiones,
    };
    await queue.dispatch(COLA_DE_EMBEDDINGS, `embed:${m.tabla}`, trabajo, { intentos: 5 });
  };

  const filtroLectura = (u: UsuarioDeOperacion | null): SQL | undefined =>
    conDueno && !veTodo(m, u, kon) ? eq(tabla.ownerId, idDe(u)) : undefined;
  const filtroEscritura = (u: UsuarioDeOperacion | null): SQL | undefined =>
    conDueno && !escribeTodo(m, u, kon) ? eq(tabla.ownerId, idDe(u)) : undefined;

  const describir = defineOperacion({
    id: ids.describir,
    metodo: "GET",
    ruta: rutas.describir,
    resumen: `Describe the ${m.etiqueta} model`,
    descripcion: `Fields, types, access policy and scopes of the '${m.nombre}' model (${m.descripcion}). The admin panel builds its list and forms from this.`,
    etiquetas,
    salida: { esquema: esquemaDescriptorDeModelo, descripcion: "The model descriptor" },
    acceso: accesoLeer,
    permiso: permisoLeer,
    manejar: async (_e, h): Promise<DescriptorDeModelo> => {
      await h.autorizar();
      return descriptorDeModelo(m);
    },
  });

  const listar = defineOperacion({
    id: ids.listar,
    metodo: "GET",
    ruta: rutas.coleccion,
    resumen: `List ${m.plural}`,
    descripcion: `Lists ${m.plural} (${m.descripcion}) you can see, newest first, paginated with limit/offset.${
      conDueno && m.acceso.leer === "dueno" ? " Only your own rows unless you administer this kon." : ""
    }`,
    etiquetas,
    entrada: { query: esq.consulta },
    salida: { esquema: esq.lista, descripcion: "A page of rows" },
    acceso: accesoLeer,
    permiso: permisoLeer,
    guia: {
      cuandoUsar: `To find ${m.plural} or get their ids. To read one by id use ${ids.obtener}.`,
      ejemplos: [{ titulo: "First page", argumentos: { limit: 10 } }],
    },
    manejar: async ({ query }, h) => {
      await h.autorizar();
      const qy = (query ?? {}) as Record<string, unknown>;
      const limit = (qy.limit as number | undefined) ?? LIMITE_POR_DEFECTO;
      const offset = (qy.offset as number | undefined) ?? 0;
      const orden = (qy.sort as string | undefined) ?? "-createdAt";
      const condiciones: SQL[] = [];
      const propio = filtroLectura(h.usuario);
      if (propio) condiciones.push(propio);
      for (const [clave, valor] of Object.entries(qy)) {
        if (clave === "limit" || clave === "offset" || clave === "sort" || valor === undefined) continue;
        const c = m.campos[clave];
        if (!c) continue;
        condiciones.push(eq(tabla[clave], c.tipo === "booleano" ? valor === "true" : valor));
      }
      const donde = condiciones.length ? and(...condiciones) : undefined;
      const campoOrden = orden.replace(/^-/, "");
      const porOrden = orden.startsWith("-") ? desc(tabla[campoOrden]) : asc(tabla[campoOrden]);
      // En serie: una transacción, una consulta cada vez (regla 1 del SDK).
      const data = (await db(h)
        .select()
        .from(tabla)
        .where(donde)
        .orderBy(porOrden, desc(tabla.id))
        .limit(limit)
        .offset(offset)) as Fila[];
      const [{ n }] = (await db(h).select({ n: count() }).from(tabla).where(donde)) as { n: number }[];
      return { data, total: Number(n), limit, offset };
    },
  });

  const obtener = defineOperacion({
    id: ids.obtener,
    metodo: "GET",
    ruta: rutas.fila,
    resumen: `Get a ${m.etiqueta}`,
    descripcion: `Reads one ${m.nombre} by id. 404 if it does not exist or you cannot see it (the API never says which).`,
    etiquetas,
    entrada: { params: esq.params },
    salida: { esquema: esq.fila },
    acceso: accesoLeer,
    permiso: permisoLeer,
    errores: ["KITSUDEN_E_NOT_FOUND"],
    guia: { antes },
    manejar: async ({ params }, h) => {
      await h.autorizar();
      const propio = filtroLectura(h.usuario);
      const [fila] = (await db(h)
        .select()
        .from(tabla)
        .where(and(eq(tabla.id, (params as { id: string }).id), propio))
        .limit(1)) as Fila[];
      if (!fila) throw AppError.notFound(`${m.nombre} not found`);
      return fila;
    },
  });

  const crear = defineOperacion({
    id: ids.crear,
    metodo: "POST",
    ruta: rutas.coleccion,
    resumen: `Create a ${m.etiqueta}`,
    descripcion: `Creates a ${m.nombre} (${m.descripcion}).${
      conDueno ? " You become its owner." : ""
    } Send Idempotency-Key to retry safely. Agents need the '${scopes.escribir}' scope.`,
    etiquetas,
    entrada: { cuerpo: esq.crear },
    salida: { estado: 201, esquema: esq.fila, descripcion: "The created row" },
    acceso: "sesion",
    permiso: permisoEscribir,
    sensible: m.sensible.crear,
    errores: hayUnicos ? ["KITSUDEN_E_CONFLICT"] : [],
    manejar: async ({ cuerpo }, h) => {
      await h.autorizar();
      const valores: Fila = { ...(cuerpo as Fila) };
      if (conDueno) {
        const elegido = eligeDueno(m) ? (valores.ownerId as string | undefined) : undefined;
        valores.ownerId = elegido ?? idDe(h.usuario);
      } else {
        delete valores.ownerId;
      }
      const [fila] = (await db(h).insert(tabla).values(valores).returning()) as Fila[];
      await encolarEmbedding(fila);
      return fila;
    },
  });

  const actualizar = defineOperacion({
    id: ids.actualizar,
    metodo: "PATCH",
    ruta: rutas.fila,
    resumen: `Update a ${m.etiqueta}`,
    descripcion: `Changes the fields you send of one ${m.nombre}; the rest stay as they are. 404 if it does not exist or is not yours to change. Agents need the '${scopes.escribir}' scope.`,
    etiquetas,
    entrada: { params: esq.params, cuerpo: esq.actualizar },
    salida: { esquema: esq.fila, descripcion: "The updated row" },
    acceso: "sesion",
    permiso: permisoEscribir,
    sensible: m.sensible.actualizar,
    errores: ["KITSUDEN_E_NOT_FOUND", ...(hayUnicos ? (["KITSUDEN_E_CONFLICT"] as const) : [])],
    guia: { antes },
    manejar: async ({ params, cuerpo }, h) => {
      await h.autorizar();
      const propio = filtroEscritura(h.usuario);
      const [fila] = (await db(h)
        .update(tabla)
        .set({ ...(cuerpo as Fila), updatedAt: new Date() })
        .where(and(eq(tabla.id, (params as { id: string }).id), propio))
        .returning()) as Fila[];
      if (!fila) throw AppError.notFound(`${m.nombre} not found`);
      await encolarEmbedding(fila);
      return fila;
    },
  });

  const borrar = defineOperacion({
    id: ids.borrar,
    metodo: "DELETE",
    ruta: rutas.fila,
    resumen: `Delete a ${m.etiqueta}`,
    descripcion: `Deletes one ${m.nombre}. Sensitive by default: an agent in approval mode gets 202 KITSUDEN_E_APPROVAL_REQUIRED and a human decides. 404 if it does not exist or is not yours.`,
    etiquetas,
    entrada: { params: esq.params },
    salida: { estado: 204, descripcion: "Deleted" },
    acceso: "sesion",
    permiso: permisoEscribir,
    sensible: m.sensible.borrar,
    errores: ["KITSUDEN_E_NOT_FOUND"],
    guia: { antes },
    manejar: async ({ params }, h) => {
      await h.autorizar();
      const propio = filtroEscritura(h.usuario);
      const borradas = (await db(h)
        .delete(tabla)
        .where(and(eq(tabla.id, (params as { id: string }).id), propio))
        .returning({ id: tabla.id })) as Fila[];
      if (borradas.length === 0) throw AppError.notFound(`${m.nombre} not found`);
      return null;
    },
  });

  // D5: la búsqueda semántica. Va ANTES de `obtener`: `/<plural>/search`
  // casaría si no con `/<plural>/:id`.
  const buscar = m.semantica
    ? defineOperacion({
        id: `search-${m.plural}`,
        metodo: "GET",
        ruta: `/${m.plural}/search`,
        resumen: `Semantic search over ${m.plural}`,
        descripcion: `The ${m.plural} you can see whose meaning is closest to \`q\` (embeddings of ${m.semantica.campos.join(", ")}), best first, with \`score\` (1 = identical). Rows written moments ago may not be searchable yet: their embedding is computed in the background.`,
        etiquetas,
        entrada: {
          query: z.object({
            q: z.string().trim().min(1).max(2000),
            limit: z.coerce.number().int().min(1).max(50).default(10),
          }),
        },
        salida: {
          esquema: z.object({ data: z.array(esq.fila.extend({ score: z.number() })) }),
          descripcion: "The closest rows",
        },
        acceso: accesoLeer,
        permiso: permisoLeer,
        guia: {
          cuandoUsar: `To find ${m.plural} by meaning rather than exact words. For exact filters use ${ids.listar}.`,
          ejemplos: [{ titulo: "Search", argumentos: { q: "example", limit: 5 } }],
        },
        manejar: async ({ query }, h) => {
          await h.autorizar();
          const qy = query as { q: string; limit: number };
          const vector = literalDeVector(await embeber(qy.q, m.semantica!.dimensiones));
          const distancia = sql`"embedding" <=> ${vector}::vector`;
          const condiciones: SQL[] = [sql`"embedding" IS NOT NULL`];
          const propio = filtroLectura(h.usuario);
          if (propio) condiciones.push(propio);
          const data = (await db(h)
            .select({ ...getTableColumns(tabla), score: sql<number>`1 - (${distancia})` })
            .from(tabla)
            .where(and(...condiciones))
            .orderBy(distancia)
            .limit(qy.limit)) as Fila[];
          return { data: data.map((f) => ({ ...f, score: Number(f.score) })) };
        },
      })
    : null;

  const ops = (
    buscar
      ? [describir, listar, buscar, obtener, crear, actualizar, borrar]
      : [describir, listar, obtener, crear, actualizar, borrar]
  ) as OperacionCualquiera[];
  for (const op of ops) modeloPorOperacion.set(op, { konId, modelo: m });
  return ops;
}

// ── El kon ──────────────────────────────────────────────────────────────────

export type DefinicionDeKonDeModelos = Omit<DefinicionDeKonSdk, "operaciones"> & {
  modelos: Modelo[];
  /** Operaciones propias del kon, además de las de sus modelos (van detrás). */
  operaciones?: DefinicionDeKonSdk["operaciones"];
};

/**
 * Un kon cuyos modelos generan sus operaciones. Es un `defineKonSdk` normal:
 * el cargador lo monta, la RLS por petición y la idempotencia se heredan, y
 * sus operaciones salen en OpenAPI y MCP como las de cualquier kon.
 */
export function defineKonDeModelos(def: DefinicionDeKonDeModelos): KonDefinition {
  const { modelos, operaciones: propias, ...resto } = def;
  if (!modelos?.length) throw new Error(`${def.id}: defineKonDeModelos necesita al menos un modelo`);
  registrarPoliticasDeModelos(def.id, modelos);
  const deModelos = modelos.flatMap((m) => operacionesDeModelo(def.id, m));
  const tablasDeModelos = modelos.map((m) => m.tabla);
  const kon = defineKonSdk({
    ...resto,
    tables: [...new Set([...(resto.tables ?? []), ...tablasDeModelos])],
    operaciones: (ctx: KonContext) => [
      ...deModelos,
      ...(typeof propias === "function" ? propias(ctx) : (propias ?? [])),
    ],
  });
  const crearRouter = kon.createRouter;
  return {
    ...kon,
    createRouter: (ctx: KonContext) => {
      // Tras un `resetAuthz()` (pruebas) la política tiene que volver.
      registrarPoliticasDeModelos(def.id, modelos);
      return crearRouter(ctx);
    },
  };
}

// ── Lo montado (lo lee GET /api/models) ─────────────────────────────────────

export interface ModeloMontado {
  konId: string;
  /** Sin barra final: `/api/notas`. */
  mountPath: string;
  /** Donde vive la colección: `/api/notas/notes`. */
  base: string;
  descriptor: DescriptorDeModelo;
}

/** Los modelos de los kons montados (por sus operaciones `describe-*`). */
export function modelosMontados(): ModeloMontado[] {
  const lista: ModeloMontado[] = [];
  for (const { konId, mountPath, operaciones } of operacionesMontadas()) {
    for (const op of operaciones) {
      const de = modeloDeOperacion(op);
      if (!de || op.id !== idsDeOperacionesDeModelo(de.modelo).describir) continue;
      lista.push({
        konId,
        mountPath,
        base: `${mountPath}${rutasDeModelo(de.modelo).coleccion}`,
        descriptor: descriptorDeModelo(de.modelo),
      });
    }
  }
  return lista;
}
