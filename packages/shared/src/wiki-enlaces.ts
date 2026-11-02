/**
 * Enlaces de wiki: slug de página, `[[enlaces]]` y su renderizado
 * ============================================================================
 *
 * Vivían en el motor de kon-wiki. Se mudan aquí porque DOS lados tienen que
 * aplicar exactamente la misma regla:
 *
 *   · el servidor, que indexa los enlaces al guardar (backlinks, «pedidas»);
 *   · el frontend público, que los pinta como `<a>` dentro del subdominio.
 *
 * Con una copia en cada lado, el día que una cambiara, el frontend enlazaría a
 * slugs que el servidor nunca indexó: páginas «pedidas» que ya existen y
 * enlaces que llevan a un 404. kon-wiki los reexporta con sus nombres de
 * siempre (`slugify`, `extractLinks`, `renderLinks`).
 */

import { markdownSeguro } from "./render-blocks";

// ── Slugs ────────────────────────────────────────────────────────────────────

/**
 * Título → slug estable.
 *
 * Conserva tildes fuera pero letras dentro: "Baldur's Gate 3" → "baldurs-gate-3",
 * "Categoría: Armas" → "categoria-armas". El slug es la IDENTIDAD de la página
 * — dos títulos que normalizan igual SON la misma página, que es lo que evita
 * "Espada Larga" y "espada larga" duplicadas.
 */
export function slugDePaginaWiki(title: string): string {
  return (
    title
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      // Los apóstrofos se BORRAN, no se convierten en separador: "Baldur's
      // Gate" es `baldurs-gate`, no `baldur-s-gate`. Están por todas partes en
      // los títulos de juego y de objeto, y partir la palabra da un slug feo
      // que además rompe la búsqueda por prefijo.
      .replace(/['’]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 120)
  );
}

// ── Enlaces wiki ─────────────────────────────────────────────────────────────

export interface EnlaceWiki {
  /** Texto tal como se escribió: "Espada Larga". */
  target: string;
  /** Slug del destino. */
  slug: string;
  /** Texto a mostrar si difiere: `[[Espada Larga|la espada]]`. */
  label: string | null;
}

/**
 * Extrae los `[[enlaces]]` de un texto.
 *
 * Los backlinks se calculan de AQUÍ: al guardar una revisión se indexan sus
 * enlaces, y "qué páginas apuntan a esta" es una consulta, no un rastreo. Un
 * enlace a página inexistente es VÁLIDO — es la mecánica wiki de crear
 * escribiendo primero el enlace.
 */
export function extraerEnlacesWiki(content: string): EnlaceWiki[] {
  const links: EnlaceWiki[] = [];
  const seen = new Set<string>();
  const pattern = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    const target = match[1].trim();
    if (!target) continue;
    const slug = slugDePaginaWiki(target);
    if (!slug || seen.has(slug)) continue; // un backlink por página, no por mención
    seen.add(slug);
    links.push({ target, slug, label: match[2]?.trim() ?? null });
  }
  return links;
}

/** Sustituye `[[enlaces]]` por el HTML del renderizador que se le pase. */
export function renderizarEnlacesWiki(
  content: string,
  render: (link: EnlaceWiki) => string
): string {
  return content.replace(
    /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
    (raw, target: string, label?: string) => {
      const trimmed = target.trim();
      if (!trimmed) return raw;
      return render({
        target: trimmed,
        slug: slugDePaginaWiki(trimmed),
        label: label?.trim() ?? null,
      });
    }
  );
}

// ── Página completa ──────────────────────────────────────────────────────────

/**
 * Contenido de una página de wiki → HTML listo para pintar.
 *
 * Los `[[enlaces]]` se convierten a enlaces MARKDOWN, no a `<a>` escrito a
 * mano, y luego todo pasa por `markdownSeguro`. Es a propósito: si se metiera
 * HTML antes de convertir, el escapado del `<` (que es lo que impide colar
 * etiquetas en una página que edita cualquiera) lo rompería, y quitar ese
 * escapado para dejarlo pasar abriría la puerta a todo lo demás.
 *
 * `hrefDePagina` decide la dirección: en el subdominio de la wiki es `/<slug>`.
 */
export function renderizarPaginaWiki(
  contenido: string,
  hrefDePagina: (slug: string) => string
): string {
  const conEnlaces = renderizarEnlacesWiki(contenido, (enlace) => {
    // Los corchetes del texto romperían la sintaxis del enlace markdown
    const texto = (enlace.label ?? enlace.target).replace(/([\[\]])/g, "\$1");
    return `[${texto}](${hrefDePagina(enlace.slug)})`;
  });
  return markdownSeguro(conEnlaces);
}
