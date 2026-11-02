import { sql } from "drizzle-orm";

import { resolveFieldType, camposDelSchema } from "./field-types";
import { checkReadAccess, type PolicyJson, type RLSUser } from "./rls-builder";

/**
 * Leer un dataset del CMS como catálogo de un kon
 * ============================================================================
 *
 * ── POR QUÉ ESTÁ AQUÍ Y NO EN UN KON ───────────────────────────────────────
 *
 * `kon-tierlist` fue el primero que leyó `data_sets`/`data_entries` para montar
 * su catálogo, y lo hizo bien: respetando `checkReadAccess` y sacando el campo
 * de imagen de lo que el dataset DECLARA en vez de adivinarlo por el nombre.
 *
 * En cuanto un segundo kon necesitó lo mismo —el simulador de cartas y el
 * creador de personajes— copiar esas cincuenta líneas habría creado tres
 * lectores que se desincronizan. Y el que se desincroniza en silencio es el de
 * ACCESO: basta que una copia se olvide de `checkReadAccess` para que ese kon
 * sea una puerta trasera a los datasets privados de otro. No es hipotético, es
 * el fallo por defecto de copiar y pegar una función de lectura.
 *
 * Por eso vive en `@kitsuden/shared`, junto a la comprobación de acceso que
 * obliga a usar.
 *
 * ── NADA SE ADIVINA ────────────────────────────────────────────────────────
 *
 * Los campos salen del `schema` que el dataset declara, nunca de heurísticas
 * sobre el nombre de la columna. «Si se llama `nombre` será la etiqueta» es de
 * donde salen los catálogos con la etiqueta equivocada, y falla en cuanto
 * alguien escribe su dataset en otro idioma.
 */

/** Un campo tal y como lo declara el `schema` del dataset. */
export interface DatasetField {
  name?: string;
  key?: string;
  type?: string;
  label?: string;
}

/** Una fila del dataset. `title` es `NOT NULL` en el modelo: siempre está. */
export interface DatasetEntry {
  id: string;
  title: string;
  data: Record<string, unknown>;
}

export interface DatasetCatalog {
  dataset: { id: string; name: string };
  fields: DatasetField[];
  entries: DatasetEntry[];
  /**
   * Campo declarado como imagen, o `null`. Va en las respuestas: si el catálogo
   * sale entero sin foto, esto dice por qué sin tener que abrir el código.
   */
  imageField: string | null;
  /** El primer campo declarado con ese tipo, o `null`. */
  fieldOfType(type: string): string | null;
}

/**
 * Tope de filas.
 *
 * Un dataset no tiene por qué ser pequeño —el volcado de One Piece son 2.876
 * cartas— y una consulta sin límite es la que tumba el proceso el día que
 * alguien sube un catálogo de cien mil filas. El tope se declara aquí, se puede
 * subir por llamada, y las rutas dicen en su respuesta si lo tocaron.
 */
export const DATASET_MAX_ROWS = 5000;

/** Lo mínimo que se le pide a la base de datos: ejecutar SQL. */
export interface DatasetReader {
  execute(query: unknown): Promise<unknown>;
}

/** El `execute` de Drizzle devuelve filas o `{ rows }` según el driver. */
function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const wrapped = result as { rows?: unknown };
  return Array.isArray(wrapped?.rows) ? (wrapped.rows as T[]) : [];
}

/**
 * Un dataset del CMS, con su control de acceso ya aplicado.
 *
 * Devuelve `null` tanto si el dataset no existe como si el usuario no puede
 * leerlo: desde fuera son el mismo resultado a propósito, porque distinguirlos
 * convierte la ruta en un oráculo que confirma qué datasets existen.
 */
export async function readDatasetCatalog(
  db: DatasetReader,
  datasetId: string,
  user: RLSUser,
  options: { limit?: number } = {}
): Promise<DatasetCatalog | null> {
  const limit = Math.min(options.limit ?? DATASET_MAX_ROWS, DATASET_MAX_ROWS);

  const [dataset] = rowsOf<{
    id: string;
    name: string;
    schema: unknown;
    policy_json: unknown;
  }>(
    await db.execute(
      sql`SELECT id, name, schema, policy_json FROM data_sets WHERE id = ${datasetId} LIMIT 1`
    )
  );

  if (!dataset) return null;
  if (!checkReadAccess((dataset.policy_json ?? null) as PolicyJson | null, user)) return null;

  // Cualquiera de las dos formas de `schema`, con la clave y el tipo resueltos
  // igual que los resuelve la validación (`key|fieldName|name`, `type|fieldType`)
  const fields: DatasetField[] = camposDelSchema(dataset.schema).map((f) => ({
    ...(f as DatasetField),
    key: (f.key ?? f.fieldName ?? f.name) as string | undefined,
    type: (f.type ?? f.fieldType) as string | undefined,
  }));

  const fieldOfType = (type: string): string | null => {
    const hit = fields.find((f) => resolveFieldType(f.type) === type);
    return hit?.key ?? hit?.name ?? null;
  };

  const entries = rowsOf<{ id: string; title: string; data: Record<string, unknown> | null }>(
    await db.execute(
      sql`SELECT id, title, data FROM data_entries
          WHERE data_set_id = ${datasetId}
          ORDER BY sort_order NULLS LAST, title
          LIMIT ${limit}`
    )
  ).map((e) => ({ id: e.id, title: e.title, data: e.data ?? {} }));

  return {
    dataset: { id: dataset.id, name: dataset.name },
    fields,
    entries,
    // `image` referencia un medio por id y `url` ya es una dirección. Se
    // prefiere `image` porque es lo que un catálogo suele declarar.
    imageField: fieldOfType("image") ?? fieldOfType("url"),
    fieldOfType,
  };
}

/**
 * Una URL de imagen utilizable, o `null`.
 *
 * Solo se acepta lo que YA es una dirección. Un campo `image` guarda el id de
 * un medio, y meter un uuid en un `src` da una imagen rota — que se lee como
 * «esta fila no tiene foto» y no como «hay que resolver el id».
 */
export function datasetImageUrl(value: unknown): string | null {
  return typeof value === "string" && /^(https?:|\/)/.test(value) ? value : null;
}

/** Un número del dataset, o `undefined`. Los datasets guardan texto a menudo. */
export function datasetNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}
