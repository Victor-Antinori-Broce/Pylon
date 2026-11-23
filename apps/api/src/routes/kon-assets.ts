/**
 * Artefactos de admin de los kons
 * ============================================================================
 *
 * Sirve el bundle ya compilado de una vista a medida bajo una URL estable:
 *
 *   GET /api/kons/:konId/admin-asset/<ruta>
 *
 * Es la pieza que permite que el punto de extensión del admin sea agnóstico al
 * framework: el kon publica un artefacto, el admin lo carga con `import(url)`
 * en RUNTIME, y el bundler del host nunca ve código ajeno.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SEGURIDAD
 *
 * Esta ruta convierte una cadena de un `kon.json` — que en un marketplace es
 * contenido de terceros — en una lectura de fichero. Es exactamente la forma de
 * un path traversal, así que la defensa es explícita y en capas:
 *
 *   1. El id de kon se valida contra una lista blanca de patrón, y además
 *      tiene que resolver a un kon REAL ya cargado. No se construye una ruta
 *      con texto del usuario.
 *   2. La ruta pedida se valida (sin `..`, sin absolutas, sin bytes nulos) y se
 *      restringe a extensiones de front.
 *   3. Tras normalizar, se comprueba que la ruta final siga DENTRO del
 *      directorio del kon. Es la comprobación que atrapa lo que se le escape a
 *      las dos anteriores (enlaces simbólicos, codificaciones raras).
 *
 * La validación del cliente (`@kitsuden/shared`) NO cuenta aquí: quien sirve
 * el fichero no puede fiarse de quien lo pide.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createReadStream } from "node:fs";
import { stat, realpath } from "node:fs/promises";
import { join, resolve, extname, sep, posix } from "node:path";
import { Readable } from "node:stream";

import { isSafeAssetPath, isValidKonId } from "@kitsuden/shared";
import { Hono, type Context } from "hono";

import { logger } from "../lib/logger";
import { resolveWorkspaceRoot } from "../lib/module-loader";
import { rutaDeKon } from "../lib/kons-instalados";
import { getKonAdminConfig } from "../services/admin-registry";

const app = new Hono();

/** Tipos MIME de los únicos artefactos que se sirven. */
// `.map` NO se sirve: un source map publica el código fuente de un kon
// (incluido el de uno privado o de pago) a cualquiera, sin sesión.
const MIME: Record<string, string> = {
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  // Solo para gráficos: ver la CSP que se aplica al servirlo.
  ".html": "text/html; charset=utf-8",
};

/** 5 MB. Un panel de admin que pese más es un error, no un caso de uso. */
const MAX_ASSET_BYTES = 5 * 1024 * 1024;

/**
 * Directorio en disco de un kon.
 *
 * Se busca por nombre de carpeta dentro de las raíces conocidas en vez de
 * concatenar el id a un path: así el id nunca participa en la construcción de
 * una ruta arbitraria.
 */
async function konDirectory(konId: string): Promise<string | null> {
  const root = await resolveWorkspaceRoot();
  // Primero la carpeta del kon INSTALADO (kitsuden.kons.json / KITSUDEN_KONS):
  // puede vivir en packages/kons, en node_modules o enlazado desde otro repo.
  // El id solo se usa para BUSCAR en esa lista, nunca para construir la ruta.
  const instalada = rutaDeKon(konId);
  // Los kons core viven fuera de packages/kons y su id lleva prefijo. Un id
  // que se queda vacío al quitarlo (`kon-`) resolvería a `packages/core`
  // entero: no es un kon, no se busca.
  const nombreCore = konId.replace(/^kon-/, "");
  const candidates = [
    ...(instalada ? [instalada] : []),
    join(root, "packages", "kons", konId),
    ...(nombreCore ? [join(root, "packages", "core", nombreCore)] : []),
  ];

  for (const dir of candidates) {
    try {
      const info = await stat(dir);
      if (info.isDirectory()) return await realpath(dir);
    } catch {
      // Siguiente candidato.
    }
  }
  return null;
}

/**
 * Carpetas (relativas al paquete) de los `src` de las vistas `element` que el
 * kon declara. Un `src` en la raíz del paquete no abre la raíz: devuelve "" y
 * se ignora, para no volver a servir el paquete entero.
 */
