/**
 * Ajustes MCP de un agente: conjuntos de herramientas (toolsets) y envoltorio
 * del contenido no confiable
 * ============================================================================
 *
 * Se guardan en `agent_identities.mcp_settings` (migración 0052) y el panel los
 * edita (`PUT /api/v1/agents/:id/mcp-settings`). `{}` = lo de siempre.
 *
 * ── TOOLSETS ───────────────────────────────────────────────────────────────
 *
 * Un toolset ESTRECHA lo que `tools/list` anuncia y lo que `tools/call` acepta.
 * Nunca amplía: la herramienta tiene que pasar, además, `allowedTools` y el
 * scope de siempre. Se elige al conectar (`GET /api/mcp?toolset=read,kon:blog`)
 * o como preset del agente en el panel; con los dos, vale la INTERSECCIÓN (la
 * URL solo puede estrechar el preset, no salirse de él).
 *
 *   all        sin restricción (lo de antes)
 *   read       solo lectura: herramientas del núcleo con `mcp:read`,
 *              operaciones GET de los kons y la consulta de propuestas
 *   data       las de datasets y colecciones del núcleo (leer y escribir filas)
 *   core       todas las `kitsuden_*` del núcleo
 *   actions    las acciones del engine (`define_action`)
 *   kons       todas las operaciones del SDK de kons
 *   kon:<id>   las operaciones de UN kon (`kon:blog`, `kon:crm`…)
 *
 * Varios separados por comas = unión. `kitsuden_proposal_status` va en todos:
 * solo lee las propuestas del propio agente y sin ella un agente en modo
 * «proponer» no puede saber qué pasó con lo que propuso.
 *
 * ── ENVOLTORIO ─────────────────────────────────────────────────────────────
 *
 * `untrustedWrap`: `none` (por defecto), `delimiters` u `object`. Ver
 * lib/procedencia.ts y docs/agents/untrusted-content.md.
 */

import { z } from "zod";

export const MODOS_DE_ENVOLTORIO = ["none", "delimiters", "object"] as const;
export type ModoDeEnvoltorio = (typeof MODOS_DE_ENVOLTORIO)[number];

export const TOOLSETS_FIJOS = ["all", "read", "data", "core", "actions", "kons"] as const;
type ToolsetFijo = (typeof TOOLSETS_FIJOS)[number];

/** Un elemento de toolset: uno fijo o `kon:<id>`. */
const ELEMENTO = /^(all|read|data|core|actions|kons|kon:[a-z0-9][a-z0-9-]{0,63})$/;

export interface AjustesMcp {
  toolset?: string;
  untrustedWrap?: ModoDeEnvoltorio;
}

export const EsquemaDeAjustesMcp = z
  .object({
    toolset: z
      .string()
      .max(500)
      .nullable()
      .optional()
      .describe("Default toolset for this agent's MCP sessions (comma-separated). null = all tools."),
    untrustedWrap: z
      .enum(MODOS_DE_ENVOLTORIO)
      .optional()
      .describe("How text written by others is wrapped in tool results. Default: none."),
  })
  .strict();

/** Lee `mcp_settings` de la base sin fiarse de su forma (es jsonb). */
export function leerAjustesMcp(crudo: unknown): AjustesMcp {
  if (!crudo || typeof crudo !== "object" || Array.isArray(crudo)) return {};
  const o = crudo as Record<string, unknown>;
  const salida: AjustesMcp = {};
  if (typeof o.toolset === "string" && parsearToolset(o.toolset).ok) salida.toolset = o.toolset;
  if (typeof o.untrustedWrap === "string" && (MODOS_DE_ENVOLTORIO as readonly string[]).includes(o.untrustedWrap)) {
    salida.untrustedWrap = o.untrustedWrap as ModoDeEnvoltorio;
  }
  return salida;
}

export type Toolset = { todos: true } | { todos: false; fijos: Set<ToolsetFijo>; kons: Set<string> };

/**
 * `"read,kon:blog"` → el conjunto. Vacío o `all` = sin restricción. Un
 * elemento desconocido es un error (mejor un 400 al conectar que una lista
 * entera en silencio, o vacía sin saber por qué).
 */
export function parsearToolset(texto: string | null | undefined): { ok: true; toolset: Toolset } | { ok: false; error: string } {
  const partes = (texto ?? "")
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  if (partes.length === 0) return { ok: true, toolset: { todos: true } };
  const fijos = new Set<ToolsetFijo>();
  const kons = new Set<string>();
  for (const p of partes) {
    if (!ELEMENTO.test(p)) {
      return {
        ok: false,
        error: `Unknown toolset '${p.slice(0, 80)}'. Valid: ${TOOLSETS_FIJOS.join(", ")}, kon:<id> (comma-separated).`,
      };
    }
    if (p === "all") return { ok: true, toolset: { todos: true } };
    if (p.startsWith("kon:")) kons.add(p.slice(4).replace(/^kon-/, ""));
    else fijos.add(p as ToolsetFijo);
  }
  return { ok: true, toolset: { todos: false, fijos, kons } };
}

/** Lo que hace falta saber de una herramienta para colocarla en los toolsets. */
export interface FichaDeHerramienta {
  nombre: string;
  origen: "nucleo" | "accion" | "kon" | "propuestas";
  /** Nombre corto del kon (`blog`) si es una operación del SDK. */
  kon?: string | null;
  /** ¿Solo lee? */
  soloLectura: boolean;
  /** ¿Es de datasets/colecciones del núcleo? */
  deDatos?: boolean;
}

function enUno(f: FichaDeHerramienta, t: ToolsetFijo): boolean {
  switch (t) {
    case "all":
      return true;
    case "read":
      return f.soloLectura;
    case "data":
      return f.origen === "nucleo" && Boolean(f.deDatos);
    case "core":
      return f.origen === "nucleo";
    case "actions":
      return f.origen === "accion";
    case "kons":
      return f.origen === "kon";
  }
}

/** ¿Está la herramienta en el toolset? */
export function enToolset(t: Toolset, f: FichaDeHerramienta): boolean {
  if (t.todos || f.origen === "propuestas") return true;
  for (const fijo of t.fijos) if (enUno(f, fijo)) return true;
  return f.origen === "kon" && Boolean(f.kon) && t.kons.has(f.kon!);
}

/** ¿Está en TODOS los toolsets de la lista? (preset del agente ∩ el de la URL) */
export function enTodos(toolsets: readonly Toolset[], f: FichaDeHerramienta): boolean {
  return toolsets.every((t) => enToolset(t, f));
}

/** Texto canónico de un toolset (para logs y para la respuesta de `initialize`). */
export function textoDeToolset(t: Toolset): string {
  if (t.todos) return "all";
  return [...t.fijos, ...[...t.kons].map((k) => `kon:${k}`)].join(",");
}
