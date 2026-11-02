/**
 * Fase I: promoción de código escrito por agentes (suggestion / turbo)
 * ============================================================================
 *
 * Contra la app REAL (Postgres de pruebas con el rol de la app, sandbox de
 * QuickJS de verdad), agentes reales y cuentas humanas reales:
 *
 *   · suggestion → propuesta en la bandeja → un humano aprueba → activa (y la
 *     foto de lo que corría antes queda para volver);
 *   · turbo con todo en verde → activa sola;
 *   · cada respaldo de turbo → propuesta con su motivo: scopes nuevos, host
 *     nuevo, secretos / usuarios y roles / configuración de seguridad,
 *     operación sensible, prueba fallida o con error, escaneo fallido, acción
 *     nueva, tope global apagado;
 *   · un agente (ni con `admin`) no aprueba ni activa lo suyo; un editor no
 *     aprueba;
 *   · reenviar el mismo borrador no duplica nada;
 *   · con ENABLE_CODE_ACTIONS apagado las pruebas corren y la activación lo dice;
 *   · la vigilancia vuelve atrás sola con errores; un admin vuelve atrás a mano;
 *   · una base que cambió por debajo no se activa (stale_base);
 *   · RLS: un agente no ve los borradores de otro (ni con la política sola).
 */

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { eq, inArray, sql } from "drizzle-orm";

import { db } from "../db";
import { actions, agentAuditLogs, agentIdentities, agentProposals, approvalSettings, codeVersions } from "../db/schema";
import { app } from "../index";
import { _olvidarNegativos } from "../lib/promocion";
import { createAgent } from "../services/agent-auth";

import { asegurarRolDeApp, entrarComo, generateTestId, ipDePrueba, isDatabaseAvailable } from "./setup";

let dbAvailable = false;
const ORIGEN = "http://localhost:4321";
let admin = { cookie: "", userId: "" };
let editor = { cookie: "", userId: "" };
const agentes: string[] = [];
const accionesCreadas: string[] = [];

interface Ag {
  id: string;
  token: string;
}

interface VistaDeVersion {
  id: string;
  status: string;
  mode: string;
  versionNumber: number;
  contentHash: string;
  activatedBy: string | null;
  activationError: string | null;
  rollbackReason: string | null;
  previousVersionId: string | null;
  target: { actionId: string | null; slug: string };
  decision: { ruta: string; motivos: string[] };
  proposal: { id: string } | null;
  testReport: { total: number; passed: number; failed: number; errored: number; cases: { status: string; mismatches: string[] }[] };
  scanReport: { passed: boolean; findings: { rule: string; severity: string }[] };
  capabilityDiff: { scopesAdded: string[]; hostsAdded: string[]; newTarget: boolean };
  watch: { state?: string; executions?: number; errors?: number } | null;
}

async function agente(scopes: string[]): Promise<Ag> {
  const { agent, plainApiKey } = await createAgent({ name: `promo-${generateTestId()}`, scopes, rateLimit: 100_000 });
  agentes.push(agent.id);
  return { id: agent.id, token: plainApiKey };
}

async function pedir(
  auth: { cookie?: string; token?: string },
  metodo: string,
  camino: string,
  cuerpo?: unknown,
  cabeceras: Record<string, string> = {}
): Promise<Response> {
  const headers: Record<string, string> = { origin: ORIGEN, ...cabeceras };
  if (auth.cookie) headers.Cookie = auth.cookie;
  if (auth.token) headers.Authorization = `Bearer ${auth.token}`;
  if (cuerpo !== undefined) headers["Content-Type"] = "application/json";
  return app.request(
    new Request(`http://localhost:3000${camino}`, {
      method: metodo,
      headers,
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    })
  );
}

const comoAdmin = (metodo: string, camino: string, cuerpo?: unknown) => pedir({ cookie: admin.cookie }, metodo, camino, cuerpo);

async function json<T>(r: Response, estado: number | number[]): Promise<T> {
  const texto = await r.text();
  const estados = Array.isArray(estado) ? estado : [estado];
  expect(estados, texto.slice(0, 1500)).toContain(r.status);
  return JSON.parse(texto) as T;
}

const SUMA = "return { total: (event.a ?? 0) + (event.b ?? 0) };";
const PRUEBA_SUMA = [{ name: "adds", event: { a: 2, b: 3 }, expect: { result: { total: 5 } } }];

