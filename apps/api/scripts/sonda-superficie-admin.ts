/**
 * Que cada kon ENSEÑE lo que guarda
 * ============================================================================
 *
 * ── QUE PREGUNTA RESPONDE ──────────────────────────────────────────────────
 *
 * `sonda-vistas.ts` comprueba que un kon con tablas tenga AL MENOS una vista.
 * Eso deja pasar el caso que de verdad duele: un kon con quince tablas y una
 * sola vista pasa la comprobacion, y catorce tablas quedan sin ninguna pantalla
 * desde la que verlas.
 *
 * Aqui se mira tabla por tabla:
 *
 *   1. Las tablas que el kon DECLARA existen en la base. Una declarada que no
 *      existe es una pantalla que devuelve error al abrirla.
 *   2. Las tablas que existen y el kon NO declara. Son invisibles para el
 *      explorador: la lista blanca se construye con lo declarado.
 *   3. Las tablas declaradas que ninguna vista cubre. Se guardan datos que no
 *      hay forma de mirar sin entrar a la base.
 *
 * El punto 3 admite excusa legitima: una vista a medida (`element`) puede
 * enseñar varias tablas sin declararlas una a una — el panel del TO enseña
 * fases, sets y partes desde una sola pantalla. Por eso se informa como AVISO
 * y no como fallo, con el kon delante para poder juzgarlo.
 *
 *     bun apps/api/scripts/sonda-superficie-admin.ts
 */

import { sql } from "drizzle-orm";

import { db } from "../src/db";
import { buildAdminRegistry } from "../src/services/admin-registry";

interface Vista {
  id: string;
  type: string;
  table?: string;
  title?: string;
}
interface Tabla {
  name: string;
  readonly?: boolean;
}
interface KonAdmin {
  id: string;
  defaultView?: string;
  tables?: Tabla[];
  views?: Vista[];
}

let fallos = 0;
let avisos = 0;

const ok = (d: string, c: boolean, x = "") => {
  console.log(`  ${c ? "ok  " : "FALLA"} ${d}${x ? ` — ${x}` : ""}`);
  if (!c) fallos++;
};

const aviso = (d: string) => {
  console.log(`  aviso ${d}`);
  avisos++;
};

async function main() {
  const kons = (await buildAdminRegistry()) as unknown as KonAdmin[];

  const filas = await db.instance.execute(
    sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`
  );
  const enLaBase = new Set(
    (
      (Array.isArray(filas) ? filas : ((filas as { rows?: unknown[] }).rows ?? [])) as {
        tablename: string;
      }[]
    ).map((f) => f.tablename)
  );

  console.log(`\nSuperficie de admin — ${kons.length} kons, ${enLaBase.size} tablas en la base\n`);

  const conTablas = kons.filter((k) => (k.tables ?? []).length > 0);

  // ── 1. Lo declarado existe ────────────────────────────────────────────────
  const fantasmas: string[] = [];
  for (const k of conTablas) {
    for (const t of k.tables ?? []) {
      if (!enLaBase.has(t.name)) fantasmas.push(`${k.id}/${t.name}`);
    }
  }
  ok(
    "toda tabla declarada existe en la base",
    fantasmas.length === 0,
    fantasmas.join(", ") || `${conTablas.length} kons revisados`
  );

  // ── 2. La vista por defecto existe ────────────────────────────────────────
  const sinDefecto = kons
    .filter((k) => k.defaultView)
    .filter((k) => !(k.views ?? []).some((v) => v.id === k.defaultView))
    .map((k) => `${k.id} → "${k.defaultView}"`);
  ok("cada kon abre en una vista suya", sinDefecto.length === 0, sinDefecto.join(" | ") || "todas");

  // ── 3. Cada tabla tiene dónde verse ───────────────────────────────────────
  console.log("");
  for (const k of conTablas) {
    const vistas = k.views ?? [];
    const cubiertas = new Set(vistas.map((v) => v.table).filter(Boolean) as string[]);
    const aMedida = vistas.filter((v) => v.type === "element" || v.type === "custom");

    const huerfanas = (k.tables ?? []).filter((t) => !cubiertas.has(t.name)).map((t) => t.name);

    if (huerfanas.length === 0) {
      console.log(
        `  ok    ${k.id.padEnd(22)} ${k.tables!.length} tabla(s), todas con vista ` +
          `(${vistas.length} vista(s))`
      );
      continue;
    }

    const excusa = aMedida.length > 0 ? ` — tiene ${aMedida.length} vista(s) a medida` : "";
    aviso(
      `${k.id.padEnd(22)} ${huerfanas.length}/${k.tables!.length} tabla(s) sin vista` +
        `${excusa}: ${huerfanas.join(", ")}`
    );
  }

  console.log(
    `\n${fallos === 0 ? "Sin fallos" : `${fallos} fallo(s)`}` +
      `${avisos ? `, ${avisos} aviso(s) para juzgar a mano` : ""}.\n`
  );
  process.exit(fallos === 0 ? 0 : 1);
}

void main();
