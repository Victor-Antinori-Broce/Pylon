/**
 * Una cabina que necesita un registro tiene que saber elegirlo
 * ============================================================================
 *
 * ── LO QUE SE VEIA ─────────────────────────────────────────────────────────
 *
 * El panel del TO de esports, abierto en un torneo real:
 *
 *     CHECK-IN     —/—        (contador vacío)
 *     FASES        (ninguna)
 *     SETS         (ninguno)   «Pulsa el nombre del ganador»
 *
 * con ocho botones de aspecto normal. Ninguno hacía nada.
 *
 * ── POR QUE ────────────────────────────────────────────────────────────────
 *
 * El id del torneo se leía así:
 *
 *     this.#ctx?.params?.tournamentId ?? this.#ctx?.recordId ?? null
 *
 * y `AdminViewContext` —lo que `CustomViewHost` inyecta de verdad— es:
 *
 *     { version, konId, viewId, apiBase, theme, locale }
 *
 * Ni `params` ni `recordId`. La vista está registrada como PESTAÑA del kon, no
 * como vista de un registro, así que nunca hay uno seleccionado. El id era
 * `null` siempre y `#load()` abría con `if (!id) return;`: salía en silencio.
 *
 * La pantalla no estaba rota por fuera. Estaba muerta por dentro, y con la
 * única pista posible —el contador en «—/—»— que se lee como «aún no hay
 * datos» y no como «esto no va a funcionar nunca».
 *
 * El mismo fallo, con el mismo `??` y el mismo `return`, estaba en la cabina
 * MOBA (`params.gameId`). Por eso este guardián mira TODAS las vistas de tipo
 * `element`, no la que se acaba de arreglar: es la lección que dejaron los
 * cuatro borradores que seguían filtrándose después de «arreglar la fuga».
 *
 * ── LA REGLA ───────────────────────────────────────────────────────────────
 *
 * Si una vista necesita un registro para existir y el host no se lo pasa,
 * tiene que pedirlo ella. `params` puede seguir teniendo prioridad —por si
 * algún día la vista se abre desde un registro— pero no puede ser la ÚNICA
 * fuente.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { sinComentarios } from "./helpers/comentarios";

const RAIZ = join(__dirname, "..", "..");
const CONTRATO = join(RAIZ, "packages", "shared", "src", "admin-view.ts");

/** Las cabinas: vistas `type: "element"` que operan sobre un registro. */
const CABINAS = [
  {
    nombre: "panel del TO (esports)",
    fichero: join(RAIZ, "packages", "kons", "kon-esports", "admin", "to-panel.js"),
    listado: "tournaments",
  },
  {
    nombre: "cabina en vivo de Broadcast",
    fichero: join(RAIZ, "packages", "kons", "kon-broadcast", "admin", "live-control.js"),
    listado: "matches",
  },
];

describe("el contrato del host no trae registro", () => {
  const contrato = sinComentarios(readFileSync(CONTRATO, "utf-8"));

  it("`AdminViewContext` no tiene `params` ni `recordId`", () => {
    const iface = contrato.slice(
      contrato.indexOf("export interface AdminViewContext"),
      contrato.indexOf("export function createViewContext")
    );

    expect(iface.length, "no se encontró `AdminViewContext`").toBeGreaterThan(0);

    /**
     * Este es el hecho del que cuelga todo lo demás. Si algún día el contrato
     * SÍ incluye el registro, esta prueba falla y toca revisar las cabinas —
     * que es justo lo que hay que hacer, no seguir con un selector redundante.
     */
    for (const campo of ["params", "recordId"]) {
      expect(
        new RegExp(`^\\s*${campo}[?]?:`, "m").test(iface),
        `\`AdminViewContext\` declara \`${campo}\`. Las cabinas se escribieron ` +
          `dando por hecho que existía; si ahora existe de verdad, revisa si el ` +
          `selector sigue haciendo falta en vez de dejar los dos caminos.`
      ).toBe(false);
    }
  });

  it("`createViewContext` tampoco lo añade a mano", () => {
    const fn = contrato.slice(contrato.indexOf("export function createViewContext"));
    expect(fn).not.toContain("recordId");
  });
});

