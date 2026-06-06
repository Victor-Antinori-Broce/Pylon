<script lang="ts">
  /**
   * EditorView.svelte — Split-screen content editor
   */
  import { Save, PanelRightOpen, PanelRightClose } from "lucide-svelte";

  import MdxEditor from "../lib/components/editor/MdxEditor.svelte";
  import SEOAnalyzer from "../lib/components/editor/SEOAnalyzer.svelte";
  import type { SEOData } from "../lib/components/editor/SEOAnalyzer.svelte";
  import type { PageBlock } from "../types/blocks";

  // MDX content
  let content = $state(`# Welcome to the MDX Editor 🚀

This is a premium, split-screen editor designed for developers. It supports standard **Markdown** and *MDX* components.

## Features

- **Fast:** Debounced typing with live preview
- **Accurate:** Uses the real frontend engine
- **Clean:** No AI-slop wrappers

## Markdown Support

**Bold text**, *italic*, and \`inline code\`.

\`\`\`typescript
// Code blocks work too
const greeting = "Hello World";
console.log(greeting);
\`\`\`

> Go ahead, delete this text and start writing!
`);

  // SEO Data
  let seoData = $state<SEOData>({
    title: "",
    slug: "",
    seoTitle: "",
    seoDescription: "",
    ogImageUrl: ""
  });

  // Dynamic content blocks
  const blocks = $state<PageBlock[]>([]);

  // Panel visibility
  let showSEOPanel = $state(false);
  let showBlockPanel = $state(false);
</script>

<div class="h-[calc(100vh-4rem)] flex flex-col bg-gremius-bg">
  <!-- Header -->
  <div class="flex items-center justify-between px-4 sm:px-6 py-3 flex-shrink-0 border-b border-gremius-border bg-gremius-card">
    <div>
      <h1 class="text-lg font-bold text-gremius-text">Content Editor</h1>
      <p class="text-[11px] text-gremius-subtle mt-0.5">Markdown + Dynamic Blocks → JSONB</p>
    </div>
    
    <div class="flex items-center gap-2">
      <!-- Toggle SEO Panel -->
      <button
        onclick={() => showSEOPanel = !showSEOPanel}
        class="btn-ghost btn-sm gap-1.5 {showSEOPanel ? 'text-gremius-cyan bg-gremius-cyan-10' : ''}"
        title={showSEOPanel ? "Hide SEO panel" : "Show SEO panel"}
      >
        SEO
        {#if seoData.seoTitle}
          <span class="w-2 h-2 rounded-full bg-gremius-green"></span>
        {/if}
      </button>

      <!-- Toggle Blocks Panel -->
      <button
        onclick={() => showBlockPanel = !showBlockPanel}
        class="btn-ghost btn-sm gap-1.5 {showBlockPanel ? 'text-gremius-cyan bg-gremius-cyan-10' : ''}"
        title={showBlockPanel ? "Hide blocks panel" : "Show blocks panel"}
      >
        {#if showBlockPanel}
          <PanelRightClose class="w-4 h-4" />
        {:else}
          <PanelRightOpen class="w-4 h-4" />
        {/if}
        <span>Blocks</span>
        {#if blocks.length > 0}
          <span class="text-[10px] font-mono bg-gremius-cyan-20 text-gremius-cyan rounded-full px-1.5 py-0.5 leading-none">{blocks.length}</span>
        {/if}
      </button>

      <button class="btn-primary btn-sm gap-1.5">
        <Save class="w-4 h-4" />
        <span>Save Draft</span>
      </button>
    </div>
  </div>

  <!-- Main Area -->
  <div class="flex-1 min-h-0 flex">
    <!-- MDX Editor (flex-1) -->
    <div class="flex-1 min-w-0 p-4 sm:p-6">
      <MdxEditor bind:value={content} onChange={(v) => content = v} />
    </div>

    <!-- SEO Panel (conditional sidebar) -->
    {#if showSEOPanel}
      <div class="w-80 shrink-0 border-l border-gremius-border bg-gremius-card overflow-y-auto" transition:slide={{ duration: 200, axis: "x" }}>
        <div class="p-4">
          <SEOAnalyzer bind:data={seoData} onUpdate={(d) => seoData = d} />
        </div>
      </div>
    {/if}

    <!-- Block Editor Panel (conditional sidebar) -->
    {#if showBlockPanel}
      <div class="w-80 shrink-0 border-l border-gremius-border bg-gremius-card overflow-y-auto p-4" transition:slide={{ duration: 200, axis: "x" }}>
        <h3 class="text-sm font-semibold text-gremius-text mb-4">Content Blocks</h3>
        <p class="text-xs text-gremius-subtle">Block editor coming soon...</p>
      </div>
    {/if}
  </div>
</div>

<script module>
  import { slide } from "svelte/transition";
</script>
