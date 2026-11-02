#!/usr/bin/env bun
/**
 * Prueba de humo: ninguna ruta registrada puede reventar
 * ============================================================================
 *
 * ── POR QUE HACE FALTA ─────────────────────────────────────────────────────
 *
 * `GET /api/games/collections` llevaba meses devolviendo 500 en produccion y
 * ninguna prueba lo veia. La causa era de enrutado —`/:id` estaba registrada
 * antes y capturaba `collections` como si fuera un UUID— y ese tipo de fallo no
 * aparece en una prueba unitaria: el handler correcto esta bien escrito, lo que
 * falla es cual se ejecuta.
 *
 * `tests/unit/rutas-ensombrecidas.test.ts` cubre esa causa concreta leyendo el
 * codigo. Esto cubre el SINTOMA, venga de donde venga: se pide cada ruta y se
 * mira que ninguna responda 5xx.
 *
 * ── QUE SE CONSIDERA UN FALLO ──────────────────────────────────────────────
 *
 * Solo 5xx. Un 401 o un 404 son respuestas legitimas sin sesion y sin datos:
 * significan «hace falta autenticacion» y «ese id no existe», que es justo lo
 * que tiene que contestar. Un 500 significa que el servidor no supo que hacer
 * con su propia ruta.
 *
 * ── QUE NO CUBRE ───────────────────────────────────────────────────────────
 *
 * Todo lo que hay detras de la autenticacion. Para eso haria falta una sesion,
 * y crear un administrador de mentira en CI para cada arranque tiene su propio
 * coste. Esto es una red de seguridad barata, no una prueba de integracion.
 *
 * ── COMO PIDE LAS RUTAS ────────────────────────────────────────────────────
 *
 * Con `app.request()`, el metodo de Hono que resuelve una peticion EN PROCESO.
 * No hace falta escuchar en un puerto, no hay carrera de arranque y no hay que
 * elegir un puerto libre — tres cosas que hacen intermitente una prueba de humo
 * y la acaban desactivando.
 *
 *   bun run scripts/humo-rutas.ts
 */

import { app } from "../src/index";

/** Valor de relleno para cada segmento `:param`. */
const RELLENO: Record<string, string> = {
  // Un UUID valido donde se espera un id: un texto cualquiera daria un 500 de
  // parseo que es culpa de la prueba, no del codigo.
  id: "00000000-0000-0000-0000-000000000000",
  konId: "kon-blog",
  kon: "kon-blog",
  key: "kon-blog",
  table: "media",
  tableName: "media",
  collection: "media",
  slug: "no-existe",
  channel: "general",
};

function concretar(patron: string): string {
  return patron
    .split("/")
    .map((seg) => {
      if (!seg.startsWith(":")) return seg;
      const nombre = seg.slice(1).replace(/[?{].*$/, "");
      return RELLENO[nombre] ?? "00000000-0000-0000-0000-000000000000";
    })
    .join("/");
}

interface Fallo {
  ruta: string;
  estado: number;
  cuerpo: string;
}

async function main(): Promise<void> {
  // `app.routes` es la tabla de Hono: cada entrada trae metodo y patron.
  const rutas = (app as unknown as { routes: { method: string; path: string }[] }).routes ?? [];

  const aProbar = [
    ...new Set(
      rutas
        .filter((r) => r.method === "GET" || r.method === "ALL")
        // Los comodines de middleware (`/*`) no son rutas concretas.
        .filter((r) => !r.path.includes("*"))
        .map((r) => concretar(r.path))
    ),
  ].sort();

  if (aProbar.length === 0) {
    console.error("ERROR: no se registro ninguna ruta. La app no se monto bien.");
    process.exit(1);
  }

  const fallos: Fallo[] = [];

  for (const ruta of aProbar) {
    try {
      const res = await app.request(ruta, { method: "GET" });
      if (res.status >= 500) {
        fallos.push({ ruta, estado: res.status, cuerpo: (await res.text()).slice(0, 200) });
      }
    } catch (err) {
      // Una excepcion sin respuesta es peor que un 500: el proceso podria caerse.
      fallos.push({
        ruta,
        estado: 0,
        cuerpo: err instanceof Error ? err.message : String(err),
      });
    }
  }

  console.log(`   Humo: ${aProbar.length} rutas probadas, ${fallos.length} con error de servidor`);

  if (fallos.length === 0) {
    process.exit(0);
  }

  console.error("");
  console.error("ERROR: estas rutas responden con un error de SERVIDOR.");
  console.error("");
  console.error("  Un 401 o un 404 estarian bien —hace falta sesion, el id no existe—.");
  console.error("  Un 5xx significa que la peticion llego a un sitio que no sabe");
  console.error("  atenderla. La causa mas comun aqui ha sido el ORDEN DE REGISTRO:");
  console.error("  una ruta con `:param` declarada antes que una literal se queda");
  console.error("  con la peticion y consulta la base con el segmento como si fuera");
  console.error("  un id.");
  console.error("");
  for (const f of fallos) {
    console.error(`   · ${f.estado || "excepcion"}  GET ${f.ruta}`);
    console.error(`       ${f.cuerpo.replace(/\n/g, " ").slice(0, 160)}`);
  }
  console.error("");
  process.exit(1);
}

// Salir SIEMPRE: `app` arrastra el pool de Postgres y el proceso no terminaria
// solo. Ver tests/unit/scripts-arranque-terminan.test.ts.
main().catch((err) => {
  console.error("ERROR en la prueba de humo:", err instanceof Error ? err.message : err);
  process.exit(1);
});
