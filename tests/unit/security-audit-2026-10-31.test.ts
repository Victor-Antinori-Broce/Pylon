/**
 * Regression tests for the security audit of 2026-10-31: everything that can be
 * checked without a database. What needs Postgres is in
 * apps/api/src/tests/security-audit-2026-10-31.test.ts.
 */
import { agenteEscribePorPolitica, decidirPromocion, escanearCodigo, publishedOrOwn, publishedOrOwnQl } from "@kitsuden/shared";
import { Hono } from "hono";
import { PgDialect } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../apps/api/src/lib/valkey", () => ({
  valkeyConfigurado: () => false,
  getValkeyClient: () => Promise.reject(new Error("no Valkey in this test")),
}));

const { problemasDeConfigPublica } = await import("../../apps/api/src/lib/config-publica");
const { isPlaceholderSecret, placeholderSecrets } = await import("../../apps/api/src/lib/placeholder-secrets");
const { signUpClosed } = await import("../../apps/api/src/lib/signup-mode");
const { direccionNoPublica } = await import("../../apps/api/src/lib/oauth/cimd");
const { verificarConexionRls } = await import("../../apps/api/src/lib/rls-connection-guard");
const { globalRateLimit, vaciarReservaEnMemoria } = await import("../../apps/api/src/lib/rate-limiter");
const { generateEmbedding, generateMockEmbedding, MAX_EMBEDDING_INPUT_CHARS } = await import(
  "../../apps/api/src/services/embeddings"
);
const { traeCookieDeSesion } = await import("../../apps/api/src/middleware/origen-de-escritura");
const { caminoDeApiValido, exigirHostPublico } = await import("../../apps/api/src/lib/worker-sandbox");

// ── Finding 3: placeholder secrets ──────────────────────────────────────────

describe("placeholder secrets", () => {
  it("recognizes what the example files ship, and leaves real values alone", () => {
    for (const v of [
      "<GENERATE_A_SECURE_SECRET_MIN_32_CHARS>",
      "<openssl rand -hex 32>",
      "change-me-to-a-random-string-at-least-32-chars",
      "cambiame-en-produccion",
      "please-GENERATE-one-for-this-installation",
    ]) {
      expect(isPlaceholderSecret(v), v).toBe(true);
    }
    expect(isPlaceholderSecret("Zm9vYmFyYmF6cXV4MTIzNDU2Nzg5MGFiY2RlZmdoaWprbG1ubw")).toBe(false);
  });

  it("looks at the four secrets, and only names them", () => {
    expect(
      placeholderSecrets({
        BETTER_AUTH_SECRET: "<GENERATE>",
        KITSUDEN_SECRETS_KEY: "change-me",
        SITIO_API_CLAVE: "cambiame",
        APP_DB_PASSWORD: "<openssl rand -hex 32>",
        OTHER: "<GENERATE>",
      })
    ).toEqual(["BETTER_AUTH_SECRET", "KITSUDEN_SECRETS_KEY", "SITIO_API_CLAVE", "APP_DB_PASSWORD"]);
    expect(placeholderSecrets({ KITSUDEN_SECRETS_KEY: "", SITIO_API_CLAVE: undefined })).toEqual([]);
  });

  it("the public configuration check refuses them even when they are long enough", () => {
    const problemas = problemasDeConfigPublica({ BETTER_AUTH_SECRET: "<GENERATE_A_SECURE_SECRET_MIN_32_CHARS>" });
    expect(problemas.some((p) => p.variable === "BETTER_AUTH_SECRET" && p.motivo.includes("placeholder"))).toBe(true);
  });

  describe("at load time, config.ts", () => {
    const antes = { ...process.env };
    let salida: ReturnType<typeof vi.spyOn>;
    let aviso: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      vi.resetModules();
      process.env.DATABASE_URL = "postgres://nobody@localhost:1/x";
      salida = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
        throw new Error(`exit ${code}`);
      }) as never);
      aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.spyOn(console, "error").mockImplementation(() => {});
    });
    afterEach(() => {
      process.env = { ...antes };
      vi.restoreAllMocks();
    });

    it("refuses to load in production", async () => {
      process.env.NODE_ENV = "production";
      process.env.BETTER_AUTH_SECRET = "<GENERATE_A_SECURE_SECRET_MIN_32_CHARS>";
      await expect(import("../../apps/api/src/lib/config")).rejects.toThrow("exit 1");
      expect(salida).toHaveBeenCalledWith(1);
    });

    it("refuses to load with KITSUDEN_PUBLIC=true", async () => {
      process.env.NODE_ENV = "development";
      process.env.KITSUDEN_PUBLIC = "true";
      process.env.BETTER_AUTH_SECRET = "a".repeat(40);
      process.env.APP_DB_PASSWORD = "cambiame-en-produccion";
      await expect(import("../../apps/api/src/lib/config")).rejects.toThrow("exit 1");
    });

    it("warns loudly and keeps booting in development", async () => {
      process.env.NODE_ENV = "development";
      delete process.env.KITSUDEN_PUBLIC;
      process.env.BETTER_AUTH_SECRET = "<GENERATE_A_SECURE_SECRET_MIN_32_CHARS>";
      await import("../../apps/api/src/lib/config");
      expect(salida).not.toHaveBeenCalled();
      expect(aviso.mock.calls.flat().join(" ")).toContain("BETTER_AUTH_SECRET");
    });
  });
});

