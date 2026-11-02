/**
 * La lógica de los hooks de dominio, sin montar componentes
 * ============================================================================
 *
 * Los hooks de `@kitsuden/sdk-react` son finos: piden, guardan estado y llaman
 * a funciones puras. Aquí se prueban esas funciones, que es donde están las
 * reglas que un agente suele escribir mal cuando parte de cero.
 */

import { describe, expect, it } from "vitest";

import {
  KitsudenRequestError,
  moverEnTierList,
  nombresDeParticipantes,
  pedirAKitsuden,
  setsAbiertos,
  siguientePasoDelSuizo,
  vistaDeTierList,
  type TierListData,
} from "../../packages/sdk-react/src/dominio-puro";

const LISTA: TierListData = {
  slug: "campeones",
  title: "Campeones",
  tiers: [
    { id: "s", label: "S" },
    { id: "a", label: "A" },
  ],
  items: [
    { id: "aria", label: "Aria" },
    { id: "boro", label: "Boro" },
    { id: "ciro", label: "Ciro" },
  ],
  placement: { aria: "s", boro: "f" },
};

describe("tier list", () => {
  it("agrupa por filas en el orden de las filas", () => {
    const v = vistaDeTierList(LISTA);
    expect(v.filas.map((f) => f.tier.id)).toEqual(["s", "a"]);
    expect(v.filas[0].items.map((i) => i.id)).toEqual(["aria"]);
  });

  it("un elemento en una fila que ya no existe va sin ranquear, no desaparece", () => {
    // `boro` estaba en «f», que se borró. Tiene que seguir a la vista.
    const v = vistaDeTierList(LISTA);
    expect(v.sinRanquear.map((i) => i.id).sort()).toEqual(["boro", "ciro"]);
  });

  it("mover en local no toca la lista original", () => {
    const movida = moverEnTierList(LISTA, "ciro", "a");
    expect(movida.placement.ciro).toBe("a");
    expect(LISTA.placement.ciro, "el optimista necesita la original para deshacer").toBeUndefined();
    expect(moverEnTierList(movida, "ciro", null).placement.ciro).toBeUndefined();
  });
});

describe("torneo", () => {
  const nombres = nombresDeParticipantes({
    participants: [
      { id: "p1-aaaaaaaa", player: { alias: "Aria" } },
      { id: "p2-bbbbbbbb", team: { name: "Karmine Corp" } },
      { id: "p3-cccccccc" },
    ],
  });

  it("el nombre sale del jugador o del equipo", () => {
    expect(nombres["p1-aaaaaaaa"]).toBe("Aria");
    expect(nombres["p2-bbbbbbbb"]).toBe("Karmine Corp");
    expect(nombres["p3-cccccccc"]).toBe("p3-ccccc");
  });

  it("solo son reportables los sets con dos ocupantes y sin ganador", () => {
    const abiertos = setsAbiertos(
      [
        {
          id: "m2",
          round: 2,
          participant1Id: "p1-aaaaaaaa",
          participant2Id: "p2-bbbbbbbb",
          winnerId: null,
        },
        {
          id: "m1",
          round: 1,
          participant1Id: "p1-aaaaaaaa",
          participant2Id: "p3-cccccccc",
          winnerId: null,
        },
        // Bye: resuelto desde que se emparejó.
        {
          id: "bye",
          round: 1,
          participant1Id: "p2-bbbbbbbb",
          participant2Id: null,
          winnerId: "p2-bbbbbbbb",
          status: "Completed",
        },
        // Ya jugado.
        {
          id: "hecho",
          round: 1,
          participant1Id: "p1-aaaaaaaa",
          participant2Id: "p2-bbbbbbbb",
          winnerId: "p1-aaaaaaaa",
        },
        // Esperando a un ocupante.
        {
          id: "tbd",
          round: 3,
          participant1Id: "p1-aaaaaaaa",
          participant2Id: null,
          winnerId: null,
        },
      ],
      nombres
    );

    expect(
      abiertos.map((s) => s.matchId),
      "ordenados por ronda"
    ).toEqual(["m1", "m2"]);
    expect(abiertos[0].lados.map((l) => l.nombre)).toEqual(["Aria", "p3-ccccc"]);
  });

  it("en suizo no se empareja con la ronda a medias", () => {
    const estado = { round: 1, totalRounds: 3, complete: false };
    expect(siguientePasoDelSuizo(estado, 1)).toBe("reportar");
    expect(siguientePasoDelSuizo(estado, 0)).toBe("emparejar");
    expect(siguientePasoDelSuizo({ ...estado, complete: true }, 0)).toBe("terminado");
  });
});

describe("llamar a la API", () => {
  it("manda el token y el cuerpo", async () => {
    let visto: { url: string; init: RequestInit } | null = null;
    const r = await pedirAKitsuden(
      {
        baseUrl: "http://api.test/api/",
        token: "kitsuden_agent_x",
        fetch: (async (url: string, init: RequestInit) => {
          visto = { url, init };
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }) as unknown as typeof fetch,
      },
      "POST",
      "/tierlist/templates/x/place",
      { itemId: "aria", tierId: "s" }
    );

    expect(r).toEqual({ ok: true });
    expect(visto!.url, "sin doble barra aunque la base termine en /").toBe(
      "http://api.test/api/tierlist/templates/x/place"
    );
    expect((visto!.init.headers as Record<string, string>).authorization).toBe(
      "Bearer kitsuden_agent_x"
    );
  });

  it("un error trae las sugerencias en el mensaje", async () => {
    const error = await pedirAKitsuden(
      {
        fetch: (async () =>
          new Response(
            JSON.stringify({
              error: {
                message: "Campos desconocidos",
                details: { unknownKeys: [{ key: "tier", didYouMean: "tierId" }] },
              },
            }),
            { status: 422 }
          )) as unknown as typeof fetch,
      },
      "POST",
      "/tierlist/templates/x/place",
      { itemId: "aria", tier: "s" }
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(KitsudenRequestError);
    expect((error as Error).message).toContain("«tier» → «tierId»");
  });
});
