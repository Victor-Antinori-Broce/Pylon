/**
 * Un kon, una identidad
 * ============================================================================
 *
 * `kon-games` y `games` son el MISMO kon: en la tabla `modules` conviven filas
 * con prefijo y sin él, heredadas de antes de la convención. Tratar las dos
 * formas como cosas distintas producía tres fallos a la vez:
 *
 *   · AL LISTAR    — el kon salía dos veces en la pantalla de Kons, con
 *     estados contradictorios (`kon-blog` encendido junto a `blog` apagado),
 *     porque la lista del grimoire fabricaba su clave arrancando el prefijo.
 *   · AL ESCRIBIR  — el `where(key = ...)` exacto no encontraba la fila
 *     heredada e INSERTABA una segunda. A partir de ahí ganaba una u otra
 *     según quién preguntara.
 *   · EN EL MENÚ   — la barra lateral comparaba la cadena, así que una entrada
 *     declarada como `blog` no aparecía aunque lo activo fuera `kon-blog`.
 *
 * `lib/sembrar-modulos.ts` ya había resuelto esta clase para la siembra y lo
 * dejó escrito. Esto fija la regla para las otras tres direcciones.
 */

import { describe, expect, it } from "vitest";

import {
  buscarPorClaveDeKon,
  claveCanonica,
  esElMismoKon,
  fusionarPorKon,
  type EntradaDeKon,
} from "../../apps/api/src/lib/clave-kon";

describe("claveCanonica", () => {
  it("quita el prefijo kon-", () => {
    expect(claveCanonica("kon-games")).toBe("games");
    expect(claveCanonica("kon-academy-lms")).toBe("academy-lms");
  });

  it("deja igual lo que ya viene sin prefijo", () => {
    expect(claveCanonica("games")).toBe("games");
    expect(claveCanonica("ai-memories")).toBe("ai-memories");
  });

  it("solo quita el prefijo del principio", () => {
    // "kon" en medio del nombre no es un prefijo.
    expect(claveCanonica("mi-kon-raro")).toBe("mi-kon-raro");
  });

  it("NO toca los guiones interiores", () => {
    // El fallo original hacía además `.replace(/-/g,"_")`, y convertía
    // `kon-broadcast-versus` en `broadcast_versus`: una clave que no es el id
    // de nada ni casa con ninguna fila.
    expect(claveCanonica("kon-broadcast-versus")).toBe("broadcast-versus");
  });
});

describe("esElMismoKon", () => {
  it("reconoce las dos formas", () => {
    expect(esElMismoKon("kon-games", "games")).toBe(true);
    expect(esElMismoKon("games", "kon-games")).toBe(true);
    expect(esElMismoKon("kon-blog", "kon-blog")).toBe(true);
  });

  it("no confunde kons distintos", () => {
    expect(esElMismoKon("kon-blog", "kon-blocks")).toBe(false);
    expect(esElMismoKon("broadcast", "broadcast-moba")).toBe(false);
  });
});

describe("buscarPorClaveDeKon", () => {
  it("encuentra la fila heredada al preguntar con prefijo", () => {
    // Este es el caso real: el manifiesto dice kon-games y la fila es `games`.
    const filas = new Map([["games", { key: "games", enabled: true }]]);

    expect(buscarPorClaveDeKon(filas, "kon-games")?.enabled).toBe(true);
  });

  it("encuentra la fila con prefijo al preguntar sin él", () => {
    const filas = new Map([["kon-wiki", { key: "kon-wiki", enabled: false }]]);

    expect(buscarPorClaveDeKon(filas, "wiki")?.key).toBe("kon-wiki");
  });

  it("la coincidencia EXACTA gana cuando existen las dos filas", () => {
    // Si una base ya arrastra las dos, hay que ser determinista: se devuelve
    // la que se pidió, no la primera que aparezca al recorrer el mapa.
    const filas = new Map([
      ["games", { key: "games", enabled: true }],
      ["kon-games", { key: "kon-games", enabled: false }],
    ]);

    expect(buscarPorClaveDeKon(filas, "kon-games")?.key).toBe("kon-games");
    expect(buscarPorClaveDeKon(filas, "games")?.key).toBe("games");
  });

  it("devuelve undefined si no está en ninguna forma", () => {
    const filas = new Map([["kon-blog", { key: "kon-blog", enabled: true }]]);

    expect(buscarPorClaveDeKon(filas, "kon-inexistente")).toBeUndefined();
  });

  it("no confunde un kon con otro que empieza igual", () => {
    const filas = new Map([["broadcast-moba", { key: "broadcast-moba", enabled: true }]]);

    expect(buscarPorClaveDeKon(filas, "kon-broadcast")).toBeUndefined();
  });
});

