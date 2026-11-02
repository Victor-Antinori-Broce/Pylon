/**
 * Fase F (decisión del propietario, 2026-10-26): una subida de IMÁGENES de un
 * agente puede quedar como propuesta
 * ============================================================================
 *
 * Contra la app REAL (Postgres de pruebas, kon-media del núcleo), un agente
 * real en modo `propose` y cuentas humanas reales:
 *
 *   · sube una imagen (multipart) → 202 + propuesta; NO llega a la mediateca;
 *     los bytes esperan en `agent_proposal_files`, fuera de `/media`;
 *   · la miniatura sale solo por la ruta del equipo (anónimo 401; usuario,
 *     agente y agente con `admin`, 403), con su tipo real y sin caché;
 *   · aprobar → el formulario se reconstruye y se ejecuta con la identidad
 *     del agente: la imagen aparece en la mediateca y los bytes retenidos se
 *     borran; rechazar o caducar → se borran y no se sube nada;
 *   · lo que NO se retiene (403 KITSUDEN_E_APPROVAL_UNSUPPORTED): un fichero
 *     que no es imagen por su CONTENIDO (aunque se llame .png y diga
 *     image/png), un campo de texto con un secreto, una imagen más grande que
 *     `APPROVALS_MAX_UPLOAD_MB` y un cuerpo que no es JSON ni subida;
 *   · un reintento idéntico (otro boundary) es la MISMA propuesta.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { eq, inArray } from "drizzle-orm";

import { media } from "../../../../packages/core/media/media.schema";
import { db } from "../db";
import { agentIdentities, agentProposalFiles, agentProposals, approvalSettings } from "../db/schema";
import { app } from "../index";
import { caducarPropuestas, invalidarConfigDeAprobaciones } from "../lib/aprobaciones";
import { vaciarMemoriaDeCuotas } from "../lib/cuotas-de-agente";
import { createAgent } from "../services/agent-auth";

import { entrarComo, generateTestId, isDatabaseAvailable } from "./setup";

const ORIGEN = "http://localhost:4321";
let dbAvailable = false;
let admin = { cookie: "", userId: "" };
let editor = { cookie: "", userId: "" };
let usuario = { cookie: "", userId: "" };
const agentesCreados: string[] = [];

/** PNG de 1×1 de verdad (firma + IHDR + IDAT + IEND). */
const PNG = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="),
  (ch) => ch.charCodeAt(0)
);

async function agente(scopes: string[]): Promise<{ id: string; token: string }> {
  const { agent, plainApiKey } = await createAgent({ name: `img-${generateTestId()}`, scopes, rateLimit: 100_000 });
  agentesCreados.push(agent.id);
  return { id: agent.id, token: plainApiKey };
}

async function pedir(
  metodo: string,
  camino: string,
  o: { token?: string; cookie?: string; cuerpo?: unknown; form?: FormData; crudo?: { tipo: string; texto: string } } = {}
): Promise<Response> {
  const headers: Record<string, string> = { origin: ORIGEN };
  if (o.token) headers.Authorization = `Bearer ${o.token}`;
  if (o.cookie) headers.Cookie = o.cookie;
  let body: string | FormData | undefined;
  if (o.form) body = o.form;
  else if (o.crudo) {
    headers["Content-Type"] = o.crudo.tipo;
    body = o.crudo.texto;
  } else if (o.cuerpo !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(o.cuerpo);
  }
  return app.request(new Request(`http://localhost:3000${camino}`, { method: metodo, headers, body }));
}

const comoAdmin = (metodo: string, camino: string, cuerpo?: unknown) =>
  pedir(metodo, camino, { cookie: admin.cookie, cuerpo });

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- cuerpos JSON leídos en la prueba
async function json(r: Response): Promise<any> {
  return r.json();
}

function formulario(nombre: string, bytes: Uint8Array, tipo = "image/png", extra: Record<string, string> = {}) {
  const f = new FormData();
  for (const [k, v] of Object.entries(extra)) f.append(k, v);
  f.append("files", new File([bytes], nombre, { type: tipo }));
  return f;
}

async function enMediateca(nombre: string): Promise<number> {
  return (await db.select({ id: media.id }).from(media).where(eq(media.originalName, nombre))).length;
}

async function retenidos(proposalId: string): Promise<number> {
  return (await db.select({ id: agentProposalFiles.id }).from(agentProposalFiles).where(eq(agentProposalFiles.proposalId, proposalId))).length;
}

