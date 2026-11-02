/**
 * defineModelo — declarar un modelo UNA vez (fase H3, el «momento Django»)
 * ============================================================================
 *
 * Un kon (o la app) declara un modelo con sus campos y su POLÍTICA DE ACCESO,
 * y de esa declaración sale todo lo demás:
 *
 *   · la tabla Drizzle (`tablaDeModelo`, en @kitsuden/engine);
 *   · la migración SQL y el diff estilo `makemigrations` (`modelos-sql.ts`):
 *     se GENERA en la carpeta de migraciones del kon o de la app, nunca se
 *     ejecuta sola contra nada;
 *   · las operaciones del SDK de kons (`defineOperacion`): REST, OpenAPI 3.1 y
 *     herramientas MCP salen de ellas, con la validación zod de aquí;
 *   · la RLS de Postgres según la política declarada (dueño / equipo /
 *     público), con las funciones de agente del núcleo;
 *   · los scopes de agente `<modelo>:read` y `<modelo>:write` (un agente NUNCA
 *     escribe por defecto: hace falta el scope de escritura, uno fino del kon,
 *     el amplio del kon o `admin`) y la sensibilidad (DELETE sensible);
 *   · la vista del panel (`descriptorDeModelo`: lista, alta y edición).
 *
 * Este fichero es CONTRATO y es puro (sin base, sin Hono, sin Drizzle): lo
 * leen el motor, la API, el panel, el CLI (`kitsuden makemigrations`, que lo
 * carga con bun) y los tests.
 *
 * Seguro por defecto: no hay modelo sin `acceso`. `defineModelo` lanza si
 * falta o si pide algo que no existe; no hay «abierto mientras tanto».
 *
 * Guía pública: docs/agents/models.md.
 */

import { z, type ZodTypeAny } from "zod";

import { esquemaFecha } from "./operaciones";

/** Versión del formato del modelo (descriptor e instantánea). Entera. */
export const VERSION_DE_MODELOS = 1;

// ── Campos ──────────────────────────────────────────────────────────────────

export type TipoDeCampo =
  | "texto"
  | "textoLargo"
  | "entero"
  | "numero"
  | "booleano"
  | "fecha"
  | "enumerado"
  | "json"
  | "uuid";

export const TIPOS_DE_CAMPO: readonly TipoDeCampo[] = [
  "texto",
  "textoLargo",
  "entero",
  "numero",
  "booleano",
  "fecha",
  "enumerado",
  "json",
  "uuid",
];

/** Un valor por defecto que se puede escribir en SQL y en JSON. */
export type ValorPorDefecto = string | number | boolean | null | Record<string, unknown> | unknown[];

/** La declaración de un campo (lo que devuelven los constructores de `campo`). */
export interface Campo {
  tipo: TipoDeCampo;
  /** NOT NULL y obligatorio al crear (salvo que tenga `porDefecto`). */
  requerido: boolean;
  /** UNIQUE en la tabla (409 KITSUDEN_E_CONFLICT al repetir). */
  unico: boolean;
  /**
   * Valor por defecto. Vive en la COLUMNA (`DEFAULT`), no en zod: así lo
   * respetan también las filas que entran por SQL. En `fecha`, `"ahora"` es
   * `now()`.
   */
  porDefecto?: ValorPorDefecto;
  /** Texto: longitud mínima/máxima. Entero/número: valor mínimo/máximo. */
  min?: number;
  max?: number;
  /** Solo `enumerado`. */
  valores?: readonly string[];
  /** Para el panel (por defecto, la clave). */
  etiqueta?: string;
  /** Para humanos y agentes (OpenAPI, MCP, panel). */
  descripcion?: string;
  /** Índice simple en la columna. */
  indice?: boolean;
  /**
   * Nombre ANTERIOR del campo: `makemigrations` lo renombra (RENAME COLUMN) en
   * vez de borrar y crear. Quítalo cuando la migración ya esté aplicada.
   */
  antes?: string;
}

