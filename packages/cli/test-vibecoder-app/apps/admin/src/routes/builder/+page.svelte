<script lang="ts">
  import PageBuilder from "$lib/components/builder/PageBuilder.svelte";
  import { Save, ArrowLeft, Eye } from "lucide-svelte";
  import { goto } from "$app/navigation";
  import type { PageBlock } from "$types/blocks";

  let pageTitle = $state("New Page");
  let pageSlug = $state("");
  let blocks = $state<PageBlock[]>([]);
  let saving = $state(false);

  function handleSave() {
    saving = true;
    setTimeout(() => {
      console.log("Saving page:", { title: pageTitle, slug: pageSlug, blocks });
      saving = false;
    }, 1000);
  }

  function handlePreview() {
    window.open(`/preview/${pageSlug || "draft"}`, "_blank");
  }
</script>

<div class="h-[calc(100vh-4rem)] flex flex-col">
  <div class="flex items-center justify-between px-6 py-4 border-b border-gremius-border bg-gremius-card">
    <div class="flex items-center gap-4">
      <button onclick={() => goto("/")} class="btn-ghost p-2">
        <ArrowLeft class="w-5 h-5" />
      </button>
      <div>
        <input bind:value={pageTitle} type="text" placeholder="Page Title" class="bg-transparent text-xl font-bold text-gremius-text outline-none border-b border-transparent focus:border-gremius-cyan/50 transition-colors placeholder:text-gremius-subtle" />
        <div class="flex items-center gap-2 mt-1">
          <span class="text-xs text-gremius-subtle">/</span>
          <input bind:value={pageSlug} type="text" placeholder="page-slug" class="bg-transparent text-xs text-gremius-text-dim outline-none border-b border-transparent focus:border-gremius-cyan/50 transition-colors placeholder:text-gremius-subtle/50 font-mono" />
        </div>
      </div>
    </div>

    <div class="flex items-center gap-3">
      <button onclick={handlePreview} class="btn-ghost btn-sm gap-1.5">
        <Eye class="w-4 h-4" /> Preview
      </button>
      <button onclick={handleSave} disabled={saving} class="btn-primary btn-sm gap-1.5">
        {#if saving}
          <span class="w-4 h-4 border-2 border-gremius-bg border-t-transparent rounded-full animate-spin"></span>
          Saving...
        {:else}
          <Save class="w-4 h-4" /> Save Page
        {/if}
      </button>
    </div>
  </div>

  <div class="flex-1 p-6 overflow-hidden">
    <PageBuilder bind:blocks onChange={(b) => blocks = b} />
  </div>
</div>
