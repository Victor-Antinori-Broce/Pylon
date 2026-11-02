/**
 * MCP: las operaciones del SDK de kons como herramientas, con scopes de verdad
 * ============================================================================
 *
 * Contra la app REAL (Postgres de pruebas, kons cargados): agentes reales
 * (`createAgent`) abren una sesión MCP, listan herramientas y llaman a las
 * GENERADAS de `kon-blocks` (el page builder):
 *
 *   · un agente con `contenido:editar` ve y ejecuta `blocks__crear-pagina`;
 *     repetir la llamada con el mismo `idempotency_key` devuelve el primer
 *     resultado sin crear otra página;
 *   · uno sin ese scope ve las de lectura pero no las de escritura, y si llama
 *     a una de escritura recibe KITSUDEN_E_FORBIDDEN;
 *   · `allowedTools` recorta lo que la sesión ve y puede llamar;
 *   · un argumento que no existe es KITSUDEN_E_VALIDATION con los válidos.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";

import { konInstalado } from "../lib/kons-instalados";

// La guía y la auditoría se prueban con el kon piloto del SDK, kon-blog, que es
// INSTALABLE (kitsuden-kons): sin él, se saltan.
const itConBlog = konInstalado("kon-blog")?.ruta ? it : it.skip;
import { and, eq } from "drizzle-orm";

import { db } from "../db";
import { agentAuditLogs } from "../db/schema";
import { app } from "../index";
import { createAgent } from "../services/agent-auth";

import { isDatabaseAvailable, generateTestId } from "./setup";

let dbAvailable = false;

interface Sesion {
  agentId: string;
  token: string;
  sessionId: string;
  cerrar: () => Promise<void>;
}

const abiertas: Sesion[] = [];

async function sesionMcp(scopes: string[], allowedTools: string[] = []): Promise<Sesion> {
  const { agent, plainApiKey } = await createAgent({
    name: `mcp-ops-${scopes.join("+")}-${generateTestId()}`,
    scopes,
    allowedTools,
    rateLimit: 100_000,
  });
  const res = await app.request(
    new Request("http://localhost:3000/api/mcp", {
      headers: { Authorization: `Bearer ${plainApiKey}` },
    })
  );
  expect(res.status).toBe(200);
  const lector = res.body!.getReader();
  let texto = "";
  while (!texto.includes("\n\n")) {
    const { value, done } = await lector.read();
    if (done) break;
    texto += new TextDecoder().decode(value);
  }
  const sessionId = texto.match(/sessionId=([a-zA-Z0-9-]+)/)![1]!;
  const s: Sesion = { agentId: agent.id, token: plainApiKey, sessionId, cerrar: () => lector.cancel().catch(() => {}) };
  abiertas.push(s);
  return s;
}

let siguienteId = 1;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- respuesta JSON-RPC leída en la prueba
async function rpc(s: Sesion, method: string, params: unknown): Promise<any> {
  const res = await app.request(
    new Request(`http://localhost:3000/api/mcp?sessionId=${s.sessionId}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${s.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: siguienteId++, method, params }),
    })
  );
  expect(res.status).toBe(200);
  return res.json();
}

async function herramientas(s: Sesion): Promise<string[]> {
  const r = await rpc(s, "tools/list", {});
  return (r.result.tools as { name: string }[]).map((t) => t.name);
}

describe("MCP: herramientas generadas por el SDK de kons", () => {
  beforeAll(async () => {
    dbAvailable = await isDatabaseAvailable();
  });
  afterAll(async () => {
    for (const s of abiertas) await s.cerrar();
  });

  it("tools/list: el editor de contenido ve escritura; el que no tiene el scope, solo lectura", async () => {
    if (!dbAvailable) return;
    const editor = await sesionMcp(["mcp:connect", "contenido:editar"]);
    const lector = await sesionMcp(["mcp:connect"]);

    const delEditor = await herramientas(editor);
    expect(delEditor).toContain("blocks__crear-pagina");
    expect(delEditor).toContain("blocks__tipos-de-bloque");

    const delLector = await herramientas(lector);
    expect(delLector).toContain("blocks__tipos-de-bloque");
    expect(delLector).not.toContain("blocks__crear-pagina");

    // El mismo esquema que la ruta REST: el cuerpo, entero bajo `body`
    const r = await rpc(editor, "tools/list", {});
    const crear = (r.result.tools as { name: string; inputSchema: Record<string, unknown> }[]).find(
      (t) => t.name === "blocks__crear-pagina"
    )!;
    expect(Object.keys(crear.inputSchema.properties as object)).toEqual(
      expect.arrayContaining(["body", "idempotency_key"])
    );
  });

  it("tools/call con scope: ejecuta la operación (y la idempotencia del A1 la protege)", async () => {
    if (!dbAvailable) return;
    const editor = await sesionMcp(["mcp:connect", "contenido:editar"]);
    const slug = `mcp-${generateTestId()}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");
    const args = {
      body: { title: "Creada por MCP", slug },
      idempotency_key: `mcp-${generateTestId()}`,
    };

    const r1 = await rpc(editor, "tools/call", { name: "blocks__crear-pagina", arguments: args });
    expect(r1.result.isError, JSON.stringify(r1.result).slice(0, 500)).toBeUndefined();
    expect(r1.result.structuredContent.status).toBe(201);
    expect(r1.result.structuredContent.data.slug).toBe(slug);

    const r2 = await rpc(editor, "tools/call", { name: "blocks__crear-pagina", arguments: args });
    expect(r2.result.structuredContent.idempotentReplayed).toBe(true);
    expect(r2.result.structuredContent.data.id).toBe(r1.result.structuredContent.data.id);

    const { pages } = await import("../../../../packages/core/blocks/blocks.schema");
    const filas = await db.select({ id: pages.id }).from(pages).where(eq(pages.slug, slug));
    expect(filas.length).toBe(1);

    // Y la lectura generada también
    const tipos = await rpc(editor, "tools/call", { name: "blocks__tipos-de-bloque", arguments: {} });
    expect(tipos.result.structuredContent.data.blockTypes.length).toBeGreaterThan(5);
  });

  it("tools/call SIN el scope: KITSUDEN_E_FORBIDDEN y no se crea nada", async () => {
    if (!dbAvailable) return;
    const lector = await sesionMcp(["mcp:connect"]);
    const slug = `mcp-no-${generateTestId()}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");

    const r = await rpc(lector, "tools/call", {
      name: "blocks__crear-pagina",
      arguments: { body: { title: "No debe existir", slug } },
    });
    expect(r.result.isError).toBe(true);
    expect(r.result.structuredContent.code).toBe("KITSUDEN_E_FORBIDDEN");
    expect(r.result.structuredContent.status).toBe(403);

    const { pages } = await import("../../../../packages/core/blocks/blocks.schema");
    expect((await db.select({ id: pages.id }).from(pages).where(eq(pages.slug, slug))).length).toBe(0);
  });

  it("allowedTools recorta lo que la sesión ve y lo que puede llamar", async () => {
    if (!dbAvailable) return;
    const recortado = await sesionMcp(["mcp:connect", "contenido:editar"], ["blocks__tipos-de-bloque"]);
    const lista = await herramientas(recortado);
    expect(lista).toContain("blocks__tipos-de-bloque");
    expect(lista).not.toContain("blocks__crear-pagina");

    const r = await rpc(recortado, "tools/call", {
      name: "blocks__crear-pagina",
      arguments: { body: { title: "x" } },
    });
    // La puerta de `allowedTools` es la de siempre de routes/mcp.ts: error JSON-RPC
    expect(r.error.code).toBe(-32602);
    expect(r.error.data.code).toBe("KITSUDEN_E_FORBIDDEN");
  });

  it("un argumento que no existe: KITSUDEN_E_VALIDATION con los válidos", async () => {
    if (!dbAvailable) return;
    const editor = await sesionMcp(["mcp:connect", "contenido:editar"]);
    const r = await rpc(editor, "tools/call", {
      name: "blocks__crear-pagina",
      arguments: { title: "el cuerpo va en body" },
    });
    expect(r.result.isError).toBe(true);
    expect(r.result.structuredContent.code).toBe("KITSUDEN_E_VALIDATION");
    expect(JSON.stringify(r.result.structuredContent)).toContain("body");
  });
});

/**
 * Guía por operación (`guia` del SDK) y auditoría de cada `tools/call`:
 *
 *   · quien ve `blog__crear-entrada` ve también su guía como recurso
 *     `kitsuden://guia/blog__crear-entrada`, y la lee en markdown;
 *   · quien no la ve no tiene el recurso (se responde como si no existiera);
 *   · una llamada fallida queda en `agent_audit_logs` (`tool_call`) con el
 *     código y las claves inventadas, y SIN los valores de los argumentos.
 */
