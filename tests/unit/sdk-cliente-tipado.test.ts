/**
 * El SDK generado hace que un campo mal nombrado falle al compilar
 * ============================================================================
 *
 * ── LO QUE HABIA ───────────────────────────────────────────────────────────
 *
 * `kitsuden generate-sdk` solo sabía sustituir `{collection}` y `{id}`. Con un
 * contrato que ya incluye rutas de kons producía llamadas a caminos con
 * `{tournamentId}` literal, y ningún tipo de cuerpo: `{ winner: "p1" }` en vez
 * de `{ winnerId: "p1" }` solo se descubría leyendo un 422.
 *
 * ── LO QUE VIGILA ──────────────────────────────────────────────────────────
 *
 * Se genera el cliente desde un OpenAPI mínimo con la forma que publica
 * Kitsuden y se COMPILA con TypeScript de verdad: el uso correcto no da
 * errores y el campo mal nombrado sí. Después se ejecuta contra un `fetch`
 * falso para comprobar el camino, la cabecera del token y el error.
 */

import ts from "typescript";
import { describe, expect, it } from "vitest";

import {
  generarClienteTipado,
  type EspecOpenApi,
} from "../../packages/cli/src/commands/sdk/cliente-tipado";

const ESPEC: EspecOpenApi = {
  paths: {
    "/esports/matches/tournament/{tournamentId}/report": {
      post: {
        operationId: "reportSet",
        summary: "Reporta el ganador de un set",
        tags: ["kon-esports"],
        parameters: [
          { name: "tournamentId", in: "path", required: true, schema: { type: "string" } },
        ],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  matchId: { type: "string" },
                  winnerId: { type: "string", description: "Id de participante" },
                  participant1Score: { type: "integer" },
                },
                required: ["winnerId"],
                additionalProperties: false,
              },
            },
          },
        },
        security: [{ bearerAuth: [] }],
      },
    },
    "/esports/tournaments/{id}": {
      get: {
        operationId: "esports_get_tournaments_id",
        tags: ["kon-esports"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        security: [],
      },
    },
    "/tierlist/templates": {
      get: {
        operationId: "tierlist_get_templates",
        tags: ["kon-tierlist"],
        parameters: [{ name: "page", in: "query", required: false, schema: { type: "integer" } }],
      },
    },
    "/items/personajes": {
      post: {
        operationId: "dataset_personajes_create",
        tags: ["Datasets"],
        requestBody: {
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/Dataset_personajes" } },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      Dataset_personajes: {
        type: "object",
        properties: { name: { type: "string" }, image: { type: "string", nullable: true } },
        required: ["name"],
      },
    },
  },
};

/** Compila ficheros en memoria y devuelve los diagnósticos como texto. */
function diagnosticos(ficheros: Record<string, string>): string[] {
  const opciones: ts.CompilerOptions = {
    strict: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
    noEmit: true,
    skipLibCheck: true,
    types: [],
  };
  /**
   * En Windows TypeScript pregunta por "C:/virtual/…" aunque se le dio
   * "/virtual/…". Sin normalizar, los ficheros en memoria no se encuentran y el
   * error habla de un módulo que no existe, no del código generado.
   */
  const clave = (nombre: string) =>
    nombre
      .split(String.fromCharCode(92))
      .join("/")
      .replace(/^[A-Za-z]:/, "");
  const virtuales = new Map(Object.entries(ficheros).map(([n, c]) => [clave(n), c]));

  const host = ts.createCompilerHost(opciones);
  const original = host.getSourceFile.bind(host);
  host.getSourceFile = (nombre, version) =>
    virtuales.has(clave(nombre))
      ? ts.createSourceFile(nombre, virtuales.get(clave(nombre))!, version)
      : original(nombre, version);
  const existe = host.fileExists.bind(host);
  host.fileExists = (nombre) => virtuales.has(clave(nombre)) || existe(nombre);
  const leer = host.readFile.bind(host);
  host.readFile = (nombre) => virtuales.get(clave(nombre)) ?? leer(nombre);

  const programa = ts.createProgram(Object.keys(ficheros), opciones, host);
  return ts
    .getPreEmitDiagnostics(programa)
    .map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"));
}

