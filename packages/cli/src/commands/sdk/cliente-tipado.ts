/**
 * Cliente tipado desde el OpenAPI — lo que un agente no se puede inventar
 * ============================================================================
 *
 * ── LO QUE HABIA ───────────────────────────────────────────────────────────
 *
 * `kitsuden generate-sdk` escribía unos «fetchers» que solo sabían hablar con
 * `/items/{collection}`: sustituían `{collection}` y `{id}` en el camino y nada
 * más. Con el OpenAPI de entonces daba igual —no documentaba ninguna ruta de
 * kon—, pero en cuanto el contrato empezó a incluir `/esports/...` o
 * `/tierlist/...`, el generador producía funciones que llamaban a caminos con
 * `{tournamentId}` literal dentro.
 *
 * Y sin tipos de cuerpo. Un agente que escribía `{ winner: "p1" }` en vez de
 * `{ winnerId: "p1" }` no se enteraba hasta leer un 422 en ejecución.
 *
 * ── LO QUE HACE AHORA ──────────────────────────────────────────────────────
 *
 * Genera UN fichero TypeScript sin dependencias con:
 *
 *   · un espacio de nombres por kon (`client.esports`, `client.tierlist`)
 *   · un método por operación, con los parámetros de ruta, el cuerpo y la
 *     query tipados a partir del JSON Schema del contrato
 *   · un error (`KitsudenApiError`) que conserva el cuerpo de la respuesta y
 *     pone en el mensaje las sugerencias de `didYouMean`
 *
 * El objetivo es que el error más común de un agente —el nombre de un campo—
 * falle AL COMPILAR, que es el sitio donde un agente sí sabe corregirse solo.
 */

export interface EsquemaJson {
  type?: string | string[];
  properties?: Record<string, EsquemaJson>;
  required?: string[];
  items?: EsquemaJson | EsquemaJson[];
  enum?: unknown[];
  nullable?: boolean;
  anyOf?: EsquemaJson[];
  oneOf?: EsquemaJson[];
  allOf?: EsquemaJson[];
  additionalProperties?: boolean | EsquemaJson;
  description?: string;
  $ref?: string;
}

interface ParametroOpenApi {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  required?: boolean;
  schema?: EsquemaJson;
}

interface OperacionOpenApi {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: ParametroOpenApi[];
  requestBody?: { content?: Record<string, { schema?: EsquemaJson }> };
  security?: unknown[];
  "x-kitsuden-section"?: string;
}

export interface EspecOpenApi {
  paths?: Record<string, Record<string, OperacionOpenApi | unknown>>;
  components?: { schemas?: Record<string, EsquemaJson> };
}

export interface OpcionesDeGeneracion {
  /** URL base que se pone por defecto en el cliente. Se puede cambiar al crearlo. */
  baseUrl?: string;
}

const METODOS = ["get", "post", "put", "patch", "delete"] as const;

// ── Nombres ──────────────────────────────────────────────────────────────────

function palabras(texto: string): string[] {
  return texto
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
}

function camel(partes: string[]): string {
  const [primera = "op", ...resto] = partes;
  const base =
    primera.charAt(0).toLowerCase() +
    primera.slice(1) +
    resto.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("");
  return /^[0-9]/.test(base) ? `op${base}` : base;
}

function pascal(texto: string): string {
  const c = camel(palabras(texto));
  return c.charAt(0).toUpperCase() + c.slice(1);
}

/** `kon-esports` → `esports`; `Datasets` → `datasets`. */
function espacioDe(tag: string | undefined): string {
  if (!tag) return "api";
  return camel(palabras(tag.replace(/^kon-/, "")));
}

/**
 * ¿Es esta palabra el nombre del espacio, en singular o en plural?
 *
 * Los datasets tienen `operationId` como `dataset_personajes_create` y viven en
 * el espacio `datasets`. Comparando solo igualdad exacta no se quitaba el
 * prefijo y el método salía `datasetPersonajesCreate` dentro de `datasets`.
 */
function mismoEspacio(palabra: string, espacio: string): boolean {
  const a = palabra.toLowerCase();
  const b = espacio.toLowerCase();
  return a === b || `${a}s` === b || a === `${b}s`;
}

/**
 * Nombre del método.
 *
 * Si el `operationId` ya es legible (`reportSet`, puesto con `describeRoute`),
 * se usa tal cual: es el nombre que alguien eligió pensando en quien lo lee.
 * Si es el generado (`esports_post_tournament_tournamentId_report`), se
 * convierte a camelCase quitando el prefijo del kon, que ya está en el espacio.
 */
