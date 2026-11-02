/**
 * Kitsuden — Request Validation (FormRequest-style)
 * ============================================================================
 *
 * DX de validación estilo Laravel FormRequest / Django forms, sobre Zod:
 *   - Un solo helper `validate(schema, target)` como middleware.
 *   - En error → SIEMPRE el mismo envelope (AppError.validation con detalles
 *     por campo). Nada de respuestas ad-hoc en cada ruta.
 *   - En éxito → los datos tipados quedan en `c.get("valid:<target>")`, y se
 *     leen con el helper tipado `validated<T>(c, target)`.
 *
 * Uso:
 *   const CreatePost = z.object({ title: z.string().min(1), body: z.string() });
 *   app.post("/posts", validate(CreatePost), (c) => {
 *     const input = validated<z.infer<typeof CreatePost>>(c);   // tipado
 *     ...
 *   });
 *
 * ── LOS CAMPOS DESCONOCIDOS SE RECHAZAN, NO SE IGNORAN ─────────────────────
 *
 * Zod, por defecto, QUITA en silencio lo que el esquema no conoce. Aquí eso
 * costó datos de verdad: el editor del blog mandaba `tags` y la ruta esperaba
 * `tagIds`, así que las etiquetas se perdían al guardar y la respuesta era un
 * 200. Nadie se entera de un campo que desaparece.
 *
 * Para un humano es un fallo difícil de ver. Para un agente de IA es imposible:
 * no puede depurar un silencio, y un campo mal nombrado es exactamente el
 * error que un modelo comete. Así que un cuerpo con claves que el esquema no
 * conoce responde 422 con la clave, la sugerencia más parecida y la lista de
 * claves válidas.
 *
 * Solo en el CUERPO (`json` y `form`). En la query se toleran extras: un
 * `?utm_source=` o un parámetro anti-caché son normales y rechazarlos rompería
 * enlaces que no tienen nada de malo.
 *
 * `id`, `createdAt` y `updatedAt` se ignoran —y se avisa en la cabecera
 * `X-Kitsuden-Ignored-Fields`— porque los gestiona el servidor y el patrón más
 * común de un cliente es leer un objeto y devolverlo entero al actualizar.
 * Rechazarlos haría fallar ese patrón sin proteger nada.
 */

import type { Context, MiddlewareHandler } from "hono";
import { z, type ZodTypeAny } from "zod";

import { AppError } from "./errors";
import { withRouteMeta } from "./route-meta";

export type ValidationTarget = "json" | "query" | "param" | "form";

function keyFor(target: ValidationTarget): string {
  return `valid:${target}`;
}

async function readTarget(c: Context, target: ValidationTarget): Promise<unknown> {
  switch (target) {
    case "json":
      try {
        return await c.req.json();
      } catch {
        throw AppError.badRequest("Cuerpo JSON inválido o ausente");
      }
    case "query":
      return c.req.query();
    case "param":
      return c.req.param();
    case "form":
      return await c.req.parseBody();
  }
}

/** Aplana los issues de Zod a `{ campo: [mensajes] }`. */
function formatIssues(error: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const path = issue.path.length ? issue.path.join(".") : "_";
    (out[path] ??= []).push(issue.message);
  }
  return out;
}

// ── Campos desconocidos ──────────────────────────────────────────────────────

/** Los gestiona el servidor; un cliente los devuelve al hacer GET → PATCH. */
const CAMPOS_DE_SERVIDOR = new Set(["id", "createdAt", "updatedAt"]);

export interface CampoDesconocido {
  /** Ruta del objeto que lo contiene (`""` en la raíz, `theme` si va dentro). */
  path: string;
  key: string;
  didYouMean: string | null;
  validKeys: string[];
}

/**
 * Lo que zod 4 expone de cada esquema: `_zod.def.type` dice qué es ("object",
 * "optional", "pipe"…) y el resto de `def` sus piezas.
 */
type ZodInterno = { _zod?: { def: Record<string, unknown> & { type?: string } } };

function defDe(s: unknown): (Record<string, unknown> & { type?: string }) | undefined {
  return (s as ZodInterno | undefined)?._zod?.def;
}

