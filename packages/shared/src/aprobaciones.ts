/**
 * Aprobación humana de lo que piden los agentes (fase F) — el CONTRATO puro
 * ============================================================================
 *
 * Una petición de un AGENTE que «necesita aprobación» no se ejecuta: se guarda
 * como PROPUESTA y la API responde `202` con `KITSUDEN_E_APPROVAL_REQUIRED`,
 * el id y la URL donde mirar su estado. Un humano del equipo la aprueba (y
 * entonces se ejecuta con la identidad del agente, dejando constancia del
 * humano) o la rechaza (y no se ejecuta nunca). Los humanos nunca pasan por
 * aquí.
 *
 * Aquí vive lo que comparten la API, el panel y los tests: los tipos, la
 * configuración por defecto (APAGADA: nada cambia hasta que un admin la
 * enciende), los patrones de las rutas legadas y la TABLA DE DECISIÓN. La
 * ejecución está en `apps/api/src/lib/aprobaciones.ts`; la guía pública en
 * `docs/agents/approvals.md`.
 *
 * ── LA DECISIÓN (operación → agente → global) ─────────────────────────────
 *
 *   1. La OPERACIÓN: ¿es sensible? Lo que diga el admin para esa operación;
 *      si no dijo nada, lo que declare el kon (`sensible`, por defecto solo
 *      DELETE); en una ruta legada (sin SDK), sus reglas método + patrón; en
 *      una herramienta MCP del núcleo, por defecto las de borrar.
 *   2. El GLOBAL es el INTERRUPTOR MAESTRO (decisión del propietario,
 *      2026-10-25): apagado, NINGÚN agente pide aprobación, tampoco los que
 *      están en `propose`. El panel lo avisa al apagarlo.
 *   3. El AGENTE (con el global encendido): `direct` → nunca se le pide
 *      aprobación; `inherit` → sus operaciones sensibles quedan como
 *      propuesta; `propose` → además, sus escrituras, según la RETENCIÓN:
 *        · `selective` (de fábrica): toda escritura menos los POST que la
 *          operación del SDK declara `soloLectura` (validar, comparar…);
 *        · `strict`: toda escritura (POST/PUT/PATCH/DELETE), sin excepción.
 *      Las rutas legadas (sin SDK) no declaran nada: se retienen en las dos.
 *
 * Con el global apagado (lo de fábrica) la API se comporta exactamente como
 * antes de la fase F.
 */

/** Cómo trata a un agente la aprobación humana. */
export type ModoDeAprobacion = "inherit" | "propose" | "direct";

export const MODOS_DE_APROBACION: readonly ModoDeAprobacion[] = ["inherit", "propose", "direct"];

export function esModoDeAprobacion(v: unknown): v is ModoDeAprobacion {
  return typeof v === "string" && (MODOS_DE_APROBACION as readonly string[]).includes(v);
}

/** Qué retiene el modo `propose` (ver la cabecera). */
export type RetencionDePropuesta = "selective" | "strict";

export const RETENCIONES_DE_PROPUESTA: readonly RetencionDePropuesta[] = ["selective", "strict"];

export function esRetencionDePropuesta(v: unknown): v is RetencionDePropuesta {
  return typeof v === "string" && (RETENCIONES_DE_PROPUESTA as readonly string[]).includes(v);
}

/**
 * Una regla para RUTAS LEGADAS (las que no son operaciones del SDK): método
 * (`*` = cualquiera) y patrón de camino. En el patrón, `*` es UN segmento y
 * `**` cualquier resto (`/api/**`, `/api/games/*\/bloques/**`).
 */
export interface ReglaLegadaDeAprobacion {
  method: string;
  path: string;
}

export interface ConfigDeAprobaciones {
  /** El interruptor MAESTRO. De fábrica: apagado (nadie pide aprobación). */
  enabled: boolean;
  /** Qué retiene el modo `propose`. De fábrica: `selective`. */
  proposeRetention: RetencionDePropuesta;
  /** Cuánto vive una propuesta sin decidir (horas). De fábrica: 168 (7 días). */
  ttlHours: number;
  /**
   * Lo que el admin cambió por operación: clave → sensible o no. Las claves
   * son el scope fino de la operación del SDK (`kon:blog:borrar-entrada`) o,
   * para las herramientas MCP que no son del SDK, `mcp:<nombre>`. Sin clave =
   * lo que declare la operación.
   */
  operations: Record<string, boolean>;
  /** Rutas legadas que cuentan como sensibles. */
  legacyRules: ReglaLegadaDeAprobacion[];
}

