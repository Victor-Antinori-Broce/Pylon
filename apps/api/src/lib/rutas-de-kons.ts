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
//
// El 404 de `/api/*` es anónimo y el camino lo escribe quien llama: hasta ~16 KB.
// Una distancia de edición completa contra cada ruta era O(rutas × largo²) en
// el único hilo (auditoría F3/F8). Ahora: tope de largo, filtro por largo y
// número de segmentos, distancia en banda con salida temprana y las plantillas
// compiladas una sola vez.

/** Por encima de este largo no se sugiere nada: ningún camino real es así. */
export const LARGO_MAXIMO_PARA_SUGERIR = 200;
/** Ni se busca el `Allow`: con más, el camino no es de nadie. */
export const LARGO_MAXIMO_PARA_ALLOW = 2000;
/** Distancia máxima para sugerir (y ancho de la banda de la distancia). */
const UMBRAL_MAXIMO = 20;

/**
 * Distancia de Levenshtein si es `<= tope`; si no, `tope + 1`. Solo calcula
 * la banda de ancho `2·tope + 1` alrededor de la diagonal y para en cuanto
 * toda una fila pasa del tope: O(largo × tope), no O(largo²).
 */
export function distanciaAcotada(a: string, b: string, tope: number): number {
  if (Math.abs(a.length - b.length) > tope) return tope + 1;
  if (a === b) return 0;
  // Lo común al principio y al final no cuenta: con el parámetro relleno del
  // camino pedido, casi todo el texto es común y la tabla queda en nada.
  let inicio = 0;
  while (inicio < a.length && inicio < b.length && a.charCodeAt(inicio) === b.charCodeAt(inicio)) inicio++;
  let finA = a.length;
  let finB = b.length;
  while (finA > inicio && finB > inicio && a.charCodeAt(finA - 1) === b.charCodeAt(finB - 1)) {
    finA--;
    finB--;
  }
  if (inicio > 0 || finA < a.length) {
    a = a.slice(inicio, finA);
    b = b.slice(inicio, finB);
  }
  if (a.length === 0 || b.length === 0) {
    const d = Math.max(a.length, b.length);
    return d <= tope ? d : tope + 1;
  }
  const fuera = tope + 1;
  let previa = new Array<number>(b.length + 1).fill(fuera);
  let actual = new Array<number>(b.length + 1).fill(fuera);
  for (let j = 0; j <= Math.min(b.length, tope); j++) previa[j] = j;
  for (let i = 1; i <= a.length; i++) {
    const desde = Math.max(1, i - tope);
    const hasta = Math.min(b.length, i + tope);
    // Solo se tocan la banda y sus dos bordes (centinelas `fuera`): lo de fuera
    // de la banda no se lee nunca.
    actual[0] = i <= tope ? i : fuera;
    if (desde > 1) actual[desde - 1] = fuera;
    if (hasta < b.length) actual[hasta + 1] = fuera;
    let minimo = actual[0];
    for (let j = desde; j <= hasta; j++) {
      const coste = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      const v = Math.min(previa[j]! + 1, actual[j - 1]! + 1, previa[j - 1]! + coste);
      actual[j] = v > fuera ? fuera : v;
      if (actual[j]! < minimo) minimo = actual[j]!;
    }
    if (minimo > tope) return fuera;
    [previa, actual] = [actual, previa];
  }
  return Math.min(previa[b.length]!, fuera);
}

function regexDePlantilla(plantilla: string): RegExp {
  const regex = plantilla
    .split("/")
    .map((seg) =>
      seg.startsWith(":") ? "[^/]+" : seg === "*" ? ".*" : seg.replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    )
    .join("/");
  return new RegExp(`^${regex}/?$`);
}

interface RutaParaSugerir {
  method: string;
  path: string;
  segmentos: string[];
  regex: RegExp;
}

/**
 * Las rutas ya partidas y con su regex compilada, recalculadas solo cuando
 * cambia lo montado (huella: kons y número de rutas de cada router).
 */
let indice: { huella: string; rutas: RutaParaSugerir[] } | null = null;

function rutasParaSugerir(): RutaParaSugerir[] {
  const huella = [...registro.values()].map((r) => `${r.konId}:${r.mountPath}:${r.router.routes.length}`).join("|");
  if (indice?.huella === huella) return indice.rutas;
  const rutas = rutasDeKons().map((r) => ({
    method: r.method,
    path: r.path,
    segmentos: r.path.split("/"),
    regex: regexDePlantilla(r.path),
  }));
  indice = { huella, rutas };
  return rutas;
}