describe("Fase F — subidas de imágenes como propuesta", () => {
  let a = { id: "", token: "" };

  beforeAll(async () => {
    dbAvailable = await isDatabaseAvailable();
    if (!dbAvailable) return;
    vaciarMemoriaDeCuotas();
    admin = await entrarComo(app, {
      email: `img-admin-${generateTestId()}@example.com`,
      password: "TestPassword123!",
      name: "Aprobadora",
      role: "admin",
    });
    editor = await entrarComo(app, {
      email: `img-editor-${generateTestId()}@example.com`,
      password: "TestPassword123!",
      name: "Editora",
      role: "editor",
    });
    usuario = await entrarComo(app, {
      email: `img-user-${generateTestId()}@example.com`,
      password: "TestPassword123!",
      name: "Usuaria",
      role: "user",
    });
    await db.delete(approvalSettings);
    invalidarConfigDeAprobaciones();
    const r = await comoAdmin("PUT", "/api/approvals/settings", { enabled: true });
    expect(r.status, await r.clone().text()).toBe(200);
    a = await agente(["kon:media:subir-medios"]);
    const m = await comoAdmin("PUT", `/api/approvals/agents/${a.id}/mode`, { mode: "propose" });
    expect(m.status, await m.clone().text()).toBe(200);
  });

  afterAll(async () => {
    if (!dbAvailable) return;
    await db.delete(approvalSettings);
    if (agentesCreados.length) {
      await db.update(agentIdentities).set({ approvalMode: "inherit" }).where(inArray(agentIdentities.id, agentesCreados));
    }
    invalidarConfigDeAprobaciones();
  });

  it("subir una imagen → 202 y propuesta; no llega a la mediateca; la miniatura es solo del equipo", async () => {
    if (!dbAvailable) return;
    const nombre = `aprobada-${generateTestId()}.png`;
    const r = await pedir("POST", "/api/media/upload", { token: a.token, form: formulario(nombre, PNG, "image/png", { alt: "Portada" }) });
    expect(r.status, await r.clone().text()).toBe(202);
    const cuerpo = await json(r);
    expect(cuerpo.code).toBe("KITSUDEN_E_APPROVAL_REQUIRED");
    const pid = cuerpo.proposal.id as string;

    // Nada público todavía: ni fila en la mediateca ni fichero servido.
    expect(await enMediateca(nombre)).toBe(0);
    expect(await retenidos(pid)).toBe(1);
    const [p] = await db.select().from(agentProposals).where(eq(agentProposals.id, pid));
    expect(p!.contentType).toBe("multipart/form-data");
    expect(JSON.stringify(p!.body)).not.toContain("base64");
    expect((p!.body as { files: unknown[] }).files.length).toBe(1);

    // El detalle enseña el fichero; la miniatura: solo personal humano.
    const detalle = await json(await pedir("GET", `/api/approvals/proposals/${pid}`, { cookie: editor.cookie }));
    expect(detalle.files.length).toBe(1);
    expect(detalle.files[0].mimeType).toBe("image/png");
    const ruta = `/api/approvals/proposals/${pid}/files/${detalle.files[0].id}`;
    const img = await pedir("GET", ruta, { cookie: editor.cookie });
    expect(img.status).toBe(200);
    expect(img.headers.get("content-type")).toBe("image/png");
    expect(img.headers.get("cache-control")).toContain("no-store");
    expect(img.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await img.arrayBuffer())).toEqual(PNG);
    expect((await pedir("GET", ruta)).status).toBe(401);
    expect((await pedir("GET", ruta, { cookie: usuario.cookie })).status).toBe(403);
    expect((await pedir("GET", ruta, { token: a.token })).status).toBe(403);
    const jefe = await agente(["admin"]);
    expect((await pedir("GET", ruta, { token: jefe.token })).status).toBe(403);

    // Aprobar: se ejecuta con la identidad del agente y aparece en la mediateca.
    const ok = await json(await comoAdmin("POST", `/api/approvals/proposals/${pid}/approve`, {}));
    expect(ok.proposal.status, JSON.stringify(ok.proposal.result)).toBe("executed");
    expect(ok.proposal.result.status, JSON.stringify(ok.proposal.result)).toBe(201);
    expect(await enMediateca(nombre)).toBe(1);
    const [fila] = await db.select().from(media).where(eq(media.originalName, nombre));
    expect(fila!.mimeType).toBe("image/png");
    // Un agente no es una cuenta: sin firmante, la subida no tiene autor humano
    // y el agente queda en metadata.agentId (antes el INSERT fallaba).
    expect(fila!.createdById).toBeNull();
    expect((fila!.metadata as { agentId?: string }).agentId).toBe(a.id);
    // Lo retenido se borró: la miniatura ya no existe.
    expect(await retenidos(pid)).toBe(0);
    expect((await pedir("GET", ruta, { cookie: editor.cookie })).status).toBe(404);
  });

  it("rechazar → los bytes retenidos se borran y no se sube nada", async () => {
    if (!dbAvailable) return;
    const nombre = `rechazada-${generateTestId()}.png`;
    const r = await pedir("POST", "/api/media/upload", { token: a.token, form: formulario(nombre, PNG) });
    expect(r.status).toBe(202);
    const pid = (await json(r)).proposal.id as string;
    expect(await retenidos(pid)).toBe(1);
    const no = await pedir("POST", `/api/approvals/proposals/${pid}/reject`, { cookie: editor.cookie, cuerpo: { comment: "no" } });
    expect(no.status, await no.clone().text()).toBe(200);
    expect(await retenidos(pid)).toBe(0);
    expect(await enMediateca(nombre)).toBe(0);
  });

  it("caducar → los bytes retenidos se borran", async () => {
    if (!dbAvailable) return;
    const nombre = `caducada-${generateTestId()}.png`;
    const pid = (await json(await pedir("POST", "/api/media/upload", { token: a.token, form: formulario(nombre, PNG) }))).proposal.id as string;
    expect(await retenidos(pid)).toBe(1);
    await db.update(agentProposals).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(agentProposals.id, pid));
    expect(await caducarPropuestas()).toBeGreaterThan(0);
    expect(await retenidos(pid)).toBe(0);
    expect(await enMediateca(nombre)).toBe(0);
  });

  it("un reintento idéntico (otro boundary) es la MISMA propuesta", async () => {
    if (!dbAvailable) return;
    const nombre = `repetida-${generateTestId()}.png`;
    const p1 = (await json(await pedir("POST", "/api/media/upload", { token: a.token, form: formulario(nombre, PNG) }))).proposal.id;
    const p2 = (await json(await pedir("POST", "/api/media/upload", { token: a.token, form: formulario(nombre, PNG) }))).proposal.id;
    expect(p2).toBe(p1);
    expect(await retenidos(p1)).toBe(1);
  });

  it("lo que no es imagen por su CONTENIDO no se retiene, aunque diga image/png (403 not_image)", async () => {
    if (!dbAvailable) return;
    const html = new TextEncoder().encode("<html><script>alert(1)</script></html>");
    const pdf = new TextEncoder().encode("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n");
    for (const bytes of [html, pdf]) {
      const antes = (await db.select({ id: agentProposals.id }).from(agentProposals).where(eq(agentProposals.agentId, a.id))).length;
      const r = await pedir("POST", "/api/media/upload", { token: a.token, form: formulario(`falsa-${generateTestId()}.png`, bytes) });
      expect(r.status).toBe(403);
      const c = await json(r);
      expect(c.code).toBe("KITSUDEN_E_APPROVAL_UNSUPPORTED");
      expect(c.reason).toBe("not_image");
      const despues = (await db.select({ id: agentProposals.id }).from(agentProposals).where(eq(agentProposals.agentId, a.id))).length;
      expect(despues).toBe(antes);
    }
  });

  it("un campo de texto con un secreto no se retiene (403 secret)", async () => {
    if (!dbAvailable) return;
    const extras: Record<string, string>[] = [{ password: "hunter2-secreto" }, { alt: "kitsuden_agent_abcdefghijklmnop" }];
    for (const extra of extras) {
      const r = await pedir("POST", "/api/media/upload", {
        token: a.token,
        form: formulario(`secreta-${generateTestId()}.png`, PNG, "image/png", extra),
      });
      expect(r.status).toBe(403);
      expect((await json(r)).reason).toBe("secret");
    }
  });

  it("una imagen mayor que APPROVALS_MAX_UPLOAD_MB no se retiene (403 too_large)", async () => {
    if (!dbAvailable) return;
    const antes = process.env.APPROVALS_MAX_UPLOAD_MB;
    process.env.APPROVALS_MAX_UPLOAD_MB = "1";
    try {
      const grande = new Uint8Array(1024 * 1024 + 10);
      grande.set(PNG);
      const r = await pedir("POST", "/api/media/upload", { token: a.token, form: formulario(`grande-${generateTestId()}.png`, grande) });
      expect(r.status).toBe(403);
      expect((await json(r)).reason).toBe("too_large");
    } finally {
      if (antes === undefined) delete process.env.APPROVALS_MAX_UPLOAD_MB;
      else process.env.APPROVALS_MAX_UPLOAD_MB = antes;
    }
  });

  it("un agente en modo direct sube sin propuesta (antes el INSERT fallaba por created_by_id)", async () => {
    if (!dbAvailable) return;
    const d = await agente(["kon:media:subir-medios"]);
    const m = await comoAdmin("PUT", `/api/approvals/agents/${d.id}/mode`, { mode: "direct" });
    expect(m.status).toBe(200);
    const nombre = `directa-${generateTestId()}.png`;
    const r = await pedir("POST", "/api/media/upload", { token: d.token, form: formulario(nombre, PNG) });
    expect(r.status, await r.clone().text()).toBe(201);
    expect(await enMediateca(nombre)).toBe(1);
  });

  it("un cuerpo que no es JSON ni subida sigue sin retenerse (403 not_json)", async () => {
    if (!dbAvailable) return;
    const r = await pedir("POST", "/api/media/upload", { token: a.token, crudo: { tipo: "text/plain", texto: "hola" } });
    expect(r.status).toBe(403);
    expect((await json(r)).reason).toBe("not_json");
  });
});
