/**
 * Exigir verificación de email no deja fuera a quien ya administra
 * ============================================================================
 *
 * Medido en la instalación real antes de activar la verificación obligatoria:
 * un único administrador, con contraseña y `email_verified = false`. El alta
 * inicial nunca verificaba nada. Sin la migración 0041, el despliegue le
 * habría devuelto «Email not verified» con la contraseña correcta.
 *
 * Esta prueba vigila las dos mitades del mismo contrato:
 *   · los administradores que YA existen quedan verificados,
 *   · y NINGUN otro usuario se verifica por la puerta de atrás.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const MIGRACIONES = join(__dirname, "..", "..", "apps", "api", "src", "db", "migrations");

/** SQL sin comentarios de línea, para no contar las menciones del propio texto. */
function sinComentarios(sql: string): string {
  return sql
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n");
}

describe("verificación de administradores existentes", () => {
  const fichero = readdirSync(MIGRACIONES).find((f) =>
    /^\d+_admins_existentes_verificados\.sql$/.test(f)
  );

  it("existe la migración", () => {
    expect(
      fichero,
      "sin ella, activar requireEmailVerification deja fuera al administrador ya creado"
    ).toBeDefined();
  });

  it("solo toca administradores sin verificar", () => {
    const sql = sinComentarios(readFileSync(join(MIGRACIONES, fichero!), "utf-8"));

    expect(sql).toMatch(/UPDATE\s+auth_users/i);
    expect(sql).toMatch(/SET\s+email_verified\s*=\s*true/i);
    expect(sql, "tiene que limitarse a administradores").toMatch(/role\s*=\s*'admin'/i);
    expect(sql, "tiene que ser idempotente").toMatch(/email_verified\s*=\s*false/i);
  });

  it("ninguna otra migración verifica usuarios en bloque", () => {
    /**
     * Marcar como verificado a cualquiera es exactamente lo que la
     * verificación viene a impedir. Si aparece otra migración que lo haga,
     * alguien tiene que haberlo decidido a propósito.
     */
    const otras = readdirSync(MIGRACIONES)
      .filter((f) => f.endsWith(".sql") && f !== fichero)
      .filter((f) =>
        /SET\s+email_verified\s*=\s*true/i.test(
          sinComentarios(readFileSync(join(MIGRACIONES, f), "utf-8"))
        )
      );

    expect(otras).toEqual([]);
  });
});
