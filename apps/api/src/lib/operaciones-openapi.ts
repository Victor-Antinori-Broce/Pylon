/**
 * SDK de kons → OpenAPI 3.1 y herramientas MCP (puro: sin base, sin app)
 * ============================================================================
 *
 * De UNA declaración de operación (`OperacionDeKon`, en @kitsuden/shared)
 * salen las dos superficies para agentes con los mismos esquemas:
 *
 *   operacionOpenApi()   la operación OpenAPI 3.1 (JSON Schema real desde zod,
 *                        respuestas de éxito y de error, seguridad, y la
 *                        extensión `x-kitsuden-operation` con scope, sensible,
 *                        idempotente y la herramienta MCP);
 *   herramientaMcp()     la herramienta MCP (`inputSchema`, `annotations`),
 *                        o `null` si la operación está excluida con motivo;
 *   peticionDesdeArgumentos()  los argumentos de esa herramienta → la petición
 *                        HTTP que ejecuta la operación (la usa el MCP).
 *
 * Sin dependencias de la base ni del arranque, para que el test de cobertura
 * (`tests/unit/cobertura-de-operaciones.test.ts`) pueda generar y VALIDAR el
 * documento sin montar nada.
 */

import {
  ARGUMENTO_CUERPO_MCP,
  ARGUMENTO_IDEMPOTENCIA_MCP,
  KITSUDEN_ERRORS,
  guiaCorta,
  erroresDeOperacion,
  esIdempotente,
  esRedireccion,
  esSensible,
  esSoloLectura,
  exclusionMcp,
  nombreDeHerramienta,
  operationIdDe,
  scopeFinoDeOperacion,
  scopesQueConceden,
  type OperacionDeKon,
} from "@kitsuden/shared";
import { z, type ZodTypeAny } from "zod";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- frontera de varianza: cada operación trae sus propios esquemas
type Operacion = OperacionDeKon<any, any, any>;

export type EsquemaJson = Record<string, unknown>;

/**
 * zod → JSON Schema EN LÍNEA, en el dialecto de OpenAPI 3.1 (JSON Schema
 * 2020-12, el que `z.toJSONSchema` emite por defecto: nada de `nullable`).
 *
 * - `io: "input"`: lo que el cliente MANDA. Un campo con `.default()` no es
 *   obligatorio, y un `.transform()` se describe por lo que recibe.
 * - `unrepresentable: "any"`: un tipo sin equivalente (una fecha, un
 *   transform suelto) queda abierto en vez de tumbar el OpenAPI entero.
 * - Las fechas viajan como texto ISO: `format: date-time`.
 *
 * Solo los esquemas recursivos dejan `$defs` (con su `$ref` dentro).
 */
export function esquemaJson(esquema: ZodTypeAny | undefined): EsquemaJson | undefined {
  if (!esquema) return undefined;
  const convertido = z.toJSONSchema(esquema, {
    io: "input",
    unrepresentable: "any",
    override: ({ zodSchema, jsonSchema }) => {
      if ((zodSchema as { _zod?: { def?: { type?: string } } })._zod?.def?.type === "date") {
        jsonSchema.type = "string";
        jsonSchema.format = "date-time";
      }
    },
  }) as EsquemaJson;
  const { $schema: _s, ...resto } = convertido;
  return resto;
}

function esOpcional(esquema: ZodTypeAny | undefined): boolean {
  return !!esquema && esquema.safeParse(undefined).success;
}

/** `/pages/:id` → `/pages/{id}` */
export function caminoOpenApi(caminoHono: string): string {
  return caminoHono.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, "{$1}");
}

function unir(mountPath: string, ruta: string): string {
  const base = mountPath.replace(/\/+$/, "");
  return ruta === "/" ? base || "/" : `${base}${ruta}`;
}

function nombresDeParametros(ruta: string): string[] {
  return [...ruta.matchAll(/:([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1]!);
}

/** Los componentes comunes que las operaciones referencian. */
export function componentesComunes(): {
  schemas: Record<string, EsquemaJson>;
  securitySchemes: Record<string, EsquemaJson>;
} {
  return {
    schemas: {
      Problem: {
        type: "object",
        description:
          "RFC 9457 problem details (application/problem+json). `code` is stable: branch on it. See docs/install/errors-and-retries.md.",
        properties: {
          type: { type: "string" },
          title: { type: "string" },
          status: { type: "integer" },
          detail: { type: "string" },
          instance: { type: "string" },
          code: { type: "string", enum: Object.keys(KITSUDEN_ERRORS) },
          retryable: { type: "boolean" },
          retry_after: { type: ["integer", "null"] },
          hint: { type: "string" },
          docs: { type: "string" },
          requestId: { type: ["string", "null"] },
          error: { description: "What the route used to send (text or {code, message, details})." },
        },
        required: ["type", "title", "status", "detail", "code", "retryable", "retry_after", "hint", "docs"],
      },
    },
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        description: "Agent key: `Authorization: Bearer kitsuden_agent_*`",
      },
      cookieAuth: {
        type: "apiKey",
        in: "cookie",
        name: "better-auth.session_token",
        description: "Session cookie (panel and sites)",
      },
    },
  };
}

