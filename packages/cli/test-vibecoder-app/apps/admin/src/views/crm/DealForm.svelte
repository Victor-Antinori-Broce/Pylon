<script lang="ts">
  import { api } from "$lib/api";
  import Button from "$lib/components/ui/Button.svelte";
  import Input from "$lib/components/ui/Input.svelte";
  import Label from "$lib/components/ui/Label.svelte";
  import Textarea from "$lib/components/ui/Textarea.svelte";
  import { ArrowLeft } from "lucide-svelte";
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";

  import type { CrmDeal, CrmPipeline, CrmPipelineStage, CrmCompany, CrmContact } from "./types";

  interface Props {
    dealId?: string | null;
    onBack: () => void;
    onSave: () => void;
  }

  const { dealId = null, onBack, onSave }: Props = $props();

  let loading = $state(false);
  let pipelines = $state<CrmPipeline[]>([]);
  let stages = $state<CrmPipelineStage[]>([]);
  let companies = $state<CrmCompany[]>([]);
  let contacts = $state<CrmContact[]>([]);
  let tagsInput = $state("");

  let formData = $state<Partial<CrmDeal>>({
    title: "",
    description: "",
    value: 0,
    currency: "USD",
    status: "open",
    pipelineId: "",
    stageId: "",
    probability: 50,
    contactId: "",
    companyId: "",
    assignedTo: "",
    expectedCloseDate: "",
    source: "",
    campaign: "",
  });

  const statuses = [
    { value: "open", label: "Open" },
    { value: "won", label: "Won" },
    { value: "lost", label: "Lost" },
    { value: "paused", label: "Paused" },
  ];

  onMount(async () => {
    try {
      const [pipelinesRes, companiesRes, contactsRes] = await Promise.all([
        api.getCrmPipelines(),
        api.getCrmCompanies(),
        api.getCrmContacts(),
      ]);
      pipelines = pipelinesRes.data || [];
      companies = companiesRes.data || [];
      contacts = contactsRes.data || [];

      if (dealId) {
        const res = await api.getCrmDeal(dealId);
        const deal = res.data;
        formData = {
          ...deal,
          expectedCloseDate: deal.expectedCloseDate
            ? new Date(deal.expectedCloseDate).toISOString().split("T")[0]
            : "",
        };
        tagsInput = (deal.tags || []).join(", ");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load data");
    }
  });

  async function loadStages(pipelineId: string) {
    if (!pipelineId) {
      stages = [];
      return;
    }
    try {
      const res = await api.getCrmPipeline(pipelineId);
      stages = res.data.stages || [];
      if (!stages.find((s) => s.id === formData.stageId)) {
        formData.stageId = stages[0]?.id || "";
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load stages");
    }
  }

  $effect(() => {
    const pid = formData.pipelineId;
    if (pid) {
      loadStages(pid);
    } else {
      stages = [];
    }
  });

  async function handleSubmit() {
    if (!formData.title?.trim()) {
      toast.error("Deal title is required");
      return;
    }
    if (!formData.stageId) {
      toast.error("Stage is required");
      return;
    }

    try {
      loading = true;
      const payload = {
        ...formData,
        value: Number(formData.value) || 0,
        probability: Number(formData.probability) || 0,
        expectedCloseDate: formData.expectedCloseDate || undefined,
        tags: tagsInput.split(",").map((t) => t.trim()).filter(Boolean),
      };

      if (dealId) {
        await api.updateCrmDeal(dealId, payload);
        toast.success("Deal updated");
      } else {
        await api.createCrmDeal(payload);
        toast.success("Deal created");
      }
      onSave();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save deal");
    } finally {
      loading = false;
    }
  }
</script>

<div class="space-y-6">
  <div class="flex items-center gap-2 text-sm text-zinc-400">
    <Button variant="ghost" size="sm" onclick={onBack} class="gap-1">
      <ArrowLeft class="w-4 h-4" />
      Deals
    </Button>
    <span>/</span>
    <span class="text-zinc-100">{dealId ? 'Edit' : 'New'} Deal</span>
  </div>

  <div class="space-y-8">
    <section>
      <h3 class="text-sm font-semibold text-zinc-200 uppercase tracking-wider mb-3 border-b border-zinc-800 pb-2">Deal Information</h3>
      <div class="grid gap-4 md:grid-cols-2">
      <!-- Title -->
      <div class="space-y-2 md:col-span-2">
        <Label for="title">Deal Title <span class="text-red-400">*</span></Label>
        <Input id="title" bind:value={formData.title} placeholder="Enterprise Software License" />
      </div>

      <!-- Description -->
      <div class="space-y-2 md:col-span-2">
        <Label for="description">Description</Label>
        <Textarea
          id="description"
          bind:value={formData.description}
          placeholder="Deal details and notes..."
          rows={3}
        />
      </div>

      <!-- Value -->
      <div class="space-y-2">
        <Label for="value">Value (cents)</Label>
        <input
          id="value"
          type="number"
          class="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-400 focus:outline-none focus:border-zinc-500"
          bind:value={formData.value}
          placeholder="10000"
        />
      </div>

      <!-- Currency -->
      <div class="space-y-2">
        <Label for="currency">Currency</Label>
        <Input id="currency" bind:value={formData.currency} placeholder="USD" />
      </div>

      <!-- Status -->
      <div class="space-y-2">
        <Label for="status">Status</Label>
        <select
          id="status"
          class="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100"
          bind:value={formData.status}
        >
          {#each statuses as status}
            <option value={status.value}>{status.label}</option>
          {/each}
        </select>
      </div>

      <!-- Probability -->
      <div class="space-y-2">
        <Label for="probability">Probability (%)</Label>
        <input
          id="probability"
          type="number"
          min="0"
          max="100"
          class="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-400 focus:outline-none focus:border-zinc-500"
          bind:value={formData.probability}
          placeholder="50"
        />
      </div>

      <!-- Pipeline -->
      <div class="space-y-2">
        <Label for="pipelineId">Pipeline <span class="text-red-400">*</span></Label>
        <select
          id="pipelineId"
          class="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100"
          bind:value={formData.pipelineId}
        >
          <option value="">Select pipeline...</option>
          {#each pipelines as pipeline}
            <option value={pipeline.id}>{pipeline.name}</option>
          {/each}
        </select>
      </div>

      <!-- Stage -->
      <div class="space-y-2">
        <Label for="stageId">Stage <span class="text-red-400">*</span></Label>
        <select
          id="stageId"
          class="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100"
          bind:value={formData.stageId}
        >
          <option value="">Select stage...</option>
          {#each stages as stage}
            <option value={stage.id}>{stage.name}</option>
          {/each}
        </select>
      </div>

      <!-- Expected Close Date -->
      <div class="space-y-2">
        <Label for="expectedCloseDate">Expected Close Date</Label>
        <input
          id="expectedCloseDate"
          type="date"
          class="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-400 focus:outline-none focus:border-zinc-500"
          bind:value={formData.expectedCloseDate}
        />
      </div>

      <!-- Source -->
      <div class="space-y-2">
        <Label for="source">Source</Label>
        <Input id="source" bind:value={formData.source} placeholder="Website, Campaign, etc." />
      </div>

      <!-- Campaign -->
      <div class="space-y-2">
        <Label for="campaign">Campaign</Label>
        <Input id="campaign" bind:value={formData.campaign} placeholder="Summer 2024" />
      </div>

      <!-- Tags -->
      <div class="space-y-2 md:col-span-2">
        <Label for="tags">Tags</Label>
        <Input id="tags" bind:value={tagsInput} placeholder="enterprise, qualified, urgent (comma separated)" />
      </div>
    </div>
    </section>

    <section>
      <h3 class="text-sm font-semibold text-zinc-200 uppercase tracking-wider mb-3 border-b border-zinc-800 pb-2">Related Entities</h3>
      <div class="grid gap-4 md:grid-cols-2">
        <div class="space-y-2">
          <Label for="contactId">Related Contact</Label>
          <select id="contactId" class="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100" bind:value={formData.contactId}>
            <option value="">— None —</option>
            {#each contacts as c}
              <option value={c.id}>{c.firstName} {c.lastName}</option>
            {/each}
          </select>
        </div>
        <div class="space-y-2">
          <Label for="companyId">Related Company</Label>
          <select id="companyId" class="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100" bind:value={formData.companyId}>
            <option value="">— None —</option>
            {#each companies as c}
              <option value={c.id}>{c.name}</option>
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
        {loading ? "Saving..." : dealId ? "Save Changes" : "Create Deal"}
      </Button>
      <Button variant="outline" onclick={onBack} disabled={loading}>Cancel</Button>
    </div>
  </div>
</div>