export const TTL_MIN_HORAS = 1;
export const TTL_MAX_HORAS = 24 * 30;

export const CONFIG_DE_APROBACIONES_POR_DEFECTO: ConfigDeAprobaciones = {
  enabled: false,
  proposeRetention: "selective",
  ttlHours: 168,
  operations: {},
  // Igual que el SDK (solo DELETE es sensible de fábrica), también en lo legado.
  legacyRules: [{ method: "DELETE", path: "/api/**" }],
};

export type EstadoDePropuesta =
  | "pending"
  | "executing"
  | "executed"
  | "failed"
  | "rejected"
  | "expired";

export const ESTADOS_DE_PROPUESTA: readonly EstadoDePropuesta[] = [
  "pending",
  "executing",
  "executed",
  "failed",
  "rejected",
  "expired",
];

/** Por qué una petición quedó como propuesta. */
export type MotivoDePropuesta = "sensitive" | "propose_only";

const METODOS_DE_ESCRITURA = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function esMetodoDeEscritura(metodo: string): boolean {
  return METODOS_DE_ESCRITURA.has(metodo.toUpperCase());
}

/**
 * LA TABLA. `null` = se ejecuta ya; si no, el motivo de la propuesta. Con el
 * global APAGADO, siempre `null` (interruptor maestro). Encendido:
 *
 *   modo      sensible    escritura normal              POST soloLectura   lectura
 *   direct    —           —                             —                  —
 *   propose   propuesta   propuesta                     strict ? propuesta —
 *   inherit   propuesta   —                             —                  —
 */
export function decidirAprobacion(p: {
  modo: ModoDeAprobacion;
  globalActivo: boolean;
  sensible: boolean;
  escritura: boolean;
  /** Un POST del SDK declarado `soloLectura`. */
  soloLectura?: boolean;
  /** De fábrica, `selective`. */
  retencion?: RetencionDePropuesta;
}): MotivoDePropuesta | null {
  if (!p.globalActivo || p.modo === "direct") return null;
  if (p.sensible) return "sensitive";
  if (p.modo !== "propose" || !p.escritura) return null;
  if (p.soloLectura && (p.retencion ?? "selective") === "selective") return null;
  return "propose_only";
}

// ── Patrones de rutas legadas ───────────────────────────────────────────────

function escapar(s: string): string {
  return s.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
}

/** El patrón como expresión regular (`*` = un segmento, `**` = el resto). */
export function regexDePatron(patron: string): RegExp {
  const partes = patron.split("**").map((trozo) => trozo.split("*").map(escapar).join("[^/]*"));
  return new RegExp(`^${partes.join(".*")}/?$`);
}

/** ¿Casa `METODO camino` con la regla? */
export function reglaLegadaCasa(regla: ReglaLegadaDeAprobacion, metodo: string, camino: string): boolean {
  const m = regla.method.trim().toUpperCase();
  if (m !== "*" && m !== metodo.toUpperCase()) return false;
  return regexDePatron(regla.path.trim()).test(camino.replace(/\/{2,}/g, "/"));
}

/** El motivo por el que una regla no vale, o `null`. */
export function motivoDeReglaInvalida(regla: unknown): string | null {
  if (!regla || typeof regla !== "object") return "a rule is an object { method, path }";
  const { method, path } = regla as Record<string, unknown>;
  if (typeof method !== "string" || !/^(\*|GET|POST|PUT|PATCH|DELETE)$/i.test(method.trim())) {
    return "method must be *, GET, POST, PUT, PATCH or DELETE";
  }
  if (typeof path !== "string" || !path.trim().startsWith("/api/")) {
    return "path must start with /api/";
  }
  if (path.length > 300 || /\s/.test(path.trim())) return "path must be at most 300 characters, without spaces";
  return null;
}

