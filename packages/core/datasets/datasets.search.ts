/**
 * DataSets — búsqueda, facetas y comparación entre entradas
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Las tres cosas que le faltaban a `datasets` para que un dataset se pueda
 * CONSULTAR y no solo listar. Hasta ahora `/:id/entries` filtraba por `status` y
 * `limit`, y nada más: para encontrar algo había que traerse las mil entradas y
 * buscarlas en el cliente.
 *
 * ── POR QUÉ ESTÁ AQUÍ Y NO EN UN KON ───────────────────────────────────────
 *
 * Se escribió primero como un kon aparte (`kon-gamedata`) con sus propias tablas
 * `game_datasets` / `game_entities`. Era un error: duplicaba el almacén que ya
 * existe aquí, y además peor — `datasets.indexes.ts` ya genera índices B-tree
 * sobre `(data->>'campo')` y GIN con `gin_trgm_ops`, que es exactamente el
 * problema que aquellas columnas dedicadas intentaban resolver.
 *
 * Dos sitios donde vive "una entidad" no dan un error el día que alguien importa
 * en uno y busca en el otro. Dan cero resultados, que es peor.
 *
 * Y buscar, facetar y saber de dónde salió un dataset no son necesidades de los
 * datos de videojuego: las tiene cualquier dataset. Por eso van en el núcleo.
 */

import { and, eq, sql, type SQL } from "drizzle-orm";

import { dataEntries } from "./datasets.schema";

/**
 * Normaliza texto para buscar: sin acentos, sin mayúsculas, sin puntuación.
 *
 * Sin esto, buscar "talisman" no encuentra "Talismán" y "wolfs" no encuentra
 * "Wolf's". Es la diferencia entre un buscador y una caja de texto que casi
 * nunca acierta.
 */
export function normalizarTexto(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export interface FiltroCampo {
  /** Campo dentro de `data`, o `title` / `status` para las columnas propias. */
  campo: string;
  /** Igualdad exacta. */
  igual?: string;
  min?: number;
  max?: number;
}

/**
 * `damage:100..500,slot:helmet,weight:..6.5` → filtros.
 *
 * Se lanza en vez de ignorar lo que no se entiende: un filtro mal escrito que se
 * salta en silencio devuelve MÁS resultados de los pedidos, y quien lo lee cree
 * que ha filtrado.
 */
export function leerFiltros(crudo: string | undefined): FiltroCampo[] {
  if (!crudo) return [];
  return crudo
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const corte = p.indexOf(":");
      if (corte <= 0) {
        throw new Error(`Filtro mal formado: "${p}". Usa campo:valor o campo:min..max`);
      }
      const campo = p.slice(0, corte);
      const valor = p.slice(corte + 1);

      if (!valor.includes("..")) return { campo, igual: valor };

      const [min, max] = valor.split("..");
      const num = (x: string | undefined) => {
        if (!x) return undefined;
        const n = Number(x);
        if (!Number.isFinite(n)) throw new Error(`"${x}" no es un número en el filtro "${p}"`);
        return n;
      };
      return { campo, min: num(min), max: num(max) };
    });
}

/** Columnas propias de `data_entries`; el resto viven dentro de `data`. */
const COLUMNAS_PROPIAS = new Set(["title", "status"]);

/**
 * Condición SQL para un filtro.
 *
 * Los campos de `data` se leen con `data->>'campo'`, que es la MISMA expresión
 * que indexa `datasets.indexes.ts`. Escribirla distinta aquí —con `data#>>` o
 * con un cast diferente— haría que Postgres no usara el índice y la consulta
 * pasara de milisegundos a segundos sin que nada fallara.
 */