function nombreDeMetodo(operationId: string, espacio: string): string {
  if (/^[a-z][A-Za-z0-9]*$/.test(operationId)) return operationId;
  const partes = palabras(operationId);
  const sinKon = partes.length > 1 && mismoEspacio(partes[0], espacio) ? partes.slice(1) : partes;
  return camel(sinKon);
}

function claveSegura(clave: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(clave) ? clave : JSON.stringify(clave);
}

function nombreDeRef(ref: string): string {
  return pascal(ref.split("/").pop() ?? "Tipo");
}

function comentario(texto: string | undefined, sangria: string): string {
  if (!texto) return "";
  const limpio = texto.replace(/\*\//g, "* /").trim();
  return `${sangria}/** ${limpio.split("\n").join(`\n${sangria} * `)} */\n`;
}

// ── JSON Schema → TypeScript ────────────────────────────────────────────────

function tipoDe(s: EsquemaJson | undefined, sangria = ""): string {
  if (!s) return "unknown";
  if (s.$ref) return nombreDeRef(s.$ref);

  let t: string;
  if (Array.isArray(s.enum) && s.enum.length > 0) {
    t = s.enum.map((v) => JSON.stringify(v)).join(" | ");
  } else if (s.anyOf || s.oneOf) {
    t = (s.anyOf ?? s.oneOf)!.map((x) => tipoDe(x, sangria)).join(" | ");
  } else if (s.allOf) {
    t = s.allOf.map((x) => `(${tipoDe(x, sangria)})`).join(" & ");
  } else {
    const tipos = Array.isArray(s.type) ? s.type : s.type ? [s.type] : [];
    t =
      tipos.length > 1
        ? tipos.map((uno) => tipoPrimitivo(uno, s, sangria)).join(" | ")
        : tipoPrimitivo(tipos[0], s, sangria);
  }

  return s.nullable ? `${t} | null` : t;
}

function tipoPrimitivo(tipo: string | undefined, s: EsquemaJson, sangria: string): string {
  switch (tipo) {
    case "string":
      return "string";
    case "integer":
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "null":
      return "null";
    case "array": {
      const item = Array.isArray(s.items) ? undefined : s.items;
      return `Array<${tipoDe(item, sangria)}>`;
    }
    default: {
      const props = s.properties ?? {};
      if (Object.keys(props).length > 0) {
        const requeridos = new Set(s.required ?? []);
        const dentro = `${sangria}  `;
        const campos = Object.entries(props)
          .map(
            ([clave, sub]) =>
              `${comentario(sub.description, dentro)}${dentro}${claveSegura(clave)}${
                requeridos.has(clave) ? "" : "?"
              }: ${tipoDe(sub, dentro)};`
          )
          .join("\n");
        /**
         * Solo se abre el objeto si el esquema lo abre. Añadir `Record<string,
         * unknown>` por defecto desactivaría la comprobación de propiedades de
         * más, que es justo lo que convierte un `tags` en error de compilación.
         */
        const abierto =
          s.additionalProperties === true
            ? " & Record<string, unknown>"
            : typeof s.additionalProperties === "object"
              ? ` & Record<string, ${tipoDe(s.additionalProperties, sangria)}>`
              : "";
        return `{\n${campos}\n${sangria}}${abierto}`;
      }
      if (typeof s.additionalProperties === "object") {
        return `Record<string, ${tipoDe(s.additionalProperties, sangria)}>`;
      }
      if (tipo === "object" || s.additionalProperties === true) return "Record<string, unknown>";
      return "unknown";
    }
  }
}

// ── Operaciones ──────────────────────────────────────────────────────────────

interface Operacion {
  espacio: string;
  metodo: string;
  camino: string;
  nombre: string;
  resumen?: string;
  descripcion?: string;
  deRuta: ParametroOpenApi[];
  deQuery: ParametroOpenApi[];
  cuerpo?: EsquemaJson;
  protegida: boolean;
  seccion?: string;
}

function recogerOperaciones(espec: EspecOpenApi): Operacion[] {
  const salida: Operacion[] = [];
  const usados = new Map<string, Set<string>>();

  for (const [camino, item] of Object.entries(espec.paths ?? {})) {
    for (const metodo of METODOS) {
      const op = (item as Record<string, OperacionOpenApi | undefined>)[metodo];
      if (!op) continue;

      const espacio = espacioDe(op.tags?.[0]);
      const idBase =
        op.operationId ?? `${metodo}_${camino.replace(/[{}]/g, "").replace(/[^A-Za-z0-9]+/g, "_")}`;

      let nombre = nombreDeMetodo(idBase, espacio);
      const enEspacio = usados.get(espacio) ?? new Set<string>();
      for (let n = 2; enEspacio.has(nombre); n++) nombre = `${nombreDeMetodo(idBase, espacio)}${n}`;
      enEspacio.add(nombre);
      usados.set(espacio, enEspacio);

      const contenido = op.requestBody?.content ?? {};
      const cuerpo = (contenido["application/json"] ?? Object.values(contenido)[0])?.schema;

      salida.push({
        espacio,
        metodo: metodo.toUpperCase(),
        camino,
        nombre,
        resumen: op.summary,
        descripcion: op.description,
        deRuta: (op.parameters ?? []).filter((p) => p.in === "path"),
        deQuery: (op.parameters ?? []).filter((p) => p.in === "query"),
        cuerpo,
        protegida: Array.isArray(op.security) && op.security.length > 0,
        seccion: op["x-kitsuden-section"],
      });
    }
  }

  return salida;
}

function firmaYLlamada(op: Operacion): { tipos: string; firma: string; llamada: string } {
  const tipoBase = pascal(`${op.espacio} ${op.nombre}`);
  const tipos: string[] = [];
  const args: string[] = [];

  if (op.deRuta.length > 0) {
    const campos = op.deRuta.map((p) => `  ${claveSegura(p.name)}: string | number;`).join("\n");
    tipos.push(`export interface ${tipoBase}Path {\n${campos}\n}`);
    args.push(`path: ${tipoBase}Path`);
  }

  if (op.cuerpo) {
    tipos.push(`export type ${tipoBase}Body = ${tipoDe(op.cuerpo)};`);
    args.push(`body: ${tipoBase}Body`);
  }

  if (op.deQuery.length > 0) {
    const campos = op.deQuery
      .map(
        (p) =>
          `  ${claveSegura(p.name)}${p.required ? "" : "?"}: ${tipoDe(p.schema)} | string | number | boolean;`
      )
      .join("\n");
    tipos.push(`export interface ${tipoBase}Query {\n${campos}\n}`);
    const requerida = op.deQuery.some((p) => p.required);
    args.push(`query${requerida ? "" : "?"}: ${tipoBase}Query`);
  }

  const plantilla = op.camino.replace(
    /\{([^}]+)\}/g,
    (_m, nombre: string) => "${encodeURIComponent(String(path[" + JSON.stringify(nombre) + "]))}"
  );

  const init = [
    op.cuerpo ? "body" : "",
    op.deQuery.length > 0 ? "query: query as Record<string, unknown> | undefined" : "",
  ]
    .filter(Boolean)
    .join(", ");

  return {
    tipos: tipos.join("\n\n"),
    firma: `<T = unknown>(${args.join(", ")}): Promise<T>`,
    llamada: `llamar<T>(opciones, ${JSON.stringify(op.metodo)}, \`${plantilla}\`${init ? `, { ${init} }` : ""})`,
  };
}

