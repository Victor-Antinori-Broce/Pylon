<script lang="ts">
  import { api } from "$lib/api";
  import Button from "$lib/components/ui/Button.svelte";
  import Input from "$lib/components/ui/Input.svelte";
  import Label from "$lib/components/ui/Label.svelte";
  import { ArrowLeft } from "lucide-svelte";
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";

  import type { CrmCompany } from "./types";

  interface Props {
    companyId?: string | null;
    onBack: () => void;
    onSave: () => void;
  }

  const { companyId = null, onBack, onSave }: Props = $props();

  let loading = $state(false);

  let formData = $state<Partial<CrmCompany>>({
    name: "",
    email: "",
    phone: "",
    website: "",
    industry: "",
    size: "",
    description: "",
    address: "",
    city: "",
    state: "",
    postalCode: "",
    country: "",
    linkedinUrl: "",
    twitterHandle: "",
    employeeCount: undefined,
    annualRevenue: undefined,
  });

  const industries = [
    { value: "", label: "Select Industry..." },
    { value: "technology", label: "Technology" },
    { value: "healthcare", label: "Healthcare" },
    { value: "finance", label: "Finance" },
    { value: "retail", label: "Retail" },
    { value: "manufacturing", label: "Manufacturing" },
    { value: "education", label: "Education" },
    { value: "consulting", label: "Consulting" },
    { value: "marketing", label: "Marketing" },
    { value: "other", label: "Other" },
  ];

  onMount(async () => {
    if (!companyId) return;
    try {
      const res = await api.getCrmCompany(companyId);
      formData = { ...res.data };
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load company");
    }
  });

  async function handleSubmit() {
    if (!formData.name?.trim()) {
      toast.error("Company name is required");
      return;
    }

    try {
      loading = true;
      const payload = {
        ...formData,
        employeeCount: formData.employeeCount ? Number(formData.employeeCount) : undefined,
        annualRevenue: formData.annualRevenue ? Number(formData.annualRevenue) : undefined,
      };

      if (companyId) {
        await api.updateCrmCompany(companyId, payload);
        toast.success("Company updated");
      } else {
        await api.createCrmCompany(payload);
        toast.success("Company created");
      }
      onSave();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save company");
    } finally {
      loading = false;
    }
  }
</script>

<div class="space-y-6">
  <div class="flex items-center gap-2 text-sm text-zinc-400">
    <Button variant="ghost" size="sm" onclick={onBack} class="gap-1">
      <ArrowLeft class="w-4 h-4" />
      Companies
    </Button>
    <span>/</span>
    <span class="text-zinc-100">{companyId ? 'Edit' : 'New'} Company</span>
  </div>

  <div class="space-y-8">
    <!-- Basic Information -->
    <section>
      <h3 class="text-sm font-semibold text-zinc-200 uppercase tracking-wider mb-3 border-b border-zinc-800 pb-2">Basic Information</h3>
      <div class="grid gap-4 md:grid-cols-2">
      <!-- Name -->
      <div class="space-y-2 md:col-span-2">
        <Label for="name">Company Name <span class="text-red-400">*</span></Label>
        <Input id="name" bind:value={formData.name} placeholder="Acme Inc." />
      </div>

      <!-- Email -->
      <div class="space-y-2">
        <Label for="email">Email</Label>
        <Input id="email" type="email" bind:value={formData.email} placeholder="contact@company.com" />
      </div>

      <!-- Phone -->
      <div class="space-y-2">
        <Label for="phone">Phone</Label>
        <Input id="phone" bind:value={formData.phone} placeholder="+1 (555) 123-4567" />
      </div>

      <!-- Website -->
      <div class="space-y-2">
        <Label for="website">Website</Label>
        <Input id="website" bind:value={formData.website} placeholder="www.company.com" />
      </div>

      <!-- Industry -->
      <div class="space-y-2">
        <Label for="industry">Industry</Label>
        <select
          id="industry"
          class="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100"
          bind:value={formData.industry}
        >
          {#each industries as industry}
            <option value={industry.value}>{industry.label}</option>
          {/each}
        </select>
      </div>

      <!-- Size -->
      <div class="space-y-2">
        <Label for="size">Size</Label>
        <Input id="size" bind:value={formData.size} placeholder="1-10, 11-50, etc." />
      </div>

      <!-- Employee Count -->
      <div class="space-y-2">
        <Label for="employeeCount">Employee Count</Label>
        <input
          id="employeeCount"
          type="number"
          class="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-400 focus:outline-none focus:border-zinc-500"
          bind:value={formData.employeeCount}
          placeholder="100"
        />
      </div>

      <!-- Annual Revenue -->
      <div class="space-y-2">
        <Label for="annualRevenue">Annual Revenue ($)</Label>
        <input
          id="annualRevenue"
          type="number"
          class="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-400 focus:outline-none focus:border-zinc-500"
          bind:value={formData.annualRevenue}
          placeholder="1000000"
        />
      </div>

      </div>
    </section>

    <!-- Address -->
    <section>
      <h3 class="text-sm font-semibold text-zinc-200 uppercase tracking-wider mb-3 border-b border-zinc-800 pb-2">Address</h3>
      <div class="grid gap-4 md:grid-cols-2">
        <div class="space-y-2 md:col-span-2">
          <Label for="address">Street Address</Label>
          <Input id="address" bind:value={formData.address} placeholder="123 Main St" />
        </div>
        <div class="space-y-2">
          <Label for="city">City</Label>
          <Input id="city" bind:value={formData.city} placeholder="New York" />
        </div>
        <div class="space-y-2">
          <Label for="state">State</Label>
          <Input id="state" bind:value={formData.state} placeholder="NY" />
        </div>
        <div class="space-y-2">
          <Label for="postalCode">Postal Code</Label>
          <Input id="postalCode" bind:value={formData.postalCode} placeholder="10001" />
        </div>
        <div class="space-y-2">
          <Label for="country">Country</Label>
          <Input id="country" bind:value={formData.country} placeholder="USA" />
        </div>
      </div>
    </section>

    <!-- Social & Online -->
    <section>
      <h3 class="text-sm font-semibold text-zinc-200 uppercase tracking-wider mb-3 border-b border-zinc-800 pb-2">Social & Online</h3>
      <div class="grid gap-4 md:grid-cols-2">
        <div class="space-y-2">
          <Label for="linkedinUrl">LinkedIn URL</Label>
          <Input id="linkedinUrl" bind:value={formData.linkedinUrl} placeholder="https://linkedin.com/company/..." />
        </div>
        <div class="space-y-2">
          <Label for="twitterHandle">Twitter Handle</Label>
          <Input id="twitterHandle" bind:value={formData.twitterHandle} placeholder="@company" />
        </div>
      </div>
    </section>
    <div class="border-t border-zinc-800 pt-4 flex gap-2">
      <Button onclick={handleSubmit} disabled={loading}>
        {loading ? "Saving..." : companyId ? "Save Changes" : "Create Company"}
      </Button>
      <Button variant="outline" onclick={onBack} disabled={loading}>Cancel</Button>
    </div>
  </div>
</div>
