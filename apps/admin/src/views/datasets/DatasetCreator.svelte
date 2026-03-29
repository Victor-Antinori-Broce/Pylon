<script lang="ts">
  /**
   * DatasetCreator - Creador de Datasets con soporte para campos calculados
   * 
   * Vista para crear y configurar datasets con:
   * - Campos nativos
   * - Campos calculados/KPIs
   * - Relaciones
   * - Vistas del DataExplorer
   */
  import { Plus, Settings, Table2, Calculator, ChevronRight, Save, X, Loader2 } from "lucide-svelte";
  import { KpiCreator, FormulaBuilder, type CalculatedField } from "$lib/components/calculated-fields";
  import { goto } from "$app/navigation";
  import { datasetStore } from "$lib/states/datasets.svelte";
  import type { CreateDatasetPayload, FieldDefinition } from "@gremius/shared";
  
  // Tipos de campo nativos
  const nativeFieldTypes = [
    { id: "text", label: "Text", description: "Short text input" },
    { id: "textarea", label: "Long Text", description: "Multi-line text" },
    { id: "number", label: "Number", description: "Numeric value" },
    { id: "boolean", label: "Boolean", description: "Yes/No toggle" },
    { id: "date", label: "Date", description: "Date picker" },
    { id: "datetime", label: "Date & Time", description: "Timestamp" },
    { id: "select", label: "Select", description: "Dropdown options" },
    { id: "multiselect", label: "Multi Select", description: "Multiple choices" },
    { id: "relation", label: "Relation", description: "Link to another table" },
    { id: "media", label: "Media", description: "Images or files" },
    { id: "kpi", label: "KPI", description: "Calculated metric" },
  ];
  
  // Estado
  let step = $state(1);
  let datasetName = $state("");
  let datasetLabel = $state("");
  let description = $state("");
  
  // Campos
  let fields = $state<Array<{ id: string; name: string; label: string; type: string; config?: any }>>([]);
  let calculatedFields = $state<CalculatedField[]>([]);
  
  // UI state
  let showAddField = $state(false);
  let showAddCalculated = $state(false);
  let editingField = $state<any>(null);
  
  // Preview field para formula builder
  let previewFormula = $state("");
  
  const steps = [
    { id: 1, label: "Basic Info", icon: Settings },
    { id: 2, label: "Fields", icon: Table2 },
    { id: 3, label: "Calculated Fields", icon: Calculator },
    { id: 4, label: "Review", icon: Save },
  ];
  
  function addField(type: string) {
    const id = crypto.randomUUID();
    fields = [...fields, { 
      id, 
      name: ``, 
      label: `New ${type}`, 
      type,
      config: {}
    }];
    editingField = fields[fields.length - 1];
    showAddField = false;
  }
  
  function removeField(index: number) {
    const field = fields[index];
    fields = fields.filter((_, i) => i !== index);
    
    // Remover campos calculados que dependen de este campo
    calculatedFields = calculatedFields.filter(cf => 
      !cf.dependsOn?.includes(field.name)
    );
  }
  
  function addCalculatedField(field: CalculatedField) {
    calculatedFields = [...calculatedFields, field];
    showAddCalculated = false;
  }
  
  function removeCalculatedField(index: number) {
    calculatedFields = calculatedFields.filter((_, i) => i !== index);
  }
  
  async function saveDataset() {
    // Transformar campos al formato FieldDefinition
    const transformedFields: FieldDefinition[] = fields.map((f, index) => ({
      id: f.id,
      key: f.name,
      label: f.label,
      type: f.type as any, // Mapear tipos nativos a FieldType
      order: index,
      isRequired: false,
      isUnique: false,
      hidden: false,
      ...f.config
    }));
    
    // Agregar campos calculados como campos de tipo KPI
    const calculatedFieldsAsKpi: FieldDefinition[] = calculatedFields.map((cf, index) => ({
      id: cf.id,
      key: cf.name,
      label: cf.label,
      type: "kpi",
      order: fields.length + index,
      isRequired: false,
      isUnique: false,
      hidden: false,
      helpText: cf.config?.expression || `${cf.type} calculation`,
    }));
    
    const payload: CreateDatasetPayload = {
      name: datasetLabel,
      slug: datasetName,
      description: description || undefined,
      fields: [...transformedFields, ...calculatedFieldsAsKpi],
      policyJson: null,
      workflowJson: null,
    };
    
    const result = await datasetStore.createDataset(payload);
    
    if (result) {
      goto("/datasets");
    } else {
      alert(`Failed to create dataset: ${datasetStore.error}`);
    }
  }
  
  // Generar nombre desde label
  $effect(() => {
    if (datasetLabel && !datasetName) {
      datasetName = datasetLabel
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
    }
  });
  
  // Campos disponibles para fórmulas
  let availableFormulaFields = $derived([
    ...fields.map(f => ({ name: f.name, label: f.label, type: f.type })),
    ...calculatedFields.map(f => ({ name: f.name, label: f.label, type: "number" }))
  ].filter(f => f.name));
