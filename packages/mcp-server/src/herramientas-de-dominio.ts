/**
 * Herramientas MCP de dominio — lo que un agente necesita para construir en el nicho
 * ============================================================================
 *
 * ── LO QUE HABIA ───────────────────────────────────────────────────────────
 *
 * El servidor MCP exponía 27 herramientas y todas eran genéricas:
 * `kitsuden_create_record`, `kitsuden_query_table`, `kitsuden_search_code`…
 * Ninguna para crear un torneo, reportar un set o sincronizar una tier list.
 *
 * Así que un agente que quería reportar un set acababa escribiendo la fila a
 * mano en `esports_matches` —con la herramienta genérica— y se saltaba justo
 * lo que Kitsuden vende: que un Bo5 no se cierra a 1-0, que el suizo desempata
 * bien, que un resultado no se corrige con la ronda siguiente publicada.
 *
 * ── LO QUE HAY AHORA ───────────────────────────────────────────────────────
 *
 * Herramientas con nombre del dominio que llaman a las RUTAS de los kons, no a
 * la base de datos. Las reglas, la autorización y los errores que explican qué
 * falta son los de la API: una herramienta no puede saltárselos porque no
 * tiene otra puerta.
 *
 * Cada descripción dice lo que un agente suele confundir —el id de participante
 * frente al de jugador, `bestOf` frente a `firstTo`— porque es lo que el agente
 * lee justo antes de llamar.
 *
 * ── POR QUE RECIBEN LA API INYECTADA ───────────────────────────────────────
 *
 * `runDomainTool` recibe la función que llama a la API. En el servidor es la
 * petición HTTP con el token del agente; en las pruebas, el router montado en
 * memoria. Así el camino que se prueba es exactamente el que usa un agente.
 */

/** Llama a la API. `path` es relativo a `/api`. Lanza si la respuesta no es 2xx. */
export type LlamadaApi = (path: string, method?: string, body?: unknown) => Promise<unknown>;

// Alias y no interfaz, por lo mismo que `ResultadoDeHerramienta`: el SDK de
// Anthropic tipa `input_schema` con firma de índice.
type EsquemaDeEntrada = {
  type: "object";
  properties: Record<string, Record<string, unknown>>;
  required?: string[];
  additionalProperties: false;
};

export interface DefinicionDeHerramienta {
  name: string;
  description: string;
  inputSchema: EsquemaDeEntrada;
}

// Alias y no interfaz: el SDK de MCP tipa el resultado con firma de índice,
// y una interfaz no la tiene implícita.
export type ResultadoDeHerramienta = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

// ── Utilidades ───────────────────────────────────────────────────────────────

const FILAS_POR_DEFECTO = [
  { id: "s", label: "S", color: "#ff7f7f" },
  { id: "a", label: "A", color: "#ffbf7f" },
  { id: "b", label: "B", color: "#ffdf7f" },
  { id: "c", label: "C", color: "#bfff7f" },
  { id: "d", label: "D", color: "#7fbfff" },
];

function slugDe(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Quita las claves `undefined`: la API rechaza lo que no conoce, pero no hace falta mandar huecos. */
function compacto<T extends Record<string, unknown>>(objeto: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(objeto).filter(([, v]) => v !== undefined)
  ) as Partial<T>;
}

