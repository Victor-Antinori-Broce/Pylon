/**
 * defineModelo → SQL: la tabla, la RLS y el diff de `makemigrations` (puro)
 * ============================================================================
 *
 * `kitsuden makemigrations` guarda junto a las migraciones una INSTANTÁNEA de
 * los modelos tal como quedaron tras la última migración generada
 * (`migrations/modelos.snapshot.json`). La siguiente vez compara la
 * instantánea con los modelos declarados y escribe SOLO la diferencia:
 *
 *   modelo nuevo            CREATE TABLE + índices + RLS
 *   campo nuevo             ADD COLUMN (obligatorio sin valor por defecto: se
 *                           niega, como Django, porque fallaría con filas)
 *   `antes: "viejo"`        RENAME COLUMN (en vez de borrar y crear)
 *   tipo / longitud         ALTER COLUMN … TYPE … USING
 *   obligatorio             SET / DROP NOT NULL (rellenando con el valor por
 *                           defecto antes de SET NOT NULL, si lo hay)
 *   valor por defecto       SET / DROP DEFAULT
 *   valores, min, max       la CHECK con nombre se rehace
 *   único / índice          ADD / DROP CONSTRAINT, CREATE / DROP INDEX
 *   política de acceso      las cuatro políticas RLS se rehacen
 *   campo o modelo quitado  DESTRUCTIVO: sale COMENTADO salvo
 *                           `permitirDestructivo` (y la columna obligatoria
 *                           que se deja pasa a NULL, para que la app siga
 *                           pudiendo insertar)
 *
 * Nunca se ejecuta nada aquí: se devuelve el texto. Lo aplica el runner de
 * siempre (`bun run scripts/migrate.ts`, o el panel al activar el kon) con la
 * conexión de DDL, en el orden de los ficheros.
 *
 * La RLS usa las funciones del núcleo `kitsuden_admin_efectivo(kon)` y
 * `kitsuden_staff_efectivo(kon)` (apps/api/src/db/funciones-de-agente.sql, que
 * el runner aplica ANTES de las migraciones de cada kon): así un agente que
 * abre el kon entero (`<kon>:*`, `admin`) se trata igual que en TypeScript.
 */

import {
  columnaDeCampo,
  tieneDueno,
  type AccesoDeModelo,
  type Campo,
  type Modelo,
} from "./modelos";

export const VERSION_DE_INSTANTANEA = 1;

export interface ColumnaInstantanea {
  /** Clave del campo (camelCase). */
  clave: string;
  columna: string;
  tipo: string;
  nulo: boolean;
  porDefecto: string | null;
  check: string | null;
  unico: boolean;
  indice: boolean;
}

export interface ModeloInstantanea {
  nombre: string;
  tabla: string;
  kon: string;
  acceso: AccesoDeModelo;
  columnas: ColumnaInstantanea[];
  /** Búsqueda semántica (D5). Ausente = sin ella (así las instantáneas viejas no cambian). */
  semantica?: { campos: string[]; dimensiones: number };
}

export interface Instantanea {
  version: number;
  modelos: Record<string, ModeloInstantanea>;
}

export function instantaneaVacia(): Instantanea {
  return { version: VERSION_DE_INSTANTANEA, modelos: {} };
}

// ── SQL de un campo ─────────────────────────────────────────────────────────

const q = (identificador: string) => `"${identificador.replace(/"/g, '""')}"`;
const literal = (texto: string) => `'${texto.replace(/'/g, "''")}'`;

export function tipoSql(c: Campo): string {
  switch (c.tipo) {
    case "texto":
      return c.max !== undefined ? `varchar(${c.max})` : "text";
    case "textoLargo":
      return "text";
    case "entero":
      return "integer";
    case "numero":
      return "double precision";
    case "booleano":
      return "boolean";
    case "fecha":
      return "timestamp with time zone";
    case "enumerado":
      return "text";
    case "json":
      return "jsonb";
    case "uuid":
      return "uuid";
  }
}

