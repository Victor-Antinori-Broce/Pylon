#!/usr/bin/env bun
/**
 * Copias de seguridad, con verificación
 * ============================================================================
 *
 * POR QUÉ EXISTE
 *
 * No había ninguna. Ni `pg_dump`, ni retención, ni un procedimiento de
 * restauración escrito. Para un producto que guarda datos de terceros eso no
 * es una carencia de funcionalidad: es el riesgo que se lleva la empresa por
 * delante.
 *
 * LA PARTE QUE CASI NADIE HACE
 *
 * Cada volcado se VERIFICA nada más escribirlo, leyendo su índice con
 * `pg_restore --list`. Un backup que no se ha leído nunca no es un backup: es
 * un fichero. El día que se descubre que está corrupto es, por definición, el
 * peor día posible.
 *
 * FORMATO
 *
 * `-Fc` (custom): comprimido, y permite restaurar tablas sueltas. Un `.sql`
 * plano solo se restaura entero.
 *
 * USO
 *   bun run scripts/backup.ts                  crear (y verificar)
 *   bun run scripts/backup.ts --list           listar las copias
 *   bun run scripts/backup.ts --verify <f>     re-verificar una
 *   bun run scripts/backup.ts --restore <f>    restaurar (pide confirmación)
 *
 * VARIABLES
 *   DATABASE_URL          obligatoria
 *   BACKUP_DIR            destino (por defecto ./backups)
 *   BACKUP_KEEP           cuántas conservar (por defecto 7)
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";

const DIR = resolve(process.env.BACKUP_DIR ?? "./backups");
const CONSERVAR = Number(process.env.BACKUP_KEEP ?? 7);
const URL_BD = process.env.DATABASE_URL;

const PREFIJO = "kitsuden-";
const EXT = ".dump";

function exigirUrl(): string {
  if (!URL_BD || URL_BD === "lite") {
    console.error(
      "\n  ✗ Hace falta DATABASE_URL apuntando a un Postgres real.\n" +
        "    El modo lite (PGlite) guarda en disco local: cópialo con el sistema\n" +
        "    de ficheros, no con pg_dump.\n"
    );
    process.exit(1);
  }
  return URL_BD;
}

/**
 * Comprueba que la herramienta existe ANTES de prometer una copia.
 *
 * `pg_dump` debe ser de versión >= la del servidor; si es menor se niega a
 * volcar. Es el fallo más común al hacer backups desde una máquina distinta.
 */
function exigirHerramienta(nombre: string) {
  const r = spawnSync(nombre, ["--version"], { encoding: "utf8" });
  if (r.error) {
    console.error(
      `\n  ✗ No se encuentra '${nombre}'. Instala el cliente de PostgreSQL.\n` +
        `    En el contenedor de la API: apt-get install -y postgresql-client\n`
    );
    process.exit(1);
  }
  return (r.stdout || "").trim();
}

/**
 * La conexión para `pg_dump`/`pg_restore` SIN la contraseña en la línea de
 * órdenes: cualquier usuario de la máquina la lee con `ps` o en
 * `/proc/<pid>/cmdline` mientras dura el volcado (auditoría F77). Host,
 * puerto, usuario y base van como opciones; el resto de parámetros de la URL
 * (`sslmode`…) en la cadena de conexión de `--dbname`; la contraseña, en el
 * entorno del hijo (`PGPASSWORD`), que no se ve en la tabla de procesos.
 */
export function conexionDePg(url: string): { args: string[]; env: Record<string, string> } {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error("DATABASE_URL no es una URL postgresql:// válida");
  }
  if (u.protocol !== "postgresql:" && u.protocol !== "postgres:") {
    throw new Error("DATABASE_URL tiene que empezar por postgresql:// o postgres://");
  }
  const dec = (s: string) => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  };
  // Valor de una cadena de conexión de libpq: entre comillas simples, con
  // `\` y `'` escapados.
  const valor = (s: string) => `'${s.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;

  const args: string[] = [];
  const host = dec(u.hostname).replace(/^\[|\]$/g, "");
  if (host) args.push("--host", host);
  if (u.port) args.push("--port", u.port);
  if (u.username) args.push("--username", dec(u.username));

  const base = dec(u.pathname.replace(/^\//, ""));
  const extra = [...u.searchParams.entries()].filter(([k]) => k !== "password");
  if (extra.length > 0) {
    const partes = [...(base ? [`dbname=${valor(base)}`] : []), ...extra.map(([k, v]) => `${k}=${valor(v)}`)];
    args.push("--dbname", partes.join(" "));
  } else {
    // Siempre con --dbname: sin él, pg_restore escribe el SQL por la salida en
    // vez de restaurar. Por defecto libpq usa el nombre del usuario.
    args.push("--dbname", base || dec(u.username) || "postgres");
  }

  const env: Record<string, string> = {};
  // También `?password=` en la URL: libpq lo acepta, y tampoco va en argv.
  const clave = u.password ? dec(u.password) : u.searchParams.get("password");
  if (clave) env.PGPASSWORD = clave;
  return { args, env };
}

function sello(): string {
  // Sin dos puntos: Windows no los admite en nombres de fichero.
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

function listar(): string[] {
  if (!existsSync(DIR)) return [];
  return readdirSync(DIR)
    .filter((f) => f.startsWith(PREFIJO) && f.endsWith(EXT))
    .sort()
    .reverse();
}

function tamaño(f: string): string {
  const b = statSync(join(DIR, f)).size;
  return b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${(b / 1024).toFixed(0)} KB`;
}

/**
 * Lee el índice del volcado. Si `pg_restore --list` no puede leerlo, el
 * fichero no sirve — y es mucho mejor saberlo ahora.
 */
