/**
 * Kitsuden — Salida estructurada garantizada
 * ============================================================================
 *
 * Un agente que llama a tu API necesita argumentos VÁLIDOS, no "casi siempre
 * válidos". Pedir JSON en el prompt y esperar que salga bien no es un
 * contrato: es una apuesta.
 *
 * NOTA TÉCNICA sobre Outlines: su enfoque (restringir el decodificado token a
 * token) exige acceso al modelo — vLLM, llama.cpp. Con APIs cloud (Anthropic,
 * OpenAI) eso es imposible: solo se puede usar su modo nativo y verificar.
 * Por eso aquí la garantía se construye con tres capas:
 *
 *   1. MODO NATIVO del proveedor cuando existe (json_schema de OpenAI,
 *      tool_use de Anthropic) — reduce muchísimo la tasa de error.
 *   2. VALIDACIÓN con el mismo Zod que ya usa el resto del framework.
 *   3. REINTENTO CON EL ERROR de vuelta: al modelo se le dice exactamente qué
 *      campo falló, que es lo que más sube la tasa de acierto.
 *
 * El resultado es un tipo `T` validado o un fallo explícito — nunca un objeto
 * a medias que reviente tres capas más abajo.
 */

import { z, type ZodTypeAny } from "zod";

// ── Contrato del proveedor (inyectado) ───────────────────────────────────────

/** Cómo sabe este proveedor pedir estructura. */
export type StructuredMode = "json_schema" | "tool" | "prompt";

export interface StructuredRequest {
  /** Mensajes de la conversación. */
  messages: { role: "system" | "user" | "assistant"; content: string }[];
  /** JSON Schema esperado (derivado del Zod). */
  schema: Record<string, unknown>;
  /** Nombre del schema — algunos proveedores lo exigen. */
  schemaName: string;
  mode: StructuredMode;
}

export interface StructuredProvider {
  readonly name: string;
  /** Modo nativo que soporta. `prompt` = solo se le puede pedir por texto. */
  readonly structuredMode: StructuredMode;
  /** Devuelve el texto crudo que el modelo produjo. */
  complete(request: StructuredRequest): Promise<{
    text: string;
    tokensIn: number;
    tokensOut: number;
  }>;
}

// ── Resultado ────────────────────────────────────────────────────────────────

export interface StructuredResult<T> {
  ok: boolean;
  /** Presente solo si `ok`. Ya validado por Zod. */
  data?: T;
  /** Motivo del fallo tras agotar los reintentos. */
  error?: string;
  /** Intentos consumidos (1 = acertó a la primera). */
  attempts: number;
  tokensIn: number;
  tokensOut: number;
  /** Texto crudo del último intento — para diagnóstico. */
  raw?: string;
}

export interface StructuredOptions {
  /** Reintentos tras el primer fallo. Default 2 (3 intentos totales). */
  maxRetries?: number;
  /** Contexto extra que se antepone como mensaje de sistema. */
  system?: string;
}

// ── Extracción de JSON ───────────────────────────────────────────────────────

/**
 * Extrae el objeto JSON de una respuesta.
 *
 * Los modelos suelen envolver el JSON en ```json ... ``` o añadir prosa antes
 * y después aunque se les pida lo contrario. Intentar `JSON.parse` directo
 * falla en esos casos MUY frecuentes, así que se limpia primero.
 */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();

  // 1. Tal cual.
  try {
    return JSON.parse(trimmed);
  } catch {
    // sigue
  }

  // 2. Dentro de un bloque de código.
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(trimmed);
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      // sigue
    }
  }

  // 3. Primer objeto o array equilibrado del texto.
  const start = trimmed.search(/[{[]/);
  if (start !== -1) {
    const open = trimmed[start];
    const close = open === "{" ? "}" : "]";
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < trimmed.length; i++) {
      const ch = trimmed[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === '"') inString = !inString;
      if (inString) continue;
      if (ch === open) depth++;
      else if (ch === close) {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(trimmed.slice(start, i + 1));
          } catch {
            break;
          }
        }
      }
    }
  }

  throw new Error("La respuesta no contiene JSON parseable");
}