function porDefectoSql(c: Campo): string | null {
  const v = c.porDefecto;
  if (v === undefined || v === null) return null;
  if (c.tipo === "fecha") return "now()";
  if (c.tipo === "json") return `${literal(JSON.stringify(v))}::jsonb`;
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return String(v);
  return literal(String(v));
}

function checkSql(c: Campo, columna: string): string | null {
  const col = q(columna);
  const partes: string[] = [];
  if (c.tipo === "enumerado" && c.valores?.length) {
    partes.push(`${col} IN (${c.valores.map(literal).join(", ")})`);
  }
  if ((c.tipo === "texto" || c.tipo === "textoLargo") && c.min !== undefined && c.min > 0) {
    partes.push(`char_length(${col}) >= ${c.min}`);
  }
  if (c.tipo === "textoLargo" && c.max !== undefined) partes.push(`char_length(${col}) <= ${c.max}`);
  if ((c.tipo === "entero" || c.tipo === "numero") && c.min !== undefined) partes.push(`${col} >= ${c.min}`);
  if ((c.tipo === "entero" || c.tipo === "numero") && c.max !== undefined) partes.push(`${col} <= ${c.max}`);
  return partes.length ? partes.join(" AND ") : null;
}

/** La instantánea de UN modelo (lo que se guarda y se compara). */
export function instantaneaDeModelo(m: Modelo, kon: string): ModeloInstantanea {
  return {
    nombre: m.nombre,
    tabla: m.tabla,
    kon,
    acceso: { ...m.acceso },
    columnas: Object.entries(m.campos).map(([clave, c]) => {
      const columna = columnaDeCampo(clave);
      return {
        clave,
        columna,
        tipo: tipoSql(c),
        nulo: !c.requerido,
        porDefecto: porDefectoSql(c),
        check: checkSql(c, columna),
        unico: c.unico,
        indice: c.indice ?? false,
      };
    }),
    ...(m.semantica ? { semantica: { campos: [...m.semantica.campos], dimensiones: m.semantica.dimensiones } } : {}),
  };
}

/** La columna del embedding y su índice HNSW (distancia coseno). */
function sqlDeSemantica(tabla: string, dimensiones: number): string[] {
  return [
    `CREATE EXTENSION IF NOT EXISTS vector;`,
    `ALTER TABLE ${q(tabla)} ADD COLUMN IF NOT EXISTS "embedding" vector(${dimensiones});`,
    `CREATE INDEX IF NOT EXISTS ${q(`${tabla}_embedding_idx`)} ON ${q(tabla)} USING hnsw ("embedding" vector_cosine_ops);`,
  ];
}

export function instantaneaDeModelos(modelos: readonly Modelo[], kon: string): Instantanea {
  const salida = instantaneaVacia();
  for (const m of modelos) {
    if (salida.modelos[m.nombre]) throw new Error(`modelo '${m.nombre}' declarado dos veces`);
    salida.modelos[m.nombre] = instantaneaDeModelo(m, kon);
  }
  const tablas = new Set<string>();
  for (const m of Object.values(salida.modelos)) {
    if (tablas.has(m.tabla)) throw new Error(`dos modelos usan la tabla '${m.tabla}'`);
    tablas.add(m.tabla);
  }
  return salida;
}

// ── Nombres de restricciones (estables: el diff los usa para rehacerlas) ──

const nombreCheck = (tabla: string, col: string) => `${tabla}_${col}_check`;
const nombreUnico = (tabla: string, col: string) => `${tabla}_${col}_key`;
const nombreIndice = (tabla: string, col: string) => `${tabla}_${col}_idx`;

// ── CREATE ──────────────────────────────────────────────────────────────────