function verificar(ruta: string): { ok: boolean; objetos: number; error?: string } {
  const r = spawnSync("pg_restore", ["--list", ruta], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.status !== 0) {
    return { ok: false, objetos: 0, error: (r.stderr || "").trim().split("\n")[0] };
  }
  const objetos = (r.stdout || "").split("\n").filter((l) => l && !l.startsWith(";")).length;
  // Un volcado que se lee pero no contiene nada es tan inútil como uno roto.
  if (objetos === 0) return { ok: false, objetos: 0, error: "el volcado no contiene objetos" };
  return { ok: true, objetos };
}

function podar() {
  const copias = listar();
  const sobran = copias.slice(CONSERVAR);
  for (const f of sobran) {
    unlinkSync(join(DIR, f));
    console.log(`  podada  ${f}`);
  }
  if (sobran.length > 0) {
    console.log(`  (se conservan las ${CONSERVAR} más recientes; BACKUP_KEEP lo cambia)`);
  }
}

function crear() {
  const url = exigirUrl();
  console.log(`  ${exigirHerramienta("pg_dump")}`);
  exigirHerramienta("pg_restore");

  mkdirSync(DIR, { recursive: true });
  const nombre = `${PREFIJO}${sello()}${EXT}`;
  const ruta = join(DIR, nombre);

  console.log(`\nVolcando a ${nombre} …`);
  const t0 = Date.now();
  const conexion = conexionDePg(url);
  const r = spawnSync(
    "pg_dump",
    ["--format=custom", "--no-owner", "--no-privileges", "--file", ruta, ...conexion.args],
    {
      encoding: "utf8",
      stdio: ["ignore", "inherit", "pipe"],
      env: { ...process.env, ...conexion.env },
    }
  );

  if (r.status !== 0) {
    // Sin esto quedaría un fichero a medias que parece una copia válida.
    if (existsSync(ruta)) unlinkSync(ruta);
    console.error(`\n  ✗ pg_dump falló:\n    ${(r.stderr || "").trim()}\n`);
    process.exit(1);
  }

  const v = verificar(ruta);
  if (!v.ok) {
    unlinkSync(ruta);
    console.error(
      `\n  ✗ El volcado se escribió pero NO se puede leer: ${v.error}\n    Se ha borrado.\n`
    );
    process.exit(1);
  }

  console.log(`  ok  ${nombre}  (${tamaño(nombre)}, ${v.objetos} objetos, ${Date.now() - t0}ms)`);
  console.log(`  verificado con pg_restore --list`);
  podar();
}

function restaurar(fichero: string) {
  const url = exigirUrl();
  exigirHerramienta("pg_restore");

  const ruta = fichero.includes("/") || fichero.includes("\\") ? fichero : join(DIR, fichero);
  if (!existsSync(ruta)) {
    console.error(`\n  ✗ No existe: ${ruta}\n`);
    process.exit(1);
  }

  const v = verificar(ruta);
  if (!v.ok) {
    console.error(`\n  ✗ Ese volcado no es legible: ${v.error}\n`);
    process.exit(1);
  }

  // Restaurar PISA datos. Nunca debe poder pasar por un tab-completado.
  if (!process.argv.includes("--yes-i-am-sure")) {
    const destino = url.replace(/:\/\/[^@]*@/, "://***@");
    console.log(
      `\n  Vas a restaurar ${v.objetos} objetos sobre:\n    ${destino}\n\n` +
        `  Esto SOBRESCRIBE los datos actuales. Si es lo que quieres, repite con:\n` +
        `    bun run scripts/backup.ts --restore ${fichero} --yes-i-am-sure\n`
    );
    process.exit(1);
  }

  console.log(`\nRestaurando ${ruta} …`);
  const conexion = conexionDePg(url);
  const r = spawnSync(
    "pg_restore",
    ["--clean", "--if-exists", "--no-owner", "--no-privileges", ...conexion.args, ruta],
    { encoding: "utf8", stdio: ["ignore", "inherit", "pipe"], env: { ...process.env, ...conexion.env } }
  );

  // pg_restore devuelve != 0 por avisos benignos (objetos que no existían al
  // hacer --clean). Se muestran, pero no se tratan como fallo.
  const err = (r.stderr || "").trim();
  if (err)
    console.log(
      `\n  avisos de pg_restore:\n${err
        .split("\n")
        .slice(0, 12)
        .map((l) => "    " + l)
        .join("\n")}`
    );
  console.log(
    `\n  Restauración terminada. Ejecuta ahora las migraciones:\n    bun run db:migrate\n`
  );
}

// ── Entrada ─────────────────────────────────────────────────────────────────
// Solo al ejecutarlo (`bun run scripts/backup.ts`): las pruebas importan
// `conexionDePg` sin que se lance ningún volcado.

if (import.meta.main) {
  const args = process.argv.slice(2);
  const idx = (f: string) => args.indexOf(f);

  if (args.includes("--list")) {
    const copias = listar();
    if (copias.length === 0) {
      console.log(`\nNo hay copias en ${DIR}\n`);
    } else {
      console.log(`\n${copias.length} copia(s) en ${DIR}:\n`);
      for (const f of copias) console.log(`  ${f}  ${tamaño(f)}`);
      console.log();
    }
  } else if (idx("--verify") >= 0) {
    const f = args[idx("--verify") + 1];
    const ruta = f?.includes("/") || f?.includes("\\") ? f : join(DIR, f ?? "");
    const v = verificar(ruta);
    console.log(
      v.ok ? `\n  ok  ${f} — ${v.objetos} objetos legibles\n` : `\n  ✗  ${f} — ${v.error}\n`
    );
    process.exit(v.ok ? 0 : 1);
  } else if (idx("--restore") >= 0) {
    restaurar(args[idx("--restore") + 1]);
  } else {
    crear();
  }
}
