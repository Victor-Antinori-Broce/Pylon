/**
 * Las vistas que el panel recibe son coherentes
 * ============================================================================
 *
 * ── EL FALLO QUE ESTO CAZA ─────────────────────────────────────────────────
 *
 * Nueve kons declaran `admin.defaultView: "grid"` y ninguna vista se llama así
 * —las generadas a partir de las tablas se llaman `grid-<tabla>`—. Con
 * `kon-character-builder`, la cadena era:
 *
 *   1. El panel abre con `activeViewId = "grid"`.
 *   2. El filtro por vista devuelve CERO vistas.
 *   3. Sin vista activa no hay tabla activa.
 *   4. El formulario de alta pedía el esquema de una tabla llamada como el kon:
 *
 *          No fields available
 *          Could not load schema for table "kon-character-builder"
 *
 * Cuatro capas entre la causa —un id mal escrito en un JSON— y un mensaje que
 * acusa a una tabla que nunca existió.
 *
 * ── POR QUE ES UNA SONDA Y NO UNA PRUEBA UNITARIA ──────────────────────────
 *
 * Se intentó como prueba de vitest y no puede ser: ese entorno fuerza pg-mem,
 * que no digiere varias migraciones del repo, y `buildAdminRegistry()` acaba
 * devolviendo una lista vacía. Una prueba que recorre cero kons pasa siempre
 * sin comprobar nada — exactamente el tipo de guardián que no sirve.
 *
 * Aquí se ejecuta con la base real:
 *
 *     bun scripts/sonda-vistas.ts
 */

import { buildAdminRegistry } from "../src/services/admin-registry";

let fallos = 0;
const ok = (d: string, c: boolean, x = "") => {
  console.log(`  ${c ? "ok  " : "FALLA"} ${d}${x ? ` — ${x}` : ""}`);
  if (!c) fallos++;
};

console.log("\nVistas que recibe el panel\n");

const kons = await buildAdminRegistry();

ok("el registro devuelve kons", kons.length > 5, `${kons.length}`);

// ── 1. La vista por defecto existe ──────────────────────────────────────────
const sinVista = kons
  .filter((k) => k.defaultView)
  .filter((k) => !(k.views ?? []).some((v) => v.id === k.defaultView))
  .map((k) => `${k.id} → "${k.defaultView}"`);

ok(
  "cada kon abre en una vista de su propia lista",
  sinVista.length === 0,
  sinVista.join(" | ") || "todas existen"
);

// ── 2. Una rejilla sin tabla lleva al mismo sitio ───────────────────────────
const rejillasSinTabla: string[] = [];
for (const k of kons) {
  for (const v of k.views ?? []) {
    if (v.type === "custom" || v.type === "element") continue;
    if (!v.table) rejillasSinTabla.push(`${k.id}/${v.id} (${v.type})`);
  }
}

ok(
  "ninguna vista de rejilla se queda sin tabla",
  rejillasSinTabla.length === 0,
  rejillasSinTabla.join(" | ") || "todas la declaran"
);

// ── 3. Un kon con tablas tiene algo que enseñar ─────────────────────────────
const mudos = kons
  .filter((k) => (k.tables ?? []).length > 0 && (k.views ?? []).length === 0)
  .map((k) => k.id);

ok(
  "todo kon con tablas expone al menos una vista",
  mudos.length === 0,
  mudos.join(", ") || "ninguno mudo"
);

console.log(`\n${fallos === 0 ? "Sin fallos." : `${fallos} fallo(s).`}\n`);
process.exit(fallos === 0 ? 0 : 1);
