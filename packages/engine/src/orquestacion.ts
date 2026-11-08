/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Kitsuden Engine — Flows (orquestación declarativa de acciones, 2026-11-07)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Un flow encadena acciones como CrewAI Flows, sobre lo que Kitsuden ya tiene:
 * la cola transaccional de Postgres y `defineAction`. Cada paso ES una acción
 * de evento (`event:flow.<id>.<paso>`): el estado viaja en el payload del
 * trabajo, así el flow entrega al menos una vez y se reintenta como cualquier
 * trabajo de la cola.
 *
 *   defineFlow({
 *     id: "bienvenida",
 *     steps: {
 *       // @start: el primer paso; `startFlow("bienvenida", {...})` lo dispara.
 *       cargar: { run: ({ state }) => ({ ... }), next: "notificar" },
 *       // @listen: arranca el flow cuando llega un evento externo.
 *       notificar: { on: "usuario.registrado", run: ..., next: "cerrar" },
 *       // @router: el siguiente paso se decide con el estado.
 *       cerrar:  { run: ..., next: (s) => (s.ok ? undefined : "notificar") },
 *     },
 *   });
 *
 * Semántica:
 *   · El resultado de `run` (si es un objeto) se FUSIONA al estado: el paso
 *     devuelve lo que cambió, no el estado entero.
 *   · `next` ausente o que resuelve a `null` termina el flow (terminal).
 *   · `when` filtra eventos externos: si devuelve false, el evento se ignora
 *     (el flow no arranca).
 *   · Un paso que lanza se reintenta como cualquier trabajo de la cola.
 *
 * La definición se valida al registrar: paso inicial, que cada `next`
 * apunte a un paso que existe, y que el grafo tenga al menos un terminal.
 * `flowGraph(id)` devuelve la forma serializable (para el builder visual).
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { defineAction, type ActionContext } from "./actions";
import { queue } from "./cola";

// ═══════════════════════════════════════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════════════════════════════════════

export interface PasoDeFlow<TEstado> {
  /**
   * @listen: nombre del evento externo que dispara el flow DESDE este paso.
   * Sin `on`, el paso solo corre encadenado por `next` (o como `start`).
   */
  on?: string;
  /** Guarda sobre el estado inicial (eventos externos que no cumplen, ignorados). */
  when?: (state: TEstado) => boolean;
  /** El paso. Recibe el estado, el evento que lo disparó (si lo hubo) y el ctx. */
  run: (input: {
    state: TEstado;
    event: unknown;
    ctx: ActionContext;
  }) => unknown | Promise<unknown>;
  /**
   * @router: el siguiente paso. Nombre, función (estado → nombre | null) o
   * ausente (terminal). Una función que devuelve `null` también termina.
   */
  next?: string | ((state: TEstado) => string | null | undefined);
}

export interface DefinicionDeFlow<TEstado = Record<string, unknown>> {
  /** Identificador: parte de nombres de cola ([a-z0-9_.:-]). */
  id: string;
  description?: string;
  /** Estado con el que arranca cuando lo dispara un evento externo. */
  initialState?: TEstado;
  /** Los pasos, en orden (el orden importa solo para el paso inicial por defecto). */
  steps: Record<string, PasoDeFlow<TEstado>>;
  /** Nombre del paso inicial (por defecto, la primera clave de `steps`). */
  start?: string;
}

/** La forma serializable de un flow (para el builder visual y documentación). */
export interface GrafoDeFlow {
  id: string;
  description?: string;
  start: string;
  steps: Array<{
    name: string;
    listensTo: string | null;
    next: Array<{ to: string; label?: string }>;
    terminal: boolean;
  }>;
}

// ═══════════════════════════════════════════════════════════════════════════
// VALIDACIÓN (pura: testeable sin cola ni base)
// ═══════════════════════════════════════════════════════════════════════════

const NOMBRE_DE_FLOW = /^[a-z0-9][a-z0-9_.:-]{0,80}$/i;

/** El paso inicial de una definición (explícito o la primera clave). */
export function pasoInicialDe(def: Pick<DefinicionDeFlow, "steps" | "start">): string {
  const nombres = Object.keys(def.steps);
  if (def.start) return def.start;
  return nombres[0] ?? "";
}

/**
 * Resuelve el siguiente paso de un `next` (nombre o router). Devuelve el
 * nombre, o `null` si el flow termina aquí.
 */
export function resolverSiguiente<TEstado>(
  next: PasoDeFlow<TEstado>["next"],
  state: TEstado
): string | null {
  if (next === undefined) return null;
  if (typeof next === "string") return next;
  const r = next(state);
  return r ?? null;
}

