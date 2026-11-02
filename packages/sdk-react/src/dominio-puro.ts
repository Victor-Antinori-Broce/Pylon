/**
 * Dominio sin React — la parte de los hooks que se puede probar sola
 * ============================================================================
 *
 * Los hooks de `dominio.ts` son finos a propósito: piden, guardan estado y
 * llaman a esto. Aquí vive lo que tiene reglas —cómo se agrupa una tier list,
 * qué set está abierto, qué toca después en un suizo— sin depender de React,
 * para que una prueba lo ejercite sin montar componentes.
 *
 * Es también la parte que un agente suele escribir mal cuando la hace desde
 * cero: un elemento colocado en una fila que ya no existe, un bye tratado como
 * set jugable, emparejar la ronda siguiente con la actual a medias.
 */

// ── Llamar a la API ──────────────────────────────────────────────────────────

export interface KitsudenConfig {
  /** URL base de la API, con `/api` al final. */
  baseUrl?: string;
  /** Token de agente (`kitsuden_agent_*`). Sin él se usan las cookies. */
  token?: string;
  /** Para pruebas o entornos sin `fetch` global. */
  fetch?: typeof fetch;
}

/** Error de la API con el cuerpo intacto y las sugerencias en el mensaje. */
export class KitsudenRequestError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
    readonly method: string,
    readonly path: string
  ) {
    super(mensajeDeError(status, body, method, path));
    this.name = "KitsudenRequestError";
  }
}

interface CuerpoDeError {
  error?:
    | string
    | {
        message?: string;
        details?: { unknownKeys?: { key: string; didYouMean: string | null }[] };
      };
  message?: string;
}

function mensajeDeError(status: number, body: unknown, method: string, path: string): string {
  const b = (body ?? null) as CuerpoDeError | null;
  const principal =
    typeof b?.error === "string" ? b.error : (b?.error?.message ?? b?.message ?? `HTTP ${status}`);
  const desconocidas = typeof b?.error === "object" ? (b.error.details?.unknownKeys ?? []) : [];
  const pistas = desconocidas.map((k) =>
    k.didYouMean ? `«${k.key}» → «${k.didYouMean}»` : `«${k.key}» no existe`
  );
  return `${method} ${path} → ${status}: ${principal}${pistas.length ? ` (${pistas.join(", ")})` : ""}`;
}