/**
 * Valida y normaliza una configuración parcial sobre otra. Lanza un `Error`
 * con el motivo (la API lo devuelve como 422).
 */
export function fusionarConfigDeAprobaciones(
  base: ConfigDeAprobaciones,
  cambio: Partial<Record<keyof ConfigDeAprobaciones, unknown>>
): ConfigDeAprobaciones {
  const salida: ConfigDeAprobaciones = {
    enabled: base.enabled,
    proposeRetention: base.proposeRetention,
    ttlHours: base.ttlHours,
    operations: { ...base.operations },
    legacyRules: base.legacyRules.map((r) => ({ ...r })),
  };
  if (cambio.enabled !== undefined) {
    if (typeof cambio.enabled !== "boolean") throw new Error("enabled must be true or false");
    salida.enabled = cambio.enabled;
  }
  if (cambio.proposeRetention !== undefined) {
    if (!esRetencionDePropuesta(cambio.proposeRetention)) {
      throw new Error("proposeRetention must be selective or strict");
    }
    salida.proposeRetention = cambio.proposeRetention;
  }
  if (cambio.ttlHours !== undefined) {
    const n = cambio.ttlHours;
    if (typeof n !== "number" || !Number.isInteger(n) || n < TTL_MIN_HORAS || n > TTL_MAX_HORAS) {
      throw new Error(`ttlHours must be an integer between ${TTL_MIN_HORAS} and ${TTL_MAX_HORAS}`);
    }
    salida.ttlHours = n;
  }
  if (cambio.operations !== undefined) {
    const ops = cambio.operations;
    if (!ops || typeof ops !== "object" || Array.isArray(ops)) {
      throw new Error("operations must be an object { key: true | false | null }");
    }
    for (const [clave, valor] of Object.entries(ops as Record<string, unknown>)) {
      if (!/^(kon:[a-z0-9-]+:[a-z0-9-]+|mcp:[A-Za-z0-9_.-]+)$/.test(clave)) {
        throw new Error(`'${clave}' is not an operation key (kon:<kon>:<operation> or mcp:<tool>)`);
      }
      if (valor === null) delete salida.operations[clave];
      else if (typeof valor === "boolean") salida.operations[clave] = valor;
      else throw new Error(`operations['${clave}'] must be true, false or null (default)`);
    }
  }
  if (cambio.legacyRules !== undefined) {
    if (!Array.isArray(cambio.legacyRules)) throw new Error("legacyRules must be a list");
    if (cambio.legacyRules.length > 100) throw new Error("at most 100 legacy rules");
    salida.legacyRules = cambio.legacyRules.map((r, i) => {
      const motivo = motivoDeReglaInvalida(r);
      if (motivo) throw new Error(`legacyRules[${i}]: ${motivo}`);
      const { method, path } = r as ReglaLegadaDeAprobacion;
      return { method: method.trim().toUpperCase(), path: path.trim() };
    });
  }
  return salida;
}

/** Lo guardado en la base, leído con defensas (una fila vieja o a medias no rompe nada). */
export function leerConfigDeAprobaciones(guardada: unknown): ConfigDeAprobaciones {
  if (!guardada || typeof guardada !== "object") return { ...CONFIG_DE_APROBACIONES_POR_DEFECTO };
  try {
    return fusionarConfigDeAprobaciones(
      CONFIG_DE_APROBACIONES_POR_DEFECTO,
      guardada as Partial<Record<keyof ConfigDeAprobaciones, unknown>>
    );
  } catch {
    return { ...CONFIG_DE_APROBACIONES_POR_DEFECTO };
  }
}

/** Clave de configuración de una herramienta MCP que no es del SDK. */
export function claveDeHerramientaMcp(nombre: string): string {
  return `mcp:${nombre}`;
}

/**
 * Sensible de fábrica para las herramientas MCP del núcleo: las que borran y
 * la que encola correos (manda a cualquier dirección en nombre de la web:
 * auditoría 2026-10-25).
 */
export function herramientaMcpSensiblePorDefecto(nombre: string): boolean {
  return /(^|_)delete(_|$)/.test(nombre) || nombre === "kitsuden_dispatch_worker";
}
