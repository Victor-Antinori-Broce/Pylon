<script lang="ts">
  import { api } from "$lib/api";
  import Button from "$lib/components/ui/Button.svelte";
  import Input from "$lib/components/ui/Input.svelte";
  import Label from "$lib/components/ui/Label.svelte";
  import Textarea from "$lib/components/ui/Textarea.svelte";
  import { ArrowLeft } from "lucide-svelte";
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";

  import type { CrmActivity, CrmContact, CrmCompany, CrmDeal } from "./types";

  interface Props {
    activityId?: string | null;
    onBack: () => void;
    onSave: () => void;
  }

  const { activityId = null, onBack, onSave }: Props = $props();

  let loading = $state(false);
  let contacts = $state<CrmContact[]>([]);
  let companies = $state<CrmCompany[]>([]);
  let deals = $state<CrmDeal[]>([]);

  let formData = $state<Partial<CrmActivity>>({
    type: "task",
    subject: "",
    description: "",
    contactId: "",
    companyId: "",
    dealId: "",
    assignedTo: "",
    dueDate: "",
    durationMinutes: undefined,
    outcome: "",
    notes: "",
  });

  const activityTypes = [
    { value: "call", label: "Call" },
    { value: "email", label: "Email" },
    { value: "meeting", label: "Meeting" },
    { value: "task", label: "Task" },
    { value: "note", label: "Note" },
    { value: "sms", label: "SMS" },
    { value: "demo", label: "Demo" },
  ];

  onMount(async () => {
    try {
      const [contactsRes, companiesRes, dealsRes] = await Promise.all([
        api.getCrmContacts(),
        api.getCrmCompanies(),
        api.getCrmDeals(),
      ]);
      contacts = contactsRes.data || [];
      companies = companiesRes.data || [];
      deals = dealsRes.data || [];

      if (activityId) {
        const res = await api.getCrmActivity(activityId);
        const activity = res.data;
        formData = {
          ...activity,
          dueDate: activity.dueDate
            ? new Date(activity.dueDate).toISOString().slice(0, 16)
            : "",
        };
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load data");
    }
  });

  async function handleSubmit() {
    if (!formData.subject?.trim()) {
      toast.error("Subject is required");
      return;
    }

    try {
      loading = true;
      const payload = {
        ...formData,
        dueDate: formData.dueDate || undefined,
        durationMinutes: formData.durationMinutes ? Number(formData.durationMinutes) : undefined,
      };

      if (activityId) {
        await api.updateCrmActivity(activityId, payload);
        toast.success("Activity updated");
      } else {
        await api.createCrmActivity(payload);
        toast.success("Activity created");
      }
      onSave();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save activity");
    } finally {
      loading = false;
    }
  }
</script>

<div class="space-y-6">
  <div class="flex items-center gap-2 text-sm text-zinc-400">
    <Button variant="ghost" size="sm" onclick={onBack} class="gap-1">
      <ArrowLeft class="w-4 h-4" />
      Activities
    </Button>
    <span>/</span>
    <span class="text-zinc-100">{activityId ? 'Edit' : 'New'} Activity</span>
  </div>

  <div class="space-y-8">
    <section>
      <h3 class="text-sm font-semibold text-zinc-200 uppercase tracking-wider mb-3 border-b border-zinc-800 pb-2">Activity Details</h3>
      <div class="grid gap-4 md:grid-cols-2">
      <!-- Type -->
      <div class="space-y-2">
        <Label for="type">Type <span class="text-red-400">*</span></Label>
        <select
          id="type"
          class="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100"
          bind:value={formData.type}
        >
          {#each activityTypes as type}
            <option value={type.value}>{type.label}</option>
          {/each}
        </select>
      </div>

      <!-- Subject -->
      <div class="space-y-2">
        <Label for="subject">Subject <span class="text-red-400">*</span></Label>
        <Input id="subject" bind:value={formData.subject} placeholder="Follow-up call with prospect" />
      </div>

      <!-- Description -->
      <div class="space-y-2 md:col-span-2">
        <Label for="description">Description</Label>
        <Textarea
          id="description"
          bind:value={formData.description}
          placeholder="Details about this activity..."
          rows={3}
        />
      </div>

      <!-- Due Date -->
      <div class="space-y-2">
        <Label for="dueDate">Due Date</Label>
        <input
          id="dueDate"
          type="datetime-local"
          class="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-400 focus:outline-none focus:border-zinc-500"
          bind:value={formData.dueDate}
        />
      </div>

      <!-- Duration -->
      <div class="space-y-2">
        <Label for="durationMinutes">Duration (minutes)</Label>
        <input
          id="durationMinutes"
          type="number"
          class="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-400 focus:outline-none focus:border-zinc-500"
          bind:value={formData.durationMinutes}
          placeholder="30"
        />
      </div>

      <!-- Outcome -->
      <div class="space-y-2">
        <Label for="outcome">Outcome</Label>
        <Input id="outcome" bind:value={formData.outcome} placeholder="Completed, No answer, etc." />
      </div>

      <!-- Notes -->
      <div class="space-y-2 md:col-span-2">
        <Label for="notes">Notes</Label>
        <Textarea id="notes" bind:value={formData.notes} placeholder="Outcome and additional notes..." rows={3} />
      </div>
    </div>
    </section>

    <section>
      <h3 class="text-sm font-semibold text-zinc-200 uppercase tracking-wider mb-3 border-b border-zinc-800 pb-2">Related To</h3>
      <div class="grid gap-4 md:grid-cols-2">
        <div class="space-y-2">
          <Label for="contactId">Contact</Label>
          <select id="contactId" class="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100" bind:value={formData.contactId}>
            <option value="">— None —</option>
            {#each contacts as c}
              <option value={c.id}>{c.firstName} {c.lastName}</option>
            {/each}
          </select>
        </div>
        <div class="space-y-2">
          <Label for="companyId">Company</Label>
          <select id="companyId" class="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100" bind:value={formData.companyId}>
            <option value="">— None —</option>
            {#each companies as c}
              <option value={c.id}>{c.name}</option>
            {/each}
          </select>
        </div>
        <div class="space-y-2">
          <Label for="dealId">Deal</Label>
          <select id="dealId" class="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100" bind:value={formData.dealId}>
            <option value="">— None —</option>
            {#each deals as d}
              <option value={d.id}>{d.title}</option>
            {/each}
          </select>
        </div>
        <div class="space-y-2">
          <Label for="assignedTo">Assigned To</Label>
          <Input id="assignedTo" bind:value={formData.assignedTo} placeholder="User ID" />
        </div>
      </div>
    </section>

    <div class="border-t border-zinc-800 pt-4 flex gap-2">
      <Button onclick={handleSubmit} disabled={loading}>
        {loading ? "Saving..." : activityId ? "Save Changes" : "Create Activity"}
      </Button>
      <Button variant="outline" onclick={onBack} disabled={loading}>Cancel</Button>
    </div>
  </div>
</div>
