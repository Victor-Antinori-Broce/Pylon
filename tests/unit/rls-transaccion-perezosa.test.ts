/**
 * La transacción RLS de la petición con el pool de pg: perezosa, en cola y
 * sin COMMIT que mienta (los tres riesgos de A2, 2026-10-23)
 * ============================================================================
 *
 * Sin Postgres: un `pg.Pool` de verdad (Drizzle decide por él que es un pool)
 * cuyo `connect` devuelve un cliente de mentira que apunta cada sentencia,
 * cuántas corren a la vez y cuándo se devuelve. Así se ve el ORDEN exacto de
 * lo que llega al driver, que es lo que importa aquí:
 *
 *   · una ruta que no consulta no pide conexión (ni BEGIN);
 *   · un `Promise.all` llega al driver de una en una;
 *   · un SAVEPOINT y `comoSistema` no se mezclan con lo que corre en paralelo;
 *   · un COMMIT que Postgres convierte en ROLLBACK no sale como éxito;
 *   · una consulta tardía (fuera de `segundoPlano`) falla clara, no va a otra
 *     conexión.
 *
 * Con Postgres de verdad: apps/api/src/tests/transaccion-de-la-peticion.test.ts.
 */

import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Hono } from "hono";
import pg from "pg";
import { beforeEach, describe, expect, it } from "vitest";

import {
  comoSistema,
  conTransaccionesPerezosas,
  dbDeLaPeticion,
  intentarSql,
  transaccionRls,
  type ConfirmacionPerdida,
} from "../../packages/engine/src/rls-peticion";

interface Sentencia {
  texto: string;
  valores: unknown[];
}

let sentencias: Sentencia[];
let conexiones: number;
let devoluciones: unknown[];
let aLaVez: number;
let maximoALaVez: number;
let respuestaAlCommit: string;
let fallarConexion: Error | null;
let perdidas: ConfirmacionPerdida[];

function clienteDeMentira() {
  conexiones++;
  return {
    async query(config: unknown, valores?: unknown[]) {
      const texto = String(
        typeof config === "string" ? config : (config as { text: string }).text
      ).trim();
      aLaVez++;
      maximoALaVez = Math.max(maximoALaVez, aLaVez);
      try {
        sentencias.push({ texto, valores: valores ?? [] });
        // Un respiro real: si dos consultas pudieran solaparse, aquí lo harían.
        await new Promise((r) => setTimeout(r, 2));
        if (texto.startsWith("select fallo")) {
          throw Object.assign(new Error('relation "no_existe" does not exist'), {
            code: "42P01",
          });
        }
        const command = texto === "commit" ? respuestaAlCommit : texto.split(" ")[0].toUpperCase();
        return { command, rowCount: 0, rows: [], fields: [] };
      } finally {
        aLaVez--;
      }
    },
    release(err?: unknown) {
      devoluciones.push(err);
    },
  };
}

const pool = new pg.Pool({ connectionString: "postgres://nadie@127.0.0.1:1/nada" });
(pool as unknown as { connect: () => Promise<unknown> }).connect = async () => {
  if (fallarConexion) throw fallarConexion;
  return clienteDeMentira();
};
conTransaccionesPerezosas(pool);
const db = drizzle(pool);
const instancia = dbDeLaPeticion(db);

const textos = () => sentencias.map((s) => s.texto);
const esContexto = (s: Sentencia) => s.texto.startsWith("SELECT set_config");

let tardia: Promise<unknown> | null = null;