// ── Plantilla del fichero ────────────────────────────────────────────────────

const NUCLEO = `export interface KitsudenClientOptions {
  /** URL base de la API, con \`/api\` al final. */
  baseUrl?: string;
  /** Token de agente (\`kitsuden_agent_*\`). Sin él se usan las cookies del navegador. */
  token?: string;
  /** Para pruebas o entornos sin \`fetch\` global. */
  fetch?: typeof fetch;
  credentials?: RequestCredentials;
}

/**
 * Error de la API con el cuerpo de la respuesta intacto.
 *
 * El mensaje incluye las sugerencias de \`didYouMean\` que devuelve Kitsuden
 * cuando un campo no existe, para que se lean sin tener que abrir \`body\`.
 */
export class KitsudenApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
    readonly method: string,
    readonly path: string
  ) {
    super(mensajeDeError(status, body, method, path));
    this.name = "KitsudenApiError";
  }
}

function mensajeDeError(status: number, body: unknown, method: string, path: string): string {
  const b = body as {
    error?: string | { message?: string; details?: { unknownKeys?: { key: string; didYouMean: string | null }[] } };
    message?: string;
  } | null;
  const principal =
    typeof b?.error === "string"
      ? b.error
      : (b?.error?.message ?? b?.message ?? \`HTTP \${status}\`);
  const desconocidas = typeof b?.error === "object" ? (b.error.details?.unknownKeys ?? []) : [];
  const pistas = desconocidas.map((k) =>
    k.didYouMean ? \`«\${k.key}» → «\${k.didYouMean}»\` : \`«\${k.key}» no existe\`
  );
  return \`\${method} \${path} → \${status}: \${principal}\${pistas.length ? \` (\${pistas.join(", ")})\` : ""}\`;
}

async function llamar<T>(
  opciones: KitsudenClientOptions,
  method: string,
  path: string,
  init: { query?: Record<string, unknown>; body?: unknown } = {}
): Promise<T> {
  const base = (opciones.baseUrl ?? URL_POR_DEFECTO).replace(/\\/+$/, "");
  const query = new URLSearchParams();
  for (const [clave, valor] of Object.entries(init.query ?? {})) {
    if (valor !== undefined && valor !== null) query.set(clave, String(valor));
  }
  const textoQuery = query.toString();

  const headers: Record<string, string> = { accept: "application/json" };
  if (init.body !== undefined) headers["content-type"] = "application/json";
  if (opciones.token) headers.authorization = \`Bearer \${opciones.token}\`;

  const res = await (opciones.fetch ?? fetch)(\`\${base}\${path}\${textoQuery ? \`?\${textoQuery}\` : ""}\`, {
    method,
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    credentials: opciones.credentials ?? "include",
  });

  const texto = await res.text();
  let datos: unknown = texto;
  try {
    datos = texto ? JSON.parse(texto) : null;
  } catch {
    // No era JSON: se devuelve el texto tal cual.
  }

  if (!res.ok) throw new KitsudenApiError(res.status, datos, method, path);
  return datos as T;
}`;

