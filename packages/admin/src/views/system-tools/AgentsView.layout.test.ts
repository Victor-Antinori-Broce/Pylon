/**
 * La papelera de la tarjeta de agente queda dentro de la tarjeta
 * ============================================================================
 *
 * En la rejilla de tres columnas la tarjeta mide ~200 px de ancho útil, y la
 * fila «Playground» + «Configurar» + espaciador `flex-1` + papelera no podía
 * partirse: la papelera se salía por el borde derecho. jsdom no calcula
 * anchos, así que se comprueba lo que lo evita: la fila puede partirse
 * (`flex-wrap`, `min-w-0`), la papelera no se encoge y se pega a la derecha
 * (`shrink-0`, `ml-auto`) y ya no hay espaciador que la empuje.
 */
import { render, screen } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { setLocale } from "$lib/i18n";

import AgentsView from "./AgentsView.svelte";

vi.mock("$lib/services/agents", () => ({
  listAgents: async () => [
    {
      id: "a1",
      name: "Un agente con un nombre larguísimo que no cabe en la tarjeta",
      model: "gpt-4",
      status: "active",
      totalTraces: 3,
      totalTokens: 1200,
    },
  ],
  createAgent: async () => ({}),
  deleteAgent: async () => ({}),
}));

describe("tarjeta de agente", () => {
  beforeEach(() => setLocale("en", { recargar: false }));

  it("la fila de acciones puede partirse y la papelera no se encoge ni se sale", async () => {
    render(AgentsView);
    const fila = await screen.findByTestId("agent-card-actions");
    const papelera = screen.getByRole("button", { name: "Delete Agent" });

    expect(fila.contains(papelera)).toBe(true);
    expect(fila.className).toMatch(/\bflex-wrap\b/);
    expect(fila.className).toMatch(/\bmin-w-0\b/);
    expect(papelera.className).toMatch(/\bml-auto\b/);
    expect(papelera.className).toMatch(/\bshrink-0\b/);
    // ya no hay espaciador `flex-1` que empuje la papelera fuera
    expect(fila.querySelector(".flex-1")).toBeNull();
    // el nombre largo se recorta en vez de ensanchar la tarjeta
    expect(screen.getByText(/nombre larguísimo/).className).toMatch(/\btruncate\b/);
  });
});
