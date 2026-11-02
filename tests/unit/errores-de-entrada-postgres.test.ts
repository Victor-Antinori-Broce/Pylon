/**
 * Una entrada que Postgres no admite NO es un 500
 *
 * Schemathesis (2026-10-26) encontró una docena de 500 que eran esto: texto
 * con U+0000 (Postgres no lo guarda ni en `text` ni en `jsonb`), un `0` donde
 * va un uuid, un número fuera de rango, un duplicado. Dos capas lo cierran:
 *
 *   · el SDK rechaza el U+0000 en la entrada, antes del handler;
 *   · `toErrorEnvelope` traduce el SQLSTATE de un error que se escapa.
 */
import { describe, expect, it } from "vitest";

import {
  errorDeEntradaDePostgres,
  sqlstateDe,
  toErrorEnvelope,
} from "../../packages/engine/src/errors";
import { caminoConCaracterNulo } from "../../packages/engine/src/operaciones";

/** Lo que lanza Drizzle: «Failed query: …» con el error de `pg` en `cause`. */
function deDrizzle(code: string): Error {
  const pg = Object.assign(new Error('invalid input syntax for type uuid: "0"'), { code });
  return Object.assign(
    new Error('Failed query: select "slug" from "block_pages" where "id" = $1'),
    { cause: pg }
  );
}

describe("traducir errores de Postgres", () => {
  it("encuentra el SQLSTATE dentro de la cadena de cause", () => {
    expect(sqlstateDe(deDrizzle("22P02"))).toBe("22P02");
    expect(sqlstateDe(new Error("otra cosa"))).toBeNull();
  });

  it("clase 22 → 400; duplicado o referencia rota → 409; obligatorio → 422", () => {
    expect(errorDeEntradaDePostgres(deDrizzle("22P02"))?.status).toBe(400); // uuid inválido
    expect(errorDeEntradaDePostgres(deDrizzle("22021"))?.status).toBe(400); // U+0000 en text
    expect(errorDeEntradaDePostgres(deDrizzle("22003"))?.status).toBe(400); // fuera de rango
    expect(errorDeEntradaDePostgres(deDrizzle("23505"))?.status).toBe(409);
    expect(errorDeEntradaDePostgres(deDrizzle("23503"))?.status).toBe(409);
    expect(errorDeEntradaDePostgres(deDrizzle("23502"))?.status).toBe(422);
    // Lo que sí es del servidor (conexión, permisos) sigue sin traducir.
    expect(errorDeEntradaDePostgres(deDrizzle("08006"))).toBeNull();
    expect(errorDeEntradaDePostgres(deDrizzle("42501"))).toBeNull();
  });

  it("el envelope no enseña la consulta", () => {
    const { status, envelope } = toErrorEnvelope(deDrizzle("22P02"), { isDev: true });
    expect(status).toBe(400);
    expect(envelope.error.code).toBe("BAD_REQUEST");
    expect(JSON.stringify(envelope)).not.toMatch(/Failed query|block_pages|select/i);
  });

  it("un error cualquiera sigue siendo 500", () => {
    expect(toErrorEnvelope(new Error("boom"), {}).status).toBe(500);
  });
});

describe("el carácter nulo se rechaza en la entrada", () => {
  it("lo encuentra en valores y en claves, a cualquier profundidad", () => {
    expect(caminoConCaracterNulo({ title: "ok" })).toBeNull();
    expect(caminoConCaracterNulo({ title: "a\u0000b" })).toBe("title");
    expect(caminoConCaracterNulo({ data: { lista: ["x", "y\u0000"] } })).toBe("data.lista.1");
    expect(caminoConCaracterNulo({ data: { "cla\u0000ve": 1 } })).toBe("data.cla\u0000ve");
    expect(caminoConCaracterNulo("suelto\u0000")).toBe("_");
    expect(caminoConCaracterNulo(null)).toBeNull();
  });
});
