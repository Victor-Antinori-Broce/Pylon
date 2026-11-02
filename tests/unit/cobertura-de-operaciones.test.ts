/**
 * Cobertura del SDK de kons: cada ruta montada tiene contrato para agentes
 * ============================================================================
 *
 * Toda ruta montada (el inventario es la tabla `MATRIZ` de la matriz de
 * autorización, que ya obliga a clasificar cada ruta que se monta) tiene que
 * estar en UNO de dos sitios:
 *
 *   1. Ser una OPERACIÓN del SDK de kons (`defineOperacion`): entonces tiene
 *      su operación OpenAPI 3.1 con esquemas reales —el documento se VALIDA
 *      aquí con un validador de verdad— y es una herramienta MCP o está
 *      excluida con un motivo escrito.
 *   2. Estar en la lista de legado (`apps/api/src/lib/rutas-legadas.ts`):
 *      rutas de antes del SDK. Esa lista SOLO PUEDE ENCOGER: una ruta nueva
 *      sin declarar falla aquí, una que ya se pasó al SDK también (hay que
 *      quitarla), y el tope `TOPE_DE_RUTAS_LEGADAS` no sube sin decidirlo.
 *
 * Imprime el informe por kon (rutas, con contrato, MCP, excluidas). El
 * informe MEDIDO sobre la app montada (qué sale de verdad en
 * /api/docs/openapi.json) lo da `apps/api/scripts/cobertura-de-operaciones.ts`.
 *
 * Regenerar la lista de legado (solo para QUITAR lo ya migrado):
 *
 *   ACTUALIZAR_RUTAS_LEGADAS=1 pnpm vitest run --config=tests/unit/vitest.config.ts tests/unit/cobertura-de-operaciones.test.ts
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  concedePorScopes,
  esRedireccion,
  exclusionMcp,
  scopesQueConceden,
  type KonDefinition,
} from "@kitsuden/shared";
import { Validator } from "@seriousme/openapi-schema-validator";
import { describe, expect, it } from "vitest";

import {
  componentesComunes,
  herramientaMcp,
  operacionOpenApi,
  peticionDesdeArgumentos,
} from "../../apps/api/src/lib/operaciones-openapi";
import { RUTAS_LEGADAS, TOPE_DE_RUTAS_LEGADAS } from "../../apps/api/src/lib/rutas-legadas";
import { MATRIZ } from "../../apps/api/src/middleware/matriz-de-autorizacion";
import { kon as konBlocks } from "../../packages/core/blocks/index";
import { kon as konDatasets } from "../../packages/core/datasets/index";
import { kon as konMedia } from "../../packages/core/media/index";
import { operacionesDe, type OperacionCualquiera } from "../../packages/engine/src/operaciones";
import { kon as konBlog } from "../../packages/kons/kon-blog/src/index";
import { kon as konAgile } from "../../packages/kons/kon-agile/index";
import { kon as konAcademy } from "../../packages/kons/kon-academy-lms/index";
import { kon as konAnalytics } from "../../packages/kons/kon-analytics/index";
import { kon as konBroadcast } from "../../packages/kons/kon-broadcast/index";
import { kon as konBuilder } from "../../packages/kons/kon-character-builder/index";
import { kon as konCollection } from "../../packages/kons/kon-collection/index";
import { kon as konComments } from "../../packages/kons/kon-comments/index";
import { kon as konGames } from "../../packages/kons/kon-games/index";
import { kon as konIngesta } from "../../packages/kons/kon-ingesta/index";
import { kon as konNewsletter } from "../../packages/kons/kon-newsletter/index";
import { kon as konStreamers } from "../../packages/kons/kon-streamers/index";
import { kon as konWiki } from "../../packages/kons/kon-wiki/index";
import { kon as konEsports } from "../../packages/kons/kon-esports/index";
import { kon as konTierlist } from "../../packages/kons/kon-tierlist/index";
import { kon as konAutobattler } from "../../packages/kons/kon-autobattler/index";
import { kon as konBooking } from "../../packages/kons/kon-booking/index";
import { kon as konCardsim } from "../../packages/kons/kon-cardsim/index";
import { kon as konDeckshow } from "../../packages/kons/kon-deckshow/index";
import { kon as konFormulas } from "../../packages/kons/kon-formulas/index";
import { kon as konHandlab } from "../../packages/kons/kon-handlab/index";
import { kon as konMaps } from "../../packages/kons/kon-maps/index";
import { kon as konMembers } from "../../packages/kons/kon-members/index";
import { kon as konPayments } from "../../packages/kons/kon-payments/index";
import { kon as konConta } from "../../packages/kons/kon-conta/index";
import { kon as konCrm } from "../../packages/kons/kon-crm/index";
import { kon as konDirectory } from "../../packages/kons/kon-directory/index";
import { kon as konDms } from "../../packages/kons/kon-dms/index";
import { kon as konEcommerce } from "../../packages/kons/kon-ecommerce/index";
import { kon as konOcrTraining } from "../../packages/kons/kon-ocr-training/index";
import { kon as konVekstudio } from "../../packages/kons/kon-vekstudio/index";
import { konDeAgentes } from "../../apps/api/src/routes/permisos-de-agentes";
import { konDeAprobaciones, konDePropuestas } from "../../apps/api/src/routes/aprobaciones";
import { konDeMemoria } from "../../apps/api/src/routes/brain-memoria";
import { konDePromocion, konDePromocionAdmin } from "../../apps/api/src/routes/promocion";
import { konDeModelos } from "../../apps/api/src/routes/modelos";
import { RUTAS_DE_PROTOCOLO_OAUTH } from "../../apps/api/src/lib/oauth/config";
import { konDeOAuth } from "../../apps/api/src/routes/oauth-panel";
import { konDeAvisos } from "../../apps/api/src/routes/avisos-de-agentes";
import { konDeCola } from "../../apps/api/src/routes/cola";
import { konDeTrazas } from "../../apps/api/src/routes/trazas";

const RAIZ = resolve(__dirname, "../..");
const ACTUALIZAR = process.env.ACTUALIZAR_RUTAS_LEGADAS === "1";

/** Los kons escritos con el SDK. Añadir aquí el que se migre. */
// `konDeAgentes`: las rutas de permisos/claves/cuotas del panel (fase E), del
// núcleo, declaradas con el SDK (fuera de MCP con motivo).
const KONS_DEL_SDK: KonDefinition[] = [
  konBlocks,
  konMedia,
  konDatasets,
  konBlog,
  // Arreglos de la fase D: leer el tablero y proponer un intake (las
  // herramientas MCP agile_read_board / agile_submit_intake).
  konAgile,
  // Los kons que usan los agentes con herramientas de dominio y recetas en
  // /llms.txt (2026-10-26).
  konTierlist,
  konEsports,
  konBroadcast,
  // Los kons que llama la web pública (Valhalla), 2026-10-26.
  konAcademy,
  konAnalytics,
  konBuilder,
  konCollection,
  konComments,
  konGames,
  konNewsletter,
  konStreamers,
  konWiki,
  // Juegos de cartas, reservas, miembros, pagos y herramientas (2026-10-26).
  konAutobattler,
  konBooking,
  konCardsim,
  konDeckshow,
  konFormulas,
  konHandlab,
  konMaps,
  konMembers,
  konPayments,
  // Los de negocio (2026-10-27). agile ya estaba arriba; ahora entero en el SDK.
  konConta,
  konCrm,
  konDirectory,
  konDms,
  konEcommerce,
  konOcrTraining,
  konVekstudio,
  // kitsuden2.md D4: hecho con defineModelo; sus rutas son operaciones del modelo.
  konIngesta,
  konDeAgentes as unknown as KonDefinition,
  // Fase F: la bandeja de aprobación (solo humanos) y el estado de las
  // propuestas para el agente. Fuera de MCP con motivo; el agente usa la
  // herramienta kitsuden_proposal_status.
  konDeAprobaciones as unknown as KonDefinition,
  konDePropuestas as unknown as KonDefinition,
  // Memoria de agentes (brain): todas sus operaciones son herramientas MCP.
  konDeMemoria as unknown as KonDefinition,
  // Fase I: promoción de código. Lo del agente son herramientas MCP (menos
  // activar, que solo ejecuta una propuesta aprobada); lo del panel, fuera.
  konDePromocion as unknown as KonDefinition,
  konDePromocionAdmin as unknown as KonDefinition,
  // Fase H3: la lista de modelos (defineModelo) para el panel; fuera de MCP
  // con motivo (cada modelo tiene su describe-<modelo>).
  konDeModelos as unknown as KonDefinition,
  // OAuth para MCP: consentimiento y conexiones del panel (solo humanos), fuera
  // de MCP con motivo. Los endpoints del PROTOCOLO van aparte (ver abajo).
  konDeOAuth as unknown as KonDefinition,
  // kitsuden2.md (2026-10-28): la cola de Postgres, las trazas de peticiones y
  // la URL de aviso de los agentes; solo admin, fuera de MCP con motivo.
  konDeCola as unknown as KonDefinition,
  konDeTrazas as unknown as KonDefinition,
  konDeAvisos as unknown as KonDefinition,
];

