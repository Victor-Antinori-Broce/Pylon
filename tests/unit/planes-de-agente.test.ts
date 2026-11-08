/**
 * Planes de agente — Plan/Act (K1): la validación pura
 * ============================================================================
 *
 * `validarPlan` fija qué se acepta como plan; `pasosDePlan` fija qué se
 * ejecuta (lo guardado en la propuesta). Ni uno admite pasos fuera de /api/,
 * rutas de admin, o planes imposibles de leer para un humano.
 */
import { describe, expect, it } from "vitest";

import { pasosDePlan } from "../../apps/api/src/lib/aprobaciones";
import { MAX_PASOS_DE_PLAN, PlanNoValido, validarPlan } from "../../apps/api/src/lib/planes-de-agente";

describe("validarPlan", () => {
  it("acepta un plan bien formado y normaliza el método", () => {
    const plan = validarPlan({
      goal: "Actualizar la guía del jefe",
      steps: [
        { method: "patch", path: "/api/kons/blog/entradas/1", body: { titulo: "X" } },
        { method: "GET", path: "/api/kons/blog/entradas/1" },
      ],
    });
    expect(plan.goal).toBe("Actualizar la guía del jefe");
    expect(plan.steps[0]!.method).toBe("PATCH");
    expect(plan.steps[1]!.method).toBe("GET");
  });

  it("rechaza lo que no es un plan", () => {
    expect(() => validarPlan(null)).toThrow(PlanNoValido);
    expect(() => validarPlan({})).toThrow(PlanNoValido);
    expect(() => validarPlan({ goal: "x", steps: [] })).toThrow(PlanNoValido);
  });

  it("exige goal y acota su tamaño", () => {
    expect(() => validarPlan({ steps: [{ method: "GET", path: "/api/x" }] })).toThrow(/goal/);
    expect(() =>
      validarPlan({ goal: "x".repeat(501), steps: [{ method: "GET", path: "/api/x" }] })
    ).toThrow(/500/);
  });

  it("rechaza métodos, caminos y rutas de admin", () => {
    expect(() =>
      validarPlan({ goal: "g", steps: [{ method: "TELEPORT", path: "/api/x" }] })
    ).toThrow(/method/);
    expect(() =>
      validarPlan({ goal: "g", steps: [{ method: "GET", path: "https://evil.example" }] })
    ).toThrow(/\/api\//);
    expect(() =>
      validarPlan({ goal: "g", steps: [{ method: "GET", path: "/api/admin/agents" }] })
    ).toThrow(/admin/);
  });

  it("limita el número de pasos (la bandeja se lee entera)", () => {
    const steps = Array.from({ length: MAX_PASOS_DE_PLAN + 1 }, () => ({
      method: "GET",
      path: "/api/kons/blog/entradas",
    }));
    expect(() => validarPlan({ goal: "g", steps })).toThrow(/at most/);
  });
});

describe("pasosDePlan (lo guardado)", () => {
  it("lee el plan del cuerpo de la propuesta", () => {
    const plan = { goal: "g", steps: [{ method: "PATCH", path: "/api/x", body: { a: 1 } }] };
    const leido = pasosDePlan({ plan });
    expect(leido?.goal).toBe("g");
    expect(leido?.steps[0]).toMatchObject({ method: "PATCH", path: "/api/x", body: { a: 1 } });
  });

  it("devuelve null si el cuerpo no es un plan válido (no se ejecuta nada raro)", () => {
    expect(pasosDePlan(null)).toBeNull();
    expect(pasosDePlan({ plan: { goal: "", steps: [] } })).toBeNull();
    expect(pasosDePlan({ plan: { goal: "g", steps: [{ method: "HACK", path: "/api/x" }] } })).toBeNull();
    expect(pasosDePlan({ plan: { goal: "g", steps: [{ method: "GET", path: "/etc/passwd" }] } })).toBeNull();
  });
});
