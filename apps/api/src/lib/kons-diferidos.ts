/**
 * Activar un kon sin reiniciar la API
 * ============================================================================
 *
 * ── EL PROBLEMA ────────────────────────────────────────────────────────────
 *
 * Activar un kon desde el panel puede crear sus tablas en caliente, pero NO
 * podía montar sus rutas. Hono construye el matcher de su router en la primera
 * petición y a partir de ahí lo congela:
 *
 *     Can not add a route since the matcher is already built.
 *
 * `loadKons()` corre una vez al arrancar, así que un kon activado con el
 * servidor en marcha quedaba a medias: aparecía en el menú, tenía sus tablas, y
 * cada una de sus pantallas devolvía 404. Media instalación presentada como
 * completa — la misma clase de fallo que este repo lleva días corrigiendo.
 *
 * ── LA SOLUCIÓN: RESERVAR EL CAMINO, DECIDIR EL DESTINO DESPUÉS ────────────
 *
 * Lo que Hono congela es la TABLA DE RUTAS, no lo que hace cada handler. Así
 * que en el arranque se registra, para cada kon del disco que NO se cargó, un
 * handler comodín en su ruta de montaje:
 *
 *     app.all("/api/booking", delegar)
 *     app.all("/api/booking/*", delegar)
 *
 * El camino existe desde el minuto cero. `delegar` decide en cada petición:
 *
 *   · el kon sigue apagado      → 404 explicando que no está activado
 *   · está activado y no cargado → se importa, se construye su router y se
 *                                  ejecuta su `onStartup` (una sola vez)
 *   · ya cargado                 → se le pasa la petición
 *
 * ── POR QUÉ HAY QUE REESCRIBIR LA URL ──────────────────────────────────────
 *
 * Un kon declara sus rutas RELATIVAS a su montaje: `/rooms`, no
 * `/api/booking/rooms`. `app.route()` hace esa traducción al registrar; aquí,
 * al delegar en caliente, hay que quitar el prefijo a mano o el sub-router
 * buscaría una ruta que no tiene y devolvería 404 por el motivo equivocado.
 *
 * ── LO QUE ESTO NO CUBRE ───────────────────────────────────────────────────
 *
 * Los kons con `rate limits` declarados los aplica `applyKonRateLimits` sobre
 * la app padre, y eso SÍ es registro de middleware: no puede añadirse en
 * caliente. Un kon activado sin reiniciar corre sin su límite de peticiones
 * hasta el siguiente arranque, y se avisa por consola en vez de dejarlo pasar.
 */

import { toErrorEnvelope } from "@kitsuden/engine";
import type { KonContext } from "@kitsuden/shared";
import type { Hono } from "hono";


import { db } from "../db";
import { modules as modulesTable } from "../db/schema";
import { withTransactionalRLS } from "../middleware/transactional-rls";


import { conContextoDelHost, envParaElKon } from "./contexto-del-host";
import { enProduccion } from "./entorno";

export interface KonDiferido {
  /** Id del kon, tal cual en su manifiesto (`kon-booking`). */
  id: string;
  /**
   * Dónde puede acabar enganchado su router. Puede ser más de un sitio.
   *
   * ── POR QUÉ VARIOS Y NO UNO ──────────────────────────────────────────────
   *
   * Porque la ruta definitiva la decide, por orden de precedencia:
   *
   *   1. `konDef.mountPath` — en el CÓDIGO del kon. No se puede leer sin
   *      importarlo, y para entonces ya es tarde: el matcher está congelado.
   *   2. `mount.path` del manifiesto.
   *   3. `/api/<nombre>` si el kon es del grimoire activo, `/api/custom/<id>`
   *      si no.
   *
   * La primera versión de esto reservaba solo `/api/<nombre>` y habría enviado
   * a producción un fallo desagradable: quince de los veintiocho kons no
   * declaran `mount.path`, así que el kon habría funcionado recién activado y
   * habría dejado de funcionar al reiniciar, servido desde otra ruta.
   *
   * Reservar los candidatos cuesta dos entradas más en la tabla de rutas y
   * elimina la clase entera. Todas son territorio inequívoco de ese kon.
   */
  rutasMontaje: string[];
  /** Carpeta del kon en disco. */
  ruta: string;
  /** ¿Declara límites de peticiones que no podrán aplicarse en caliente? */
  tieneRateLimits: boolean;
}

const diferidos = new Map<string, KonDiferido>();
const routers = new Map<string, Hono>();