/** Quita las capas que no cambian la FORMA: opcional, por defecto, transform… */
function desenvolver(schema: unknown): ZodInterno | undefined {
  let s = schema as ZodInterno | undefined;
  for (let i = 0; i < 20 && s?._zod; i++) {
    const def = s._zod.def;
    switch (def.type) {
      case "optional":
      case "nullable":
      case "default":
      case "prefault":
      case "catch":
      case "readonly":
      case "nonoptional":
        s = def.innerType as ZodInterno;
        break;
      case "pipe":
        // `.transform()` y `.pipe()`: la forma que recibe es la de entrada
        s = def.in as ZodInterno;
        break;
      case "lazy":
        s = (def.getter as () => ZodInterno)();
        break;
      default:
        return s;
    }
  }
  return s;
}

interface FormaDeObjeto {
  shape: Record<string, unknown>;
  /** `passthrough` o con `catchall`: acepta claves extra a propósito. */
  abierto: boolean;
}

function formaDeObjeto(schema: unknown): FormaDeObjeto | null {
  const def = defDe(desenvolver(schema));
  if (!def) return null;

  if (def.type === "object") {
    const shape = def.shape as Record<string, unknown>;
    // `passthrough()` es un catchall `unknown`; `strict()`, uno `never`
    const catchall = defDe(def.catchall)?.type;
    const abierto = !!catchall && catchall !== "never";
    return { shape, abierto };
  }

  if (def.type === "intersection") {
    const izq = formaDeObjeto(def.left);
    const der = formaDeObjeto(def.right);
    if (!izq || !der) return null;
    return { shape: { ...izq.shape, ...der.shape }, abierto: izq.abierto || der.abierto };
  }

  return null;
}

