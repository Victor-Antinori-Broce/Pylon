#!/usr/bin/env bun
/**
 * Matriz de autorización: cada ruta montada × cada identidad
 * ============================================================================
 *
 * ── QUÉ HACE ───────────────────────────────────────────────────────────────
 *
 * Monta la app REAL (`src/index.ts`: el mismo orden de middlewares, las mismas
 * puertas, los kons cargados por `module-loader`), crea diez identidades de
 * verdad en la base —sesiones de better-auth firmadas y claves de agente
 * reales— y pide CADA ruta registrada con cada una:
 *
 *   anonimo · usuario (rol `user`, recién registrado) · editor · admin ·
 *   agente sin scopes · agente con `contenido:editar`
 *
 * y tres con permisos FINOS (fase E): solo `kon:blog:crear-entrada`, solo
 * `datasets:<slug>:read` de un dataset privado que se crea aquí, y
 * `contenido:editar` + `!kon:blocks:*` (amplio con denegación). Para el de
 * datasets hay además sondas contra ese dataset real (`SONDAS_FINAS`).
 *
 * Escribe un JSON con el estado HTTP de cada combinación. La comparación con
 * la tabla declarativa (`src/middleware/matriz-de-autorizacion.ts`) la hace
 * `tests/unit/matriz-de-autorizacion.test.ts`, o este mismo script con
 * `--comprobar` (sale con 1 si algo no casa).
 *
 * ── DÓNDE CORRE ────────────────────────────────────────────────────────────
 *
 * SOLO contra una base de PRUEBAS migrada con todos los kons, porque crea
 * usuarios, sesiones y agentes, y porque las rutas a las que una identidad
 * llega se EJECUTAN (con cuerpos vacíos e ids que no existen, pero se
 * ejecutan). Por eso:
 *
 *   - exige `NODE_ENV=test`, `KITSUDEN_TEST_DB=postgres` y una base cuyo
 *     nombre contenga `test` (lo comprueba `src/db/index.ts`); con pg-mem no
 *     se cargan kons y la matriz no diría nada, así que se niega;
 *   - corta toda petición `fetch` a un host que no sea local;
 *   - no ejecuta como admin/editor las escrituras de `NO_EJECUTAR_CON_PERMISO`
 *     (tocan disco, el repositorio o el proceso). Para ellas solo se mide que
 *     las identidades SIN permiso se queden fuera — que es lo que importa.
 *
 *   docker run --rm -d --name kitsuden_matriz -p 127.0.0.1:55471:5432 \
 *     -e POSTGRES_USER=kitsuden -e POSTGRES_PASSWORD=... \
 *     -e POSTGRES_DB=kitsuden_matriz_test pgvector/pgvector:pg16
 *   DATABASE_URL=<superusuario> bun run scripts/migrate.ts --todos-los-kons
 *   (crear el rol de la app como en docker/start-with-check.sh)
 *   NODE_ENV=test KITSUDEN_TEST_DB=postgres DATABASE_URL=<rol app> \
 *     DATABASE_ADMIN_URL=<superusuario> REDIS_URL=redis://127.0.0.1:1 \
 *     bun run scripts/matriz-de-autorizacion.ts --salida=matriz.json --comprobar
 *
 * `DATABASE_ADMIN_URL` solo se usa aquí, ANTES de montar la app, para
 * encender todos los kons en `modules` (el rol de la app puede hacerlo
 * también; se acepta cualquiera de las dos).
 */

import { writeFileSync } from "node:fs";

// ── 0. Nada sale de la máquina ──────────────────────────────────────────────
const fetchOriginal = globalThis.fetch;
globalThis.fetch = (async (entrada: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(
    typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url
  );
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname)) {
    throw new Error(`[matriz] fetch bloqueado a ${url.hostname}`);
  }
  return fetchOriginal(entrada as never, init);
}) as typeof fetch;

if (process.env.NODE_ENV !== "test" || process.env.KITSUDEN_TEST_DB !== "postgres") {
  console.error(
    "La matriz crea usuarios y ejecuta rutas: solo con NODE_ENV=test y KITSUDEN_TEST_DB=postgres."
  );
  process.exit(2);
}

// La matriz mide PUERTAS, no límites, y para eso vacía la reserva del limitador
// antes de cada petición (`vaciarReservaEnMemoria()`). Con Valkey la cuenta vive
// allí y no se vacía: tras cientos de peticiones desde la misma IP, los límites
// por ruta de los kons (cerrados si fallan) devolvían 429 al anónimo, y un 429
// no dice si la puerta está cerrada. El limitador sigue MONTADO (sus entradas
// `ALL` están en la tabla), pero cuenta en memoria.
process.env.REDIS_URL = "";
process.env.VALKEY_URL = "";

