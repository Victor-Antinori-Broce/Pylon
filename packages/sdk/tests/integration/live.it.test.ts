/**
 * The TypeScript client against a REAL Kitsuden API on a test database.
 * Started by `node scripts/sdk/integration.mjs` (it sets the variables below);
 * skipped when run alone.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  KitsudenApi,
  KitsudenApiError,
  expectOk,
  isKitsudenError,
  type Datasets,
} from "../../src/index";

const EN_MARCHA = process.env.KITSUDEN_SDK_IT === "1";
const SPEC = JSON.parse(
  readFileSync(join(__dirname, "../../openapi/kitsuden.openapi.json"), "utf8")
);
const sello = Date.now().toString(36);

describe.runIf(EN_MARCHA)("typed client against a live API", () => {
  const agente = new KitsudenApi(); // KITSUDEN_API_URL + KITSUDEN_API_TOKEN
  const admin = new KitsudenApi({ token: null, sessionCookie: process.env.KITSUDEN_SDK_IT_COOKIE });
  const propone = new KitsudenApi({ token: process.env.KITSUDEN_SDK_IT_PROPOSE_TOKEN });
  let dataset: Datasets.CrearDatasetResponse & { id: string; slug: string };

  it("the offline snapshot matches what the server publishes (same operations, same schemas)", async () => {
    const vivo = expectOk(
      await agente.request<{ paths: Record<string, Record<string, Record<string, unknown>>> }>(
        "GET",
        "/docs/openapi.json"
      )
    );
    const kons = new Set<string>();
    let comparadas = 0;
    for (const [camino, item] of Object.entries(vivo.paths)) {
      for (const [metodo, o] of Object.entries(item)) {
        const x = o["x-kitsuden-operation"] as { kon: string } | undefined;
        if (!x) continue;
        kons.add(x.kon);
        const nuestra = SPEC.paths[camino]?.[metodo];
        expect(nuestra, `${metodo} ${camino} is live but not in the snapshot`).toBeDefined();
        expect(nuestra).toEqual(o);
        comparadas++;
      }
    }
    // And every snapshot operation of a kon that is live is live too.
    for (const [camino, item] of Object.entries<
      Record<string, { "x-kitsuden-operation": { kon: string } }>
    >(SPEC.paths))
      for (const [metodo, o] of Object.entries(item))
        if (kons.has(o["x-kitsuden-operation"].kon))
          expect(vivo.paths[camino]?.[metodo], `${metodo} ${camino}`).toBeDefined();
    expect(comparadas).toBeGreaterThan(50);
  });

  it("an admin session switches approvals on and puts one agent in propose mode", async () => {
    expectOk(
      await admin.aprobaciones.guardarConfiguracionDeAprobaciones({ body: { enabled: true } })
    );
    expectOk(
      await admin.aprobaciones.modoDeAgente({
        id: process.env.KITSUDEN_SDK_IT_PROPOSE_ID!,
        body: { mode: "propose" },
      })
    );
    expectOk(
      await admin.aprobaciones.modoDeAgente({
        id: process.env.KITSUDEN_SDK_IT_DIRECT_ID!,
        body: { mode: "direct" },
      })
    );
  });

  it("creates a dataset with an automatic Idempotency-Key, and the same key replays it", async () => {
    const cuerpo = {
      name: `SDK TS ${sello}`,
      slug: `sdk-ts-${sello}`,
      schema: [{ name: "score", fieldName: "score", type: "number", fieldType: "number" }],
    };
    const r = await agente.datasets.crearDataset({ body: cuerpo });
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(r.status).toBe(201);
    expect(r.meta.idempotencyKey).toMatch(/^ksdk-/);
    expect(r.meta.replayed).toBe(false);
    dataset = r.data as typeof dataset;
    const otra = await agente.datasets.crearDataset(
      { body: cuerpo },
      { idempotencyKey: r.meta.idempotencyKey! }
    );
    expect(otra.kind === "ok" && otra.meta.replayed).toBe(true);
    expect(otra.kind === "ok" && (otra.data as { id: string }).id).toBe(dataset.id);
  });

  it("writes entries and pages through them", async () => {
    for (let i = 0; i < 3; i++) {
      expectOk(
        await agente.datasets.crearEntrada({
          id: dataset.id,
          body: { title: `e${i}`, data: { score: i } },
        })
      );
    }
    const lista = expectOk(await agente.datasets.listarEntradas({ id: dataset.id, limit: 10 }));
    expect(lista.docs.map((d) => d.title).sort()).toEqual(["e0", "e1", "e2"]);
  });

  it("decodes the same data in toon, tron and auto", async () => {
    const json = expectOk(await agente.datasets.listarEntradas({ id: dataset.id }));
    for (const format of ["toon", "tron", "auto"] as const) {
      const r = await agente.datasets.listarEntradas({ id: dataset.id }, { format });
      expect(expectOk(r), format).toEqual(json);
      expect(r.meta.format, format).not.toBeNull();
    }
  });

  it("returns provenance when asked", async () => {
    const r = await agente.datasets.listarEntradas({ id: dataset.id }, { provenance: true });
    expectOk(r);
    if (r.meta.provenance) expect(r.meta.provenance.raw).toMatch(/untrusted=\d+/);
  });

  it("errors are typed problem+json", async () => {
    const e = await agente.datasets
      .obtenerDataset({ id: "0c6e1c2e-0000-4000-8000-00000000dead" })
      .catch((x) => x);
    expect(e).toBeInstanceOf(KitsudenApiError);
    expect(isKitsudenError(e, "KITSUDEN_E_NOT_FOUND")).toBe(true);
    expect(e.problem.hint.length).toBeGreaterThan(0);
  });

  it("an agent in propose mode gets a typed pending proposal, and can read its status", async () => {
    const r = await propone.datasets.crearDataset({
      body: { name: `SDK TS held ${sello}`, slug: `sdk-ts-held-${sello}` },
    });
    expect(r.kind).toBe("proposal_pending");
    if (r.kind !== "proposal_pending") return;
    expect(r.proposal.status).toBe("pending");
    expect(r.proposal.statusUrl).toContain(r.proposal.id);
    expect(r.meta.attempts).toBe(1);
    const estado = expectOk(await propone.propuestas.estadoDePropuesta({ id: r.proposal.id }));
    expect(JSON.stringify(estado)).toContain("pending");
  });

  it("an admin session can list the pending proposals with the paginated helper", async () => {
    const vistas: unknown[] = [];
    for await (const p of admin.aprobaciones.listarPropuestas.iterate({
      status: "pending",
      limit: 50,
    }))
      vistas.push(p);
    expect(vistas.length).toBeGreaterThan(0);
    expectOk(
      await admin.aprobaciones.guardarConfiguracionDeAprobaciones({ body: { enabled: false } })
    );
  });
});