/** Transpila el cliente a CommonJS y lo evalúa: no tiene imports. */
function cargar(codigo: string): any {
  const { outputText } = ts.transpileModule(codigo, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const modulo = { exports: {} as any };
  new Function("module", "exports", outputText)(modulo, modulo.exports);
  return modulo.exports;
}

describe("el cliente generado", () => {
  const codigo = generarClienteTipado(ESPEC, { baseUrl: "http://api.test/api" });

  it("agrupa por kon y usa el operationId legible cuando lo hay", () => {
    expect(codigo).toContain("esports: {");
    expect(codigo).toContain("reportSet:");
    // El generado se convierte quitando el prefijo del kon, que ya es el espacio.
    expect(codigo).toContain("getTournamentsId:");
    expect(codigo).toContain("tierlist: {");
    expect(codigo).toContain("datasets: {");
  });

  it("compila sin errores y un campo mal nombrado NO compila", () => {
    const errores = diagnosticos({
      "/virtual/uso.ts": `${codigo}

        // ── Uso ──
        const k = createKitsudenClient({ token: "kitsuden_agent_x" });

        void k.esports.reportSet({ tournamentId: "t1" }, { matchId: "m1", winnerId: "p1" });
        void k.esports.getTournamentsId({ id: "t1" });
        void k.tierlist.getTemplates({ page: 2 });
        void k.tierlist.getTemplates();
        void k.datasets.personajesCreate({ name: "Aria", image: null });

        // @ts-expect-error — \`winner\` no existe: el campo es \`winnerId\`.
        void k.esports.reportSet({ tournamentId: "t1" }, { matchId: "m1", winner: "p1" });

        // @ts-expect-error — falta el parámetro de ruta.
        void k.esports.reportSet({}, { winnerId: "p1" });

        // @ts-expect-error — un dataset también rechaza campos que no tiene.
        void k.datasets.personajesCreate({ name: "Aria", imagen: "x" });
      `,
    });

    expect(errores, errores.join("\n")).toEqual([]);
  });

  it("llama al camino correcto, con el token y el cuerpo", async () => {
    const { createKitsudenClient } = cargar(codigo);
    const llamadas: { url: string; init: RequestInit }[] = [];
    const fetchFalso = async (url: string, init: RequestInit) => {
      llamadas.push({ url, init });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };

    const k = createKitsudenClient({ token: "kitsuden_agent_x", fetch: fetchFalso });
    const r = await k.esports.reportSet({ tournamentId: "t/1" }, { winnerId: "p1" });

    expect(r).toEqual({ ok: true });
    expect(llamadas[0].url, "el id va codificado: una barra no puede cambiar el camino").toBe(
      "http://api.test/api/esports/matches/tournament/t%2F1/report"
    );
    expect(llamadas[0].init.method).toBe("POST");
    expect((llamadas[0].init.headers as Record<string, string>).authorization).toBe(
      "Bearer kitsuden_agent_x"
    );
    expect(JSON.parse(String(llamadas[0].init.body))).toEqual({ winnerId: "p1" });
  });

  it("el error trae el cuerpo y las sugerencias en el mensaje", async () => {
    const { createKitsudenClient, KitsudenApiError } = cargar(codigo);
    const fetchFalso = async () =>
      new Response(
        JSON.stringify({
          error: {
            code: "VALIDATION",
            message: "Campos desconocidos en la petición",
            details: { unknownKeys: [{ key: "winner", didYouMean: "winnerId" }] },
          },
        }),
        { status: 422 }
      );

    const k = createKitsudenClient({ fetch: fetchFalso });
    const error = await k.esports
      .reportSet({ tournamentId: "t1" }, { winner: "p1" })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(KitsudenApiError);
    expect(error.status).toBe(422);
    expect(error.message).toContain("«winner» → «winnerId»");
    expect(error.body.error.code).toBe("VALIDATION");
  });
});
