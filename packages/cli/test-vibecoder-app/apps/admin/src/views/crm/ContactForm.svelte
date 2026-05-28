<script lang="ts">
  import { onMount } from "svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import Input from "$lib/components/ui/Input.svelte";
  import Label from "$lib/components/ui/Label.svelte";
  import Textarea from "$lib/components/ui/Textarea.svelte";
  import { ArrowLeft, Save } from "lucide-svelte";
  import { toast } from "svelte-sonner";
  import { api } from "$lib/api";
  import type { CrmContact, CrmCompany } from "./types";

  interface Props {
    contactId?: string | null;
    onBack: () => void;
    onSave: () => void;
  }

  let { contactId = null, onBack, onSave }: Props = $props();

  let loading = $state(false);
  let companies = $state<CrmCompany[]>([]);
  let tagsInput = $state("");

  let formData = $state<Partial<CrmContact>>({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    mobile: "",
    jobTitle: "",
    department: "",
    status: "lead",
    companyId: "",
    assignedTo: "",
    source: "",
    score: 0,
    linkedin: "",
    twitter: "",
    address: "",
    city: "",
    country: "",
    notes: "",
  });

  const statuses = [
    { value: "lead", label: "Lead" },
    { value: "prospect", label: "Prospect" },
    { value: "customer", label: "Customer" },
    { value: "churned", label: "Churned" },
    { value: "archived", label: "Archived" },
  ];

  onMount(async () => {
    try {
      const [companiesRes] = await Promise.all([
        api.getCrmCompanies({ limit: 500 }),
      ]);
      companies = companiesRes.data || [];

      if (contactId) {
        const res = await api.getCrmContact(contactId);
        const contact = res.data;
        formData = { ...contact };
        tagsInput = (contact.tags || []).join(", ");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load data");
    }
  });

  async function handleSubmit() {
    if (!formData.firstName?.trim() || !formData.lastName?.trim() || !formData.email?.trim()) {
      toast.error("First name, last name and email are required");
      return;
    }

    try {
      loading = true;
      const payload = {
        ...formData,
        score: formData.score ? Number(formData.score) : 0,
        tags: tagsInput.split(",").map((t) => t.trim()).filter(Boolean),
      };

      if (contactId) {
        await api.updateCrmContact(contactId, payload);
        toast.success("Contact updated");
      } else {
        await api.createCrmContact(payload);
        toast.success("Contact created");
      }
      onSave();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save contact");
    } finally {
      loading = false;
    }
  }
</script>

<div class="space-y-6">
  <div class="flex items-center gap-2 text-sm text-zinc-400">
    <Button variant="ghost" size="sm" onclick={onBack} class="gap-1">
      <ArrowLeft class="w-4 h-4" />
      Contacts
    </Button>
    <span>/</span>
    <span class="text-zinc-100">{contactId ? 'Edit' : 'New'} Contact</span>
  </div>

  <div class="space-y-8">
    <section>
      <h3 class="text-sm font-semibold text-zinc-200 uppercase tracking-wider mb-3 border-b border-zinc-800 pb-2">Basic Information</h3>
      <div class="grid gap-4 md:grid-cols-2">
        <div class="space-y-2">
          <Label for="firstName">First Name <span class="text-red-400">*</span></Label>
          <Input id="firstName" bind:value={formData.firstName} placeholder="John" />
        </div>
        <div class="space-y-2">
          <Label for="lastName">Last Name <span class="text-red-400">*</span></Label>
          <Input id="lastName" bind:value={formData.lastName} placeholder="Doe" />
        </div>
        <div class="space-y-2 md:col-span-2">
          <Label for="email">Email <span class="text-red-400">*</span></Label>
          <Input id="email" type="email" bind:value={formData.email} placeholder="john.doe@example.com" />
        </div>
        <div class="space-y-2">
          <Label for="phone">Phone</Label>
          <Input id="phone" bind:value={formData.phone} placeholder="+1-555-1234" />
        </div>
        <div class="space-y-2">
          <Label for="mobile">Mobile</Label>
          <Input id="mobile" bind:value={formData.mobile} placeholder="+1-555-5678" />
        </div>
        <div class="space-y-2">
          <Label for="status">Status</Label>
          <select id="status" class="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100" bind:value={formData.status}>
            {#each statuses as s}
              <option value={s.value}>{s.label}</option>
            {/each}
          </select>
        </div>
        <div class="space-y-2">
          <Label for="score">Score (0-100)</Label>
          <input id="score" type="number" min="0" max="100" class="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-400 focus:outline-none focus:border-zinc-500" bind:value={formData.score} placeholder="0" />
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
          <Label for="assignedTo">Assigned To</Label>
          <Input id="assignedTo" bind:value={formData.assignedTo} placeholder="User ID" />
        </div>
      </div>
    </section>

    <section>
      <h3 class="text-sm font-semibold text-zinc-200 uppercase tracking-wider mb-3 border-b border-zinc-800 pb-2">Work Details</h3>
      <div class="grid gap-4 md:grid-cols-2">
        <div class="space-y-2">
          <Label for="jobTitle">Job Title</Label>
          <Input id="jobTitle" bind:value={formData.jobTitle} placeholder="CEO" />
        </div>
        <div class="space-y-2">
          <Label for="department">Department</Label>
          <Input id="department" bind:value={formData.department} placeholder="Sales" />
        </div>
        <div class="space-y-2">
          <Label for="source">Source</Label>
          <Input id="source" bind:value={formData.source} placeholder="Website, Referral..." />
        </div>
        <div class="space-y-2">
          <Label for="linkedin">LinkedIn</Label>
          <Input id="linkedin" bind:value={formData.linkedin} placeholder="linkedin.com/in/..." />
        </div>
        <div class="space-y-2">
          <Label for="twitter">Twitter</Label>
          <Input id="twitter" bind:value={formData.twitter} placeholder="@handle" />
        </div>
      </div>
    </section>

    <section>
      <h3 class="text-sm font-semibold text-zinc-200 uppercase tracking-wider mb-3 border-b border-zinc-800 pb-2">Location</h3>
      <div class="grid gap-4 md:grid-cols-2">
        <div class="space-y-2 md:col-span-2">
          <Label for="address">Address</Label>
          <Input id="address" bind:value={formData.address} placeholder="123 Main St" />
        </div>
        <div class="space-y-2">
          <Label for="city">City</Label>
          <Input id="city" bind:value={formData.city} placeholder="New York" />
        </div>
        <div class="space-y-2">
          <Label for="country">Country</Label>
          <Input id="country" bind:value={formData.country} placeholder="USA" />
        </div>
      </div>
    </section>

    <section>
      <h3 class="text-sm font-semibold text-zinc-200 uppercase tracking-wider mb-3 border-b border-zinc-800 pb-2">Notes & Tags</h3>
      <div class="grid gap-4 md:grid-cols-2">
        <div class="space-y-2 md:col-span-2">
          <Label for="notes">Notes</Label>
          <Textarea id="notes" bind:value={formData.notes} rows={3} placeholder="Additional notes..." />
        </div>
        <div class="space-y-2 md:col-span-2">
          <Label for="tags">Tags</Label>
          <Input id="tags" bind:value={tagsInput} placeholder="prospect, vip, follow-up (comma separated)" />
        </div>
      </div>
    </section>

    <div class="border-t border-zinc-800 pt-4 flex gap-2">
      <Button onclick={handleSubmit} disabled={loading}>
        {loading ? "Saving..." : contactId ? "Save Changes" : "Create Contact"}
      </Button>
      <Button variant="outline" onclick={onBack} disabled={loading}>Cancel</Button>
    </div>
  </div>
</div>