describe("MCP: guía por operación y auditoría de llamadas", () => {
  const URI = "kitsuden://guia/blog__crear-entrada";

  beforeAll(async () => {
    dbAvailable = await isDatabaseAvailable();
  });
  afterAll(async () => {
    for (const s of abiertas) await s.cerrar();
  });

  itConBlog("resources/list y resources/read: la guía de quien ve la herramienta", async () => {
    if (!dbAvailable) return;
    const redactor = await sesionMcp(["mcp:connect", "blog:*"]);
    expect(await herramientas(redactor)).toContain("blog__crear-entrada");

    const lista = await rpc(redactor, "resources/list", {});
    const uris = (lista.result.resources as { uri: string }[]).map((r) => r.uri);
    expect(uris).toContain(URI);

    const leida = await rpc(redactor, "resources/read", { uri: URI });
    const [contenido] = leida.result.contents as { uri: string; mimeType: string; text: string }[];
    expect(contenido!.mimeType).toBe("text/markdown");
    expect(contenido!.text).toContain("## When to use");
    expect(contenido!.text).toContain("blog__editar-entrada");
    expect(contenido!.text).toContain("tagIds");
    expect(contenido!.text).toContain("## Examples");

    // La descripción de la herramienta apunta al recurso
    const tools = (await rpc(redactor, "tools/list", {})).result.tools as { name: string; description: string }[];
    expect(tools.find((t) => t.name === "blog__crear-entrada")!.description).toContain(URI);
  });

  it("sin acceso a la herramienta, la guía no existe para la sesión", async () => {
    if (!dbAvailable) return;
    const ajeno = await sesionMcp(["mcp:connect"]);
    expect(await herramientas(ajeno)).not.toContain("blog__crear-entrada");

    const lista = await rpc(ajeno, "resources/list", {});
    expect((lista.result.resources as { uri: string }[]).map((r) => r.uri)).not.toContain(URI);

    const leida = await rpc(ajeno, "resources/read", { uri: URI });
    expect(leida.error.code).toBe(-32002);
  });

  itConBlog("tools/call queda en agent_audit_logs con el código y las claves, sin valores", async () => {
    if (!dbAvailable) return;
    const redactor = await sesionMcp(["mcp:connect", "blog:*"]);
    const secreto = `no-guardar-${generateTestId()}`;

    const r = await rpc(redactor, "tools/call", {
      name: "blog__crear-entrada",
      arguments: { tags: [secreto], body: { title: secreto } },
    });
    expect(r.result.isError).toBe(true);
    expect(r.result.structuredContent.code).toBe("KITSUDEN_E_VALIDATION");

    // La auditoría es asíncrona (no retrasa la respuesta): se espera un poco
    const filtro = and(
      eq(agentAuditLogs.agentId, redactor.agentId),
      eq(agentAuditLogs.action, "tool_call"),
      eq(agentAuditLogs.resource, "blog__crear-entrada")
    );
    let filas: (typeof agentAuditLogs.$inferSelect)[] = [];
    for (let i = 0; i < 40 && filas.length === 0; i++) {
      filas = await db.select().from(agentAuditLogs).where(filtro);
      if (filas.length === 0) await new Promise((ok) => setTimeout(ok, 50));
    }
    expect(filas.length).toBe(1);
    const fila = filas[0]!;
    expect(fila.success).toBe(false);
    expect(fila.errorMessage).toBe("KITSUDEN_E_VALIDATION");
    expect(fila.details).toMatchObject({
      origen: "mcp",
      exito: false,
      codigo: "KITSUDEN_E_VALIDATION",
      clavesDesconocidas: ["tags"],
      argumentos: ["body", "tags"],
    });
    expect(JSON.stringify(fila)).not.toContain(secreto);
  });
});
