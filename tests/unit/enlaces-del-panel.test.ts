/**
 * Todo enlace interno del panel tiene que apuntar a una ruta que existe
 * ============================================================================
 *
 * Un `href` roto en una aplicación con enrutado por ficheros no da error en
 * compilación, ni aviso en consola, ni nada: da un 404 dentro del panel, con la
 * barra lateral pintada alrededor. Parece que la pantalla «todavía no está
 * hecha» en lugar de que el enlace esté mal.
 *
 * Lo que había el día que se escribió esta prueba, todo alcanzable con un clic:
 *
 *   · `/games/new`, `/posts/new`, `/crm/deals/new`, `/academy/courses/new` —
 *     páginas de alta que NUNCA existieron: en este panel se crea con un modal.
 *     Alguien escribió los botones copiando una convención de otro proyecto.
 *   · `/posts`, `/media`, `/blocks`, `/games` — rutas de antes de que todo
 *     pasara a vivir bajo `/g/<kon>`.
 *   · `/login` — el formulario lo pinta el layout cuando no hay sesión; no hay
 *     ruta. Cerrar sesión llevaba a un 404.
 *   · `/academy` y `/booking` redirigían a `/g/grimoire-academy-lms` y
 *     `/g/grimoire-booking`: ids de antes del renombrado grimoire → kon.
 *
 * ── LOS REDIRECTORES SON PEOR QUE UN ENLACE ────────────────────────────────
 *
 * Un `href` roto falla donde está escrito. Un `redirect()` roto falla en el
 * destino, así que el 404 aparece en una URL que el usuario no escribió y que
 * no está en el código que tocó. Por eso se comprueban los dos.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { listarFicheros } from "./helpers/ficheros";
import { estadoDelKon } from "./helpers/kons-conocidos";

const RAIZ = join(__dirname, "..", "..");
const RUTAS_DIR = join(RAIZ, "packages", "admin", "src", "routes");

/** Rutas que SvelteKit publica de verdad, en forma de segmentos. */
function rutasPublicadas(): string[][] {
  const rutas: string[][] = [];

  function recorrer(dir: string, segmentos: string[]) {
    const entradas = readdirSync(dir, { withFileTypes: true });
    // Un `+page.ts` sin `.svelte` sigue siendo una ruta: es un redirector.
    if (entradas.some((e) => e.name === "+page.svelte" || e.name === "+page.ts")) {
      rutas.push(segmentos);
    }
    for (const e of entradas) {
      if (!e.isDirectory()) continue;
      // Los grupos `(x)` no aparecen en la URL.
      const nombre = e.name.startsWith("(") ? null : e.name;
      recorrer(join(dir, e.name), nombre ? [...segmentos, nombre] : segmentos);
    }
  }

  recorrer(RUTAS_DIR, []);
  return rutas;
}

function resuelve(destino: string, rutas: string[][]): boolean {
  const limpio = destino.split("?")[0]!.split("#")[0]!;
  const segmentos = limpio.split("/").filter(Boolean);

  return rutas.some(
    (r) =>
      r.length === segmentos.length &&
      r.every((s, i) => s === segmentos[i] || s.startsWith("[") || s === "[...rest]")
  );
}

interface Enlace {
  destino: string;
  donde: string;
}

