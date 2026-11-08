/**
 * Manifiesto declarativo de un agente — role / goal / backstory → persona (2026-11-07)
 * ============================================================================
 *
 * Crear un agente exigía conocer el vocabulario de scopes (`mcp:connect`,
 * `kon:blog:*`, denegaciones `!...`). Este módulo compila un manifiesto
 * declarativo (estilo CrewAI: rol, objetivo, contexto) en la persona que
 * guarda la API: nombre, systemPrompt, scopes y límites.
 *
 * El manifiesto NUNCA amplía permisos por su cuenta: cada capacidad del
 * mapa tiene asignados los scopes que le corresponden, las entradas
 * desconocidas son un error (frente a un permiso inventado) y el resultado
 * pasa por `normalizarScopes`, la misma validación de siempre.
 *
 *   puede:    ["editar-contenido", "leer-datos"]   → capacidades conocidas
 *             ["kon:wiki:*"]                        → scopes en bruto (finos)
 *   noPuede:  ["borrar-datos"]                      → denegación de capacidad
 *             ["kon:blog:borrar-entrada"]           → denegación fina
 */

import { normalizarScopes } from "./permisos-de-agente";

// ── El manifiesto ────────────────────────────────────────────────────────────

export interface ManifiestoDeAgente {
  /** Nombre del agente (obligatorio). */
  nombre: string;
  /** El ROL: una frase, p. ej. "Editor de guías". */
  rol: string;
  /** El OBJETIVO medible: qué optimiza el agente. */
  objetivo: string;
  /** El CONTEXTO (backstory): personalidad y límites narrativos, opcional. */
  contexto?: string;
  /** Capacidades (`editar-contenido`) o scopes en bruto (`kon:wiki:*`). */
  puede?: string[];
  /** Capacidades o scopes DENEGADOS: ganan a todo lo concedido. */
  noPuede?: string[];
  /** Tipo de agente (mismo vocabulario que POST /api/admin/agents). */
  tipo?: string;
  /** Límite de peticiones por minuto. */
  limiteDePeticiones?: number;
  /** Caducidad de la primera clave, en días. */
  caducaEnDias?: number;
}

// ── El mapa capacidad → scopes ───────────────────────────────────────────────

/**
 * Cada capacidad conocida y los scopes que necesita. Los nombres son los de
 * los presets del panel (`PRESETS_DE_AGENTE`) partidos en capacidades
 * atómicas: componer un agente es componer su lista.
 */
export const MAPA_DE_CAPACIDADES: Readonly<Record<string, readonly string[]>> = {
  conectar: ["mcp:connect"],
  leer: ["mcp:read"],
  escribir: ["mcp:write"],
  "editar-contenido": ["contenido:editar", "kon:blog:*", "kon:blocks:*", "kon:media:*"],
  "leer-datos": ["datasets:*:read"],
  "editar-datos": ["datasets:*:write"],
  "borrar-datos": ["datasets:*:delete"],
  memoria: ["memory:read", "memory:write"],
  brain: ["brain:read", "brain:write"],
  correo: ["mail:send"],
  promocion: ["promotion:propose"],
  "actuar-como-usuario": ["usuario:actuar"],
  administrar: ["admin"],
};

/** Máximo de pasos del plan que un manifiesto puede pedir (los humanos lo leen). */
export const MAX_PUEDE = 50;

// ── La compilación ───────────────────────────────────────────────────────────

export interface PersonaCompilada {
  nombre: string;
  descripcion: string;
  systemPrompt: string;
  scopes: string[];
  type: string;
  rateLimit: number;
}

/** ¿Es este texto un scope en bruto (con `:` o `admin`/negación)? */
function pareceScope(texto: string): boolean {
  return (
    texto.includes(":") ||
    texto === "admin" ||
    texto.startsWith("!") ||
    texto.split(":").every((s) => s === "*")
  );
}

/** Resuelve una lista de capacidades/scopes a scopes, con `!` si `negar`. */
function resolverEntradas(
  entradas: readonly string[] | undefined,
  negar: boolean,
  campo: "puede" | "noPuede"
): string[] {
  const salida: string[] = [];
  for (const cruda of entradas ?? []) {
    const entrada = String(cruda ?? "").trim();
    if (!entrada) throw new Error(`Empty entry in '${campo}'`);
    if (MAPA_DE_CAPACIDADES[entrada]) {
      for (const scope of MAPA_DE_CAPACIDADES[entrada]!) {
        const s = negar ? `!${scope}` : scope;
        if (!salida.includes(s)) salida.push(s);
      }
      continue;
    }
    // En bruto: solo si tiene forma de scope (o ya es una denegación).
    if (pareceScope(entrada)) {
      const sinPrefijo = entrada.startsWith("!") ? entrada.slice(1) : entrada;
      const s = negar ? `!${sinPrefijo}` : entrada;
      if (!salida.includes(s)) salida.push(s);
      continue;
    }
    throw new Error(
      `Unknown capability '${entrada}' in '${campo}'. Known: ${Object.keys(MAPA_DE_CAPACIDADES).join(", ")} — or pass a raw scope like 'kon:wiki:*'`
    );
  }
  return salida;
}

/**
 * Compila el manifiesto a la persona que entiende la API. Lanza con el
 * primer problema; el resultado está normalizado (sin repetidos, validado).
 */
export function compilarManifiestoDeAgente(m: ManifiestoDeAgente): PersonaCompilada {
  if (!m || typeof m !== "object") throw new Error("manifest must be an object");
  const nombre = String(m.nombre ?? "").trim();
  if (!nombre) throw new Error("manifest.nombre is required");
  const rol = String(m.rol ?? "").trim();
  if (!rol) throw new Error("manifest.rol is required");
  const objetivo = String(m.objetivo ?? "").trim();
  if (!objetivo) throw new Error("manifest.objetivo is required");
  if ((m.puede?.length ?? 0) > MAX_PUEDE) {
    throw new Error(`'puede' has more than ${MAX_PUEDE} entries; a human cannot review that`);
  }

  const concesiones = resolverEntradas(m.puede, false, "puede");
  const denegaciones = resolverEntradas(m.noPuede, true, "noPuede");
  // normalizarScopes valida forma, segmentos y tope; es la misma regla de siempre.
  const scopes = normalizarScopes([...concesiones, ...denegaciones]);

  const lineas = [`Eres ${rol}.`, `Objetivo: ${objetivo}.`];
  if (m.contexto) lineas.push(`Contexto: ${String(m.contexto).trim()}`);
  lineas.push(
    `Operas a través de Kitsuden con una identidad de agente acotada: solo usas las herramientas que tus scopes permiten (${scopes.filter((s) => !s.startsWith("!")).join(", ") || "ninguna"}).`,
    "Las acciones sensibles no se ejecutan: quedan como propuestas para que un humano las apruebe. Nunca intentes ampliar tus propios permisos."
  );

  return {
    nombre,
    descripcion: objetivo,
    systemPrompt: lineas.join("\n"),
    scopes,
    type: m.tipo ?? "custom",
    rateLimit: m.limiteDePeticiones ?? 60,
  };
}
