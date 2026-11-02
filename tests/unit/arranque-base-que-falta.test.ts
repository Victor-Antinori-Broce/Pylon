/**
 * `docker/start-with-check.sh`: una base que falta NO es un usuario que falla
 * (2026-10-19).
 *
 * La comprobación de credenciales se hacía contra la base de la aplicación.
 * Si lo que faltaba era la BASE (volumen nuevo con otro POSTGRES_DB, o una URL
 * que apunta a una base que nadie ha creado), Postgres respondía
 * `database "..." does not exist` y el script decía que no aceptaba al
 * usuario, con instrucciones para recrear el rol — que no era el problema.
 *
 * Aquí se ejecuta el script real con `psql`, `pg_isready` y `bun` de mentira
 * en el PATH. Corta solo en el paso [4/6] (`cd /app/apps/api` no existe), así
 * que lo que importa es lo que dice hasta ahí.
 */
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const SCRIPT = resolve(__dirname, "../../docker/start-with-check.sh");
const haySh = spawnSync("sh", ["-c", "exit 0"]).status === 0;

let dir: string;

function stub(nombre: string, cuerpo: string) {
  const ruta = join(dir, nombre);
  writeFileSync(ruta, `#!/bin/sh\n${cuerpo}\n`);
  chmodSync(ruta, 0o755);
}

beforeAll(() => {
  if (!haySh) return;
  dir = mkdtempSync(join(tmpdir(), "kitsuden-arranque-"));
  stub("bun", "exit 0");
  stub("pg_isready", "exit 0");
  // ESCENARIO=sin-base: el usuario entra en `postgres`, pero `appdb` no existe.
  // ESCENARIO=sin-usuario: la contraseña no vale en ninguna base.
  // CREAR=no: el CREATE DATABASE falla por permisos.
  stub(
    "psql",
    `todo="$*"
if [ "$ESCENARIO" = "sin-usuario" ]; then
  echo 'psql: error: FATAL:  password authentication failed for user "kit"' >&2; exit 2
fi
case "$todo" in
  *"CREATE DATABASE"*)
    if [ "$CREAR" = "no" ]; then echo 'ERROR:  permission denied to create database' >&2; exit 1; fi
    echo CREATE DATABASE; exit 0 ;;
  *pg_database*) exit 0 ;;
  */postgres*) echo 1; exit 0 ;;
  *) echo 'psql: error: FATAL:  database "appdb" does not exist' >&2; exit 2 ;;
esac`
  );
});

afterAll(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

function arrancar(env: Record<string, string>) {
  const r = spawnSync("sh", [SCRIPT], {
    env: {
      ...process.env,
      PATH: `${dir}${delimiter}${process.env.PATH}`,
      DATABASE_URL: "postgresql://kit:xx@db:5432/appdb",
      DATABASE_ADMIN_URL: "",
      ...env,
    },
    encoding: "utf8",
    timeout: 30_000,
  });
  return { codigo: r.status, salida: `${r.stdout}${r.stderr}` };
}

describe.skipIf(!haySh)("start-with-check.sh: base vs usuario", () => {
  it("si falta la base, NO culpa al usuario y pasa a crearla", () => {
    const { salida } = arrancar({ ESCENARIO: "sin-base" });
    expect(salida).not.toContain("no acepta al usuario");
    expect(salida).toContain("OK - autenticacion correcta (kit)");
    expect(salida).toContain("Creating database...");
  });

  it("si falta la base y no se puede crear, lo dice de la BASE y para", () => {
    const { codigo, salida } = arrancar({ ESCENARIO: "sin-base", CREAR: "no" });
    expect(codigo).toBe(1);
    expect(salida).toContain("la base de datos 'appdb' no existe");
    expect(salida).not.toContain("no acepta al usuario");
  });

  it("si la contraseña no vale, sigue culpando al usuario", () => {
    const { codigo, salida } = arrancar({ ESCENARIO: "sin-usuario" });
    expect(codigo).toBe(1);
    expect(salida).toContain("no acepta al usuario 'kit'");
  });
});
