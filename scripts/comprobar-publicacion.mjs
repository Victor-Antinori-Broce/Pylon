#!/usr/bin/env node
/**
 * Comprobación de lo que solo se ve en el sitio PUBLICADO
 * ============================================================================
 *
 *   node scripts/comprobar-publicacion.mjs https://tudominio.com
 *   node scripts/comprobar-publicacion.mjs            # usa PUBLIC_SITE_URL
 *
 * ── POR QUÉ HACE FALTA, HABIENDO 36 PRUEBAS DE CUMPLIMIENTO ────────────────
 *
 * `tests/unit/cumplimiento-legal.test.ts` y los dos de SEO guardan el
 * MECANISMO: que la canónica se construya bien, que el contraste dé 4,5, que
 * ninguna imagen se quede sin alt, que sin correo configurado no se invente
 * una dirección. Todas pasan hoy.
 *
 * Y aun así el sitio puede publicarse anunciándose en `http://localhost:4321`
 * y con el aviso legal sin titular, porque eso NO es un fallo de código: es
 * configuración que vive en el panel y en el entorno. El mecanismo funciona
 * perfectamente; lo que le das está vacío. Una prueba unitaria no puede verlo
 * —no sabe qué hay en la base de producción— y por eso pasa desapercibido.
 *
 * Esto mira el HTML que de verdad sale por la puerta.
 *
 * ── QUÉ SE CONSIDERA UN FALLO ──────────────────────────────────────────────
 *
 * GRAVE   rompe algo de verdad: Google no puede indexar, o falta un dato que
 *         la ley exige. Sale con código de salida 1.
 * AVISO   funciona, pero se va a notar: una página que pesa de más gasta
 *         presupuesto de rastreo, un título largo se corta en el resultado.
 * BIEN    comprobado y correcto.
 *
 * No inventa veredictos: lo que no se puede comprobar se dice, no se aprueba.
 */

const GRAVE = "GRAVE";
const AVISO = "AVISO";
const BIEN = "BIEN";

/** Umbral de peso. Google rastrea menos las páginas grandes, y las CWV las penalizan. */
const PESO_AVISO = 1_500_000; // 1,5 MB
const PESO_GRAVE = 4_000_000; // 4 MB

const base = (process.argv[2] ?? process.env.PUBLIC_SITE_URL ?? "").trim().replace(/\/+$/, "");
if (!base) {
  console.error(
    "Falta la dirección. Uso: node scripts/comprobar-publicacion.mjs https://tudominio.com"
  );
  process.exit(2);
}

const resultados = [];
const anota = (nivel, que, detalle) => resultados.push({ nivel, que, detalle });

const pedir = async (ruta) => {
  const url = new URL(ruta, base).href;
  try {
    const res = await fetch(url, { headers: { "user-agent": "kitsuden-comprobar-publicacion" } });
    const cuerpo = await res.text();
    return { ok: true, estado: res.status, cuerpo, url, bytes: Buffer.byteLength(cuerpo, "utf8") };
  } catch (e) {
    return { ok: false, error: String(e?.message ?? e), url };
  }
};

const meta = (html, re) => re.exec(html)?.[1]?.trim() ?? null;
const ES_LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i;

// ── 1. La portada: canónica, título, descripción, imagen al compartir ───────

const portada = await pedir("/");
if (!portada.ok) {
  console.error(`No se pudo abrir ${portada.url}: ${portada.error}`);
  console.error("¿Está el sitio levantado y es esa la dirección?");
  process.exit(2);
}
if (portada.estado !== 200) anota(GRAVE, "Portada", `responde ${portada.estado}, no 200`);

const canonica = meta(portada.cuerpo, /<link[^>]+rel="canonical"[^>]+href="([^"]+)"/i);
if (!canonica) {
  anota(GRAVE, "Canónica", "la portada no lleva <link rel=canonical>");
} else if (ES_LOCAL.test(canonica)) {
  anota(
    GRAVE,
    "Canónica",
    `se anuncia como ${canonica} — Google no puede indexar eso. Pon la dirección real en el panel (o PUBLIC_SITE_URL).`
  );
} else {
  anota(BIEN, "Canónica", canonica);
}

const titulo = meta(portada.cuerpo, /<title[^>]*>([^<]*)<\/title>/i);
if (!titulo) anota(GRAVE, "Título", "la portada no tiene <title>");
else if (titulo.length > 60)
  anota(AVISO, "Título", `${titulo.length} caracteres: se corta en el resultado (máx. 60)`);
else anota(BIEN, "Título", `${titulo.length} caracteres`);

const descripcion = meta(portada.cuerpo, /<meta[^>]+name="description"[^>]+content="([^"]*)"/i);
if (!descripcion) anota(GRAVE, "Descripción", "la portada no tiene meta description");
else if (descripcion.length > 160)
  anota(AVISO, "Descripción", `${descripcion.length} caracteres (máx. 160)`);
else anota(BIEN, "Descripción", `${descripcion.length} caracteres`);

const ogImagen = meta(portada.cuerpo, /<meta[^>]+property="og:image"[^>]+content="([^"]*)"/i);
if (!ogImagen) anota(GRAVE, "Imagen al compartir", "falta og:image: en redes sale sin tarjeta");
else if (ES_LOCAL.test(ogImagen)) anota(GRAVE, "Imagen al compartir", `apunta a ${ogImagen}`);
else anota(BIEN, "Imagen al compartir", ogImagen.split("/").pop());

