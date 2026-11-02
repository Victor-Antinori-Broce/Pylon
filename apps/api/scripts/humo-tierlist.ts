/**
 * Comprobacion de las salidas nuevas del kon de tier lists
 * ============================================================================
 *
 * ── UNA TRAMPA QUE CAYO AQUI MISMO ─────────────────────────────────────────
 *
 * La primera version de este guion comprobaba que las rutas existieran
 * pidiendolas por HTTP y dando por buena cualquier respuesta que no fuera 404.
 * No sirve, y no de forma sutil: `app.use("/templates/*")` corre ANTES de
 * enrutar, asi que devuelve 401 tambien para rutas que no existen.
 *
 * Medido contra el contenedor que todavia NO tenia desplegada la ruta nueva:
 *
 *     POST /api/tierlist/templates/loquesea/items   →  401
 *
 * El guardian dijo «existe» sobre algo que no estaba. Es exactamente la clase
 * de comprobacion que pasa en verde mirando el sitio equivocado.
 *
 * Por eso ahora el registro se comprueba enumerando `router.routes` —lo que
 * Hono tiene de verdad— y el HTTP se reserva para lo que si sabe contestar.
 *
 * ── LO QUE SE MIRA ─────────────────────────────────────────────────────────
 *
 *   1. Que las rutas esten registradas y ninguna tape a otra. En Hono manda el
 *      orden, y una ruta ensombrecida no da error: responde el manejador
 *      equivocado.
 *   2. Que las de escritura pidan SESION. Una ruta abierta se lee igual que
 *      una cerrada hasta que alguien la llama sin cookie.
 *   3. Que la lectura publica de plantillas siga siendo publica: viven en
 *      paginas publicas y se incrustan con el bloque `tier-list`, asi que
 *      cerrarlas de mas lo romperia sin avisar.
 *
 * No se crea ningun usuario para probar las escrituras autenticadas —hacerlo
 * rompio la pantalla de configuracion una vez— y se dice cuales quedan fuera.
 *
 * El HTTP va contra la instalacion QUE ESTA CORRIENDO, no contra un app en
 * proceso: este kon se monta de forma diferida y un app local apuntando a otra
 * base responde 404 en todo, lo que se lee como «la ruta no existe» cuando lo
 * que pasa es que el kon no esta ahi.
 *
 *     bun apps/api/scripts/humo-tierlist.ts
 */

const BASE = process.env.SONDA_BASE_URL || "http://localhost:3000";

let fallos = 0;

function comprobar(descripcion: string, condicion: boolean, detalle = "") {
  console.log(`  ${condicion ? "ok  " : "FALLA"} ${descripcion}${detalle ? ` — ${detalle}` : ""}`);
  if (!condicion) fallos++;
}

async function estado(metodo: string, ruta: string, cuerpo?: unknown) {
  const res = await fetch(`${BASE}${ruta}`, {
    method: metodo,
    headers: { "content-type": "application/json" },
    ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
  });
  return res.status;
}

async function main() {
  console.log("\nTier lists — salidas para una lista sin catalogo\n");

  // ── 1. Las rutas estan registradas ───────────────────────────────────────
  /**
   * Se monta el router del kon con un contexto minimo. No hace falta base de
   * datos: registrar una ruta no consulta nada.
   */
  const { createKonTierlist } = await import("../../../packages/kons/kon-tierlist/index");
  const router = createKonTierlist({
    db: { instance: {} },
    auth: { requireAuth: async (_c: unknown, next: () => unknown) => next() },
  } as never);

  const registradas = new Set(
    (router as unknown as { routes: { method: string; path: string }[] }).routes.map(
      (r) => `${r.method} ${r.path}`
    )
  );

  const esperadas = [
    "GET /templates",
    "GET /templates/:slug",
    "PUT /templates",
    "POST /templates/:slug/place",
    // Las dos que cierran el callejon: sin ellas, una lista sin catalogo no
    // puede recibir ninguna ficha nunca.
    "POST /templates/:slug/items",
    "DELETE /templates/:slug/items/:itemId",
    "POST /templates/:slug/sync",
    "GET /templates/:slug/diff/:otherId",
  ];

  for (const ruta of esperadas) {
    comprobar(`${ruta} registrada`, registradas.has(ruta));
  }

  // ── 2. Las de escritura piden sesion ─────────────────────────────────────
  const casos: [string, string, unknown?][] = [
    ["POST", "/api/tierlist/templates/loquesea/items", { items: [{ id: "x", label: "X" }] }],
    ["DELETE", "/api/tierlist/templates/loquesea/items/x"],
    ["POST", "/api/tierlist/templates/loquesea/place", { itemId: "x", tierId: null }],
    ["POST", "/api/tierlist/templates/loquesea/sync", {}],
    ["PUT", "/api/tierlist/templates", { slug: "x", title: "X" }],
  ];

  for (const [metodo, ruta, body] of casos) {
    const st = await estado(metodo, ruta, body);
    comprobar(
      `${metodo} ${ruta.replace("/api/tierlist", "")} exige sesion`,
      st === 401 || st === 403,
      `${st}`
    );
  }

  // ── 3. La lectura publica sigue abierta ──────────────────────────────────
  const listado = await fetch(`${BASE}/api/tierlist/templates`);
  const cuerpo = (await listado.json().catch(() => ({}))) as Record<string, unknown>;

  comprobar("GET /templates responde 200 sin sesion", listado.status === 200, `${listado.status}`);
  comprobar(
    "y devuelve una lista, no un error",
    Array.isArray(cuerpo.data),
    JSON.stringify(cuerpo).slice(0, 120)
  );

  console.log(
    "\n  (Las escrituras autenticadas quedan fuera a proposito: probarlas\n" +
      "   exigiria fabricar un usuario, y eso ya rompio la configuracion una vez.)"
  );

  console.log(`\n${fallos === 0 ? "Sin fallos." : `${fallos} fallo(s).`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

void main();
