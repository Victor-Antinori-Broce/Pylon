/**
 * Registro de rutas de kons — el contrato sale de lo que está montado
 * ============================================================================
 *
 * ── POR QUE EXISTE ─────────────────────────────────────────────────────────
 *
 * El OpenAPI solo incluía lo que un kon declaraba a mano en `openApi.paths`, y
 * ningún kon lo hizo: el contrato publicado tenía cero rutas de dominio
 * mientras la API servía más de cien. Pedirle a cada kon que mantenga una lista
 * paralela es justo lo que ya no funcionó.
 *
 * Aquí se guarda el router REAL de cada kon en el momento de montarlo, y de sus
 * rutas se saca todo: método, camino, si exige credencial, qué sección necesita
 * y el esquema del cuerpo. Lo que está montado es lo que se documenta — por
 * construcción, no por disciplina.
 *
 * ── DE DONDE SALE CADA DATO ────────────────────────────────────────────────
 *
 * Hono guarda en `router.routes` una entrada por cada función registrada: una
 * ruta con tres middlewares son tres entradas con el mismo método y camino. Las
 * de `app.use()` llevan método `ALL`. Cada middleware que sabe algo lo deja en
 * sus metadatos (`withRouteMeta` en `@kitsuden/engine`), y aquí se juntan.
 *
 * Una limitación honesta: un middleware escrito a mano sin metadatos —como el
 * que exceptúa el push del agente local en Broadcast— no se ve. La ruta sale
 * documentada igual, pero sin marcar como protegida.
 */

// Desde el módulo y no desde el índice del engine: ver el ciclo que se explica
// en `middleware/auth.ts`. Este fichero lo importa el cargador de kons.
import {
  readRouteMeta,
  type RouteMeta,
  type RouteValidationMeta,
} from "@kitsuden/engine/src/route-meta";

export interface RutaDeKon {
  konId: string;
  /** En mayúsculas: `GET`, `POST`… */
  method: string;
  /** Camino completo como lo sirve Hono: `/api/esports/tournaments/:id`. */
  path: string;
  /** Relativo al montaje del kon: `/tournaments/:id`. */
  relativePath: string;
  mountPath: string;
  auth: "required" | "optional" | "none";
  section?: string;
  summary?: string;
  description?: string;
  operationId?: string;
  tags?: string[];
  validation: RouteValidationMeta[];
  /** Si la generó el SDK de kons: su declaración (ver `RouteMeta.operacion`). */
  operacion?: { konId: string; declaracion: unknown };
}

interface RouterMontado {
  konId: string;
  mountPath: string;
  router: { routes: { method: string; path: string; handler: unknown }[] };
}

const registro = new Map<string, RouterMontado>();

/** Lo llama el cargador de kons justo después de `app.route(mountPath, router)`. */
export function registrarRouterDeKon(konId: string, mountPath: string, router: unknown): void {
  const rutas = (router as { routes?: unknown })?.routes;
  if (!Array.isArray(rutas)) return;
  registro.set(konId, {
    konId,
    mountPath: mountPath.replace(/\/+$/, ""),
    router: router as RouterMontado["router"],
  });
}

/**
 * El kon montado que sirve este camino (el de montaje más largo que lo cubre),
 * o `null`. Lo usan las denegaciones de agente sobre rutas legadas.
 */
export function konDeCamino(camino: string): string | null {
  let mejor: { konId: string; largo: number } | null = null;
  for (const { konId, mountPath } of registro.values()) {
    if (!mountPath || mountPath === "/api") continue;
    if (camino === mountPath || camino.startsWith(`${mountPath}/`)) {
      if (!mejor || mountPath.length > mejor.largo) mejor = { konId, largo: mountPath.length };
    }
  }
  return mejor?.konId ?? null;
}

/** Los kons montados con su prefijo (para el catálogo de permisos del panel). */
export function konsMontados(): { konId: string; mountPath: string }[] {
  return [...registro.values()].map(({ konId, mountPath }) => ({ konId, mountPath }));
}

/** Para pruebas. */
export function olvidarRoutersDeKons(): void {
  registro.clear();
}

/** ¿Cubre el patrón de un `app.use()` este camino? */
function patronCubre(patron: string, camino: string): boolean {
  if (patron === "*" || patron === "/*") return true;
  if (patron.endsWith("/*")) {
    const base = patron.slice(0, -2);
    return camino === base || camino.startsWith(`${base}/`);
  }
  return patron === camino;
}

function unir(mountPath: string, relativo: string): string {
  if (relativo === "/" || relativo === "") return mountPath || "/";
  return `${mountPath}${relativo.startsWith("/") ? "" : "/"}${relativo}`;
}

