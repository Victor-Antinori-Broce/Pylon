/**
 * Vistas de admin agnósticas al framework
 * ============================================================================
 *
 * El contrato que permite que un kon aporte una vista a medida SIN escribir
 * Svelte y sin entrar en el build del admin.
 *
 * El mecanismo anterior hacía `import("…/admin.svelte")` desde el admin: eso
 * mete código fuente ajeno en el grafo de compilación del host. Tiene tres
 * consecuencias, todas malas:
 *
 *   1. Quien extiende está obligado a usar el framework del admin.
 *   2. Vite resuelve el import dinámico como un glob, así que el admin acaba
 *      empaquetando la vista de TODOS los kons aunque nadie las abra.
 *   3. Dos kons con versiones distintas de una dependencia rompen el build
 *      del host — y eso pasa incluso si ambos usan Svelte.
 *
 * La forma agnóstica invierte la relación: el kon publica un ARTEFACTO YA
 * COMPILADO (con su runtime dentro, sea React, Svelte, Vue o nada) y el admin
 * lo carga por URL en runtime. El bundler del admin no ve nada ajeno.
 *
 * Este módulo es deliberadamente puro: valida y resuelve descriptores, sin
 * tocar el DOM. Así se puede testear sin navegador, y la parte que sí toca el
 * DOM queda reducida a unas pocas líneas.
 */

// ── Descriptor ───────────────────────────────────────────────────────────────

export interface CustomViewDescriptor {
  /** Kon que aporta la vista. Determina de dónde se sirve el artefacto. */
  konId: string;
  /** Nombre del custom element. Debe llevar guion (lo exige la spec). */
  element: string;
  /** Ruta del bundle, relativa a la raíz del paquete del kon. */
  src: string;
}

export interface ResolvedCustomView {
  descriptor: CustomViewDescriptor;
  /** URL absoluta (respecto al host) desde la que cargar el módulo. */
  url: string;
}

export class CustomViewError extends Error {
  constructor(
    message: string,
    readonly code:
      | "INVALID_ELEMENT"
      | "INVALID_SRC"
      | "INVALID_KON"
      | "LOAD_FAILED"
      | "NOT_REGISTERED"
  ) {
    super(message);
    this.name = "CustomViewError";
  }
}

// ── Validación ───────────────────────────────────────────────────────────────

/**
 * Un nombre de custom element válido: minúsculas, empieza por letra y CONTIENE
 * un guion. El guion no es estilo — es lo que separa los elementos de usuario
 * de los nativos, y el navegador rechaza el registro sin él.
 */
const ELEMENT_NAME = /^[a-z][a-z0-9]*(-[a-z0-9]+)+$/;

/** Nombres reservados por la spec que parecen válidos pero no lo son. */
const RESERVED_ELEMENT_NAMES = new Set([
  "annotation-xml",
  "color-profile",
  "font-face",
  "font-face-src",
  "font-face-uri",
  "font-face-format",
  "font-face-name",
  "missing-glyph",
]);

export function isValidElementName(name: string): boolean {
  return ELEMENT_NAME.test(name) && !RESERVED_ELEMENT_NAMES.has(name);
}

/**
 * Un `src` seguro: relativo, dentro del paquete del kon y con extensión
 * permitida.
 *
 * Aquí es donde se corta el path traversal. El `src` viene de un `kon.json`,
 * que en un marketplace es contenido de terceros: sin esta comprobación, un
 * `../../../../etc/passwd` o una URL absoluta a otro dominio convierten el
 * punto de extensión en una vulnerabilidad. Se valida en el CLIENTE y otra vez
 * en el SERVIDOR — quien sirve el fichero no puede fiarse de esta capa.
 */
