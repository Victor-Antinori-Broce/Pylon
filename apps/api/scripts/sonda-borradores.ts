/**
 * ¿Se escapa algo sin publicar por alguna lectura pública?
 * ============================================================================
 *
 * Crea un borrador de blog y otro de games, pregunta por TODAS las vías
 * públicas SIN sesión, y borra lo creado.
 *
 * ── POR QUE EXISTE ESTE FICHERO ────────────────────────────────────────────
 *
 * Porque la primera vez se arregló `GET /api/blog`, se comprobó ESA ruta y se
 * informó de que la fuga estaba cerrada. Estaba abierta en otras cinco. Probar
 * la puerta que acabas de arreglar no dice nada de las demás, y la prueba
 * unitaria mira el código, no lo que responde el servidor desplegado.
 *
 * Se ejecuta contra la instalación en marcha:
 *
 *     bun scripts/sonda-borradores.ts
 */

import { eq } from "drizzle-orm";

import { db } from "../src/db";
import { blogPosts } from "../../../packages/kons/kon-blog/src/schema";
import { games } from "../../../packages/kons/kon-games/games.schema";
import { sql } from "drizzle-orm";

const BASE = process.env.SONDA_BASE_URL || "http://localhost:3000";
const MARCA = `secreto-${Date.now()}`;

let fugas = 0;

async function mirar(nombre: string, ruta: string) {
  const res = await fetch(`${BASE}${ruta}`);
  const cuerpo = await res.text();
  const fuga = cuerpo.includes(MARCA);
  if (fuga) fugas++;
  console.log(
    `  ${fuga ? "FUGA " : "ok   "} ${nombre.padEnd(34)} [${res.status}] ${
      fuga ? "DEVUELVE EL BORRADOR" : "no lo devuelve"
    }`
  );
}

// ── Autor: se reutiliza uno que ya existe ───────────────────────────────────
// Crear usuarios de prueba rompió la pantalla de configuración una vez.
const filas: any = await db.execute(sql`SELECT id FROM auth_users LIMIT 1`);
const autor = (Array.isArray(filas) ? filas : filas.rows)[0]?.id as string | undefined;
if (!autor) {
  console.error("No hay ningún usuario en auth_users; no se puede crear el post de prueba.");
  process.exit(1);
}

const slugPost = `sonda-post-${Date.now()}`;
const slugJuego = `sonda-juego-${Date.now()}`;

const [post] = await db
  .insert(blogPosts)
  .values({
    title: MARCA,
    slug: slugPost,
    authorId: autor,
    status: "draft",
    content: MARCA,
  })
  .returning();

const [juego] = await db
  .insert(games)
  .values({ title: MARCA, slug: slugJuego, status: "draft", excerpt: MARCA })
  .returning();

console.log("\nLecturas públicas, SIN sesión\n");

console.log("  kon-blog");
await mirar("GET /api/blog", "/api/blog");
await mirar("GET /api/blog?status=draft", "/api/blog?status=draft");
await mirar("GET /api/blog?status=all", "/api/blog?status=all");
await mirar("GET /api/blog/slug/:slug", `/api/blog/slug/${slugPost}`);
await mirar("GET /api/blog/:id", `/api/blog/${post.id}`);
await mirar("GET /api/blog/seo/:slug", `/api/blog/seo/${slugPost}`);
await mirar("GET /api/blog/seo?preview=true", `/api/blog/seo/${slugPost}?preview=true`);
await mirar("GET /api/blog/geo/:slug", `/api/blog/geo/${slugPost}`);
await mirar("GET /api/blog/geo?preview=true", `/api/blog/geo/${slugPost}?preview=true`);

console.log("\n  kon-games");
await mirar("GET /api/games", "/api/games");
await mirar("GET /api/games?status=draft", "/api/games?status=draft");
await mirar("GET /api/games/slug/:slug", `/api/games/slug/${slugJuego}`);
await mirar("GET /api/games/:id", `/api/games/${juego.id}`);

await db.delete(blogPosts).where(eq(blogPosts.id, post.id));
await db.delete(games).where(eq(games.id, juego.id));
console.log("\n  ok   limpieza");

console.log(`\n${fugas === 0 ? "Sin fugas." : `${fugas} FUGA(S).`}\n`);
process.exit(fugas === 0 ? 0 : 1);