/** Todas las rutas de todos los kons montados, ya con sus metadatos juntos. */
export function rutasDeKons(): RutaDeKon[] {
  const salida: RutaDeKon[] = [];

  for (const { konId, mountPath, router } of registro.values()) {
    const middlewares = router.routes.filter((r) => r.method.toUpperCase() === "ALL");
    const grupos = new Map<string, { method: string; path: string; handlers: unknown[] }>();

    for (const r of router.routes) {
      const method = r.method.toUpperCase();
      if (method === "ALL") continue;
      const clave = `${method} ${r.path}`;
      const grupo = grupos.get(clave) ?? { method, path: r.path, handlers: [] };
      grupo.handlers.push(r.handler);
      grupos.set(clave, grupo);
    }

    for (const grupo of grupos.values()) {
      const propias = grupo.handlers.map(readRouteMeta).filter(Boolean) as RouteMeta[];
      const heredadas = middlewares
        .filter((m) => patronCubre(m.path, grupo.path))
        .map((m) => readRouteMeta(m.handler))
        .filter(Boolean) as RouteMeta[];
      const todas = [...heredadas, ...propias];

      const auth = todas.some((m) => m.auth === "required")
        ? "required"
        : todas.some((m) => m.auth === "optional")
          ? "optional"
          : "none";

      const descrita = propias.find((m) => m.summary || m.operationId || m.description);

      salida.push({
        konId,
        method: grupo.method,
        path: unir(mountPath, grupo.path),
        relativePath: grupo.path,
        mountPath,
        auth,
        section: todas.find((m) => m.section)?.section,
        summary: descrita?.summary,
        description: descrita?.description,
        operationId: descrita?.operationId,
        tags: descrita?.tags,
        validation: todas.flatMap((m) => m.validation ?? []),
        operacion: propias.find((m) => m.operacion)?.operacion,
      });
    }
  }

  return salida.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
}

// ── Sugerencias para un 404 ──────────────────────────────────────────────────

function distancia(a: string, b: string): number {
  const fila = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = fila[0];
    fila[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const arriba = fila[j];
      fila[j] = Math.min(fila[j] + 1, fila[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = arriba;
    }
  }
  return fila[b.length];
}

function casaConPlantilla(plantilla: string, camino: string): boolean {
  const regex = plantilla
    .split("/")
    .map((seg) =>
      seg.startsWith(":") ? "[^/]+" : seg === "*" ? ".*" : seg.replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    )
    .join("/");
  return new RegExp(`^${regex}/?$`).test(camino);
}

/**
 * Rellena los parámetros de la plantilla con los segmentos del camino pedido,
 * para comparar lo que de verdad difiere: en `/tournament/abc/reports` contra
 * `/tournament/:id/report`, la diferencia es una `s`, no el id.
 */
function comparable(plantilla: string, camino: string): string {
  const p = plantilla.split("/");
  const c = camino.split("/");
  if (p.length !== c.length) return plantilla;
  return p.map((seg, i) => (seg.startsWith(":") ? c[i] : seg)).join("/");
}

export interface SugerenciaDeRuta {
  /** Métodos con los que SÍ existe este mismo camino. Vacío si no existe. */
  allow: string[];
  /** Rutas parecidas, la más parecida primero. */
  didYouMean: { method: string; path: string }[];
}

/**
 * Qué decir cuando nada casa.
 *
 * Un 404 a secas es el peor error posible para un agente: no distingue «te
 * equivocaste de método» de «te equivocaste de camino» de «esa ruta no
 * existe». Aquí se responde a las tres.
 */
export function sugerirRutas(method: string, camino: string, maximo = 3): SugerenciaDeRuta {
  const rutas = rutasDeKons();

  const allow = [
    ...new Set(rutas.filter((r) => casaConPlantilla(r.path, camino)).map((r) => r.method)),
  ].sort();

  const limpio = camino.replace(/\/+$/, "") || "/";
  const umbral = Math.max(3, Math.floor(limpio.length * 0.25));

  const didYouMean = rutas
    .map((r) => ({
      method: r.method,
      path: r.path,
      d:
        distancia(comparable(r.path, limpio), limpio) +
        // Mismo método, a igualdad de camino, va antes.
        (r.method === method.toUpperCase() ? 0 : 0.5),
    }))
    .filter((r) => r.d <= umbral)
    .sort((a, b) => a.d - b.d)
    .slice(0, maximo)
    .map(({ method: m, path }) => ({ method: m, path }));

  return { allow, didYouMean };
}