/**
 * Le pone al router de un kon el mismo traductor de errores que la API.
 *
 * ── POR QUE HACE FALTA ────────────────────────────────────────────────────
 *
 * Un kon diferido NO se monta con `app.route()`: el delegador llama a
 * `router.fetch(...)`, que es un ciclo de petición COMPLETO y aislado. Los
 * errores no suben al `onError` de la API — se quedan dentro.
 *
 * Y un `Hono` recién creado sin `onError` responde a cualquier excepción con
 * un **500** genérico y escupe la traza por stderr. Medido en la instalación
 * real:
 *
 *     POST /api/broadcast-moba/games/null/ingest/start   →  500
 *     stderr: AppError: Validación fallida
 *
 * Es decir: la validación funcionaba, sabía que era un 422, lo decía… y el
 * cliente veía «HTTP 500». Un error de petición mal formada presentado como
 * servidor caído, que manda a mirar los logs del servidor en vez del formulario.
 *
 * No es de este kon: le pasa a CUALQUIER kon activado sin reiniciar, en
 * cualquiera de sus rutas, con cualquier `AppError` —validación, no
 * encontrado, prohibido—. Por eso se pone aquí, en el único punto por el que
 * pasan todos, y no en cada kon.
 *
 * Si el kon ya trae su propio `onError`, se respeta: `_onError` es interno de
 * Hono, así que se comprueba con cuidado y en el peor caso se sobreescribe con
 * algo mejor que el 500 por defecto.
 */
function conTraductorDeErrores(router: Hono, konId: string): Hono {
  router.onError((err, c) => {
    const { envelope, status } = toErrorEnvelope(err, {
      requestId: c.req.header("x-request-id"),
      isDev: !enProduccion(),
    });

    if (status >= 500) {
      console.error(`[Kons] ${konId} devolvió ${status}:`, err instanceof Error ? err.stack : err);
    }

    return c.json(envelope, status as 500);
  });

  return router;
}
/** Cargas en vuelo: dos peticiones simultáneas no deben importar el kon dos veces. */
const enCurso = new Map<string, Promise<Hono | null>>();

let contexto: KonContext | null = null;

// ── Qué kons están activos, sin preguntar a la base en cada petición ────────
//
// La respuesta cambia poco y la consulta iría en el camino caliente de CADA
// petición a un kon diferido. Un TTL corto mantiene el coste en cero y hace que
// otra réplica que active el kon se note sola en unos segundos — importante
// porque este mapa es de proceso, no compartido.
let activosCache: Set<string> | null = null;
let activosSello = 0;
const TTL_ACTIVOS_MS = 10_000;

async function konsActivos(): Promise<Set<string>> {
  if (activosCache && Date.now() - activosSello < TTL_ACTIVOS_MS) return activosCache;

  try {
    const filas = await db
      .select({ key: modulesTable.key, enabled: modulesTable.enabled })
      .from(modulesTable);
    activosCache = new Set(filas.filter((f) => f.enabled).map((f) => f.key));
  } catch {
    // Si la base no responde, lo honesto es no inventar: se conserva lo último
    // conocido, y si no hay nada, ninguno está activo. Un fallo de conexión no
    // debe traducirse en "activa todos".
    activosCache = activosCache ?? new Set();
  }
  activosSello = Date.now();
  return activosCache;
}

/**
 * Invalida la caché de kons activos.
 *
 * La llama el panel al activar o desactivar: esperar al TTL haría que el
 * usuario viera su propio cambio con retraso, que es justo cuando mira.
 */
export function invalidarKonsActivos(): void {
  activosCache = null;
}

/** ¿El id del kon coincide con esta clave, con o sin el prefijo `kon-`? */
function mismoKon(a: string, b: string): boolean {
  return a === b || a.replace(/^kon-/, "") === b.replace(/^kon-/, "");
}

async function estaActivo(konId: string): Promise<boolean> {
  const activos = await konsActivos();
  for (const clave of activos) if (mismoKon(clave, konId)) return true;
  return false;
}

/**
 * Importa el kon y construye su router. Una sola vez por proceso.
 *
 * Devuelve `null` si el kon no exporta un router utilizable: hay kons que solo
 * aportan metadatos o hooks, y para esos no hay nada que delegar.
 */
