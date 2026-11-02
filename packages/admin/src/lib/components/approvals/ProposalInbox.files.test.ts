/**
 * Bandeja de aprobación: las IMÁGENES de una subida retenida
 * ============================================================================
 *
 * Decisión del propietario (2026-10-26): un agente puede dejar una subida de
 * imágenes como propuesta. El detalle enseña cada imagen en miniatura, pedida
 * a la ruta del equipo (`/api/approvals/proposals/:id/files/:fileId`) con la
 * sesión, y avisa cuando las imágenes ya se borraron (decidida o caducada).
 */
import { render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setLocale } from "$lib/i18n";

import ProposalInbox from "./ProposalInbox.svelte";

vi.setConfig({ testTimeout: 60_000 });

const BASE = import.meta.env.VITE_API_URL ?? "";

const propuesta = {
  id: "11111111-1111-1111-1111-111111111111",
  status: "pending",
  reason: "propose_only",
  channel: "rest",
  method: "POST",
  path: "/api/media/upload",
  tool: null,
  operation: "kon:media:subir-medios",
  createdAt: "2026-10-26T10:00:00.000Z",
  expiresAt: "2026-10-27T10:00:00.000Z",
  decidedAt: null,
  comment: null,
  executedAt: null,
  statusUrl: "/api/proposals/11111111-1111-1111-1111-111111111111",
  agentId: "ag1",
  agentName: "Fotógrafo",
  decidedBy: null,
  decidedByName: null,
};

function detalle(files: unknown[]) {
  return {
    ...propuesta,
    keyId: null,
    body: { multipart: true, fields: [], files: [] },
    contentType: "multipart/form-data",
    idempotencyKey: null,
    scopes: ["kon:media:subir-medios"],
    diff: { kind: "create", proposed: {} },
    konId: "kon-media",
    operationId: "subir-medios",
    canDecide: true,
    cannotDecideReason: null,
    files,
  };
}

const respuesta = (cuerpo: unknown) =>
  ({ ok: true, status: 200, statusText: "", json: async () => cuerpo, blob: async () => new Blob(["x"]) }) as Response;

let pedidas: string[] = [];

function simular(files: unknown[]) {
  pedidas = [];
  global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url);
    pedidas.push(`${init?.credentials ?? ""} ${u}`);
    if (u.includes("/files/")) return respuesta(null);
    if (u.endsWith(`/proposals/${propuesta.id}`)) return respuesta(detalle(files));
    if (u.endsWith("/count")) return respuesta({ pending: 1 });
    return respuesta({ total: 1, proposals: [propuesta] });
  }) as typeof fetch;
}

describe("bandeja: miniaturas de una subida retenida", () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => "blob:miniatura");
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => setLocale("en", { recargar: false }));

  it("enseña cada imagen pedida con la sesión a la ruta del equipo (en)", async () => {
    setLocale("en", { recargar: false });
    simular([{ id: "f1", field: "files", filename: "portada.png", mimeType: "image/png", size: 2048 }]);
    render(ProposalInbox, { props: { initialId: propuesta.id } });

    const img = await screen.findByTestId("proposal-thumbnail");
    expect(img.getAttribute("src")).toBe("blob:miniatura");
    expect(img.getAttribute("alt")).toBe("Image portada.png");
    expect(screen.getByText("Uploaded images")).toBeTruthy();
    expect(pedidas).toContain(`include ${BASE}/api/approvals/proposals/${propuesta.id}/files/f1`);
  });

  it("en español, y si las imágenes ya se borraron lo dice", async () => {
    setLocale("es", { recargar: false });
    simular([]);
    render(ProposalInbox, { props: { initialId: propuesta.id } });
    await waitFor(() => expect(screen.getByTestId("proposal-files-removed")).toBeTruthy());
    expect(screen.getByTestId("proposal-files-removed").textContent?.trim()).toBe(
      "Las imágenes retenidas se borraron."
    );
    expect(screen.queryByTestId("proposal-thumbnail")).toBeNull();
  });
});
