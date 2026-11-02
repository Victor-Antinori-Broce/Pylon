/**
 * Standard Schema (https://standardschema.dev) from the API's JSON Schemas.
 *
 * The server's schemas are Zod 4, which already implements Standard Schema:
 * code that shares them (a kon, the starter) can hand them to any library
 * that speaks it. A client that only has the API needs something else: the
 * OpenAPI document. These helpers turn its JSON Schemas into Standard Schema
 * validators, so a form library, tRPC-style tooling or your own code can
 * validate a body BEFORE sending it, with whatever validator ecosystem it uses
 * (Zod, Valibot and ArkType all consume Standard Schema).
 *
 *   import spec from "@kitsuden/sdk/openapi.json" with { type: "json" };
 *   import { operationSchemas } from "@kitsuden/sdk";
 *
 *   const { body } = operationSchemas(spec, "blog.crear-entrada");
 *   const r = await body!["~standard"].validate(input);
 *   if (r.issues) showErrors(r.issues);
 *
 * Zero dependencies: a compact validator for the JSON Schema subset the API
 * emits (types, properties, required, additionalProperties, items, enum,
 * const, anyOf/oneOf/allOf, lengths, bounds, pattern, `$ref`). Unknown
 * keywords are ignored, never rejected: the server stays the authority.
 */

type Json = Record<string, unknown>;

/** The Standard Schema v1 contract (inlined: no dependency). */
export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly "~standard": {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (
      value: unknown
    ) => StandardResult<Output> | Promise<StandardResult<Output>>;
    readonly types?: { readonly input: Input; readonly output: Output };
  };
}

export type StandardResult<Output> =
  | { readonly value: Output; readonly issues?: undefined }
  | { readonly issues: ReadonlyArray<StandardIssue> };

export interface StandardIssue {
  readonly message: string;
  readonly path?: ReadonlyArray<PropertyKey>;
}

type Path = PropertyKey[];

function tipoDe(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  if (typeof v === "number") return Number.isInteger(v) ? "integer" : "number";
  return typeof v;
}

function encaja(tipo: string, v: unknown): boolean {
  const real = tipoDe(v);
  return real === tipo || (tipo === "number" && real === "integer");
}

function resolver(s: unknown, raiz: Json): Json {
  let actual = (s ?? {}) as Json;
  for (let i = 0; i < 20 && typeof actual.$ref === "string"; i++) {
    const ref = actual.$ref as string;
    if (!ref.startsWith("#/")) return {};
    actual = ref
      .slice(2)
      .split("/")
      .reduce<unknown>((o, k) => (o as Json | undefined)?.[k.replace(/~1/g, "/").replace(/~0/g, "~")], raiz) as Json;
    if (!actual) return {};
  }
  return actual;
}

