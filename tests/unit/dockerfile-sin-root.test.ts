/**
 * docker/Dockerfile.prod (auditoría 2026-10-18):
 *
 *   · un kon que no compila tiene que PARAR el build — antes un
 *     `|| echo "Warning: ..."` lo dejaba en un aviso y así pasó kon-broadcast;
 *   · la API no corre como root (`USER bun`, uid 1000) y es dueña de las
 *     carpetas en las que escribe.
 *
 * La comprobación de verdad es construir la imagen y mirar `id` (ver el
 * informe de la auditoría); esto evita que se deshaga en silencio.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../..");
const DOCKERFILE = readFileSync(resolve(ROOT, "docker/Dockerfile.prod"), "utf8");
const COMPOSE = readFileSync(resolve(ROOT, "docker-compose.yml"), "utf8");

/** Las instrucciones RUN, con sus continuaciones `\` unidas y sin comentarios. */
function instruccionesRun(texto: string): string[] {
  return texto
    .split(/\r?\n/)
    .filter((l) => !l.trimStart().startsWith("#"))
    .join("\n")
    .replace(/\\\r?\n/g, " ")
    .split("\n")
    .filter((l) => /^\s*RUN\s/.test(l));
}

/** El texto de una etapa `FROM … AS <nombre>` hasta la siguiente. */
function etapa(nombre: string): string {
  const inicio = DOCKERFILE.search(new RegExp(`^FROM .+ AS ${nombre}\\s*$`, "m"));
  expect(inicio).toBeGreaterThan(-1);
  const resto = DOCKERFILE.slice(inicio + 1);
  const fin = resto.search(/^FROM /m);
  return fin === -1 ? resto : resto.slice(0, fin);
}

describe("Dockerfile.prod: los fallos no se maquillan", () => {
  it("el build de los kons no termina en `|| echo` ni `|| true`", () => {
    const kons = instruccionesRun(DOCKERFILE).filter((l) => l.includes("@kitsuden/kon-*"));
    expect(kons.length).toBe(1);
    expect(kons[0]).not.toMatch(/\|\|/);
  });

  it("ningún RUN de build o migración se traga su error con `|| echo`", () => {
    const tragados = instruccionesRun(DOCKERFILE).filter((l) => /\|\|\s*echo/.test(l));
    expect(tragados).toEqual([]);
  });
});

describe("Dockerfile.prod: la API sin root", () => {
  const api = etapa("api");

  it("la etapa api fija USER bun antes del CMD", () => {
    const user = api.search(/^USER bun\s*$/m);
    const cmd = api.search(/^CMD /m);
    expect(user).toBeGreaterThan(-1);
    expect(user).toBeLessThan(cmd);
  });

  it("las carpetas donde escribe son de bun", () => {
    const chown = instruccionesRun(api).find((l) => l.includes("chown"));
    expect(chown).toBeDefined();
    for (const carpeta of ["data", "uploads", "logs", "apps/api/.kitsuden"]) {
      expect(chown).toContain(carpeta);
    }
    expect(chown).toMatch(/chown -R bun:bun/);
  });

  it("la copia de seguridad (misma imagen) sigue corriendo como root a propósito", () => {
    const backup = COMPOSE.slice(COMPOSE.indexOf("kitsuden_backup:"));
    const bloque = backup.slice(0, backup.search(/\n {2}\w[\w-]*:\n|\nvolumes:/));
    expect(bloque).toMatch(/user: "0:0"/);
  });
});