export function condicionDeFiltro(f: FiltroCampo): SQL {
  const propia = COLUMNAS_PROPIAS.has(f.campo);
  const expr = propia
    ? sql.identifier(f.campo === "title" ? "title" : "status")
    : sql`data->>${f.campo}`;

  if (f.igual !== undefined) return sql`${expr} = ${f.igual}`;

  const partes: SQL[] = [];
  if (f.min !== undefined) partes.push(sql`(${expr})::numeric >= ${f.min}`);
  if (f.max !== undefined) partes.push(sql`(${expr})::numeric <= ${f.max}`);
  // Un filtro numérico sobre algo que no declara el campo NO pasa: si buscas
  // "daño > 100" y aparecen cosas sin daño, crees que las has comparado.
  partes.push(sql`${expr} IS NOT NULL`);
  return sql.join(partes, sql` AND `);
}

export interface OpcionesBusqueda {
  dataSetId: string;
  /** Texto libre. Se compara normalizado contra el título. */
  q?: string;
  filtros?: FiltroCampo[];
  /** Campos sobre los que contar facetas. */
  facetas?: string[];
  limit?: number;
  offset?: number;
  status?: string;
  /**
   * Condición extra que la ruta exige SIEMPRE (las `rlsRules` del dataset para
   * quien no es del equipo). Antes la búsqueda no aplicaba ninguna política.
   */
  rls?: SQL;
}

/** Topes de una búsqueda: lo que llega por la URL no decide cuánto trabaja la base. */
export const LIMITES_DE_BUSQUEDA = { filtros: 20, palabras: 10, offset: 100_000 } as const;

export interface Faceta {
  campo: string;
  valores: { valor: string; cuenta: number }[];
}

export interface ResultadoBusqueda<T> {
  data: T[];
  total: number;
  facetas: Faceta[];
}

/**
 * Busca en las entradas de un dataset.
 *
 * ── LAS FACETAS SE CUENTAN EN LA BASE DE DATOS ─────────────────────────────
 *
 * Es tentador traerse las filas y contarlas en JS. Funciona con quinientas y se
 * cae con cincuenta mil — y un catálogo de objetos de un juego tiene cincuenta
 * mil. Cada faceta es un `GROUP BY` sobre la expresión indexada.
 *
 * ── Y SE CUENTAN SOBRE EL RESULTADO YA FILTRADO ────────────────────────────
 *
 * Salvo por la propia faceta. Es lo que hace que los números de la izquierda
 * cuadren con lo que se ve: una faceta contada sobre el total dice
 * "Legendario (146)" y luego enseña tres.
 */
/**
 * Las filas de un `db.execute`. Con el driver `pg` (el de producción) devuelve
 * `{ rows, … }`, no un array: `const [{ n }] = await db.execute(…)` reventaba
 * con «is not iterable» y la búsqueda respondía 500 en cuanto había un dataset
 * de verdad (lo encontró Schemathesis, 2026-10-26). Otros drivers dan el array.
 */
export function filasDe<T>(resultado: unknown): T[] {
  if (Array.isArray(resultado)) return resultado as T[];
  const rows = (resultado as { rows?: unknown } | null | undefined)?.rows;
  return Array.isArray(rows) ? (rows as T[]) : [];
}