const app = new Hono();
app.use("*", async (c, next) => {
  c.set("user" as never, { id: "ana", role: "user" } as never);
  await next();
});
app.use(
  "*",
  transaccionRls(db, {
    alPerderConfirmacion: (_c, info) => perdidas.push(info),
  })
);
app.get("/nada", (c) => c.json({ ok: true }));
app.get("/una", async (c) => {
  await instancia.execute(sql`select 1`);
  return c.json({ ok: true });
});
app.get("/paralelo", async (c) => {
  const r = await Promise.all(
    Array.from({ length: 8 }, (_, i) => instancia.execute(sql`select ${i}`))
  );
  return c.json({ n: r.length });
});
app.get("/savepoint-en-paralelo", async (c) => {
  await Promise.all([
    instancia.transaction(async (t) => {
      await t.execute(sql`select 'dentro-1'`);
      await t.execute(sql`select 'dentro-2'`);
    }),
    instancia.execute(sql`select 'fuera'`),
    instancia.execute(sql`select 'fuera-2'`),
  ]);
  return c.json({ ok: true });
});
app.get("/sistema-en-paralelo", async (c) => {
  await Promise.all([
    comoSistema(async () => {
      await instancia.execute(sql`select 'sistema-1'`);
      await instancia.execute(sql`select 'sistema-2'`);
    }),
    instancia.execute(sql`select 'usuario'`),
  ]);
  return c.json({ ok: true });
});
app.on(["GET", "POST"], "/tragado", async (c) => {
  await instancia.execute(sql`insert 'algo'`);
  try {
    await instancia.execute(sql`select fallo`);
  } catch {
    // tragado: la transacción queda abortada
  }
  return c.json({ ok: true }, 201);
});
app.post("/tragado-con-savepoint", async (c) => {
  await instancia.execute(sql`insert 'algo'`);
  const r = await intentarSql<unknown>(() => instancia.execute(sql`select fallo`), "por-defecto");
  await instancia.execute(sql`select 'despues'`);
  return c.json({ r }, 201);
});
app.get("/falla-sin-consultar", (c) => c.json({ error: "x" }, 500));
app.get("/falla-tras-consultar", async (c) => {
  await instancia.execute(sql`insert 'algo'`);
  return c.json({ error: "x" }, 500);
});
app.get("/tardia", async (c) => {
  await instancia.execute(sql`select 1`);
  // Se toma DENTRO de la petición (resuelve a su transacción) y se usa después
  // de responder, sin segundoPlano: el error clásico de un `void tarea()`.
  const ejecutarLuego = instancia.execute;
  tardia = new Promise((r) => setTimeout(r, 30)).then(() => ejecutarLuego(sql`select 'tarde'`));
  return c.json({ ok: true });
});

beforeEach(() => {
  sentencias = [];
  conexiones = 0;
  devoluciones = [];
  aLaVez = 0;
  maximoALaVez = 0;
  respuestaAlCommit = "COMMIT";
  fallarConexion = null;
  perdidas = [];
  tardia = null;
});

describe("perezosa: sin consultas no hay conexión", () => {
  it("una ruta que no toca la base no pide conexión ni manda BEGIN", async () => {
    const r = await app.request("/nada");
    expect(r.status).toBe(200);
    expect(conexiones).toBe(0);
    expect(sentencias).toEqual([]);
  });

  it("la primera consulta abre: BEGIN, contexto, la consulta y COMMIT; una devolución", async () => {
    const r = await app.request("/una");
    expect(r.status).toBe(200);
    expect(conexiones).toBe(1);
    expect(textos()[0]).toBe("begin");
    expect(esContexto(sentencias[1])).toBe(true);
    expect(sentencias[1].valores).toEqual(["ana", "user"]);
    expect(textos().slice(2)).toEqual(["select 1", "commit"]);
    expect(devoluciones).toEqual([undefined]);
  });

  it("si el pool no da conexión, falla la consulta (no el middleware)", async () => {
    fallarConexion = new Error("timeout exceeded when trying to connect");
    const r = await app.request("/una");
    expect(r.status).toBe(500);
    expect(devoluciones).toEqual([]);
  });

  it("un 5xx sin consultas no abre nada; con consultas, ROLLBACK", async () => {
    expect((await app.request("/falla-sin-consultar")).status).toBe(500);
    expect(conexiones).toBe(0);
    expect((await app.request("/falla-tras-consultar")).status).toBe(500);
    expect(textos().at(-1)).toBe("rollback");
  });
});