export function isSafeAssetPath(src: string, options: { allowHtml?: boolean } = {}): boolean {
  if (!src || typeof src !== "string") return false;
  // Nada de URLs absolutas ni protocolo-relativas: el artefacto lo sirve el
  // propio host, no un CDN de terceros que podría cambiar bajo tus pies.
  if (/^[a-z][a-z0-9+.-]*:/i.test(src)) return false;
  if (src.startsWith("//")) return false;
  if (src.startsWith("/")) return false;
  // Ni escapar del paquete, ni bytes nulos, ni separadores de Windows.
  if (src.includes("..")) return false;
  if (src.includes("\0") || src.includes("\\")) return false;
  // Solo artefactos de front, nunca fuentes ni manifiestos.
  //
  // `.html` va aparte y NO se permite por defecto: una página HTML servida
  // desde el mismo origen que el admin puede leer sus cookies de sesión, así
  // que solo se habilita para los GRÁFICOS (overlays de OBS) y con una CSP
  // restrictiva encima. Las vistas de admin son Web Components: no lo
  // necesitan, y dárselo sería ampliar la superficie sin motivo.
  return options.allowHtml ? /\.(js|mjs|css|map|html)$/.test(src) : /\.(js|mjs|css|map)$/.test(src);
}

/** Id de kon utilizable en una ruta: sin separadores ni saltos. */
export function isValidKonId(id: string): boolean {
  return typeof id === "string" && /^[a-z0-9][a-z0-9-]{0,80}$/.test(id);
}

// ── Resolución ───────────────────────────────────────────────────────────────

/** URL bajo la que la API sirve los artefactos de admin de un kon. */
export function adminAssetUrl(konId: string, src: string, baseUrl = ""): string {
  const clean = src.replace(/^\.\//, "");
  return `${baseUrl}/api/kons/${konId}/admin-asset/${clean}`;
}

/**
 * Valida un descriptor y devuelve la URL de carga.
 * Lanza `CustomViewError` con un código accionable en vez de un error opaco:
 * quien escribe la vista necesita saber QUÉ está mal.
 */
export function resolveCustomView(
  descriptor: CustomViewDescriptor,
  baseUrl = ""
): ResolvedCustomView {
  if (!isValidKonId(descriptor.konId)) {
    throw new CustomViewError(`Id de kon inválido: "${descriptor.konId}"`, "INVALID_KON");
  }
  if (!isValidElementName(descriptor.element)) {
    throw new CustomViewError(
      `"${descriptor.element}" no es un nombre de custom element válido. ` +
        `Debe ir en minúsculas y contener un guion, p. ej. "${descriptor.konId}-panel".`,
      "INVALID_ELEMENT"
    );
  }
  if (!isSafeAssetPath(descriptor.src)) {
    throw new CustomViewError(
      `"${descriptor.src}" no es una ruta de artefacto válida. Debe ser relativa ` +
        `al paquete del kon y terminar en .js, .mjs, .css o .map.`,
      "INVALID_SRC"
    );
  }

  return { descriptor, url: adminAssetUrl(descriptor.konId, descriptor.src, baseUrl) };
}

/**
 * Extrae el descriptor de una vista declarada en `kon.json`.
 * Devuelve `null` si la vista no es de tipo agnóstico — así el llamador puede
 * caer al camino legacy o al DataExplorer genérico sin tratar errores.
 */
export function descriptorFromView(
  konId: string,
  view: { type?: string; element?: string; src?: string }
): CustomViewDescriptor | null {
  if (view?.type !== "element") return null;
  if (!view.element || !view.src) return null;
  return { konId, element: view.element, src: view.src };
}

// ── Contexto que recibe la vista ─────────────────────────────────────────────

/**
 * Lo que el admin entrega a un custom element al montarlo, vía la propiedad
 * `context`. Es el CONTRATO público: cambiarlo rompe las vistas de terceros,
 * así que está versionado.
 */
export interface AdminViewContext {
  /** Versión del contrato. Una vista puede rechazar lo que no entiende. */
  version: 1;
  konId: string;
  viewId: string;
  /** Base de la API para que la vista haga sus propias llamadas. */
  apiBase: string;
  /** Tema activo, por si la vista quiere ramificar más allá del CSS. */
  theme: "light" | "dark";
  locale: string;
  /**
   * Token de sesión NO se entrega. La vista llama a la API con las cookies del
   * navegador, igual que el resto del admin: pasar un token a código de
   * terceros lo convertiría en exfiltrable.
   */
}

export function createViewContext(init: {
  konId: string;
  viewId: string;
  apiBase?: string;
  theme?: "light" | "dark";
  locale?: string;
}): AdminViewContext {
  return {
    version: 1,
    konId: init.konId,
    viewId: init.viewId,
    apiBase: init.apiBase ?? "/api",
    theme: init.theme ?? "dark",
    locale: init.locale ?? "es",
  };
}
