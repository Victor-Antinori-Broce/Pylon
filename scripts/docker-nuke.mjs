/**
 * `pnpm docker:nuke` — borra el stack de compose de ESTA carpeta con sus volúmenes.
 *
 * Era `docker compose down -v --remove-orphans` a pelo. Los contenedores
 * `*_prod` viven en el mismo proyecto de compose que esta carpeta, así que eso
 * borraba también producción y sus volúmenes con nombre (`kitsuden_postgres_prod`).
 * Auditoría 2026-10-25. Ahora se niega si hay algo de prod en marcha o creado.
 */
import { execFileSync } from "node:child_process";

const deProd = execFileSync("docker", ["ps", "-a", "--filter", "name=_prod", "--format", "{{.Names}}"], {
  encoding: "utf8",
})
  .split(/\r?\n/)
  .filter(Boolean);

if (deProd.length > 0) {
  console.error(`🛑 Hay contenedores de producción en este proyecto: ${deProd.join(", ")}.`);
  console.error("   docker:nuke borraría también sus volúmenes. No se hace nada.");
  process.exit(1);
}

execFileSync("docker", ["compose", "down", "-v", "--remove-orphans"], { stdio: "inherit" });