type OpcionesComunes = Partial<Pick<Campo, "requerido" | "unico" | "etiqueta" | "descripcion" | "indice" | "antes">>;

/** Constructores de campos: `campo.texto({ max: 200, requerido: true })`. */
export const campo = {
  texto: (o: OpcionesComunes & { min?: number; max?: number; porDefecto?: string } = {}): Campo =>
    base("texto", o),
  textoLargo: (o: OpcionesComunes & { max?: number; porDefecto?: string } = {}): Campo =>
    base("textoLargo", o),
  entero: (o: OpcionesComunes & { min?: number; max?: number; porDefecto?: number } = {}): Campo =>
    base("entero", o),
  numero: (o: OpcionesComunes & { min?: number; max?: number; porDefecto?: number } = {}): Campo =>
    base("numero", o),
  booleano: (o: OpcionesComunes & { porDefecto?: boolean } = {}): Campo => base("booleano", o),
  fecha: (o: OpcionesComunes & { porDefecto?: "ahora" } = {}): Campo => base("fecha", o),
  enumerado: (
    valores: readonly string[],
    o: OpcionesComunes & { porDefecto?: string } = {}
  ): Campo => base("enumerado", { ...o, valores: [...valores] }),
  json: (o: OpcionesComunes & { porDefecto?: Record<string, unknown> | unknown[] } = {}): Campo =>
    base("json", o),
  uuid: (o: OpcionesComunes = {}): Campo => base("uuid", o),
};

function base(tipo: TipoDeCampo, o: Partial<Campo>): Campo {
  const c: Campo = { tipo, requerido: o.requerido ?? false, unico: o.unico ?? false };
  for (const k of ["porDefecto", "min", "max", "valores", "etiqueta", "descripcion", "indice", "antes"] as const) {
    if (o[k] !== undefined) (c as unknown as Record<string, unknown>)[k] = o[k];
  }
  return c;
}

// ── Acceso (obligatorio) ────────────────────────────────────────────────────

/**
 * Quién LEE las filas:
 *   publico  cualquiera, también sin sesión (y cualquier agente).
 *   dueno    cada cuenta ve las suyas (columna `owner_id`); el admin (o el
 *            agente que abre el kon entero) las ve todas.
 *   staff    admin y editor (o el agente que abre el kon entero).
 *
 * No hay «cualquier cuenta con sesión lo ve todo»: `verify-rls` trata como
 * fuga lo que ve un desconocido y no ve el anónimo, y tiene razón.
 */
export type LecturaDeModelo = "publico" | "dueno" | "staff";

/**
 * Quién ESCRIBE (crear, editar, borrar):
 *   dueno   cualquier cuenta crea; edita y borra solo lo suyo (admin: todo).
 *   staff   admin y editor (o el agente que abre el kon entero).
 *
 * Nunca «público»: un modelo no se escribe sin sesión. Un agente necesita
 * además `<modelo>:write` (o un scope fino/amplio del kon, o `admin`).
 */
export type EscrituraDeModelo = "dueno" | "staff";

export interface AccesoDeModelo {
  leer: LecturaDeModelo;
  escribir: EscrituraDeModelo;
}

export const LECTURAS_DE_MODELO: readonly LecturaDeModelo[] = ["publico", "dueno", "staff"];
export const ESCRITURAS_DE_MODELO: readonly EscrituraDeModelo[] = ["dueno", "staff"];

// ── El modelo ───────────────────────────────────────────────────────────────

