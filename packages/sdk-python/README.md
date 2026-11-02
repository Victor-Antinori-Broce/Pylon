# kitsuden (Python)

Cliente Python oficial de **Kitsuden** — el backend framework AI-native y BaaS
autoalojado. El modelo Supabase: **un backend, clientes en todos los
lenguajes**. Este paquete es el gemelo de `@kitsuden/sdk` (TypeScript): mismos
endpoints, mismos nombres, misma semántica.

```bash
pip install kitsuden          # not on PyPI yet: pip install ./packages/sdk-python
```

Única dependencia: `httpx`. A propósito — un SDK que arrastra medio PyPI
genera conflictos en el proyecto del usuario.

## Typed client: 5 lines to your first call

Generated from the API's OpenAPI 3.1 (every `defineOperacion` of the installed kons and
the core: one attribute per kon, one method per operation), sync and async, with
`py.typed`. Set `KITSUDEN_API_URL` (the API origin) and `KITSUDEN_API_TOKEN`
(`kitsuden_agent_…`):

```python
from kitsuden import KitsudenApi

kitsuden = KitsudenApi()
res = kitsuden.datasets.listar_datasets(limit=5)
if res.ok: print([d["name"] for d in res.data["docs"]])
```

Async, same contract:

```python
async with AsyncKitsudenApi() as kitsuden:
    res = await kitsuden.blog.listar_entradas(limit=5)
```

- Keyword arguments (path and query in snake_case, the body as `body=`), `TypedDict`
  bodies and responses, `KitsudenErrorCode` as a `Literal` of every `KITSUDEN_E_*` code.
- `202 KITSUDEN_E_APPROVAL_REQUIRED` is returned as `ProposalPending` (with `proposal`),
  never retried; `expect_ok(res)` raises `ProposalPendingError` instead.
- Automatic `Idempotency-Key` on writes; retries only when safe, honouring `Retry-After`
  (`RetryPolicy`, or `retry=False`).
- `format="json" | "toon" | "tron" | "auto"`, always decoded;
  `RequestOptions(provenance=True)` gives `res.meta.provenance` and `provenance_of(row)`.
- `kitsuden.blog.iter_listar_entradas(limit=50)` walks every page (`async for` in async).
- Errors: `KitsudenApiError` (`code`, `status`, `problem`, `retry_after`, `request_id`),
  `KitsudenNetworkError`, `KitsudenDecodeError`; all are `KitsudenError`.

Why dataclasses and `TypedDict`, not pydantic: `httpx` stays the only dependency, a
response is the `dict` the API sent (unknown fields kept), and type checkers still see every
field. Full guide: [docs/agents/clients.md](../../docs/agents/clients.md).

Tests: `pnpm test:sdk:py` (mocked server) and `pnpm test:sdk:integration` (a live API).

## Uso (cliente CRUD, anterior al cliente tipado)

```python
from kitsuden import KitsudenClient

client = KitsudenClient("http://localhost:3001", api_key="kitsuden_sk_...")

# CRUD sobre cualquier tabla expuesta (core, kon o dataset)
page = client.table("games").list(limit=10, sort="createdAt", dir="desc")
for game in page:
    print(game["title"])

game = client.table("games").create({"title": "Elden Ring"})
client.table("games").update(game["id"], {"title": "Elden Ring DLC"})
client.table("games").delete(game["id"])

# Colecciones dinámicas (datasets) por slug
builds = client.collection("mmorpg-builds")
builds.insert({"clase": "nigromante", "parche": "7.2"})
print(builds.entries(limit=5).data)

# Búsqueda semántica
hits = client.vector_search("dataset-id", "builds de nigromante", limit=5)

# Recuperación por árbol — secciones CON su cita ("Guía > Fase 3 > Gear")
index = client.tree_index(doc_markdown, title="Guía")
result = client.tree_retrieve(doc_markdown, "¿qué gear para fase 3?")
```

## Async

Mismo contrato, `await` delante — para agentes y servicios async-first:

```python
from kitsuden import AsyncKitsudenClient

async with AsyncKitsudenClient(url, api_key=key) as client:
    page = await client.table("games").list()
```

## Formatos de respuesta: JSON, TOON, auto

El cliente devuelve siempre dicts y listas; `format` solo cambia lo que viaja:

- `"json"` (por defecto): JSON compacto.
- `"toon"`: [TOON](https://toonformat.dev). Más corto que JSON en listas planas y
  uniformes (categorías, etiquetas, listas de páginas) y **más largo** en
  registros anidados como las entradas de un dataset. Cifras medidas:
  `docs/agents/benchmarks.md` del repositorio de Kitsuden.
- `"auto"`: la API codifica cada respuesta en JSON compacto y en TOON, comprueba
  que el TOON vuelve a dar exactamente los mismos datos y manda el más corto.

```python
client = KitsudenClient(url, api_key=key, format="auto")
```

Las escrituras siguen viajando en JSON siempre (es formato de respuesta). El
decoder está expuesto: `from kitsuden import decode_toon`.

## Errores

```python
from kitsuden import KitsudenError

try:
    client.table("games").get("nope")
except KitsudenError as e:
    print(e.status)     # 404
    print(e.payload)    # envelope crudo, para decidir programáticamente
```

## Cómo encaja con el resto de Kitsuden

| Quieres…                            | Usa                                                          |
| ----------------------------------- | ------------------------------------------------------------ |
| Consumir datos desde Python         | **este SDK**                                                 |
| Que un agente LLM opere Kitsuden    | el **MCP server** (`@kitsuden/mcp-server`)                   |
| Extender Kitsuden con lógica Python | un **servicio puente** vía webhooks/colas (patrón `kon-ocr`) |
| Escribir kons                       | TypeScript — el framework vive ahí                           |

## Tests

Sin red y sin servidor: `httpx.MockTransport` verifica el contrato literal
(paths, cabeceras, envelope de error, TOON).

```bash
python -m pytest tests/
```
