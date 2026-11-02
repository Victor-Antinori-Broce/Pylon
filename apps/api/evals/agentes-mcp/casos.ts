/**
 * Los casos: lo que alguien le pide a su agente, y cómo se sabe si lo hizo
 * ============================================================================
 *
 * Cada caso es una petición en lenguaje normal —sin ids ni nombres de
 * herramientas, como la escribiría quien construye su app— y se califica por
 * el ESTADO FINAL de la base, no por lo que el agente cuenta que hizo.
 *
 * Cada uno trae además:
 *
 *   · `preparar` — el estado de partida, montado con las mismas herramientas.
 *   · `oraculo` — una solución de referencia, también con las herramientas del
 *     agente. Si el oráculo no aprueba un caso, lo que está mal es el caso o el
 *     entorno, no el modelo.
 *
 * ── ORIGEN ─────────────────────────────────────────────────────────────────
 *
 * Sintéticos: salen de las recetas de la guía y de las trampas que las pruebas
 * de los kons ya documentan —id de jugador frente a participante, `bestOf`
 * frente a `firstTo`, emparejar con la ronda a medias, corregir un resultado,
 * resincronizar sin perder lo colocado—. Faltan casos reales de usuarios, que
 * son los que más valen.
 */

import type { Entorno } from "./entorno";

export interface Calificacion {
  completado: boolean;
  /** Qué no está como debería. Vacío si todo está bien. */
  fallos: string[];
}

export interface Caso {
  id: string;
  /** `tags[0]` agrupa en el informe; el resto son etiquetas. */
  tags: string[];
  prompt: string;
  preparar?: (e: Entorno) => Promise<void>;
  oraculo: (e: Entorno) => Promise<void>;
  calificar: (e: Entorno) => Promise<Calificacion>;
}

// ── Utilidades ───────────────────────────────────────────────────────────────

const igual = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const deJson = <T>(v: unknown): T => (typeof v === "string" ? JSON.parse(v) : v) as T;

class Revision {
  readonly fallos: string[] = [];

  exigir(cumple: boolean, fallo: string): boolean {
    if (!cumple) this.fallos.push(fallo);
    return cumple;
  }

  get resultado(): Calificacion {
    return { completado: this.fallos.length === 0, fallos: [...this.fallos] };
  }
}

// ── Tier lists ───────────────────────────────────────────────────────────────

interface TierListGuardada {
  slug: string;
  tiers: { id: string; label: string }[];
  items: { id: string; label: string }[];
  placement: Record<string, string>;
}

const fichas = (...nombres: string[]) => nombres.map((n) => ({ id: n.toLowerCase(), label: n }));

async function laTierList(
  e: Entorno,
  rev: Revision,
  titulo: string
): Promise<TierListGuardada | null> {
  const filas = await e.sql(
    `SELECT slug, tiers, items, placement FROM tier_lists
      WHERE kind = 'template' AND lower(trim(title)) = lower($1)`,
    [titulo]
  );
  if (
    !rev.exigir(filas.length === 1, `hay ${filas.length} tier lists «${titulo}», se esperaba 1`)
  ) {
    return null;
  }
  const [f] = filas;
  return {
    slug: String(f.slug),
    tiers: deJson(f.tiers),
    items: deJson(f.items),
    placement: deJson(f.placement) ?? {},
  };
}

/** `undefined` si la ficha no está; `null` si está sin ranquear; si no, la etiqueta de su fila. */
function filaDe(lista: TierListGuardada, nombre: string): string | null | undefined {
  const item = lista.items.find((i) => igual(i.label, nombre));
  if (!item) return undefined;
  const tier = lista.tiers.find((t) => t.id === lista.placement[item.id]);
  return tier ? tier.label.trim().toUpperCase() : null;
}

function exigirFilas(
  rev: Revision,
  lista: TierListGuardada,
  esperado: Record<string, string | null>
) {
  const n = Object.keys(esperado).length;
  rev.exigir(lista.items.length === n, `tiene ${lista.items.length} fichas, se esperaban ${n}`);
  for (const [nombre, fila] of Object.entries(esperado)) {
    const real = filaDe(lista, nombre);
    if (real === undefined) {
      rev.exigir(false, `falta ${nombre}`);
      continue;
    }
    const donde = (f: string | null) => (f ? `en ${f}` : "sin ranquear");
    rev.exigir(real === fila, `${nombre} está ${donde(real)}, se esperaba ${donde(fila)}`);
  }
}