function esObjetoPlano(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
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

/**
 * La clave válida más parecida, o `null` si ninguna se parece lo bastante.
 *
 * Se normaliza antes de comparar —minúsculas, sin `_` ni `-`— porque el error
 * más frecuente no es una errata sino la convención equivocada: `tag_ids` por
 * `tagIds`. Y el umbral es estricto a propósito: una sugerencia mala es peor
 * que ninguna, porque el agente la seguirá.
 */
export function claveParecida(clave: string, validas: readonly string[]): string | null {
  const normalizar = (s: string) => s.toLowerCase().replace(/[_\-\s]/g, "");
  const n = normalizar(clave);
  let mejor: string | null = null;
  let menor = Infinity;
  for (const v of validas) {
    const nv = normalizar(v);
    if (nv === n) return v;
    const d = distancia(n, nv);
    if (d < menor) {
      menor = d;
      mejor = v;
    }
  }
  const umbral = Math.max(2, Math.floor(clave.length / 3));
  return menor <= umbral ? mejor : null;
}

/**
 * Busca claves que el esquema no conoce, recorriendo objetos anidados y listas.
 *
 * En una unión se compara contra la opción que MENOS desconocidas deja: si el
 * cuerpo encaja limpio en alguna, no hay nada que reportar.
 */
export function buscarCamposDesconocidos(
  schema: unknown,
  valor: unknown,
  ruta: string[] = [],
  desconocidos: CampoDesconocido[] = [],
  ignorados: string[] = []
): { desconocidos: CampoDesconocido[]; ignorados: string[] } {
  const s = desenvolver(schema);
  const def = defDe(s);
  const tipo = def?.type;

  if (tipo === "array") {
    if (Array.isArray(valor)) {
      valor.forEach((v, i) =>
        buscarCamposDesconocidos(def!.element, v, [...ruta, String(i)], desconocidos, ignorados)
      );
    }
    return { desconocidos, ignorados };
  }

  // En zod 4 la unión discriminada también es `union`
  if (tipo === "union") {
    const opciones = def!.options as unknown[];
    let mejor: ReturnType<typeof buscarCamposDesconocidos> | null = null;
    for (const opcion of opciones) {
      const r = buscarCamposDesconocidos(opcion, valor, ruta, [], []);
      if (!mejor || r.desconocidos.length < mejor.desconocidos.length) mejor = r;
      if (r.desconocidos.length === 0) break;
    }
    if (mejor) {
      desconocidos.push(...mejor.desconocidos);
      ignorados.push(...mejor.ignorados);
    }
    return { desconocidos, ignorados };
  }

  const forma = formaDeObjeto(s);
  if (!forma || !esObjetoPlano(valor)) return { desconocidos, ignorados };

  const validas = Object.keys(forma.shape);
  if (!forma.abierto) {
    for (const clave of Object.keys(valor)) {
      if (clave in forma.shape) continue;
      if (CAMPOS_DE_SERVIDOR.has(clave)) {
        ignorados.push([...ruta, clave].join("."));
        continue;
      }
      desconocidos.push({
        path: ruta.join("."),
        key: clave,
        didYouMean: claveParecida(clave, validas),
        validKeys: validas,
      });
    }
  }

  for (const [clave, sub] of Object.entries(forma.shape)) {
    if (clave in valor) {
      buscarCamposDesconocidos(sub, valor[clave], [...ruta, clave], desconocidos, ignorados);
    }
  }

  return { desconocidos, ignorados };
}

function mensajeDe(d: CampoDesconocido): string {
  const donde = d.path ? `${d.path}.${d.key}` : d.key;
  const sugerencia = d.didYouMean ? ` ¿Quisiste decir «${d.didYouMean}»?` : "";
  const validas = d.validKeys.length ? d.validKeys.join(", ") : "(ninguno)";
  return `Campo desconocido «${donde}».${sugerencia} Campos válidos: ${validas}.`;
}

/**
 * Middleware de validación. En fallo lanza AppError.validation (422) con
 * `details.fields`; en éxito deja los datos parseados/coercionados en contexto.
 *
 * Deja además su esquema en los metadatos de la ruta: es de donde sale el
 * cuerpo documentado en el OpenAPI y, por tanto, el tipo del SDK generado.
 */
export function validateRequest(
  schema: ZodTypeAny,
  target: ValidationTarget = "json"
): MiddlewareHandler {
  const mw: MiddlewareHandler = async (c, next) => {
    const raw = await readTarget(c, target);
    const result = schema.safeParse(raw);

    const estricto = target === "json" || target === "form";
    const { desconocidos, ignorados } = estricto
      ? buscarCamposDesconocidos(schema, raw)
      : { desconocidos: [] as CampoDesconocido[], ignorados: [] as string[] };

    if (!result.success || desconocidos.length > 0) {
      const fields = result.success ? {} : formatIssues(result.error);
      for (const d of desconocidos) {
        const clave = d.path ? `${d.path}.${d.key}` : d.key;
        (fields[clave] ??= []).push(mensajeDe(d));
      }

      throw AppError.validation(
        result.success ? "Campos desconocidos en la petición" : "Validación fallida",
        {
          target,
          fields,
          ...(desconocidos.length > 0
            ? {
                unknownKeys: desconocidos,
                hint:
                  "Kitsuden rechaza los campos que no conoce en vez de ignorarlos: " +
                  "un campo mal nombrado se perdería sin avisar.",
              }
            : {}),
        }
      );
    }

    if (ignorados.length > 0) c.header("X-Kitsuden-Ignored-Fields", ignorados.join(", "));

    c.set(keyFor(target) as never, result.data as never);
    await next();
  };

  return withRouteMeta(mw, { validation: [{ target, schema }] });
}

/** Lee los datos validados y tipados de una ruta. */
export function validated<T>(c: Context, target: ValidationTarget = "json"): T {
  return c.get(keyFor(target) as never) as T;
}

/**
 * Validación imperativa (sin middleware), para usar dentro de un handler o job.
 * Lanza AppError.validation si no pasa.
 *
 * NO rechaza campos desconocidos: se usa también sobre filas de la base y datos
 * internos, que traen columnas de más con toda legitimidad. La regla estricta
 * es para lo que entra por HTTP, y eso pasa por `validateRequest`.
 */
export function parseOrThrow<T extends ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw AppError.validation("Validación fallida", { fields: formatIssues(result.error) });
  }
  return result.data;
}

/**
 * ¿Tiene este texto forma de UUID?
 *
 * Existe porque un `id` que no lo es NO se puede pasar a una consulta: Postgres
 * responde `invalid input syntax for type uuid`, y eso sale por el manejador de
 * errores como **500**. Es decir, un parámetro mal escrito en la URL se
 * reportaba como fallo del servidor.
 *
 * Pasó de verdad, y de la forma más tonta: `GET /api/media/upload` encaja con
 * la ruta de detalle `/api/media/:id`, así que `id` valía `"upload"`. Un enlace
 * roto, un rastreador o alguien probando a mano bastaban para llenar el log de
 * errores 500 sobre una base perfectamente sana.
 *
 * Quien no pasa esta comprobación recibe **404**, no 400: si el id no puede
 * existir, "no encontrado" es exactamente lo que ocurre, y además no revela
 * qué formato de clave usa la tabla por dentro.
 */
export function esUuid(valor: string | undefined | null): boolean {
  if (!valor) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(valor);
}