describe("en cola: una consulta cada vez", () => {
  it("un Promise.all de 8 consultas llega al driver de una en una", async () => {
    const r = await app.request("/paralelo");
    expect(await r.json()).toEqual({ n: 8 });
    expect(maximoALaVez).toBe(1);
    expect(textos().filter((t) => t === "select $1")).toHaveLength(8);
  });

  it("un SAVEPOINT en paralelo no deja colarse nada entre su apertura y su cierre", async () => {
    await app.request("/savepoint-en-paralelo");
    const t = textos();
    const abre = t.indexOf("savepoint sp1");
    const cierra = t.indexOf("release savepoint sp1");
    expect(abre).toBeGreaterThan(-1);
    expect(t.slice(abre, cierra + 1)).toEqual([
      "savepoint sp1",
      "select 'dentro-1'",
      "select 'dentro-2'",
      "release savepoint sp1",
    ]);
    expect(t).toContain("select 'fuera'");
    expect(maximoALaVez).toBe(1);
  });

  it("comoSistema en paralelo: lo de fuera NO corre como el sistema", async () => {
    await app.request("/sistema-en-paralelo");
    const s = sentencias.filter((x) => x.texto !== "begin" && x.texto !== "commit");
    // Contexto vigente en cada consulta, reconstruido en orden.
    let vigente: unknown[] = [];
    const vistas: Record<string, unknown[]> = {};
    for (const x of s) {
      if (esContexto(x)) vigente = x.valores;
      else vistas[x.texto] = vigente;
    }
    expect(vistas["select 'sistema-1'"]).toEqual(["", ""]);
    expect(vistas["select 'sistema-2'"]).toEqual(["", ""]);
    expect(vistas["select 'usuario'"]).toEqual(["ana", "user"]);
  });
});

describe("errores tragados: el COMMIT que Postgres convierte en ROLLBACK", () => {
  it("una escritura que respondía 201 sale como 500, y se avisa", async () => {
    respuestaAlCommit = "ROLLBACK";
    const r = await app.request("/tragado", { method: "POST" });
    expect(r.status).toBe(500);
    expect((await r.json()).code).toBe("KITSUDEN_E_INTERNAL");
    expect(perdidas).toHaveLength(1);
    expect(perdidas[0]).toMatchObject({
      metodo: "POST",
      respuestaCambiada: true,
      error: { code: "42P01" },
    });
  });

  it("una lectura no cambia su respuesta, pero se avisa igual", async () => {
    respuestaAlCommit = "ROLLBACK";
    const r = await app.request("/tragado");
    expect(r.status).toBe(201);
    expect(perdidas[0]).toMatchObject({ metodo: "GET", respuestaCambiada: false });
  });

  it("intentarSql: el fallo va en su SAVEPOINT y lo de después sigue", async () => {
    const r = await app.request("/tragado-con-savepoint", { method: "POST" });
    expect(r.status).toBe(201);
    expect(await r.json()).toEqual({ r: "por-defecto" });
    const t = textos();
    expect(t.slice(t.indexOf("savepoint sp1"), t.indexOf("savepoint sp1") + 3)).toEqual([
      "savepoint sp1",
      "select fallo",
      "rollback to savepoint sp1",
    ]);
    expect(t.at(-2)).toBe("select 'despues'");
    expect(perdidas).toEqual([]);
  });
});

describe("después de responder", () => {
  it("una consulta tardía con el db de la petición no va a ninguna conexión prestada", async () => {
    await app.request("/tardia");
    const antes = sentencias.length;
    const error = (await tardia!.then(
      () => null,
      (e: unknown) => e
    )) as { message?: string; cause?: { message?: string } } | null;
    // Drizzle lo envuelve («Failed query…»); el motivo va en `cause`.
    expect(error?.cause?.message ?? error?.message).toMatch(/segundoPlano/);
    expect(sentencias.slice(antes).map((s) => s.texto)).not.toContain("select 'tarde'");
    expect(devoluciones).toHaveLength(1);
  });
});