interface OpMontada {
  konId: string;
  mountPath: string;
  op: OperacionCualquiera;
  clave: string;
}

const montadas: OpMontada[] = KONS_DEL_SDK.flatMap((kon) => {
  const mountPath = (kon.mountPath ?? `/api/${kon.id.replace(/^kon-/, "")}`).replace(/\/+$/, "");
  return operacionesDe(kon).map((op) => ({
    konId: kon.id,
    mountPath,
    op,
    clave: `${op.metodo} ${op.ruta === "/" ? mountPath : `${mountPath}${op.ruta}`}`,
  }));
});
const clavesDelSdk = new Set(montadas.map((m) => m.clave));

/** Las rutas de verdad: lo que la matriz exige clasificar (sin los `ALL` de `app.use`). */
const inventario = Object.keys(MATRIZ).filter((k) => !k.startsWith("ALL "));

// ── A qué kon pertenece cada ruta (para el informe) ──────────────────────────

function montajesDeKons(): { prefijo: string; kon: string }[] {
  const salida: { prefijo: string; kon: string }[] = [];
  for (const base of ["packages/kons", "packages/core"]) {
    const dir = join(RAIZ, base);
    for (const nombre of readdirSync(dir)) {
      const p = join(dir, nombre, "kon.json");
      if (!existsSync(p)) continue;
      const m = JSON.parse(readFileSync(p, "utf8")) as { id?: string; mount?: { path?: string } };
      if (!m.id) continue;
      salida.push({ prefijo: m.mount?.path ?? `/api/${m.id.replace(/^kon-/, "")}`, kon: m.id });
    }
  }
  return salida.sort((a, b) => b.prefijo.length - a.prefijo.length);
}
const MONTAJES = montajesDeKons();
function konDeClave(clave: string): string {
  const camino = clave.split(" ")[1]!;
  return (
    MONTAJES.find((m) => camino === m.prefijo || camino.startsWith(`${m.prefijo}/`))?.kon ??
    "host (apps/api)"
  );
}