/**
 * Distancia entre una plantilla y el camino pedido, con tope.
 *
 * Con el mismo número de segmentos, se compara segmento a segmento y los
 * parámetros se rellenan con lo pedido: en `/tournament/abc/reports` contra
 * `/tournament/:id/report` la diferencia es una `s`, no el id. Un parámetro
 * cuesta 0 por largo que sea, y un literal corto contra un segmento largo se
 * descarta por largo al momento. Con distinto número de segmentos se compara
 * la plantilla entera.
 */
function distanciaARuta(r: RutaParaSugerir, limpio: string, segmentos: string[], tope: number): number {
  if (r.segmentos.length !== segmentos.length) return distanciaAcotada(r.path, limpio, tope);
  let total = 0;
  for (let i = 0; i < segmentos.length; i++) {
    const seg = r.segmentos[i]!;
    if (seg.startsWith(":")) continue;
    total += distanciaAcotada(seg, segmentos[i]!, tope - total);
    if (total > tope) return tope + 1;
  }
  return total;
}

/**
 * Presupuesto de sugerencias por cliente.
 *
 * El limitador general cuenta por camino, y cada camino basura estrena su
 * propio contador: un cliente que inventa rutas nunca lo agota (auditoría de
 * seguridad, F3/F8). Aquí se cuenta por cliente. Pasado el presupuesto el 404
 * sigue contestando, solo que sin calcular sugerencias, que es lo que cuesta CPU.
 */
export const SUGERENCIAS_POR_MINUTO = 60;
const VENTANA_DE_SUGERENCIAS_MS = 60_000;
// Techo de memoria: con más clientes distintos que esto se empieza de cero.
const CLIENTES_MAXIMOS = 10_000;
const gastoDeSugerencias = new Map<string, { desde: number; usadas: number }>();

export function puedeSugerir(cliente: string, ahora = Date.now()): boolean {
  const gasto = gastoDeSugerencias.get(cliente);
  if (!gasto || ahora - gasto.desde >= VENTANA_DE_SUGERENCIAS_MS) {
    if (!gasto && gastoDeSugerencias.size >= CLIENTES_MAXIMOS) gastoDeSugerencias.clear();
    gastoDeSugerencias.set(cliente, { desde: ahora, usadas: 1 });
    return true;
  }
  gasto.usadas++;
  return gasto.usadas <= SUGERENCIAS_POR_MINUTO;
}

/** Solo para pruebas. */
export function olvidarGastoDeSugerencias(): void {
  gastoDeSugerencias.clear();
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
  const vacio: SugerenciaDeRuta = { allow: [], didYouMean: [] };
  if (camino.length > LARGO_MAXIMO_PARA_ALLOW) return vacio;
  const rutas = rutasParaSugerir();

  const allow = [...new Set(rutas.filter((r) => r.regex.test(camino)).map((r) => r.method))].sort();
  if (camino.length > LARGO_MAXIMO_PARA_SUGERIR) return { allow, didYouMean: [] };

  let fin = camino.length;
  while (fin > 1 && camino[fin - 1] === "/") fin--;
  const limpio = camino.slice(0, fin) || "/";
  // Más de ~20 cambios ya no es «una errata»: el techo acota también la banda.
  const umbral = Math.min(UMBRAL_MAXIMO, Math.max(3, Math.floor(limpio.length * 0.25)));
  const segmentos = limpio.split("/");
  const metodo = method.toUpperCase();

  const candidatas: { method: string; path: string; d: number }[] = [];
  for (const r of rutas) {
    // Cada segmento de más o de menos cuesta al menos un carácter (la `/`).
    if (Math.abs(r.segmentos.length - segmentos.length) > umbral) continue;
    const d = distanciaARuta(r, limpio, segmentos, umbral);
    if (d > umbral) continue;
    // Mismo método, a igualdad de camino, va antes.
    candidatas.push({ method: r.method, path: r.path, d: d + (r.method === metodo ? 0 : 0.5) });
  }

  const didYouMean = candidatas
    .filter((r) => r.d <= umbral)
    .sort((a, b) => a.d - b.d)
    .slice(0, maximo)
    .map(({ method: m, path }) => ({ method: m, path }));

  return { allow, didYouMean };
}
