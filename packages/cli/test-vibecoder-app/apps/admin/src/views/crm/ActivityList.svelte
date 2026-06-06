<script lang="ts">
  import { api } from "$lib/api";
  import Badge from "$lib/components/ui/Badge.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import Input from "$lib/components/ui/Input.svelte";
  import { Plus, Search, Eye, Trash2, CheckCircle2 } from "lucide-svelte";
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";

  import type { CrmActivity } from "./types";

  interface Props {
    onView: (id: string) => void;
    onCreate: () => void;
  }
  const { onView, onCreate }: Props = $props();

  let activities = $state<CrmActivity[]>([]);
  let loading = $state(true);
  let searchQuery = $state("");
  let typeFilter = $state("");
  let completedFilter = $state("");
  let totalCount = $state(0);

  const activityTypes = [
    { value: "call", label: "Call" },
    { value: "email", label: "Email" },
    { value: "meeting", label: "Meeting" },
    { value: "task", label: "Task" },
    { value: "note", label: "Note" },
    { value: "sms", label: "SMS" },
    { value: "demo", label: "Demo" },
  ];

  const typeColors: Record<string, string> = {
    call: "bg-blue-500",
    email: "bg-green-500",
    meeting: "bg-purple-500",
    task: "bg-yellow-500",
    note: "bg-gray-500",
    sms: "bg-pink-500",
    demo: "bg-orange-500",
  };

  async function load() {
    loading = true;
    try {
      const res = await api.getCrmActivities({
        type: typeFilter || undefined,
        completed: completedFilter || undefined,
        search: searchQuery || undefined,
        limit: 50,
      });
      activities = res.data || [];
      totalCount = res.pagination?.total ?? activities.length;
    } catch (e: any) {
      toast.error("Error loading activities: " + e.message);
    } finally {
      loading = false;
    }
  }

  async function complete(id: string) {
    try {
      await api.completeCrmActivity(id, { outcome: "completed" });
      toast.success("Activity completed");
      load();
    } catch (e: any) {
      toast.error("Failed to complete: " + e.message);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this activity?")) return;
    try {
      await api.deleteCrmActivity(id);
      toast.success("Activity deleted");
      load();
    } catch (e: any) {
      toast.error("Failed to delete: " + e.message);
    }
  }

  function relatedTo(a: CrmActivity): string {
    if (a.contact) return `Contact: ${a.contact.firstName} ${a.contact.lastName}`;
    if (a.company) return `Company: ${a.company.name}`;
    if (a.deal) return `Deal: ${a.deal.title}`;
    return "—";
  }

  function formatDate(date?: string): string {
    if (!date) return "—";
    return new Date(date).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function isOverdue(dueDate?: string): boolean {
    if (!dueDate) return false;
    const d = new Date(dueDate);
    const now = new Date();
    return d < now && d.toDateString() !== now.toDateString();
  }

  onMount(load);
</script>

<div class="space-y-4">
  <div class="flex items-center justify-between gap-4 flex-wrap">
    <div class="flex items-center gap-3 flex-1">
      <div class="relative flex-1 max-w-sm">
        <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
        <Input bind:value={searchQuery} class="pl-9" placeholder="Search activities..." onkeydown={(e) => e.key === 'Enter' && load()} />
      </div>
      <select bind:value={typeFilter} onchange={load} class="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100">
        <option value="">All Types</option>
        {#each activityTypes as t}
          <option value={t.value}>{t.label}</option>
        {/each}
      </select>
      <select bind:value={completedFilter} onchange={load} class="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100">
        <option value="">All Status</option>
        <option value="false">Pending</option>
        <option value="true">Completed</option>
      </select>
    </div>
    <Button variant="outline" size="sm" onclick={load}>Search</Button>
    <Button onclick={onCreate}><Plus class="w-4 h-4 mr-2" /> Add Activity</Button>
  </div>

  {#if loading}
    <div class="flex items-center justify-center h-48"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div></div>
  {:else}
    <div class="border border-zinc-800 rounded-lg overflow-hidden">
      <div class="flex items-center justify-between px-4 py-2 bg-zinc-900/40 border-b border-zinc-800 text-xs text-zinc-500">
        <span>{activities.length} of {totalCount} activities</span>
      </div>
      <table class="w-full text-sm">
        <thead class="bg-zinc-900/80 text-zinc-400 text-left sticky top-0">
          <tr>
            <th class="px-4 py-3 font-medium">Type</th>
            <th class="px-4 py-3 font-medium">Subject</th>
            <th class="px-4 py-3 font-medium">Related To</th>
            <th class="px-4 py-3 font-medium">Due Date</th>
            <th class="px-4 py-3 font-medium">Status</th>
            <th class="px-4 py-3 font-medium text-right">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-zinc-800">
          {#each activities as a}
            <tr class="hover:bg-zinc-800/50 transition-colors even:bg-zinc-900/20 {a.completedAt ? 'opacity-60' : ''}">
              <td class="px-4 py-3">
                <span class="inline-flex items-center gap-1 font-medium rounded-full border px-2 py-0.5 text-xs {typeColors[a.type] || 'bg-gray-500'} text-white capitalize">
                  {a.type}
                </span>
              </td>
              <td class="px-4 py-3 text-zinc-100 font-medium">{a.subject}</td>
              <td class="px-4 py-3 text-zinc-400">{relatedTo(a)}</td>
              <td class="px-4 py-3 {isOverdue(a.dueDate) && !a.completedAt ? 'text-red-400 font-medium' : 'text-zinc-400'}">
                {formatDate(a.dueDate)}
              </td>
              <td class="px-4 py-3">
                {#if a.completedAt}
                  <Badge variant="success">Completed</Badge>
                {:else if isOverdue(a.dueDate)}
                  <Badge variant="error">Overdue</Badge>
                {:else}
                  <Badge variant="default">Pending</Badge>
                {/if}
              </td>
              <td class="px-4 py-3 text-right">
                <div class="flex items-center justify-end gap-2">
                  {#if !a.completedAt}
                    <Button variant="ghost" size="sm" onclick={() => complete(a.id)}><CheckCircle2 class="w-4 h-4 text-emerald-400" /></Button>
                  {/if}
                  <Button variant="ghost" size="sm" onclick={() => onView(a.id)}><Eye class="w-4 h-4" /></Button>
                  <Button variant="ghost" size="sm" onclick={() => remove(a.id)}><Trash2 class="w-4 h-4 text-red-400" /></Button>
                </div>
              </td>
            </tr>
          {:else}
            <tr><td colspan="6" class="px-4 py-12 text-center text-zinc-500">No activities found.</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