function enlacesInternos(): Enlace[] {
  const encontrados: Enlace[] = [];
  const base = join(RAIZ, "packages", "admin", "src");

  const patrones = [
    /href="(\/[^"{}]*)"/g,
    /goto\(\s*["'](\/[^"'{}]*)["']/g,
    /window\.location\.href\s*=\s*["'](\/[^"'{}]*)["']/g,
    /redirect\(\s*30[1278]\s*,\s*["'](\/[^"'{}]*)["']/g,
    /**
     * Destinos declarados como PROPIEDAD de un objeto:
     *
     *     { key: "posts", label: "Posts", href: "/posts" }
     *
     * y pintados después con `href={stat.href}`. Faltaba, y por eso esta prueba
     * pasaba en verde mientras SEIS de las tarjetas del panel de inicio —todas
     * las que se ven al entrar— llevaban a un 404. Un atributo literal es la
     * forma menos común de escribir un enlace en este código.
     */
    /href:\s*[`"'](\/[^`"'{}]*)[`"']/g,
  ];

  for (const fichero of listarFicheros(base, ".svelte", ".ts")) {
    const fuente = readFileSync(fichero, "utf-8");
    const relativo = fichero
      .slice(RAIZ.length + 1)
      .split(/[\\/]/)
      .join("/");

    for (const patron of patrones) {
      for (const m of fuente.matchAll(patron)) {
        const destino = m[1]!;
        // `/api/...` lo sirve la API, no el enrutador del panel. `/uploads` y
        // `/media` son ficheros servidos, tampoco rutas.
        if (/^\/(api|uploads|assets|favicon)/.test(destino)) continue;
        const linea = fuente.slice(0, m.index).split("\n").length;
        encontrados.push({ destino, donde: `${relativo}:${linea}` });
      }
    }
  }

  return encontrados;
}

/**
 * Ids que `/g/[id]` sabe resolver.
 *
 * ── POR QUÉ ESTA COMPROBACIÓN APARTE ───────────────────────────────────────
 *
 * Porque `/g/[id]` y `/g/[id]/[viewId]` aceptan CUALQUIER cosa: la
 * comprobación estructural de arriba da por bueno `/g/lo-que-sea/tampoco`. Así
 * pasaron sin detectarse `/g/grimoire-academy-lms` y `/g/grimoire-booking`,
 * ids de antes del renombrado, que solo fallaban al hacer clic.
 *
 * Un id vale si es un kon del disco (`packages/kons/<id>`) o una vista a medida
 * registrada en `grimoire-loader.ts` — ahí viven las herramientas del sistema,
 * como `system-tools-editor`, que no son kons y son destinos legítimos.
 */
function idsDeKonValidos(): Set<string> {
  const validos = new Set<string>();

  const base = join(RAIZ, "packages", "kons");
  if (existsSync(base)) {
    for (const e of readdirSync(base, { withFileTypes: true })) {
      if (!e.isDirectory() || !e.name.startsWith("kon-")) continue;
      validos.add(e.name);
      validos.add(e.name.replace(/^kon-/, ""));
    }
  }

  // Claves del registro de vistas a medida: `"system-tools-editor": () => …`
  const loader = readFileSync(
    join(RAIZ, "packages", "admin", "src", "lib", "grimoire-loader.ts"),
    "utf-8"
  );
  for (const m of loader.matchAll(/^\s*"?([a-z0-9-]+)"?:\s*\(\)\s*=>/gim)) {
    const clave = m[1]!;
    validos.add(clave);
    // `system-tools-editor` cubre la URL `/g/system-tools/editor`.
    const guion = clave.lastIndexOf("-");
    if (guion > 0) validos.add(clave.slice(0, guion));
  }

  return validos;
}

describe("enlaces internos del panel", () => {
  const rutas = rutasPublicadas();
  const enlaces = enlacesInternos();
  const idsValidos = idsDeKonValidos();

  it("los destinos /g/<id> apuntan a un kon o vista que existe", () => {
    const invalidos = enlaces
      .filter((e) => e.destino.startsWith("/g/"))
      .map((e) => ({ ...e, id: e.destino.split("/")[2]!.split("?")[0]! }))
      .filter((e) => !idsValidos.has(e.id))
      // Un kon no instalado (fase C: viven en kitsuden-kons) vale si existe en
      // el repo hermano, o si no hay forma de saberlo.
      .filter((e) => !(e.id.startsWith("kon-") && estadoDelKon(e.id) !== "no-existe"))
      .map((e) => `${e.donde}  →  ${e.destino}  (id "${e.id}" no existe)`);

    expect(
      invalidos,
      `Estos enlaces van a /g/<id> con un id que no corresponde a ningún kon ` +
        `ni a ninguna vista registrada:\n\n${invalidos.join("\n")}\n\n` +
        `La comprobación estructural NO los detecta: /g/[id] acepta cualquier ` +
        `segmento, así que resuelven en la prueba y fallan al hacer clic.`
    ).toEqual([]);
  });

  it("se han encontrado rutas y enlaces", () => {
    expect(rutas.length).toBeGreaterThan(10);
    expect(enlaces.length).toBeGreaterThan(10);
  });

  it("todos apuntan a una ruta existente", () => {
    const rotos = enlaces
      .filter((e) => !resuelve(e.destino, rutas))
      .map((e) => `${e.donde}  →  ${e.destino}`);

    expect(
      rotos,
      `Estos enlaces del panel llevan a un 404:\n\n${rotos.join("\n")}\n\n` +
        `Las rutas del panel están en packages/admin/src/routes. Las pantallas ` +
        `de kon viven todas bajo /g/<konKey>[/<viewId>]; no hay páginas de alta ` +
        `separadas (se crea con un modal), así que un enlace a algo/new no ` +
        `existe por diseño.`
    ).toEqual([]);
  });
});