function distancia(a: string, b: string): number {
  const fila = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = fila[0];
    fila[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const arriba = fila[j];
      fila[j] = Math.min(fila[j] + 1, fila[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = arriba;
    }
  }
  return fila[b.length];
}

function parecido(clave: string, validas: string[]): string | null {
  const n = (s: string) => s.toLowerCase().replace(/[_-]/g, "");
  let mejor: string | null = null;
  let menor = Infinity;
  for (const v of validas) {
    if (n(v) === n(clave)) return v;
    const d = distancia(n(clave), n(v));
    if (d < menor) {
      menor = d;
      mejor = v;
    }
  }
  return menor <= Math.max(2, Math.floor(clave.length / 3)) ? mejor : null;
}

/**
 * Los argumentos se comprueban igual que la API comprueba los cuerpos: un
 * argumento que no existe es un error con sugerencia, no un valor que se
 * pierde. Muchos clientes MCP no validan contra `inputSchema` antes de llamar.
 */
function validarArgumentos(
  def: DefinicionDeHerramienta,
  args: Record<string, unknown>
): string | null {
  const validos = Object.keys(def.inputSchema.properties);
  const problemas: string[] = [];

  for (const clave of Object.keys(args)) {
    if (validos.includes(clave)) continue;
    const sugerencia = parecido(clave, validos);
    problemas.push(
      `«${clave}» no existe${sugerencia ? ` (¿quisiste decir «${sugerencia}»?)` : ""}`
    );
  }
  for (const clave of def.inputSchema.required ?? []) {
    if (args[clave] === undefined || args[clave] === null || args[clave] === "") {
      problemas.push(`falta «${clave}»`);
    }
  }

  return problemas.length
    ? `Argumentos inválidos para ${def.name}: ${problemas.join("; ")}. Válidos: ${validos.join(", ")}.`
    : null;
}

// ── Formas de la API que se leen aquí ────────────────────────────────────────

interface TierListApi {
  slug: string;
  title: string;
  catalogDatasetId?: string | null;
  tiers: { id: string; label: string }[];
  items: { id: string; label: string; imageUrl?: string | null }[];
  placement: Record<string, string>;
}

interface TorneoApi {
  id: string;
  title: string;
  status: string;
  bracketFormat: string;
  format?: string;
  swissRounds?: number | null;
  checkInOpensAt?: string | null;
  checkInClosesAt?: string | null;
  participants?: {
    id: string;
    status?: string;
    checkedInAt?: string | null;
    player?: { alias?: string | null } | null;
    team?: { name?: string | null } | null;
  }[];
}

interface FilaDeSetApi {
  id: string;
  round: number;
  participant1Id: string | null;
  participant2Id: string | null;
  winnerId: string | null;
  participant1Score?: number;
  participant2Score?: number;
  status?: string;
}

/**
 * Tier list en la forma que le sirve a un agente: filas con sus elementos y los ids para mover.
 *
 * Cada ficha lleva su `imageUrl` si la tiene. Sin ella, un agente que lee la
 * lista y la resincroniza con lo que leyó mandaba las fichas sin retrato.
 */
function resumenDeTierList(data: TierListApi) {
  const ids = new Set(data.tiers.map((t) => t.id));
  const ficha = (i: TierListApi["items"][number]) => ({
    id: i.id,
    label: i.label,
    ...(i.imageUrl ? { imageUrl: i.imageUrl } : {}),
  });
  return {
    slug: data.slug,
    title: data.title,
    catalogDatasetId: data.catalogDatasetId ?? null,
    tiers: data.tiers.map((t) => ({
      id: t.id,
      label: t.label,
      items: data.items.filter((i) => data.placement[i.id] === t.id).map(ficha),
    })),
    unranked: data.items.filter((i) => !ids.has(data.placement[i.id])).map(ficha),
  };
}

function nombresDe(torneo: TorneoApi): Record<string, string> {
  const nombres: Record<string, string> = {};
  for (const p of torneo.participants ?? []) {
    nombres[p.id] = p.player?.alias ?? p.team?.name ?? p.id.slice(0, 8);
  }
  return nombres;
}

/**
 * Los sets de un torneo, con nombres e ids.
 *
 * Por defecto, solo los que se pueden reportar ahora. Con `incluirResueltos`,
 * también los que ya tienen ganador: sin ellos no había forma de corregir un
 * resultado, porque el id de un set solo salía mientras estaba abierto.
 */
async function setsDe(tournamentId: string, api: LlamadaApi, incluirResueltos = false) {
  const id = encodeURIComponent(tournamentId);
  const torneo = (await api(`/esports/tournaments/${id}`)) as TorneoApi;
  const filas = (await api(`/esports/matches/tournament/${id}`)) as FilaDeSetApi[];
  const nombres = nombresDe(torneo);
  const nombre = (pid: string) => nombres[pid] ?? pid.slice(0, 8);

  // Un bye no se juega: le falta un lado.
  const jugables = filas
    .filter((f) => f.participant1Id && f.participant2Id)
    .sort((a, b) => a.round - b.round);
  const lados = (f: FilaDeSetApi) =>
    [f.participant1Id!, f.participant2Id!].map((pid) => ({
      participantId: pid,
      name: nombre(pid),
    }));

  const abiertos = jugables
    .filter((f) => !f.winnerId && f.status !== "Bye" && f.status !== "Completed")
    .map((f) => ({ matchId: f.id, round: f.round, sides: lados(f) }));

  const resueltos = incluirResueltos
    ? jugables
        .filter((f) => f.winnerId)
        .map((f) => ({
          matchId: f.id,
          round: f.round,
          sides: lados(f),
          winner: { participantId: f.winnerId!, name: nombre(f.winnerId!) },
          // En el orden de `sides`, igual que participant1Score / participant2Score.
          score: [f.participant1Score ?? 0, f.participant2Score ?? 0],
        }))
    : undefined;

  return {
    tournamentId: torneo.id,
    bracketFormat: torneo.bracketFormat,
    openSets: abiertos,
    ...(resueltos ? { completedSets: resueltos } : {}),
    note: abiertos.length
      ? "Reporta cada set con tournament_report_set: su matchId y el participantId del ganador."
      : torneo.bracketFormat === "swiss"
        ? "No quedan sets abiertos: empareja la siguiente ronda con tournament_next_round."
        : "No hay sets abiertos.",
  };
}

// ── Definiciones ─────────────────────────────────────────────────────────────

const cadena = (description: string) => ({ type: "string", description });
const entero = (description: string) => ({ type: "integer", description });

export const DOMAIN_TOOL_DEFINITIONS: DefinicionDeHerramienta[] = [
  {
    name: "kitsuden_guide",
    description:
      "Guía para agentes de este Kitsuden: reglas que se suelen romper, recetas (tier list de personajes, torneo suizo con check-in) y todas las rutas de los kons. Léela antes de construir.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "kitsuden_describe_api",
    description:
      "Lista compacta de las rutas del contrato: método, camino, si pide credencial y los campos del cuerpo (* = obligatorio). Filtra por kon con `kon` (esports, tierlist, broadcast…).",
    inputSchema: {
      type: "object",
      properties: { kon: cadena("Kon a listar, p. ej. `esports`. Sin él, todos.") },
      additionalProperties: false,
    },
  },
  {
    name: "catalog_create",
    description:
      "Crea un catálogo (un dataset): personajes, objetos, cartas… Es de donde una tier list saca sus fichas. Con `withImage` (por defecto sí) añade un campo `image` de tipo URL, que es el que la tier list usa como retrato. Devuelve `datasetId`.",
    inputSchema: {
      type: "object",
      properties: {
        name: cadena("Nombre visible, p. ej. `Personajes`."),
        slug: cadena("Opcional. Se deriva del nombre."),
        description: cadena("Opcional."),
        withImage: {
          type: "boolean",
          description: "Añadir el campo `image` (URL). Por defecto true.",
        },
        fields: {
          type: "array",
          description:
            "Campos extra: `{ name, type, label?, required? }`. Tipos: text, number, url, select, boolean…",
          items: { type: "object" },
        },
      },
      required: ["name"],
      additionalProperties: false,
    },
  },
  {
    name: "catalog_add_entries",
    description:
      'Añade entradas a un catálogo en bloque. Cada entrada lleva `title` (el nombre que sale en la ficha) y el resto de campos del catálogo, p. ej. `{ title: "Aria", image: "https://…" }`.',
    inputSchema: {
      type: "object",
      properties: {
        datasetId: cadena("Id del catálogo (de catalog_create)."),
        entries: {
          type: "array",
          items: { type: "object" },
          description: "Entradas con `title` y sus campos.",
        },
      },
      required: ["datasetId", "entries"],
      additionalProperties: false,
    },
  },
  {
    name: "tierlist_create",
    description:
      "Crea una tier list. Con `catalogDatasetId` queda enlazada a ese catálogo y se rellena sola; con `catalog` recibe las fichas directamente (`[{ id, label, imageUrl? }]`). Sin `tiers` usa S/A/B/C/D. Devuelve las filas con los ids de cada ficha.",
    inputSchema: {
      type: "object",
      properties: {
        title: cadena("Título visible."),
        slug: cadena("Opcional. Minúsculas, números y guiones; se deriva del título."),
        tiers: {
          type: "array",
          items: { type: "object" },
          description: "Filas `{ id, label, color? }` (color #rrggbb). Opcional.",
        },
        catalogDatasetId: cadena("Catálogo del que salen las fichas. Opcional."),
        catalog: {
          type: "array",
          items: { type: "object" },
          description: "Fichas directas, si no hay catálogo.",
        },
      },
      required: ["title"],
      additionalProperties: false,
    },
  },
  {
    name: "tierlist_sync",
    description:
      "Trae lo nuevo del catálogo: lo nuevo entra sin ranquear y lo ya colocado NO se mueve. `catalog` es el catálogo COMPLETO, no solo lo nuevo. Si faltan fichas que se añadieron a mano, la API pide `confirm: true` antes de quitarlas.",
    inputSchema: {
      type: "object",
      properties: {
        slug: cadena("Slug de la tier list."),
        datasetId: cadena("Otro catálogo. Sin él, el que ya tiene."),
        catalog: { type: "array", items: { type: "object" }, description: "Fichas directas." },
        confirm: { type: "boolean", description: "Aceptar perder fichas añadidas a mano." },
      },
      required: ["slug"],
      additionalProperties: false,
    },
  },
  {
    name: "tierlist_place",
    description:
      "Coloca una ficha en una fila. `tierId` es el id de la FILA (s, a…), no su etiqueta; `null` devuelve la ficha al pool sin ranquear. Los ids salen de tierlist_get.",
    inputSchema: {
      type: "object",
      properties: {
        slug: cadena("Slug de la tier list."),
        itemId: cadena("Id de la ficha."),
        tierId: { type: ["string", "null"], description: "Id de la fila, o null para sacarla." },
      },
      required: ["slug", "itemId"],
      additionalProperties: false,
    },
  },
  {
    name: "tierlist_get",
    description:
      "La tier list agrupada por filas, con los elementos sin ranquear y los ids para tierlist_place.",
    inputSchema: {
      type: "object",
      properties: { slug: cadena("Slug de la tier list.") },
      required: ["slug"],
      additionalProperties: false,
    },
  },
  {
    name: "tierlist_list",
    description:
      "Las tier lists que existen, con su `slug` y su título. Cuando te nombran una lista que ya existe, busca aquí su slug: el resto de herramientas de tier list lo piden.",
    inputSchema: {
      type: "object",
      properties: { search: cadena("Opcional: parte del título.") },
      additionalProperties: false,
    },
  },
  {
    name: "tournament_list",
    description:
      "Busca torneos por título y devuelve su `tournamentId` y su estado. Es el primer paso cuando te nombran un torneo que ya existe: el resto de herramientas piden el id, no el título.",
    inputSchema: {
      type: "object",
      properties: {
        search: cadena("Parte del título. Sin él, todos."),
        status: {
          type: "string",
          enum: ["Draft", "Open", "InProgress", "Completed"],
          description: "Opcional.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "tournament_get",
    description:
      "Un torneo con su formato, la ventana de check-in y sus participantes: el `participantId` y el nombre de cada uno, y si ya hizo check-in. Sirve para pasar de un nombre a su participantId antes de marcar el check-in o de reportar.",
    inputSchema: {
      type: "object",
      properties: { tournamentId: cadena("Id del torneo.") },
      required: ["tournamentId"],
      additionalProperties: false,
    },
  },
  {
    name: "tournament_create",
    description:
      "Crea un torneo. `bracketFormat`: single_elimination, double_elimination, round_robin o swiss. Nace `Open` para poder inscribir (la API lo crearía en Draft). Devuelve `tournamentId`.",
    inputSchema: {
      type: "object",
      properties: {
        title: cadena("Título."),
        bracketFormat: {
          type: "string",
          enum: ["single_elimination", "double_elimination", "round_robin", "swiss"],
          description: "Formato del cuadro. Por defecto single_elimination.",
        },
        status: { type: "string", enum: ["Draft", "Open"], description: "Por defecto Open." },
        swissRounds: entero("Solo suizo. Sin él, se recomiendan según los jugadores."),
        maxParticipants: entero("Por defecto 64."),
        format: { type: "string", enum: ["1v1", "Team"], description: "Por defecto 1v1." },
      },
      required: ["title"],
      additionalProperties: false,
    },
  },
  {
    name: "tournament_add_players",
    description:
      "Crea jugadores por alias y los inscribe. Devuelve para cada uno `playerId` y `participantId`: para check-in y para reportar se usa el participantId, NUNCA el playerId. El torneo tiene que estar Open.",
    inputSchema: {
      type: "object",
      properties: {
        tournamentId: cadena("Id del torneo."),
        aliases: {
          type: "array",
          items: { type: "string" },
          description: "Nombres de los jugadores.",
        },
      },
      required: ["tournamentId", "aliases"],
      additionalProperties: false,
    },
  },
  {
    name: "tournament_checkin",
    description:
      "Check-in. `action`: open (abre la ventana `minutes` minutos), close, status, mark / undo (con `participantId`), drop / dq (quita o descalifica a los ausentes). drop va ANTES de empezar y dq después; los dos devuelven el plan salvo con `confirm: true`.",
    inputSchema: {
      type: "object",
      properties: {
        tournamentId: cadena("Id del torneo."),
        action: { type: "string", enum: ["open", "close", "status", "mark", "undo", "drop", "dq"] },
        participantId: cadena("Para mark y undo."),
        minutes: entero("Para open. Por defecto 30."),
        confirm: {
          type: "boolean",
          description: "Para drop y dq: ejecutar en vez de ver el plan.",
        },
      },
      required: ["tournamentId", "action"],
      additionalProperties: false,
    },
  },
  {
    name: "tournament_start",
    description:
      "Genera el cuadro con los inscritos. En suizo empareja SOLO la ronda 1: las siguientes se emparejan con tournament_next_round al acabar cada una. Devuelve los sets abiertos.",
    inputSchema: {
      type: "object",
      properties: {
        tournamentId: cadena("Id del torneo."),
        format: {
          type: "string",
          enum: ["single_elimination", "double_elimination", "round_robin", "swiss"],
          description: "Cambiar el formato al generar. Por defecto el del torneo.",
        },
      },
      required: ["tournamentId"],
      additionalProperties: false,
    },
  },
  {
    name: "tournament_sets",
    description:
      "Sets que se pueden reportar ahora, con los nombres y los ids exactos para tournament_report_set (matchId y participantId de cada lado). Sin byes. Con `includeCompleted: true` añade `completedSets`, los ya resueltos con su ganador y marcador: es lo que hace falta para corregir un resultado.",
    inputSchema: {
      type: "object",
      properties: {
        tournamentId: cadena("Id del torneo."),
        includeCompleted: {
          type: "boolean",
          description: "Incluir también los sets ya resueltos. Por defecto false.",
        },
      },
      required: ["tournamentId"],
      additionalProperties: false,
    },
  },
  {
    name: "tournament_report_set",
    description:
      "Reporta el ganador de un set. `winnerId` es el participantId del ganador (de tournament_sets), no el playerId. El marcador va por lados: `participant1Score` es el del PRIMER lado de `sides` y `participant2Score` el del segundo. Para corregir un set ya resuelto, repórtalo otra vez con su matchId (sale con includeCompleted); si ya no se puede, la API dice por qué. En eliminación avanza el cuadro; en suizo y round robin devuelve la tabla y, al cerrar la ronda, qué hacer después.",
    inputSchema: {
      type: "object",
      properties: {
        tournamentId: cadena("Id del torneo."),
        matchId: cadena("Id del set (de tournament_sets)."),
        winnerId: cadena("participantId del ganador."),
        participant1Score: entero("Opcional. Juegos del primer lado de `sides`."),
        participant2Score: entero("Opcional. Juegos del segundo lado de `sides`."),
      },
      required: ["tournamentId", "matchId", "winnerId"],
      additionalProperties: false,
    },
  },
  {
    name: "tournament_next_round",
    description:
      "Empareja la siguiente ronda de un suizo. Falla (409) si quedan sets sin reportar en la ronda actual. Devuelve los sets nuevos.",
    inputSchema: {
      type: "object",
      properties: { tournamentId: cadena("Id del torneo.") },
      required: ["tournamentId"],
      additionalProperties: false,
    },
  },
  {
    name: "tournament_standings",
    description:
      "Clasificación según el formato: suizo con récord y OMW (su desempate), round robin por puntos, eliminación con quién sigue vivo. Con nombres.",
    inputSchema: {
      type: "object",
      properties: { tournamentId: cadena("Id del torneo.") },
      required: ["tournamentId"],
      additionalProperties: false,
    },
  },
  {
    name: "broadcast_sections",
    description:
      "Qué partes de Broadcast están encendidas. games, draft y live vienen apagadas; si una ruta devuelve 409 con `section`, aquí se ve cuál y cómo encenderla.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "broadcast_create_match",
    description:
      "Crea un enfrentamiento para el overlay. Usa `bestOf` (1, 3, 5, 7, 9): el servidor calcula a cuántas partidas se gana. Los lados son `sideA` y `sideB`, p. ej. `{ name, sponsor?, color? }`.",
    inputSchema: {
      type: "object",
      properties: {
        eventTitle: cadena("Título del evento."),
        round: cadena("Ronda o fase, p. ej. `Winners Final`."),
        bestOf: { type: "integer", enum: [1, 3, 5, 7, 9] },
        profileId: cadena("Perfil de juego (`1v1`, `2xko`, `lol`…). Opcional."),
        sideA: { type: "object", description: "Lado A: `{ name, sponsor?, color? }`." },
        sideB: { type: "object", description: "Lado B." },
      },
      additionalProperties: false,
    },
  },
];

// ── Ejecución ────────────────────────────────────────────────────────────────

type Args = Record<string, unknown>;
type Manejador = (args: Args, api: LlamadaApi) => Promise<unknown>;

const str = (v: unknown) => (typeof v === "string" ? v : undefined);
const enc = (v: unknown) => encodeURIComponent(String(v));

const MANEJADORES: Record<string, Manejador> = {
  async kitsuden_guide(_args, api) {
    return api("/llms.txt");
  },

  async kitsuden_describe_api(args, api) {
    const spec = (await api("/docs/openapi.json")) as {
      paths?: Record<
        string,
        Record<
          string,
          {
            summary?: string;
            tags?: string[];
            security?: Record<string, unknown>[];
            requestBody?: {
              content?: Record<
                string,
                { schema?: { properties?: Record<string, unknown>; required?: string[] } }
              >;
            };
          }
        >
      >;
    };
    const kon = str(args.kon)?.replace(/^kon-/, "");
    const lineas: string[] = [];

    for (const [camino, item] of Object.entries(spec.paths ?? {})) {
      for (const metodo of ["get", "post", "put", "patch", "delete"]) {
        const op = item[metodo];
        if (!op) continue;
        if (kon && !(op.tags ?? []).some((t) => t.replace(/^kon-/, "") === kon)) continue;

        const esquema = Object.values(op.requestBody?.content ?? {})[0]?.schema;
        const campos = esquema?.properties
          ? Object.keys(esquema.properties)
              .map((k) => ((esquema.required ?? []).includes(k) ? `${k}*` : k))
              .join(", ")
          : "";
        const pideCredencial =
          (op.security ?? []).some((s) => Object.keys(s).length > 0) &&
          !(op.security ?? []).some((s) => Object.keys(s).length === 0);
        const resumen =
          op.summary && !op.summary.startsWith(metodo.toUpperCase()) ? ` — ${op.summary}` : "";

        lineas.push(
          `${metodo.toUpperCase()} /api${camino}${resumen}${pideCredencial ? " [credencial]" : ""}${campos ? ` · cuerpo: ${campos}` : ""}`
        );
      }
    }
    return lineas.length ? lineas.join("\n") : `No hay rutas${kon ? ` para «${kon}»` : ""}.`;
  },

  async catalog_create(args, api) {
    const nombre = String(args.name);
    const extra = (Array.isArray(args.fields) ? args.fields : []) as {
      name: string;
      type?: string;
      label?: string;
      required?: boolean;
    }[];
    const schema = [
      // Tipo `url` y no `image`: un campo `image` guarda el id de un medio
      // subido, y aquí se pegan URLs externas. La tier list acepta los dos.
      ...(args.withImage === false ? [] : [{ name: "image", type: "url", label: "Imagen" }]),
      ...extra.map((f) => ({
        name: f.name,
        type: f.type ?? "text",
        label: f.label ?? f.name,
        required: Boolean(f.required),
      })),
    ];
    const fila = (await api(
      "/data-sets",
      "POST",
      compacto({
        name: nombre,
        slug: str(args.slug) ?? slugDe(nombre),
        description: str(args.description),
        schema,
      })
    )) as { id: string; slug: string };
    return {
      datasetId: fila.id,
      slug: fila.slug,
      fields: schema.map((f) => f.name),
      next: "catalog_add_entries",
    };
  },

  async catalog_add_entries(args, api) {
    const entradas = (args.entries as Args[]).map(({ title, ...resto }) => ({
      title,
      data: resto,
    }));
    const filas = (await api(`/data-sets/${enc(args.datasetId)}/entries`, "POST", entradas)) as {
      id: string;
      title: string;
    }[];
    return { added: filas.length, entries: filas.map((f) => ({ id: f.id, title: f.title })) };
  },

  async tierlist_create(args, api) {
    const titulo = String(args.title);
    const slug = str(args.slug) ?? slugDe(titulo);
    await api(
      "/tierlist/templates",
      "PUT",
      compacto({
        slug,
        title: titulo,
        tiers: (args.tiers as unknown[] | undefined) ?? FILAS_POR_DEFECTO,
        catalogDatasetId: str(args.catalogDatasetId),
      })
    );

    if (Array.isArray(args.catalog)) {
      await api(`/tierlist/templates/${enc(slug)}/sync`, "POST", { catalog: args.catalog });
    } else if (str(args.catalogDatasetId)) {
      await api(`/tierlist/templates/${enc(slug)}/sync`, "POST", {
        datasetId: args.catalogDatasetId,
      });
    }

    const actual = (await api(`/tierlist/templates/${enc(slug)}`)) as { data: TierListApi };
    return resumenDeTierList(actual.data);
  },

  async tierlist_sync(args, api) {
    const r = await api(
      `/tierlist/templates/${enc(args.slug)}/sync`,
      "POST",
      compacto({ datasetId: str(args.datasetId), catalog: args.catalog, confirm: args.confirm })
    );
    const actual = (await api(`/tierlist/templates/${enc(args.slug)}`)) as { data: TierListApi };
    return { sync: r, ...resumenDeTierList(actual.data) };
  },

  async tierlist_place(args, api) {
    if (args.tierId === undefined) {
      throw new Error(
        "Falta «tierId»: el id de la fila (s, a…), o null para devolver la ficha al pool."
      );
    }
    const r = (await api(`/tierlist/templates/${enc(args.slug)}/place`, "POST", {
      itemId: args.itemId,
      tierId: args.tierId,
    })) as { data: TierListApi };
    return resumenDeTierList(r.data);
  },

  async tierlist_get(args, api) {
    const r = (await api(`/tierlist/templates/${enc(args.slug)}`)) as { data: TierListApi };
    return resumenDeTierList(r.data);
  },

  async tierlist_list(args, api) {
    const r = (await api("/tierlist/templates")) as { data: { slug: string; title: string }[] };
    const buscar = str(args.search)?.toLowerCase();
    return {
      tierLists: r.data
        .filter((l) => !buscar || l.title.toLowerCase().includes(buscar))
        .map(({ slug, title }) => ({ slug, title })),
    };
  },

  async tournament_list(args, api) {
    const query = new URLSearchParams(
      compacto({ search: str(args.search), status: str(args.status) }) as Record<string, string>
    ).toString();
    const filas = (await api(`/esports/tournaments${query ? `?${query}` : ""}`)) as {
      id: string;
      title: string;
      status: string;
      format: string;
    }[];
    return {
      tournaments: filas.map((t) => ({
        tournamentId: t.id,
        title: t.title,
        status: t.status,
        format: t.format,
      })),
    };
  },

  async tournament_get(args, api) {
    const t = (await api(`/esports/tournaments/${enc(args.tournamentId)}`)) as TorneoApi;
    const nombres = nombresDe(t);
    return {
      tournamentId: t.id,
      title: t.title,
      status: t.status,
      bracketFormat: t.bracketFormat,
      format: t.format,
      swissRounds: t.swissRounds ?? null,
      checkInWindow: { opensAt: t.checkInOpensAt ?? null, closesAt: t.checkInClosesAt ?? null },
      participants: (t.participants ?? []).map((p) => ({
        participantId: p.id,
        name: nombres[p.id],
        status: p.status,
        checkedIn: Boolean(p.checkedInAt),
      })),
      note: "Para check-in y para reportar se usa participantId.",
    };
  },

  async tournament_create(args, api) {
    const t = (await api(
      "/esports/tournaments",
      "POST",
      compacto({
        title: args.title,
        bracketFormat: args.bracketFormat,
        status: args.status ?? "Open",
        swissRounds: args.swissRounds,
        maxParticipants: args.maxParticipants,
        format: args.format,
      })
    )) as { id: string; title: string; status: string; bracketFormat: string };
    return {
      tournamentId: t.id,
      title: t.title,
      status: t.status,
      bracketFormat: t.bracketFormat,
      next: "tournament_add_players",
    };
  },

  async tournament_add_players(args, api) {
    const inscritos: { alias: string; playerId: string; participantId: string }[] = [];
    for (const alias of args.aliases as string[]) {
      const jugador = (await api("/esports/players", "POST", { alias })) as { id: string };
      const participante = (await api(
        `/esports/tournaments/${enc(args.tournamentId)}/register`,
        "POST",
        {
          playerId: jugador.id,
        }
      )) as { id?: string; data?: { id: string } };
      inscritos.push({
        alias,
        playerId: jugador.id,
        participantId: participante.id ?? participante.data?.id ?? "",
      });
    }
    return {
      registered: inscritos,
      note: "participantId es el id para check-in y para reportar. playerId no sirve para eso.",
    };
  },

  async tournament_checkin(args, api) {
    const id = enc(args.tournamentId);
    const estado = () => api(`/esports/tournament/${id}/check-in`);
    const ahora = Date.now();

    switch (args.action) {
      case "open": {
        const minutos = typeof args.minutes === "number" ? args.minutes : 30;
        await api(`/esports/tournament/${id}/check-in/window`, "POST", {
          opensAt: new Date(ahora).toISOString(),
          closesAt: new Date(ahora + minutos * 60_000).toISOString(),
        });
        return estado();
      }
      case "close":
        await api(`/esports/tournament/${id}/check-in/window`, "POST", {
          opensAt: new Date(ahora - 60_000).toISOString(),
          closesAt: new Date(ahora).toISOString(),
        });
        return estado();
      case "mark":
      case "undo":
        if (!str(args.participantId)) throw new Error(`«${args.action}» necesita «participantId».`);
        await api(
          `/esports/participant/${enc(args.participantId)}/check-in`,
          args.action === "mark" ? "POST" : "DELETE"
        );
        return estado();
      case "drop":
      case "dq":
        return api(
          `/esports/tournament/${id}/check-in/resolve`,
          "POST",
          compacto({ action: args.action, confirm: args.confirm === true ? true : undefined })
        );
      case "status":
      default:
        return estado();
    }
  },

  async tournament_start(args, api) {
    await api(
      `/esports/matches/tournament/${enc(args.tournamentId)}/generate`,
      "POST",
      compacto({ format: args.format })
    );
    return setsDe(String(args.tournamentId), api);
  },

  async tournament_sets(args, api) {
    return setsDe(String(args.tournamentId), api, args.includeCompleted === true);
  },

  async tournament_report_set(args, api) {
    return api(
      `/esports/matches/tournament/${enc(args.tournamentId)}/report`,
      "POST",
      compacto({
        matchId: args.matchId,
        winnerId: args.winnerId,
        participant1Score: args.participant1Score,
        participant2Score: args.participant2Score,
      })
    );
  },

  async tournament_next_round(args, api) {
    const r = await api(`/esports/tournament/${enc(args.tournamentId)}/swiss/next-round`, "POST");
    return { round: r, ...(await setsDe(String(args.tournamentId), api)) };
  },

  async tournament_standings(args, api) {
    const id = enc(args.tournamentId);
    const torneo = (await api(`/esports/tournaments/${id}`)) as TorneoApi;
    const nombres = nombresDe(torneo);
    const nombre = (pid: string) => nombres[pid] ?? pid.slice(0, 8);

    if (torneo.bracketFormat === "swiss") {
      const r = (await api(`/esports/tournament/${id}/swiss`)) as {
        data: {
          round: number;
          totalRounds: number;
          complete: boolean;
          standings: { participantId: string; place: number; record: unknown; omw: number }[];
        };
      };
      return {
        bracketFormat: "swiss",
        round: r.data.round,
        totalRounds: r.data.totalRounds,
        complete: r.data.complete,
        standings: r.data.standings.map((s) => ({ ...s, name: nombre(s.participantId) })),
      };
    }
    if (torneo.bracketFormat === "round_robin") {
      return {
        bracketFormat: "round_robin",
        standings: await api(`/esports/matches/tournament/${id}/standings`),
      };
    }
    const cuadro = (await api(`/esports/matches/tournament/${id}/bracket`)) as {
      complete: boolean;
      championId: string | null;
      standings: { participantId: string }[];
    };
    return {
      bracketFormat: torneo.bracketFormat,
      complete: cuadro.complete,
      champion: cuadro.championId ? nombre(cuadro.championId) : null,
      standings: cuadro.standings.map((s) => ({ ...s, name: nombre(s.participantId) })),
    };
  },

  async broadcast_sections(_args, api) {
    return api("/broadcast/sections");
  },

  async broadcast_create_match(args, api) {
    return api(
      "/broadcast/matches",
      "POST",
      compacto({
        eventTitle: args.eventTitle,
        round: args.round,
        bestOf: args.bestOf,
        profileId: args.profileId,
        sideA: args.sideA,
        sideB: args.sideB,
      })
    );
  },
};

/**
 * Ejecuta una herramienta de dominio. Devuelve `null` si el nombre no es de
 * dominio, para que el servidor pruebe con las genéricas.
 */
export async function runDomainTool(
  name: string,
  args: Record<string, unknown>,
  api: LlamadaApi
): Promise<ResultadoDeHerramienta | null> {
  const def = DOMAIN_TOOL_DEFINITIONS.find((d) => d.name === name);
  const manejador = MANEJADORES[name];
  if (!def || !manejador) return null;

  const invalido = validarArgumentos(def, args ?? {});
  if (invalido) return { content: [{ type: "text", text: invalido }], isError: true };

  try {
    const resultado = await manejador(args ?? {}, api);
    const texto = typeof resultado === "string" ? resultado : JSON.stringify(resultado);
    return { content: [{ type: "text", text: texto }] };
  } catch (error) {
    // El mensaje de la API ya dice qué falta —campo desconocido, sección
    // apagada, ronda a medias—: se devuelve tal cual, sin envolverlo en otro.
    return {
      content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
      isError: true,
    };
  }
}