// ── Finding 7: sign-up switch ───────────────────────────────────────────────

describe("KITSUDEN_SIGNUP", () => {
  it("defaults to closed in production and open otherwise", () => {
    expect(signUpClosed({ NODE_ENV: "production" })).toBe(true);
    expect(signUpClosed({ NODE_ENV: "development" })).toBe(false);
    expect(signUpClosed({ NODE_ENV: "test" })).toBe(false);
    expect(signUpClosed({})).toBe(false);
  });

  it("obeys the variable, and a typo closes", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(signUpClosed({ NODE_ENV: "production", KITSUDEN_SIGNUP: "open" })).toBe(false);
    expect(signUpClosed({ NODE_ENV: "development", KITSUDEN_SIGNUP: "closed" })).toBe(true);
    expect(signUpClosed({ NODE_ENV: "development", KITSUDEN_SIGNUP: "opne" })).toBe(true);
    vi.restoreAllMocks();
  });
});

// ── Finding 5: agents and the dataset policy ────────────────────────────────

describe("agenteEscribePorPolitica", () => {
  const abierta = { readAccess: "authenticated", writeAccess: "authenticated" };

  it("a read-only key does not write in a dataset open to every session", () => {
    expect(agenteEscribePorPolitica(["mcp:connect", "mcp:read", "datasets:*:read"], abierta)).toBe(false);
    expect(agenteEscribePorPolitica(["usuario:actuar"], abierta)).toBe(false);
  });

  it("is the rule of the SQL policy: mcp:write plus a policy that opens", () => {
    expect(agenteEscribePorPolitica(["mcp:write"], abierta)).toBe(true);
    expect(agenteEscribePorPolitica(["mcp:write"], { readAccess: "public", writeAccess: "admin" })).toBe(false);
    expect(
      agenteEscribePorPolitica(["mcp:write", "dataset-entry:create"], { readAccess: "public", writeAccess: "admin" })
    ).toBe(true);
    expect(agenteEscribePorPolitica(["mcp:write"], { readAccess: "admin", writeAccess: "authenticated" })).toBe(false);
    expect(agenteEscribePorPolitica(["mcp:write"], null)).toBe(false);
  });
});

// ── Finding 6: the published-or-own helper ──────────────────────────────────

describe("publishedOrOwn", () => {
  const dialecto = new PgDialect();
  const texto = (q: ReturnType<typeof publishedOrOwn>) => dialecto.sqlToQuery(q);

  it("without an id, only what is published", () => {
    expect(texto(publishedOrOwn(undefined)).sql).toBe("status = 'published'");
    expect(texto(publishedOrOwn(null, "e")).sql).toBe("e.status = 'published'");
  });

  it("with an id, also what is owned or created by it, as a bound parameter", () => {
    const q = texto(publishedOrOwn("u'1"));
    expect(q.sql).toBe("(status = 'published' OR owner_id = $1 OR created_by_id = $2)");
    expect(q.params).toEqual(["u'1", "u'1"]);
  });

  it("its Kitsuden QL form says the same", () => {
    expect(publishedOrOwnQl(undefined)).toEqual({ status: { eq: "published" } });
    expect(publishedOrOwnQl("u1")).toEqual({
      OR: [{ status: { eq: "published" } }, { ownerId: { eq: "u1" } }, { createdById: { eq: "u1" } }],
    });
  });
});

// ── M3: the promotion scanner ───────────────────────────────────────────────