/** Valida la definición; lanza con el primer problema. Pura. */
export function validarFlow(def: DefinicionDeFlow): void {
  if (!def || typeof def !== "object") throw new Error("flow definition must be an object");
  if (!NOMBRE_DE_FLOW.test(def.id ?? "")) {
    throw new Error(
      `Invalid flow id '${String(def.id)}': letters, digits and _.:- (used in queue names)`
    );
  }
  const nombres = Object.keys(def.steps ?? {});
  if (nombres.length === 0) throw new Error(`Flow '${def.id}' has no steps`);
  const inicial = pasoInicialDe(def);
  if (!def.steps[inicial]) {
    throw new Error(`Flow '${def.id}': start step '${inicial}' does not exist`);
  }
  // Cada next apunta a un paso que existe.
  for (const [nombre, paso] of Object.entries(def.steps)) {
    const sig = paso.next;
    if (typeof sig === "string" && !def.steps[sig]) {
      throw new Error(`Flow '${def.id}': step '${nombre}' points to unknown step '${sig}'`);
    }
  }
  // Al menos un paso terminal (si no, el flow nunca acaba).
  const hayTerminal = nombres.some((n) => def.steps[n]!.next === undefined);
  if (!hayTerminal) {
    throw new Error(`Flow '${def.id}' has no terminal step (a step without 'next')`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// REGISTRO
// ═══════════════════════════════════════════════════════════════════════════

const flows = new Map<string, DefinicionDeFlow>();
/** Evento externo → flows suscritos (un solo action despacha a todos). */
const suscripciones = new Map<string, Array<{ flowId: string; step: string }>>();
/** Demux registrado por evento externo (una sola acción por nombre de evento). */
const demuxRegistrados = new Set<string>();

function colaDelPaso(flowId: string, paso: string): string {
  return `flow.${flowId}.${paso}`;
}

/**
 * Define y registra un flow: una acción de evento por paso y (para los pasos
 * con `on`) la suscripción al evento externo que arranca el flow.
 */
export function defineFlow<TEstado = Record<string, unknown>>(
  def: DefinicionDeFlow<TEstado>
): DefinicionDeFlow<TEstado> {
  validarFlow(def as DefinicionDeFlow);
  if (flows.has(def.id)) {
    throw new Error(`Flow '${def.id}' is already defined`);
  }
  flows.set(def.id, def as DefinicionDeFlow);

  for (const [nombre, paso] of Object.entries(def.steps)) {
    defineAction<{ state: TEstado; event?: unknown }, unknown>({
      trigger: `event:${colaDelPaso(def.id, nombre)}`,
      description: `Flow '${def.id}' step '${nombre}'${paso.on ? ` (on '${paso.on}')` : ""}`,
      run: async (ctx) => {
        const { state, event } = (ctx.payload ?? {}) as { state: TEstado; event?: unknown };
        const salida = await paso.run({ state, event, ctx });
        const nuevoEstado =
          salida && typeof salida === "object" && !Array.isArray(salida)
            ? ({ ...(state as object), ...(salida as object) } as TEstado)
            : state;
        const siguiente = resolverSiguiente(paso.next, nuevoEstado);
        if (siguiente) {
          // El siguiente paso, en la misma cola transaccional de Postgres.
          await ctx.queue.add(
            colaDelPaso(def.id, siguiente),
            siguiente,
            { state: nuevoEstado }
          );
        }
        return { step: nombre, next: siguiente, state: nuevoEstado };
      },
    });

    if (paso.on) {
      const lista = suscripciones.get(paso.on) ?? [];
      lista.push({ flowId: def.id, step: nombre });
      suscripciones.set(paso.on, lista);
      registrarDemux(paso.on);
    }
  }
  return def;
}

/** Un solo despachador por evento externo: reparte a los flows suscritos. */
function registrarDemux(evento: string): void {
  if (demuxRegistrados.has(evento)) return;
  demuxRegistrados.add(evento);
  defineAction<{ [k: string]: unknown }>({
    trigger: `event:${evento}`,
    description: `Distributes external event '${evento}' to subscribed flows`,
    run: async (ctx) => {
      const interesados = suscripciones.get(evento) ?? [];
      for (const { flowId, step } of interesados) {
        const def = flows.get(flowId);
        if (!def) continue;
        const semilla = (def.initialState ?? {}) as Record<string, unknown>;
        const paso = def.steps[step];
        if (paso?.when && !paso.when(semilla as never)) continue;
        await ctx.queue.add(colaDelPaso(flowId, step), step, {
          state: semilla,
          event: ctx.payload,
        });
      }
      return { distributedTo: interesados.length };
    },
  });
}

/**
 * Arranca un flow desde su paso inicial (Programmatic @start). Fuera de una
 * petición también vale: va directo a la cola.
 */
export async function startFlow<TEstado = Record<string, unknown>>(
  id: string,
  seed?: TEstado
): Promise<{ id: string }> {
  const def = flows.get(id);
  if (!def) throw new Error(`Unknown flow '${id}'`);
  const inicial = pasoInicialDe(def);
  const estado = seed ?? def.initialState ?? {};
  return queue.dispatch(colaDelPaso(id, inicial), inicial, { state: estado });
}

/** La forma serializable de un flow registrado (para el builder visual). */
export function flowGraph(id: string): GrafoDeFlow | null {
  const def = flows.get(id);
  if (!def) return null;
  return {
    id: def.id,
    description: def.description,
    start: pasoInicialDe(def),
    steps: Object.entries(def.steps).map(([name, paso]) => {
      const resueltos: Array<{ to: string; label?: string }> = [];
      // Los routers dinámicos se muestran como aristas a cada candidato posible.
      if (typeof paso.next === "string") resueltos.push({ to: paso.next });
      else if (typeof paso.next === "function") {
        for (const candidato of Object.keys(def.steps)) {
          if (candidato !== name) resueltos.push({ to: candidato, label: "router" });
        }
      }
      return {
        name,
        listensTo: paso.on ?? null,
        next: resueltos,
        terminal: paso.next === undefined,
      };
    }),
  };
}

/** Los flows registrados (para listados del admin). */
export function listFlows(): GrafoDeFlow[] {
  return [...flows.keys()].map((id) => flowGraph(id)!).filter(Boolean);
}
