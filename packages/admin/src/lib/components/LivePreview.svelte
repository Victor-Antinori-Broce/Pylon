<script lang="ts">
  import { Monitor, Tablet, Smartphone } from "lucide-svelte";
  import { renderizarBloques } from "@kitsuden/shared";

  interface Props {
    title?: string;
    content?: string;
    excerpt?: string;
    featuredImageUrl?: string;
    slug?: string;
    authorName?: string;
    publishedAt?: string;
    status?: string;
    /**
     * Bloques del post, si los hay.
     *
     * ── POR QUE SE PINTAN COMO ESQUEMA Y NO COMO RESULTADO ──────────────────
     *
     * Esta vista previa solo conocia `content`, asi que un post con bloques se
     * veia EXACTAMENTE IGUAL que uno sin ellos: se anadia una galeria, se
     * miraba la vista previa y no habia ni rastro. Eso no se lee como «la vista
     * previa no los soporta», se lee como «no se ha guardado».
     *
     * Pero tampoco se renderizan de verdad, y es a proposito: en este repo NO
     * EXISTE un renderizador de bloques fuera del propio constructor —se ha
     * buscado `PageBlock` en todo el arbol y solo aparece en el admin—, asi que
     * cualquier HTML que se inventara aqui seria una vista previa de algo que
     * no la produce nadie. Una vista previa que miente es peor que una
     * incompleta: se toman decisiones de maquetacion sobre un resultado falso.
     *
     * Se ensena QUE bloques hay y en que orden, marcado como esquema.
     */
    blocks?: Array<{ id: string; type: string; data?: Record<string, unknown>; order?: number }>;
  }

  const {
    title = "",
    content = "",
    excerpt = "",
    featuredImageUrl = "",
    slug = "",
    authorName = "",
    publishedAt = "",
    status = "",
    blocks = [],
  }: Props = $props();

  /**
   * Los bloques, pintados con EL MISMO renderizador que usa la API.
   *
   * Antes esto era un esquema —una lista de los tipos que había— porque no
   * existía renderizador en ninguna parte. Ahora existe y vive en
   * `@kitsuden/shared`, así que la vista previa enseña lo que va a salir
   * publicado en vez de una aproximación.
   *
   * Que sea LITERALMENTE la misma función es el punto: dos renderizadores
   * distintos convierten la vista previa en una vista previa de otra cosa.
   *
   * `blocksInteractivos` son los que necesitan JavaScript del sitio —mapas,
   * rejillas sobre datasets, filtros—. Aquí se marcan como tales en vez de
   * fingir que se ven: son huecos a hidratar, y decirlo evita maquetar sobre
   * un resultado que no es el final.
   */
  const bloquesRender = $derived(renderizarBloques(blocks as never));

  type Viewport = "desktop" | "tablet" | "mobile";
  let viewport = $state<Viewport>("desktop");

  const viewportWidths = {
    desktop: "100%",
    tablet: "768px",
    mobile: "375px",
  };

  const htmlContent = $derived.by(() => {
    const dateText = publishedAt ? new Date(publishedAt).toLocaleDateString() : "";
    const metaParts = [
      authorName ? `By ${authorName}` : "",
      dateText,
      status ? status.charAt(0).toUpperCase() + status.slice(1) : "",
    ].filter(Boolean);

    return `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    line-height: 1.6;
    color: #1f2937;
    background: #ffffff;
    padding: 2rem 1rem;
  }
  .container { max-width: 720px; margin: 0 auto; }
  .featured-image {
    width: 100%;
    height: 300px;
    object-fit: cover;
    border-radius: 12px;
    margin-bottom: 1.5rem;
  }
  h1 {
    font-size: 2rem;
    font-weight: 800;
    line-height: 1.2;
    margin-bottom: 0.75rem;
    color: #111827;
  }
  .meta {
    font-size: 0.875rem;
    color: #6b7280;
    margin-bottom: 1.5rem;
  }
  .excerpt {
    font-size: 1.125rem;
    color: #4b5563;
    font-style: italic;
    margin-bottom: 1.5rem;
    padding-bottom: 1.5rem;
    border-bottom: 1px solid #e5e7eb;
  }
  .content {
    font-size: 1.125rem;
    color: #374151;
    white-space: pre-wrap;
  }
  .content p { margin-bottom: 1rem; }
  .bloques-render { margin-top: 2rem; display: flex; flex-direction: column; gap: 1.5rem; }
  .bloques-nota {
    margin: 1rem 0 0;
    font-size: .75rem;
    color: #6b6b7b;
    border-left: 3px solid #b9b9c6;
    padding-left: .6rem;
  }

  /* Los bloques renderizados. Mínimo y neutro: el sitio pondrá su propia hoja
     de estilos, y clavar aquí una maquetación distinta haría que la vista
     previa volviera a enseñar algo que no es. */
  .ks-hero {
    padding: 2.5rem 1.5rem;
    border-radius: 10px;
    background-size: cover;
    background-position: center;
    color: #fff;
    background-color: #2a2a35;
  }
  .ks-hero h2 { margin: 0 0 .4rem; font-size: 1.6rem; }
  .ks-hero p { margin: 0; opacity: .9; }
  .ks-hero--dark { box-shadow: inset 0 0 0 9999px rgba(0,0,0,.45); }
  .ks-hero--gradient { box-shadow: inset 0 -120px 120px -60px rgba(0,0,0,.75); }
  .ks-hero-ctas { margin-top: 1rem; display: flex; gap: .5rem; }
  .ks-cta {
    display: inline-block;
    padding: .5rem .9rem;
    border-radius: 6px;
    background: #fff;
    color: #111;
    text-decoration: none;
    font-weight: 600;
    font-size: .9rem;
  }
  .ks-cta--sec { background: transparent; color: #fff; box-shadow: inset 0 0 0 1px #fff; }

  .ks-gallery { display: grid; grid-template-columns: repeat(var(--ks-cols, 3), 1fr); gap: .6rem; }
  .ks-gallery figure { margin: 0; }
  .ks-gallery img { width: 100%; height: auto; border-radius: 6px; display: block; }
  .ks-gallery figcaption { font-size: .75rem; color: #6b6b7b; margin-top: .3rem; }

  .ks-callout { padding: .9rem 1rem; border-radius: 8px; border-left: 4px solid #8a8a9c; background: #f4f4f8; }
  .ks-callout p { margin: 0; }
  .ks-callout-titulo { font-weight: 700; margin-bottom: .25rem !important; }
  .ks-callout--warning { border-left-color: #d9900a; background: #fdf6e8; }
  .ks-callout--danger { border-left-color: #c8342f; background: #fdeceb; }
  .ks-callout--success { border-left-color: #2e9b57; background: #eaf7ef; }
  .ks-callout--tip { border-left-color: #6b5bd2; background: #f0eefb; }

  .ks-divider { border: 0; border-top: 1px solid #d6d6de; }
  .ks-divider--dots { border-top-style: dotted; border-top-width: 3px; }
  .ks-divider--gradient {
    height: 2px;
    border: 0;
    background: linear-gradient(90deg, transparent, #8a8a9c, transparent);
  }
  .ks-espacio { height: 2rem; }

  .ks-embed figcaption { font-size: .75rem; color: #6b6b7b; margin-top: .3rem; }

  /* Hueco a hidratar: se marca de forma que no se confunda con el resultado. */
  .ks-block { border: 1px dashed #b9b9c6; border-radius: 8px; padding: 1rem; background: #f6f6f9; }
  .ks-block--comparison-slider { display: grid; grid-template-columns: 1fr 1fr; gap: .6rem; }
  .ks-block--comparison-slider img { width: 100%; height: auto; border-radius: 6px; display: block; }
  .ks-block figure { margin: 0; }
  .ks-block figcaption { font-size: .75rem; color: #6b6b7b; margin-top: .3rem; }
  .ks-reserva { margin: 0; font-size: .8rem; color: #4a4a58; }
  .ks-vacio { color: #6b6b7b; font-size: .8rem; }
</style>
</head>
<body>
  <div class="container">
    ${featuredImageUrl ? `<img src="${featuredImageUrl}" class="featured-image" alt="" />` : ""}
    <h1>${title || "Untitled Post"}</h1>
    ${metaParts.length ? `<div class="meta">${metaParts.join(" &bull; ")}</div>` : ""}
    ${excerpt ? `<div class="excerpt">${excerpt}</div>` : ""}
    <div class="content">${(content || "").replace(/\n/g, "<br/>")}</div>
    ${bloquesRender.html ? `<div class="bloques-render">${bloquesRender.html}</div>` : ""}
    ${
      bloquesRender.interactivos.length === 0
        ? ""
        : `<p class="bloques-nota">${bloquesRender.interactivos.length} bloque${
            bloquesRender.interactivos.length === 1 ? "" : "s"
          } se hidrata${
            bloquesRender.interactivos.length === 1 ? "" : "n"
          } en el sitio (${bloquesRender.interactivos.join(", ")}): aquí se ve el hueco, no el resultado.</p>`
    }
  </div>
</body>
</html>
    `.trim();
  });