describe.each(CABINAS)("$nombre", ({ fichero, listado }) => {
  const fuente = readFileSync(fichero, "utf-8");
  const codigo = sinComentarios(fuente);

  it("no depende solo de un `params` que nunca llega", () => {
    /**
     * Se busca el patrón exacto que estaba roto: el id sacado de `ctx` y de
     * nada más. Con un selector delante, `params` puede quedarse como
     * prioridad — lo que no puede es ser el único camino.
     */
    const soloDelContexto = /this\.#ctx\?\.params\?\.\w+\s*\?\?\s*this\.#ctx\?\.recordId/;

    expect(
      soloDelContexto.test(codigo),
      "el id sale únicamente de `ctx.params`/`ctx.recordId`, y el contrato no " +
        "trae ninguno de los dos: será `null` siempre y la cabina no cargará nada."
    ).toBe(false);
  });

  it("ofrece elegir el registro", () => {
    expect(
      codigo.includes("data-pick-"),
      "la cabina tiene que tener su propio selector: es la única forma de que " +
        "sepa sobre qué registro trabaja."
    ).toBe(true);

    expect(codigo, "y algo que lo rellene al arrancar").toContain("async #boot()");
    expect(
      codigo,
      `el selector se llena de la API (\`${listado}\`), no de una lista escrita a mano`
    ).toContain(listado);
  });

  it("cuando no hay nada que elegir, lo dice y dice dónde se crea", () => {
    /**
     * Un desplegable vacío no distingue «no hay ninguno» de «no cargó». Es la
     * lección del editor de tier lists: el estado vacío es justo cuando alguien
     * necesita saber qué hacer.
     */
    expect(codigo).toContain("data-pick-hint");
    expect(
      /No hay ning[uú]n/.test(codigo),
      "el estado vacío tiene que nombrarse en texto, no dejarse en blanco."
    ).toBe(true);
  });
});