function validar(esquema: unknown, v: unknown, raiz: Json, ruta: Path, fallos: StandardIssue[]): void {
  const s = resolver(esquema, raiz);
  const fallo = (message: string) => fallos.push({ message, path: [...ruta] });

  if ("const" in s && JSON.stringify(s.const) !== JSON.stringify(v)) return void fallo(`must be ${JSON.stringify(s.const)}`);
  if (Array.isArray(s.enum) && !s.enum.some((e) => JSON.stringify(e) === JSON.stringify(v))) {
    return void fallo(`must be one of ${s.enum.map((e) => JSON.stringify(e)).join(", ")}`);
  }
  for (const sub of (s.allOf as unknown[] | undefined) ?? []) validar(sub, v, raiz, ruta, fallos);
  for (const clave of ["anyOf", "oneOf"] as const) {
    const opciones = s[clave] as unknown[] | undefined;
    if (!opciones?.length) continue;
    const validas = opciones.filter((o) => {
      const f: StandardIssue[] = [];
      validar(o, v, raiz, ruta, f);
      return f.length === 0;
    }).length;
    if (clave === "anyOf" ? validas === 0 : validas !== 1) return void fallo(`does not match ${clave === "anyOf" ? "any" : "exactly one"} of the allowed shapes`);
  }

  if (s.type !== undefined) {
    const tipos = (Array.isArray(s.type) ? s.type : [s.type]) as string[];
    if (s.nullable === true) tipos.push("null");
    if (!tipos.some((t) => encaja(t, v))) return void fallo(`must be ${tipos.join(" or ")}`);
  }

  if (typeof v === "string") {
    if (typeof s.minLength === "number" && v.length < s.minLength) fallo(`must have at least ${s.minLength} characters`);
    if (typeof s.maxLength === "number" && v.length > s.maxLength) fallo(`must have at most ${s.maxLength} characters`);
    if (typeof s.pattern === "string") {
      try {
        if (!new RegExp(s.pattern, "u").test(v)) fallo(`must match ${s.pattern}`);
      } catch {
        /* a pattern this runtime cannot compile: the server checks it */
      }
    }
  }
  if (typeof v === "number") {
    if (typeof s.minimum === "number" && v < s.minimum) fallo(`must be >= ${s.minimum}`);
    if (typeof s.maximum === "number" && v > s.maximum) fallo(`must be <= ${s.maximum}`);
    if (typeof s.exclusiveMinimum === "number" && v <= s.exclusiveMinimum) fallo(`must be > ${s.exclusiveMinimum}`);
    if (typeof s.exclusiveMaximum === "number" && v >= s.exclusiveMaximum) fallo(`must be < ${s.exclusiveMaximum}`);
  }
  if (Array.isArray(v)) {
    if (typeof s.minItems === "number" && v.length < s.minItems) fallo(`must have at least ${s.minItems} items`);
    if (typeof s.maxItems === "number" && v.length > s.maxItems) fallo(`must have at most ${s.maxItems} items`);
    if (s.items && typeof s.items === "object") v.forEach((x, i) => validar(s.items, x, raiz, [...ruta, i], fallos));
  }
  if (tipoDe(v) === "object") {
    const o = v as Json;
    const props = (s.properties ?? {}) as Json;
    for (const req of (s.required as string[] | undefined) ?? []) {
      if (o[req] === undefined) fallos.push({ message: "is required", path: [...ruta, req] });
    }
    for (const [k, x] of Object.entries(o)) {
      if (x === undefined) continue;
      if (k in props) validar(props[k], x, raiz, [...ruta, k], fallos);
      else if (s.additionalProperties === false) fallos.push({ message: "is not allowed", path: [...ruta, k] });
      else if (s.additionalProperties && typeof s.additionalProperties === "object") {
        validar(s.additionalProperties, x, raiz, [...ruta, k], fallos);
      }
    }
  }
}

/**
 * A Standard Schema validator for a JSON Schema. `root` resolves `$ref`
 * (`#/components/schemas/…`): pass the whole OpenAPI document.
 */
export function toStandardSchema<T = unknown>(schema: unknown, root: unknown = schema): StandardSchemaV1<T> {
  return {
    "~standard": {
      version: 1,
      vendor: "kitsuden",
      validate(value: unknown) {
        const issues: StandardIssue[] = [];
        validar(schema, value, (root ?? {}) as Json, [], issues);
        return issues.length ? { issues } : { value: value as T };
      },
    },
  };
}

/**
 * The body and success-response schemas of one operation of an OpenAPI
 * document, as Standard Schema. `operationId` is `kon.operation`
 * (`blog.crear-entrada`), the same as `OperationInfo.operationId`.
 */
export function operationSchemas(
  spec: unknown,
  operationId: string
): { body: StandardSchemaV1 | null; response: StandardSchemaV1 | null } {
  const paths = ((spec as Json)?.paths ?? {}) as Record<string, Record<string, Json>>;
  for (const metodos of Object.values(paths)) {
    for (const o of Object.values(metodos)) {
      if (o?.operationId !== operationId) continue;
      const cuerpo = ((o.requestBody as Json | undefined)?.content as Record<string, Json> | undefined)?.[
        "application/json"
      ]?.schema;
      const respuestas = (o.responses ?? {}) as Record<string, Json>;
      const exito = Object.keys(respuestas).sort().find((k) => /^2\d\d$/.test(k));
      const contenido = exito ? ((respuestas[exito]?.content ?? {}) as Record<string, Json>) : {};
      const resp =
        contenido["application/json"]?.schema ?? contenido["text/event-stream"]?.["x-kitsuden-event-schema"];
      return {
        body: cuerpo ? toStandardSchema(cuerpo, spec) : null,
        response: resp ? toStandardSchema(resp, spec) : null,
      };
    }
  }
  throw new TypeError(`operationSchemas: no operation '${operationId}' in this document`);
}