// ── Zod → JSON Schema ────────────────────────────────────────────────────────

/**
 * Convierte un schema Zod a JSON Schema (dialecto OpenAPI 3.0, el que piden
 * los proveedores de LLM). Nunca lanza: sin el schema exacto la validación de
 * Zod sigue siendo la garantía real.
 */
export async function toJsonSchema(
  schema: ZodTypeAny,
  _name: string
): Promise<Record<string, unknown>> {
  try {
    const { $schema: _s, ...resto } = z.toJSONSchema(schema, {
      target: "openapi-3.0",
      io: "input",
      unrepresentable: "any",
    }) as Record<string, unknown>;
    return resto;
  } catch {
    return { type: "object", additionalProperties: true };
  }
}

/** Resume los errores de Zod en algo que un modelo pueda corregir. */
function describeIssues(error: z.ZodError): string {
  return error.issues
    .map((i) => {
      const path = i.path.length > 0 ? i.path.join(".") : "(raíz)";
      return `- ${path}: ${i.message}`;
    })
    .join("\n");
}

// ── Generación estructurada ──────────────────────────────────────────────────

/**
 * Pide al modelo una respuesta que cumpla `schema`, reintentando con el error
 * de validación si falla.
 *
 * @example
 * const result = await generateStructured(provider, {
 *   messages: [{ role: "user", content: "Extrae nombre y edad de: Ada, 36" }],
 *   schema: z.object({ name: z.string(), age: z.number() }),
 *   schemaName: "Person",
 * });
 * if (result.ok) result.data.name; // tipado y validado
 */
export async function generateStructured<S extends ZodTypeAny>(
  provider: StructuredProvider,
  input: {
    messages: { role: "system" | "user" | "assistant"; content: string }[];
    schema: S;
    schemaName?: string;
  },
  options: StructuredOptions = {}
): Promise<StructuredResult<z.infer<S>>> {
  const maxRetries = options.maxRetries ?? 2;
  const schemaName = input.schemaName ?? "Output";
  const jsonSchema = await toJsonSchema(input.schema, schemaName);

  const messages = [...input.messages];
  if (options.system) {
    messages.unshift({ role: "system", content: options.system });
  }

  // Con proveedores sin modo nativo, la instrucción explícita es lo único que
  // hay: se pone el schema delante para que el modelo lo tenga presente.
  if (provider.structuredMode === "prompt") {
    messages.unshift({
      role: "system",
      content:
        "Responde ÚNICAMENTE con un objeto JSON válido que cumpla este JSON Schema. " +
        "Sin explicaciones, sin bloques de código, solo el JSON.\n\n" +
        JSON.stringify(jsonSchema, null, 2),
    });
  }

  let tokensIn = 0;
  let tokensOut = 0;
  let raw: string | undefined;
  let lastError = "";

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    const response = await provider.complete({
      messages,
      schema: jsonSchema,
      schemaName,
      mode: provider.structuredMode,
    });

    tokensIn += response.tokensIn;
    tokensOut += response.tokensOut;
    raw = response.text;

    let candidate: unknown;
    try {
      candidate = extractJson(response.text);
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      // Se le devuelve su propia salida y el problema, que es lo que más
      // ayuda a que acierte en el siguiente intento.
      messages.push(
        { role: "assistant", content: response.text },
        {
          role: "user",
          content: `Eso no es JSON válido (${lastError}). Responde solo con el objeto JSON.`,
        }
      );
      continue;
    }

    const parsed = input.schema.safeParse(candidate);
    if (parsed.success) {
      return { ok: true, data: parsed.data, attempts: attempt, tokensIn, tokensOut, raw };
    }

    lastError = describeIssues(parsed.error);
    messages.push(
      { role: "assistant", content: response.text },
      {
        role: "user",
        content:
          `El JSON no cumple el schema. Corrige estos campos y responde de nuevo ` +
          `solo con el JSON:\n${lastError}`,
      }
    );
  }

  return {
    ok: false,
    error: `No se obtuvo una salida válida tras ${maxRetries + 1} intentos. Último error:\n${lastError}`,
    attempts: maxRetries + 1,
    tokensIn,
    tokensOut,
    raw,
  };
}
