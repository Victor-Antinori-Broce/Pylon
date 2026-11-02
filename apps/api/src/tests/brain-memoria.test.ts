/**
 * Agent memory (brain) over MCP, with an owner — against the REAL app
 * ============================================================================
 *
 * Real agents (`createAgent`) open MCP sessions and call the GENERATED tools
 * (`brain_search`, `brain_read`, `brain_note_write`…):
 *
 *   · without a brain scope the tools are not listed, and calling one is
 *     KITSUDEN_E_FORBIDDEN; `brain:read` lists reads but not writes;
 *   · one agent does NOT see another's private notes (list, read, search,
 *     claims, export), sees shared ones, and still cannot delete them;
 *   · `brain_note_write` is idempotent by key (same content = unchanged);
 *   · claims go stale when their source is re-captured with another hash,
 *     and `brain_claim_verify` with rebind makes them fresh again;
 *   · the graphify importer keeps EXTRACTED / INFERRED and rejects an
 *     unknown schema_version;
 *   · and the RLS policies alone (as kitsuden_app, without the app filter)
 *     isolate the rows too.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { inArray, sql } from "drizzle-orm";

import { db } from "../db";
import { brainNotes } from "../db/schema";
import { app } from "../index";
import { createAgent } from "../services/agent-auth";

import { asegurarRolDeApp, isDatabaseAvailable, generateTestId } from "./setup";

let dbAvailable = false;

interface Sesion {
  agentId: string;
  token: string;
  sessionId: string;
  cerrar: () => Promise<void>;
}

const abiertas: Sesion[] = [];
const notasCreadas: string[] = [];

async function sesionMcp(scopes: string[]): Promise<Sesion> {
  const { agent, plainApiKey } = await createAgent({
    name: `brain-${scopes.join("+")}-${generateTestId()}`,
    scopes,
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
  const s: Sesion = {
    agentId: agent.id,
    token: plainApiKey,
    sessionId,
    cerrar: () => lector.cancel().catch(() => {}),
  };
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- resultado de herramienta
async function llamar(s: Sesion, name: string, args: Record<string, unknown> = {}): Promise<any> {
  const r = await rpc(s, "tools/call", { name, arguments: args });
  return r.result;
}

async function herramientas(s: Sesion): Promise<string[]> {
  const r = await rpc(s, "tools/list", {});
  return (r.result.tools as { name: string }[]).map((t) => t.name);
}

const LECTURA = ["brain_search", "brain_read", "brain_list", "brain_connections", "brain_claims", "brain_export_okf"];
const ESCRITURA = [
  "brain_note_write",
  "brain_note_delete",
  "brain_connect",
  "brain_claim_add",
  "brain_claim_verify",
  "brain_lint",
  "brain_import_graphify",
];

async function escribir(s: Sesion, body: Record<string, unknown>) {
  const r = await llamar(s, "brain_note_write", { body });
  expect(r.isError, JSON.stringify(r).slice(0, 600)).toBeUndefined();
  const nota = r.structuredContent.data.note;
  notasCreadas.push(nota.id);
  return r.structuredContent;
}

describe("brain over MCP: tools, scopes and owners", () => {
  beforeAll(async () => {
    dbAvailable = await isDatabaseAvailable();
    if (dbAvailable) await asegurarRolDeApp();
  });
  afterAll(async () => {
    for (const s of abiertas) await s.cerrar();
    if (dbAvailable && notasCreadas.length) {
      await db.delete(brainNotes).where(inArray(brainNotes.id, notasCreadas));
    }
  });

  it("tools/list and tools/call follow brain:read / brain:write", async () => {
    if (!dbAvailable) return;
    const nadie = await sesionMcp(["mcp:connect"]);
    const lector = await sesionMcp(["mcp:connect", "brain:read"]);
    const escritor = await sesionMcp(["mcp:connect", "brain:write"]);

    const deNadie = await herramientas(nadie);
    for (const t of [...LECTURA, ...ESCRITURA]) expect(deNadie).not.toContain(t);

    const delLector = await herramientas(lector);
    for (const t of LECTURA) expect(delLector).toContain(t);
    for (const t of ESCRITURA) expect(delLector).not.toContain(t);

    const delEscritor = await herramientas(escritor);
    for (const t of [...LECTURA, ...ESCRITURA]) expect(delEscritor).toContain(t);

    // Calling without the scope: forbidden, not executed.
    const sinScope = await llamar(nadie, "brain_search", { q: "anything" });
    expect(sinScope.isError).toBe(true);
    expect(JSON.stringify(sinScope)).toContain("KITSUDEN_E_FORBIDDEN");
    const lectorEscribe = await llamar(lector, "brain_note_write", {
      body: { key: "x", title: "x", content: "x" },
    });
    expect(lectorEscribe.isError).toBe(true);
    expect(JSON.stringify(lectorEscribe)).toContain("KITSUDEN_E_FORBIDDEN");

    // With the scope: it runs, and the response says the vectors are lexical.
    const busca = await llamar(lector, "brain_search", { q: "anything" });
    expect(busca.isError).toBeUndefined();
    expect(busca.structuredContent.data.embedding.mode).toBe("lexical");
  });

  it("one agent does not see another's private notes; shared ones are readable, not writable", async () => {
    if (!dbAvailable) return;
    const a = await sesionMcp(["mcp:connect", "brain:write"]);
    const b = await sesionMcp(["mcp:connect", "brain:write"]);
    const marca = `zq${generateTestId().replace(/[^a-z0-9]/gi, "").toLowerCase()}`;

    const privada = (
      await escribir(a, { key: `p/${marca}`, title: `Private ${marca}`, content: `secret ${marca} plans` })
    ).data.note;
    expect(privada.visibility).toBe("private");
    expect(privada.owner.agentId).toBe(a.agentId);
    const compartida = (
      await escribir(a, {
        key: `s/${marca}`,
        title: `Shared ${marca}`,
        content: `team ${marca} notes`,
        visibility: "shared",
      })
    ).data.note;

    // B: read → 404, list → absent, search → absent
    const leer = await llamar(b, "brain_read", { id: privada.id });
    expect(leer.isError).toBe(true);
    expect(JSON.stringify(leer)).toContain("KITSUDEN_E_NOT_FOUND");
    const lista = await llamar(b, "brain_list", { limit: 200 });
    const ids = (lista.structuredContent.data.notes as { id: string }[]).map((n) => n.id);
    expect(ids).not.toContain(privada.id);
    expect(ids).toContain(compartida.id);
    const busca = await llamar(b, "brain_search", { q: marca, threshold: 0 });
    const encontradas = (busca.structuredContent.data.hits as { note: { id: string } }[]).map((h) => h.note.id);
    expect(encontradas).not.toContain(privada.id);
    expect(encontradas).toContain(compartida.id);

    // A sees both
    const deA = await llamar(a, "brain_search", { q: marca, threshold: 0 });
    const idsA = (deA.structuredContent.data.hits as { note: { id: string } }[]).map((h) => h.note.id);
    expect(idsA).toEqual(expect.arrayContaining([privada.id, compartida.id]));

    // B cannot delete A's shared note, nor write over it (its key is B's own note)
    const borra = await llamar(b, "brain_note_delete", { id: compartida.id });
    expect(borra.isError).toBe(true);
    expect(JSON.stringify(borra)).toContain("KITSUDEN_E_FORBIDDEN");
    const mismaClave = await escribir(b, { key: `s/${marca}`, title: "B's", content: "other" });
    expect(mismaClave.data.outcome).toBe("created");
    expect(mismaClave.data.note.id).not.toBe(compartida.id);

    // Exports and claims follow the same rule
    const okf = await llamar(b, "brain_export_okf", { noteIds: `${privada.id},${compartida.id}` });
    expect(okf.structuredContent.data.notes).toBe(1);
    expect(okf.structuredContent.data.files[0].content).toContain('okf_version: "0.2"');

    // The owner deletes its own
    const borraA = await llamar(a, "brain_note_delete", { id: privada.id });
    expect(borraA.isError, JSON.stringify(borraA).slice(0, 400)).toBeUndefined();
    expect(borraA.structuredContent.status).toBe(204);
  });

  it("brain_note_write is idempotent by key", async () => {
    if (!dbAvailable) return;
    const a = await sesionMcp(["mcp:connect", "brain:write"]);
    const body = { key: `idem/${generateTestId()}`, title: "Idem", content: "same content" };
    const r1 = await escribir(a, body);
    const r2 = await escribir(a, body);
    expect(r1.status).toBe(201);
    expect(r1.data.outcome).toBe("created");
    expect(r2.status).toBe(200);
    expect(r2.data.outcome).toBe("unchanged");
    expect(r2.data.note.id).toBe(r1.data.note.id);
    expect(r2.data.note.updatedAt).toBe(r1.data.note.updatedAt);
    const r3 = await escribir(a, { ...body, content: "new content" });
    expect(r3.data.outcome).toBe("updated");
    expect(r3.data.note.id).toBe(r1.data.note.id);
  });

  it("claims: stale when the source changes, fresh again after rebind; lint persists it", async () => {
    if (!dbAvailable) return;
    const a = await sesionMcp(["mcp:connect", "brain:write"]);
    const b = await sesionMcp(["mcp:connect", "brain:write"]);
    const uri = `file:///docs/${generateTestId()}.md`;
    const nota = (await escribir(a, { key: `c/${generateTestId()}`, title: "Ports", content: "API port" })).data.note;

    const add = await llamar(a, "brain_claim_add", {
      body: {
        noteId: nota.id,
        statement: "The API listens on 3000",
        source: { title: "README", content: "line one\nThe API listens on 3000\n", uri },
        range: { unit: "line", start: 2, end: 2 },
      },
    });
    expect(add.isError, JSON.stringify(add).slice(0, 600)).toBeUndefined();
    const claim = add.structuredContent.data.claim;
    expect(claim.status).toBe("fresh");
    expect(claim.source.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(add)).not.toContain("line one"); // never the source content
    // Idempotent
    const again = await llamar(a, "brain_claim_add", {
      body: {
        noteId: nota.id,
        statement: "The API listens on 3000",
        source: { title: "README", content: "line one\nThe API listens on 3000\n", uri },
        range: { unit: "line", start: 2, end: 2 },
      },
    });
    expect(again.structuredContent.data.created).toBe(false);
    expect(again.structuredContent.data.claim.id).toBe(claim.id);

    // B may not add claims to A's note (it cannot even see it)
    const ajena = await llamar(b, "brain_claim_add", {
      body: { noteId: nota.id, statement: "x", source: { title: "t", content: "c" } },
    });
    expect(ajena.isError).toBe(true);

    // The document changes: a new capture with the same uri
    const otraNota = (await escribir(a, { key: `c2/${generateTestId()}`, title: "tmp", content: "tmp" })).data.note;
    await llamar(a, "brain_claim_add", {
      body: {
        noteId: otraNota.id,
        statement: "Port moved",
        source: { title: "README", content: "line one\nThe API listens on 4000\n", uri },
      },
    });
    const lint = await llamar(a, "brain_lint", {});
    expect(lint.isError, JSON.stringify(lint).slice(0, 400)).toBeUndefined();
    const stale = lint.structuredContent.data.stale as { claimId: string; reason: string }[];
    expect(stale.map((s) => s.claimId)).toContain(claim.id);
    expect(stale.find((s) => s.claimId === claim.id)!.reason).toContain("source changed");
    const listado = await llamar(a, "brain_claims", { noteId: nota.id });
    expect(listado.structuredContent.data.claims[0].status).toBe("stale");

    const sinRebind = await llamar(a, "brain_claim_verify", { id: claim.id, body: {} });
    expect(sinRebind.structuredContent.data.check.status).toBe("stale");
    const conRebind = await llamar(a, "brain_claim_verify", { id: claim.id, body: { rebind: true } });
    expect(conRebind.structuredContent.data.rebound).toBe(true);
    expect(conRebind.structuredContent.data.claim.status).toBe("fresh");
    expect(conRebind.structuredContent.data.claim.verifiedBy).toBe(`agent:${a.agentId}`);
    notasCreadas.push(otraNota.id);
  });

  it("graphify import keeps EXTRACTED/INFERRED, is idempotent and checks schema_version", async () => {
    if (!dbAvailable) return;
    const a = await sesionMcp(["mcp:connect", "brain:write"]);
    const ns = `t${generateTestId().replace(/[^a-z0-9]/gi, "").toLowerCase()}`.slice(0, 40);
    const graph = {
      directed: false,
      multigraph: false,
      graph: {},
      nodes: [
        { id: "app_main", label: "main.py", file_type: "code", source_file: "app/main.py", source_location: "L1" },
        { id: "app_db", label: "db.py", file_type: "code", source_file: "app/db.py" },
        { id: "doc_arch", label: "Architecture", file_type: "document" },
      ],
      links: [
        { source: "app_main", target: "app_db", relation: "imports_from", confidence: "EXTRACTED", confidence_score: 1 },
        { source: "app_db", target: "doc_arch", relation: "conceptually_related_to", confidence: "INFERRED", confidence_score: 0.7 },
        { source: "app_main", target: "doc_arch", relation: "references", confidence: "AMBIGUOUS", confidence_score: 0.3 },
        { source: "app_main", target: "nope", relation: "calls", confidence: "EXTRACTED" },
      ],
      hyperedges: [],
    };
    const r1 = await llamar(a, "brain_import_graphify", { body: { namespace: ns, graph } });
    expect(r1.isError, JSON.stringify(r1).slice(0, 800)).toBeUndefined();
    const rep = r1.structuredContent.data;
    expect(rep.notes.created).toBe(3);
    expect(rep.connections).toMatchObject({ created: 3, extracted: 1, inferred: 2 });
    expect(rep.warnings.join(" ")).toContain("legacy");

    const r2 = await llamar(a, "brain_import_graphify", { body: { namespace: ns, graph } });
    expect(r2.structuredContent.data.notes).toMatchObject({ created: 0, unchanged: 3 });
    expect(r2.structuredContent.data.connections).toMatchObject({ created: 0, existing: 3 });

    const notas = await llamar(a, "brain_list", { keyPrefix: `graphify:${ns}:`, mine: "true" });
    const lista = notas.structuredContent.data.notes as { id: string; key: string }[];
    expect(lista).toHaveLength(3);
    notasCreadas.push(...lista.map((n) => n.id));
    const main = lista.find((n) => n.key === `graphify:${ns}:app_main`)!;
    const con = await llamar(a, "brain_connections", { id: main.id });
    const porRel = Object.fromEntries(
      (con.structuredContent.data.connections as { relationType: string; origin: string; confidence: number; metadata: Record<string, unknown> }[]).map(
        (c) => [c.relationType, c]
      )
    );
    expect(porRel.imports_from.origin).toBe("EXTRACTED");
    expect(porRel.imports_from.confidence).toBe(1);
    expect(porRel.references.origin).toBe("INFERRED");
    expect(porRel.references.metadata.ambiguous).toBe(true);

    const raro = await llamar(a, "brain_import_graphify", {
      body: { namespace: ns, graph: { ...graph, graph: { schema_version: 99 } } },
    });
    expect(raro.isError).toBe(true);
    expect(JSON.stringify(raro)).toContain("KITSUDEN_E_VALIDATION");
    const v1 = await llamar(a, "brain_import_graphify", {
      body: { namespace: ns, graph: { ...graph, graph: { schema_version: 1, graphify_version: "0.9.99" } } },
    });
    expect(v1.isError).toBeUndefined();
    expect(v1.structuredContent.data.graphifyVersion).toBe("0.9.99");
  });

  it("RLS alone (kitsuden_app, no app filter) isolates notes between agents", async () => {
    if (!dbAvailable) return;
    const marca = `rls-${generateTestId()}`;
    const [fila] = await db
      .insert(brainNotes)
      .values({
        title: marca,
        content: "x",
        ownerAgentId: "agent-rls-a",
        visibility: "private",
        noteKey: marca,
      })
      .returning({ id: brainNotes.id });
    notasCreadas.push(fila!.id);
    const como = async (id: string, rol: string): Promise<number> =>
      db.transaction(async (tx) => {
        const su = await tx.execute(sql`SELECT current_setting('is_superuser') AS su`);
        if ((su.rows[0] as { su: string }).su === "on") await tx.execute(sql`SET LOCAL ROLE kitsuden_app`);
        await tx.execute(sql`SELECT set_config('app.current_user_id', ${id}, true)`);
        await tx.execute(sql`SELECT set_config('app.current_user_role', ${rol}, true)`);
        const r = await tx.execute(sql`SELECT count(*)::int AS n FROM brain_notes WHERE note_key = ${marca}`);
        return (r.rows[0] as { n: number }).n;
      });
    expect(await como("agent-rls-a", "agent")).toBe(1);
    expect(await como("agent-rls-b", "agent")).toBe(0);
    expect(await como("some-editor", "editor")).toBe(0);
    expect(await como("", "anonymous")).toBe(0);
    expect(await como("some-admin", "admin")).toBe(1);
    // An agent cannot insert a note owned by another agent. The failing
    // INSERT goes in a SAVEPOINT (an error must not abort the transaction:
    // docs/install/kon-transactions.md), and the outcome is returned.
    const ajena = await db.transaction(async (tx) => {
      const su = await tx.execute(sql`SELECT current_setting('is_superuser') AS su`);
      if ((su.rows[0] as { su: string }).su === "on") await tx.execute(sql`SET LOCAL ROLE kitsuden_app`);
      await tx.execute(sql`SELECT set_config('app.current_user_id', 'agent-rls-b', true)`);
      await tx.execute(sql`SELECT set_config('app.current_user_role', 'agent', true)`);
      try {
        await tx.transaction(async (sp) => {
          await sp.execute(
            sql`INSERT INTO brain_notes (title, content, owner_agent_id) VALUES ('forged', 'x', 'agent-rls-a')`
          );
        });
        return "inserted";
      } catch (e) {
        return String((e as { cause?: { code?: string } }).cause?.code ?? e);
      }
    });
    expect(ajena).toBe("42501"); // insufficient_privilege: the policy's WITH CHECK
  });
});
