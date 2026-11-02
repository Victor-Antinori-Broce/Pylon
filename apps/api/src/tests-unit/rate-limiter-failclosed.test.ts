/**
 * Rate limiter — comportamiento cuando Valkey no está
 * ============================================================================
 *
 * El limitador FALLA ABIERTO por defecto: si Valkey cae, se sirve igual. Es lo
 * correcto para el 99% de las rutas — servir de más es mejor que no servir.
 *
 * Pero para un endpoint que manda correo a direcciones sin verificar, fallar
 * abierto significa quedarse sin ningún freno justo cuando no puedes contar:
 * un atacante manda correos ilimitados desde tu dominio mientras Redis está
 * caído. Esas rutas marcan `failClosed: true`.
 *
 * Se comprueba sobre el FUENTE en vez de ejecutar el middleware porque
 * `getValkeyClient` abre una conexión real y `mock.module` de bun se filtra a
 * todo el proceso (ver test-suite-caveats). El objetivo aquí es que la rama
 * fail-closed exista y esté cableada en los dos puntos de fallo.
 */

import { describe, expect, test } from "bun:test";

// `import.meta.dir` y no `new URL(...).pathname`: en Windows este último
// devuelve "/C:/..." y el open falla. Este archivo solo corre bajo bun test.
const SOURCE = await Bun.file(`${import.meta.dir}/../lib/rate-limiter.ts`).text();
const LOADER = await Bun.file(`${import.meta.dir}/../lib/module-loader.ts`).text();

describe("rate limiter: fail-closed", () => {
  test("RateLimitConfig expone la opción failClosed", () => {
    expect(SOURCE).toContain("failClosed?: boolean");
  });

  test("por defecto sigue fallando ABIERTO", () => {
    // Cambiar esto tumbaría la API entera ante un hipo de Valkey.
    const defaults = SOURCE.match(/const DEFAULT_CONFIG: RateLimitConfig = \{[^}]+\}/s)?.[0] ?? "";
    expect(defaults).not.toContain("failClosed");
  });

  test("cubre los DOS caminos de fallo: sin cliente y excepción", () => {
    // Hay dos formas de quedarse sin contador —que Valkey no exista y que la
    // operación reviente— y ambas deben respetar failClosed. Cubrir solo una
    // deja el agujero abierto justo en el caso raro.
    const fn = SOURCE.match(/export async function checkRateLimit[\s\S]*?\n\}\n/)?.[0] ?? "";
    const branches = fn.match(/if \(config\.failClosed\) \{\s*return contarEnMemoria\(/g) ?? [];
    expect(branches.length).toBe(2);
  });

  test("getValkeyClient() va DENTRO de un try (lanza cuando Valkey está caído)", () => {
    // Fuera del try, la excepción llegaba al catch del middleware —que deja
    // pasar— y las rutas failClosed fallaban abiertas. El comportamiento real
    // se prueba en tests/unit/rate-limiter-valkey-caido.test.ts (vitest).
    const fn = SOURCE.match(/export async function checkRateLimit[\s\S]*?\n\}\n/)?.[0] ?? "";
    expect(fn).toMatch(/try \{\s*valkey = await getValkeyClient\(\);/);
    expect(fn).not.toMatch(/const valkey = await getValkeyClient\(\);/);
  });

  test("sin contador posible, la respuesta es 503 con Retry-After (no 429 ni 500)", () => {
    const fn = SOURCE.match(/function sinContador[\s\S]*?\n\}/)?.[0] ?? "";
    expect(fn).toContain("Retry-After");
    expect(fn).toContain("503");
  });
});

describe("rate limits declarados por kons", () => {
  test("el loader monta los límites del kon ANTES del router", () => {
    // En Hono el middleware solo corre si se registró antes que la ruta que
    // protege. Invertir el orden deja los límites decorativos.
    const applyAt = LOADER.indexOf("applyKonRateLimits(app, konDef, finalMountPath)");
    const routeAt = LOADER.indexOf("app.route(finalMountPath, router)");

    expect(applyAt).toBeGreaterThan(-1);
    expect(routeAt).toBeGreaterThan(-1);
    expect(applyAt).toBeLessThan(routeAt);
  });

  test("las rutas del kon se resuelven contra su mountPath", () => {
    // Un kon declara rutas relativas: si el loader las usara tal cual, el
    // límite quedaría colgando en la raíz y no protegería nada.
    const fn = LOADER.match(/export function applyKonRateLimits[\s\S]{0,900}/)?.[0] ?? "";
    expect(fn).toContain("mountPath.replace");
    expect(fn).toContain("`${base}");
  });

  test("propaga failClosed del kon al middleware", () => {
    const fn = LOADER.match(/export function applyKonRateLimits[\s\S]{0,900}/)?.[0] ?? "";
    expect(fn).toContain("failClosed: rule.failClosed");
  });
});
