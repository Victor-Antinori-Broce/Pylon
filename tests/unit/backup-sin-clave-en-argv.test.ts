/**
 * `pg_dump`/`pg_restore` sin la contraseña en la línea de órdenes
 * (auditoría F77): se veía con `ps` mientras duraba el volcado.
 *
 * Solo se importa `conexionDePg`: la entrada del script va tras
 * `import.meta.main`, y aun así se le da `--list` y un directorio vacío por
 * si acaso. No se lanza ningún volcado ni se conecta a nada.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

type Conexion = (url: string) => { args: string[]; env: Record<string, string> };
let conexionDePg: Conexion;

beforeAll(async () => {
  const argv = process.argv;
  const dir = process.env.BACKUP_DIR;
  process.argv = [argv[0]!, argv[1]!, "--list"];
  process.env.BACKUP_DIR = mkdtempSync(join(tmpdir(), "backup-prueba-"));
  try {
    ({ conexionDePg } = (await import("../../apps/api/scripts/backup")) as { conexionDePg: Conexion });
  } finally {
    process.argv = argv;
    if (dir === undefined) delete process.env.BACKUP_DIR;
    else process.env.BACKUP_DIR = dir;
  }
});

describe("conexionDePg", () => {
  it("host, puerto, usuario y base como opciones; la contraseña solo en el entorno", () => {
    const { args, env } = conexionDePg("postgresql://kitsuden:s3cr%40to@db.interna:5433/kitsuden_x");
    expect(args).toEqual(["--host", "db.interna", "--port", "5433", "--username", "kitsuden", "--dbname", "kitsuden_x"]);
    expect(env).toEqual({ PGPASSWORD: "s3cr@to" });
    expect(args.join(" ")).not.toContain("s3cr");
  });

  it("los parámetros de la URL van en la cadena de conexión, nunca la contraseña", () => {
    const { args, env } = conexionDePg("postgres://u:clave@h/base?sslmode=require&password=otra");
    expect(args).toEqual(["--host", "h", "--username", "u", "--dbname", "dbname='base' sslmode='require'"]);
    expect(env.PGPASSWORD).toBe("clave");
    expect(args.join(" ")).not.toMatch(/clave|otra/);
  });

  it("siempre lleva --dbname (sin él pg_restore escribe SQL en vez de restaurar)", () => {
    expect(conexionDePg("postgresql://ana@[::1]").args).toEqual(["--host", "::1", "--username", "ana", "--dbname", "ana"]);
    expect(conexionDePg("postgresql://ana@[::1]").env).toEqual({});
  });

  it("rechaza lo que no es una URL de Postgres", () => {
    expect(() => conexionDePg("lite")).toThrow();
    expect(() => conexionDePg("mysql://u:p@h/b")).toThrow();
  });
});
