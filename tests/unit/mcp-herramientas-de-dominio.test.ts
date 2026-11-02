/**
 * Las herramientas MCP de dominio existen, se describen y hablan claro
 * ============================================================================
 *
 * ── LO QUE HABIA ───────────────────────────────────────────────────────────
 *
 * 27 herramientas MCP, todas genéricas. Para reportar un set, un agente tenía
 * que escribir la fila de `esports_matches` a mano con `kitsuden_update_record`
 * y saltarse las reglas del torneo.
 *
 * ── LO QUE VIGILA ──────────────────────────────────────────────────────────
 *
 *   · Que la guía (`/llms.txt`) y el servidor nombren LAS MISMAS herramientas:
 *     una guía que manda usar una herramienta que no existe es peor que ninguna.
 *   · Que el servidor standalone —el que arranca `kitsuden mcp`— las registre.
 *   · Que un argumento mal nombrado dé un error con sugerencia, igual que la API.
 *   · Que las herramientas llamen a las RUTAS, y que el error de la API llegue
 *     intacto al agente.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { HERRAMIENTAS_MCP_DE_DOMINIO, generarGuiaParaAgentes } from "../../apps/api/src/lib/guia-para-agentes";
import {
  DOMAIN_TOOL_DEFINITIONS,
  runDomainTool,
  type LlamadaApi,
} from "../../packages/mcp-server/src/herramientas-de-dominio";

const RAIZ = join(__dirname, "..", "..");

/** API falsa: responde según método y camino, y apunta cada llamada. */
function apiFalsa(respuestas: Record<string, unknown>) {
  const llamadas: { method: string; path: string; body: unknown }[] = [];
  const api: LlamadaApi = async (path, method = "GET", body) => {
    llamadas.push({ method, path, body });
    const clave = `${method} ${path}`;
    if (!(clave in respuestas))
      throw new Error(`API ${method} ${path} failed (404): sin respuesta preparada`);
    const r = respuestas[clave];
    if (r instanceof Error) throw r;
    return r;
  };
  return { api, llamadas };
}

describe("la guía y el servidor hablan de las mismas herramientas", () => {
  it("mismos nombres en los dos sitios", () => {
    const enGuia = HERRAMIENTAS_MCP_DE_DOMINIO.map((h) => h.nombre).sort();
    const enServidor = DOMAIN_TOOL_DEFINITIONS.map((d) => d.name).sort();
    expect(enServidor).toEqual(enGuia);
  });

  it("el servidor standalone las registra, y antes que las genéricas", () => {
    const fuente = readFileSync(join(RAIZ, "packages/mcp-server/src/standalone.ts"), "utf-8");
    const inicio = fuente.indexOf("const TOOL_DEFINITIONS = [");
    const primeraGenerica = fuente.indexOf('name: "kitsuden_list_tables"', inicio);
    const dominio = fuente.indexOf("...DOMAIN_TOOL_DEFINITIONS", inicio);

    expect(dominio, "no se registran").toBeGreaterThan(-1);
    expect(dominio, "tienen que ir antes que las genéricas").toBeLessThan(primeraGenerica);
    expect(fuente).toContain("runDomainTool(");
  });

  it("cada herramienta se explica y cierra sus argumentos", () => {
    for (const d of DOMAIN_TOOL_DEFINITIONS) {
      expect(d.description.length, `${d.name}: descripción demasiado corta`).toBeGreaterThan(60);
      expect(d.inputSchema.additionalProperties, d.name).toBe(false);
      for (const req of d.inputSchema.required ?? []) {
        expect(
          Object.keys(d.inputSchema.properties),
          `${d.name}: «${req}» obligatorio sin definir`
        ).toContain(req);
      }
    }
  });
});

describe("la guía no manda a un contrato que no se publica", () => {
  it("con ENABLE_SWAGGER apagado no cita /docs/openapi.json; encendido, sí", () => {
    const base = "https://api.example.com/api";
    const apagado = generarGuiaParaAgentes({ baseUrl: base, rutas: [], contratoPublicado: false });
    expect(apagado).not.toContain("/docs/openapi.json");
    expect(apagado).toContain("ENABLE_SWAGGER=false");
    expect(generarGuiaParaAgentes({ baseUrl: base, rutas: [] })).toContain(`GET ${base}/docs/openapi.json`);
  });
});

describe("los errores le hablan al agente", () => {
  it("un argumento mal nombrado sugiere el bueno", async () => {
    const { api, llamadas } = apiFalsa({});
    const r = await runDomainTool("tournament_sets", { tournamentID: "t1" }, api);

    expect(r?.isError).toBe(true);
    expect(r?.content[0].text).toContain(
      "«tournamentID» no existe (¿quisiste decir «tournamentId»?)"
    );
    expect(r?.content[0].text).toContain("falta «tournamentId»");
    expect(llamadas, "con argumentos inválidos no se llama a la API").toHaveLength(0);
  });

  it("el error de la API llega tal cual", async () => {
    const { api } = apiFalsa({
      "POST /esports/tournament/t1/swiss/next-round": new Error(
        'API POST /esports/tournament/t1/swiss/next-round failed (409): {"error":"Quedan 1 partida(s) sin resultado."}'
      ),
    });
    const r = await runDomainTool("tournament_next_round", { tournamentId: "t1" }, api);
    expect(r?.isError).toBe(true);
    expect(r?.content[0].text).toContain("sin resultado");
  });

  it("un nombre que no es de dominio devuelve null para que pruebe el servidor", async () => {
    expect(await runDomainTool("kitsuden_list_tables", {}, apiFalsa({}).api)).toBeNull();
  });
});