export interface OperacionOpenApi {
  /** Sin `/api` (lo lleva la URL del servidor) y con `{param}`. */
  camino: string;
  metodo: "get" | "post" | "put" | "patch" | "delete";
  operacion: EsquemaJson;
}

/** La operación OpenAPI 3.1 de una declaración. */
export function operacionOpenApi(
  konId: string,
  mountPath: string,
  op: Operacion
): OperacionOpenApi {
  const rutaCompleta = unir(mountPath, op.ruta);
  const camino = caminoOpenApi(rutaCompleta.replace(/^\/api(?=\/|$)/, "")) || "/";

  const parameters: EsquemaJson[] = [];
  const params = esquemaJson(op.entrada?.params) as { properties?: Record<string, EsquemaJson> } | undefined;
  for (const nombre of nombresDeParametros(op.ruta)) {
    parameters.push({
      name: nombre,
      in: "path",
      required: true,
      schema: params?.properties?.[nombre] ?? { type: "string" },
    });
  }
  const query = esquemaJson(op.entrada?.query) as
    | { properties?: Record<string, EsquemaJson>; required?: string[] }
    | undefined;
  for (const [nombre, esquema] of Object.entries(query?.properties ?? {})) {
    parameters.push({
      name: nombre,
      in: "query",
      required: query?.required?.includes(nombre) ?? false,
      schema: esquema,
      ...(typeof esquema.description === "string" ? { description: esquema.description } : {}),
    });
  }
  const idempotente = esIdempotente(op);
  if (op.metodo !== "GET") {
    parameters.push({
      name: "Idempotency-Key",
      in: "header",
      required: false,
      description: idempotente
        ? "Optional. Repeating this operation already leaves the same state."
        : "Recommended for retries: the same key and body replay the first response instead of running twice.",
      schema: { type: "string", minLength: 8, maxLength: 128, pattern: "^[A-Za-z0-9_.:-]+$" },
    });
  }

  const operacion: EsquemaJson = {
    operationId: operationIdDe(konId, op.id),
    summary: op.resumen,
    description: op.descripcion,
    tags: [konId, ...(op.etiquetas ?? [])],
  };
  if (parameters.length > 0) operacion.parameters = parameters;

  if (op.entrada?.cuerpo) {
    const tipo = op.entrada.formato === "multipart" ? "multipart/form-data" : "application/json";
    operacion.requestBody = {
      required: !esOpcional(op.entrada.cuerpo),
      content: { [tipo]: { schema: esquemaJson(op.entrada.cuerpo) } },
    };
  }

  // ── Respuestas ──
  const responses: Record<string, EsquemaJson> = {};
  const estado = String(op.salida.estado ?? 200);
  const tipoSalida = op.salida.tipo ?? "application/json";
  if (op.salida.flujo && op.salida.esquema) {
    // Un flujo (kitsuden2.md C5): Server-Sent Events estándar. El esquema de
    // CADA evento va en `x-kitsuden-event-schema` (OpenAPI 3.1 no tiene
    // `itemSchema`, que llega en 3.2); el generador del SDK lo lee de ahí.
    responses["200"] = {
      description:
        op.salida.descripcion ??
        "Server-Sent Events: one `data:` event per item (JSON, see x-kitsuden-event-schema), then `event: end`; on failure `event: error` with a problem+json.",
      content: {
        "text/event-stream": {
          schema: { type: "string", contentMediaType: "text/event-stream" },
          "x-kitsuden-event-schema": esquemaJson(op.salida.esquema),
        },
      },
    };
  } else if (estado === "204") {
    responses[estado] = { description: op.salida.descripcion ?? "No content" };
  } else if (!esRedireccion(op.salida.estado)) {
    const contenido: EsquemaJson = op.salida.esquema
      ? { schema: esquemaJson(op.salida.esquema) }
      : { schema: { type: "string", contentMediaType: tipoSalida } };
    responses[estado] = {
      description: op.salida.descripcion ?? "OK",
      content: { [tipoSalida]: contenido },
    };
    // Mismo cuerpo, otro estado de éxito (un upsert: 201 al crear, 200 al reescribir).
    for (const otro of op.salida.otrosEstados ?? []) {
      if (esRedireccion(otro)) continue;
      responses[String(otro)] = {
        description: op.salida.descripcion ?? "OK",
        content: { [tipoSalida]: contenido },
      };
    }
  }
  // Redirecciones: sin cuerpo y con su `Location`. No son errores, así que no
  // llevan código del catálogo.
  for (const r of [op.salida.estado, ...(op.salida.otrosEstados ?? [])]) {
    if (!esRedireccion(r)) continue;
    responses[String(r)] = {
      description: op.salida.descripcion ?? "Redirect",
      headers: { Location: { required: true, schema: { type: "string" } } },
    };
  }
  const errores = erroresDeOperacion(op);
  for (const codigo of errores) {
    const entrada = KITSUDEN_ERRORS[codigo];
    const clave = String(entrada.status);
    const previo = responses[clave];
    const linea = `\`${codigo}\`: ${entrada.title}`;
    responses[clave] = previo
      ? { ...previo, description: `${String(previo.description)}; ${linea}` }
      : {
          description: linea,
          content: { "application/problem+json": { schema: { $ref: "#/components/schemas/Problem" } } },
        };
  }
  operacion.responses = responses;

  // Credencial obligatoria: `sesion`, o un permiso que se comprueba antes
  // del handler. Opcional: `opcional`, o un permiso que depende del recurso
  // (un dataset público se lee sin sesión).
  const exige = op.acceso === "sesion" || (op.permiso && !op.permiso.politica?.enHandler);
  operacion.security = exige
    ? [{ bearerAuth: [] }, { cookieAuth: [] }]
    : op.acceso === "opcional" || op.permiso
      ? [{}, { bearerAuth: [] }, { cookieAuth: [] }]
      : [];

  const exclusion = exclusionMcp(op);
  operacion["x-kitsuden-operation"] = {
    kon: konId,
    id: op.id,
    access: op.acceso,
    scope: scopeFinoDeOperacion(konId, op.id),
    grantedBy: op.permiso ? scopesQueConceden(konId, op) : [],
    ...(op.permiso?.politica
      ? { policy: `${op.permiso.politica.recurso}:${op.permiso.politica.accion}` }
      : {}),
    ...(op.permiso?.roles ? { roles: op.permiso.roles } : {}),
    sensitive: esSensible(op),
    readOnly: esSoloLectura(op),
    idempotent: idempotente,
    ...(op.entrada?.validaElHandler ? { bodyValidatedBy: "handler (400 Validation failed)" } : {}),
    errors: errores,
    ...(op.salida.flujo ? { stream: true } : {}),
    mcp: exclusion === null ? { tool: nombreDeHerramienta(konId, op) } : { excluded: exclusion },
  };
  if (op.guia) operacion["x-kitsuden-guia"] = op.guia;

  return {
    camino,
    metodo: op.metodo.toLowerCase() as OperacionOpenApi["metodo"],
    operacion,
  };
}