const args = process.argv.slice(2);
const salida = args.find((a) => a.startsWith("--salida="))?.slice("--salida=".length);
const comprobar = args.includes("--comprobar");

// ── 1. Encender todos los kons ANTES de montar la app ───────────────────────
//
// `loadKons()` solo carga lo que diga la tabla `modules`; un kon apagado deja
// un delegado comodín (`lib/kons-diferidos.ts`) cuyas rutas internas no salen
// en `app.routes`. Para ver la superficie entera hay que encenderlos todos.
{
  // Los INSTALADOS (núcleo + kitsuden.kons.json + KITSUDEN_KONS): desde la
  // fase C los kons no están en el repo del núcleo, se instalan.
  const { konsInstalados } = await import("../src/lib/kons-instalados");
  const ids = new Set<string>(
    konsInstalados()
      .filter((k) => k.ruta && k.manifiesto)
      .map((k) => k.manifiesto!.id)
      .filter((id) => id.startsWith("kon-"))
  );
  const pg = (await import("pg")).default;
  const cliente = new pg.Client({
    connectionString: process.env.DATABASE_ADMIN_URL || process.env.DATABASE_URL,
  });
  await cliente.connect();
  for (const id of ids) {
    await cliente.query(
      `INSERT INTO modules (key, name, enabled) VALUES ($1, $1, true)
       ON CONFLICT (key) DO UPDATE SET enabled = true`,
      [id]
    );
  }
  await cliente.end();
  console.log(`[matriz] ${ids.size} kons encendidos en 'modules'`);
}

// `--sin-parches`: quita de RUTAS_SOLO_ADMIN los prefijos de kons que solo
// están ahí como parche y mide SOLO esas rutas, para ver qué autoriza el kon
// por sí mismo (lo que quedaría abierto si se retira la puerta).
const PARCHES = [
  "/api/crm",
  "/api/conta",
  "/api/directory",
  "/api/dms",
  "/api/agile",
  "/api/booking",
  "/api/ocr-training",
  "/api/ocr",
  "/api/payments/portal",
];
const sinParches = args.includes("--sin-parches");
if (sinParches) {
  const { RUTAS_SOLO_ADMIN } = await import("../src/middleware/auth-guard");
  for (let i = RUTAS_SOLO_ADMIN.length - 1; i >= 0; i--) {
    if (PARCHES.includes(RUTAS_SOLO_ADMIN[i]!.prefijo)) RUTAS_SOLO_ADMIN.splice(i, 1);
  }
}

const { app } = await import("../src/index");
const { vaciarReservaEnMemoria } = await import("../src/lib/rate-limiter");
const { isPgMem } = await import("../src/db");
const { auth } = await import("../src/lib/auth");
const { createAgent } = await import("../src/services/agent-auth");
const { SCOPE_CONTENIDO } = await import("../src/middleware/auth-guard");

if (isPgMem) {
  console.error("[matriz] La base cayó a pg-mem: sin Postgres de pruebas no hay kons que medir.");
  process.exit(2);
}

// ── 2. Identidades reales ───────────────────────────────────────────────────

export type Identidad =
  | "anonimo"
  | "usuario"
  | "editor"
  | "admin"
  | "agente"
  | "agenteContenido"
  | "agenteBlogCrear"
  | "agenteDatasetLectura"
  | "agenteContenidoMenosBloques"
  | "agenteAdmin";
export const IDENTIDADES: Identidad[] = [
  "anonimo",
  "usuario",
  "editor",
  "admin",
  "agente",
  "agenteContenido",
  "agenteBlogCrear",
  "agenteDatasetLectura",
  "agenteContenidoMenosBloques",
  // Fase F: un agente con `admin` NO entra en la aprobación humana.
  "agenteAdmin",
];

const ctx = await auth.$context;
const sello = Date.now().toString(36);

