<script lang="ts">
  import { Plus, Database } from "lucide-svelte";
  import { onMount } from "svelte";

  import { api } from "$lib/api";
  import PageFromDataset from "$lib/components/blocks/PageFromDataset.svelte";

  interface Page {
    id: string;
    title: string;
    slug: string;
    status: "draft" | "published" | "archived";
    layout: string;
    publishedAt?: string;
  }

  let pages = $state<Page[]>([]);
  let loading = $state(true);
  let showDatasetModal = $state(false);

  onMount(async () => {
    try {
      const data = await api.get<{ pages: Page[] }>("/page-builder/pages");
      pages = data.pages || [];
    } catch {
      // empty
    } finally {
      loading = false;
    }
  });

  function statusColor(status: string): string {
    switch (status) {
      case "published":
        return "bg-kitsuden-green/10 text-kitsuden-green border-kitsuden-green/20";
      case "draft":
        return "bg-kitsuden-yellow/10 text-kitsuden-yellow border-kitsuden-yellow/20";
      case "archived":
        return "bg-kitsuden-subtle/10 text-kitsuden-subtle border-kitsuden-subtle/20";
      default:
        return "bg-kitsuden-surface text-kitsuden-text-dim";
    }
  }

  function layoutIcon(layout: string): string {
    switch (layout) {
      case "landing":
        return "🎯";
      case "content":
        return "📝";
      case "sidebar":
        return "📑";
      default:
        return "📄";
    }
  }

  async function handleDatasetSelect(data: any) {
    try {
      // Create the page via API with the blocks generated from dataset
      const page = await api.createPage({
        title: data.title,
        slug: data.slug,
        status: "draft",
        layout: "landing",
      });

      // Create blocks for the page
      if (data.blocks && data.blocks.length > 0) {
        for (const block of data.blocks) {
          await api.createBlock(page.id, {
            type: block.type,
            name: block.name,
            content: block.content,
            columnSpan: block.columnSpan || 12,
            sortOrder: block.sortOrder || 0,
          });
        }
      }

      // Refresh pages list
      const refreshed = await api.get<{ pages: Page[] }>("/page-builder/pages");
      pages = refreshed.pages || [];
    } catch (err: any) {
      console.error("Failed to create page from dataset:", err);
    }
  }
</script>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <div>
      <h2 class="text-xl font-bold text-kitsuden-text">Pages</h2>
      <p class="text-sm text-kitsuden-text-dim mt-0.5">Manage your landing pages and content</p>
    </div>
    <div class="flex items-center gap-2">
      <button
        class="btn-ghost inline-flex items-center gap-2"
        onclick={() => (showDatasetModal = true)}
      >
        <Database class="w-4 h-4" />
        From Dataset
      </button>
      <a href="/builder" class="btn-primary inline-flex items-center gap-2">
        <Plus class="w-4 h-4" /> New Page
      </a>
    </div>
  </div>

  {#if loading}
    <div class="flex justify-center py-20">
      <div
        class="w-6 h-6 border-2 border-kitsuden-accent/30 border-t-kitsuden-accent rounded-full animate-spin"
      ></div>
    </div>
  {:else if pages.length === 0}
    <div class="card p-16 text-center">
      <div class="text-4xl mb-3">🎯</div>
      <p class="text-kitsuden-text-dim">No pages yet.</p>
      <p class="text-xs text-kitsuden-subtle mt-1">Create your first landing page.</p>
    </div>
  {:else}
    <div class="space-y-3">
      {#each pages as page}
        <a
          href="/builder"
          class="card p-4 flex items-center justify-between group hover:border-kitsuden-accent/30 transition-colors"
        >
          <div class="flex items-center gap-4">
            <div
              class="w-10 h-10 rounded-lg bg-kitsuden-surface flex items-center justify-center text-xl"
            >
              {layoutIcon(page.layout)}
            </div>
            <div>
              <h3
                class="font-semibold text-kitsuden-text group-hover:text-kitsuden-accent transition-colors"
              >
                {page.title}
              </h3>
              <p class="text-xs text-kitsuden-subtle mt-0.5">
                /{page.slug} · {page.layout}
              </p>
            </div>
          </div>
          <span class="px-2 py-1 text-xs rounded-full border {statusColor(page.status)}">
            {page.status}
          </span>
        </a>
      {/each}
    </div>
  {/if}
</div>

<!-- From Dataset Modal -->
<PageFromDataset
  isOpen={showDatasetModal}
  onClose={() => (showDatasetModal = false)}
  onSelect={handleDatasetSelect}
/>
