/**
 * Idioma del panel.
 *
 * Inglés por defecto; el español se elige en el selector y se guarda en
 * localStorage, así que sobrevive a recargas y cierres de sesión.
 *
 * `t()` lee el idioma en cada llamada y el estado es `$state`, de modo que el
 * marcado se repinta solo. Pero hay etiquetas que se evalúan una vez al cargar
 * un módulo (definiciones de bloques, columnas, menús): esas no se enterarían.
 * Por eso cambiar de idioma recarga la página — es la única forma de que NADA
 * se quede en el idioma anterior.
 */
import en from "./en";
import es from "./es";

export const IDIOMAS = ["en", "es"] as const;
export type Idioma = (typeof IDIOMAS)[number];

type Diccionario = Record<string, Record<string, string>>;
const DICCIONARIOS: Record<Idioma, Diccionario> = { en, es };

export const CLAVE_ALMACEN = "kitsuden-admin-locale";

function leerGuardado(): Idioma {
  try {
    const v = globalThis.localStorage?.getItem(CLAVE_ALMACEN);
    return v === "es" || v === "en" ? v : "en";
  } catch {
    return "en";
  }
}

const estado = $state<{ idioma: Idioma }>({ idioma: leerGuardado() });

if (typeof document !== "undefined") document.documentElement.lang = estado.idioma;

export function getLocale(): Idioma {
  return estado.idioma;
}

/**
 * Cambia el idioma y lo guarda. Con `recargar` (por defecto) recarga la página
 * para que también se traduzcan las etiquetas calculadas al cargar módulos.
 */
export function setLocale(idioma: Idioma, { recargar = true }: { recargar?: boolean } = {}): void {
  if (!IDIOMAS.includes(idioma)) return;
  try {
    globalThis.localStorage?.setItem(CLAVE_ALMACEN, idioma);
  } catch {
    /* almacenamiento bloqueado: el cambio dura solo esta sesión */
  }
  const cambia = idioma !== estado.idioma;
  estado.idioma = idioma;
  if (typeof document !== "undefined") document.documentElement.lang = idioma;
  if (cambia && recargar && typeof location !== "undefined" && typeof window !== "undefined") {
    location.reload();
  }
}

function buscar(dic: Diccionario, clave: string): string | undefined {
  const punto = clave.indexOf(".");
  if (punto < 0) return undefined;
  return dic[clave.slice(0, punto)]?.[clave.slice(punto + 1)];
}

/**
 * Traduce `clave` («espacio.clave») e interpola `{nombre}` con `params`.
 * Si falta en el idioma activo usa el inglés, y si tampoco existe devuelve la
 * clave, para que el hueco se vea en pantalla en vez de quedar en blanco.
 */
export function t(clave: string, params?: Record<string, unknown>): string {
  const texto = buscar(DICCIONARIOS[estado.idioma], clave) ?? buscar(DICCIONARIOS.en, clave) ?? clave;
  if (!params) return texto;
  return texto.replace(/\{(\w+)\}/g, (entero, nombre: string) =>
    nombre in params ? String(params[nombre] ?? "") : entero
  );
}

/**
 * Etiqueta BCP 47 para `toLocaleDateString`, `Intl.NumberFormat`, etc.
 * Antes cada vista fijaba la suya ("en-US" aquí, "es-ES" allá) y una misma
 * pantalla mezclaba fechas en dos idiomas.
 */
export function localeFormato(): string {
  return estado.idioma === "es" ? "es-ES" : "en-US";
}

/** Para tests: los diccionarios tal cual. */
export const diccionarios = DICCIONARIOS;