// ── MCP ─────────────────────────────────────────────────────────────────────

export interface HerramientaMcp {
  name: string;
  title: string;
  description: string;
  inputSchema: EsquemaJson & { type: "object" };
  annotations: {
    title: string;
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint: boolean;
    openWorldHint: boolean;
  };
}

/** Argumento extra de las herramientas no idempotentes. */
export const ARG_IDEMPOTENCIA = ARGUMENTO_IDEMPOTENCIA_MCP;
/** El cuerpo va bajo esta clave (params y query, planos al lado). */
export const ARG_CUERPO = ARGUMENTO_CUERPO_MCP;

/** El recurso MCP con la guía completa de una herramienta. */
export function uriDeGuia(herramienta: string): string {
  return `kitsuden://guia/${herramienta}`;
}

/**
 * La herramienta MCP de una operación, o `null` si está excluida.
 *
 * Forma de los argumentos: los parámetros del camino y de la query, PLANOS;
 * el cuerpo, entero bajo `body`. Así no hay choques de nombres (un `id` del
 * camino y un `id` del cuerpo son cosas distintas) y el esquema de `body` es
 * exactamente el del cuerpo REST.
 */
export function herramientaMcp(
  konId: string,
  mountPath: string,
  op: Operacion
): HerramientaMcp | null {
  if (exclusionMcp(op) !== null) return null;

  const properties: Record<string, EsquemaJson> = {};
  const required: string[] = [];

  const params = esquemaJson(op.entrada?.params) as { properties?: Record<string, EsquemaJson> } | undefined;
  for (const nombre of nombresDeParametros(op.ruta)) {
    properties[nombre] = params?.properties?.[nombre] ?? { type: "string" };
    required.push(nombre);
  }
  const query = esquemaJson(op.entrada?.query) as
    | { properties?: Record<string, EsquemaJson>; required?: string[] }
    | undefined;
  for (const [nombre, esquema] of Object.entries(query?.properties ?? {})) {
    if (nombre in properties) {
      throw new Error(`${konId}/${op.id}: '${nombre}' está en el camino y en la query`);
    }
    properties[nombre] = esquema;
    if (query?.required?.includes(nombre)) required.push(nombre);
  }
  if (op.entrada?.cuerpo) {
    if (ARG_CUERPO in properties) throw new Error(`${konId}/${op.id}: 'body' no puede ser un parámetro`);
    properties[ARG_CUERPO] = esquemaJson(op.entrada.cuerpo)!;
    if (!esOpcional(op.entrada.cuerpo)) required.push(ARG_CUERPO);
  }
  const idempotente = esIdempotente(op);
  if (!idempotente) {
    properties[ARG_IDEMPOTENCIA] = {
      type: "string",
      minLength: 8,
      maxLength: 128,
      pattern: "^[A-Za-z0-9_.:-]+$",
      description:
        "Optional. Send the same key when retrying this call: it runs once and the retry gets the first result.",
    };
  }

  const sensible = esSensible(op);
  const ruta = unir(mountPath, op.ruta);
  const notas = [
    `REST: ${op.metodo} ${ruta}.`,
    op.permiso
      ? `Needs one of: ${scopesQueConceden(konId, op).join(", ")}${
          op.permiso.politica ? ` (or the kon policy ${op.permiso.politica.recurso}:${op.permiso.politica.accion})` : ""
        }.`
      : op.acceso === "sesion"
        ? "Needs an authenticated agent."
        : "Public.",
    sensible ? "Sensitive: may require human approval in the future." : null,
    idempotente ? "Idempotent: safe to retry." : `Not idempotent: pass ${ARG_IDEMPOTENCIA} to retry safely.`,
  ].filter(Boolean);

  const nombre = nombreDeHerramienta(konId, op);
  const guia = guiaCorta(op);
  return {
    name: nombre,
    title: op.resumen,
    description: [
      op.descripcion,
      guia ? guia.replace("read the guide resource", `read the resource ${uriDeGuia(nombre)}`) : null,
      notas.join(" "),
    ]
      .filter(Boolean)
      .join("\n\n"),
    inputSchema: {
      type: "object",
      properties,
      ...(required.length > 0 ? { required } : {}),
      additionalProperties: false,
    },
    annotations: {
      title: op.resumen,
      readOnlyHint: esSoloLectura(op),
      destructiveHint: op.metodo === "DELETE" || sensible,
      idempotentHint: idempotente,
      openWorldHint: false,
    },
  };
}

