<script lang="ts">
  import { api } from "$lib/api";
  import Badge from "$lib/components/ui/Badge.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import { Plus, Eye, Trash2 } from "lucide-svelte";
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";

  interface Props {
    onView: (id: string) => void;
    onCreate: () => void;
  }
  const { onView, onCreate }: Props = $props();

  let templates = $state<any[]>([]);
  let loading = $state(true);
  let typeFilter = $state("");

  async function load() {
    loading = true;
    try {
      const res = await api.getContaTemplates(typeFilter || undefined);
      templates = res.data || [];
    } catch (e: any) {
      toast.error("Error loading templates: " + e.message);
    } finally { loading = false; }
  }

  async function remove(id: string) {
    if (!confirm("Delete this template?")) return;
    try {
      await api.deleteContaTemplate(id);
      toast.success("Deleted");
      load();
    } catch (e: any) { toast.error(e.message); }
  }

  onMount(load);
</script>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <input bind:value={typeFilter} oninput={load} class="w-64 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm" placeholder="Filter by type..." />
    <Button onclick={onCreate}><Plus class="w-4 h-4 mr-2" /> New Template</Button>
  </div>

  {#if loading}
    <div class="flex items-center justify-center h-48"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div></div>
  {:else}
    <div class="border border-zinc-800 rounded-lg overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-zinc-900/80 text-zinc-400 text-left">
          <tr>
            <th class="px-4 py-3 font-medium">Name</th>
            <th class="px-4 py-3 font-medium">Type</th>
            <th class="px-4 py-3 font-medium">Rules</th>
            <th class="px-4 py-3 font-medium">Active</th>
            <th class="px-4 py-3 font-medium text-right">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-zinc-800">
          {#each templates as t}
            <tr class="hover:bg-zinc-800/30 transition-colors">
              <td class="px-4 py-3">{t.name}</td>
              <td class="px-4 py-3"><span class="text-xs bg-zinc-800 px-2 py-0.5 rounded">{t.templateType}</span></td>
              <td class="px-4 py-3 text-zinc-400">{(t.rules || []).length} rule(s)</td>
              <td class="px-4 py-3">
                {#if t.isActive}<Badge variant="success">Yes</Badge>{:else}<Badge variant="default">No</Badge>{/if}
              </td>
              <td class="px-4 py-3 text-right">
                <div class="flex items-center justify-end gap-2">
                  <Button variant="ghost" size="sm" onclick={() => onView(t.id)}><Eye class="w-4 h-4" /></Button>
                  <Button variant="ghost" size="sm" onclick={() => remove(t.id)}><Trash2 class="w-4 h-4 text-red-400" /></Button>
                </div>
              </td>
            </tr>
          {:else}
            <tr><td colspan="5" class="px-4 py-12 text-center text-zinc-500">No templates found.</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
