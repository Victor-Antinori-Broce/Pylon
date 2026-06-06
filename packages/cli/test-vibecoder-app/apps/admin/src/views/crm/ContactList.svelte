<script lang="ts">
  import { api } from "$lib/api";
  import Button from "$lib/components/ui/Button.svelte";
  import Input from "$lib/components/ui/Input.svelte";
  import { Plus, Search, Eye, Trash2 } from "lucide-svelte";
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";

  import type { CrmContact, CrmCompany } from "./types";

  interface Props {
    onView: (id: string) => void;
    onCreate: () => void;
  }
  const { onView, onCreate }: Props = $props();

  let contacts = $state<CrmContact[]>([]);
  let companies = $state<Record<string, CrmCompany>>({});
  let loading = $state(true);
  let searchQuery = $state("");
  let statusFilter = $state("");
  let totalCount = $state(0);

  const statusColors: Record<string, string> = {
    lead: "bg-gray-500",
    prospect: "bg-blue-500",
    customer: "bg-green-500",
    churned: "bg-red-500",
    archived: "bg-gray-400",
  };

  async function load() {
    loading = true;
    try {
      const res = await api.getCrmContacts({
        status: statusFilter || undefined,
        search: searchQuery || undefined,
        limit: 50,
      });
      contacts = res.data || [];
      totalCount = res.pagination?.total ?? contacts.length;
      await loadCompanies();
    } catch (e: any) {
      toast.error("Error loading contacts: " + e.message);
    } finally {
      loading = false;
    }
  }

  async function loadCompanies() {
    const companyIds = [...new Set(contacts.filter((c) => c.companyId).map((c) => c.companyId!))];
    if (companyIds.length === 0) return;
    try {
      const res = await api.getCrmCompanies({ limit: 500 });
      const all = res.data || [];
      const map: Record<string, CrmCompany> = {};
      for (const c of all) {
        map[c.id] = c;
      }
      companies = map;
    } catch (e: any) {
      console.error("Failed to load companies", e);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this contact?")) return;
    try {
      await api.deleteCrmContact(id);
      toast.success("Contact deleted");
      load();
    } catch (e: any) {
      toast.error("Failed to delete: " + e.message);
    }
  }

  onMount(load);
</script>

<div class="space-y-4">
  <div class="flex items-center justify-between gap-4">
    <div class="flex items-center gap-3 flex-1">
      <div class="relative flex-1 max-w-sm">
        <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
        <Input bind:value={searchQuery} class="pl-9" placeholder="Search contacts..." onkeydown={(e) => e.key === 'Enter' && load()} />
      </div>
      <Button variant="outline" size="sm" onclick={load}>Search</Button>
      <select bind:value={statusFilter} onchange={load} class="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100">
        <option value="">All Status</option>
        <option value="lead">Lead</option>
        <option value="prospect">Prospect</option>
        <option value="customer">Customer</option>
        <option value="churned">Churned</option>
        <option value="archived">Archived</option>
      </select>
    </div>
    <Button onclick={onCreate}><Plus class="w-4 h-4 mr-2" /> Add Contact</Button>
  </div>

  {#if loading}
    <div class="flex items-center justify-center h-48"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div></div>
  {:else}
    <div class="border border-zinc-800 rounded-lg overflow-hidden">
      <div class="flex items-center justify-between px-4 py-2 bg-zinc-900/40 border-b border-zinc-800 text-xs text-zinc-500">
        <span>{contacts.length} of {totalCount} contacts</span>
      </div>
      <table class="w-full text-sm">
        <thead class="bg-zinc-900/80 text-zinc-400 text-left sticky top-0">
          <tr>
            <th class="px-4 py-3 font-medium">Name</th>
            <th class="px-4 py-3 font-medium">Email</th>
            <th class="px-4 py-3 font-medium">Phone</th>
            <th class="px-4 py-3 font-medium">Company</th>
            <th class="px-4 py-3 font-medium">Status</th>
            <th class="px-4 py-3 font-medium">Score</th>
            <th class="px-4 py-3 font-medium text-right">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-zinc-800">
          {#each contacts as c}
            <tr class="hover:bg-zinc-800/50 transition-colors even:bg-zinc-900/20">
              <td class="px-4 py-3 text-zinc-100 font-medium">{c.firstName} {c.lastName}</td>
              <td class="px-4 py-3 text-zinc-400">{c.email}</td>
              <td class="px-4 py-3 text-zinc-400">{c.phone || "—"}</td>
              <td class="px-4 py-3 text-zinc-400">
                {#if c.companyId && companies[c.companyId]}
                  {companies[c.companyId].name}
                {:else}
                  <span class="text-zinc-600">—</span>
                {/if}
              </td>
              <td class="px-4 py-3">
                <span class="inline-flex items-center gap-1 font-medium rounded-full border px-2 py-0.5 text-xs {statusColors[c.status] || 'bg-gray-500'} text-white capitalize">
                  {c.status}
                </span>
              </td>
              <td class="px-4 py-3 text-zinc-300">{c.score} / 100</td>
              <td class="px-4 py-3 text-right">
                <div class="flex items-center justify-end gap-2">
                  <Button variant="ghost" size="sm" onclick={() => onView(c.id)}><Eye class="w-4 h-4" /></Button>
                  <Button variant="ghost" size="sm" onclick={() => remove(c.id)}><Trash2 class="w-4 h-4 text-red-400" /></Button>
                </div>
              </td>
            </tr>
          {:else}
            <tr><td colspan="7" class="px-4 py-12 text-center text-zinc-500">No contacts found.</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