describe("promotion scanner", () => {
  it("bypass 1: env used as a whole", () => {
    for (const codigo of [
      "return JSON.stringify(env);",
      "const {STRIPE_SECRET} = env; return STRIPE_SECRET;",
      "const copia = env; return copia.X;",
      "return Object.keys(kitsuden.env);",
      "return env.valueOf();",
    ]) {
      const r = escanearCodigo(codigo);
      expect(r.envVars, codigo).toContain("*");
    }
    expect(escanearCodigo("return JSON.stringify(env);").passed).toBe(false);
  });

  it("bypass 2: template interpolations are code", () => {
    const r = escanearCodigo('return `${await kitsuden.api.delete("/api/admin/users/1")} ${eval("1")} ${env.API_SECRET}`;');
    expect(r.passed).toBe(false);
    expect(r.findings.map((h) => h.rule)).toContain("dynamic_eval");
    expect(r.apiCalls).toEqual([{ method: "DELETE", path: "/api/admin/users/1", line: 1 }]);
    expect(r.envVars).toEqual(["API_SECRET"]);
    // Nested templates, and a `}` of an object inside the interpolation.
    const anidada = escanearCodigo('return `a${ `b${ {x: eval("1")}.x }` }c`;');
    expect(anidada.findings.map((h) => h.rule)).toContain("dynamic_eval");
    expect(escanearCodigo("return `a${").findings.map((h) => h.rule)).toContain("unparsable");
  });

  it("bypass 3: a regex after the `)` of an if is not a division", () => {
    const r = escanearCodigo(`if (1) /'/.test(""); kitsuden.api.delete('/api/x'); // '`);
    expect(r.apiCalls.map((c) => c.path)).toEqual(["/api/x"]);
    // What a lexer cannot settle is reported instead of guessed.
    for (const codigo of [`{}\n/'/.test(""); kitsuden.api.delete('/api/x'); // '`, `let of = 2; of / 2; kitsuden.api.delete("/y"); "`]) {
      expect(escanearCodigo(codigo).findings.map((h) => h.rule), codigo).toContain("ambiguous_slash");
    }
    // Normal arithmetic stays clean.
    expect(escanearCodigo("const a = (1 + 2) / 3; const b = [1][0] / 2; return a / b;").passed).toBe(true);
  });

  it("bypass 4: `this` outside a class is the global object", () => {
    const r = escanearCodigo('return this["__pe" + "dir"]("api", "{}");');
    expect(r.findings.map((h) => `${h.severity}:${h.rule}`)).toContain("high:forbidden_global");
    expect(escanearCodigo("function f() { return this; }").passed).toBe(false);
    expect(escanearCodigo("class A { m() { return this.x; } } return new A().m();").passed).toBe(true);
    expect(escanearCodigo('const k = {}; return k["con" + "structor"];').findings.map((h) => h.rule)).toContain(
      "computed_member"
    );
  });

  it("bypass 5: a percent-escape in a literal API path", () => {
    const r = escanearCodigo('return kitsuden.api.delete("/api/%61dmin/users/1");');
    expect(r.passed).toBe(false);
    expect(r.findings.map((h) => h.rule)).toContain("encoded_api_path");
    expect(r.apiCalls[0]!.path).toBe("/api/admin/users/1");
    expect(escanearCodigo('return kitsuden.api.get("/api/x?q=a%20b");').passed).toBe(true);
    expect(escanearCodigo('return kitsuden.api.get("/api/%zz");').apiCalls[0]!.path).toBeNull();
  });

  it("a line terminator the interpreter honours ends a `//` comment", () => {
    const r = escanearCodigo('// note kitsuden.api.delete("/api/x");');
    expect(r.apiCalls.map((c) => c.path)).toEqual(["/api/x"]);
  });

  it("reasonable code still passes", () => {
    const r = escanearCodigo(
      'const n = env.LIMIT; const r = await kitsuden.api.get(`/api/datasets/${event.id}/entries`); return { env: 1, n, r };'
    );
    expect(r.passed).toBe(true);
    expect(r.envVars).toEqual(["LIMIT"]);
  });

  it("turbo never activates a target with environment variables", () => {
    const verde = {
      modo: "turbo" as const,
      config: { turboAllowed: true },
      diff: { newTarget: false, scopesAdded: [], denialsRemoved: [], hostsAdded: [], limitsIncreased: [] } as never,
      pruebas: { total: 1, passed: 1, failed: 0, errored: 0 },
      escaneoAprobado: true,
      toques: [],
      operacionSensible: false,
      llamadaSinClasificar: false,
    };
    expect(decidirPromocion(verde).ruta).toBe("turbo");
    const conVariables = decidirPromocion({ ...verde, objetivoConVariables: true });
    expect(conVariables.ruta).toBe("proposal");
    expect(conVariables.motivos).toEqual(["target_has_env_vars"]);
  });
});