</script>

<div class="max-w-5xl mx-auto space-y-6">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div>
      <h1 class="text-2xl font-bold text-gremius-text flex items-center gap-3">
        <Plus class="w-6 h-6 text-gremius-cyan" />
        Create Dataset
      </h1>
      <p class="text-gremius-subtle mt-1">Define your data structure with fields and KPIs</p>
    </div>
    <div class="flex items-center gap-2">
      {#if step > 1}
        <button class="btn-secondary" onclick={() => step--}>
          Back
        </button>
      {/if}
      {#if step < 4}
        <button class="btn-primary flex items-center gap-2" onclick={() => step++}>
          Next
          <ChevronRight class="w-4 h-4" />
        </button>
      {:else}
        <button 
          class="btn-primary flex items-center gap-2" 
          onclick={saveDataset}
          disabled={datasetStore.isLoading}
        >
          {#if datasetStore.isLoading}
            <Loader2 class="w-4 h-4 animate-spin" />
            Creating...
          {:else}
            <Save class="w-4 h-4" />
            Create Dataset
          {/if}
        </button>
      {/if}
    </div>
  </div>
  
  <!-- Steps -->
  <div class="flex items-center gap-2">
    {#each steps as s, index}
      <button
        class="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all {step === s.id ? 'bg-gremius-cyan text-black' : step > s.id ? 'bg-gremius-cyan/20 text-gremius-cyan' : 'bg-gremius-surface text-gremius-subtle'}"
        onclick={() => step = s.id}
      >
        <svelte:component this={s.icon} class="w-4 h-4" />
        {s.label}
      </button>
      {#if index < steps.length - 1}
        <ChevronRight class="w-4 h-4 text-gremius-subtle" />
      {/if}
    {/each}
  </div>
  
  <!-- Error Message -->
  {#if datasetStore.error}
    <div class="bg-gremius-pink/10 border border-gremius-pink/30 text-gremius-pink px-4 py-3 rounded-lg mb-4">
      <p class="font-medium">Error</p>
      <p class="text-sm">{datasetStore.error}</p>
    </div>
  {/if}
  
  <!-- Content -->
  <div class="bg-gremius-card border border-gremius-border rounded-xl p-6">
    {#if step === 1}
      <!-- Step 1: Basic Info -->
      <div class="space-y-6 max-w-xl">
        <div>
          <label class="block text-sm font-medium text-gremius-text mb-2">
            Dataset Label <span class="text-gremius-pink">*</span>
          </label>
          <input
            type="text"
            bind:value={datasetLabel}
            placeholder="e.g., Sales Orders"
            class="w-full px-3 py-2 bg-gremius-bg border border-gremius-border rounded-lg text-gremius-text focus:outline-none focus:border-gremius-cyan"
          />
        </div>
        
        <div>
          <label class="block text-sm font-medium text-gremius-text mb-2">
            Dataset Name <span class="text-gremius-pink">*</span>
          </label>
          <input
            type="text"
            bind:value={datasetName}
            placeholder="e.g., sales_orders"
            class="w-full px-3 py-2 bg-gremius-bg border border-gremius-border rounded-lg text-gremius-text font-mono focus:outline-none focus:border-gremius-cyan"
          />
          <p class="mt-1 text-xs text-gremius-subtle">
            Used in API endpoints. Auto-generated from label.
          </p>
        </div>
        
        <div>
          <label class="block text-sm font-medium text-gremius-text mb-2">
            Description
          </label>
          <textarea
            bind:value={description}
            placeholder="What data does this dataset contain?"
            rows="3"
            class="w-full px-3 py-2 bg-gremius-bg border border-gremius-border rounded-lg text-gremius-text focus:outline-none focus:border-gremius-cyan"
          />
        </div>
      </div>
      
    {:else if step === 2}
      <!-- Step 2: Fields -->
      <div class="space-y-6">
        <div class="flex items-center justify-between">
          <h3 class="font-medium text-gremius-text">
            Native Fields ({fields.length})
          </h3>
          <button
            class="btn-secondary flex items-center gap-2"
            onclick={() => showAddField = true}
          >
            <Plus class="w-4 h-4" />
            Add Field
          </button>
        </div>
        
        {#if fields.length === 0}
          <div class="text-center py-12 border-2 border-dashed border-gremius-border rounded-xl">
            <Table2 class="w-12 h-12 text-gremius-subtle mx-auto mb-3" />
            <p class="text-gremius-text-dim">No fields yet</p>
            <button
              class="text-gremius-cyan hover:underline mt-2"
              onclick={() => showAddField = true}
            >
              Add your first field
            </button>
          </div>
        {:else}
          <div class="space-y-3">
            {#each fields as field, index}
              <div class="flex items-center gap-4 p-4 bg-gremius-surface/50 rounded-lg border border-gremius-border">
                <div class="flex-1">
                  {#if editingField?.id === field.id}
                    <div class="flex items-center gap-3">
                      <input
                        type="text"
                        bind:value={field.label}
                        placeholder="Field Label"
                        class="flex-1 px-3 py-1.5 bg-gremius-bg border border-gremius-border rounded text-sm"
                        onblur={() => {
                          if (!field.name) {
                            field.name = field.label.toLowerCase().replace(/[^a-z0-9]+/g, "_");
                          }
                        }}
                      />
                      <input
                        type="text"
                        bind:value={field.name}
                        placeholder="name"
                        class="w-32 px-3 py-1.5 bg-gremius-bg border border-gremius-border rounded text-sm font-mono"
                      />
                      <select
                        bind:value={field.type}
                        class="px-3 py-1.5 bg-gremius-bg border border-gremius-border rounded text-sm"
                      >
                        {#each nativeFieldTypes as type}
                          <option value={type.id}>{type.label}</option>
                        {/each}
                      </select>
                      <button
                        class="p-1.5 text-gremius-green hover:bg-gremius-green/10 rounded"
                        onclick={() => editingField = null}
                      >
                        <Save class="w-4 h-4" />
                      </button>
                    </div>
                  {:else}
                    <div class="flex items-center gap-3">
                      <span class="font-medium text-gremius-text">{field.label}</span>
                      <code class="text-xs text-gremius-subtle bg-gremius-bg px-2 py-0.5 rounded">{field.name}</code>
                      <span class="text-xs text-gremius-subtle px-2 py-0.5 bg-gremius-cyan/10 text-gremius-cyan rounded">
                        {nativeFieldTypes.find(t => t.id === field.type)?.label}
                      </span>
                    </div>
                  {/if}
                </div>
                <div class="flex items-center gap-1">
                  <button
                    class="p-1.5 text-gremius-subtle hover:text-gremius-text"
                    onclick={() => editingField = field}
                  >
                    <Settings class="w-4 h-4" />
                  </button>
                  <button
                    class="p-1.5 text-gremius-subtle hover:text-gremius-pink"
                    onclick={() => removeField(index)}
                  >
                    <X class="w-4 h-4" />
                  </button>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
      
    {:else if step === 3}
      <!-- Step 3: Calculated Fields -->
      <div class="space-y-6">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="font-medium text-gremius-text">
              Calculated Fields & KPIs ({calculatedFields.length})
            </h3>
            <p class="text-sm text-gremius-subtle">
              Create metrics and formulas based on your fields
            </p>
          </div>
          <button
            class="btn-primary flex items-center gap-2"
            onclick={() => showAddCalculated = true}
          >
            <Calculator class="w-4 h-4" />
            Add Calculated Field
          </button>
        </div>
        
        {#if calculatedFields.length === 0}
          <div class="text-center py-12 border-2 border-dashed border-gremius-border rounded-xl">
            <Calculator class="w-12 h-12 text-gremius-subtle mx-auto mb-3" />
            <p class="text-gremius-text-dim">No calculated fields yet</p>
            <p class="text-sm text-gremius-subtle mt-1">
              Create KPIs like totals, averages, or custom formulas
            </p>
          </div>
        {:else}
          <div class="space-y-3">
            {#each calculatedFields as cf, index}
              <div class="flex items-center gap-4 p-4 bg-gremius-surface/50 rounded-lg border border-gremius-border">
                <div class="w-10 h-10 rounded-lg bg-gremius-cyan/10 flex items-center justify-center">
                  <Calculator class="w-5 h-5 text-gremius-cyan" />
                </div>
                <div class="flex-1">
                  <div class="flex items-center gap-2">
                    <span class="font-medium text-gremius-text">{cf.label}</span>
                    {#if cf.isKpi}
                      <span class="text-xs px-2 py-0.5 bg-amber-500/10 text-amber-400 rounded">KPI</span>
                    {/if}
                  </div>
                  <code class="text-xs text-gremius-subtle">{cf.name}</code>
                  {#if cf.config?.expression}
                    <p class="text-xs text-gremius-subtle mt-1 font-mono">{cf.config.expression}</p>
                  {/if}
                </div>
                <div class="flex items-center gap-2">
                  <span class="text-xs text-gremius-subtle px-2 py-1 bg-gremius-bg rounded">
                    {cf.format?.type}
                  </span>
                  <button
                    class="p-1.5 text-gremius-subtle hover:text-gremius-pink"
                    onclick={() => removeCalculatedField(index)}
                  >
                    <X class="w-4 h-4" />
                  </button>
                </div>
              </div>
            {/each}
          </div>
        {/if}
        
        <!-- Quick Formula Builder -->
        {#if fields.length > 0}
          <div class="mt-8 p-4 bg-gremius-surface/30 rounded-xl border border-gremius-border">
            <h4 class="font-medium text-gremius-text mb-4 flex items-center gap-2">
              <Calculator class="w-4 h-4 text-gremius-cyan" />
              Quick Formula Preview
            </h4>
            <FormulaBuilder
              availableFields={availableFormulaFields}
              bind:value={previewFormula}
            />
          </div>
        {/if}
      </div>
      
    {:else if step === 4}
      <!-- Step 4: Review -->
      <div class="space-y-6">
        <h3 class="font-medium text-gremius-text">Review Dataset Configuration</h3>
        
        <div class="space-y-4">
          <div class="p-4 bg-gremius-surface/50 rounded-lg">
            <h4 class="text-sm font-medium text-gremius-text mb-2">Basic Info</h4>
            <div class="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span class="text-gremius-subtle">Label:</span>
                <span class="text-gremius-text ml-2">{datasetLabel}</span>
              </div>
              <div>
                <span class="text-gremius-subtle">Name:</span>
                <code class="text-gremius-cyan ml-2">{datasetName}</code>
              </div>
            </div>
          </div>
          
          <div class="p-4 bg-gremius-surface/50 rounded-lg">
            <h4 class="text-sm font-medium text-gremius-text mb-2">
              Native Fields ({fields.length})
            </h4>
            <div class="flex flex-wrap gap-2">
              {#each fields as field}
                <span class="px-3 py-1 bg-gremius-bg rounded-lg text-sm text-gremius-text">
                  {field.label}
                  <span class="text-gremius-subtle text-xs">({field.type})</span>
                </span>
              {/each}
            </div>
          </div>
          
          <div class="p-4 bg-gremius-surface/50 rounded-lg">
            <h4 class="text-sm font-medium text-gremius-text mb-2">
              Calculated Fields ({calculatedFields.length})
            </h4>
            <div class="flex flex-wrap gap-2">
              {#each calculatedFields as cf}
                <span class="px-3 py-1 bg-gremius-cyan/10 border border-gremius-cyan/20 rounded-lg text-sm text-gremius-cyan">
                  {cf.label}
                  {#if cf.isKpi}
                    <span class="text-amber-400 ml-1">★</span>
                  {/if}
                </span>
              {/each}
            </div>
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>

<!-- Modal: Add Field -->
{#if showAddField}
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
    <div class="bg-gremius-card border border-gremius-border rounded-xl w-full max-w-lg p-6">
      <h3 class="text-lg font-bold text-gremius-text mb-4">Add Field</h3>
      <div class="grid grid-cols-2 gap-3">
        {#each nativeFieldTypes as type}
          <button
            class="p-4 rounded-lg border border-gremius-border hover:border-gremius-cyan/50 text-left transition-colors"
            onclick={() => addField(type.id)}
          >
            <p class="font-medium text-gremius-text">{type.label}</p>
            <p class="text-xs text-gremius-subtle">{type.description}</p>
          </button>
        {/each}
      </div>
      <button
        class="mt-4 w-full py-2 btn-secondary"
        onclick={() => showAddField = false}
      >
        Cancel
      </button>
    </div>
  </div>
{/if}

<!-- Modal: Add Calculated Field -->
{#if showAddCalculated}
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
    <KpiCreator
      availableFields={availableFormulaFields}
      onSave={addCalculatedField}
      onCancel={() => showAddCalculated = false}
    />
  </div>
{/if}

<style>
  .btn-primary {
    @apply px-4 py-2 bg-gremius-cyan text-black font-medium rounded-lg hover:brightness-110 transition-all;
  }
  .btn-secondary {
    @apply px-4 py-2 bg-gremius-surface border border-gremius-border text-gremius-text rounded-lg hover:border-gremius-cyan/50 transition-all;
  }
</style>
