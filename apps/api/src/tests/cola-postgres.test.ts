/**
 * La cola de Postgres (transactional outbox) contra Postgres DE VERDAD
 * ============================================================================
 * kitsuden2.md, B1 (2026-10-28). Lo que tiene que cumplir:
 *
 *   1. Atomicidad: un trabajo despachado en una petición que acaba en
 *      ROLLBACK no existe; si confirma, queda listo y el worker lo ejecuta.
 *   2. Reintentos con espera y «dead letter»; `ErrorPermanente` muere al
 *      momento; reintentar desde el panel lo vuelve a poner en marcha.
 *   3. Huérfanos: un `running` con el arriendo vencido vuelve a la cola (o
 *      muere si ya gastó sus intentos).
 *   4. El actor se relee: una cuenta que ya no existe = no se ejecuta.
 *   5. El handler corre con la RLS del actor (`app.current_user_id`).
 *   6. Permisos: el rol de la aplicación solo INSERTA; el resto, por las
 *      funciones SECURITY DEFINER.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { sql } from "drizzle-orm";
import { Hono } from "hono";

import { ErrorPermanente, queue } from "../../../../packages/engine/src/cola";
import { runInRequestScope } from "../../../../packages/engine/src/request-scope";
import {
  dbDeLaPeticion,
  transaccionRls,
  type ConexionTransaccional,
} from "../../../../packages/engine/src/rls-peticion";
import { db } from "../db";
import {
  barrerAhora,
  pausarTrabajador,
  procesarPendientes,
  reintentarTrabajo,
  setReleerActor,
  setupWorkers,
  shutdownQueues,
  trabajosMuertos,
} from "../lib/queue";

import { isDatabaseAvailable } from "./setup";

const COLA = "pruebas-cola";
let disponible = false;
const ejecutados: Array<{ nombre: string; payload: unknown; usuario: unknown; rls: unknown }> = [];
const instancia = dbDeLaPeticion(db);
let fallarHasta = 0;

function filas(r: unknown): Array<Record<string, unknown>> {
  return ((r as { rows?: unknown[] }).rows ?? []) as Array<Record<string, unknown>>;
}

async function estadoDe(id: string): Promise<Record<string, unknown> | undefined> {
  return filas(await db.execute(sql`SELECT * FROM kitsuden_outbox WHERE id = ${id}::uuid`))[0];
}

/** Una app con la transacción RLS de cada petición, como el anfitrión. */
const app = new Hono();
app.use("*", async (c, next) => {
  const id = c.req.header("x-usuario");
  c.set("user" as never, (id ? { id, role: "user" } : null) as never);
  await runInRequestScope({ requestId: `req-${Date.now()}` }, () => next());
});
app.use("*", transaccionRls(db as unknown as ConexionTransaccional));
app.post("/confirma", async (c) => {
  const r = await queue.dispatch(COLA, "ok", { n: 1 });
  return c.json(r, 201);
});
app.post("/revierte", async (c) => {
  const r = await queue.dispatch(COLA, "ok", { n: 2 });
  return c.json(r, 500);
});

beforeAll(async () => {
  disponible = await isDatabaseAvailable();
  if (!disponible) return;
  queue.handle(COLA, async (trabajo) => {
    // Con `dbDeLaPeticion`, la transacción del trabajo: la RLS del actor.
    const [ctx] = filas(
      await instancia.execute(sql`SELECT current_setting('app.current_user_id', true) AS uid`)
    );
    if (trabajo.nombre === "falla" && trabajo.intento <= fallarHasta) throw new Error("fallo a propósito");
    if (trabajo.nombre === "permanente") throw new ErrorPermanente("no tiene arreglo");
    ejecutados.push({
      nombre: trabajo.nombre,
      payload: trabajo.payload,
      usuario: trabajo.actor?.id ?? null,
      rls: ctx?.uid ?? null,
    });
  });
  // Sin despertares automáticos: las pruebas mandan con procesarPendientes().
  await setupWorkers();
  pausarTrabajador(true);
});

beforeEach(async () => {
  if (!disponible) return;
  ejecutados.length = 0;
  fallarHasta = 0;
  setReleerActor(null);
  await db.execute(sql`DELETE FROM kitsuden_outbox WHERE queue = ${COLA}`);
});