export interface DeclaracionDeModelo<C extends Record<string, Campo> = Record<string, Campo>> {
  /** Singular, kebab-case: `note`, `task-item`. Es contrato (scopes, herramientas). */
  nombre: string;
  /** Plural, kebab-case (por defecto `nombre + "s"`): rutas y la operación de listar. */
  plural?: string;
  /** Tabla (por defecto, el plural en snake_case). */
  tabla?: string;
  /** Para humanos y agentes: qué es una fila. */
  descripcion: string;
  /** Para el panel (por defecto, el nombre). */
  etiqueta?: string;
  campos: C;
  /** OBLIGATORIO. Sin política de acceso no hay modelo. */
  acceso: AccesoDeModelo;
  /** El campo que se enseña como título de una fila en el panel (por defecto, el primero de texto). */
  titulo?: Extract<keyof C, string>;
  /**
   * Qué operaciones quedan como PROPUESTA cuando las pide un agente en modo
   * selectivo. Por defecto solo borrar (como el SDK: DELETE es sensible).
   */
  sensible?: { crear?: boolean; actualizar?: boolean; borrar?: boolean };
  /**
   * Búsqueda SEMÁNTICA (kitsuden2.md D5): un embedding por fila, calculado en
   * segundo plano (la cola de Postgres) a partir de estos campos de texto, en
   * una columna `embedding vector(dimensiones)` de pgvector con índice HNSW. Da
   * la operación `search-<plural>` (`GET /<plural>/search?q=`), con la misma
   * política de acceso que listar. `dimensiones` (por defecto 1536) tiene que
   * casar con el modelo de embeddings configurado en la API.
   */
  semantica?: { campos: Extract<keyof C, string>[]; dimensiones?: number };
}

const MARCA = Symbol.for("kitsuden.modelo");

/** Un modelo ya comprobado, con todo resuelto. Es un objeto de datos (JSON-able salvo la marca). */
export interface Modelo<C extends Record<string, Campo> = Record<string, Campo>> {
  readonly [MARCA]: true;
  readonly version: typeof VERSION_DE_MODELOS;
  readonly nombre: string;
  readonly plural: string;
  readonly tabla: string;
  readonly descripcion: string;
  readonly etiqueta: string;
  readonly campos: C;
  readonly acceso: AccesoDeModelo;
  readonly titulo: string | null;
  readonly sensible: { crear: boolean; actualizar: boolean; borrar: boolean };
  /** `null` = sin búsqueda semántica. */
  readonly semantica: { campos: string[]; dimensiones: number } | null;
}

export function esModelo(x: unknown): x is Modelo {
  return !!x && typeof x === "object" && (x as Record<symbol, unknown>)[MARCA] === true;
}

const KEBAB = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const CLAVE = /^[a-z][a-zA-Z0-9]*$/;
const TABLA = /^[a-z][a-z0-9_]*$/;

/** Columnas que pone el modelo: no se pueden declarar como campos. */
export const COLUMNAS_DEL_SISTEMA = ["id", "owner_id", "created_at", "updated_at"] as const;
/** Claves (camelCase) de esas columnas en la API. */
export const CLAVES_DEL_SISTEMA = ["id", "ownerId", "createdAt", "updatedAt"] as const;

/**
 * Nombres que no pueden ser modelos: su scope (`<nombre>:read`) chocaría con
 * uno amplio del núcleo (`admin:*`, `mcp:read`, `datasets:*`…).
 */
export const NOMBRES_RESERVADOS = [
  "admin",
  "mcp",
  "kon",
  "datasets",
  "usuario",
  "contenido",
  "memory",
  "brain",
  "promotion",
  "mail",
  "gate",
  "models",
  "model",
] as const;