describe("los colores del tema son canales, no colores", () => {
  /**
   * ── LO QUE SE VEIA ────────────────────────────────────────────────────────
   *
   * El botón principal del panel del TO —«Plantilla FGC»— salía negro sobre
   * negro, ilegible.
   *
   * ── POR QUE ───────────────────────────────────────────────────────────────
   *
   * El tema define sus variables como CANALES sueltos, para poder modular la
   * opacidad sin duplicar la paleta:
   *
   *     "--kitsuden-accent": "168 85 247"   →   rgb(var(--kitsuden-accent) / .5)
   *
   * Así que `background: var(--kitsuden-accent, #00d2a8)` se resuelve a
   * `background: 168 85 247`, que no es un color: la declaración se descarta
   * entera. Y el respaldo del `var()` NO salva nada, porque solo actúa cuando la
   * variable no está definida — no cuando su valor no sirve ahí.
   *
   * Medido en el admin real, con el tema del usuario:
   *
   *     var(--kitsuden-accent, #00d2a8)        → rgba(0, 0, 0, 0)     ← nada
   *     rgb(var(--kitsuden-accent, 0 210 168)) → rgb(168, 85, 247)
   *
   * Sin fondo y con `color: #04120f` encima, el botón desaparecía. Y como es un
   * fallo silencioso —ni consola ni error— sobrevive a cualquier repaso que no
   * mire el color calculado.
   *
   * Las vistas de `kon-broadcast` ya lo hacían bien desde el principio; las de
   * esports, MOBA y tier lists, no. Tres de cinco.
   */
  const VISTAS = [
    join(RAIZ, "packages", "kons", "kon-esports", "admin", "to-panel.js"),
    join(RAIZ, "packages", "kons", "kon-broadcast", "admin", "live-control.js"),
    join(RAIZ, "packages", "kons", "kon-tierlist", "admin", "tierlist-editor.js"),
    join(RAIZ, "packages", "kons", "kon-broadcast", "admin", "scoreboard.js"),
    join(RAIZ, "packages", "kons", "kon-broadcast", "admin", "clasificaciones.js"),
  ];

  /** Las que el tema define como canales. `radius` y `font` no son colores. */
  const DE_COLOR =
    "accent|accent-2|accent-dim|accent-hover|border|bg|surface|surface-2|card|muted|" +
    "fg|text|text-dim|subtle|danger|amber|yellow|green|cyan|pink|purple|primary|secondary";

  const DECLARACION = new RegExp(
    `(?:background|background-color|color|border|border-[a-z]+|outline|fill|stroke|box-shadow)` +
      `\\s*:[^;{}]*?var\\(\\s*--kitsuden-(?:${DE_COLOR})\\b[^;{}]*`,
    "g"
  );

  it.each(VISTAS)("%s envuelve el color en rgb()", (fichero) => {
    // Comentarios fuera: estos ficheros DOCUMENTAN el patrón roto para explicar
    // por qué no se usa. Un guardián que castiga la nota que explica su propia
    // regla enseña a ignorarlo.
    const codigo = sinComentarios(readFileSync(fichero, "utf-8"));

    const crudas = [...codigo.matchAll(DECLARACION)]
      .map((m) => m[0].trim())
      .filter((d) => !d.includes("rgb("));

    expect(
      crudas,
      `Estas declaraciones usan una variable del tema como si fuera un color:\n` +
        crudas.map((d) => `    ${d}`).join("\n") +
        `\n\nEl tema las define como canales ("168 85 247"), así que la ` +
        `declaración es inválida y se descarta —sin error—. Envuélvelas: ` +
        `\`rgb(var(--kitsuden-accent, 0 210 168) / 1)\`.`
    ).toEqual([]);
  });

  it("el respaldo también va en canales", () => {
    /**
     * `rgb(var(--x, #00d2a8))` es igual de inválido cuando la variable no está
     * definida: el respaldo se sustituye tal cual dentro del `rgb()`.
     */
    for (const fichero of VISTAS) {
      const codigo = sinComentarios(readFileSync(fichero, "utf-8"));
      const malos = [
        ...codigo.matchAll(/rgb\(\s*var\(\s*--kitsuden-[a-z0-9-]+\s*,\s*(#[0-9a-fA-F]+)/g),
      ];

      expect(
        malos.map((m) => m[0]),
        `en ${fichero} el respaldo dentro de \`rgb()\` es un hex; tiene que ser ` +
          `"r g b" para que el resultado siga siendo un color válido.`
      ).toEqual([]);
    }
  });
});

describe("el panel del TO no sirve para un solo formato", () => {
  /**
   * ── LO QUE PASABA ─────────────────────────────────────────────────────────
   *
   * El panel pedía siempre `GET /matches/tournament/:id/bracket`. Y esa ruta
   * LANZA cuando el torneo no es de eliminación:
   *
   *     if (tournament.bracketFormat === "swiss") {
   *       throw new Error("[bracket] este torneo es suizo; usa swiss.persistence");
   *
   * Así que abrir un suizo dejaba ese mensaje —cierto, e inútil para quien está
   * llevando un torneo— en la caja de errores, y ni un set a la vista.
   *
   * ── Y LO QUE NO PODIA HACER ───────────────────────────────────────────────
   *
   * En suizo no había ruta segura para reportar. `applyResult` pasa por
   * `loadBracket` (lanza), y la genérica `PUT /matches/:id` daba el TORNEO por
   * terminado cuando el set no tiene `nextMatchId` —en suizo, siempre—.
   * Reportar el primer set de la ronda 1 cerraba el torneo, así que el panel
   * enseñaba esos sets en solo lectura.
   *
   * Ya no: `POST /matches/tournament/:id/report` tiene su rama de suizo, y el
   * `PUT` rechaza suizo y round robin con 409 diciendo qué ruta usar.
   */
  const PANEL = join(RAIZ, "packages", "kons", "kon-esports", "admin", "to-panel.js");
  const RUTAS = join(RAIZ, "packages", "kons", "kon-esports", "esports.routes.ts");
  const SUIZO = join(RAIZ, "packages", "kons", "kon-esports", "swiss.persistence.ts");
  const panel = sinComentarios(readFileSync(PANEL, "utf-8"));

  it("la premisa sigue siendo cierta: el cuadro lanza fuera de eliminación", () => {
    /**
     * Si algún día `loadBracket` deja de lanzar, esta prueba falla y toca
     * revisar si el reparto por formato sigue haciendo falta — en vez de
     * arrastrarlo sin saber por qué está.
     */
    const persistencia = readFileSync(
      join(RAIZ, "packages", "kons", "kon-esports", "bracket.persistence.ts"),
      "utf-8"
    );
    expect(persistencia).toContain("este torneo es suizo");
    expect(persistencia).toContain("este torneo es round robin");
  });

  it("`PUT /matches/:id` ya no puede cerrar un torneo suizo ni round robin", () => {
    /**
     * Esa ruta da el torneo por terminado cuando el set no encadena con otro.
     * En eliminación es la gran final; en suizo y round robin son todos los
     * sets. Tiene que mirar el formato ANTES de escribir nada.
     */
    const rutas = readFileSync(RUTAS, "utf-8");
    const put = rutas.slice(rutas.indexOf('id: "reportar-set-manual"'));
    const cuerpo = put.slice(0, put.indexOf(".update(matches)"));

    expect(cuerpo, "el PUT tiene que mirar el formato antes de tocar la fila").toContain('"swiss"');
    expect(cuerpo).toContain('"round_robin"');
    expect(cuerpo, "y responder 409 con la ruta buena").toContain("409");
    expect(cuerpo).toContain("/report");
  });

  it("la ruta de reporte tiene su rama de suizo", () => {
    const rutas = readFileSync(RUTAS, "utf-8");
    const inicio = rutas.indexOf('"/tournament/:tournamentId/report"');
    expect(inicio, "no se encontró la ruta de reporte").toBeGreaterThan(-1);

    const cuerpo = rutas.slice(inicio, rutas.indexOf("// ── Round robin", inicio));
    expect(cuerpo).toContain('tournament.bracketFormat === "swiss"');
    expect(cuerpo, "la tabla se recalcula de las filas, no se inventa").toContain("loadSwissState");
    // Operación del SDK de kons: el esquema se declara y lo aplica el SDK
    expect(cuerpo, "el cuerpo pasa por esquema: un campo mal nombrado no puede perderse").toContain(
      "cuerpo: ReportResult"
    );
  });

  it("el panel reparte por formato en vez de pedir siempre el cuadro", () => {
    expect(panel).toContain("bracketFormat");
    expect(panel, "tiene que haber una rama para suizo").toContain('=== "swiss"');
    expect(panel, "y otra para round robin").toContain('=== "round_robin"');
  });

  it("un suizo se reporta desde el panel, por la fila", () => {
    /**
     * Con la rama de suizo, sus sets se pulsan como cualquier otro. Se manda
     * `matchId` —la fila— porque con fases el id del motor puede repetirse.
     */
    expect(panel).toContain('=== "swiss") return this.#setsDeFilas(false)');
    expect(panel).toContain("matchId: match.rowId");
  });

  it("el suizo sí puede avanzar de ronda y ver su corte", () => {
    // Lo que sí es seguro: emparejar y consultar. Son rutas propias del suizo.
    expect(panel).toContain("swiss/next-round");
    expect(panel).toContain("swiss/cut");
    expect(panel, "el desempate del suizo es OMW; sin él la tabla parece arbitraria").toContain(
      "OMW"
    );
  });
});