async function firmar(valor: string): Promise<string> {
  const clave = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(ctx.secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const firma = await crypto.subtle.sign("HMAC", clave, new TextEncoder().encode(valor));
  return encodeURIComponent(`${valor}.${btoa(String.fromCharCode(...new Uint8Array(firma)))}`);
}

async function sesionDe(rol: "user" | "editor" | "admin"): Promise<Record<string, string>> {
  const usuario = await ctx.internalAdapter.createUser({
    email: `matriz-${rol}-${sello}@example.test`,
    name: `Matriz ${rol}`,
    emailVerified: true,
    role: rol,
  } as never);
  const sesion = await ctx.internalAdapter.createSession(usuario.id, false);
  const nombre = ctx.authCookies.sessionToken.name;
  return { cookie: `${nombre}=${await firmar(sesion.token)}` };
}

async function claveDeAgente(scopes: string[]): Promise<Record<string, string>> {
  const { plainApiKey } = await createAgent({
    name: `matriz-${scopes.join("+") || "sin-scopes"}-${sello}`,
    scopes,
    rateLimit: 1_000_000,
  });
  return { authorization: `Bearer ${plainApiKey}` };
}

// El dataset PRIVADO de las sondas finas (policyJson null = solo admin).
const { db } = await import("../src/db");
const { dataSets, dataEntries } = await import("../src/db/schema");
const slugFino = `matriz-fino-${sello}`;
const [datasetFino] = await db
  .insert(dataSets)
  .values({ name: slugFino, slug: slugFino, schema: [], policyJson: null } as never)
  .returning({ id: dataSets.id });
await db.insert(dataEntries).values({ dataSetId: datasetFino!.id, title: "fila", data: {} } as never);

const CABECERAS: Record<Identidad, Record<string, string>> = {
  anonimo: {},
  usuario: await sesionDe("user"),
  editor: await sesionDe("editor"),
  admin: await sesionDe("admin"),
  agente: await claveDeAgente([]),
  agenteContenido: await claveDeAgente([SCOPE_CONTENIDO]),
  agenteBlogCrear: await claveDeAgente(["kon:blog:crear-entrada"]),
  agenteDatasetLectura: await claveDeAgente([`datasets:${slugFino}:read`]),
  agenteContenidoMenosBloques: await claveDeAgente([SCOPE_CONTENIDO, "!kon:blocks:*"]),
  agenteAdmin: await claveDeAgente(["admin"]),
};

// ── 3. Rutas ────────────────────────────────────────────────────────────────

const { clavesDeRutas, concretar, NO_EJECUTAR_CON_PERMISO } =
  await import("../src/middleware/matriz-de-autorizacion");

const rutas = clavesDeRutas(
  (app as unknown as { routes: { method: string; path: string }[] }).routes
).filter(
  (clave) =>
    !sinParches ||
    PARCHES.some((p) => {
      const camino = clave.split(" ")[1]!;
      return camino === p || camino.startsWith(`${p}/`);
    })
);

const PERMISO_ALTO: Identidad[] = [
  "admin",
  "editor",
  "agenteContenido",
  "agenteContenidoMenosBloques",
  "agenteAdmin",
];
const { operacionDeRuta } = await import("../../../packages/engine/src/operaciones");
const { scopeFinoDeOperacion } = await import("@kitsuden/shared");

interface Medida {
  clave: string;
  estados: Partial<Record<Identidad, number>>;
  /** Scope fino de la operación del SDK que atiende la ruta (fase E). */
  operacion?: string | null;
}
const medidas: Medida[] = [];

// El registro de cada petición (hono/logger, pino) cuesta más que la petición
// misma con miles de ellas: se calla mientras se mide.
const log = (s: string) => process.stdout.write(`${s}\n`);
console.log = () => undefined;
console.info = () => undefined;
console.warn = () => undefined;
console.error = () => undefined;

/**
 * Lee y tira el cuerpo, salvo un stream SSE (`GET /api/mcp` con un agente que
 * puede conectar, p. ej. el de `admin` de la fase F): ese no acaba nunca y la
 * matriz se quedaba esperando. Se cancela.
 */
async function descartarCuerpo(res: Response): Promise<void> {
  if ((res.headers.get("content-type") ?? "").includes("text/event-stream")) {
    await res.body?.cancel().catch(() => undefined);
    return;
  }
  await res.arrayBuffer().catch(() => undefined);
}

async function medir(clave: string): Promise<Medida> {
  const [metodo, patron] = clave.split(" ") as [string, string];
  const camino = concretar(patron);
  const estados: Partial<Record<Identidad, number>> = {};
  for (const id of IDENTIDADES) {
    if (PERMISO_ALTO.includes(id) && NO_EJECUTAR_CON_PERMISO.some((p) => clave.startsWith(p))) {
      continue;
    }
    const m = metodo === "ALL" ? "POST" : metodo;
    const conCuerpo = !["GET", "HEAD"].includes(m);
    // Sin Valkey, los límites fail-closed de los kons cuentan en memoria por
    // ruta e IP, y la matriz hace TODAS sus peticiones desde la misma IP: una
    // ruta con 10 intentos cada 5 min (`POST /api/cardsim/sessions/:id/join`),
    // medida dos veces (`ALL` y `POST`) por diez identidades, respondía 429 a
    // la undécima según el orden. La matriz mide las puertas, no los límites.
    vaciarReservaEnMemoria();
    try {
      const res = await app.request(
        camino,
        {
          method: m,
          headers: {
            ...CABECERAS[id],
            ...(conCuerpo ? { "content-type": "application/json" } : {}),
            // Mismo origen que el panel: la comprobación de Origin (CSRF) no
            // es lo que mide esta matriz.
            origin: process.env.ADMIN_URL || "http://localhost:5173",
          },
          ...(conCuerpo ? { body: "{}" } : {}),
        },
        { ip: { address: "127.0.0.1", family: "IPv4", port: 0 } }
      );
      estados[id] = res.status;
      await descartarCuerpo(res);
    } catch {
      estados[id] = 0;
    }
    // Un 5xx con la máquina cargada suele ser el pool de pruebas agotado
    // (timeout de conexión), no la ruta: se repite hasta dos veces antes de
    // apuntarlo, para que un fallo de infraestructura no parezca «entró».
    // Un 429 tampoco dice nada de la puerta: es el límite por ruta de la propia
    // matriz (POST /api/datasets/export admite 10 por minuto y diez identidades
    // con reintentos lo pasan según en qué segundo caiga). Se espera a que se
    // abra la ventana y se repite.
    for (
      let intento = 0;
      intento < 2 && (estados[id]! >= 500 || estados[id] === 0 || estados[id] === 429);
      intento++
    ) {
      if (estados[id] === 429) await new Promise((r) => setTimeout(r, 61_000));
      vaciarReservaEnMemoria();
      try {
        const res = await app.request(
          camino,
          {
            method: m,
            headers: {
              ...CABECERAS[id],
              ...(conCuerpo ? { "content-type": "application/json" } : {}),
              origin: process.env.ADMIN_URL || "http://localhost:5173",
            },
            ...(conCuerpo ? { body: "{}" } : {}),
          },
          { ip: { address: "127.0.0.1", family: "IPv4", port: 0 } }
        );
        estados[id] = res.status;
        await descartarCuerpo(res);
      } catch {
        estados[id] = 0;
      }
    }
  }
  const m = metodo === "ALL" ? "POST" : metodo;
  const deRuta = operacionDeRuta(m, camino);
  return { clave, estados, operacion: deRuta ? scopeFinoDeOperacion(deRuta.konId, deRuta.op.id) : null };
}

// Varias rutas a la vez (cada una pide sus identidades en serie): el pool de
// pruebas tiene 5 conexiones.
const CONCURRENCIA = Number(process.env.MATRIZ_CONCURRENCIA) || 2;
let siguiente = 0;
await Promise.all(
  Array.from({ length: CONCURRENCIA }, async () => {
    while (siguiente < rutas.length) {
      const clave = rutas[siguiente++]!;
      medidas.push(await medir(clave));
      if (medidas.length % 100 === 0) log(`[matriz] ${medidas.length}/${rutas.length}`);
    }
  })
);
medidas.sort((a, b) => a.clave.localeCompare(b.clave));

// ── 4. Sondas finas contra el dataset real (fase E) ─────────────────────────
const { SONDAS_FINAS } = await import("../src/middleware/matriz-de-autorizacion");
const sondas: { sonda: string; estado: number; esperado: number[]; ok: boolean }[] = [];
for (const sonda of SONDAS_FINAS) {
  const camino = sonda.camino.replace(":id", datasetFino!.id);
  const res = await app.request(
    camino,
    {
      method: sonda.metodo,
      headers: {
        ...CABECERAS[sonda.identidad],
        ...(sonda.cuerpo ? { "content-type": "application/json" } : {}),
        origin: process.env.ADMIN_URL || "http://localhost:5173",
      },
      ...(sonda.cuerpo ? { body: JSON.stringify(sonda.cuerpo) } : {}),
    },
    { ip: { address: "127.0.0.1", family: "IPv4", port: 0 } }
  );
  await res.arrayBuffer().catch(() => undefined);
  sondas.push({
    sonda: `${sonda.identidad} ${sonda.metodo} ${sonda.camino} — ${sonda.motivo}`,
    estado: res.status,
    esperado: sonda.esperado,
    ok: sonda.esperado.includes(res.status),
  });
}
for (const s of sondas) log(`[matriz] sonda ${s.ok ? "✓" : "✗"} ${s.sonda}: ${s.estado}`);

const informe = { generado: new Date().toISOString(), total: medidas.length, medidas, sondas };
if (salida) writeFileSync(salida, JSON.stringify(informe, null, 1));
log(`[matriz] ${medidas.length} rutas × ${IDENTIDADES.length} identidades medidas`);

if (comprobar) {
  const { compararConMatriz } = await import("../src/middleware/matriz-de-autorizacion");
  const fallos = compararConMatriz(medidas);
  for (const s of sondas) {
    if (!s.ok) fallos.push(`sonda ${s.sonda}: ${s.estado} (se esperaba ${s.esperado.join("/")})`);
  }
  for (const f of fallos) log(`  ✗ ${f}`);
  log(`[matriz] ${fallos.length} discrepancias`);
  process.exit(fallos.length === 0 ? 0 : 1);
}
process.exit(0);
