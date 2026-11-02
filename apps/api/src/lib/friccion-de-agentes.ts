/**
 * Fricción de agentes — dónde se atascan los agentes con nuestras herramientas
 * ============================================================================
 *
 * La idea viene de Harness² (Google Research): mejorar un agente sin tocar el
 * modelo, aprendiendo de las DIFERENCIAS entre ejecuciones. Nosotros no somos
 * el harness, pero vemos cada llamada que nos hace: si los agentes inventan la
 * misma clave, piden ids que no existen o chocan con un permiso que no se
 * anuncia bien, el arreglo está en NUESTRO lado (la descripción, la guía de la
 * operación —`guia` en el SDK—, el esquema), y mejora a todos los harnesses.
 *
 * Aquí vive lo puro:
 *
 *   resumirLlamada()   la respuesta JSON-RPC de un `tools/call` → lo que se
 *                      guarda en `agent_audit_logs.details`. SOLO los NOMBRES
 *                      de los argumentos, nunca sus valores (pueden llevar
 *                      datos personales o secretos).
 *   informeDeFriccion()  filas de auditoría → por herramienta: fallos por
 *                      código, claves inventadas, propuestas rechazadas y qué
 *                      cambiar.
 *
 * La consulta a la base y la ruta están en `routes/agents.ts`
 * (`GET /api/admin/agents/friction`).
 *
 * El informe dice QUÉ mirar; no reescribe nada solo. Cambiar la guía es una
 * decisión de quien mantiene el kon.
 */

export interface LlamadaResumida {
  exito: boolean;
  /** `KITSUDEN_E_*` del problema, si lo hubo. */
  codigo: string | null;
  /** Repetición servida por la idempotencia (no ejecutó nada). */
  repetida: boolean;
  /** Quedó como propuesta a la espera de un humano (fase F). */
  propuesta: boolean;
  /** Claves que el agente mandó y la herramienta no conoce. */
  clavesDesconocidas: string[];
  /** Los NOMBRES de los argumentos enviados (nunca los valores). */
  argumentos: string[];
}

function objeto(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function textos(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/** La respuesta JSON-RPC de un `tools/call` → lo que se audita. */
export function resumirLlamada(respuesta: unknown, args: unknown): LlamadaResumida {
  const r = objeto(respuesta);
  const argumentos = Object.keys(objeto(args) ?? {}).sort();
  const error = objeto(r?.error);
  if (error) {
    const datos = objeto(error.data);
    return {
      exito: false,
      codigo: typeof datos?.code === "string" ? datos.code : null,
      repetida: false,
      propuesta: false,
      clavesDesconocidas: textos(datos?.unknownKeys),
      argumentos,
    };
  }
  const resultado = objeto(r?.result);
  const sc = objeto(resultado?.structuredContent);
  const codigo = typeof sc?.code === "string" ? sc.code : null;
  return {
    exito: resultado?.isError !== true,
    codigo,
    repetida: sc?.idempotentReplayed === true,
    propuesta: codigo === "KITSUDEN_E_APPROVAL_REQUIRED",
    clavesDesconocidas: textos(sc?.unknownKeys),
    argumentos,
  };
}

// ── El informe ──────────────────────────────────────────────────────────────

/** Una llamada auditada (`action = 'tool_call'`, `details` de `resumirLlamada`). */
export interface FilaDeLlamada {
  herramienta: string;
  agentId: string | null;
  exito: boolean;
  details: unknown;
}

export interface SenalDeFriccion {
  tipo: "claves-inventadas" | "validacion" | "permiso" | "no-encontrado" | "conflicto" | "rechazos" | "sin-guia";
  /** Qué cambiar, para quien mantiene la operación. */
  mensaje: string;
}

export interface FriccionDeHerramienta {
  herramienta: string;
  llamadas: number;
  fallos: number;
  /** 0..1 */
  tasaDeFallo: number;
  agentes: number;
  repetidas: number;
  propuestas: number;
  propuestasRechazadas: number;
  porCodigo: Record<string, number>;
  /** Clave inventada → veces. */
  clavesInventadas: Record<string, number>;
  tieneGuia: boolean | null;
  senales: SenalDeFriccion[];
}

export interface OpcionesDeInforme {
  /** Herramientas con `guia` declarada; sin esto no se juzga si falta. */
  conGuia?: ReadonlySet<string>;
  /** Llamadas mínimas para juzgar una tasa (por defecto 5). */
  minimoDeLlamadas?: number;
}

const TASA_PREOCUPANTE = 0.2;

function senales(f: FriccionDeHerramienta, minimo: number): SenalDeFriccion[] {
  const s: SenalDeFriccion[] = [];
  const muestra = f.llamadas >= minimo;
  const veces = (codigo: string) => f.porCodigo[codigo] ?? 0;
  const proporcion = (n: number) => (f.llamadas > 0 ? n / f.llamadas : 0);

  const inventadas = Object.entries(f.clavesInventadas)
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1]);
  if (inventadas.length > 0) {
    s.push({
      tipo: "claves-inventadas",
      mensaje: `Los agentes mandan claves que no existen: ${inventadas
        .map(([k, n]) => `'${k}' (${n})`)
        .join(", ")}. Añade un ejemplo en guia.ejemplos, o una trampa con el nombre correcto.`,
    });
  }
  const sinClaves = veces("KITSUDEN_E_VALIDATION") - inventadas.reduce((t, [, n]) => t + n, 0);
  if (muestra && proporcion(sinClaves) >= TASA_PREOCUPANTE) {
    s.push({
      tipo: "validacion",
      mensaje: `${sinClaves} de ${f.llamadas} llamadas no validan. Un ejemplo completo en guia.ejemplos suele bastar; revisa también que la descripción diga los formatos (fechas, ids).`,
    });
  }
  if (muestra && proporcion(veces("KITSUDEN_E_FORBIDDEN")) >= TASA_PREOCUPANTE) {
    s.push({
      tipo: "permiso",
      mensaje:
        "Se llama a menudo sin permiso. Si el permiso depende del recurso (politica.enHandler) la herramienta se anuncia a quien luego no puede: dilo en guia.cuandoUsar.",
    });
  }
  if (muestra && proporcion(veces("KITSUDEN_E_NOT_FOUND")) >= TASA_PREOCUPANTE) {
    s.push({
      tipo: "no-encontrado",
      mensaje: "Piden ids que no existen. Di en guia.antes de qué operación sale cada id que pide.",
    });
  }
  if (muestra && proporcion(veces("KITSUDEN_E_CONFLICT")) >= TASA_PREOCUPANTE) {
    s.push({
      tipo: "conflicto",
      mensaje: "Choques de estado (409) frecuentes: explica en guia.trampas el orden correcto de las llamadas.",
    });
  }
  if (f.propuestasRechazadas > 0 && f.propuestasRechazadas >= f.propuestas / 2) {
    s.push({
      tipo: "rechazos",
      mensaje: `Los humanos rechazaron ${f.propuestasRechazadas} de ${f.propuestas} propuestas: el agente la usa cuando no toca. Acláralo en guia.cuandoUsar.`,
    });
  }
  if (f.tieneGuia === false && s.length > 0) {
    s.push({ tipo: "sin-guia", mensaje: "Esta operación no declara `guia` en el SDK." });
  }
  return s;
}

