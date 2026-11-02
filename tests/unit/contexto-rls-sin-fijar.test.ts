/**
 * «Sin contexto» tiene que incluir «nunca se fijó»
 * ============================================================================
 *
 * Las políticas RLS de este proyecto fallan ABIERTAS cuando no hay usuario:
 * las migraciones, los seeds, los workers y los cargadores corren sin nadie
 * autenticado y tienen que seguir funcionando. La condición que lo permitía
 * era esta:
 *
 *     current_setting('app.current_user_id', true) = ''
 *
 * Y ahí estaba el agujero: en una conexión donde NADIE ha fijado la variable,
 * `current_setting(..., true)` no devuelve `''`, devuelve NULL. `NULL = ''` no
 * es falso, es NULL — y una política que da NULL no deja pasar la fila.
 *
 * Como las conexiones salen de un pool, el resultado dependía de por dónde
 * hubiera pasado antes cada conexión:
 *
 *   · conexión recién abierta      → NULL → cero filas
 *   · conexión ya usada por una
 *     ruta con contexto            → ''   → todas las filas
 *
 * El síntoma real: el creador de equipo de un juego salía con cero opciones
 * —los 1188 datos existían y eran públicos— y al recargar salía bien. El mismo
 * GET anónimo devolvía dos cosas distintas, sin un error en ningún log.
 *
 * ── LA OTRA MITAD: EL CONTEXTO NO PUEDE SER DE SESIÓN ──────────────────────
 *
 * `set_config(clave, valor, is_local)`. Con `is_local = false` el valor se
 * queda en la conexión después de la petición, así que la siguiente que la
 * reutilice y no fije contexto hereda el usuario de la anterior. Eso no es una
 * rareza de rendimiento: es una fuga de identidad entre peticiones.
 *
 * ── Y POR QUÉ SE BORRAN LAS POLÍTICAS ANTES DE CREARLAS ────────────────────
 *
 * El aplicador de RLS se traga los errores «already exists» (reaplicar es lo
 * normal). Sin `DROP POLICY IF EXISTS` delante, corregir este fichero no
 * cambiaba NADA en una base que ya lo tuviera aplicado: el arreglo se
 * "desplegaba" y el fallo seguía ahí.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = join(__dirname, "..", "..");
const lee = (...partes: string[]) => readFileSync(join(RAIZ, ...partes), "utf-8");

const POLITICAS = lee("apps", "api", "src", "db", "rls-policies.sql");
const PROPIAS = lee("apps", "api", "src", "db", "rls-owned-tables.sql");
const MEDIO = lee("apps", "api", "src", "middleware", "transactional-rls.ts");
const ENGINE = lee("packages", "engine", "src", "rls-peticion.ts");

/**
 * Cada `CREATE POLICY <nombre> ON <tabla>` del fichero. Las de
 * `rls-owned-tables.sql` se generan con `format(... %I ...)` dentro de un
 * bucle, así que ahí el nombre y la tabla son literalmente `%I`.
 */
const politicasDe = (sql: string) =>
  [...sql.matchAll(/CREATE POLICY\s+(%I|\w+)\s+ON\s+(%I|\w+)/gi)].map((m) => ({
    nombre: m[1],
    tabla: m[2],
  }));

describe("una conexión sin contexto se trata como anónima, no como intrusa", () => {
  it("toda salida de emergencia por contexto vacío contempla el NULL", () => {
    for (const sql of [POLITICAS, PROPIAS]) {
      // Cada `= ''` sobre el id de usuario tiene su `IS NULL` a la vista
      const trozos = sql.split(/current_setting\('app\.current_user_id', true\) = ''/);
      for (let i = 1; i < trozos.length; i++) {
        const alrededor = trozos[i - 1].slice(-220) + trozos[i].slice(0, 220);
        expect(alrededor, `un «= ''» sin comprobar NULL cerca:\n${alrededor}`).toContain(
          "current_setting('app.current_user_id', true) IS NULL"
        );
      }
    }
  });

  it("la función que dice si el RLS está activo no se queda en NULL", () => {
    expect(POLITICAS).toMatch(
      /COALESCE\(current_setting\('app\.current_user_id', true\), ''\) != ''/
    );
  });
});

describe("el fichero de políticas se puede corregir", () => {
  it("cada política se borra antes de crearse", () => {
    for (const sql of [POLITICAS, PROPIAS]) {
      for (const { nombre, tabla } of politicasDe(sql)) {
        const borrado = new RegExp(
          `DROP POLICY IF EXISTS\\s+(${nombre}|%I)\\s+ON\\s+(${tabla}|%I)`,
          "i"
        );
        expect(sql, `${nombre} se crea sin borrarse antes`).toMatch(borrado);
      }
    }
  });

  it("hay políticas de verdad que comprobar (si no, lo de arriba no prueba nada)", () => {
    expect(politicasDe(POLITICAS).length).toBeGreaterThan(0);
    expect(politicasDe(PROPIAS).length).toBeGreaterThan(0);
  });
});

describe("el contexto RLS no sobrevive a la petición", () => {
  it("dentro de la transacción se fija LOCAL", () => {
    // `setRLSContext` delega en la pieza común del engine (la misma que usan
    // los kons desde 2026-10-23), y es ahí donde se fija el contexto.
    const cuerpo = MEDIO.slice(MEDIO.indexOf("export async function setRLSContext"));
    expect(cuerpo.slice(0, cuerpo.indexOf("\n}"))).toContain("fijarContextoRls(tx, user)");
    const fijar = ENGINE.slice(ENGINE.indexOf("async function fijar("));
    const hasta = fijar.slice(0, fijar.indexOf("\n}"));
    expect(hasta).toMatch(/set_config\('app\.current_user_id', \$\{userId\}, true\)/);
    expect(hasta).toMatch(/set_config\('app\.current_user_role', \$\{userRole\}, true\)/);
    expect(hasta).not.toContain(", false)");
  });

  it("sin transacción, se limpia pase lo que pase", () => {
    const cuerpo = MEDIO.slice(MEDIO.indexOf("export function withRLSContextOnly"));
    expect(cuerpo).toContain("finally");
    expect(cuerpo.slice(cuerpo.indexOf("finally"))).toContain("app.current_user_id");
  });
});