// ═════════════════════════════════════════════════════════════════════════════

describe("operaciones del SDK", () => {
  it("hay operaciones declaradas en los kons migrados", () => {
    expect(montadas.length).toBeGreaterThan(70);
  });

  it("cada operación está montada y clasificada en la matriz de autorización", () => {
    const fuera = montadas.filter((m) => !MATRIZ[m.clave]).map((m) => m.clave);
    expect(fuera, "operación declarada que la matriz no conoce (¿mal camino?)").toEqual([]);
  });

  it("el OpenAPI 3.1 generado de las operaciones es VÁLIDO (validador real)", async () => {
    const doc = {
      openapi: "3.1.0",
      info: { title: "Kitsuden kon SDK operations", version: "test" },
      servers: [{ url: "http://localhost:3000/api" }],
      paths: {} as Record<string, Record<string, unknown>>,
      components: componentesComunes(),
    };
    for (const m of montadas) {
      const g = operacionOpenApi(m.konId, m.mountPath, m.op);
      (doc.paths[g.camino] ??= {})[g.metodo] = g.operacion;
    }
    const r = await new Validator().validate(doc);
    expect(r.errors ?? [], JSON.stringify(r.errors, null, 1)?.slice(0, 3000)).toEqual([]);
    expect(r.valid).toBe(true);
  });

  it("cada operación OpenAPI trae esquemas reales: entrada, salida y errores", () => {
    const faltas: string[] = [];
    for (const m of montadas) {
      const { operacion } = operacionOpenApi(m.konId, m.mountPath, m.op);
      const respuestas = operacion.responses as Record<
        string,
        { content?: Record<string, { schema?: unknown }> }
      >;
      const exito = respuestas[String(m.op.salida.estado ?? 200)];
      if (!exito) faltas.push(`${m.clave}: sin respuesta de éxito`);
      else if (
        m.op.salida.estado !== 204 &&
        !esRedireccion(m.op.salida.estado) &&
        !Object.values(exito.content ?? {})[0]?.schema
      )
        faltas.push(`${m.clave}: respuesta sin esquema`);
      if (m.op.entrada?.cuerpo && !operacion.requestBody)
        faltas.push(`${m.clave}: cuerpo sin requestBody`);
      if (!Object.keys(respuestas).some((s) => Number(s) >= 400))
        faltas.push(`${m.clave}: sin errores`);
      const ext = operacion["x-kitsuden-operation"] as { scope?: string; sensitive?: unknown };
      if (!ext?.scope || typeof ext.sensitive !== "boolean")
        faltas.push(`${m.clave}: sin scope/sensible`);
    }
    expect(faltas).toEqual([]);
  });

  it("cada operación es una herramienta MCP o está excluida con motivo", () => {
    const nombres = new Set<string>();
    for (const m of montadas) {
      const motivo = exclusionMcp(m.op);
      const h = herramientaMcp(m.konId, m.mountPath, m.op);
      if (motivo !== null) {
        expect(motivo.trim().length, `${m.clave}: motivo vacío`).toBeGreaterThan(10);
        expect(h).toBeNull();
        continue;
      }
      expect(h, m.clave).not.toBeNull();
      expect(h!.inputSchema.type).toBe("object");
      expect(h!.name).toMatch(/^[a-z0-9_-]{1,64}$/);
      expect(nombres.has(h!.name), `nombre repetido: ${h!.name}`).toBe(false);
      nombres.add(h!.name);
    }
  });

  it("los argumentos de la herramienta construyen la petición REST de su operación", () => {
    const editar = montadas.find((m) => m.clave === "PATCH /api/page-builder/blocks/:id")!;
    const p = peticionDesdeArgumentos(editar.mountPath, editar.op, {
      id: "0c6e1c2e-0000-4000-8000-000000000003",
      body: { content: { headline: "x" } },
      idempotency_key: "clave-de-prueba-1",
    });
    expect(p.url).toBe(
      "http://kitsuden.internal/api/page-builder/blocks/0c6e1c2e-0000-4000-8000-000000000003"
    );
    expect(p.init.method).toBe("PATCH");
    expect(JSON.parse(String(p.init.body))).toEqual({ content: { headline: "x" } });
    expect(p.init.headers["idempotency-key"]).toBe("clave-de-prueba-1");
  });

  it("los scopes: fino, amplio por kon y declarados conceden; uno ajeno no (unión, sin restar)", () => {
    const crear = montadas.find((m) => m.clave === "POST /api/page-builder/pages")!;
    expect(scopesQueConceden(crear.konId, crear.op)).toContain("kon:blocks:crear-pagina");
    expect(concedePorScopes(["kon:blocks:crear-pagina"], crear.konId, crear.op).concedido).toBe(
      true
    );
    expect(concedePorScopes(["kon:blocks:*"], crear.konId, crear.op).concedido).toBe(true);
    expect(concedePorScopes(["blocks:*"], crear.konId, crear.op).concedido).toBe(true);
    expect(concedePorScopes(["admin"], crear.konId, crear.op).concedido).toBe(true);
    expect(concedePorScopes(["kon:blog:crear-entrada"], crear.konId, crear.op).concedido).toBe(
      false
    );
    expect(concedePorScopes([], crear.konId, crear.op).concedido).toBe(false);
  });
});