describe("fusionarPorKon — las dos vistas no tienen la misma regla", () => {
  // El tipo de retorno se anota a mano: al esparcir un `Record<string, unknown>`
  // TypeScript se queda con `{ key: string }` y pierde `grimoireIds` y compañía,
  // asi que `tsc` daba error en cada aserción aunque el test pasara.
  const kon = (key: string, extra: Record<string, unknown> = {}): EntradaDeKon => ({
    key,
    ...extra,
  });

  it("un kon en TRES grimoires sale UNA vez, nombrando a los tres", () => {
    // kon-dms lo incluyen Corporate, SharePoint y VekDocs. En la vista de
    // grimoires debe salir en las tres tarjetas; en la de Kons, una entrada.
    const registro = [kon("kon-dms", { grimoireId: null })];
    const deGrimoires = [
      kon("kon-dms", { grimoireId: "grimoire-corporate" }),
      kon("kon-dms", { grimoireId: "grimoire-sharepoint" }),
      kon("kon-dms", { grimoireId: "grimoire-vekdocs" }),
    ];

    const r = fusionarPorKon(registro, deGrimoires);

    expect(r.soloDeGrimoire).toEqual([]);
    expect(r.registro).toHaveLength(1);
    expect(r.registro[0].grimoireIds).toEqual([
      "grimoire-corporate",
      "grimoire-sharepoint",
      "grimoire-vekdocs",
    ]);
  });

  it("no se queda solo con el primer grimoire", () => {
    // La version anterior hacia `grimoireId ?? g.grimoireId` y kon-dms salia
    // como si fuera unicamente de Corporate. Con siete kons compartidos hoy,
    // eso es mentir en la insignia de siete.
    const registro = [kon("kon-members", { grimoireId: "grimoire-gremius" })];
    const r = fusionarPorKon(registro, [
      kon("kon-members", { grimoireId: "grimoire-viggo" }),
      kon("kon-members", { grimoireId: "grimoire-vekdocs" }),
    ]);

    expect(r.registro[0].grimoireIds).toContain("grimoire-gremius");
    expect(r.registro[0].grimoireIds).toContain("grimoire-viggo");
    expect(r.registro[0].grimoireIds).toContain("grimoire-vekdocs");
  });

  it("empareja aunque una forma lleve prefijo y la otra no", () => {
    const registro = [kon("kon-games")];
    const r = fusionarPorKon(registro, [kon("games", { grimoireId: "grimoire-gremius" })]);

    expect(r.soloDeGrimoire).toEqual([]);
    expect(r.registro[0].grimoireIds).toEqual(["grimoire-gremius"]);
  });

  it("un kon que SOLO trae un grimoire conserva su entrada", () => {
    const r = fusionarPorKon(
      [kon("kon-blog")],
      [kon("kon-esports", { grimoireId: "grimoire-viggo" })]
    );

    expect(r.soloDeGrimoire).toHaveLength(1);
    expect(r.soloDeGrimoire[0].key).toBe("kon-esports");
    expect(r.soloDeGrimoire[0].grimoireIds).toEqual(["grimoire-viggo"]);
  });

  it("ese mismo kon tampoco se duplica si lo traen dos grimoires", () => {
    const r = fusionarPorKon(
      [],
      [
        kon("kon-esports", { grimoireId: "grimoire-viggo" }),
        kon("kon-esports", { grimoireId: "grimoire-gremius" }),
      ]
    );

    expect(r.soloDeGrimoire).toHaveLength(1);
    expect(r.soloDeGrimoire[0].grimoireIds).toEqual(["grimoire-viggo", "grimoire-gremius"]);
  });

  it("no repite el mismo grimoire dos veces", () => {
    const r = fusionarPorKon(
      [kon("kon-dms", { grimoireId: "grimoire-vekdocs" })],
      [kon("kon-dms", { grimoireId: "grimoire-vekdocs" })]
    );

    expect(r.registro[0].grimoireIds).toEqual(["grimoire-vekdocs"]);
  });

  it("las banderas se acumulan: basta que UN grimoire activo lo encienda", () => {
    const r = fusionarPorKon(
      [kon("kon-crm", { isGrimoireActive: false, enabledByGrimoire: false })],
      [
        kon("kon-crm", { grimoireId: "grimoire-default", isGrimoireActive: false }),
        kon("kon-crm", {
          grimoireId: "grimoire-corporate",
          isGrimoireActive: true,
          enabledByGrimoire: true,
        }),
      ]
    );

    expect(r.registro[0].isGrimoireActive).toBe(true);
    expect(r.registro[0].enabledByGrimoire).toBe(true);
  });
});