/** `dueDate` → `due_date`. */
export function columnaDeCampo(clave: string): string {
  return clave.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

/** `task-items` → `task_items`. */
function snake(s: string): string {
  return s.replace(/-/g, "_");
}

const MAX_IDENTIFICADOR = 63;
const INT_MIN = -2147483648;
const INT_MAX = 2147483647;

/**
 * Declara un modelo. Comprueba AL DECLARARLO lo que luego sería un fallo
 * silencioso o una puerta abierta: nombres con forma, política de acceso
 * presente y conocida, campos con tipo, valores por defecto válidos,
 * identificadores SQL que caben en 63 caracteres.
 */
function semanticaDe(
  d: DeclaracionDeModelo<Record<string, Campo>>,
  donde: string
): { campos: string[]; dimensiones: number } | null {
  if (!d.semantica) return null;
  const campos = [...new Set(d.semantica.campos ?? [])];
  if (campos.length === 0) throw new Error(`${donde}: semantica.campos necesita al menos un campo de texto`);
  for (const c of campos) {
    const def = d.campos[c];
    if (!def) throw new Error(`${donde}: semantica.campos nombra '${c}', que no es un campo`);
    if (def.tipo !== "texto" && def.tipo !== "textoLargo") {
      throw new Error(`${donde}: semantica.campos solo admite texto o textoLargo ('${c}' es ${def.tipo})`);
    }
  }
  const dimensiones = d.semantica.dimensiones ?? 1536;
  // El índice HNSW de pgvector admite hasta 2.000 dimensiones en `vector`.
  if (!Number.isInteger(dimensiones) || dimensiones < 1 || dimensiones > 2000) {
    throw new Error(`${donde}: semantica.dimensiones es un entero entre 1 y 2000 (el tope del índice HNSW de pgvector)`);
  }
  return { campos, dimensiones };
}

/** Los ids de operación de un modelo, más `buscar` si tiene búsqueda semántica. */
export function idDeBusquedaDeModelo(m: Pick<Modelo, "plural">): string {
  return `search-${m.plural}`;
}

export function defineModelo<C extends Record<string, Campo>>(d: DeclaracionDeModelo<C>): Modelo<C> {
  const donde = `modelo '${String(d?.nombre)}'`;
  if (!d || typeof d !== "object") throw new Error("defineModelo: falta la declaración");
  if (!KEBAB.test(d.nombre ?? "")) throw new Error(`${donde}: el nombre va en kebab-case singular ([a-z0-9-])`);
  if ((NOMBRES_RESERVADOS as readonly string[]).includes(d.nombre)) {
    throw new Error(`${donde}: '${d.nombre}' está reservado (su scope chocaría con uno del núcleo)`);
  }
  const plural = d.plural ?? `${d.nombre}s`;
  if (!KEBAB.test(plural)) throw new Error(`${donde}: el plural va en kebab-case`);
  if (plural === d.nombre) throw new Error(`${donde}: el plural tiene que ser distinto del nombre`);
  const tabla = d.tabla ?? snake(plural);
  if (!TABLA.test(tabla) || tabla.length > 40) {
    throw new Error(`${donde}: la tabla '${tabla}' va en snake_case y con 40 caracteres como mucho`);
  }
  if (!d.descripcion?.trim()) throw new Error(`${donde}: hace falta una descripción (la leen humanos y agentes)`);

  // La política de acceso: obligatoria, y solo con valores conocidos.
  const acceso = d.acceso as AccesoDeModelo | undefined;
  if (!acceso || typeof acceso !== "object") {
    throw new Error(
      `${donde}: falta 'acceso'. Un modelo sin política de acceso no se declara ` +
        `(p. ej. acceso: { leer: "dueno", escribir: "dueno" }).`
    );
  }
  if (!LECTURAS_DE_MODELO.includes(acceso.leer)) {
    throw new Error(`${donde}: acceso.leer es ${LECTURAS_DE_MODELO.join(" | ")} (llegó '${String(acceso.leer)}')`);
  }
  if (!ESCRITURAS_DE_MODELO.includes(acceso.escribir)) {
    throw new Error(
      `${donde}: acceso.escribir es ${ESCRITURAS_DE_MODELO.join(" | ")} (llegó '${String(acceso.escribir)}'); ` +
        `la escritura pública no existe`
    );
  }
  if (acceso.leer === "staff" && acceso.escribir === "dueno") {
    throw new Error(`${donde}: con leer "staff" y escribir "dueno" el dueño no podría leer lo que escribe; usa leer "dueno"`);
  }
  const extra = Object.keys(acceso).filter((k) => k !== "leer" && k !== "escribir");
  if (extra.length) throw new Error(`${donde}: acceso no conoce ${extra.join(", ")}`);

  const claves = Object.keys(d.campos ?? {});
  if (claves.length === 0) throw new Error(`${donde}: declara al menos un campo`);
  const columnas = new Set<string>();
  for (const clave of claves) {
    const c = d.campos[clave]!;
    const de = `${donde}, campo '${clave}'`;
    if (!CLAVE.test(clave)) throw new Error(`${de}: la clave va en camelCase ([a-zA-Z0-9], empieza por minúscula)`);
    if ((CLAVES_DEL_SISTEMA as readonly string[]).includes(clave)) {
      throw new Error(`${de}: '${clave}' lo pone el modelo; elige otro nombre`);
    }
    const columna = columnaDeCampo(clave);
    if ((COLUMNAS_DEL_SISTEMA as readonly string[]).includes(columna) || columnas.has(columna)) {
      throw new Error(`${de}: la columna '${columna}' ya existe`);
    }
    columnas.add(columna);
    if (`${tabla}_${columna}_check`.length > MAX_IDENTIFICADOR) {
      throw new Error(`${de}: '${tabla}_${columna}_check' pasa de ${MAX_IDENTIFICADOR} caracteres; acorta la tabla o la clave`);
    }
    if (!c || !TIPOS_DE_CAMPO.includes(c.tipo)) throw new Error(`${de}: tipo desconocido (usa campo.texto(), campo.entero()…)`);
    if (c.tipo === "enumerado") {
      if (!c.valores?.length) throw new Error(`${de}: un enumerado necesita valores`);
      if (new Set(c.valores).size !== c.valores.length) throw new Error(`${de}: valores repetidos`);
      for (const v of c.valores) {
        if (typeof v !== "string" || !v || v.length > 100) throw new Error(`${de}: cada valor es texto de 1 a 100 caracteres`);
      }
    } else if (c.valores) {
      throw new Error(`${de}: 'valores' solo vale en un enumerado`);
    }
    if ((c.min !== undefined || c.max !== undefined) && !["texto", "textoLargo", "entero", "numero"].includes(c.tipo)) {
      throw new Error(`${de}: min/max solo valen en texto y números`);
    }
    for (const lim of [c.min, c.max]) {
      if (lim !== undefined && !Number.isFinite(lim)) throw new Error(`${de}: min/max son números`);
    }
    if (c.min !== undefined && c.max !== undefined && c.min > c.max) throw new Error(`${de}: min > max`);
    if ((c.tipo === "texto" || c.tipo === "textoLargo") && c.max !== undefined) {
      if (!Number.isInteger(c.max) || c.max < 1 || c.max > 10_485_760) throw new Error(`${de}: max de un texto es un entero entre 1 y 10485760`);
    }
    if (c.tipo === "entero") {
      if ((c.min ?? 0) < INT_MIN || (c.max ?? 0) > INT_MAX) throw new Error(`${de}: un entero cabe en 32 bits`);
    }
    if (c.antes !== undefined && (!CLAVE.test(c.antes) || c.antes === clave)) {
      throw new Error(`${de}: 'antes' es la clave anterior del campo, en camelCase`);
    }
    if (c.porDefecto !== undefined) {
      if (c.tipo === "fecha") {
        if (c.porDefecto !== "ahora") throw new Error(`${de}: el único valor por defecto de una fecha es "ahora"`);
      } else if (c.tipo === "uuid") {
        throw new Error(`${de}: un uuid no lleva valor por defecto`);
      } else {
        const r = esquemaDeCampo(c).safeParse(c.porDefecto);
        if (!r.success) throw new Error(`${de}: el valor por defecto no valida (${r.error.issues[0]?.message ?? "inválido"})`);
      }
    }
  }
  if (d.titulo !== undefined && !claves.includes(d.titulo)) {
    throw new Error(`${donde}: titulo '${String(d.titulo)}' no es un campo`);
  }
  const titulo =
    d.titulo ?? claves.find((k) => d.campos[k]!.tipo === "texto") ?? claves.find((k) => d.campos[k]!.tipo === "textoLargo") ?? null;

  const modelo = {
    [MARCA]: true as const,
    version: VERSION_DE_MODELOS,
    nombre: d.nombre,
    plural,
    tabla,
    descripcion: d.descripcion.trim(),
    etiqueta: d.etiqueta ?? d.nombre,
    campos: d.campos,
    acceso: { leer: acceso.leer, escribir: acceso.escribir },
    titulo,
    semantica: semanticaDe(d as unknown as DeclaracionDeModelo<Record<string, Campo>>, donde),
    sensible: {
      crear: d.sensible?.crear ?? false,
      actualizar: d.sensible?.actualizar ?? false,
      borrar: d.sensible?.borrar ?? true,
    },
  };
  return Object.freeze(modelo) as Modelo<C>;
}

// ── Lo que se deriva (puro) ────────────────────────────────────────────────

/** ¿Lleva columna `owner_id`? Siempre que alguna regla hable del dueño. */
export function tieneDueno(m: Pick<Modelo, "acceso">): boolean {
  return m.acceso.leer === "dueno" || m.acceso.escribir === "dueno";
}

/**
 * ¿Puede el que crea elegir el dueño? Solo en «el equipo escribe filas que
 * lee cada dueño» (p. ej. el equipo asigna tareas): el equipo dice de quién es.
 */
export function eligeDueno(m: Pick<Modelo, "acceso">): boolean {
  return m.acceso.leer === "dueno" && m.acceso.escribir === "staff";
}

/** Los scopes de agente del modelo. Son contrato. */
export function scopesDeModelo(m: Pick<Modelo, "nombre">): { leer: string; escribir: string } {
  return { leer: `${m.nombre}:read`, escribir: `${m.nombre}:write` };
}

/** Los ids (kebab-case, son contrato) de las operaciones del modelo. */
export function idsDeOperacionesDeModelo(m: Pick<Modelo, "nombre" | "plural">) {
  return {
    describir: `describe-${m.nombre}`,
    listar: `list-${m.plural}`,
    obtener: `get-${m.nombre}`,
    crear: `create-${m.nombre}`,
    actualizar: `update-${m.nombre}`,
    borrar: `delete-${m.nombre}`,
  } as const;
}

/** Las rutas, relativas al montaje del kon. */
export function rutasDeModelo(m: Pick<Modelo, "plural">) {
  return {
    describir: `/${m.plural}/_model`,
    coleccion: `/${m.plural}`,
    fila: `/${m.plural}/:id`,
  } as const;
}

/** El esquema zod de un valor del campo (entrada), sin opcionalidad. */
export function esquemaDeCampo(c: Campo): ZodTypeAny {
  let s: ZodTypeAny;
  switch (c.tipo) {
    case "texto":
    case "textoLargo": {
      let t = z.string();
      if (c.min !== undefined) t = t.min(c.min);
      else if (c.requerido) t = t.min(1);
      if (c.max !== undefined) t = t.max(c.max);
      s = t;
      break;
    }
    case "entero": {
      s = z.number().int().min(c.min ?? INT_MIN).max(c.max ?? INT_MAX);
      break;
    }
    case "numero": {
      let n = z.number();
      if (c.min !== undefined) n = n.min(c.min);
      if (c.max !== undefined) n = n.max(c.max);
      s = n;
      break;
    }
    case "booleano":
      s = z.boolean();
      break;
    case "fecha":
      s = esquemaFecha();
      break;
    case "enumerado":
      s = z.enum(c.valores as [string, ...string[]]);
      break;
    case "json":
      s = z.union([z.record(z.string(), z.unknown()), z.array(z.unknown())]);
      break;
    case "uuid":
      s = z.guid();
      break;
  }
  return c.descripcion ? s.describe(c.descripcion) : s;
}

/** El esquema de SALIDA de un valor (cómo viaja en JSON). */
function esquemaDeSalida(c: Campo): ZodTypeAny {
  switch (c.tipo) {
    case "fecha":
      return z.iso.datetime({ offset: true });
    case "json":
      return z.unknown();
    case "uuid":
      return z.guid();
    case "enumerado":
      return z.enum(c.valores as [string, ...string[]]);
    case "entero":
      return z.number().int();
    case "numero":
      return z.number();
    case "booleano":
      return z.boolean();
    default:
      return z.string();
  }
}

function opcionalAlCrear(c: Campo): boolean {
  return !c.requerido || c.porDefecto !== undefined;
}

/** Campos ordenables en la lista (todo menos json y texto largo). */
export function camposOrdenables(m: Pick<Modelo, "campos">): string[] {
  return Object.entries(m.campos)
    .filter(([, c]) => c.tipo !== "json" && c.tipo !== "textoLargo")
    .map(([k]) => k);
}

/** Campos por los que se filtra con igualdad en la lista. */
export function camposFiltrables(m: Pick<Modelo, "campos">): string[] {
  return Object.entries(m.campos)
    .filter(([, c]) => c.tipo === "enumerado" || c.tipo === "booleano" || c.tipo === "uuid")
    .map(([k]) => k);
}

export const LIMITE_POR_DEFECTO = 20;
export const LIMITE_MAXIMO = 100;

/**
 * Los esquemas zod del modelo. Sin `.default()` tras un `transform` (trampa
 * de zod 4): los valores por defecto los pone la columna, y la lista aplica
 * los suyos en el handler.
 */
export function esquemasDeModelo(m: Modelo) {
  const crear: Record<string, ZodTypeAny> = {};
  const actualizar: Record<string, ZodTypeAny> = {};
  const fila: Record<string, ZodTypeAny> = { id: z.guid() };
  if (tieneDueno(m)) fila.ownerId = z.string().nullable();
  for (const [clave, c] of Object.entries(m.campos)) {
    const v = esquemaDeCampo(c);
    const nulable = c.requerido ? v : v.nullable();
    crear[clave] = opcionalAlCrear(c) ? nulable.optional() : nulable;
    actualizar[clave] = nulable.optional();
    const salida = esquemaDeSalida(c);
    fila[clave] = c.requerido ? salida : salida.nullable();
  }
  if (eligeDueno(m)) {
    crear.ownerId = z.string().min(1).max(200).optional().describe("Owner account id (defaults to the creator)");
  }
  fila.createdAt = z.iso.datetime({ offset: true });
  fila.updatedAt = z.iso.datetime({ offset: true });

  const ordenables = camposOrdenables(m);
  const orden = ["createdAt", "updatedAt", ...ordenables];
  const consulta: Record<string, ZodTypeAny> = {
    limit: z.coerce.number().int().min(1).max(LIMITE_MAXIMO).optional().describe(`Page size (default ${LIMITE_POR_DEFECTO})`),
    offset: z.coerce.number().int().min(0).max(1_000_000).optional().describe("Rows to skip (default 0)"),
    sort: z
      .enum([...orden, ...orden.map((o) => `-${o}`)] as [string, ...string[]])
      .optional()
      .describe("Field to sort by; prefix with '-' for descending (default -createdAt)"),
  };
  for (const clave of camposFiltrables(m)) {
    const c = m.campos[clave]!;
    consulta[clave] =
      c.tipo === "booleano"
        ? z.enum(["true", "false"]).optional().describe(`Only rows whose ${clave} is this`)
        : esquemaDeCampo(c).optional().describe(`Only rows whose ${clave} is this`);
  }
  const esquemaFila = z.object(fila);
  return {
    crear: z.object(crear),
    actualizar: z.object(actualizar),
    fila: esquemaFila,
    lista: z.object({
      data: z.array(esquemaFila),
      total: z.number().int(),
      limit: z.number().int(),
      offset: z.number().int(),
    }),
    consulta: z.object(consulta),
    params: z.object({ id: z.guid() }),
  };
}

// ── Descriptor (lo que pinta el panel y lee un agente) ─────────────────────

export interface CampoDescrito {
  clave: string;
  columna: string;
  tipo: TipoDeCampo;
  requerido: boolean;
  unico: boolean;
  etiqueta: string;
  descripcion?: string;
  min?: number;
  max?: number;
  valores?: string[];
  porDefecto?: ValorPorDefecto;
}

export interface DescriptorDeModelo {
  version: number;
  nombre: string;
  plural: string;
  tabla: string;
  etiqueta: string;
  descripcion: string;
  titulo: string | null;
  acceso: AccesoDeModelo;
  conDueno: boolean;
  eligeDueno: boolean;
  scopes: { leer: string; escribir: string };
  operaciones: ReturnType<typeof idsDeOperacionesDeModelo>;
  campos: CampoDescrito[];
  ordenables: string[];
  filtrables: string[];
}

export function descriptorDeModelo(m: Modelo): DescriptorDeModelo {
  return {
    version: VERSION_DE_MODELOS,
    nombre: m.nombre,
    plural: m.plural,
    tabla: m.tabla,
    etiqueta: m.etiqueta,
    descripcion: m.descripcion,
    titulo: m.titulo,
    acceso: { ...m.acceso },
    conDueno: tieneDueno(m),
    eligeDueno: eligeDueno(m),
    scopes: scopesDeModelo(m),
    operaciones: idsDeOperacionesDeModelo(m),
    campos: Object.entries(m.campos).map(([clave, c]) => ({
      clave,
      columna: columnaDeCampo(clave),
      tipo: c.tipo,
      requerido: c.requerido,
      unico: c.unico,
      etiqueta: c.etiqueta ?? clave,
      ...(c.descripcion ? { descripcion: c.descripcion } : {}),
      ...(c.min !== undefined ? { min: c.min } : {}),
      ...(c.max !== undefined ? { max: c.max } : {}),
      ...(c.valores ? { valores: [...c.valores] } : {}),
      ...(c.porDefecto !== undefined ? { porDefecto: c.porDefecto } : {}),
    })),
    ordenables: camposOrdenables(m),
    filtrables: camposFiltrables(m),
  };
}

/** El esquema del descriptor (salida de `describe-<modelo>` y de `/api/models`). */
export const esquemaDescriptorDeModelo = z.looseObject({
  version: z.number().int(),
  nombre: z.string(),
  plural: z.string(),
  tabla: z.string(),
  etiqueta: z.string(),
  descripcion: z.string(),
  titulo: z.string().nullable(),
  acceso: z.object({ leer: z.enum(["publico", "dueno", "staff"]), escribir: z.enum(["dueno", "staff"]) }),
  conDueno: z.boolean(),
  eligeDueno: z.boolean(),
  scopes: z.object({ leer: z.string(), escribir: z.string() }),
  operaciones: z.record(z.string(), z.string()),
  campos: z.array(
    z.looseObject({
      clave: z.string(),
      columna: z.string(),
      tipo: z.enum(TIPOS_DE_CAMPO as [TipoDeCampo, ...TipoDeCampo[]]),
      requerido: z.boolean(),
      unico: z.boolean(),
      etiqueta: z.string(),
    })
  ),
  ordenables: z.array(z.string()),
  filtrables: z.array(z.string()),
});
