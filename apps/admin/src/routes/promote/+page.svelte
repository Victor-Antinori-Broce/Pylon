<script lang="ts">
  import { Megaphone } from "lucide-svelte";
</script>

<div class="space-y-6">
  <div class="flex items-center gap-3">
    <div class="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
      <Megaphone class="w-5 h-5 text-emerald-400" />
    </div>
    <div>
      <h1 class="text-xl font-bold text-gremius-text">Promote to Content</h1>
      <p class="text-sm text-gremius-text-dim">Transform data entries into publishable CMS content with SEO metadata</p>
    </div>
  </div>

  <div class="rounded-xl border border-gremius-border bg-gremius-card p-8 text-center">
    <p class="text-gremius-text-dim text-sm">
      Select a Data Set to promote its entries to publishable content with slugs, SEO metadata, and authorship.
    </p>
    <p class="text-gremius-subtle text-xs mt-2">
      Use the API at <code class="text-gremius-cyan">/api/custom/promote</code> to manage content promotion.
    </p>
  </div>
</div>
