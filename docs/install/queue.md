# Background jobs: the Postgres queue

Since 2026-10-28 Kitsuden runs its background jobs on **Postgres**, with a
transactional outbox. BullMQ is gone, and Valkey is optional. A deployment is
two services: the API and Postgres.

```ts
import { queue, ErrorPermanente } from "@kitsuden/engine";

// In a route: the job is written in the request's own transaction.
await queue.dispatch("reports", "monthly", { month: "2026-10" });

// Anywhere at startup (a kon's boot hook, the host): one handler per queue.
queue.handle("reports", async (job) => {
  if (!job.payload) throw new ErrorPermanente("empty payload"); // no retries
  await buildReport(job.payload); // must be idempotent
}, { concurrencia: 2 });
```

`defineAction({ trigger: "event:reports", run })` registers the same kind of
handler, and `ctx.queue.add("reports", "monthly", payload)` dispatches to it.

## What it promises

| Promise | How |
| --- | --- |
| **Atomic with the request.** A job dispatched in a request that ends in `ROLLBACK` does not exist; on `COMMIT` it is ready. | `dispatch` inserts into `kitsuden_outbox` with the request's RLS transaction. Outside a request it commits at once. |
| **At least once.** | A worker that dies mid-job leaves an expired lease; the sweep puts the job back. **Handlers must be idempotent.** |
| **The actor is re-read.** A job queued yesterday does not run with permissions revoked today. | The job stores who queued it. Before running: a person → their current role (deleted = not run); an agent → still active, key not revoked, current scopes (as approvals do). The handler runs inside an RLS transaction **as that actor**. |
| **Retries and a dead letter.** | A handler that throws is retried with exponential backoff (2 s, 4 s, 8 s … up to 10 min) until `intentos` (default 3). Then, or on `ErrorPermanente`, the job is `dead`. |

### What happens to a dead job (decided 2026-10-28)

It stays in the table with its last error, and is **never deleted
automatically**. `/api/health` reports `queue.status = "warning"` while there is
at least one, and the admin endpoints let a person act on it:

```
GET    /api/admin/queue              counts per queue/status + dead jobs (no payload)
POST   /api/admin/queue/<id>/retry   back to pending, attempts reset
DELETE /api/admin/queue/<id>         discard
```

Dead jobs are listed **without their payload** (it may hold e-mail addresses).

### Recording a failure from a handler

The handler runs inside a transaction (with its actor's RLS). If it **throws**,
that transaction is rolled back, so anything it wrote ("status = failed" on
your own row) is undone. To record a permanent failure on your own data, write
it and **return**; throw only what should be retried (or `ErrorPermanente`
when you do not need to record anything). `kon-ingesta` does exactly this.

## How it works

- **Table without RLS, with its own permissions.** The application role
  (`kitsuden_app`) has `INSERT` on `kitsuden_outbox` and nothing else.
  Claiming, closing and listing go through `SECURITY DEFINER` functions with a
  narrow contract (`kitsuden_cola_reclamar`, `_completar`, `_fallar`,
  `_barrer`, `_estado`, `_muertos`, `_reintentar`, `_descartar`). No role needs
  `BYPASSRLS`. Migration `0056_cola_en_postgres.sql`.
- **Claim:** `FOR UPDATE SKIP LOCKED`, then `status = 'running'` with a lease
  (`locked_until`). `SKIP LOCKED` only protects during the claiming
  transaction; the lease covers the rest.
- **Sweep** (every 30 s): running jobs whose lease expired go back to
  `pending`, or to `dead` if they used up their attempts. Finished jobs are
  deleted after `QUEUE_RETENTION_DAYS`.
- **Wake-up:** `dispatch` also sends `pg_notify('kitsuden_cola', queue)`.
  Postgres delivers it on `COMMIT` (never on `ROLLBACK`), so it fits the
  outbox. Only a signal travels, never the job (NOTIFY payloads are limited to
  8000 bytes). The worker also **polls** every `QUEUE_POLL_MS`: a notification
  can be lost, so polling is mandatory, not a fallback you can remove.
- **LISTEN needs a dedicated connection**, long-lived, outside the pool and
  **not through PgBouncer in transaction mode** (there each statement may go to
  another server). If the API sits behind PgBouncer, point
  `DATABASE_LISTEN_URL` straight at Postgres ([PgBouncer](pgbouncer.md)).
- **Own pool:** the worker uses its own small pool (`QUEUE_POOL_MAX`, 3), so
  jobs never compete with requests for connections. Its transactions are lazy
  like the requests': a job that only sends an e-mail never takes a connection.

## Variables

| Variable | Default | |
| --- | --- | --- |
| `QUEUE_WORKER` | `true` | `false` = this process only enqueues (run the worker elsewhere). |
| `QUEUE_POOL_MAX` | `3` | Connections of the worker's own pool. |
| `QUEUE_POLL_MS` | `2000` | Polling interval. |
| `QUEUE_LEASE_SECONDS` | `300` | Lease of a running job. A handler that may take longer must be split. |
| `QUEUE_RETENTION_DAYS` | `7` | Finished jobs are deleted after this. Dead ones are kept. |
| `QUEUE_DATABASE_URL` | `DATABASE_URL` | Connection of the worker's pool. |
| `DATABASE_LISTEN_URL` | `DATABASE_URL` | Connection for LISTEN (direct to Postgres). |

## Valkey after BullMQ

Removing BullMQ does not remove Valkey by itself; this is what each former
user does now **without** `VALKEY_URL`/`REDIS_URL` (single instance):

| Former Valkey user | Without Valkey |
| --- | --- |
| Query, LLM and agent caches | Process memory, capped (`CACHE_MEMORY_MAX_KEYS`, 5 000). |
| Rate limiter | Process memory, **all** routes. Deliberately **not** a Postgres table: every request would write to the database, whose pool was already exhausted once by parallel reads. |
| Realtime Pub/Sub | Delivered in-process, and to other replicas through `LISTEN/NOTIFY` (`kitsuden_bus`). Messages over ~7.9 kB reach only this process. |
| Agent quotas, idempotency | Their Postgres tables (already there). |
| GraphQL schema version | Local only. |

**Decision (2026-10-28):** Valkey is an optional dependency for horizontal
scaling. With several API replicas, configure it: it is what shares caches and
counters between them. A single instance does not need it, and without a URL
the API never tries `localhost:6379`.

## Throughput, measured

The figure "2 000–5 000 jobs/s with `SKIP LOCKED`" was an assumption. Measured
with `apps/api/scripts/benchmark-cola.ts` (real schema, indexes and functions):

| Where | Dispatch (one transaction per job, 8 clients) | Claim + close (4 workers, batches of 50, no handler) |
| --- | --- | --- |
| Developer laptop, Docker Desktop on Windows (WSL2), 8 cores, Postgres 16 in a container with `fsync` on, 2026-10-28 | ~600 jobs/s | ~550 jobs/s |

Each dispatched job is a commit (an `fsync`), and each close is a round trip;
that, not `SKIP LOCKED`, sets the ceiling here. Measure on your own hardware
before quoting a number:

```bash
DATABASE_URL=postgres://…/kitsuden_test bun run apps/api/scripts/benchmark-cola.ts --jobs=20000
```

Kitsuden's own jobs (e-mail, actions, agent tools) are far below that rate.