describe("inventario: toda ruta montada es operación del SDK o legado listado", () => {
  // Las rutas del protocolo OAuth (formularios, 302, errores de RFC 6749):
  // su contrato es la especificación MCP 2026-07-28, no el SDK. Lista cerrada
  // en apps/api/src/lib/oauth/config.ts.
  const sinContrato = inventario.filter((k) => !clavesDelSdk.has(k) && !RUTAS_DE_PROTOCOLO_OAUTH.includes(k));

  it.runIf(ACTUALIZAR)("regenera la lista de legado", () => {
    const fichero = join(RAIZ, "apps/api/src/lib/rutas-legadas.ts");
    const actual = readFileSync(fichero, "utf8");
    const ini = actual.indexOf("export const RUTAS_LEGADAS");
    const cabecera = actual.slice(0, ini);
    const lista = [...sinContrato].sort();
    writeFileSync(
      fichero,
      `${cabecera}export const RUTAS_LEGADAS: readonly string[] = ${JSON.stringify(lista, null, 2)};\n\n` +
        `/** Solo puede BAJAR. Subirlo es decidir que una ruta nueva nace sin contrato. */\n` +
        `export const TOPE_DE_RUTAS_LEGADAS = ${lista.length};\n`
    );
  });

  it.skipIf(ACTUALIZAR)("ninguna ruta montada queda sin contrato y sin listar", () => {
    const legado = new Set(RUTAS_LEGADAS);
    const nuevas = sinContrato.filter((k) => !legado.has(k));
    expect(
      nuevas,
      "Rutas montadas que no son operación del SDK ni están en la lista de legado. " +
        "Decláralas con defineOperacion (docs/kons/README.md)."
    ).toEqual([]);
  });

  it.skipIf(ACTUALIZAR)("la lista de legado solo encoge", () => {
    const viejas = RUTAS_LEGADAS.filter((k) => clavesDelSdk.has(k) || !inventario.includes(k));
    expect(viejas, "ya migradas o desmontadas: quítalas de rutas-legadas.ts").toEqual([]);
    expect(RUTAS_LEGADAS.length).toBeLessThanOrEqual(TOPE_DE_RUTAS_LEGADAS);
  });

  it("informe de cobertura por kon", () => {
    type Fila = { rutas: number; sdk: number; mcp: number; excluidas: number };
    const porKon = new Map<string, Fila>();
    const herramientaDe = new Map(
      montadas.map((m) => [m.clave, herramientaMcp(m.konId, m.mountPath, m.op)] as const)
    );
    for (const clave of inventario) {
      const kon = konDeClave(clave);
      const f = porKon.get(kon) ?? { rutas: 0, sdk: 0, mcp: 0, excluidas: 0 };
      f.rutas++;
      if (clavesDelSdk.has(clave)) {
        f.sdk++;
        if (herramientaDe.get(clave)) f.mcp++;
        else f.excluidas++;
      }
      porKon.set(kon, f);
    }
    const pct = (n: number, d: number) => `${d ? Math.round((n / d) * 1000) / 10 : 0}%`;
    const filas = [...porKon.entries()].sort(
      (a, b) => b[1].sdk - a[1].sdk || b[1].rutas - a[1].rutas
    );
    const total = filas.reduce(
      (t, [, f]) => ({
        rutas: t.rutas + f.rutas,
        sdk: t.sdk + f.sdk,
        mcp: t.mcp + f.mcp,
        excluidas: t.excluidas + f.excluidas,
      }),
      { rutas: 0, sdk: 0, mcp: 0, excluidas: 0 }
    );
    const lineas = [
      "| kon | routes | OpenAPI with schemas (SDK) | MCP tools | MCP excluded (with reason) |",
      "|---|---:|---:|---:|---:|",
      ...[...filas, ["TOTAL", total] as const].map(
        ([kon, f]) =>
          `| ${kon} | ${f.rutas} | ${f.sdk} (${pct(f.sdk, f.rutas)}) | ${f.mcp} (${pct(f.mcp, f.rutas)}) | ${f.excluidas} |`
      ),
    ];
     
    console.log(`\nCobertura del SDK de kons (inventario: MATRIZ)\n${lineas.join("\n")}\n`);
    expect(total.rutas).toBe(inventario.length);
  });
});
