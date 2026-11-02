/**
 * Toda tabla que un kon declara tiene que crearla alguna migración
 * ============================================================================
 *
 * Un `kon.json` promete dos cosas sobre tablas:
 *
 *   · `tables: [...]`              — las que el kon posee.
 *   · `admin.views[].table`        — la que enseña cada pestaña del panel.
 *
 * Y esa promesa no la comprobaba nada. El resultado, medido sobre el repo el
 * día que se escribió esta prueba: **cuatro kons declaraban tablas que ninguna
 * migración creaba**, por dos motivos distintos y con el mismo síntoma.
 *
 * ── 1. KONS SIN MIGRACIÓN DE ARRANQUE ──────────────────────────────────────
 *
 * `kon-agile` declaraba trece tablas y no tenía ni carpeta `migrations/`.
 * `kon-dms` traía cuatro migraciones y ninguna creaba `dms_documents`: todas
 * empezaban por un ALTER contra ella. `kon-esports` traía once y la primera
 * RENOMBRABA tablas de una versión anterior del núcleo que en una instalación
 * nueva no existen.
 *
 * Los tres se podían activar desde el panel, y a partir de ahí cada pantalla
 * suya devolvía 500. El esquema de verdad vivía en el fichero Drizzle del kon,
 * que nadie traducía a SQL.
 *
 * ── 2. NOMBRES EN camelCase ────────────────────────────────────────────────
 *
 * `kon-members` declaraba `memberTiers`, `kon-broadcast` `broadcastMatches`,
 * `kon-ecommerce` `shopProducts`. Son las CLAVES del objeto de Drizzle, no los
 * nombres de las tablas, que son `member_tiers`, `broadcast_matches`,
 * `shop_products`. El panel pedía `/api/explorer/memberTiers`, recibía 404 y
 * enseñaba una pestaña vacía — indistinguible de una tabla sin filas.
 *
 * ── LO QUE ESTA PRUEBA NO HACE ─────────────────────────────────────────────
 *
 * No ejecuta el SQL: comprueba que el nombre aparece en un `CREATE TABLE` o en
 * un `RENAME TO`. Que la migración además sea válida es otra cosa, y para eso
 * hace falta un Postgres de verdad.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { HAY_KONS_INSTALADOS } from "./helpers/kons-conocidos";

const RAIZ = join(__dirname, "..", "..");

/** Nombres de tabla que crea o renombra cualquier `.sql` del repo. */
function tablasQueAlguienCrea(): Set<string> {
  const encontradas = new Set<string>();

  const carpetas = [
    join(RAIZ, "apps", "api", "drizzle"),
    join(RAIZ, "apps", "api", "src", "db", "migrations"),
    ...listarSubcarpetasDeMigraciones(join(RAIZ, "packages", "kons")),
    ...listarSubcarpetasDeMigraciones(join(RAIZ, "packages", "core")),
  ];

  for (const dir of carpetas) {
    if (!existsSync(dir)) continue;
    for (const fichero of readdirSync(dir)) {
      if (!fichero.endsWith(".sql")) continue;
      const sql = readFileSync(join(dir, fichero), "utf-8");
      for (const m of sql.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?"?([A-Za-z0-9_]+)"?/gi)) {
        encontradas.add(m[1]!);
      }
      // El renombrado también "crea" el nombre nuevo, y algunos kons llegan a
      // su nombre definitivo así en vez de con un CREATE.
      for (const m of sql.matchAll(/RENAME TO "?([A-Za-z0-9_]+)"?/gi)) {
        encontradas.add(m[1]!);
      }
      // `format('ALTER TABLE %I RENAME TO %I', ...)` dentro de un DO: los
      // nombres van en una lista VALUES, no en la sentencia.
      for (const m of sql.matchAll(/\(\s*'[a-z0-9_]+'\s*,\s*'([a-z0-9_]+)'\s*\)/gi)) {
        encontradas.add(m[1]!);
      }
    }
  }

  return encontradas;
}

function listarSubcarpetasDeMigraciones(base: string): string[] {
  if (!existsSync(base)) return [];
  return readdirSync(base, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== "node_modules")
    .map((e) => join(base, e.name, "migrations"));
}

interface Declarada {
  kon: string;
  tabla: string;
  donde: string;
}