// ── Finding 11 / L2: CIMD SSRF filter ───────────────────────────────────────

describe("direccionNoPublica", () => {
  it("IPv4-mapped IPv6, in the hex form `new URL` normalizes to", () => {
    expect(new URL("https://[::ffff:127.0.0.1]/x").hostname).toBe("[::ffff:7f00:1]");
    for (const ip of ["::ffff:7f00:1", "::ffff:a9fe:a9fe", "::ffff:127.0.0.1", "0:0:0:0:0:ffff:0a00:0001", "::ffff:c0a8:1"]) {
      expect(direccionNoPublica(ip), ip).toBe(true);
    }
    expect(direccionNoPublica("::ffff:8.8.8.8")).toBe(false);
    expect(direccionNoPublica("::ffff:808:808")).toBe(false);
  });

  it("the forms that tunnel to IPv4, and the old site-local range", () => {
    for (const ip of ["::7f00:1", "2002:7f00:1::", "2001:0:1::", "fec0::1", "64:ff9b::7f00:1", "::", "::1"]) {
      expect(direccionNoPublica(ip), ip).toBe(true);
    }
  });

  it("the private ranges that were already covered, and public addresses", () => {
    for (const ip of ["fc00::1", "fd12::1", "fe80::1", "fe80::1%eth0", "ff02::1", "2001:db8::1", "10.0.0.1", "169.254.169.254", "no es ip"]) {
      expect(direccionNoPublica(ip), ip).toBe(true);
    }
    for (const ip of ["2606:4700:4700::1111", "2a00:1450:4001::1", "8.8.8.8"]) {
      expect(direccionNoPublica(ip), ip).toBe(false);
    }
  });
});

// ── L1 + L3: sandbox ────────────────────────────────────────────────────────

describe("sandbox paths", () => {
  it("a veto cannot be dodged with percent-escapes", () => {
    for (const camino of [
      "/api/%61ctions/1/execute",
      "/api/%66unctions/x",
      "/api/%61uth/sign-in/email",
      "/api/datasets/%2e%2e/actions/1/execute",
      "/api/datasets/%2E%2E/%61ctions/1",
      "/api/x%2f..%2factions/1",
      "/api/%zz",
    ]) {
      expect(caminoDeApiValido(camino), camino).not.toBeNull();
    }
  });

  it("legitimate paths keep working, escapes included", () => {
    for (const camino of ["/api/datasets/1/entries", "/api/blog/caf%C3%A9", "/api/blog/café", "/api/x?q=%61ctions", "/api/x?a=/api/actions"]) {
      expect(caminoDeApiValido(camino), camino).toBeNull();
    }
  });
});

describe("sandbox fetch", () => {
  afterEach(() => {
    delete process.env.KITSUDEN_SANDBOX_ALLOW_INTERNAL_FETCH;
  });

  it("refuses what is not public, whatever name the allow-list holds", async () => {
    for (const host of ["127.0.0.1", "169.254.169.254", "[::1]", "[::ffff:a9fe:a9fe]", "localhost"]) {
      await expect(exigirHostPublico(host), host).rejects.toThrow(/non-public/);
    }
    await expect(exigirHostPublico("8.8.8.8")).resolves.toBeUndefined();
  });

  it("has an explicit opt-in for internal services", async () => {
    process.env.KITSUDEN_SANDBOX_ALLOW_INTERNAL_FETCH = "true";
    await expect(exigirHostPublico("127.0.0.1")).resolves.toBeUndefined();
  });
});

// ── Finding 15: the connection guard ────────────────────────────────────────

describe("verificarConexionRls", () => {
  const conexion = (fila: Record<string, unknown>) => ({ execute: async () => ({ rows: [fila] }) });
  const rota = { execute: async () => Promise.reject(new Error("no")) };

  beforeEach(() => void vi.spyOn(console, "warn").mockImplementation(() => {}));
  afterEach(() => void vi.restoreAllMocks());

  it("BYPASSRLS stops the boot in production, as a superuser does", async () => {
    const bypass = conexion({ usuario: "app", superusuario: false, salta_rls: true });
    await expect(verificarConexionRls(bypass, { estricto: true })).rejects.toThrow(/BYPASSRLS/);
    await expect(verificarConexionRls(bypass, { estricto: false })).resolves.toMatchObject({ saltaRls: true });
  });

  it("a normal role passes", async () => {
    const normal = conexion({ usuario: "app", superusuario: false, salta_rls: false });
    await expect(verificarConexionRls(normal, { estricto: true })).resolves.toMatchObject({ usuario: "app" });
  });

  it("a check that fails is a refusal in production and a warning elsewhere", async () => {
    await expect(verificarConexionRls(rota, { estricto: true })).rejects.toThrow(/Could not verify/);
    await expect(verificarConexionRls(rota, { estricto: false })).resolves.toMatchObject({ usuario: null });
  });
});