/** La lista de partida de varios casos: Aria, Boro y Ciro, colocados según `colocar`. */
async function metaActual(e: Entorno, colocar: Record<string, string>) {
  await e.herramienta("tierlist_create", {
    title: "Meta actual",
    catalog: fichas("Aria", "Boro", "Ciro"),
  });
  for (const [itemId, tierId] of Object.entries(colocar)) {
    await e.herramienta("tierlist_place", { slug: "meta-actual", itemId, tierId });
  }
}

async function slugDeLista(e: Entorno, titulo: string): Promise<string> {
  const { tierLists } = await e.herramienta("tierlist_list", { search: titulo });
  const lista = (tierLists as { slug: string; title: string }[]).find((l) =>
    igual(l.title, titulo)
  );
  if (!lista) throw new Error(`no hay tier list «${titulo}»`);
  return lista.slug;
}

// ── Torneos ──────────────────────────────────────────────────────────────────

/** El orden de nivel que usan los prompts: en cada set gana el de más nivel. */
const NIVEL = ["Aria", "Boro", "Ciro", "Dara"];
const masFuerte = (a: string, b: string) => (NIVEL.indexOf(a) <= NIVEL.indexOf(b) ? a : b);

interface Lado {
  participantId: string;
  name: string;
}

interface SetDeHerramienta {
  matchId: string;
  round: number;
  sides: Lado[];
}

interface SetGuardado {
  id: string;
  round: number;
  p1: string;
  p2: string;
  winner: string | null;
  s1: number;
  s2: number;
}

async function elTorneo(
  e: Entorno,
  rev: Revision,
  titulo: string
): Promise<{ id: string; bracket_format: string } | null> {
  const filas = await e.sql<{ id: string; bracket_format: string }>(
    "SELECT id, bracket_format FROM esports_tournaments WHERE lower(trim(title)) = lower($1)",
    [titulo]
  );
  if (!rev.exigir(filas.length === 1, `hay ${filas.length} torneos «${titulo}», se esperaba 1`)) {
    return null;
  }
  return filas[0];
}

/** participantId → alias. */
async function aliasDe(e: Entorno, torneoId: string): Promise<Map<string, string>> {
  const filas = await e.sql<{ id: string; alias: string }>(
    `SELECT tp.id, p.alias FROM esports_tournament_participants tp
       JOIN esports_players p ON p.id = tp.player_id
      WHERE tp.tournament_id = $1`,
    [torneoId]
  );
  return new Map(filas.map((f) => [f.id, f.alias]));
}

/** Los sets con los dos lados puestos: sin byes ni huecos por decidir. */
async function setsJugados(e: Entorno, torneoId: string): Promise<SetGuardado[]> {
  return e.sql<SetGuardado>(
    `SELECT id, round, participant_1_id AS p1, participant_2_id AS p2, winner_id AS winner,
            participant_1_score AS s1, participant_2_score AS s2
       FROM esports_matches
      WHERE tournament_id = $1 AND participant_1_id IS NOT NULL AND participant_2_id IS NOT NULL
      ORDER BY round, match_order`,
    [torneoId]
  );
}

const setCon = (sets: SetGuardado[], alias: Map<string, string>, nombre: string) =>
  sets.find((s) => alias.get(s.p1) === nombre || alias.get(s.p2) === nombre);

const ganador = (s: SetGuardado | undefined, alias: Map<string, string>) =>
  s?.winner ? alias.get(s.winner) : undefined;

function exigirInscritos(rev: Revision, alias: Map<string, string>, esperados: string[]) {
  const reales = [...alias.values()].sort();
  const pedidos = [...esperados].sort();
  rev.exigir(
    reales.join(",") === pedidos.join(","),
    `inscritos: ${reales.join(", ") || "nadie"}; se esperaba ${pedidos.join(", ")}`
  );
}

