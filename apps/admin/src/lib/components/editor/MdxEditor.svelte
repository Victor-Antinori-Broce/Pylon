<script lang="ts">
  /**
   * MdxEditor.svelte — Split-screen MDX editor with live preview
   * CodeMirror 6 integration for Svelte
   */
  import { onMount, tick } from "svelte";
  import { Loader2 } from "lucide-svelte";
  
  // ─── Props ──────────────────────────────────────────
  interface Props {
    value?: string;
    onChange?: (value: string) => void;
  }
  
  let { value = "", onChange }: Props = $props();
  
  // ─── State ──────────────────────────────────────────
  let localContent = $state(value);
  let previewHtml = $state("");
  let isCompiling = $state(false);
  let previewContainer: HTMLElement;
  let editorContainer: HTMLElement;
  let editorView: any;
  
  // ─── Sync with external value ───────────────────────
  $effect(() => {
    if (value !== localContent) {
      localContent = value;
      if (editorView) {
        editorView.dispatch({
          changes: { from: 0, to: editorView.state.doc.length, insert: value }
        });
      }
    }
  });
  
  // ─── Initialize CodeMirror ──────────────────────────
  onMount(async () => {
    const [{ basicSetup }] = await Promise.all([
      import("codemirror"),
    ]);
    const { EditorView, keymap } = await import("@codemirror/view");
    const { EditorState } = await import("@codemirror/state");
    const { markdown } = await import("@codemirror/lang-markdown");
    const { oneDark } = await import("@codemirror/theme-one-dark");
    
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
        EditorView.theme({
          "&": { height: "100%" },
          ".cm-scroller": { fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace", fontSize: "14px", lineHeight: "1.6" },
          "&.cm-focused": { outline: "none" }
        })
      ]
    });
    
    editorView = new EditorView({
      state,
      parent: editorContainer
    });
    
    // Initial compile
    compilePreview(localContent);
    
    return () => {
      editorView.destroy();
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
  
  async function compilePreview(content: string) {
    if (!content.trim()) {
      previewHtml = "";
      return;
    }
    
    isCompiling = true;
    
    try {
      const apiUrl = import.meta.env.VITE_SITE_URL || "http://localhost:4321";
      
      const res = await fetch(`${apiUrl}/api/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content })
      });
      
      if (!res.ok) throw new Error("Preview rendering failed");
      
      const data = await res.json();
      previewHtml = data.html || "";
      
      await tick();
      await renderMermaidDiagrams();
    } catch (err) {
      console.error("MDX Editor preview error:", err);
    } finally {
      isCompiling = false;
    }
  }
  
  // ─── Mermaid rendering ──────────────────────────────
  async function renderMermaidDiagrams() {
    if (!previewContainer) return;
    
    const mermaidBlocks = previewContainer.querySelectorAll("code.language-mermaid");
    if (mermaidBlocks.length === 0) return;
    
    const { default: mermaid } = await import("mermaid");
    
    mermaid.initialize({
      startOnLoad: false,
      theme: "base",
      themeVariables: {
        primaryColor: "#3b82f6",
        primaryTextColor: "#fff",
        lineColor: "#94a3b8",
        fontFamily: "Inter, sans-serif"
      }
    });
    
    for (let i = 0; i < mermaidBlocks.length; i++) {
      const block = mermaidBlocks[i] as HTMLElement;
      const pre = block.parentElement;
      if (!pre || pre.tagName !== "PRE") continue;
      
      const graphDefinition = block.textContent || "";
      const id = `mermaid-svg-${Date.now()}-${i}`;
      
      try {
        const { svg } = await mermaid.render(id, graphDefinition);
        const wrapper = document.createElement("div");
        wrapper.className = "mermaid-rendered flex justify-center py-6 border border-gremius-border rounded-lg bg-gremius-card/50 my-4";
        wrapper.innerHTML = svg;
        pre.replaceWith(wrapper);
      } catch (err) {
        console.warn("Invalid mermaid syntax", err);
        block.innerHTML = `<span class="text-gremius-pink">Mermaid syntax error</span>\n${graphDefinition}`;
      }
    }
  }
</script>

<div class="mdx-editor h-full flex flex-col sm:flex-row overflow-hidden border border-gremius-border rounded-xl bg-gremius-card shadow-sm relative z-0">
  <!-- Code Editor Pane -->
  <div class="h-1/2 sm:h-full w-full sm:w-1/2 flex flex-col border-b sm:border-b-0 sm:border-r border-gremius-border">
    <div class="flex items-center justify-between px-4 py-2 border-b border-gremius-border bg-gremius-bg">
      <h3 class="text-xs font-semibold uppercase tracking-wider text-gremius-text-dim">Markdown / MDX</h3>
    </div>
    <div class="flex-1 overflow-auto bg-[#282c34] code-wrapper relative" bind:this={editorContainer}></div>
  </div>

  <!-- Live Preview Pane -->
  <div class="h-1/2 sm:h-full w-full sm:w-1/2 flex flex-col bg-gremius-bg">
    <div class="flex items-center justify-between px-4 py-2 border-b border-gremius-border bg-gremius-bg flex-shrink-0">
      <h3 class="text-xs font-semibold uppercase tracking-wider text-gremius-text-dim">Live Preview</h3>
      {#if isCompiling}
        <Loader2 class="w-4 h-4 text-gremius-cyan animate-spin" />
      {/if}
    </div>
    
    <div class="flex-1 overflow-auto p-4 sm:p-8">
      <article 
        bind:this={previewContainer}
        class="prose prose-invert prose-slate max-w-none prose-headings:font-bold prose-a:text-gremius-cyan prose-img:rounded-xl prose-pre:bg-gremius-card prose-pre:border prose-pre:border-gremius-border"
      >
        {@html previewHtml}
      </article>
      
      {#if !localContent.trim()}
        <div class="h-full flex flex-col items-center justify-center text-gremius-subtle">
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
    font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
    font-size: 14px;
    line-height: 1.6;
  }
</style>
