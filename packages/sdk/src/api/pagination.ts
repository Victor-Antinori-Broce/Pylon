import { ProposalPendingError } from "./errors";
import type { CallOptions, Ok, OperationInfo, Outcome } from "./types";

type Call = (
  info: OperationInfo,
  params: Record<string, unknown>,
  options?: CallOptions
) => Promise<Outcome<unknown>>;

const CAMPOS_DE_ITEMS = ["docs", "data", "items", "rows", "results", "entries"];
/** Where list responses keep their counters, in the order they are looked up. */
const CONTENEDORES = ["", "pagination", "meta", "pageInfo"];

function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** The items of one page (`field` from the generated info; guessed when it is `null`). */
export function itemsOf(data: unknown, field: string | null | undefined): unknown[] {
  if (Array.isArray(data)) return data;
  const o = obj(data);
  if (!o) return [];
  if (field) return Array.isArray(o[field]) ? (o[field] as unknown[]) : [];
  for (const k of CAMPOS_DE_ITEMS) if (Array.isArray(o[k])) return o[k] as unknown[];
  const arrays = Object.values(o).filter(Array.isArray);
  return arrays.length === 1 ? (arrays[0] as unknown[]) : [];
}

function buscar(data: unknown, nombres: string[]): unknown {
  const o = obj(data);
  if (!o) return undefined;
  for (const c of CONTENEDORES) {
    const donde = c ? obj(o[c]) : o;
    if (!donde) continue;
    for (const n of nombres) if (donde[n] !== undefined && donde[n] !== null) return donde[n];
  }
  return undefined;
}

const numero = (v: unknown): number | undefined => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
};

/** Walks the pages of a list operation, moving `page`, `offset` or `cursor`. */
export async function* pages(
  call: Call,
  info: OperationInfo,
  params: Record<string, unknown> = {},
  options?: CallOptions
): AsyncIterableIterator<Ok<unknown>> {
  const pag = info.pagination;
  if (!pag) throw new TypeError(`${info.operationId} is not a list operation`);
  const p: Record<string, unknown> = { ...params };
  let pagina = numero(p.page) ?? 1;
  let desplazamiento = numero(p.offset) ?? 0;
  for (let vuelta = 0; vuelta < 100_000; vuelta++) {
    if (pag.style === "page") p.page = pagina;
    if (pag.style === "offset") p.offset = desplazamiento;
    const out = await call(info, p, options);
    if (out.kind !== "ok") throw new ProposalPendingError(out);
    yield out;

    const items = itemsOf(out.data, pag.items);
    if (items.length === 0) return;
    const hayMas = buscar(out.data, ["hasNextPage", "hasMore", "has_more", "hasNext"]);
    if (hayMas === false) return;
    const limite =
      numero(pag.limit ? p[pag.limit] : undefined) ??
      numero(buscar(out.data, ["limit", "pageSize", "perPage"]));
    const corta = hayMas !== true && limite !== undefined && items.length < limite;

    if (pag.style === "cursor") {
      const siguiente = buscar(out.data, ["nextCursor", "next_cursor", "cursor"]);
      if (
        siguiente === undefined ||
        siguiente === null ||
        siguiente === "" ||
        siguiente === p.cursor
      )
        return;
      p.cursor = siguiente;
      continue;
    }
    if (corta) return;
    if (pag.style === "page") {
      const totalPaginas = numero(buscar(out.data, ["totalPages", "pages", "pageCount"]));
      if (totalPaginas !== undefined && pagina >= totalPaginas) return;
      pagina++;
    } else {
      desplazamiento += items.length;
      const total = numero(buscar(out.data, ["totalDocs", "total", "totalCount", "count"]));
      if (total !== undefined && desplazamiento >= total) return;
    }
  }
}

export async function* iterate(
  call: Call,
  info: OperationInfo,
  params: Record<string, unknown> = {},
  options?: CallOptions
): AsyncIterableIterator<unknown> {
  for await (const pagina of pages(call, info, params, options)) {
    yield* itemsOf(pagina.data, info.pagination?.items);
  }
}
