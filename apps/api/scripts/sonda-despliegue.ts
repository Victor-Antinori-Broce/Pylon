/**
 * ¿Lo que corre en el contenedor es lo que hay en el código?
 * ============================================================================
 *
 * ── POR QUE EXISTE ─────────────────────────────────────────────────────────
 *
 * El panel enseñaba DOS tarjetas del mismo kon: «kon-blog» y «blog». El
 * arreglo —una deduplicación por clave canónica— llevaba días escrito en
 * `routes/modules.ts`… y no estaba desplegado. Comprobado dentro del
 * contenedor:
 *
 *     claveCanonica en src:  0        (en el repo: 5)
 *     tamaño del fichero:    37582    (en el repo: 41473)
 *
 * Se había verificado la FUENTE, no el CONTENEDOR. Un `grep` sobre el repo
 * confirma que el arreglo se escribió; no dice absolutamente nada sobre lo que
 * está sirviendo peticiones.
 *
 * Esta sonda pregunta a la API en marcha. Se ejecuta DESPUÉS de desplegar:
 *
 *     bun scripts/sonda-despliegue.ts
 */

const BASE = process.env.SONDA_BASE_URL || "http://localhost:3000";

let fallos = 0;
const ok = (d: string, c: boolean, x = "") => {
  console.log(`  ${c ? "ok  " : "FALLA"} ${d}${x ? ` — ${x}` : ""}`);
  if (!c) fallos++;
};

console.log("\nEstado de lo desplegado\n");

// ── Un kon, una tarjeta ─────────────────────────────────────────────────────
const res = await fetch(`${BASE}/api/modules`);
const cuerpo: any = await res.json();
const modulos: any[] = Array.isArray(cuerpo)
  ? cuerpo
  : cuerpo.data || cuerpo.modules || cuerpo.docs || [];

ok("/api/modules responde", res.status === 200, `status ${res.status}`);
ok("devuelve módulos", modulos.length > 0, `${modulos.length}`);

const porNombre = new Map<string, string[]>();
for (const m of modulos) {
  porNombre.set(m.name, [...(porNombre.get(m.name) ?? []), m.key]);
}
const duplicados = [...porNombre].filter(([, ks]) => ks.length > 1);

ok(
  "ningún kon aparece dos veces",
  duplicados.length === 0,
  duplicados.map(([n, ks]) => `${n}: ${ks.join(" + ")}`).join(" | ") || "sin duplicados"
);

/**
 * Y las claves están normalizadas. `blog` y `kon-blog` son el mismo kon; que
 * convivan es lo que producía las dos tarjetas, y también lo que hace que
 * encender una no encienda la otra.
 */
const canonicas = new Map<string, string[]>();
for (const m of modulos) {
  const c = String(m.key).replace(/^kon-/, "");
  canonicas.set(c, [...(canonicas.get(c) ?? []), m.key]);
}
const mezcladas = [...canonicas].filter(([, ks]) => new Set(ks).size > 1);

ok(
  "no conviven la forma con prefijo y la forma sin él",
  mezcladas.length === 0,
  mezcladas.map(([c, ks]) => `${c}: ${[...new Set(ks)].join(" + ")}`).join(" | ") || "todas únicas"
);

console.log(`\n${fallos === 0 ? "Sin fallos." : `${fallos} fallo(s).`}\n`);
process.exit(fallos === 0 ? 0 : 1);
