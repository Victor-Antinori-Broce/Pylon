<script lang="ts">
  /**
   * MdxEditor.svelte — Split-screen MDX editor with content preview
   * CodeMirror 6 integration for Svelte
   */
  import { Loader2 } from "lucide-svelte";
  import { marked } from "marked";
  import { onMount, tick } from "svelte";

  // ─── Props ──────────────────────────────────────────
  interface Props {
    value?: string;
    onChange?: (value: string) => void;
    /**
     * Han llegado ficheros pegándolos o arrastrándolos sobre el editor.
     *
     * El editor no sabe de dónde salen los medios ni debería: avisa, y quien
     * tiene la biblioteca los sube y devuelve la imagen por `insertarImagen`.
     */
    onSubirFicheros?: (ficheros: File[]) => void;
  }

  const { value = "", onChange, onSubirFicheros }: Props = $props();

  /**
   * Las imágenes de un portapapeles o de un arrastre.
   *
   * `DataTransfer` mezcla texto, HTML y ficheros: una captura llega como
   * fichero, pero copiar una imagen de una web trae ADEMÁS su `<img>` en HTML.
   * Filtrar por `type` deja solo lo que hay que subir.
   */
  function imagenesDe(datos: DataTransfer | null): File[] {
    if (!datos) return [];
    return Array.from(datos.files).filter((f) => f.type.startsWith("image/"));
  }

  // ─── State ──────────────────────────────────────────
  let localContent = $state(value);
  let previewHtml = $state("");
  let isCompiling = $state(false);
  /** Motivo por el que la vista previa no es la del sitio real, si lo hay. */
  let previewError = $state<string | null>(null);
  let previewContainer: HTMLElement;
  let editorContainer: HTMLElement;
  let editorView: any;

  /**
   * Inserta una imagen en la posición del cursor.
   *
   * La llama el contenedor, que es quien tiene la biblioteca de medios. Aquí no
   * hay barra de herramientas —esto es CodeMirror— así que el botón vive fuera
   * y esta función es el único punto de entrada.
   */
  export function insertarImagen(url: string, alt = "") {
    const markdown = `![${alt}](${url})`;

    if (!editorView) {
      // CodeMirror aún no ha arrancado (se importa de forma diferida). Se
      // escribe sobre el valor local para no perder la imagen elegida.
      localContent += markdown;
      onChange?.(localContent);
      return;
    }

    const pos = editorView.state.selection.main.head;
    editorView.dispatch({
      changes: { from: pos, insert: markdown },
      selection: { anchor: pos + markdown.length },
    });
    editorView.focus();
  }

  // ─── Sync with external value ───────────────────────
  $effect(() => {
    if (value !== localContent) {
      localContent = value;
      if (editorView) {
        editorView.dispatch({
          changes: { from: 0, to: editorView.state.doc.length, insert: value },
        });
      }
    }
  });

  // ─── Initialize CodeMirror ──────────────────────────
  onMount(() => {
    let destroyed = false;

    (async () => {
      const [{ basicSetup }] = await Promise.all([import("codemirror")]);
      const { EditorView, keymap } = await import("@codemirror/view");
      const { EditorState } = await import("@codemirror/state");
      const { markdown } = await import("@codemirror/lang-markdown");
      const { oneDark } = await import("@codemirror/theme-one-dark");

      if (destroyed) return;

      const state = EditorState.create({
        doc: localContent,
        extensions: [
          basicSetup,
          markdown(),
          oneDark,
          EditorView.updateListener.of((update: any) => {
            if (update.docChanged) {
              localContent = update.state.doc.toString();
              onChange?.(localContent);
              debouncedCompile(localContent);
            }
          }),
          /**
           * Pegar y arrastrar, por la vía de CodeMirror.
           *
           * No vale poner `onpaste` en el contenedor de Svelte: CodeMirror
           * monta su propio `contenteditable` dentro y se queda con los eventos
           * de edición antes de que lleguen arriba. `domEventHandlers` es su
           * punto de entrada, y devolver `true` es lo que le dice «este ya está
           * atendido, no hagas lo tuyo».
           */
          EditorView.domEventHandlers({
            paste: (event: ClipboardEvent) => {
              const imagenes = imagenesDe(event.clipboardData);
              // Sin imágenes se devuelve `false`: pegar texto tiene que seguir
              // funcionando, que es lo que se hace casi siempre.
              if (imagenes.length === 0) return false;
              onSubirFicheros?.(imagenes);
              return true;
            },
            drop: (event: DragEvent) => {
              const imagenes = imagenesDe(event.dataTransfer);
              if (imagenes.length === 0) return false;
              onSubirFicheros?.(imagenes);
              return true;
            },
            dragover: (event: DragEvent) => {
              // Sin cancelarlo, el navegador ABRE el fichero soltado y se lleva
              // por delante el artículo a medio escribir. No avisa de nada.
              if (!onSubirFicheros) return false;
              event.preventDefault();
              return true;
            },
          }),
          EditorView.theme({
            "&": { height: "100%" },
            ".cm-scroller": {
              fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
              fontSize: "14px",
              lineHeight: "1.6",
            },
            "&.cm-focused": { outline: "none" },
          }),
        ],
      });

      editorView = new EditorView({
        state,
        parent: editorContainer,
      });

      // Initial compile
      compilePreview(localContent);
    })();

    return () => {
      destroyed = true;
      if (editorView) {
        editorView.destroy();
      }
    };
  });

  // ─── Compilation logic ──────────────────────────────
  let debounceTimer: ReturnType<typeof setTimeout>;

  function debouncedCompile(content: string) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      compilePreview(content);
    }, 400);
  }

  /**
   * Pinta la vista previa.
   *
   * ── POR QUÉ ESTABA SIEMPRE EN BLANCO ─────────────────────────────────────
   *
   * Pedía el HTML a `${VITE_SITE_URL || "http://localhost:4321"}/api/preview`
   * — el puerto por defecto de Astro— con la idea de usar «el motor real del
   * frontend» y que el preview coincidiera exactamente con la web pública.
   *
   * La intención es buena; el problema es que en este repositorio NO hay
   * frontend: `apps/` solo contiene `api`, `VITE_SITE_URL` no se define en
   * ningún sitio y nada escucha en el 4321. La petición fallaba siempre, el
   * error se quedaba en un `console.error`, y el panel derecho seguía vacío sin
   * decir nada. Escribías y no pasaba nada.
   *
   * ── LO QUE HACE AHORA ────────────────────────────────────────────────────
   *
   * Si `VITE_SITE_URL` está definida se sigue usando el frontend real, que es
   * lo más fiel. Si no —o si falla— se compone aquí mismo con `marked`. Un
   * preview aproximado es infinitamente más útil que un panel en blanco, y si
   * el remoto se cae se dice en pantalla en vez de fingir que no hay nada que
   * mostrar.
   */
  async function compilePreview(content: string) {
    if (!content.trim()) {
      previewHtml = "";
      previewError = null;
      return;
    }

    isCompiling = true;
    previewError = null;

    const siteUrl = import.meta.env.VITE_SITE_URL;

    try {
      if (siteUrl) {
        const res = await fetch(`${siteUrl}/api/preview`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        previewHtml = (await res.json()).html || "";
      } else {
        previewHtml = await marked.parse(content);
      }
      await tick();
    } catch (err) {
      // El remoto falló: se compone en local y se avisa. Antes se dejaba el
      // panel vacío, que es indistinguible de «no has escrito nada».
      try {
        previewHtml = await marked.parse(content);
        previewError =
          `No se pudo usar el motor del sitio (${err instanceof Error ? err.message : err}). ` +
          `Vista previa aproximada.`;
      } catch (err2) {
        previewHtml = "";
        previewError = `No se pudo componer la vista previa: ${err2 instanceof Error ? err2.message : err2}`;
      }
    } finally {
      isCompiling = false;
    }
  }
</script>

<div
  class="mdx-editor h-full flex flex-col sm:flex-row overflow-hidden border border-kitsuden-border rounded-xl bg-kitsuden-card shadow-sm relative z-0"
>
  <!-- Code Editor Pane -->
  <div
    class="h-1/2 sm:h-full w-full sm:w-1/2 flex flex-col border-b sm:border-b-0 sm:border-r border-kitsuden-border"
  >
    <div
      class="flex items-center justify-between px-4 py-2 border-b border-kitsuden-border bg-kitsuden-bg"
    >
      <h3 class="text-xs font-semibold uppercase tracking-wider text-kitsuden-text-dim">
        Markdown / MDX
      </h3>
    </div>
    <div
      class="flex-1 overflow-auto bg-[#282c34] code-wrapper relative"
      bind:this={editorContainer}
    ></div>
  </div>

  <!--
    Vista del CONTENIDO, no de la página: convierte el markdown y nada más. No
    lleva los estilos del sitio ni sabe de los bloques, que son otro campo.
    Misma razón que en `LivePreview.svelte`.
  -->
  <div class="h-1/2 sm:h-full w-full sm:w-1/2 flex flex-col bg-kitsuden-bg">
    <div
      class="flex items-center justify-between px-4 py-2 border-b border-kitsuden-border bg-kitsuden-bg flex-shrink-0"
    >
      <h3 class="text-xs font-semibold uppercase tracking-wider text-kitsuden-text-dim">
        Content Preview
      </h3>
      {#if isCompiling}
        <Loader2 class="w-4 h-4 text-kitsuden-accent animate-spin" />
      {/if}
    </div>

    <div class="flex-1 overflow-auto p-4 sm:p-8">
      <!--
        Si la vista previa no viene del sitio real se dice. Callarlo dejaba al
        autor viendo un panel que podia no parecerse a lo publicado y sin forma
        de saberlo.
      -->
      {#if previewError}
        <p
          class="mb-4 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-kitsuden-text-dim"
        >
          {previewError}
        </p>
      {/if}

      <article
        bind:this={previewContainer}
        class="prose prose-invert prose-slate max-w-none prose-headings:font-bold prose-a:text-kitsuden-accent prose-img:rounded-xl prose-pre:bg-kitsuden-card prose-pre:border prose-pre:border-kitsuden-border"
      >
        {@html previewHtml}
      </article>

      {#if !localContent.trim()}
        <div class="h-full flex flex-col items-center justify-center text-kitsuden-subtle">
          <p class="text-sm">Preview will appear here...</p>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  :global(.mdx-editor .cm-editor) {
    height: 100%;
  }
  :global(.mdx-editor .cm-editor.cm-focused) {
    outline: none !important;
  }
  :global(.mdx-editor .cm-scroller) {
    font-family: "JetBrains Mono", "Fira Code", Consolas, monospace;
    font-size: 14px;
    line-height: 1.6;
  }
</style>