/** Una acción de código creada por el admin (como existiría antes de la fase I). */
async function accion(code = "return { v: 1 };", config: Record<string, unknown> = {}): Promise<{ id: string; slug: string }> {
  const slug = `promo-${generateTestId()}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const r = await comoAdmin("POST", "/api/actions", {
    name: slug,
    slug,
    type: "code",
    trigger: "manual",
    config: { code, ...config },
  });
  const a = await json<{ id: string }>(r, 201);
  accionesCreadas.push(a.id);
  return { id: a.id, slug };
}

async function codigoDe(id: string): Promise<{ code: string; status: string; config: Record<string, unknown> }> {
  const [a] = await db.select().from(actions).where(eq(actions.id, id)).limit(1);
  const config = (a!.config ?? {}) as Record<string, unknown>;
  return { code: String(config.code ?? ""), status: a!.status, config };
}

async function proponer(ag: Ag, cuerpo: Record<string, unknown>, estado: number | number[] = 201, cabeceras: Record<string, string> = {}) {
  const r = await pedir({ token: ag.token }, "POST", "/api/promotion/drafts", cuerpo, cabeceras);
  return json<{ version: VistaDeVersion; duplicate: boolean }>(r, estado);
}

async function configurar(cambio: Record<string, unknown>) {
  await json(await comoAdmin("PUT", "/api/approvals/promotion/settings", cambio), 200);
}

async function modo(agentId: string, m: "suggestion" | "turbo") {
  await json(await comoAdmin("PUT", `/api/approvals/promotion/agents/${agentId}/mode`, { mode: m }), 200);
}

interface SesionMcp {
  token: string;
  ip: string;
  sessionId: string;
  cerrar: () => void;
}
const sesiones: SesionMcp[] = [];

async function sesionMcp(ag: Ag): Promise<SesionMcp> {
  // Una IP de prueba por sesión: el limitador global es por IP y, con la suite
  // entera, las demás pruebas de MCP ya gastaron el minuto de «unknown».
  const ip = ipDePrueba();
  const res = await app.request(
    new Request("http://localhost:3000/api/mcp", { headers: { Authorization: `Bearer ${ag.token}`, "X-Forwarded-For": ip } })
  );
  expect(res.status).toBe(200);
  const lector = res.body!.getReader();
  let texto = "";
  while (!texto.includes("\n\n")) {
    const { value, done } = await lector.read();
    if (done) break;
    texto += new TextDecoder().decode(value);
  }
  const s: SesionMcp = {
    token: ag.token,
    ip,
    sessionId: texto.match(/sessionId=([a-zA-Z0-9-]+)/)![1]!,
    cerrar: () => void lector.cancel().catch(() => {}),
  };
  sesiones.push(s);
  return s;
}

let idRpc = 1;
async function rpc(s: SesionMcp, method: string, params: unknown): Promise<Record<string, unknown>> {
  const res = await app.request(
    new Request(`http://localhost:3000/api/mcp?sessionId=${s.sessionId}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${s.token}`, "Content-Type": "application/json", "X-Forwarded-For": s.ip },
      body: JSON.stringify({ jsonrpc: "2.0", id: idRpc++, method, params }),
    })
  );
  expect(res.status).toBe(200);
  return (await res.json()) as Record<string, unknown>;
}

async function leerVersion(id: string) {
  const [v] = await db.select().from(codeVersions).where(eq(codeVersions.id, id)).limit(1);
  return v!;
}

async function acciones(resourceId: string): Promise<string[]> {
  const filas = await db
    .select({ action: agentAuditLogs.action })
    .from(agentAuditLogs)
    .where(eq(agentAuditLogs.resourceId, resourceId));
  return filas.map((f) => f.action);
}