export async function buscarEntradas(
  db: {
    select: (...a: unknown[]) => any;
    execute: (q: SQL) => Promise<unknown>;
  },
  opciones: OpcionesBusqueda
): Promise<ResultadoBusqueda<typeof dataEntries.$inferSelect>> {
  const { dataSetId, q, filtros = [], facetas = [], status, rls } = opciones;
  const limit = Math.min(Math.max(opciones.limit ?? 50, 1), 500);
  const offset = Math.min(Math.max(opciones.offset ?? 0, 0), LIMITES_DE_BUSQUEDA.offset);
  if (filtros.length > LIMITES_DE_BUSQUEDA.filtros) {
    throw new Error(`Como mucho ${LIMITES_DE_BUSQUEDA.filtros} filtros por búsqueda`);
  }

  const condiciones: SQL[] = [eq(dataEntries.dataSetId, dataSetId)];
  if (status) condiciones.push(eq(dataEntries.status, status));
  if (rls) condiciones.push(rls);
  for (const f of filtros) condiciones.push(condicionDeFiltro(f));

  if (q?.trim()) {
    /**
     * Se busca con `ILIKE` sobre el título.
     *
     * `gin_trgm_ops` —que `datasets.indexes.ts` sabe crear— indexa exactamente
     * este patrón, así que un `%texto%` no obliga a recorrer la tabla. Cada
     * palabra de la consulta debe aparecer, en cualquier orden: quien escribe
     * "espada fuego" espera encontrar "Espada llameante del fuego".
     */
    for (const palabra of normalizarTexto(q)
      .split(" ")
      .filter(Boolean)
      .slice(0, LIMITES_DE_BUSQUEDA.palabras)) {
      condiciones.push(sql`${dataEntries.title} ILIKE ${"%" + palabra + "%"}`);
    }
  }

  const donde = and(...condiciones)!;

  const filas = (await db
    .select()
    .from(dataEntries)
    .where(donde)
    .limit(limit)
    .offset(offset)) as (typeof dataEntries.$inferSelect)[];

  const [{ n }] = filasDe<{ n: number }>(
    await db.execute(sql`SELECT COUNT(*)::int AS n FROM data_entries WHERE ${donde}`)
  );

  const salida: Faceta[] = [];
  for (const campo of facetas) {
    /**
     * La faceta se cuenta SIN su propio filtro.
     *
     * Si estás filtrando por "rareza: legendario", la faceta de rareza tiene que
     * seguir enseñando cuántos épicos hay — si no, no puedes cambiar de opción
     * sin quitar el filtro a ciegas. Las demás facetas sí respetan el filtro.
     */
    const otros = condiciones.filter((_, i) => {
      const f = filtros[i - (condiciones.length - filtros.length)];
      return !f || f.campo !== campo;
    });
    const expr = COLUMNAS_PROPIAS.has(campo) ? sql.identifier(campo) : sql`data->>${campo}`;

    const grupos = filasDe<{ valor: string; n: number }>(
      await db.execute(
        sql`SELECT ${expr} AS valor, COUNT(*)::int AS n
            FROM data_entries
            WHERE ${and(...otros)!} AND ${expr} IS NOT NULL
            GROUP BY 1 ORDER BY 2 DESC, 1 ASC LIMIT 100`
      )
    );

    salida.push({
      campo,
      valores: grupos.map((g) => ({ valor: String(g.valor), cuenta: g.n })),
    });
  }

  return { data: filas, total: n ?? 0, facetas: salida };
}

export interface DiferenciaCampo {
  campo: string;
  /** `entryId` → valor. */
  valores: Record<string, unknown>;
}

/**
 * Compara varias entradas DISTINTAS campo a campo.
 *
 * No confundir con `compareSnapshots`, que compara dos versiones de LA MISMA
 * entrada. Esto es el comparador de producto: "¿en qué se diferencian estas tres
 * espadas?".
 *
 * Devuelve solo los campos donde hay diferencia. Enseñar las cuarenta filas
 * cuando treinta y ocho son idénticas esconde la respuesta entre ruido, y la
 * pregunta que trae a alguien a un comparador es exactamente esa.
 */
export function compararEntradas(
  entradas: { id: string; title: string; data: Record<string, unknown> | null }[]
): DiferenciaCampo[] {
  const campos = new Set<string>();
  for (const e of entradas) for (const k of Object.keys(e.data ?? {})) campos.add(k);

  return [...campos]
    .sort()
    .map((campo) => {
      const valores: Record<string, unknown> = {};
      for (const e of entradas) valores[e.id] = (e.data ?? {})[campo] ?? null;
      return { campo, valores };
    })
    .filter((f) => {
      const vs = Object.values(f.valores).map((v) => JSON.stringify(v));
      // Un campo que ninguna de las dos declara no es una diferencia.
      return new Set(vs).size > 1;
    });
}