async function carpetasDeclaradas(konId: string): Promise<string[]> {
  let config;
  try {
    config = await getKonAdminConfig(konId);
  } catch (err) {
    logger.warn({ konId, err }, "[kon-assets] no se pudo leer el registro de admin");
    return [];
  }
  const carpetas = new Set<string>();
  for (const view of config?.views ?? []) {
    if (view.type !== "element" || typeof view.src !== "string") continue;
    const src = view.src.replace(/^\.\//, "");
    if (!isSafeAssetPath(src)) continue;
    carpetas.add(posix.dirname(src) === "." ? "" : posix.dirname(src));
  }
  return [...carpetas];
}

/** Qué clase de artefacto sirve cada ruta. Determina extensiones y cabeceras. */
type AssetKind = "admin-asset" | "graphics";

/**
 * Sirve un fichero del paquete de un kon aplicando las tres capas de defensa.
 *
 * Compartido entre `admin-asset` y `graphics` a propósito: duplicar la lógica de
 * contención sería la forma más fácil de que una de las dos se quedara atrás.
 */
async function serveFromKon(c: Context, kind: AssetKind) {
  const konId = c.req.param("konId")!;

  // ── Capa 1: forma del id ──
  if (!isValidKonId(konId)) {
    return c.json({ error: "Invalid kon id" }, 400);
  }

  // Hono entrega el comodín ya decodificado; se vuelve a normalizar por si
  // llega doblemente codificado (`%252e%252e`).
  const raw = c.req.path.split(`/${kind}/`)[1] ?? "";
  let requested: string;
  try {
    requested = decodeURIComponent(raw);
  } catch {
    return c.json({ error: "Invalid asset path" }, 400);
  }

  // ── Capa 2: forma de la ruta ──
  // `.html` solo se admite en gráficos: una página en el mismo origen que el
  // admin puede leer sus cookies, así que no se regala a las vistas de admin.
  const allowHtml = kind === "graphics";
  if (!isSafeAssetPath(requested, { allowHtml })) {
    logger.warn({ konId, requested, kind }, "[kon-assets] ruta de artefacto rechazada");
    return c.json({ error: "Invalid asset path" }, 400);
  }

  // ── Capa 2b: solo lo que el manifiesto declara ──
  // Una vista de admin se sirve desde la carpeta de su `src` declarado (y sus
  // chunks, que viven junto a él). Nada más del paquete es público: ni otros
  // `.js` del servidor, ni los `dist/` de un kon privado.
  if (kind === "admin-asset") {
    const carpetas = await carpetasDeclaradas(konId);
    const pedido = requested.replace(/^\.\//, "");
    if (!carpetas.some((dir) => dir !== "" && pedido.startsWith(dir + "/"))) {
      return c.json({ error: "Not found" }, 404);
    }
  }

  const konDir = await konDirectory(konId);
  if (!konDir) return c.json({ error: "Kon not found" }, 404);

  // Para gráficos, la raíz de contención es `graphics/`, no el paquete entero.
  // Se estrecha el alcance en vez de comprobar un prefijo en la petición: así
  // ninguna ruta puede servir HTML desde otro punto del kon, y la URL queda
  // limpia (`/graphics/overlay.html`, sin repetir el segmento).
  const baseDir = kind === "graphics" ? join(konDir, "graphics") : konDir;

  const target = resolve(baseDir, requested);

  // ── Capa 3: contención real tras normalizar ──
  // Es la comprobación que de verdad importa: aunque las anteriores fallaran,
  // aquí se exige que el fichero resuelto cuelgue del directorio del kon.
  if (target !== baseDir && !target.startsWith(baseDir + sep)) {
    logger.warn({ konId, requested, target }, "[kon-assets] intento de path traversal");
    return c.json({ error: "Invalid asset path" }, 400);
  }

  const ext = extname(target).toLowerCase();
  const mime = MIME[ext];
  if (!mime) return c.json({ error: "Unsupported asset type" }, 400);
  if (ext === ".html" && kind !== "graphics") {
    return c.json({ error: "Unsupported asset type" }, 400);
  }

  let info;
  try {
    // `realpath` resuelve enlaces simbólicos: un symlink dentro del paquete
    // apuntando fuera burlaría la comprobación de prefijo de arriba.
    const real = await realpath(target);
    if (real !== baseDir && !real.startsWith(baseDir + sep)) {
      logger.warn({ konId, requested, real }, "[kon-assets] symlink fuera del kon");
      return c.json({ error: "Invalid asset path" }, 400);
    }
    info = await stat(real);
    if (!info.isFile()) return c.json({ error: "Not found" }, 404);
  } catch {
    return c.json({ error: "Not found" }, 404);
  }

  if (info.size > MAX_ASSET_BYTES) {
    return c.json({ error: "Asset too large" }, 413);
  }

  // ETag por (mtime, tamaño): basta para revalidar y evita leer el fichero.
  const etag = `W/"${info.mtimeMs.toString(36)}-${info.size.toString(36)}"`;
  if (c.req.header("if-none-match") === etag) {
    return new Response(null, { status: 304 });
  }

  const headers: Record<string, string> = {
    "content-type": mime,
    "content-length": String(info.size),
    etag,
    // Corto y revalidable: una vista de admin se itera a menudo durante el
    // desarrollo, y un cache largo haría creer que los cambios no aplican.
    "cache-control": "public, max-age=0, must-revalidate",
    // El artefacto es de terceros: se marca como no-sniffable para que el
    // navegador no lo reinterprete como otra cosa.
    "x-content-type-options": "nosniff",
  };

  if (kind === "graphics") {
    // Un gráfico es HTML DE TERCEROS servido desde el origen de la API. Si
    // alguien lo abre en el navegador donde tiene sesión de admin, comparte
    // origen con ella. La CSP acota el daño: nada de recursos externos, nada
    // de conexiones fuera del propio host, y sin poder embeber el admin.
    headers["content-security-policy"] = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'", // los overlays llevan estilo/lógica inline
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "connect-src 'self'", // solo habla con esta API, nunca exfiltra fuera
      "frame-ancestors 'none'",
      "base-uri 'none'",
      "form-action 'none'",
    ].join("; ");
    // OBS necesita cargarlo, pero nadie debe poder enmarcarlo.
    headers["x-frame-options"] = "DENY";
  }

  const stream = Readable.toWeb(createReadStream(target)) as ReadableStream;
  return new Response(stream, { headers });
}

/** Vistas de admin: Web Components y sus estilos. */
app.get("/:konId/admin-asset/*", (c) => serveFromKon(c, "admin-asset"));

/**
 * Gráficos para emisión: la página que se pega en una Browser Source de OBS.
 *
 * Es el equivalente a los `graphics/` de un bundle de NodeCG, con dos
 * diferencias: aquí van tras una CSP estricta, y el estado que consumen viaja
 * por un canal con permisos en vez de un JSON global sin control de acceso.
 */
app.get("/:konId/graphics/*", (c) => serveFromKon(c, "graphics"));

export default app;
