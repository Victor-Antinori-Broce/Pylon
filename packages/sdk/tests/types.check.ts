/**
 * Compile-time checks of the generated types (`tsc -p tests/tsconfig.json`,
 * part of `pnpm --filter @kitsuden/sdk typecheck`). Nothing here runs: a line
 * marked `@ts-expect-error` that stops being an error fails the build.
 */

import { createKitsuden, type Datasets, type KitsudenErrorCode, type Outcome } from "../src/index";

declare const k: ReturnType<typeof createKitsuden>;

async function comprobaciones() {
  // Arguments: path params required, body typed, no args when there are none.
  const r = await k.datasets.crearEntrada({ id: "d", body: { title: "t", data: { a: 1 } } });
  // @ts-expect-error missing path parameter
  await k.datasets.obtenerDataset({});
  await k.datasets.listarDatasets();
  await k.datasets.listarDatasets({ limit: 10 });
  // @ts-expect-error unknown query parameter
  await k.datasets.listarDatasets({ limitt: 10 });

  // Outcome narrowing: data only on ok, proposal only on pending.
  if (r.kind === "ok") {
    const id: string = (r.data as Datasets.CrearEntradaResponse & { id: string }).id;
    void id;
  } else {
    const url: string = r.proposal.statusUrl;
    void url;
  }

  // Response typed from the schema.
  const lista = await k.datasets.listarDatasets();
  if (lista.ok) {
    const nombres: string[] = lista.data.docs.map((d) => d.name);
    void nombres;
    // @ts-expect-error not a field of the response
    void lista.data.nope;
  }

  // Pagination: items typed.
  for await (const post of k.blog.listarEntradas.iterate({ limit: 5 })) {
    const t: string = post.title;
    void t;
  }

  // Error codes are a closed union.
  const c: KitsudenErrorCode = "KITSUDEN_E_APPROVAL_REQUIRED";
  // @ts-expect-error not a catalog code
  const mal: KitsudenErrorCode = "KITSUDEN_E_NOPE";
  void c;
  void mal;

  const o: Outcome<number> = { kind: "ok", ok: true, status: 200, data: 1, meta: {} as never };
  void o;
  // Operation metadata for agents.
  const scope: string | null = k.blog.crearEntrada.info.scope;
  void scope;
}
void comprobaciones;