/**
 * Las filas de auditoría → la fricción por herramienta, de la peor a la mejor
 * (más fallos primero). `rechazadas`: herramienta → propuestas rechazadas.
 */
export function informeDeFriccion(
  filas: readonly FilaDeLlamada[],
  rechazadas: ReadonlyMap<string, number> = new Map(),
  opciones: OpcionesDeInforme = {}
): FriccionDeHerramienta[] {
  const minimo = opciones.minimoDeLlamadas ?? 5;
  const porHerramienta = new Map<string, FriccionDeHerramienta & { _agentes: Set<string> }>();
  const de = (herramienta: string) => {
    let f = porHerramienta.get(herramienta);
    if (!f) {
      f = {
        herramienta,
        llamadas: 0,
        fallos: 0,
        tasaDeFallo: 0,
        agentes: 0,
        repetidas: 0,
        propuestas: 0,
        propuestasRechazadas: 0,
        porCodigo: {},
        clavesInventadas: {},
        tieneGuia: opciones.conGuia ? opciones.conGuia.has(herramienta) : null,
        senales: [],
        _agentes: new Set(),
      };
      porHerramienta.set(herramienta, f);
    }
    return f;
  };

  for (const fila of filas) {
    const f = de(fila.herramienta);
    const d = objeto(fila.details);
    f.llamadas++;
    if (!fila.exito) f.fallos++;
    if (fila.agentId) f._agentes.add(fila.agentId);
    if (d?.repetida === true) f.repetidas++;
    if (d?.propuesta === true) f.propuestas++;
    const codigo = typeof d?.codigo === "string" ? d.codigo : null;
    if (codigo && !fila.exito) f.porCodigo[codigo] = (f.porCodigo[codigo] ?? 0) + 1;
    for (const k of textos(d?.clavesDesconocidas)) f.clavesInventadas[k] = (f.clavesInventadas[k] ?? 0) + 1;
  }
  for (const [herramienta, n] of rechazadas) de(herramienta).propuestasRechazadas += n;

  return [...porHerramienta.values()]
    .map(({ _agentes, ...f }) => {
      const listo = { ...f, agentes: _agentes.size, tasaDeFallo: f.llamadas > 0 ? f.fallos / f.llamadas : 0 };
      return { ...listo, senales: senales(listo, minimo) };
    })
    .sort((a, b) => b.fallos - a.fallos || b.propuestasRechazadas - a.propuestasRechazadas || a.herramienta.localeCompare(b.herramienta));
}
