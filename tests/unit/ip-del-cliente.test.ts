/**
 * El limitador identifica al cliente por una IP que el cliente NO puede
 * elegir. Antes usaba `Authorization` (32 primeros caracteres) o el
 * `x-forwarded-for` entero: cambiando cualquiera de los dos en cada petición,
 * cada una iba a un cubo nuevo y no había límite.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { esPrivada, ipDelCliente, RANGOS_DE_PROXY } from "../../apps/api/src/lib/ip-del-cliente";

const ctx = (cabeceras: Record<string, string>, socket?: string) =>
  ({
    env: socket ? { ip: { address: socket, family: "IPv4", port: 1234 } } : undefined,
    req: { header: (n: string) => cabeceras[n.toLowerCase()] },
  }) as never;

describe("ipDelCliente", () => {
  it("sin proxy delante (socket público), ignora lo que el cliente escriba en x-forwarded-for", () => {
    expect(ipDelCliente(ctx({ "x-forwarded-for": "1.1.1.1" }, "203.0.113.9"))).toBe("203.0.113.9");
    expect(ipDelCliente(ctx({ "x-forwarded-for": "9.9.9.9, 8.8.8.8" }, "203.0.113.9"))).toBe(
      "203.0.113.9"
    );
  });

  it("detrás de Caddy (un salto): la IP que añadió el proxy", () => {
    expect(ipDelCliente(ctx({ "x-forwarded-for": "203.0.113.7" }, "172.18.0.5"))).toBe(
      "203.0.113.7"
    );
  });

  it("detrás de Caddy → nginx (dos saltos): la primera pública empezando por la derecha", () => {
    expect(ipDelCliente(ctx({ "x-forwarded-for": "203.0.113.7, 172.18.0.4" }, "172.18.0.6"))).toBe(
      "203.0.113.7"
    );
  });

  it("lo que el cliente pone delante no cambia su cubo", () => {
    const a = ipDelCliente(
      ctx({ "x-forwarded-for": "1.2.3.4, 203.0.113.7, 172.18.0.4" }, "172.18.0.6")
    );
    const b = ipDelCliente(
      ctx({ "x-forwarded-for": "5.6.7.8, 203.0.113.7, 172.18.0.4" }, "172.18.0.6")
    );
    expect(a).toBe("203.0.113.7");
    expect(b).toBe(a);
  });

  it("basura en la cabecera no cuenta como IP", () => {
    expect(ipDelCliente(ctx({ "x-forwarded-for": "<script>, 203.0.113.7" }, "10.0.0.2"))).toBe(
      "203.0.113.7"
    );
  });

  it("todo interno (la propia máquina): la entrada más a la derecha o el socket", () => {
    expect(ipDelCliente(ctx({}, "172.17.0.1"))).toBe("172.17.0.1");
    expect(ipDelCliente(ctx({}))).toBe("unknown");
  });

  it("normaliza IPv4 mapeada en IPv6 y puertos", () => {
    expect(ipDelCliente(ctx({}, "::ffff:203.0.113.9"))).toBe("203.0.113.9");
    expect(ipDelCliente(ctx({ "x-forwarded-for": "203.0.113.7:5555" }, "10.0.0.3"))).toBe(
      "203.0.113.7"
    );
  });

  it("clasifica bien los rangos privados", () => {
    for (const ip of [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "::1",
      "fd00::1",
      "fe80::1",
    ]) {
      expect(esPrivada(ip), ip).toBe(true);
    }
    for (const ip of ["172.32.0.1", "8.8.8.8", "203.0.113.7", "2001:4860:4860::8888"]) {
      expect(esPrivada(ip), ip).toBe(false);
    }
    expect(RANGOS_DE_PROXY).toContain("172.16.0.0/12");
  });
});

describe("rate-limiter.ts", () => {
  const fuente = readFileSync(resolve(__dirname, "../../apps/api/src/lib/rate-limiter.ts"), "utf8");

  it("no saca el identificador de Authorization ni del x-forwarded-for crudo", () => {
    const generateKey = fuente.slice(
      fuente.indexOf("function generateKey"),
      fuente.indexOf("export async function checkRateLimit")
    );
    expect(generateKey).not.toMatch(/header\("authorization"\)/i);
    expect(generateKey).not.toMatch(/header\("x-forwarded-for"\)/);
    expect(generateKey).toContain("ipDelCliente(c)");
  });

  it("los límites de login apuntan a los caminos reales de better-auth", () => {
    expect(fuente).toContain('"/api/auth/sign-in/email"');
    expect(fuente).toContain('"/api/auth/sign-up/email"');
    expect(fuente).toContain('"/api/auth/request-password-reset"');
    expect(fuente).not.toContain('"/api/auth/login"');
  });

  it("better-auth recibe los proxies de confianza (si no, no limita con dos saltos)", () => {
    const auth = readFileSync(resolve(__dirname, "../../apps/api/src/lib/auth.ts"), "utf8");
    expect(auth).toMatch(/trustedProxies:\s*RANGOS_DE_PROXY/);
  });

  it("no hay un segundo rateLimit() por ruta que cuente cada petición dos veces", () => {
    const cf = readFileSync(
      resolve(__dirname, "../../apps/api/src/lib/critical-features.ts"),
      "utf8"
    );
    expect(cf).not.toMatch(/app\.use\([^)]*rateLimit\(\{/);
  });
});

describe("límites de rutas anónimas que mandan correo", () => {
  it("el enlace mágico de miembros tiene su propio límite", async () => {
    const { RATE_LIMIT_CONFIGS } = await import("../../apps/api/src/lib/rate-limiter");
    expect(RATE_LIMIT_CONFIGS["/api/members/signin"]?.limit).toBeLessThanOrEqual(5);
    expect(RATE_LIMIT_CONFIGS["/api/auth/sign-in/email"]?.limit).toBeLessThanOrEqual(10);
  });
});