function tablasDeclaradas(): Declarada[] {
  const base = join(RAIZ, "packages", "kons");
  const declaradas: Declarada[] = [];

  for (const entrada of readdirSync(base, { withFileTypes: true })) {
    if (!entrada.isDirectory() || entrada.name === "node_modules") continue;
    const manifiesto = join(base, entrada.name, "kon.json");
    if (!existsSync(manifiesto)) continue;

    const json = JSON.parse(readFileSync(manifiesto, "utf-8"));

    for (const t of json.tables ?? []) {
      const nombre = typeof t === "string" ? t : t?.name;
      if (nombre) declaradas.push({ kon: entrada.name, tabla: nombre, donde: "tables[]" });
    }
    for (const v of json.admin?.views ?? []) {
      if (v?.table) {
        declaradas.push({ kon: entrada.name, tabla: v.table, donde: `admin.views[${v.id}]` });
      }
    }
  }

  return declaradas;
}

describe("tablas declaradas por los kons", () => {
  const creadas = tablasQueAlguienCrea();
  const declaradas = tablasDeclaradas();

  it.skipIf(!HAY_KONS_INSTALADOS)("se han leído manifiestos y migraciones", () => {
    // Sin esto, un cambio de formato dejaría las dos listas vacías y la
    // comprobación de abajo pasaría sin mirar nada — que es justo el modo de
    // fallo silencioso que esta prueba existe para evitar.
    expect(declaradas.length).toBeGreaterThan(30);
    expect(creadas.size).toBeGreaterThan(50);
  });

  it("todas las crea alguna migración", () => {
    const huerfanas = declaradas
      .filter((d) => !creadas.has(d.tabla))
      .map((d) => `${d.kon}  →  ${d.tabla}  (${d.donde})`);

    expect(
      huerfanas,
      `Estos kons declaran tablas que ninguna migración crea:\n\n` +
        `${huerfanas.join("\n")}\n\n` +
        `El kon se puede activar y sus pantallas fallarán una por una. Las dos ` +
        `causas vistas hasta ahora:\n\n` +
        `  · Falta la migración de arranque. El esquema solo existe en el ` +
        `fichero Drizzle del kon. Genera el SQL desde ahí.\n` +
        `  · El nombre está en camelCase. En el manifiesto va el nombre REAL de ` +
        `la tabla (member_tiers), no la clave del objeto Drizzle (memberTiers).\n`
    ).toEqual([]);
  });

  it("las migraciones llevan prefijo numérico de 4 dígitos", () => {
    const malas: string[] = [];
    for (const dir of listarSubcarpetasDeMigraciones(join(RAIZ, "packages", "kons"))) {
      if (!existsSync(dir)) continue;
      for (const f of readdirSync(dir)) {
        if (f.endsWith(".sql") && !/^\d{4}_/.test(f)) {
          malas.push(`${dir.split(/[\\/]/).at(-2)}/${f}`);
        }
      }
    }

    expect(
      malas,
      `Sin prefijo numérico no hay orden determinista, y el orden es lo único ` +
        `que hace reproducible una cadena de migraciones:\n\n${malas.join("\n")}`
    ).toEqual([]);
  });

  it("ninguna carpeta de migraciones repite número de orden", () => {
    const repetidos: string[] = [];
    for (const dir of listarSubcarpetasDeMigraciones(join(RAIZ, "packages", "kons"))) {
      if (!existsSync(dir)) continue;
      const vistos = new Map<string, string>();
      for (const f of readdirSync(dir).filter((n) => n.endsWith(".sql"))) {
        const num = f.slice(0, 4);
        const previo = vistos.get(num);
        if (previo) {
          repetidos.push(`${dir.split(/[\\/]/).at(-2)}: ${previo} y ${f} comparten el ${num}`);
        }
        vistos.set(num, f);
      }
    }

    // Dos ficheros con el mismo número se ordenan por lo que venga detrás, que
    // es alfabético y no tiene por qué coincidir con el orden en que hay que
    // aplicarlos. Pasó al añadir `0000_esquema_base.sql` junto a un
    // `0000_rename_tables.sql` que TIENE que ir después.
    expect(repetidos, `Números de migración repetidos:\n\n${repetidos.join("\n")}`).toEqual([]);
  });
});