describe("las herramientas usan las rutas del dominio", () => {
  it("tournament_sets trae nombres e ids para reportar, sin byes", async () => {
    const { api } = apiFalsa({
      "GET /esports/tournaments/t1": {
        id: "t1",
        title: "Suizo",
        status: "InProgress",
        bracketFormat: "swiss",
        participants: [
          { id: "p1", player: { alias: "Aria" } },
          { id: "p2", player: { alias: "Boro" } },
          { id: "p3", player: { alias: "Ciro" } },
        ],
      },
      "GET /esports/matches/tournament/t1": [
        {
          id: "m1",
          round: 1,
          participant1Id: "p1",
          participant2Id: "p2",
          winnerId: null,
          status: "Pending",
        },
        {
          id: "bye",
          round: 1,
          participant1Id: "p3",
          participant2Id: null,
          winnerId: "p3",
          status: "Completed",
        },
      ],
    });

    const r = await runDomainTool("tournament_sets", { tournamentId: "t1" }, api);
    const salida = JSON.parse(r!.content[0].text);

    expect(salida.openSets).toEqual([
      {
        matchId: "m1",
        round: 1,
        sides: [
          { participantId: "p1", name: "Aria" },
          { participantId: "p2", name: "Boro" },
        ],
      },
    ]);
  });

  it("reportar manda matchId y el id de participante a la ruta de reporte", async () => {
    const { api, llamadas } = apiFalsa({
      "POST /esports/matches/tournament/t1/report": {
        message: "Result reported",
        pendingInRound: 0,
      },
    });
    const r = await runDomainTool(
      "tournament_report_set",
      { tournamentId: "t1", matchId: "m1", winnerId: "p1" },
      api
    );

    expect(r?.isError).toBeFalsy();
    expect(llamadas[0]).toEqual({
      method: "POST",
      path: "/esports/matches/tournament/t1/report",
      body: { matchId: "m1", winnerId: "p1" },
    });
  });

  it("colocar sin tierId es un error; con null devuelve la ficha al pool", async () => {
    const lista = {
      data: {
        slug: "x",
        title: "X",
        tiers: [{ id: "s", label: "S" }],
        items: [{ id: "aria", label: "Aria" }],
        placement: {},
      },
    };
    const { api, llamadas } = apiFalsa({ "POST /tierlist/templates/x/place": lista });

    const sinFila = await runDomainTool("tierlist_place", { slug: "x", itemId: "aria" }, api);
    expect(sinFila?.isError).toBe(true);
    expect(sinFila?.content[0].text).toContain("null para devolver la ficha al pool");

    const alPool = await runDomainTool(
      "tierlist_place",
      { slug: "x", itemId: "aria", tierId: null },
      api
    );
    expect(alPool?.isError).toBeFalsy();
    expect(llamadas[0].body).toEqual({ itemId: "aria", tierId: null });
    expect(JSON.parse(alPool!.content[0].text).unranked).toEqual([{ id: "aria", label: "Aria" }]);
  });

  it("tournament_get pasa de nombre a participantId y dice quién hizo check-in", async () => {
    const { api } = apiFalsa({
      "GET /esports/tournaments/t1": {
        id: "t1",
        title: "Copa",
        status: "Open",
        bracketFormat: "single_elimination",
        format: "1v1",
        participants: [
          {
            id: "p1",
            status: "Pending",
            checkedInAt: "2026-09-14T10:00:00.000Z",
            player: { alias: "Aria" },
          },
          { id: "p2", status: "Pending", checkedInAt: null, player: { alias: "Boro" } },
        ],
      },
    });

    const r = await runDomainTool("tournament_get", { tournamentId: "t1" }, api);
    expect(JSON.parse(r!.content[0].text).participants).toEqual([
      { participantId: "p1", name: "Aria", status: "Pending", checkedIn: true },
      { participantId: "p2", name: "Boro", status: "Pending", checkedIn: false },
    ]);
  });

  it("includeCompleted añade los sets resueltos, con el marcador en el orden de los lados", async () => {
    const { api } = apiFalsa({
      "GET /esports/tournaments/t1": {
        id: "t1",
        title: "Suizo",
        status: "InProgress",
        bracketFormat: "swiss",
        participants: [
          { id: "p1", player: { alias: "Aria" } },
          { id: "p2", player: { alias: "Boro" } },
        ],
      },
      "GET /esports/matches/tournament/t1": [
        {
          id: "m1",
          round: 1,
          participant1Id: "p1",
          participant2Id: "p2",
          winnerId: "p2",
          participant1Score: 1,
          participant2Score: 2,
          status: "Completed",
        },
      ],
    });

    const sin = await runDomainTool("tournament_sets", { tournamentId: "t1" }, api);
    expect(JSON.parse(sin!.content[0].text).completedSets).toBeUndefined();

    const con = await runDomainTool(
      "tournament_sets",
      { tournamentId: "t1", includeCompleted: true },
      api
    );
    expect(JSON.parse(con!.content[0].text).completedSets).toEqual([
      {
        matchId: "m1",
        round: 1,
        sides: [
          { participantId: "p1", name: "Aria" },
          { participantId: "p2", name: "Boro" },
        ],
        winner: { participantId: "p2", name: "Boro" },
        score: [1, 2],
      },
    ]);
  });

  it("el catálogo pide un campo de imagen de tipo url", async () => {
    // `image` guarda el id de un medio subido; aquí se pegan URLs externas.
    const { api, llamadas } = apiFalsa({ "POST /data-sets": { id: "ds1", slug: "personajes" } });
    await runDomainTool("catalog_create", { name: "Personajes" }, api);
    expect((llamadas[0].body as { schema: unknown[] }).schema).toEqual([
      { name: "image", type: "url", label: "Imagen" },
    ]);
  });
});