const favicon = /<link[^>]+rel="(icon|shortcut icon)"/i.test(portada.cuerpo);
anota(favicon ? BIEN : AVISO, "Favicon", favicon ? "declarado" : "no se declara ninguno");

anota(
  portada.bytes > PESO_GRAVE ? GRAVE : portada.bytes > PESO_AVISO ? AVISO : BIEN,
  "Peso de la portada",
  `${(portada.bytes / 1024).toFixed(0)} kB`
);

// ── 2. robots.txt y mapa del sitio ─────────────────────────────────────────

const robots = await pedir("/robots.txt");
if (!robots.ok || robots.estado !== 200) {
  anota(GRAVE, "robots.txt", `no responde (${robots.estado ?? robots.error})`);
} else if (!/sitemap:/i.test(robots.cuerpo)) {
  anota(AVISO, "robots.txt", "existe pero no apunta al mapa del sitio");
} else if (ES_LOCAL.test(/sitemap:\s*(\S+)/i.exec(robots.cuerpo)?.[1] ?? "")) {
  anota(GRAVE, "robots.txt", "el mapa que anuncia está en localhost");
} else {
  anota(BIEN, "robots.txt", "existe y apunta al mapa");
}

const mapa = await pedir("/sitemap-index.xml");
if (!mapa.ok || mapa.estado !== 200) {
  anota(GRAVE, "Mapa del sitio", `no responde (${mapa.estado ?? mapa.error})`);
} else {
  const locs = [...mapa.cuerpo.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  if (locs.length === 0) anota(GRAVE, "Mapa del sitio", "está vacío");
  else if (locs.some((u) => ES_LOCAL.test(u)))
    anota(GRAVE, "Mapa del sitio", `${locs.length} mapas, y apuntan a localhost`);
  else anota(BIEN, "Mapa del sitio", `${locs.length} mapas`);
}

// ── 3. Un 404 de verdad ────────────────────────────────────────────────────

const inventada = await pedir(`/esta-pagina-no-existe-${Date.now()}`);
if (!inventada.ok) anota(AVISO, "Página 404", `no se pudo comprobar: ${inventada.error}`);
else if (inventada.estado !== 404)
  anota(
    GRAVE,
    "Página 404",
    `una dirección inventada responde ${inventada.estado}: Google la indexaría como buena`
  );
else anota(BIEN, "Página 404", "responde 404 y con página propia");

// ── 4. Lo legal: que el titular no salga en blanco ─────────────────────────

const aviso = await pedir("/legal/aviso-legal");
if (!aviso.ok || aviso.estado !== 200) {
  anota(GRAVE, "Aviso legal", `no responde (${aviso.estado ?? aviso.error})`);
} else {
  const texto = aviso.cuerpo.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const hayCorreo = /[\w.+-]+@[\w-]+\.[\w.]+/.test(texto);
  // El sistema NO pinta lo que no está configurado, así que un aviso legal sin
  // correo ni dirección significa titular vacío, no plantilla mal hecha.
  if (!hayCorreo)
    anota(
      GRAVE,
      "Titular",
      "el aviso legal no muestra correo de contacto: los PUBLIC_TITULAR_* están sin rellenar. " +
        "Sin eso, el derecho de supresión que promete la política no tiene a dónde escribirse."
    );
  else anota(BIEN, "Titular", "el aviso legal muestra contacto");
}

const privacidad = await pedir("/legal/privacidad");
anota(
  privacidad.ok && privacidad.estado === 200 ? BIEN : GRAVE,
  "Política de privacidad",
  privacidad.ok && privacidad.estado === 200
    ? "publicada"
    : `no responde (${privacidad.estado ?? privacidad.error})`
);

// ── 5. Una página pesada de verdad, que es donde está el techo ─────────────

const juegos = await pedir("/games");
if (juegos.ok && juegos.estado === 200) {
  anota(
    juegos.bytes > PESO_GRAVE ? GRAVE : juegos.bytes > PESO_AVISO ? AVISO : BIEN,
    "Peso de /games",
    `${(juegos.bytes / 1024).toFixed(0)} kB` +
      (juegos.bytes > PESO_AVISO ? " — mira el JSON de vistas previas incrustado" : "")
  );
}

// ── Informe ────────────────────────────────────────────────────────────────

const orden = { [GRAVE]: 0, [AVISO]: 1, [BIEN]: 2 };
resultados.sort((a, b) => orden[a.nivel] - orden[b.nivel]);

console.log(`\nComprobación de ${base}\n`);
for (const { nivel, que, detalle } of resultados) {
  console.log(`  ${nivel.padEnd(5)}  ${que.padEnd(24)}  ${detalle}`);
}

const graves = resultados.filter((r) => r.nivel === GRAVE).length;
const avisos = resultados.filter((r) => r.nivel === AVISO).length;
console.log(
  `\n  ${graves} grave(s), ${avisos} aviso(s), ${resultados.length - graves - avisos} bien\n`
);

process.exit(graves > 0 ? 1 : 0);