describe("promoción de código (fase I)", () => {
  let sugeridor: Ag;
  let turbo: Ag;
  let otro: Ag;
  let conAdmin: Ag;

  beforeAll(async () => {
    dbAvailable = await isDatabaseAvailable();
    if (!dbAvailable) return;
    await asegurarRolDeApp();
    admin = await entrarComo(app, {
      email: `promo-admin-${generateTestId()}@example.com`,
      password: "TestPassword123!",
      name: "Promo Admin",
      role: "admin",
    });
    editor = await entrarComo(app, {
      email: `promo-editor-${generateTestId()}@example.com`,
      password: "TestPassword123!",
      name: "Promo Editor",
      role: "editor",
    });
    sugeridor = await agente(["promotion:propose"]);
    turbo = await agente(["promotion:propose", "datasets:*:read"]);
    otro = await agente(["promotion:propose"]);
    conAdmin = await agente(["admin"]);
    await db.delete(approvalSettings).where(eq(approvalSettings.id, "code_promotion"));
  }, 120_000);

  afterAll(async () => {
    for (const s of sesiones) s.cerrar();
    if (!dbAvailable) return;
    delete process.env.ENABLE_CODE_ACTIONS;
    await db.delete(approvalSettings).where(eq(approvalSettings.id, "code_promotion"));
    if (agentes.length) {
      await db.delete(codeVersions).where(inArray(codeVersions.agentId, agentes));
      await db.delete(agentIdentities).where(inArray(agentIdentities.id, agentes));
    }
    if (accionesCreadas.length) {
      await db.delete(codeVersions).where(inArray(codeVersions.targetId, accionesCreadas));
      await db.delete(actions).where(inArray(actions.id, accionesCreadas));
    }
  });

  it("suggestion: propuesta → un humano aprueba en la bandeja → activa (y queda la foto de antes)", async () => {
    if (!dbAvailable) return;
    const a = await accion("return { v: 1 };");
    const { version: v, duplicate } = await proponer(sugeridor, {
      target: { actionId: a.id },
      code: SUMA,
      tests: PRUEBA_SUMA,
      description: "sum a and b",
    });
    expect(duplicate).toBe(false);
    expect(v.status).toBe("awaiting_approval");
    expect(v.mode).toBe("suggestion");
    expect(v.decision.ruta).toBe("proposal");
    expect(v.decision.motivos).toContain("suggestion_mode");
    expect(v.testReport.passed).toBe(1);
    expect(v.scanReport.passed).toBe(true);
    expect(v.proposal?.id).toBeTruthy();
    // Nada cambió aún en la acción.
    expect((await codigoDe(a.id)).code).toBe("return { v: 1 };");

    const [p] = await db.select().from(agentProposals).where(eq(agentProposals.id, v.proposal!.id));
    expect(p!.status).toBe("pending");
    expect(p!.agentId).toBe(sugeridor.id);
    expect(p!.path).toBe(`/api/promotion/versions/${v.id}/activate`);
    expect(p!.operationKey).toBe("kon:promotion:activar-version");

    // El agente sigue su estado por las dos vías.
    const leida = await json<{ version: VistaDeVersion; proposal: { status: string } }>(
      await pedir({ token: sugeridor.token }, "GET", `/api/promotion/drafts/${v.id}`),
      200
    );
    expect(leida.proposal.status).toBe("pending");

    // Aprobar en la bandeja de SIEMPRE (fase F): se ejecuta como el agente y activa.
    const ap = await json<{ proposal: { status: string } }>(
      await comoAdmin("POST", `/api/approvals/proposals/${v.proposal!.id}/approve`, { comment: "ok" }),
      200
    );
    expect(ap.proposal.status).toBe("executed");
    const activa = await leerVersion(v.id);
    expect(activa.status).toBe("active");
    expect(activa.activatedBy).toBe(admin.userId);
    expect(activa.watchUntil).toBeTruthy();
    const ahora = await codigoDe(a.id);
    expect(ahora.code).toBe(SUMA);
    expect((ahora.config.promotion as { versionId: string }).versionId).toBe(v.id);
    // Lo que corría antes: la versión `manual` que dejó el alta del admin.
    const foto = await leerVersion(activa.previousVersionId!);
    expect(foto.origin).toBe("manual");
    expect(foto.status).toBe("superseded");
    expect(foto.code).toBe("return { v: 1 };");

    const auditado = await acciones(v.id);
    expect(auditado).toContain("promotion_submitted");
    expect(auditado).toContain("promotion_activated");
    const [act] = await db
      .select()
      .from(agentAuditLogs)
      .where(sql`${agentAuditLogs.resourceId} = ${v.id} and ${agentAuditLogs.action} = 'promotion_activated'`);
    const d = act!.details as Record<string, unknown>;
    expect(d.by).toBe(admin.userId);
    expect(d.via).toBe("aprobacion");
    expect(d.contentHash).toBe(v.contentHash);
    expect(d.previousHash).toBe(foto.contentHash);

    // Y un admin vuelve atrás a mano: la foto vuelve a ser la activa.
    const vuelta = await json<{ version: VistaDeVersion }>(
      await comoAdmin("POST", `/api/approvals/promotion/versions/${v.id}/rollback`, { reason: "manual check" }),
      200
    );
    expect(vuelta.version.status).toBe("rolled_back");
    expect(vuelta.version.rollbackReason).toBe("manual check");
    expect((await codigoDe(a.id)).code).toBe("return { v: 1 };");
    expect((await leerVersion(foto.id)).status).toBe("active");
    expect(await acciones(v.id)).toContain("promotion_rolled_back");
    // Dos veces no: solo la activa vuelve atrás.
    await json(await comoAdmin("POST", `/api/approvals/promotion/versions/${v.id}/rollback`, { reason: "again" }), 409);
  }, 120_000);

  it("un agente (ni con admin) no aprueba ni activa lo suyo; un editor tampoco aprueba", async () => {
    if (!dbAvailable) return;
    const a = await accion();
    const { version: v } = await proponer(sugeridor, { target: { actionId: a.id }, code: SUMA, tests: PRUEBA_SUMA });
    const pid = v.proposal!.id;
    for (const ag of [sugeridor, conAdmin]) {
      expect((await pedir({ token: ag.token }, "POST", `/api/approvals/proposals/${pid}/approve`, {})).status).toBe(403);
      expect((await pedir({ token: ag.token }, "POST", `/api/approvals/promotion/versions/${v.id}/approve`, {})).status).toBe(403);
      expect((await pedir({ token: ag.token }, "POST", `/api/promotion/versions/${v.id}/activate`, {})).status).toBe(403);
      expect((await pedir({ token: ag.token }, "PUT", `/api/approvals/promotion/agents/${ag.id}/mode`, { mode: "turbo" })).status).toBe(403);
      expect((await pedir({ token: ag.token }, "PUT", "/api/approvals/promotion/settings", { turboAllowed: true })).status).toBe(403);
    }
    // Un editor entra en la bandeja pero no puede aprobar esto (ruta de admin).
    const ed = await pedir({ cookie: editor.cookie }, "POST", `/api/approvals/proposals/${pid}/approve`, {});
    expect(ed.status).toBe(403);
    expect((await pedir({ cookie: editor.cookie }, "POST", `/api/approvals/promotion/versions/${v.id}/approve`, {})).status).toBe(403);
    expect((await leerVersion(v.id)).status).toBe("awaiting_approval");
    expect((await codigoDe(a.id)).code).toBe("return { v: 1 };");
    // Rechazar (admin, por la ruta de la promoción): nunca se activa.
    const rec = await json<{ version: VistaDeVersion }>(
      await comoAdmin("POST", `/api/approvals/promotion/versions/${v.id}/reject`, { comment: "no" }),
      200
    );
    expect(rec.version.status).toBe("rejected");
    expect(await acciones(v.id)).toContain("promotion_rejected");
    expect((await codigoDe(a.id)).code).toBe("return { v: 1 };");
  }, 120_000);

  it("reenviar el mismo borrador no crea otro (con o sin Idempotency-Key)", async () => {
    if (!dbAvailable) return;
    const a = await accion();
    const cuerpo = { target: { actionId: a.id }, code: SUMA, tests: PRUEBA_SUMA };
    const primero = await proponer(sugeridor, cuerpo);
    const segundo = await proponer(sugeridor, cuerpo, 200);
    expect(segundo.duplicate).toBe(true);
    expect(segundo.version.id).toBe(primero.version.id);
    const clave = `promo-${generateTestId()}`;
    const tercero = await proponer(sugeridor, cuerpo, 200, { "Idempotency-Key": clave });
    expect(tercero.version.id).toBe(primero.version.id);
    const cuarto = await pedir({ token: sugeridor.token }, "POST", "/api/promotion/drafts", cuerpo, { "Idempotency-Key": clave });
    expect(cuarto.status).toBe(200);
    const filas = await db.select().from(codeVersions).where(eq(codeVersions.targetSlug, a.slug));
    expect(filas.filter((f) => f.origin === "agent")).toHaveLength(1);
    const propuestas = await db
      .select()
      .from(agentProposals)
      .where(eq(agentProposals.path, `/api/promotion/versions/${primero.version.id}/activate`));
    expect(propuestas).toHaveLength(1);
    // Otro contenido sí es otra versión.
    const otraVersion = await proponer(sugeridor, { ...cuerpo, description: "x", code: `${SUMA}\n// v2` });
    expect(otraVersion.version.id).not.toBe(primero.version.id);
    expect(otraVersion.version.versionNumber).toBe(primero.version.versionNumber + 1);
  }, 120_000);

  it("turbo con todo en verde: se activa sola", async () => {
    if (!dbAvailable) return;
    await configurar({ turboAllowed: true });
    await modo(turbo.id, "turbo");
    const a = await accion();
    const { version: v } = await proponer(turbo, { target: { actionId: a.id }, code: SUMA, tests: PRUEBA_SUMA });
    expect(v.decision.ruta).toBe("turbo");
    expect(v.decision.motivos).toEqual([]);
    expect(v.status).toBe("active");
    expect(v.activatedBy).toBe("turbo");
    expect(v.proposal).toBeNull();
    expect((await codigoDe(a.id)).code).toBe(SUMA);
  }, 120_000);

  it("turbo: cada respaldo es una propuesta con su motivo", async () => {
    if (!dbAvailable) return;
    await configurar({ turboAllowed: true });
    await modo(turbo.id, "turbo");
    const casos: { motivo: string; cuerpo: (actionId: string) => Record<string, unknown>; nueva?: boolean }[] = [
      {
        motivo: "scope_escalation",
        cuerpo: (id) => ({ target: { actionId: id }, code: SUMA, tests: PRUEBA_SUMA, scopes: ["datasets:*:read"] }),
      },
      {
        motivo: "new_outbound_hosts",
        cuerpo: (id) => ({ target: { actionId: id }, code: SUMA, tests: PRUEBA_SUMA, fetchAllow: ["api.example.com"] }),
      },
      {
        motivo: "touches_users_or_roles",
        cuerpo: (id) => ({
          target: { actionId: id },
          code: "const r = await kitsuden.api.get('/api/v1/agents'); return { s: r.status };",
          tests: [{ name: "lists", api: { "GET /api/v1/agents": { status: 200, body: [] } }, expect: { result: { s: 200 } } }],
        }),
      },
      {
        motivo: "touches_secrets",
        cuerpo: (id) => ({
          target: { actionId: id },
          code: "return { len: String(env.API_TOKEN || '').length };",
          tests: [{ name: "reads", env: { API_TOKEN: "abc" }, expect: { result: { len: 3 } } }],
        }),
      },
      {
        motivo: "touches_security_config",
        cuerpo: (id) => ({
          target: { actionId: id },
          code: "const r = await kitsuden.api.patch('/api/settings', { x: 1 }); return { s: r.status };",
          tests: [{ name: "patches", api: { "PATCH /api/settings": { status: 200, body: {} } }, expect: { result: { s: 200 } } }],
        }),
      },
      {
        motivo: "sensitive_operation",
        cuerpo: (id) => ({
          target: { actionId: id },
          code: "const r = await kitsuden.api.delete('/api/data-sets/00000000-0000-0000-0000-000000000000'); return { s: r.status };",
          tests: [
            {
              name: "deletes",
              api: { "DELETE /api/data-sets/00000000-0000-0000-0000-000000000000": { status: 204, body: null } },
              expect: { result: { s: 204 } },
            },
          ],
        }),
      },
      {
        motivo: "unclassifiable_api_call",
        cuerpo: (id) => ({
          target: { actionId: id },
          code: "const p = '/api/' + event.what; const r = await kitsuden.api.get(p); return { s: r.status };",
          tests: [{ name: "dyn", event: { what: "x" }, api: { "GET /api/x": { status: 200, body: {} } }, expect: { result: { s: 200 } } }],
        }),
      },
      {
        motivo: "tests_failed",
        cuerpo: (id) => ({
          target: { actionId: id },
          code: SUMA,
          tests: [{ name: "wrong", event: { a: 1, b: 1 }, expect: { result: { total: 3 } } }],
        }),
      },
      {
        motivo: "tests_errored",
        cuerpo: (id) => ({
          target: { actionId: id },
          code: "while (true) {}",
          timeoutMs: 300,
          tests: [{ name: "loops", timeoutMs: 300, expect: { success: true } }],
        }),
      },
      {
        motivo: "no_tests",
        cuerpo: (id) => ({ target: { actionId: id }, code: SUMA }),
      },
      {
        motivo: "scan_failed",
        cuerpo: (id) => ({ target: { actionId: id }, code: "return eval('1+1');", tests: [{ name: "x", expect: { success: false } }] }),
      },
      {
        motivo: "limits_increased",
        cuerpo: (id) => ({ target: { actionId: id }, code: SUMA, tests: PRUEBA_SUMA, timeoutMs: 20_000 }),
      },
      {
        motivo: "new_target",
        nueva: true,
        cuerpo: () => ({
          target: { slug: `promo-new-${generateTestId()}`.toLowerCase().replace(/[^a-z0-9-]/g, "-"), name: "New one" },
          code: SUMA,
          tests: PRUEBA_SUMA,
        }),
      },
    ];
    for (const caso of casos) {
      const a = caso.nueva ? null : await accion();
      const { version: v } = await proponer(turbo, caso.cuerpo(a?.id ?? ""));
      expect(v.decision.ruta, caso.motivo).toBe("proposal");
      expect(v.decision.motivos, caso.motivo).toContain(caso.motivo);
      expect(v.decision.motivos, caso.motivo).not.toContain("suggestion_mode");
      expect(v.status, caso.motivo).toBe("awaiting_approval");
      expect(v.proposal?.id, caso.motivo).toBeTruthy();
      if (a) expect((await codigoDe(a.id)).code, caso.motivo).toBe("return { v: 1 };");
    }

    // El tope global apagado: tampoco.
    await configurar({ turboAllowed: false });
    const a = await accion();
    const { version: v } = await proponer(turbo, { target: { actionId: a.id }, code: SUMA, tests: PRUEBA_SUMA });
    expect(v.status).toBe("awaiting_approval");
    expect(v.decision.motivos).toEqual(["turbo_disabled_globally"]);
  }, 300_000);

  it("ENABLE_CODE_ACTIONS apagado: las pruebas corren y la activación dice por qué no", async () => {
    if (!dbAvailable) return;
    await configurar({ turboAllowed: true });
    await modo(turbo.id, "turbo");
    const a = await accion();
    process.env.ENABLE_CODE_ACTIONS = "false";
    try {
      const { version: v } = await proponer(turbo, { target: { actionId: a.id }, code: SUMA, tests: PRUEBA_SUMA });
      expect(v.testReport.passed).toBe(1);
      expect(v.decision.ruta).toBe("turbo");
      expect(v.status).toBe("approved");
      expect(v.activationError).toBe("code_actions_disabled");
      expect((await codigoDe(a.id)).code).toBe("return { v: 1 };");
      expect(await acciones(v.id)).toContain("promotion_activation_blocked");
      // Activar a mano sigue sin poder mientras esté apagado.
      const r = await comoAdmin("POST", `/api/approvals/promotion/versions/${v.id}/activate`);
      expect(r.status).toBe(409);
      expect(await r.text()).toContain("code_actions_disabled");

      // suggestion también: aprobada, sin activar.
      const b = await accion();
      const { version: s } = await proponer(sugeridor, { target: { actionId: b.id }, code: SUMA, tests: PRUEBA_SUMA });
      const ap = await json<{ proposal: { status: string } }>(
        await comoAdmin("POST", `/api/approvals/proposals/${s.proposal!.id}/approve`, {}),
        200
      );
      expect(ap.proposal.status).toBe("failed");
      const sv = await leerVersion(s.id);
      expect(sv.status).toBe("approved");
      expect(sv.activationError).toBe("code_actions_disabled");

      // Encendido: el admin la activa.
      process.env.ENABLE_CODE_ACTIONS = "true";
      const act = await json<{ version: VistaDeVersion }>(
        await comoAdmin("POST", `/api/approvals/promotion/versions/${v.id}/activate`),
        200
      );
      expect(act.version.status).toBe("active");
      expect((await codigoDe(a.id)).code).toBe(SUMA);
    } finally {
      delete process.env.ENABLE_CODE_ACTIONS;
    }
  }, 180_000);

  it("una base que cambió por debajo no se activa (stale_base)", async () => {
    if (!dbAvailable) return;
    const a = await accion();
    const uno = await proponer(sugeridor, { target: { actionId: a.id }, code: SUMA, tests: PRUEBA_SUMA });
    const dos = await proponer(sugeridor, { target: { actionId: a.id }, code: `${SUMA} // b`, tests: PRUEBA_SUMA });
    await json(await comoAdmin("POST", `/api/approvals/promotion/versions/${uno.version.id}/approve`, {}), 200);
    expect((await leerVersion(uno.version.id)).status).toBe("active");
    await json(await comoAdmin("POST", `/api/approvals/promotion/versions/${dos.version.id}/approve`, {}), 200);
    const v2 = await leerVersion(dos.version.id);
    expect(v2.status).toBe("failed");
    expect(v2.activationError).toBe("stale_base");
    expect((await codigoDe(a.id)).code).toBe(SUMA);

    // Un admin edita la acción a mano: la siguiente activación guarda la foto
    // de lo que corría DE VERDAD, y volver atrás deja esa edición.
    const aMano = "return { total: 'edited by hand' };";
    await json(await comoAdmin("PATCH", `/api/actions/${a.id}`, { config: { ...(await codigoDe(a.id)).config, code: aMano } }), 200);
    const tres = await proponer(sugeridor, { target: { actionId: a.id }, code: `${SUMA} // c`, tests: PRUEBA_SUMA });
    await json(await comoAdmin("POST", `/api/approvals/promotion/versions/${tres.version.id}/approve`, {}), 200);
    const v3 = await leerVersion(tres.version.id);
    expect(v3.status).toBe("active");
    expect((await leerVersion(uno.version.id)).status).toBe("superseded");
    const foto = await leerVersion(v3.previousVersionId!);
    expect(foto.origin).toBe("manual");
    expect(foto.code).toBe(aMano);
    await json(await comoAdmin("POST", `/api/approvals/promotion/versions/${tres.version.id}/rollback`, { reason: "back" }), 200);
    expect((await codigoDe(a.id)).code).toBe(aMano);
  }, 120_000);

  it("vigilancia: con errores por encima del umbral vuelve sola a la versión anterior", async () => {
    if (!dbAvailable) return;
    await configurar({ turboAllowed: true, minExecutions: 3, maxErrorRate: 0.5, watchMinutes: 30 });
    await modo(turbo.id, "turbo");
    const a = await accion("return { ok: 'old' };");
    // Pasa su prueba (con `event.event`), pero una ejecución manual no lo trae: falla.
    const malo = "if (!event.event) throw new Error('boom'); return { ok: 'new' };";
    const { version: v } = await proponer(turbo, {
      target: { actionId: a.id },
      code: malo,
      tests: [{ name: "with event", event: { event: { x: 1 } }, expect: { result: { ok: "new" } } }],
    });
    expect(v.status).toBe("active");
    _olvidarNegativos();
    for (let i = 0; i < 3; i++) {
      const r = await json<{ success: boolean }>(await comoAdmin("POST", `/api/actions/${a.id}/execute`, {}), 200);
      if (i === 0) expect(r.success).toBe(false);
    }
    const tras = await leerVersion(v.id);
    expect(tras.status).toBe("rolled_back");
    expect(tras.rolledBackBy).toBe("auto");
    expect(tras.rollbackReason).toContain("Automatic rollback");
    expect((await codigoDe(a.id)).code).toBe("return { ok: 'old' };");
    const [log] = await db
      .select()
      .from(agentAuditLogs)
      .where(sql`${agentAuditLogs.resourceId} = ${v.id} and ${agentAuditLogs.action} = 'promotion_rolled_back'`);
    expect((log!.details as { automatic: boolean }).automatic).toBe(true);
    // Y vuelve a funcionar con el código de antes.
    const ok = await json<{ success: boolean; result: unknown }>(await comoAdmin("POST", `/api/actions/${a.id}/execute`, {}), 200);
    expect(ok.success).toBe(true);
    expect(ok.result).toEqual({ ok: "old" });
  }, 180_000);

  it("MCP: promotion_propose / promotion_list / promotion_status con el scope; activar nunca es herramienta", async () => {
    if (!dbAvailable) return;
    const con = await agente(["mcp:connect", "promotion:propose"]);
    const sin = await agente(["mcp:connect"]);
    const nombres = async (ag: Ag) =>
      (((await rpc(await sesionMcp(ag), "tools/list", {})).result as { tools: { name: string }[] }).tools ?? []).map((t) => t.name);
    const deCon = await nombres(con);
    for (const t of ["promotion_propose", "promotion_list", "promotion_status"]) expect(deCon).toContain(t);
    expect(deCon.some((t) => t.includes("activar") || t.includes("activate"))).toBe(false);
    const deSin = await nombres(sin);
    expect(deSin.some((t) => t.startsWith("promotion_"))).toBe(false);

    const a = await accion();
    const s = await sesionMcp(con);
    const r = (await rpc(s, "tools/call", {
      name: "promotion_propose",
      arguments: { body: { target: { actionId: a.id }, code: SUMA, tests: PRUEBA_SUMA } },
    })).result as { isError?: boolean; structuredContent?: { status: number; data: { version: VistaDeVersion } } };
    expect(r.isError ?? false).toBe(false);
    expect(r.structuredContent!.status).toBe(201);
    const v = r.structuredContent!.data.version;
    expect(v.status).toBe("awaiting_approval");
    expect((await leerVersion(v.id)).channel).toBe("mcp");
    const estado = (await rpc(s, "tools/call", { name: "promotion_status", arguments: { id: v.id } })).result as {
      structuredContent?: { data?: { version?: { id: string } } };
    };
    expect(estado.structuredContent?.data?.version?.id).toBe(v.id);
  }, 120_000);

  it("decisión 2: un agente (ni con admin) no cambia código fuera de la promoción", async () => {
    if (!dbAvailable) return;
    const a = await accion("return { v: 1 };", { envVars: { REGION: "eu" } });
    const prohibido = async (r: Response) => {
      const texto = await r.text();
      expect(r.status, texto).toBe(403);
      expect(texto).toContain("KITSUDEN_E_FORBIDDEN");
      expect(texto).toContain("promotion_propose");
    };
    const slugNuevo = () => `promo-byp-${generateTestId()}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");
    await prohibido(
      await pedir({ token: conAdmin.token }, "POST", "/api/actions", {
        name: "x",
        slug: slugNuevo(),
        type: "code",
        trigger: "manual",
        config: { code: "return 1;" },
      })
    );
    const { config } = await codigoDe(a.id);
    await prohibido(await pedir({ token: conAdmin.token }, "PATCH", `/api/actions/${a.id}`, { config: { ...config, code: "return 2;" } }));
    await prohibido(await pedir({ token: conAdmin.token }, "PATCH", `/api/actions/${a.id}`, { config: { ...config, scopes: ["admin"] } }));
    await prohibido(await pedir({ token: conAdmin.token }, "PATCH", `/api/actions/${a.id}`, { config: {} }));
    await prohibido(await pedir({ token: conAdmin.token }, "POST", "/api/functions", { name: "f", code: "return 1;", trigger: "manual" }));
    // Lo que no es código, igual que antes.
    const nombre = await pedir({ token: conAdmin.token }, "PATCH", `/api/actions/${a.id}`, { name: "renamed by agent" });
    expect(nombre.status).toBe(200);
    const env = await pedir({ token: conAdmin.token }, "PATCH", `/api/actions/${a.id}`, { config: { ...config, envVars: { REGION: "us" } } });
    expect(env.status, await env.clone().text()).toBe(200);
    expect((await codigoDe(a.id)).code).toBe("return { v: 1 };");
    // Las rejillas genéricas no escriben esas tablas (ni el agente ni el admin).
    for (const auth of [{ token: conAdmin.token }, { cookie: admin.cookie }]) {
      const items = await pedir(auth, "PATCH", `/api/items/actions/${a.id}`, { config: { code: "return 3;" } });
      const texto = await items.text();
      expect(items.status, texto).toBe(403);
      expect(texto).toContain("KITSUDEN_E_FORBIDDEN");
      expect((await pedir(auth, "POST", "/api/items/codeVersions", { code: "x" })).status).toBe(403);
    }
    expect((await codigoDe(a.id)).code).toBe("return { v: 1 };");
    // MCP: kitsuden_define_action con código.
    const mcp = await agente(["mcp:connect", "mcp:admin"]);
    const s = await sesionMcp(mcp);
    const r = (await rpc(s, "tools/call", {
      name: "kitsuden_define_action",
      arguments: { name: "x", slug: slugNuevo(), type: "code", trigger: "manual", config: { code: "return 1;" } },
    })).result as { isError?: boolean };
    expect(r.isError).toBe(true);
    expect(JSON.stringify(r)).toContain("KITSUDEN_E_FORBIDDEN");
    expect(JSON.stringify(r)).toContain("promotion_propose");
  }, 120_000);

  it("decisión 2: una edición a mano del admin queda como versión manual (y se vuelve atrás)", async () => {
    if (!dbAvailable) return;
    const a = await accion("return { v: 1 };");
    const activaDe = async () => {
      const [v] = await db
        .select()
        .from(codeVersions)
        .where(sql`${codeVersions.targetId} = ${a.id} and ${codeVersions.status} = 'active'`);
      return v!;
    };
    const alta = await activaDe();
    expect(alta.origin).toBe("manual");
    const { config } = await codigoDe(a.id);
    await json(await comoAdmin("PATCH", `/api/actions/${a.id}`, { config: { ...config, code: "return { v: 2 };" } }), 200);
    const edicion = await activaDe();
    expect(edicion.origin).toBe("manual");
    expect(edicion.code).toBe("return { v: 2 };");
    expect(edicion.activatedBy).toBe(admin.userId);
    expect(edicion.previousVersionId).toBe(alta.id);
    expect(edicion.baseHash).toBeTruthy();
    expect((await leerVersion(alta.id)).status).toBe("superseded");
    const [log] = await db
      .select()
      .from(agentAuditLogs)
      .where(sql`${agentAuditLogs.resourceId} = ${edicion.id} and ${agentAuditLogs.action} = 'promotion_manual_edit'`);
    const d = log!.details as { by: string; previousHash: string };
    expect(d.by).toBe(admin.userId);
    expect(d.previousHash).toBe(alta.contentHash);
    // Renombrar no es código: no crea versión.
    expect((await comoAdmin("PATCH", `/api/actions/${a.id}`, { name: "renamed" })).status).toBe(200);
    const versiones = await db.select().from(codeVersions).where(eq(codeVersions.targetId, a.id));
    expect(versiones).toHaveLength(2);
    await json(await comoAdmin("POST", `/api/approvals/promotion/versions/${edicion.id}/rollback`, { reason: "undo" }), 200);
    expect((await codigoDe(a.id)).code).toBe("return { v: 1 };");
    expect((await leerVersion(alta.id)).status).toBe("active");
  }, 120_000);

  it("decisión 3: turbo solo cuenta lo NUEVO frente a la versión activa", async () => {
    if (!dbAvailable) return;
    await configurar({ turboAllowed: true });
    await modo(turbo.id, "turbo");
    const id0 = "00000000-0000-0000-0000-000000000000";
    const borra = `const r = await kitsuden.api.delete('/api/data-sets/${id0}'); const u = await kitsuden.api.get('/api/v1/agents');`;
    const simuladas = {
      [`DELETE /api/data-sets/${id0}`]: { status: 204, body: null },
      "GET /api/v1/agents": { status: 200, body: [] },
      "GET /api/q": { status: 200, body: {} },
    };
    const prueba = [{ name: "deletes", event: { w: "q" }, api: simuladas, expect: { result: { s: 204 } } }];
    // La activa ya borraba (y leía agentes): el borrador que sigue haciéndolo pasa solo.
    const a = await accion(`${borra} return { s: r.status };`);
    const { version: v } = await proponer(turbo, {
      target: { actionId: a.id },
      code: `${borra} /* v2 */ return { s: r.status };`,
      tests: prueba,
    });
    expect(v.decision.motivos).toEqual([]);
    expect(v.status).toBe("active");
    // Un DELETE NUEVO sí frena.
    const b = await accion("return { s: 204 };");
    const { version: w } = await proponer(turbo, {
      target: { actionId: b.id },
      code: `const r = await kitsuden.api.delete('/api/data-sets/${id0}'); return { s: r.status };`,
      tests: prueba,
    });
    expect(w.status).toBe("awaiting_approval");
    expect(w.decision.motivos).toContain("sensitive_operation");
    // Un camino calculado sigue frenando aunque la activa ya llamara a la API.
    const { version: x } = await proponer(turbo, {
      target: { actionId: a.id },
      code: `${borra} const p = '/api/' + event.w; await kitsuden.api.get(p); return { s: r.status };`,
      tests: prueba,
    });
    expect(x.decision.motivos).toContain("unclassifiable_api_call");
  }, 180_000);

  it("decisión 3: una acción nueva pasa por una persona la primera vez y luego puede ir en turbo", async () => {
    if (!dbAvailable) return;
    await configurar({ turboAllowed: true });
    await modo(turbo.id, "turbo");
    const slug = `promo-nueva-${generateTestId()}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");
    const { version: v1 } = await proponer(turbo, { target: { slug, name: "Nueva" }, code: SUMA, tests: PRUEBA_SUMA });
    expect(v1.status).toBe("awaiting_approval");
    expect(v1.decision.motivos).toEqual(["new_target"]);
    await json(await comoAdmin("POST", `/api/approvals/promotion/versions/${v1.id}/approve`, {}), 200);
    const activa = await leerVersion(v1.id);
    expect(activa.status).toBe("active");
    accionesCreadas.push(activa.targetId!);
    const { version: v2 } = await proponer(turbo, { target: { slug }, code: `${SUMA} // v2`, tests: PRUEBA_SUMA });
    expect(v2.decision.motivos).toEqual([]);
    expect(v2.status).toBe("active");
    expect(v2.activatedBy).toBe("turbo");
  }, 180_000);

  it("RLS: un agente solo ve sus borradores (por la API y con la política sola)", async () => {
    if (!dbAvailable) return;
    const a = await accion();
    const mio = await proponer(sugeridor, { target: { actionId: a.id }, code: SUMA, tests: PRUEBA_SUMA });
    const ajeno = await proponer(otro, { target: { actionId: a.id }, code: `${SUMA} // otro`, tests: PRUEBA_SUMA });

    const lista = await json<{ versions: VistaDeVersion[] }>(await pedir({ token: otro.token }, "GET", "/api/promotion/drafts"), 200);
    expect(lista.versions.map((v) => v.id)).toContain(ajeno.version.id);
    expect(lista.versions.map((v) => v.id)).not.toContain(mio.version.id);
    expect((await pedir({ token: otro.token }, "GET", `/api/promotion/drafts/${mio.version.id}`)).status).toBe(404);
    // El admin humano ve los dos.
    const todos = await json<{ versions: VistaDeVersion[] }>(await comoAdmin("GET", "/api/approvals/promotion/versions?limit=200"), 200);
    expect(todos.versions.map((v) => v.id)).toEqual(expect.arrayContaining([mio.version.id, ajeno.version.id]));
    // Un agente sin el scope, nada.
    const sinScope = await agente(["mcp:connect"]);
    expect((await pedir({ token: sinScope.token }, "GET", "/api/promotion/drafts")).status).toBe(403);
    expect((await pedir({ token: sinScope.token }, "POST", "/api/promotion/drafts", { target: { actionId: a.id }, code: SUMA })).status).toBe(403);

    // La POLÍTICA sola (sin el filtro de la aplicación), con el contexto de cada agente.
    const comoAgente = async (agentId: string) =>
      db.transaction(async (tx) => {
        // Un superusuario se salta la RLS: la política se mide con el rol de la API.
        const su = (await tx.execute(sql`SELECT current_setting('is_superuser') AS su`)) as unknown as { rows: { su: string }[] };
        if (su.rows[0]?.su === "on") await tx.execute(sql`SET LOCAL ROLE kitsuden_app`);
        await tx.execute(
          sql`select set_config('app.current_user_id', ${agentId}, true), set_config('app.current_user_role', 'agent', true)`
        );
        const visibles = (await tx.execute(sql`select agent_id from code_versions`)) as unknown as
          | { rows: { agent_id: string | null }[] }
          | { agent_id: string | null }[];
        const filas = Array.isArray(visibles) ? visibles : visibles.rows;
        const tocadas = (await tx.execute(
          sql`update code_versions set description = 'pwned' where agent_id = ${agentId} returning id`
        )) as unknown as { rows?: unknown[] } | unknown[];
        return { filas, tocadas: Array.isArray(tocadas) ? tocadas.length : (tocadas.rows?.length ?? 0) };
      });
    const vistoPorOtro = await comoAgente(otro.id);
    expect(vistoPorOtro.filas.length).toBeGreaterThan(0);
    expect(vistoPorOtro.filas.every((f) => f.agent_id === otro.id)).toBe(true);
    // Ni siquiera sus propias filas: escribe solo el sistema.
    expect(vistoPorOtro.tocadas).toBe(0);
    expect((await leerVersion(ajeno.version.id)).description).not.toBe("pwned");
  }, 120_000);
});