</script>

<div class="flex flex-col h-full bg-kitsuden-bg">
  <!-- Toolbar -->
  <div
    class="flex items-center justify-between px-4 py-2 border-b border-kitsuden-border bg-kitsuden-card/50 shrink-0"
  >
    <!--
      ── POR QUE «CONTENT PREVIEW» Y NO «LIVE PREVIEW» ─────────────────────────

      Porque esto NO es la página publicada, y llamarlo así promete de más de la
      misma forma que «All Posts» prometía todos los posts cuando solo traía los
      publicados.

      Lo que sí es: el HTML que devuelve la API, exacto. La misma función, sin
      opciones en ninguno de los dos lados, comprobado byte a byte contra la
      instalación real (512 caracteres idénticos).

      Lo que no:
        · no lleva los estilos del sitio — pinta unos neutros de este fichero;
        · seis de los trece bloques salen como hueco, porque necesitan
          JavaScript del sitio para hidratarse;
        · y no hay sitio: en el repo solo está `apps/api`.

      Fiel en el fondo, aproximada en la forma. El día que exista un frontend
      consumiendo la API con sus estilos, esto pasa a ser una vista previa de la
      página — y entonces, y no antes, la etiqueta puede volver a prometerlo.
    -->
    <span class="text-xs font-medium text-kitsuden-subtle uppercase tracking-wider"
      >Content Preview</span
    >
    <div class="flex items-center gap-1">
      <button
        class="p-1.5 rounded-md transition-colors {viewport === 'desktop'
          ? 'bg-kitsuden-accent/10 text-kitsuden-accent'
          : 'text-kitsuden-subtle hover:text-kitsuden-text hover:bg-kitsuden-border/30'}"
        onclick={() => (viewport = "desktop")}
        aria-label="Desktop view"
      >
        <Monitor class="w-4 h-4" />
      </button>
      <button
        class="p-1.5 rounded-md transition-colors {viewport === 'tablet'
          ? 'bg-kitsuden-accent/10 text-kitsuden-accent'
          : 'text-kitsuden-subtle hover:text-kitsuden-text hover:bg-kitsuden-border/30'}"
        onclick={() => (viewport = "tablet")}
        aria-label="Tablet view"
      >
        <Tablet class="w-4 h-4" />
      </button>
      <button
        class="p-1.5 rounded-md transition-colors {viewport === 'mobile'
          ? 'bg-kitsuden-accent/10 text-kitsuden-accent'
          : 'text-kitsuden-subtle hover:text-kitsuden-text hover:bg-kitsuden-border/30'}"
        onclick={() => (viewport = "mobile")}
        aria-label="Mobile view"
      >
        <Smartphone class="w-4 h-4" />
      </button>
    </div>
  </div>

  <!-- Preview Canvas -->
  <div class="flex-1 overflow-auto p-4 flex justify-center bg-kitsuden-bg/50">
    <div
      class="h-full bg-white rounded-lg shadow-lg overflow-hidden transition-all duration-300 border border-kitsuden-border"
      style="width: {viewportWidths[viewport]};"
    >
      <iframe
        title="Post Preview"
        srcdoc={htmlContent}
        class="w-full h-full border-0"
        sandbox="allow-scripts"
      ></iframe>
    </div>
  </div>
</div>