export interface PeticionInterna {
  url: string;
  init: RequestInit & { headers: Record<string, string> };
}

/**
 * Los argumentos de una herramienta → la petición HTTP de su operación.
 * Lanza (con un mensaje para el modelo) si falta un parámetro del camino.
 */
export function peticionDesdeArgumentos(
  mountPath: string,
  op: Operacion,
  args: Record<string, unknown>
): PeticionInterna {
  let ruta = unir(mountPath, op.ruta);
  for (const nombre of nombresDeParametros(op.ruta)) {
    const valor = args[nombre];
    if (valor === undefined || valor === null || valor === "") {
      throw new Error(`Falta el argumento '${nombre}' (parámetro del camino)`);
    }
    ruta = ruta.replace(`:${nombre}`, encodeURIComponent(String(valor)));
  }

  const query = new URLSearchParams();
  const propsQuery = Object.keys(
    ((esquemaJson(op.entrada?.query) as { properties?: Record<string, unknown> } | undefined)?.properties ??
      {}) as Record<string, unknown>
  );
  for (const nombre of propsQuery) {
    const valor = args[nombre];
    if (valor === undefined || valor === null) continue;
    query.set(nombre, typeof valor === "string" ? valor : JSON.stringify(valor));
  }

  const headers: Record<string, string> = {};
  const init: PeticionInterna["init"] = { method: op.metodo, headers };
  if (op.entrada?.cuerpo && args[ARG_CUERPO] !== undefined) {
    headers["content-type"] = "application/json";
    init.body = JSON.stringify(args[ARG_CUERPO]);
  }
  const clave = args[ARG_IDEMPOTENCIA];
  if (typeof clave === "string" && clave) headers["idempotency-key"] = clave;

  const qs = query.toString();
  return { url: `http://kitsuden.internal${ruta}${qs ? `?${qs}` : ""}`, init };
}