afterAll(async () => {
  if (!disponible) return;
  await db.execute(sql`DELETE FROM kitsuden_outbox WHERE queue = ${COLA}`);
  await shutdownQueues();
});

describe("cola de Postgres: atomicidad con la petición", () => {
  it("ROLLBACK: el trabajo de una petición que acaba en 500 no existe", async () => {
    if (!disponible) return;
    const res = await app.request("/revierte", { method: "POST" });
    expect(res.status).toBe(500);
    const { id } = (await res.json()) as { id: string };
    expect(await estadoDe(id)).toBeUndefined();
  });

  it("COMMIT: el trabajo queda pendiente y el worker lo ejecuta una vez", async () => {
    if (!disponible) return;
    const res = await app.request("/confirma", { method: "POST" });
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    expect((await estadoDe(id))?.status).toBe("pending");
    await procesarPendientes();
    expect((await estadoDe(id))?.status).toBe("done");
    expect(ejecutados).toHaveLength(1);
    await procesarPendientes();
    expect(ejecutados).toHaveLength(1);
  });

  it("guarda al actor de la petición y lo relee al ejecutar", async () => {
    if (!disponible) return;
    const vistos: string[] = [];
    setReleerActor(async (fila) => {
      vistos.push(String(fila.user_id));
      return { ok: true, actor: { id: String(fila.user_id), role: "user" } };
    });
    const res = await app.request("/confirma", { method: "POST", headers: { "x-usuario": "u-cola-1" } });
    const { id } = (await res.json()) as { id: string };
    expect((await estadoDe(id))?.user_id).toBe("u-cola-1");
    await procesarPendientes();
    expect(vistos).toEqual(["u-cola-1"]);
    expect(ejecutados[0]?.usuario).toBe("u-cola-1");
    // Y la transacción del handler lleva su contexto RLS.
    expect(ejecutados[0]?.rls).toBe("u-cola-1");
  });
});

describe("cola de Postgres: fallos", () => {
  it("reintenta con espera y, agotados los intentos, queda en la dead letter", async () => {
    if (!disponible) return;
    fallarHasta = 99;
    const { id } = await queue.dispatch(COLA, "falla", {}, { intentos: 2 });
    await procesarPendientes();
    let fila = await estadoDe(id);
    expect(fila?.status).toBe("pending");
    expect(Number(fila?.attempts)).toBe(1);
    expect(String(fila?.last_error)).toContain("fallo a propósito");
    // La espera de reintento la pone en el futuro: se adelanta para la prueba.
    await db.execute(sql`UPDATE kitsuden_outbox SET run_at = now() WHERE id = ${id}::uuid`);
    await procesarPendientes();
    fila = await estadoDe(id);
    expect(fila?.status).toBe("dead");
    expect((await trabajosMuertos()).some((m) => m.id === id)).toBe(true);
  });

  it("ErrorPermanente: dead al primer intento", async () => {
    if (!disponible) return;
    const { id } = await queue.dispatch(COLA, "permanente", {});
    await procesarPendientes();
    const fila = await estadoDe(id);
    expect(fila?.status).toBe("dead");
    expect(Number(fila?.attempts)).toBe(1);
  });

  it("reintentar desde el panel vuelve a ejecutarlo", async () => {
    if (!disponible) return;
    fallarHasta = 1;
    const { id } = await queue.dispatch(COLA, "falla", {}, { intentos: 1 });
    await procesarPendientes();
    expect((await estadoDe(id))?.status).toBe("dead");
    expect(await reintentarTrabajo(id)).toBe(true);
    fallarHasta = 0;
    await procesarPendientes();
    expect((await estadoDe(id))?.status).toBe("done");
  });

  it("actor revocado: el trabajo muere sin ejecutarse", async () => {
    if (!disponible) return;
    await db.execute(sql`
      INSERT INTO kitsuden_outbox (id, queue, name, payload, user_id, user_role)
      VALUES (gen_random_uuid(), ${COLA}, 'ok', '{}'::jsonb, 'cuenta-que-no-existe', 'user')`);
    await procesarPendientes();
    const [fila] = filas(await db.execute(sql`SELECT * FROM kitsuden_outbox WHERE queue = ${COLA}`));
    expect(fila?.status).toBe("dead");
    expect(String(fila?.last_error)).toContain("actor_revoked");
    expect(ejecutados).toHaveLength(0);
  });
});