// ── Finding 12: the dataset-read bucket ────────────────────────────

describe("globalRateLimit and the dataset-read bucket", () => {
  const from = (ip: string) => ({ ip: { address: ip, family: "IPv4", port: 4000 } });
  const appGlobal = () => {
    const app = new Hono();
    app.use("/api/*", globalRateLimit());
    app.all("/api/*", (c) => c.json({ ok: true }));
    return app;
  };

  beforeEach(() => vaciarReservaEnMemoria());

  it("counts one bucket per client across every dataset, not one per dataset", async () => {
    const app = appGlobal();
    let last = 0;
    for (let i = 0; i < 121; i++) {
      last = (await app.request(`/api/data-sets/ds-${i}/entries`, { method: "GET" }, from("203.0.113.77"))).status;
    }
    expect(last).toBe(429);
    const other = await app.request("/api/data-sets/ds-0/entries", { method: "GET" }, from("203.0.113.78"));
    expect(other.status).toBe(200);
  });

  it("internal calls with no signature stay out of this bucket", async () => {
    const app = appGlobal();
    let last = 0;
    for (let i = 0; i < 125; i++) {
      last = (await app.request(`/api/datasets/ds-${i}/entries`, { method: "GET" }, from("10.0.0.5"))).status;
    }
    expect(last).toBe(200);
  });

  it("a website visitor stays out of it: the site must not lose pages to it", async () => {
    process.env.SITIO_API_CLAVE = "site-key-for-this-test";
    try {
      const app = appGlobal();
      const headers = { "x-kitsuden-sitio": "site-key-for-this-test", "x-kitsuden-cliente": "203.0.113.90" };
      let last = 0;
      for (let i = 0; i < 125; i++) {
        last = (await app.request(`/api/data-sets/ds-${i}/entries`, { method: "GET", headers }, from("172.18.0.1"))).status;
      }
      expect(last).toBe(200);
    } finally {
      delete process.env.SITIO_API_CLAVE;
    }
  });
});

// ── H1: embeddings ──────────────────────────────────────────────────────────

describe("generateEmbedding", () => {
  afterEach(() => {
    delete process.env.EMBEDDINGS_URL;
    vi.unstubAllGlobals();
  });

  it("does not send an unbounded text to the provider", async () => {
    process.env.EMBEDDINGS_URL = "http://embeddings.invalid";
    let enviado = "";
    vi.stubGlobal("fetch", async (_url: string, init: { body: string }) => {
      enviado = (JSON.parse(init.body) as { input: string }).input;
      return new Response(JSON.stringify({ data: [{ embedding: [1, 2, 3] }] }));
    });
    await generateEmbedding("x".repeat(MAX_EMBEDDING_INPUT_CHARS + 5000));
    expect(enviado.length).toBe(MAX_EMBEDDING_INPUT_CHARS);
  });

  it("the mock does not block the process on a huge input", () => {
    const inicio = performance.now();
    const v = generateMockEmbedding("a".repeat(10 * 1024 * 1024));
    // A copy of the old loop took about 11 minutes for this input.
    expect(performance.now() - inicio).toBeLessThan(5000);
    expect(v).toHaveLength(1536);
  });
});

// ── Finding 10: the origin check reads the cookie itself ────────────────────

describe("traeCookieDeSesion", () => {
  it("sees the session cookie, also in its __Secure- form", () => {
    expect(traeCookieDeSesion("better-auth.session_token=abc")).toBe(true);
    expect(traeCookieDeSesion("a=1; __Secure-better-auth.session_token=abc; b=2")).toBe(true);
    expect(traeCookieDeSesion("better-auth.session_data=abc")).toBe(false);
    expect(traeCookieDeSesion("xbetter-auth.session_token=abc")).toBe(false);
    expect(traeCookieDeSesion(undefined)).toBe(false);
  });
});