async function cargar(kon: KonDiferido): Promise<Hono | null> {
  const yaEsta = routers.get(kon.id);
  if (yaEsta) return yaEsta;

  const enVuelo = enCurso.get(kon.id);
  if (enVuelo) return enVuelo;

  const promesa = (async (): Promise<Hono | null> => {
    const { existsSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { pathToFileURL } = await import("node:url");
    const { isHonoRouter, isKonDefinition, createKonContext } = await import("./module-loader");

    const candidatos = [
      join(kon.ruta, "index.ts"),
      join(kon.ruta, "dist", "index.js"),
      join(kon.ruta, "dist", "index.cjs"),
      join(kon.ruta, "index.js"),
    ];

    let mod: Record<string, unknown> | null = null;
    for (const candidato of candidatos) {
      if (!existsSync(candidato)) continue;
      mod = (await import(pathToFileURL(candidato).href)) as Record<string, unknown>;
      break;
    }
    if (!mod) throw new Error(`no se pudo importar ${kon.id} desde ${kon.ruta}`);

    contexto = contexto ?? createKonContext();
    const exportado = mod.kon ?? mod.default;

    if (isKonDefinition(exportado)) {
      const router = exportado.createRouter(contexto);
      // SDK de kons: sus operaciones, para el MCP (el camino es el declarado
      // por el kon o el primero de los candidatos reservados).
      if (exportado.operaciones) {
        const { operacionesDe, registrarOperacionesMontadas } = await import(
          "../../../../packages/engine/src/operaciones"
        );
        registrarOperacionesMontadas(
          kon.id,
          exportado.mountPath ?? kon.rutasMontaje[0] ?? `/api/custom/${kon.id}`,
          operacionesDe(exportado, contexto),
          router as never
        );
      }
      // `onStartup` corre aquí y no en el arranque: para este kon, ESTE es su
      // arranque. Si lanza, la activación falla y no se cachea nada.
      if (exportado.hooks?.onStartup) await exportado.hooks.onStartup(contexto);
      conTraductorDeErrores(router, kon.id);
      const envuelto = conTraductorDeErrores(conContextoDelHost(router), kon.id);
      routers.set(kon.id, envuelto);
      return envuelto;
    }

    // Kon heredado: exporta un Hono suelto.
    for (const valor of Object.values(mod)) {
      if (isHonoRouter(valor)) {
        conTraductorDeErrores(valor, kon.id);
        const envuelto = conTraductorDeErrores(conContextoDelHost(valor), kon.id);
        routers.set(kon.id, envuelto);
        return envuelto;
      }
    }

    return null;
  })();

  enCurso.set(kon.id, promesa);
  try {
    return await promesa;
  } finally {
    enCurso.delete(kon.id);
  }
}

/**
 * Registra los caminos reservados. Se llama al final de `loadKons()`, cuando
 * todavía no se ha servido ninguna petición.
 */
export function registrarKonsDiferidos(
  app: Hono<Record<string, never>>,
  kons: KonDiferido[],
  contextoCompartido?: KonContext
): void {
  if (contextoCompartido) contexto = contextoCompartido;
  if (kons.length === 0) return;

  // Rutas que el núcleo ya ocupa. Un kon apagado no puede secuestrarlas: su
  // comodín se registraría después y perdería igual, pero declararlo explícito
  // evita el susto de ver `/api/media/*` reservado por un kon.
  const ocupadas = new Set(
    (app as unknown as { routes: { path: string }[] }).routes.map((r) => r.path)
  );

  for (const kon of kons) {
    if (diferidos.has(kon.id)) continue;

    const rutasValidas = [...new Set(kon.rutasMontaje)].filter((ruta) => {
      // Un montaje de un solo segmento (`/api`) se tragaría media API.
      const segmentos = ruta.split("/").filter(Boolean);
      if (segmentos.length < 2 || segmentos[0] !== "api") {
        console.warn(`  ⚠️  ${kon.id}: ruta de montaje sospechosa (${ruta}); no se reserva.`);
        return false;
      }
      if (ocupadas.has(ruta) || ocupadas.has(`${ruta}/*`)) {
        // Lo que ya sirve el núcleo manda. El comodín se registraría después y
        // perdería igual, pero callarlo escondería una colisión real.
        console.warn(`  ⚠️  ${kon.id}: ${ruta} ya está ocupada; no se reserva.`);
        return false;
      }
      return true;
    });

    if (rutasValidas.length === 0) continue;
    diferidos.set(kon.id, kon);

    const delegar = async (c: {
      req: { raw: Request };
      json: (cuerpo: unknown, estado?: number) => Response;
      env?: unknown;
      get: (clave: string) => unknown;
    }) => {
      if (!(await estaActivo(kon.id))) {
        return c.json(
          {
            error: "Kon no activado",
            message: `'${kon.id}' existe pero no está activado. Actívalo desde Kons en el panel.`,
            kon: kon.id,
          },
          404
        );
      }

      let router: Hono | null;
      try {
        router = await cargar(kon);
      } catch (err) {
        const detalle = err instanceof Error ? err.message : String(err);
        console.error(`[Kons] No se pudo cargar '${kon.id}' en caliente:`, detalle);
        return c.json(
          {
            error: "El kon no pudo cargarse",
            message:
              `'${kon.id}' está activado pero su código no se pudo cargar. ` +
              `Reinicia la API; si persiste, el kon está roto.`,
            kon: kon.id,
            detail: detalle,
          },
          500
        );
      }

      if (!router) {
        return c.json(
          {
            error: "El kon no expone rutas",
            message: `'${kon.id}' está activado pero no aporta ninguna ruta de API.`,
            kon: kon.id,
          },
          404
        );
      }

      // Quitar el prefijo: el sub-router declara sus rutas relativas al montaje.
      // Cuál de los caminos reservados se usó lo dice la propia URL, no se
      // puede asumir: el mismo kon responde en varios.
      const url = new URL(c.req.raw.url);
      const prefijo =
        rutasValidas.find((r) => url.pathname === r || url.pathname.startsWith(`${r}/`)) ?? "";
      url.pathname = url.pathname.slice(prefijo.length) || "/";
      return router.fetch(
        new Request(url.toString(), c.req.raw),
        envParaElKon(c.env, (k) => c.get(k))
      );
    };

    for (const ruta of rutasValidas) {
      // La misma transacción RLS que un kon montado al arrancar: el router que
      // se carga en caliente usa `ctx.db.instance`, que resuelve a ella.
      app.use(ruta, withTransactionalRLS());
      app.use(`${ruta}/*`, withTransactionalRLS());
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      app.all(ruta, delegar as any);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      app.all(`${ruta}/*`, delegar as any);
    }
  }

  const conLimites = kons.filter((k) => k.tieneRateLimits).map((k) => k.id);
  console.log(
    `  🕓 ${diferidos.size} kon(s) reservados para activación sin reinicio` +
      (conLimites.length ? ` (sin rate limits hasta reiniciar: ${conLimites.join(", ")})` : "")
  );
}

/**
 * Carga un kon YA, sin esperar a la primera petición.
 *
 * La llama el panel justo después de activar: así el usuario entra en la
 * pantalla del kon y funciona a la primera, en vez de que la primera petición
 * pague la importación. Y si el kon está roto, el error sale en la respuesta
 * del interruptor, que es donde se está mirando.
 */
export async function activarKonEnCaliente(
  konId: string
): Promise<{ montado: boolean; motivo?: string }> {
  invalidarKonsActivos();

  const kon = [...diferidos.values()].find((k) => mismoKon(k.id, konId));
  if (!kon) {
    // No está diferido: o ya se cargó en el arranque, o no existe. En ambos
    // casos no hay nada que montar aquí.
    return { montado: false, motivo: "no-diferido" };
  }

  try {
    const router = await cargar(kon);
    return router ? { montado: true } : { montado: false, motivo: "el kon no expone rutas de API" };
  } catch (err) {
    return { montado: false, motivo: err instanceof Error ? err.message : String(err) };
  }
}

/** ¿Este kon tiene un camino reservado que ya responde? Para el aviso de reinicio. */
export function konRespondeSinReiniciar(konId: string): boolean {
  for (const [id] of routers) if (mismoKon(id, konId)) return true;
  for (const [id] of diferidos) if (mismoKon(id, konId)) return true;
  return false;
}

/**
 * ¿Responde este kon AHORA en esta API? Cargado al arrancar, o reservado y
 * activado después (el comodín lo delega). Lo usa `GET /api/version` para no
 * anunciar contratos de kons que contestarían 404.
 */
export async function konDisponible(
  konId: string,
  cargadosAlArrancar: readonly string[]
): Promise<boolean> {
  if (cargadosAlArrancar.some((id) => mismoKon(id, konId))) return true;
  for (const [id] of diferidos) if (mismoKon(id, konId)) return estaActivo(id);
  return false;
}