function definicionDeColumna(c: ColumnaInstantanea): string {
  return [
    q(c.columna),
    c.tipo,
    c.nulo ? null : "NOT NULL",
    c.porDefecto !== null ? `DEFAULT ${c.porDefecto}` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

function crearTabla(m: ModeloInstantanea): string[] {
  const conDueno = tieneDueno(m);
  const lineas = [
    `  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid()`,
    ...(conDueno ? [`  "owner_id" text`] : []),
    ...m.columnas.map((c) => `  ${definicionDeColumna(c)}`),
    `  "created_at" timestamp with time zone NOT NULL DEFAULT now()`,
    `  "updated_at" timestamp with time zone NOT NULL DEFAULT now()`,
    ...m.columnas
      .filter((c) => c.check)
      .map((c) => `  CONSTRAINT ${q(nombreCheck(m.tabla, c.columna))} CHECK (${c.check})`),
    ...m.columnas
      .filter((c) => c.unico)
      .map((c) => `  CONSTRAINT ${q(nombreUnico(m.tabla, c.columna))} UNIQUE (${q(c.columna)})`),
  ];
  const sentencias = [`CREATE TABLE IF NOT EXISTS ${q(m.tabla)} (\n${lineas.join(",\n")}\n);`];
  if (conDueno) sentencias.push(indiceDueno(m.tabla));
  sentencias.push(
    `CREATE INDEX IF NOT EXISTS ${q(`${m.tabla}_created_at_idx`)} ON ${q(m.tabla)} ("created_at");`
  );
  for (const c of m.columnas.filter((x) => x.indice)) sentencias.push(crearIndice(m.tabla, c.columna));
  return sentencias;
}

const indiceDueno = (tabla: string) =>
  `CREATE INDEX IF NOT EXISTS ${q(`${tabla}_owner_id_idx`)} ON ${q(tabla)} ("owner_id");`;
const crearIndice = (tabla: string, col: string) =>
  `CREATE INDEX IF NOT EXISTS ${q(nombreIndice(tabla, col))} ON ${q(tabla)} (${q(col)});`;

// ── RLS ─────────────────────────────────────────────────────────────────────

/** El sistema: id Y rol vacíos (migraciones, cargadores, tareas de fondo). */
const SISTEMA =
  "(COALESCE(current_setting('app.current_user_id', true), '') = '' " +
  "AND COALESCE(current_setting('app.current_user_role', true), '') = '')";

const DUENO =
  "(COALESCE(current_setting('app.current_user_id', true), '') <> '' " +
  "AND \"owner_id\" = current_setting('app.current_user_id', true))";

/**
 * Las expresiones de una política de acceso. `escribir` es quien puede tocar
 * una fila; quien puede tocarla también puede leerla.
 *
 * En «staff», un agente con el scope del modelo (`<modelo>:read|write`) entra
 * también (`kitsuden_agente_puede_en_kon`): el scope que abre la operación tiene que
 * abrir las filas, o el agente recibiría 200 con la lista vacía. En «dueno»
 * el scope abre la puerta, no las filas: el agente ve las SUYAS.
 */
export function expresionesRls(
  acceso: AccesoDeModelo,
  kon: string,
  nombre: string
): { leer: string; escribir: string } {
  const admin = `kitsuden_admin_efectivo(${literal(kon)})`;
  const staff = `kitsuden_staff_efectivo(${literal(kon)})`;
  const agente = (accion: "read" | "write") =>
    `kitsuden_agente_puede_en_kon(${literal(kon)}, ${literal(`${nombre}:${accion}`)})`;
  const escribir = acceso.escribir === "dueno" ? `(${DUENO} OR ${admin})` : `(${staff} OR ${agente("write")})`;
  const leerBase =
    acceso.leer === "publico"
      ? "true"
      : acceso.leer === "dueno"
        ? `(${DUENO} OR ${admin})`
        : `(${staff} OR ${agente("read")})`;
  const leer = leerBase === "true" ? "true" : leerBase === escribir ? leerBase : `(${leerBase} OR ${escribir})`;
  return { leer, escribir };
}

/** Las políticas de la tabla: ENABLE + FORCE y las cuatro (idempotente). */
export function politicasRls(m: Pick<ModeloInstantanea, "nombre" | "tabla" | "acceso" | "kon">): string[] {
  const t = q(m.tabla);
  const { leer, escribir } = expresionesRls(m.acceso, m.kon, m.nombre);
  const p = (sufijo: string) => q(`${m.tabla}_${sufijo}`);
  return [
    `-- RLS (${m.tabla}): leer=${m.acceso.leer}, escribir=${m.acceso.escribir}. FORCE: without it the table owner is exempt.`,
    `ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY;`,
    `ALTER TABLE ${t} FORCE ROW LEVEL SECURITY;`,
    `DROP POLICY IF EXISTS ${p("select")} ON ${t};`,
    `CREATE POLICY ${p("select")} ON ${t} FOR SELECT TO PUBLIC USING (${SISTEMA} OR ${leer});`,
    `DROP POLICY IF EXISTS ${p("insert")} ON ${t};`,
    `CREATE POLICY ${p("insert")} ON ${t} FOR INSERT TO PUBLIC WITH CHECK (${SISTEMA} OR ${escribir});`,
    `DROP POLICY IF EXISTS ${p("update")} ON ${t};`,
    `CREATE POLICY ${p("update")} ON ${t} FOR UPDATE TO PUBLIC USING (${SISTEMA} OR ${escribir}) WITH CHECK (${SISTEMA} OR ${escribir});`,
    `DROP POLICY IF EXISTS ${p("delete")} ON ${t};`,
    `CREATE POLICY ${p("delete")} ON ${t} FOR DELETE TO PUBLIC USING (${SISTEMA} OR ${escribir});`,
  ];
}

// ── El diff ─────────────────────────────────────────────────────────────────

export interface OpcionesDeMigracion {
  /** Nombre corto del kon (`notas` para `kon-notas`; `app` para la app). */
  kon: string;
  /** Emitir los DROP de verdad (por defecto salen comentados). */
  permitirDestructivo?: boolean;
}

export interface MigracionDeModelos {
  /** El SQL (vacío si no hay cambios). */
  sql: string;
  /** La instantánea nueva (la que se guarda si se escribe el fichero). */
  instantanea: Instantanea;
  /** Resumen legible, una línea por cambio. */
  cambios: string[];
  /** Lo que conviene revisar (destructivo omitido, tipos con pérdida…). */
  avisos: string[];
}

/**
 * Compara la instantánea anterior con los modelos declarados y devuelve la
 * migración. Lanza si el cambio no se puede hacer sin decidir algo (un campo
 * obligatorio nuevo sin valor por defecto en una tabla que ya existe).
 */
export function generarMigracionDeModelos(
  anterior: Instantanea | null | undefined,
  modelos: readonly Modelo[],
  opciones: OpcionesDeMigracion
): MigracionDeModelos {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(opciones.kon)) {
    throw new Error(`kon '${opciones.kon}': nombre corto en minúsculas (sin 'kon-')`);
  }
  const previa = anterior ?? instantaneaVacia();
  if (previa.version !== VERSION_DE_INSTANTANEA) {
    throw new Error(`instantánea de versión ${previa.version}; esta versión de Kitsuden lee la ${VERSION_DE_INSTANTANEA}`);
  }
  const nueva = instantaneaDeModelos(modelos, opciones.kon);
  const sql: string[] = [];
  const cambios: string[] = [];
  const avisos: string[] = [];
  const destructivo = (sentencia: string, motivo: string, destino: string[] = sql) => {
    if (opciones.permitirDestructivo) {
      destino.push(sentencia);
      avisos.push(`destructive: ${motivo}`);
    } else {
      destino.push(`-- DESTRUCTIVE (skipped; re-run with --allow-destructive to emit it): ${sentencia}`);
      avisos.push(`destructive change skipped: ${motivo}`);
    }
  };

  // Modelos quitados.
  for (const [nombre, viejo] of Object.entries(previa.modelos)) {
    if (nueva.modelos[nombre]) continue;
    cambios.push(`remove model ${nombre} (${viejo.tabla})`);
    destructivo(`DROP TABLE IF EXISTS ${q(viejo.tabla)};`, `model '${nombre}' removed: table ${viejo.tabla} would be dropped`);
  }

  for (const [nombre, m] of Object.entries(nueva.modelos)) {
    const viejo = previa.modelos[nombre];
    if (!viejo) {
      cambios.push(`create model ${nombre} (${m.tabla})`);
      sql.push(`-- Model ${nombre}`, ...crearTabla(m), ...politicasRls(m));
      if (m.semantica) sql.push(...sqlDeSemantica(m.tabla, m.semantica.dimensiones));
      continue;
    }
    const t = q(m.tabla);
    const parte: string[] = [];
    let tabla = viejo.tabla;
    if (viejo.tabla !== m.tabla) {
      parte.push(`ALTER TABLE ${q(viejo.tabla)} RENAME TO ${t};`);
      cambios.push(`rename table ${viejo.tabla} → ${m.tabla}`);
      tabla = m.tabla;
    }
    // Columnas: renombres primero (por `antes`).
    const modeloDeclarado = modelos.find((x) => x.nombre === nombre)!;
    const viejas = new Map(viejo.columnas.map((c) => [c.clave, { ...c }]));
    const usadas = new Set<string>();
    for (const c of m.columnas) {
      const antes = modeloDeclarado.campos[c.clave]?.antes;
      if (!viejas.has(c.clave) && antes && viejas.has(antes)) {
        const v = viejas.get(antes)!;
        if (v.columna !== c.columna) parte.push(`ALTER TABLE ${t} RENAME COLUMN ${q(v.columna)} TO ${q(c.columna)};`);
        cambios.push(`rename field ${nombre}.${antes} → ${c.clave}`);
        viejas.delete(antes);
        // Las restricciones con nombre siguen el nombre viejo: se rehacen.
        if (v.check) parte.push(`ALTER TABLE ${t} DROP CONSTRAINT IF EXISTS ${q(nombreCheck(tabla, v.columna))};`);
        if (v.unico) parte.push(`ALTER TABLE ${t} DROP CONSTRAINT IF EXISTS ${q(nombreUnico(tabla, v.columna))};`);
        if (v.indice) parte.push(`DROP INDEX IF EXISTS ${q(nombreIndice(tabla, v.columna))};`);
        // Comparada con la vieja ya renombrada y sin sus restricciones (que
        // llevaban el nombre viejo): lo que haga falta se vuelve a crear abajo.
        viejas.set(c.clave, { ...v, clave: c.clave, columna: c.columna, check: null, unico: false, indice: false });
      }
    }
    // Dueño.
    const antesConDueno = tieneDueno(viejo);
    const ahoraConDueno = tieneDueno(m);
    if (!antesConDueno && ahoraConDueno) {
      parte.push(`ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS "owner_id" text;`, indiceDueno(m.tabla));
      cambios.push(`add owner column to ${nombre}`);
      avisos.push(`${nombre}: existing rows have owner_id NULL; only the system and admins see them until you set it`);
    }
    for (const c of m.columnas) {
      const v = viejas.get(c.clave);
      usadas.add(c.clave);
      if (!v) {
        if (!c.nulo && c.porDefecto === null) {
          throw new Error(
            `${nombre}.${c.clave}: a new REQUIRED field needs a default (porDefecto) on an existing table, ` +
              `or add it optional first, fill it, then make it required`
          );
        }
        parte.push(`ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS ${definicionDeColumna(c)};`);
        if (c.check) parte.push(`ALTER TABLE ${t} ADD CONSTRAINT ${q(nombreCheck(m.tabla, c.columna))} CHECK (${c.check});`);
        if (c.unico) parte.push(`ALTER TABLE ${t} ADD CONSTRAINT ${q(nombreUnico(m.tabla, c.columna))} UNIQUE (${q(c.columna)});`);
        if (c.indice) parte.push(crearIndice(m.tabla, c.columna));
        cambios.push(`add field ${nombre}.${c.clave}`);
        continue;
      }
      const col = q(c.columna);
      if (v.tipo !== c.tipo) {
        // Lo que tenga una CHECK se quita antes (puede depender del tipo).
        if (v.check) {
          parte.push(`ALTER TABLE ${t} DROP CONSTRAINT IF EXISTS ${q(nombreCheck(m.tabla, c.columna))};`);
          v.check = null;
        }
        parte.push(`ALTER TABLE ${t} ALTER COLUMN ${col} TYPE ${c.tipo} USING ${col}::${c.tipo};`);
        cambios.push(`change type of ${nombre}.${c.clave}: ${v.tipo} → ${c.tipo}`);
        if (!(v.tipo.startsWith("varchar") && (c.tipo === "text" || ensancha(v.tipo, c.tipo)))) {
          avisos.push(`${nombre}.${c.clave}: ${v.tipo} → ${c.tipo} may fail or lose data on existing rows; review the USING cast`);
        }
      }
      if (v.porDefecto !== c.porDefecto) {
        parte.push(
          c.porDefecto === null
            ? `ALTER TABLE ${t} ALTER COLUMN ${col} DROP DEFAULT;`
            : `ALTER TABLE ${t} ALTER COLUMN ${col} SET DEFAULT ${c.porDefecto};`
        );
        cambios.push(`change default of ${nombre}.${c.clave}`);
      }
      if (v.nulo !== c.nulo) {
        if (c.nulo) parte.push(`ALTER TABLE ${t} ALTER COLUMN ${col} DROP NOT NULL;`);
        else {
          if (c.porDefecto !== null) parte.push(`UPDATE ${t} SET ${col} = ${c.porDefecto} WHERE ${col} IS NULL;`);
          else avisos.push(`${nombre}.${c.clave}: SET NOT NULL fails if any row has NULL; fill them first`);
          parte.push(`ALTER TABLE ${t} ALTER COLUMN ${col} SET NOT NULL;`);
        }
        cambios.push(`${c.nulo ? "make optional" : "make required"} ${nombre}.${c.clave}`);
      }
      if (v.check !== c.check) {
        parte.push(`ALTER TABLE ${t} DROP CONSTRAINT IF EXISTS ${q(nombreCheck(m.tabla, c.columna))};`);
        if (c.check) parte.push(`ALTER TABLE ${t} ADD CONSTRAINT ${q(nombreCheck(m.tabla, c.columna))} CHECK (${c.check});`);
        cambios.push(`change constraint of ${nombre}.${c.clave}`);
      }
      if (v.unico !== c.unico) {
        parte.push(
          c.unico
            ? `ALTER TABLE ${t} ADD CONSTRAINT ${q(nombreUnico(m.tabla, c.columna))} UNIQUE (${col});`
            : `ALTER TABLE ${t} DROP CONSTRAINT IF EXISTS ${q(nombreUnico(m.tabla, c.columna))};`
        );
        cambios.push(`${c.unico ? "add" : "drop"} unique on ${nombre}.${c.clave}`);
      }
      if (v.indice !== c.indice) {
        parte.push(c.indice ? crearIndice(m.tabla, c.columna) : `DROP INDEX IF EXISTS ${q(nombreIndice(m.tabla, c.columna))};`);
        cambios.push(`${c.indice ? "add" : "drop"} index on ${nombre}.${c.clave}`);
      }
    }
    // Campos quitados.
    for (const [clave, v] of viejas) {
      if (usadas.has(clave)) continue;
      cambios.push(`remove field ${nombre}.${clave}`);
      if (!v.nulo && !opciones.permitirDestructivo) {
        // La columna se queda, pero sin NOT NULL: la app ya no la manda.
        parte.push(`ALTER TABLE ${t} ALTER COLUMN ${q(v.columna)} DROP NOT NULL;`);
      }
      destructivo(`ALTER TABLE ${t} DROP COLUMN IF EXISTS ${q(v.columna)};`, `field ${nombre}.${clave} removed`, parte);
    }
    if (antesConDueno && !ahoraConDueno) {
      cambios.push(`remove owner column from ${nombre}`);
      destructivo(`ALTER TABLE ${t} DROP COLUMN IF EXISTS "owner_id";`, `${nombre} no longer has an owner`, parte);
    }
    // Búsqueda semántica (D5).
    const dimAntes = viejo.semantica?.dimensiones;
    const dimAhora = m.semantica?.dimensiones;
    if (dimAhora !== undefined && dimAntes === undefined) {
      parte.push(...sqlDeSemantica(m.tabla, dimAhora));
      cambios.push(`add semantic search to ${nombre} (${dimAhora} dimensions)`);
      avisos.push(`${nombre}: existing rows have no embedding until they are written again (or re-queued)`);
    } else if (dimAhora !== undefined && dimAntes !== undefined && dimAhora !== dimAntes) {
      parte.push(
        `DROP INDEX IF EXISTS ${q(`${m.tabla}_embedding_idx`)};`,
        `ALTER TABLE ${t} ALTER COLUMN "embedding" TYPE vector(${dimAhora}) USING NULL;`,
        `CREATE INDEX IF NOT EXISTS ${q(`${m.tabla}_embedding_idx`)} ON ${t} USING hnsw ("embedding" vector_cosine_ops);`
      );
      cambios.push(`change embedding dimensions of ${nombre}: ${dimAntes} → ${dimAhora}`);
      avisos.push(`${nombre}: every embedding is cleared and must be computed again`);
    } else if (dimAhora === undefined && dimAntes !== undefined) {
      cambios.push(`remove semantic search from ${nombre}`);
      destructivo(`ALTER TABLE ${t} DROP COLUMN IF EXISTS "embedding";`, `${nombre} no longer has semantic search`, parte);
    } else if (dimAhora !== undefined && JSON.stringify(viejo.semantica?.campos) !== JSON.stringify(m.semantica?.campos)) {
      cambios.push(`semantic fields of ${nombre}: ${m.semantica!.campos.join(", ")}`);
      avisos.push(`${nombre}: existing embeddings were computed from the old fields`);
    }
    const politicaCambia =
      viejo.acceso.leer !== m.acceso.leer ||
      viejo.acceso.escribir !== m.acceso.escribir ||
      viejo.kon !== m.kon ||
      viejo.tabla !== m.tabla;
    if (politicaCambia) {
      cambios.push(`access policy of ${nombre}: leer=${m.acceso.leer}, escribir=${m.acceso.escribir}`);
      if (viejo.tabla !== m.tabla) {
        for (const s of ["select", "insert", "update", "delete"]) {
          parte.push(`DROP POLICY IF EXISTS ${q(`${viejo.tabla}_${s}`)} ON ${t};`);
        }
      }
      parte.push(...politicasRls(m));
    }
    if (parte.length) sql.push(`-- Model ${nombre}`, ...parte);
  }

  const cuerpo = sql.join("\n");
  return {
    sql: cambios.length ? cuerpo : "",
    instantanea: nueva,
    cambios,
    avisos,
  };
}

function ensancha(de: string, a: string): boolean {
  const n = (t: string) => Number(/varchar\((\d+)\)/.exec(t)?.[1] ?? NaN);
  return de.startsWith("varchar") && a.startsWith("varchar") && n(a) >= n(de);
}

/** La cabecera de un fichero de migración generado. */
export function cabeceraDeMigracion(cambios: string[], avisos: string[]): string {
  return [
    "-- Generated by `kitsuden makemigrations` from defineModelo (docs/agents/models.md).",
    "-- Review it before applying. Nothing applies it automatically; the migration runner",
    "-- (bun run scripts/migrate.ts) does, in file order, with the DDL connection.",
    ...cambios.map((c) => `--   ${c}`),
    ...avisos.map((a) => `-- ! ${a}`),
    "",
  ].join("\n");
}