function exigirGanaElFuerte(rev: Revision, sets: SetGuardado[], alias: Map<string, string>) {
  for (const s of sets) {
    const a = alias.get(s.p1) ?? "?";
    const b = alias.get(s.p2) ?? "?";
    const esperado = masFuerte(a, b);
    const real = ganador(s, alias);
    rev.exigir(
      real === esperado,
      `ronda ${s.round}, ${a} contra ${b}: ${real ? `ganó ${real}` : "sin ganador"}, se esperaba ${esperado}`
    );
  }
}

async function torneoPreparado(
  e: Entorno,
  titulo: string,
  bracketFormat: string,
  jugadores: string[],
  extra: Record<string, unknown> = {}
): Promise<string> {
  const t = await e.herramienta("tournament_create", { title: titulo, bracketFormat, ...extra });
  await e.herramienta("tournament_add_players", {
    tournamentId: t.tournamentId,
    aliases: jugadores,
  });
  return t.tournamentId;
}

async function idDelTorneo(e: Entorno, titulo: string): Promise<string> {
  const { tournaments } = await e.herramienta("tournament_list", { search: titulo });
  const t = (tournaments as { tournamentId: string; title: string }[]).find((x) =>
    igual(x.title, titulo)
  );
  if (!t) throw new Error(`no hay torneo «${titulo}»`);
  return t.tournamentId;
}

async function setsAbiertos(e: Entorno, torneoId: string): Promise<SetDeHerramienta[]> {
  const { openSets } = await e.herramienta("tournament_sets", { tournamentId: torneoId });
  return openSets;
}

const ladoDe = (s: SetDeHerramienta, nombre: string) => s.sides.find((l) => l.name === nombre);

async function reportarPorNivel(e: Entorno, torneoId: string) {
  for (const s of await setsAbiertos(e, torneoId)) {
    const gana = ladoDe(s, masFuerte(s.sides[0].name, s.sides[1].name))!;
    await e.herramienta("tournament_report_set", {
      tournamentId: torneoId,
      matchId: s.matchId,
      winnerId: gana.participantId,
    });
  }
}

/** Suizo a 3 rondas con los cuatro de `NIVEL`, con la ronda 1 emparejada. */
async function suizoDelJueves(e: Entorno): Promise<string> {
  const id = await torneoPreparado(e, "Suizo del Jueves", "swiss", NIVEL, { swissRounds: 3 });
  await e.herramienta("tournament_start", { tournamentId: id });
  return id;
}

// ── Emisión ──────────────────────────────────────────────────────────────────

interface SetDeEmision {
  firstTo: number;
  eventTitle: string | null;
  round: string | null;
  sideA: { name?: string } | null;
  sideB: { name?: string } | null;
}

async function elSetDeEmision(e: Entorno, rev: Revision): Promise<SetDeEmision | null> {
  const { docs } = (await e.api("/broadcast/matches")) as { docs: SetDeEmision[] };
  if (!rev.exigir(docs.length === 1, `hay ${docs.length} sets de emisión, se esperaba 1`)) {
    return null;
  }
  return docs[0];
}

function exigirLados(rev: Revision, set: SetDeEmision, nombres: [string, string]) {
  const reales = [set.sideA?.name ?? "", set.sideB?.name ?? ""].map((n) => n.trim());
  const norm = (xs: string[]) =>
    xs
      .map((x) => x.toLowerCase())
      .sort()
      .join(",");
  rev.exigir(
    norm(reales) === norm(nombres),
    `lados: ${reales.join(" contra ")}; se esperaba ${nombres.join(" contra ")}`
  );
}

// ── Casos ────────────────────────────────────────────────────────────────────

