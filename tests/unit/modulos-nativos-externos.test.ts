/**
 * Los módulos nativos no se empaquetan
 * ============================================================================
 *
 * `sharp` y `@node-rs/argon2` no son JavaScript. Cada uno elige **en tiempo de
 * ejecución** un paquete distinto según la plataforma —`@img/sharp-linuxmusl-x64`,
 * `@node-rs/argon2-linux-x64-musl`— y ese `require` se resuelve desde la
 * carpeta del fichero que lo ejecuta.
 *
 * Al empaquetarlos, su código deja de vivir en
 * `node_modules/.pnpm/<paquete>/node_modules/`, que es donde tienen sus
 * variantes al lado, y pasa a vivir dentro de `apps/api/dist/index.js`. Desde
 * ahí la búsqueda sube por `apps/api/node_modules`, `apps/` y `/app/node_modules`
 * y no encuentra ninguna:
 *
 *     error: Could not load the "sharp" module using the linuxmusl-x64 runtime
 *     error: Failed to load native binding
 *
 * Los binarios **estaban en la imagen**. Lo que se rompió fue el camino.
 *
 * ── POR QUÉ ESTA PRUEBA EXISTE ─────────────────────────────────────────────
 *
 * Porque el fallo no aparece al construir. `bun build` empaqueta tan contento,
 * la imagen se genera, y el contenedor muere al arrancar. Cada iteración costó
 * un ciclo completo de build para descubrir el siguiente módulo nativo.
 *
 * Y porque razonar sobre esto sale mal: al arreglar `sharp` se dejó `argon2`
 * empaquetado a propósito, con el argumento de que no estaba en la raíz de
 * `node_modules` y externalizarlo lo dejaría sin resolver. La primera mitad era
 * cierta; la conclusión, falsa. La respuesta no era dejarlo dentro —eso no
 * funciona nunca para un módulo nativo— sino copiar también
 * `apps/api/node_modules` a la imagen de runtime, que es lo que faltaba.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = join(__dirname, "..", "..");

/**
 * Paquetes que traen binario por plataforma.
 *
 * La lista es explícita a propósito: detectarlos automáticamente exigiría
 * inspeccionar `node_modules`, que no está en CI de forma fiable. Si añades una
 * dependencia nativa, añádela aquí — y si no lo haces, el fallo aparecerá al
 * arrancar el contenedor, no aquí.
 */
const NATIVOS = ["sharp", "@node-rs/argon2"];

function scriptDeBuild(): string {
  const pkg = JSON.parse(readFileSync(join(RAIZ, "apps", "api", "package.json"), "utf-8"));
  return pkg.scripts?.build ?? "";
}

describe("el bundle de la API no se traga los modulos nativos", () => {
  const build = scriptDeBuild();

  it("el script de build existe y usa bun build", () => {
    expect(build).toContain("bun build");
  });

  for (const paquete of NATIVOS) {
    it(`${paquete} va --external`, () => {
      expect(
        build.includes(`--external ${paquete}`),
        `apps/api no marca '${paquete}' como --external, así que bun lo mete ` +
          `dentro de dist/index.js. Es un módulo nativo: al empaquetarlo pierde ` +
          `el camino hacia su binario de plataforma y el contenedor muere al ` +
          `arrancar con "Failed to load native binding" — aunque el binario esté ` +
          `en la imagen.\nScript actual: ${build}`
      ).toBe(true);
    });
  }

  it("la imagen de runtime copia apps/api/node_modules", () => {
    /**
     * `--external` solo es media solución: saca el módulo del bundle, pero hay
     * que darle dónde resolverse. El bundle vive en `apps/api/dist/`, así que
     * la búsqueda empieza por `apps/api/node_modules` — que no se copiaba.
     */
    const dockerfile = readFileSync(join(RAIZ, "docker", "Dockerfile.prod"), "utf-8");

    expect(
      /COPY\s+--from=builder\s+\/app\/apps\/api\/node_modules/.test(dockerfile),
      `docker/Dockerfile.prod ya no copia /app/apps/api/node_modules a la etapa ` +
        `de runtime. Sin eso, los módulos marcados --external no tienen dónde ` +
        `resolverse desde apps/api/dist/ y la API muere al arrancar.`
    ).toBe(true);
  });
});