export async function pedirAKitsuden<T>(
  config: KitsudenConfig,
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const base = (config.baseUrl ?? "/api").replace(/\/+$/, "");
  const headers: Record<string, string> = { accept: "application/json" };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (config.token) headers.authorization = `Bearer ${config.token}`;

  const res = await (config.fetch ?? fetch)(`${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "include",
  });

  const texto = await res.text();
  let datos: unknown = texto;
  try {
    datos = texto ? JSON.parse(texto) : null;
  } catch {
    // No era JSON.
  }
  if (!res.ok) throw new KitsudenRequestError(res.status, datos, method, path);
  return datos as T;
}

// ── Tier lists ───────────────────────────────────────────────────────────────

export interface TierDef {
  id: string;
  label: string;
  color?: string;
}

export interface TierItem {
  id: string;
  label: string;
  imageUrl?: string | null;
}

export interface TierListData {
  slug: string;
  title: string;
  tiers: TierDef[];
  items: TierItem[];
  /** `itemId → tierId`. Lo que no está aquí va sin ranquear. */
  placement: Record<string, string>;
  catalogDatasetId?: string | null;
}

export interface FilaDeTier {
  tier: TierDef;
  items: TierItem[];
}

export interface VistaDeTierList {
  filas: FilaDeTier[];
  sinRanquear: TierItem[];
}

/**
 * Agrupa los elementos por fila, en el orden de las filas.
 *
 * Un elemento colocado en una fila que ya no existe va SIN RANQUEAR, no
 * desaparece: si alguien borra la fila «F», sus personajes tienen que seguir
 * a la vista para volver a colocarlos.
 */
export function vistaDeTierList(lista: TierListData): VistaDeTierList {
  const filas = lista.tiers.map((tier) => ({ tier, items: [] as TierItem[] }));
  const porId = new Map(filas.map((f) => [f.tier.id, f]));
  const sinRanquear: TierItem[] = [];

  for (const item of lista.items) {
    const fila = porId.get(lista.placement[item.id]);
    if (fila) fila.items.push(item);
    else sinRanquear.push(item);
  }

  return { filas, sinRanquear };
}

/** Mueve un elemento en local, para pintar el cambio antes de que responda la API. */
export function moverEnTierList(
  lista: TierListData,
  itemId: string,
  tierId: string | null
): TierListData {
  const placement = { ...lista.placement };
  if (tierId === null) delete placement[itemId];
  else placement[itemId] = tierId;
  return { ...lista, placement };
}

// ── Torneos ──────────────────────────────────────────────────────────────────

export interface ParticipanteDeTorneo {
  id: string;
  player?: { alias?: string | null } | null;
  team?: { name?: string | null } | null;
}

export interface TorneoDetalle {
  id: string;
  title: string;
  status: string;
  bracketFormat: string;
  participants?: ParticipanteDeTorneo[];
}

export interface FilaDeSet {
  id: string;
  round: number;
  participant1Id: string | null;
  participant2Id: string | null;
  winnerId: string | null;
  status?: string;
  bracketMatchId?: string | null;
}

export interface SetAbierto {
  /** Id de la FILA: es lo que se manda al reportar. */
  matchId: string;
  ronda: number;
  lados: [{ id: string; nombre: string }, { id: string; nombre: string }];
}

/** `participantId → nombre visible`. Jugador o equipo; si no hay, un trozo del id. */
export function nombresDeParticipantes(
  torneo: Pick<TorneoDetalle, "participants">
): Record<string, string> {
  const nombres: Record<string, string> = {};
  for (const p of torneo.participants ?? []) {
    nombres[p.id] = p.player?.alias ?? p.team?.name ?? p.id.slice(0, 8);
  }
  return nombres;
}

/**
 * Los sets que se pueden reportar ahora mismo.
 *
 * Fuera los que ya tienen ganador y los BYES: un bye está resuelto desde que se
 * empareja y ofrecerlo para reportar invita a «corregir» algo que no se jugó.
 * También fuera los que aún esperan a un ocupante (TBD en un cuadro).
 */
export function setsAbiertos(filas: FilaDeSet[], nombres: Record<string, string>): SetAbierto[] {
  return filas
    .filter((f) => !f.winnerId && f.participant1Id && f.participant2Id)
    .filter((f) => f.status !== "Bye" && f.status !== "Completed")
    .sort((a, b) => a.round - b.round)
    .map((f) => ({
      matchId: f.id,
      ronda: f.round,
      lados: [
        {
          id: f.participant1Id!,
          nombre: nombres[f.participant1Id!] ?? f.participant1Id!.slice(0, 8),
        },
        {
          id: f.participant2Id!,
          nombre: nombres[f.participant2Id!] ?? f.participant2Id!.slice(0, 8),
        },
      ],
    }));
}

export interface EstadoDelSuizo {
  round: number;
  totalRounds: number;
  complete: boolean;
}

/**
 * Qué toca hacer en un suizo.
 *
 * Emparejar con sets de la ronda actual sin resultado lo rechaza la API —
 * obligaría a deshacer cruces—, así que un botón de «siguiente ronda» debería
 * salir solo cuando esto dice `emparejar`.
 */
export function siguientePasoDelSuizo(
  estado: EstadoDelSuizo,
  setsPendientes: number
): "reportar" | "emparejar" | "terminado" {
  if (estado.complete) return "terminado";
  if (setsPendientes > 0) return "reportar";
  return "emparejar";
}