export const CASOS: Caso[] = [
  {
    id: "tierlist-crear-y-colocar",
    tags: ["tierlist", "crear"],
    prompt:
      "Crea una tier list llamada «Campeones de Arena» con Aria, Boro, Ciro, Dara y Eko. Pon a Aria y a Boro en S y a Ciro en A; el resto déjalo sin ranquear.",
    async oraculo(e) {
      const lista = await e.herramienta("tierlist_create", {
        title: "Campeones de Arena",
        catalog: fichas("Aria", "Boro", "Ciro", "Dara", "Eko"),
      });
      for (const [itemId, tierId] of [
        ["aria", "s"],
        ["boro", "s"],
        ["ciro", "a"],
      ]) {
        await e.herramienta("tierlist_place", { slug: lista.slug, itemId, tierId });
      }
    },
    async calificar(e) {
      const rev = new Revision();
      const lista = await laTierList(e, rev, "Campeones de Arena");
      if (lista)
        exigirFilas(rev, lista, { Aria: "S", Boro: "S", Ciro: "A", Dara: null, Eko: null });
      return rev.resultado;
    },
  },

  {
    id: "tierlist-nuevos-sin-mover",
    tags: ["tierlist", "sincronizar"],
    prompt:
      "En la tier list «Meta actual» han salido dos personajes nuevos, Fenix y Gala. Añádelos sin mover a nadie de donde está.",
    preparar: (e) => metaActual(e, { aria: "s", boro: "a" }),
    async oraculo(e) {
      const slug = await slugDeLista(e, "Meta actual");
      const actual = await e.herramienta("tierlist_get", { slug });
      const yaEstan = [
        ...actual.tiers.flatMap((t: { items: unknown[] }) => t.items),
        ...actual.unranked,
      ];
      await e.herramienta("tierlist_sync", {
        slug,
        catalog: [...yaEstan, ...fichas("Fenix", "Gala")],
      });
    },
    async calificar(e) {
      const rev = new Revision();
      const lista = await laTierList(e, rev, "Meta actual");
      if (lista) {
        exigirFilas(rev, lista, { Aria: "S", Boro: "A", Ciro: null, Fenix: null, Gala: null });
      }
      return rev.resultado;
    },
  },

  {
    id: "tierlist-sacar-al-pool",
    tags: ["tierlist", "quitar"],
    prompt:
      "Boro ya no está en el meta: sácalo de su fila en «Meta actual» y déjalo sin ranquear, pero que siga en la lista.",
    preparar: (e) => metaActual(e, { aria: "s", boro: "s" }),
    async oraculo(e) {
      const slug = await slugDeLista(e, "Meta actual");
      await e.herramienta("tierlist_place", { slug, itemId: "boro", tierId: null });
    },
    async calificar(e) {
      const rev = new Revision();
      const lista = await laTierList(e, rev, "Meta actual");
      if (lista) exigirFilas(rev, lista, { Aria: "S", Boro: null, Ciro: null });
      return rev.resultado;
    },
  },

  {
    id: "tierlist-intercambiar",
    tags: ["tierlist", "mover"],
    prompt: "En «Meta actual» intercambia a Aria y a Boro: Boro sube a S y Aria baja a A.",
    preparar: (e) => metaActual(e, { aria: "s", boro: "a", ciro: "b" }),
    async oraculo(e) {
      const slug = await slugDeLista(e, "Meta actual");
      await e.herramienta("tierlist_place", { slug, itemId: "boro", tierId: "s" });
      await e.herramienta("tierlist_place", { slug, itemId: "aria", tierId: "a" });
    },
    async calificar(e) {
      const rev = new Revision();
      const lista = await laTierList(e, rev, "Meta actual");
      if (lista) exigirFilas(rev, lista, { Aria: "A", Boro: "S", Ciro: "B" });
      return rev.resultado;
    },
  },

  {
    id: "suizo-de-principio-a-fin",
    tags: ["suizo", "flujo-completo"],
    prompt:
      "Organiza un torneo suizo «Liga de Otoño» a 2 rondas con Aria, Boro, Ciro y Dara, y juégalo entero. El nivel es Aria > Boro > Ciro > Dara: en cada set gana siempre el de más nivel.",
    async oraculo(e) {
      const id = await torneoPreparado(e, "Liga de Otoño", "swiss", NIVEL, { swissRounds: 2 });
      await e.herramienta("tournament_start", { tournamentId: id });
      await reportarPorNivel(e, id);
      await e.herramienta("tournament_next_round", { tournamentId: id });
      await reportarPorNivel(e, id);
    },
    async calificar(e) {
      const rev = new Revision();
      const t = await elTorneo(e, rev, "Liga de Otoño");
      if (!t) return rev.resultado;
      if (
        !rev.exigir(t.bracket_format === "swiss", `el formato es ${t.bracket_format}, no swiss`)
      ) {
        return rev.resultado;
      }
      const alias = await aliasDe(e, t.id);
      exigirInscritos(rev, alias, NIVEL);
      exigirGanaElFuerte(rev, await setsJugados(e, t.id), alias);

      const { data } = (await e.api(`/esports/tournament/${t.id}/swiss`)) as {
        data: {
          round: number;
          totalRounds: number;
          complete: boolean;
          standings: { participantId: string; place: number }[];
        };
      };
      rev.exigir(data.totalRounds === 2, `el suizo es a ${data.totalRounds} rondas, no a 2`);
      rev.exigir(data.complete, `el suizo no está terminado (va por la ronda ${data.round})`);
      const primero = data.standings.find((s) => s.place === 1);
      const lider = primero ? alias.get(primero.participantId) : undefined;
      rev.exigir(lider === "Aria", `primera plaza: ${lider ?? "nadie"}, se esperaba Aria`);
      return rev.resultado;
    },
  },

  {
    id: "suizo-reportar-y-emparejar",
    tags: ["suizo", "reportar"],
    prompt:
      "En el torneo «Suizo del Jueves» ya se jugó la ronda 1. El nivel es Aria > Boro > Ciro > Dara y en cada set ganó el de más nivel. Reporta los resultados y empareja la ronda 2.",
    preparar: async (e) => {
      await suizoDelJueves(e);
    },
    async oraculo(e) {
      const id = await idDelTorneo(e, "Suizo del Jueves");
      await reportarPorNivel(e, id);
      await e.herramienta("tournament_next_round", { tournamentId: id });
    },
    async calificar(e) {
      const rev = new Revision();
      const t = await elTorneo(e, rev, "Suizo del Jueves");
      if (!t) return rev.resultado;
      const alias = await aliasDe(e, t.id);
      const sets = await setsJugados(e, t.id);
      exigirGanaElFuerte(
        rev,
        sets.filter((s) => s.round === 1),
        alias
      );
      const ronda2 = sets.filter((s) => s.round === 2);
      rev.exigir(ronda2.length === 2, `la ronda 2 tiene ${ronda2.length} sets, se esperaban 2`);
      rev.exigir(
        ronda2.every((s) => !s.winner),
        "hay resultados en la ronda 2 y nadie los dio"
      );
      return rev.resultado;
    },
  },

  {
    id: "suizo-ronda-a-medias",
    tags: ["suizo", "no-inventar"],
    prompt:
      "En el «Suizo del Jueves» solo ha terminado el set de Aria, y lo ganó ella. Repórtalo y, si se puede, empareja la ronda 2.",
    preparar: async (e) => {
      await suizoDelJueves(e);
    },
    async oraculo(e) {
      const id = await idDelTorneo(e, "Suizo del Jueves");
      const set = (await setsAbiertos(e, id)).find((s) => ladoDe(s, "Aria"))!;
      await e.herramienta("tournament_report_set", {
        tournamentId: id,
        matchId: set.matchId,
        winnerId: ladoDe(set, "Aria")!.participantId,
      });
    },
    async calificar(e) {
      const rev = new Revision();
      const t = await elTorneo(e, rev, "Suizo del Jueves");
      if (!t) return rev.resultado;
      const alias = await aliasDe(e, t.id);
      const sets = await setsJugados(e, t.id);
      const ronda1 = sets.filter((s) => s.round === 1);
      const deAria = setCon(ronda1, alias, "Aria");
      rev.exigir(ganador(deAria, alias) === "Aria", "el set de Aria no lo tiene ganado Aria");
      const otro = ronda1.find((s) => s !== deAria);
      rev.exigir(
        !!otro && !otro.winner,
        `el otro set de la ronda 1 tiene ganador (${ganador(otro, alias)}) y nadie lo había dado`
      );
      rev.exigir(
        sets.every((s) => s.round === 1),
        "se emparejó la ronda 2 con la ronda 1 a medias"
      );
      return rev.resultado;
    },
  },

  {
    id: "suizo-corregir-resultado",
    tags: ["suizo", "corregir"],
    prompt:
      "Me equivoqué al reportar la ronda 1 del «Suizo del Jueves»: el set de Dara lo ganó Dara, no su rival. Corrígelo.",
    preparar: async (e) => {
      const id = await suizoDelJueves(e);
      await reportarPorNivel(e, id);
    },
    async oraculo(e) {
      const id = await idDelTorneo(e, "Suizo del Jueves");
      const { completedSets } = await e.herramienta("tournament_sets", {
        tournamentId: id,
        includeCompleted: true,
      });
      const set = (completedSets as SetDeHerramienta[]).find((s) => ladoDe(s, "Dara"))!;
      await e.herramienta("tournament_report_set", {
        tournamentId: id,
        matchId: set.matchId,
        winnerId: ladoDe(set, "Dara")!.participantId,
      });
    },
    async calificar(e) {
      const rev = new Revision();
      const t = await elTorneo(e, rev, "Suizo del Jueves");
      if (!t) return rev.resultado;
      const alias = await aliasDe(e, t.id);
      const sets = await setsJugados(e, t.id);
      const ronda1 = sets.filter((s) => s.round === 1);
      const deDara = setCon(ronda1, alias, "Dara");
      const real = ganador(deDara, alias);
      rev.exigir(real === "Dara", `el set de Dara lo tiene ganado ${real ?? "nadie"}`);
      exigirGanaElFuerte(
        rev,
        ronda1.filter((s) => s !== deDara),
        alias
      );
      rev.exigir(
        sets.every((s) => s.round === 1),
        "se emparejó la ronda 2 y nadie lo pidió"
      );
      return rev.resultado;
    },
  },

  {
    id: "eliminacion-crear-8",
    tags: ["eliminacion", "crear"],
    prompt:
      "Crea un torneo de eliminación simple «Copa Relámpago» con 8 jugadores —Aria, Boro, Ciro, Dara, Eko, Fenix, Gala y Hugo— y genera el cuadro.",
    async oraculo(e) {
      const id = await torneoPreparado(e, "Copa Relámpago", "single_elimination", [
        ...NIVEL,
        "Eko",
        "Fenix",
        "Gala",
        "Hugo",
      ]);
      await e.herramienta("tournament_start", { tournamentId: id });
    },
    async calificar(e) {
      const rev = new Revision();
      const t = await elTorneo(e, rev, "Copa Relámpago");
      if (!t) return rev.resultado;
      rev.exigir(
        t.bracket_format === "single_elimination",
        `el formato es ${t.bracket_format}, no single_elimination`
      );
      exigirInscritos(rev, await aliasDe(e, t.id), [...NIVEL, "Eko", "Fenix", "Gala", "Hugo"]);
      const primeraRonda = (await setsJugados(e, t.id)).filter((s) => s.round === 1);
      rev.exigir(
        primeraRonda.length === 4,
        `la primera ronda tiene ${primeraRonda.length} sets, se esperaban 4`
      );
      return rev.resultado;
    },
  },

  {
    id: "eliminacion-semifinal-con-marcador",
    tags: ["eliminacion", "marcador"],
    prompt: "En la «Copa Relámpago», Aria ganó su semifinal 2-1. Repórtalo con el marcador.",
    preparar: async (e) => {
      const id = await torneoPreparado(e, "Copa Relámpago", "single_elimination", NIVEL);
      await e.herramienta("tournament_start", { tournamentId: id });
    },
    async oraculo(e) {
      const id = await idDelTorneo(e, "Copa Relámpago");
      const set = (await setsAbiertos(e, id)).find((s) => ladoDe(s, "Aria"))!;
      const ariaPrimero = set.sides[0].name === "Aria";
      await e.herramienta("tournament_report_set", {
        tournamentId: id,
        matchId: set.matchId,
        winnerId: ladoDe(set, "Aria")!.participantId,
        participant1Score: ariaPrimero ? 2 : 1,
        participant2Score: ariaPrimero ? 1 : 2,
      });
    },
    async calificar(e) {
      const rev = new Revision();
      const t = await elTorneo(e, rev, "Copa Relámpago");
      if (!t) return rev.resultado;
      const alias = await aliasDe(e, t.id);
      const semis = (await setsJugados(e, t.id)).filter((s) => s.round === 1);
      const deAria = setCon(semis, alias, "Aria");
      if (!rev.exigir(!!deAria, "Aria no juega ninguna semifinal") || !deAria) {
        return rev.resultado;
      }
      rev.exigir(ganador(deAria, alias) === "Aria", "la semifinal de Aria no la tiene ganada Aria");
      const ariaPrimero = alias.get(deAria.p1) === "Aria";
      const [suyo, rival] = ariaPrimero ? [deAria.s1, deAria.s2] : [deAria.s2, deAria.s1];
      rev.exigir(suyo === 2 && rival === 1, `el marcador de Aria es ${suyo}-${rival}, no 2-1`);
      rev.exigir(
        semis.filter((s) => s !== deAria).every((s) => !s.winner),
        "la otra semifinal tiene ganador y nadie lo dio"
      );
      const idAria = [...alias].find(([, a]) => a === "Aria")?.[0] ?? "";
      const [final] = await e.sql<{ n: number }>(
        `SELECT count(*)::int AS n FROM esports_matches
          WHERE tournament_id = $1 AND round = 2
            AND (participant_1_id = $2 OR participant_2_id = $2)`,
        [t.id, idAria]
      );
      rev.exigir(final.n === 1, "Aria no ha pasado a la final");
      return rev.resultado;
    },
  },

  {
    id: "liga-todos-contra-todos",
    tags: ["liga", "crear-y-reportar"],
    prompt:
      "Crea una liga todos contra todos «Liga de Invierno» con Aria, Boro y Ciro, genera los enfrentamientos y reporta que Aria le ganó a Boro.",
    async oraculo(e) {
      const id = await torneoPreparado(e, "Liga de Invierno", "round_robin", [
        "Aria",
        "Boro",
        "Ciro",
      ]);
      await e.herramienta("tournament_start", { tournamentId: id });
      const set = (await setsAbiertos(e, id)).find((s) => ladoDe(s, "Aria") && ladoDe(s, "Boro"))!;
      await e.herramienta("tournament_report_set", {
        tournamentId: id,
        matchId: set.matchId,
        winnerId: ladoDe(set, "Aria")!.participantId,
      });
    },
    async calificar(e) {
      const rev = new Revision();
      const t = await elTorneo(e, rev, "Liga de Invierno");
      if (!t) return rev.resultado;
      rev.exigir(
        t.bracket_format === "round_robin",
        `el formato es ${t.bracket_format}, no round_robin`
      );
      const alias = await aliasDe(e, t.id);
      exigirInscritos(rev, alias, ["Aria", "Boro", "Ciro"]);
      const sets = await setsJugados(e, t.id);
      rev.exigir(sets.length === 3, `hay ${sets.length} enfrentamientos; en una liga de 3 son 3`);
      const ariaBoro = sets.find(
        (s) => [alias.get(s.p1), alias.get(s.p2)].sort().join(",") === "Aria,Boro"
      );
      rev.exigir(
        ganador(ariaBoro, alias) === "Aria",
        "el Aria contra Boro no lo tiene ganado Aria"
      );
      rev.exigir(
        sets.filter((s) => s !== ariaBoro).every((s) => !s.winner),
        "hay otros resultados y nadie los dio"
      );
      return rev.resultado;
    },
  },

  {
    id: "checkin-marcar-llegadas",
    tags: ["checkin", "ids"],
    prompt:
      "Boro y Ciro acaban de llegar a la mesa de la «Copa Relámpago». Márcalos como presentes.",
    preparar: async (e) => {
      const id = await torneoPreparado(e, "Copa Relámpago", "single_elimination", NIVEL);
      await e.herramienta("tournament_checkin", { tournamentId: id, action: "open", minutes: 30 });
    },
    async oraculo(e) {
      const id = await idDelTorneo(e, "Copa Relámpago");
      const t = await e.herramienta("tournament_get", { tournamentId: id });
      for (const nombre of ["Boro", "Ciro"]) {
        const p = (t.participants as { participantId: string; name: string }[]).find(
          (x) => x.name === nombre
        )!;
        await e.herramienta("tournament_checkin", {
          tournamentId: id,
          action: "mark",
          participantId: p.participantId,
        });
      }
    },
    async calificar(e) {
      const rev = new Revision();
      const t = await elTorneo(e, rev, "Copa Relámpago");
      if (!t) return rev.resultado;
      const filas = await e.sql<{ alias: string }>(
        `SELECT p.alias FROM esports_tournament_participants tp
           JOIN esports_players p ON p.id = tp.player_id
          WHERE tp.tournament_id = $1 AND tp.checked_in_at IS NOT NULL`,
        [t.id]
      );
      const presentes = filas.map((f) => f.alias).sort();
      rev.exigir(
        presentes.join(",") === "Boro,Ciro",
        `presentes: ${presentes.join(", ") || "nadie"}; se esperaba Boro, Ciro`
      );
      return rev.resultado;
    },
  },

  {
    id: "checkin-quitar-ausentes",
    tags: ["checkin", "confirmar"],
    prompt:
      "Se acabó el check-in de la «Copa Relámpago». Ciérralo y quita del torneo a quien no se presentó. No generes el cuadro todavía.",
    preparar: async (e) => {
      const id = await torneoPreparado(e, "Copa Relámpago", "single_elimination", [
        ...NIVEL,
        "Eko",
      ]);
      await e.herramienta("tournament_checkin", { tournamentId: id, action: "open", minutes: 30 });
      const t = await e.herramienta("tournament_get", { tournamentId: id });
      for (const p of t.participants as { participantId: string; name: string }[]) {
        if (p.name === "Eko") continue;
        await e.herramienta("tournament_checkin", {
          tournamentId: id,
          action: "mark",
          participantId: p.participantId,
        });
      }
    },
    async oraculo(e) {
      const id = await idDelTorneo(e, "Copa Relámpago");
      await e.herramienta("tournament_checkin", { tournamentId: id, action: "close" });
      await e.herramienta("tournament_checkin", {
        tournamentId: id,
        action: "drop",
        confirm: true,
      });
    },
    async calificar(e) {
      const rev = new Revision();
      const t = await elTorneo(e, rev, "Copa Relámpago");
      if (!t) return rev.resultado;
      exigirInscritos(rev, await aliasDe(e, t.id), NIVEL);
      const [ventana] = await e.sql<{ cerrada: boolean | null }>(
        "SELECT check_in_closes_at <= now() AS cerrada FROM esports_tournaments WHERE id = $1",
        [t.id]
      );
      rev.exigir(ventana.cerrada === true, "la ventana de check-in sigue abierta");
      const [sets] = await e.sql<{ n: number }>(
        "SELECT count(*)::int AS n FROM esports_matches WHERE tournament_id = $1",
        [t.id]
      );
      rev.exigir(sets.n === 0, "se generó el cuadro y se pidió que no");
      return rev.resultado;
    },
  },

  {
    id: "emision-gran-final-bo5",
    tags: ["emision", "bestOf"],
    prompt: "Prepara el marcador del stream para la Gran Final: Aria contra Boro, al mejor de 5.",
    async oraculo(e) {
      await e.herramienta("broadcast_create_match", {
        round: "Gran Final",
        bestOf: 5,
        sideA: { name: "Aria" },
        sideB: { name: "Boro" },
      });
    },
    async calificar(e) {
      const rev = new Revision();
      const set = await elSetDeEmision(e, rev);
      if (set) {
        rev.exigir(set.firstTo === 3, `se gana a ${set.firstTo}; al mejor de 5 se gana a 3`);
        exigirLados(rev, set, ["Aria", "Boro"]);
      }
      return rev.resultado;
    },
  },

  {
    id: "emision-evento-bo3",
    tags: ["emision", "campos"],
    prompt:
      "Crea el set del overlay para el evento «Viernes de Pelea», ronda «Winners Final»: Ciro contra Dara, Bo3.",
    async oraculo(e) {
      await e.herramienta("broadcast_create_match", {
        eventTitle: "Viernes de Pelea",
        round: "Winners Final",
        bestOf: 3,
        sideA: { name: "Ciro" },
        sideB: { name: "Dara" },
      });
    },
    async calificar(e) {
      const rev = new Revision();
      const set = await elSetDeEmision(e, rev);
      if (set) {
        rev.exigir(
          igual(set.eventTitle ?? "", "Viernes de Pelea"),
          `evento: «${set.eventTitle ?? ""}»`
        );
        rev.exigir(igual(set.round ?? "", "Winners Final"), `ronda: «${set.round ?? ""}»`);
        rev.exigir(set.firstTo === 2, `se gana a ${set.firstTo}; al mejor de 3 se gana a 2`);
        exigirLados(rev, set, ["Ciro", "Dara"]);
      }
      return rev.resultado;
    },
  },
];