describe("cola de Postgres: huérfanos", () => {
  it("un running con el arriendo vencido vuelve a pending; sin intentos, a dead", async () => {
    if (!disponible) return;
    const vivo = await queue.dispatch(COLA, "ok", {}, { intentos: 3 });
    const agotado = await queue.dispatch(COLA, "ok", {}, { intentos: 1 });
    await db.execute(sql`
      UPDATE kitsuden_outbox
         SET status = 'running', attempts = 1, locked_by = 'worker-muerto',
             locked_until = now() - interval '1 minute'
       WHERE id IN (${vivo.id}::uuid, ${agotado.id}::uuid)`);
    await barrerAhora();
    expect((await estadoDe(vivo.id))?.status).toBe("pending");
    expect((await estadoDe(agotado.id))?.status).toBe("dead");
    await procesarPendientes();
    expect((await estadoDe(vivo.id))?.status).toBe("done");
  });

  it("dos reclamos a la vez no se llevan el mismo trabajo (SKIP LOCKED)", async () => {
    if (!disponible) return;
    for (let i = 0; i < 6; i++) await queue.dispatch(COLA, "ok", { i });
    const reclamar = (w: string) =>
      db.execute(sql`SELECT id FROM kitsuden_cola_reclamar(ARRAY[${COLA}]::text[], 4, 60, ${w})`);
    const [a, b] = await Promise.all([reclamar("w-a"), reclamar("w-b")]);
    const ids = [...filas(a), ...filas(b)].map((f) => f.id);
    expect(ids).toHaveLength(6);
    expect(new Set(ids).size).toBe(6);
  });
});

describe("cola de Postgres: permisos del rol de la aplicación", () => {
  const ROL = "kitsuden_cola_prueba";

  beforeAll(async () => {
    if (!disponible) return;
    await db.execute(sql.raw(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${ROL}') THEN CREATE ROLE ${ROL} NOLOGIN; END IF;
    END $$`));
    await db.execute(sql.raw(`GRANT INSERT ON kitsuden_outbox TO ${ROL}`));
    await db.execute(
      sql.raw(`GRANT EXECUTE ON FUNCTION kitsuden_cola_estado() TO ${ROL}`)
    );
  });

  it("puede insertar y llamar a las funciones, pero no leer ni tocar la tabla", async () => {
    if (!disponible) return;
    const r = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL ROLE ${ROL}`));
      await tx.execute(sql`INSERT INTO kitsuden_outbox (id, queue, name) VALUES (gen_random_uuid(), ${COLA}, 'rol')`);
      const estado = await tx.execute(sql`SELECT * FROM kitsuden_cola_estado()`);
      const lectura = await tx
        .execute(sql`SELECT payload FROM kitsuden_outbox LIMIT 1`)
        .then(() => "leyó", (e: unknown) => String((e as { cause?: { code?: string } }).cause?.code ?? e));
      return { estado: filas(estado).length > 0, lectura };
    }).catch((e: unknown) => ({ error: String(e) }));
    expect(r).toMatchObject({ estado: true });
    expect((r as { lectura?: string }).lectura).toContain("42501");
  });
});

describe("cola de Postgres: NOTIFY al confirmar", () => {
  it("el worker se despierta con el NOTIFY del COMMIT, sin esperar al sondeo", async () => {
    if (!disponible) return;
    pausarTrabajador(false);
    try {
      const res = await app.request("/confirma", { method: "POST" });
      const { id } = (await res.json()) as { id: string };
      let estado: unknown;
      for (let i = 0; i < 30; i++) {
        estado = (await estadoDe(id))?.status;
        if (estado === "done") break;
        await new Promise((r) => setTimeout(r, 50));
      }
      expect(estado).toBe("done");
    } finally {
      pausarTrabajador(true);
    }
  });
});