/**
 * Genera el cliente a partir de un OpenAPI de Kitsuden.
 *
 * Función pura: recibe el spec y devuelve el código. El comando se encarga de
 * pedirlo a la API y de escribir el fichero, y así esto se prueba sin red.
 */
export function generarClienteTipado(
  espec: EspecOpenApi,
  opciones: OpcionesDeGeneracion = {}
): string {
  const baseUrl = opciones.baseUrl ?? "http://localhost:3000/api";
  const operaciones = recogerOperaciones(espec);

  const componentes = Object.entries(espec.components?.schemas ?? {})
    .map(([nombre, esquema]) => `export type ${pascal(nombre)} = ${tipoDe(esquema)};`)
    .join("\n\n");

  const porEspacio = new Map<string, Operacion[]>();
  for (const op of operaciones) {
    const lista = porEspacio.get(op.espacio) ?? [];
    lista.push(op);
    porEspacio.set(op.espacio, lista);
  }

  const bloquesDeTipos: string[] = [];
  const espacios: string[] = [];

  for (const [espacio, ops] of [...porEspacio.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const metodos: string[] = [];
    for (const op of ops) {
      const { tipos, firma, llamada } = firmaYLlamada(op);
      if (tipos) bloquesDeTipos.push(tipos);

      const doc = [
        op.resumen ?? `${op.metodo} ${op.camino}`,
        "",
        `\`${op.metodo} ${op.camino}\``,
        op.protegida ? "Requiere sesión o token de agente." : "",
        op.seccion ? `Necesita la sección «${op.seccion}» encendida (si no, 409).` : "",
        op.descripcion ?? "",
      ]
        .filter((l, i, todas) => l !== "" || (i > 0 && todas[i - 1] !== ""))
        .join("\n")
        .trim();

      metodos.push(
        `${comentario(doc, "    ")}    ${op.nombre}: ${firma.replace("): Promise<T>", "): Promise<T> =>")} ${llamada},`
      );
    }
    espacios.push(
      `    ${claveSegura(espacio)}: {\n${metodos.map((m) => `  ${m}`).join("\n")}\n    },`
    );
  }

  return [
    "// ════════════════════════════════════════════════════════════════════════",
    "// Cliente de Kitsuden — GENERADO por `kitsuden generate-sdk`. No editar a mano.",
    "// Sale de GET /api/docs/openapi.json: vuelve a generarlo si cambian las rutas.",
    "// ════════════════════════════════════════════════════════════════════════",
    "",
    `const URL_POR_DEFECTO = ${JSON.stringify(baseUrl)};`,
    "",
    NUCLEO,
    "",
    "// ── Tipos de los datasets ───────────────────────────────────────────────",
    "",
    componentes || "// (sin datasets)",
    "",
    "// ── Tipos de las operaciones ────────────────────────────────────────────",
    "",
    bloquesDeTipos.join("\n\n") || "// (sin operaciones con parámetros o cuerpo)",
    "",
    "// ── Cliente ─────────────────────────────────────────────────────────────",
    "",
    "/**",
    " * Crea el cliente.",
    " *",
    " *     const kitsuden = createKitsudenClient({ token: process.env.KITSUDEN_TOKEN });",
    " *     await kitsuden.esports.reportSet({ tournamentId }, { matchId, winnerId });",
    " */",
    "export function createKitsudenClient(opciones: KitsudenClientOptions = {}) {",
    "  return {",
    espacios.join("\n"),
    "  };",
    "}",
    "",
    "export type KitsudenClient = ReturnType<typeof createKitsudenClient>;",
    "",
  ].join("\n");
}
