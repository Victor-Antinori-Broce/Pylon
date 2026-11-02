/**
 * La API escucha en una dirección configurable (`HOST`), por defecto 0.0.0.0.
 *
 * Sin `hostname` en el servidor de bun, en Windows solo respondía en
 * `localhost` (::1) y `127.0.0.1` daba conexión rechazada (2026-10-18).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { hostDeEscucha } from "../../apps/api/src/lib/host-de-escucha";

describe("hostDeEscucha", () => {
  it("por defecto todas las interfaces IPv4", () => {
    expect(hostDeEscucha({})).toBe("0.0.0.0");
    expect(hostDeEscucha({ HOST: "  " })).toBe("0.0.0.0");
  });

  it("HOST manda", () => {
    expect(hostDeEscucha({ HOST: "127.0.0.1" })).toBe("127.0.0.1");
    expect(hostDeEscucha({ HOST: "::" })).toBe("::");
  });

  it("el servidor de la API lo usa (y no solo el puerto)", () => {
    const index = readFileSync(resolve(__dirname, "../../apps/api/src/index.ts"), "utf8");
    expect(index).toMatch(/const hostname = hostDeEscucha\(\);/);
    expect(index).toMatch(/export default \{\s*port,\s*hostname,/);
  });

  it("la imagen fija HOST=0.0.0.0 y el compose sigue publicando solo en 127.0.0.1", () => {
    const docker = readFileSync(resolve(__dirname, "../../docker/Dockerfile.prod"), "utf8");
    expect(docker).toMatch(/^ENV HOST=0\.0\.0\.0\s*$/m);
    const compose = readFileSync(resolve(__dirname, "../../docker-compose.yml"), "utf8");
    expect(compose).toContain('"${BIND_ADDRESS:-127.0.0.1}:${API_PORT:-3000}:3000"');
  });
});
