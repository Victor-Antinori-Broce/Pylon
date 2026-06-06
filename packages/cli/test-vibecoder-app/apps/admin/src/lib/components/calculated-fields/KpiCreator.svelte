<script lang="ts">
  /**
   * KpiCreator - Creador completo de KPIs/Campos Calculados
   * 
   * Interfaz para crear campos calculados con:
   * - Tipo de cálculo (fórmula, agregación, condicional, etc.)
   * - Configuración visual
   * - Formato de salida
   * - Targets y alertas
   */
  import { X, Calculator, TrendingUp, Hash, Text, Calendar, Filter, Target, AlertTriangle, Check, ChevronRight } from "lucide-svelte";

  import FormulaBuilder from "./FormulaBuilder.svelte";
  import type { CalculatedField, CalculatedFieldType } from "./index.ts";
  
  interface Props {
    availableFields: Array<{ name: string; label: string; type: string }>;
    availableTables?: Array<{ name: string; label: string }>;
    value?: Partial<CalculatedField>;
    onSave?: (field: CalculatedField) => void;
    onCancel?: () => void;
  }
  
  const { 
    availableFields, 
    availableTables = [], 
    value,
    onSave,
    onCancel 
  }: Props = $props();
  
  // Estado del formulario
  let step = $state(1);
  const field = $state<Partial<CalculatedField>>({
    id: value?.id || crypto.randomUUID(),
    name: value?.name || "",
    label: value?.label || "",
    type: value?.type || "formula",
    config: value?.config || {},
    format: value?.format || { type: "number" },
    dependsOn: value?.dependsOn || [],
    isKpi: value?.isKpi ?? false,
    target: value?.target,
    warningThreshold: value?.warningThreshold,
    ...value
  });
  
  let errors = $state<Record<string, string>>({});
  
  const fieldTypes: Array<{ id: CalculatedFieldType; label: string; description: string; icon: any }> = [
    { id: "formula", label: "Formula", description: "Mathematical expression using fields", icon: Calculator },
    { id: "count", label: "Count", description: "Count related records", icon: Hash },
    { id: "sum", label: "Sum", description: "Sum values from related records", icon: TrendingUp },
    { id: "average", label: "Average", description: "Calculate average", icon: TrendingUp },
    { id: "concat", label: "Concatenate", description: "Join text fields", icon: Text },
    { id: "date_diff", label: "Date Difference", description: "Days/hours between dates", icon: Calendar },
    { id: "conditional", label: "Conditional", description: "IF/THEN/ELSE logic", icon: Filter },
  ];
  
  const formatTypes = [
    { id: "text", label: "Text" },
    { id: "number", label: "Number" },
    { id: "currency", label: "Currency" },
    { id: "percentage", label: "Percentage" },
    { id: "duration", label: "Duration" },
    { id: "badge", label: "Status Badge" },
  ];
  
  function validateStep(): boolean {
    errors = {};
    
    if (step === 1) {
      if (!field.label?.trim()) errors.label = "Label is required";
      if (!field.name?.trim()) errors.name = "Name is required";
      if (!field.type) errors.type = "Type is required";
    }
    
    if (step === 2) {
      switch (field.type) {
        case "formula":
          if (!field.config?.expression) errors.expression = "Formula is required";
          break;
        case "count":
        case "sum":
        case "average":
          if (!field.config?.sourceTable) errors.sourceTable = "Source table is required";
          if (field.type !== "count" && !field.config?.sourceField) {
            errors.sourceField = "Field to aggregate is required";
          }
          break;
        case "concat":
          if (!field.config?.fields?.length) errors.fields = "At least one field is required";
          break;
        case "date_diff":
          if (!field.config?.startField) errors.startField = "Start date field is required";
          if (!field.config?.endField) errors.endField = "End date field is required";
          break;
        case "conditional":
          if (!field.config?.condition?.field) errors.condition = "Condition is required";
          break;
      }
    }
    
    return Object.keys(errors).length === 0;
  }
  
  function nextStep() {
    if (validateStep()) step++;
  }
  
  function prevStep() {
    step--;
  }
  
  function handleSave() {
    if (!validateStep()) return;
    
    onSave?.(field as CalculatedField);
  }
  
  function generateNameFromLabel(label: string) {
    return label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }
  
  // Auto-generar nombre desde label
  $effect(() => {
    if (field.label && !field.name) {
      field.name = generateNameFromLabel(field.label);
    }
  });
  
  // Actualizar dependencias según el tipo
  $effect(() => {
    const deps: string[] = [];
    
    if (field.type === "formula" && field.config?.expression) {
      const matches = field.config.expression.match(/\{([^}]+)\}/g) || [];
      deps.push(...matches.map(m => m.slice(1, -1)));
    }
    
    if (field.type === "concat" && field.config?.fields) {
      deps.push(...field.config.fields);
    }
    
    if (field.type === "date_diff") {
      if (field.config?.startField) deps.push(field.config.startField);
      if (field.config?.endField) deps.push(field.config.endField);
    }
    
    if (field.type === "conditional" && field.config?.condition?.field) {
      deps.push(field.config.condition.field);
    }
    
    field.dependsOn = [...new Set(deps)];
  });
</script>

<div class="w-full max-w-2xl bg-gremius-card border border-gremius-border rounded-xl overflow-hidden">
  <!-- Header -->
  <div class="flex items-center justify-between px-6 py-4 border-b border-gremius-border bg-gremius-surface/50">
    <div>
      <h2 class="text-lg font-bold text-gremius-text flex items-center gap-2">
        <Calculator class="w-5 h-5 text-gremius-cyan" />
        {value?.id ? "Edit" : "Create"} Calculated Field
      </h2>
      <p class="text-sm text-gremius-subtle">Step {step} of 3</p>
    </div>
    <button 
      class="p-2 rounded-lg hover:bg-gremius-surface text-gremius-subtle"
      onclick={onCancel}
    >
      <X class="w-5 h-5" />
    </button>
  </div>
  
  <!-- Progress -->
  <div class="flex h-1 bg-gremius-border">
    <div class="h-full bg-gremius-cyan transition-all" style="width: {(step / 3) * 100}%"></div>
  </div>
  
  <!-- Content -->
  <div class="p-6">
    {#if step === 1}
      <!-- Step 1: Basic Info -->
      <div class="space-y-6">
        <div>
          <label class="block text-sm font-medium text-gremius-text mb-2">
            Field Label <span class="text-gremius-pink">*</span>
          </label>
          <input
            type="text"
            bind:value={field.label}
            placeholder="e.g., Total Revenue"
            class="w-full px-3 py-2 bg-gremius-bg border border-gremius-border rounded-lg text-gremius-text placeholder:text-gremius-subtle focus:outline-none focus:border-gremius-cyan"
          />
          {#if errors.label}
            <p class="mt-1 text-sm text-gremius-pink">{errors.label}</p>
          {/if}
        </div>
        
        <div>
          <label class="block text-sm font-medium text-gremius-text mb-2">
            Field Name <span class="text-gremius-pink">*</span>
          </label>
          <input
            type="text"
            bind:value={field.name}
            placeholder="e.g., total_revenue"
            class="w-full px-3 py-2 bg-gremius-bg border border-gremius-border rounded-lg text-gremius-text placeholder:text-gremius-subtle focus:outline-none focus:border-gremius-cyan font-mono"
          />
          <p class="mt-1 text-xs text-gremius-subtle">
            Used in API and formulas. Auto-generated from label.
          </p>
          {#if errors.name}
            <p class="mt-1 text-sm text-gremius-pink">{errors.name}</p>
          {/if}
        </div>
        
        <div>
          <label class="block text-sm font-medium text-gremius-text mb-3">
            Calculation Type <span class="text-gremius-pink">*</span>
          </label>
          <div class="grid grid-cols-2 gap-3">
            {#each fieldTypes as type}
              <button
                class="flex items-start gap-3 p-3 rounded-lg border text-left transition-all {field.type === type.id ? 'border-gremius-cyan bg-gremius-cyan/10' : 'border-gremius-border hover:border-gremius-cyan/50'}"
                onclick={() => field.type = type.id}
              >
                <div class="w-10 h-10 rounded-lg bg-gremius-surface flex items-center justify-center shrink-0">
                  <svelte:component this={type.icon} class="w-5 h-5 text-gremius-cyan" />
                </div>
                <div>
                  <p class="font-medium text-gremius-text">{type.label}</p>
                  <p class="text-xs text-gremius-subtle">{type.description}</p>
                </div>
              </button>
            {/each}
          </div>
          {#if errors.type}
            <p class="mt-2 text-sm text-gremius-pink">{errors.type}</p>
          {/if}
        </div>
        
        <label class="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            bind:checked={field.isKpi}
            class="w-5 h-5 rounded border-gremius-border bg-gremius-bg text-gremius-cyan"
          />
          <div>
            <p class="font-medium text-gremius-text">Mark as KPI</p>
            <p class="text-xs text-gremius-subtle">Show in dashboards and enable targets</p>
          </div>
        </label>
      </div>
      
    {:else if step === 2}
      <!-- Step 2: Configuration -->
      <div class="space-y-6">
        {#if field.type === "formula"}
          <div>
            <label class="block text-sm font-medium text-gremius-text mb-3">
              Formula
            </label>
            <FormulaBuilder
              {availableFields}
              value={field.config?.expression}
              onChange={(expr) => field.config = { ...field.config, expression: expr }}
            />
            {#if errors.expression}
              <p class="mt-2 text-sm text-gremius-pink">{errors.expression}</p>
            {/if}
          </div>
          
        {:else if field.type === "count" || field.type === "sum" || field.type === "average"}
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gremius-text mb-2">
                Source Table
              </label>
              <select
                bind:value={field.config.sourceTable}
                class="w-full px-3 py-2 bg-gremius-bg border border-gremius-border rounded-lg text-gremius-text focus:outline-none focus:border-gremius-cyan"
              >
                <option value="">Select table...</option>
                {#each availableTables as table}
                  <option value={table.name}>{table.label}</option>
                {/each}
              </select>
              {#if errors.sourceTable}
                <p class="mt-1 text-sm text-gremius-pink">{errors.sourceTable}</p>
              {/if}
            </div>
            
            {#if field.type !== "count"}
              <div>
                <label class="block text-sm font-medium text-gremius-text mb-2">
                  Field to {field.type}
                </label>
                <select
                  bind:value={field.config.sourceField}
                  class="w-full px-3 py-2 bg-gremius-bg border border-gremius-border rounded-lg text-gremius-text focus:outline-none focus:border-gremius-cyan"
                >
                  <option value="">Select field...</option>
                  {#each availableFields.filter(f => f.type === "number") as field}
                    <option value={field.name}>{field.label}</option>
                  {/each}
                </select>
                {#if errors.sourceField}
                  <p class="mt-1 text-sm text-gremius-pink">{errors.sourceField}</p>
                {/if}
              </div>
            {/if}
          </div>
          
        {:else if field.type === "concat"}
          <div>
            <label class="block text-sm font-medium text-gremius-text mb-2">
              Fields to Concatenate
            </label>
            <div class="space-y-2">
              {#each field.config?.fields || [] as selectedField, index}
                <div class="flex items-center gap-2">
                  <select
                    value={selectedField}
                    onchange={(e) => {
                      const fields = [...(field.config?.fields || [])];
                      fields[index] = e.currentTarget.value;
                      field.config = { ...field.config, fields };
                    }}
                    class="flex-1 px-3 py-2 bg-gremius-bg border border-gremius-border rounded-lg text-gremius-text"
                  >
                    <option value="">Select field...</option>
                    {#each availableFields.filter(f => f.type === "text") as f}
                      <option value={f.name}>{f.label}</option>
                    {/each}
                  </select>
                  <button
                    class="p-2 rounded-lg hover:bg-gremius-pink/20 text-gremius-subtle hover:text-gremius-pink"
                    onclick={() => {
                      const fields = (field.config?.fields || []).filter((_, i) => i !== index);
                      field.config = { ...field.config, fields };
                    }}
                  >
                    <X class="w-4 h-4" />
                  </button>
                </div>
              {/each}
              <button
                class="flex items-center gap-2 px-3 py-2 text-sm text-gremius-cyan hover:bg-gremius-cyan/10 rounded-lg transition-colors"
                onclick={() => {
                  field.config = { 
                    ...field.config, 
                    fields: [...(field.config?.fields || []), ""] 
                  };
                }}
              >
                <Plus class="w-4 h-4" /> Add Field
              </button>
            </div>
            
            <div class="mt-4">
              <label class="block text-sm font-medium text-gremius-text mb-2">
                Separator
              </label>
              <input
                type="text"
                bind:value={field.config.separator}
                placeholder="e.g., ' - ' or ' '"
                class="w-full px-3 py-2 bg-gremius-bg border border-gremius-border rounded-lg text-gremius-text"
              />
            </div>
          </div>
          
        {:else if field.type === "date_diff"}
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gremius-text mb-2">
                Start Date Field
              </label>
              <select
                bind:value={field.config.startField}
                class="w-full px-3 py-2 bg-gremius-bg border border-gremius-border rounded-lg text-gremius-text"
              >
                <option value="">Select field...</option>
                {#each availableFields.filter(f => f.type === "date") as f}
                  <option value={f.name}>{f.label}</option>
                {/each}
              </select>
            </div>
            
            <div>
              <label class="block text-sm font-medium text-gremius-text mb-2">
                End Date Field
              </label>
              <select
                bind:value={field.config.endField}
                class="w-full px-3 py-2 bg-gremius-bg border border-gremius-border rounded-lg text-gremius-text"
              >
                <option value="">Now (current time)</option>
                {#each availableFields.filter(f => f.type === "date") as f}
                  <option value={f.name}>{f.label}</option>
                {/each}
              </select>
            </div>
            
            <div>
              <label class="block text-sm font-medium text-gremius-text mb-2">
                Output Unit
              </label>
              <select
                bind:value={field.config.unit}
                class="w-full px-3 py-2 bg-gremius-bg border border-gremius-border rounded-lg text-gremius-text"
              >
                <option value="days">Days</option>
                <option value="hours">Hours</option>
                <option value="minutes">Minutes</option>
                <option value="seconds">Seconds</option>
              </select>
            </div>
          </div>
          
        {:else if field.type === "conditional"}
          <div class="space-y-4">
            <p class="text-sm text-gremius-subtle">IF condition THEN value ELSE value</p>
            
            <div class="p-4 rounded-lg bg-gremius-surface/50 border border-gremius-border space-y-4">
              <div class="flex items-center gap-2 text-gremius-cyan font-medium">
                <span>IF</span>
              </div>
              
              <div class="grid grid-cols-3 gap-2">
                <select
                  bind:value={field.config.condition.field}
                  class="px-3 py-2 bg-gremius-bg border border-gremius-border rounded-lg text-gremius-text"
                >
                  <option value="">Select field...</option>
                  {#each availableFields as f}
                    <option value={f.name}>{f.label}</option>
                  {/each}
                </select>
                
                <select
                  bind:value={field.config.condition.operator}
                  class="px-3 py-2 bg-gremius-bg border border-gremius-border rounded-lg text-gremius-text"
                >
                  <option value="eq">equals</option>
                  <option value="neq">not equals</option>
                  <option value="gt">greater than</option>
                  <option value="gte">greater or equal</option>
                  <option value="lt">less than</option>
                  <option value="lte">less or equal</option>
                  <option value="contains">contains</option>
                  <option value="empty">is empty</option>
                </select>
                
                {#if field.config.condition.operator !== "empty"}
                  <input
                    type="text"
                    bind:value={field.config.condition.value}
                    placeholder="Value"
                    class="px-3 py-2 bg-gremius-bg border border-gremius-border rounded-lg text-gremius-text"
                  />
                {/if}
              </div>
              
              <div class="flex items-center gap-2 text-gremius-green font-medium">
                <span>THEN</span>
              </div>
              
              <input
                type="text"
                bind:value={field.config.trueValue}
                placeholder="Value if true"
                class="w-full px-3 py-2 bg-gremius-bg border border-gremius-border rounded-lg text-gremius-text"
              />
              
              <div class="flex items-center gap-2 text-gremius-pink font-medium">
                <span>ELSE</span>
              </div>
              
              <input
                type="text"
                bind:value={field.config.falseValue}
                placeholder="Value if false"
                class="w-full px-3 py-2 bg-gremius-bg border border-gremius-border rounded-lg text-gremius-text"
              />
            </div>
          </div>
        {/if}
      </div>
      
    {:else if step === 3}
      <!-- Step 3: Format & KPI Settings -->
      <div class="space-y-6">
        <div>
          <label class="block text-sm font-medium text-gremius-text mb-3">
            Output Format
          </label>
          <div class="grid grid-cols-3 gap-2">
            {#each formatTypes as fmt}
              <button
                class="p-3 rounded-lg border text-sm font-medium transition-all {field.format?.type === fmt.id ? 'border-gremius-cyan bg-gremius-cyan/10 text-gremius-cyan' : 'border-gremius-border text-gremius-text hover:border-gremius-cyan/50'}"
                onclick={() => field.format = { ...field.format, type: fmt.id as any }}
              >
                {fmt.label}
              </button>
            {/each}
          </div>
        </div>
        
        {#if field.format?.type === "currency"}
          <div>
            <label class="block text-sm font-medium text-gremius-text mb-2">
              Currency
            </label>
            <select
              bind:value={field.format.currency}
              class="w-full px-3 py-2 bg-gremius-bg border border-gremius-border rounded-lg text-gremius-text"
            >
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
              <option value="GBP">GBP (£)</option>
              <option value="MXN">MXN ($)</option>
            </select>
          </div>
        {/if}
        
        {#if field.format?.type === "number" || field.format?.type === "currency" || field.format?.type === "percentage"}
          <div>
            <label class="block text-sm font-medium text-gremius-text mb-2">
              Decimal Places
            </label>
            <input
              type="number"
              bind:value={field.format.decimals}
              min="0"
              max="10"
              class="w-full px-3 py-2 bg-gremius-bg border border-gremius-border rounded-lg text-gremius-text"
            />
          </div>
        {/if}
        
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gremius-text mb-2">
              Prefix
            </label>
            <input
              type="text"
              bind:value={field.format.prefix}
              placeholder="e.g., $"
              class="w-full px-3 py-2 bg-gremius-bg border border-gremius-border rounded-lg text-gremius-text"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gremius-text mb-2">
              Suffix
            </label>
            <input
              type="text"
              bind:value={field.format.suffix}
              placeholder="e.g., %"
              class="w-full px-3 py-2 bg-gremius-bg border border-gremius-border rounded-lg text-gremius-text"
            />
          </div>
        </div>
        
        {#if field.isKpi}
          <div class="p-4 rounded-lg bg-gremius-surface/50 border border-gremius-border space-y-4">
            <h4 class="font-medium text-gremius-text flex items-center gap-2">
              <Target class="w-4 h-4 text-gremius-cyan" />
              KPI Targets
            </h4>
            
            <div>
              <label class="block text-sm font-medium text-gremius-text mb-2">
                Target Value
              </label>
              <input
                type="number"
                bind:value={field.target}
                placeholder="e.g., 1000"
                class="w-full px-3 py-2 bg-gremius-bg border border-gremius-border rounded-lg text-gremius-text"
              />
            </div>
            
            <div>
              <label class="block text-sm font-medium text-gremius-text mb-2 flex items-center gap-2">
                <AlertTriangle class="w-4 h-4 text-amber-400" />
                Warning Threshold
              </label>
              <input
                type="number"
                bind:value={field.warningThreshold}
                placeholder="e.g., 500"
                class="w-full px-3 py-2 bg-gremius-bg border border-gremius-border rounded-lg text-gremius-text"
              />
              <p class="mt-1 text-xs text-gremius-subtle">
                Value at which to show warning indicator
              </p>
            </div>
          </div>
        {/if}
        
        <!-- Summary -->
        <div class="p-4 rounded-lg bg-gremius-cyan/5 border border-gremius-cyan/20">
          <h4 class="font-medium text-gremius-text mb-2">Summary</h4>
          <div class="space-y-1 text-sm">
            <p class="text-gremius-subtle">
              <span class="text-gremius-text">Name:</span> {field.name}
            </p>
            <p class="text-gremius-subtle">
              <span class="text-gremius-text">Type:</span> {field.type}
            </p>
            <p class="text-gremius-subtle">
              <span class="text-gremius-text">Format:</span> {field.format?.type}
            </p>
            {#if field.dependsOn?.length}
              <p class="text-gremius-subtle">
                <span class="text-gremius-text">Depends on:</span> {field.dependsOn.join(", ")}
              </p>
            {/if}
          </div>
        </div>
      </div>
    {/if}
  </div>
  
  <!-- Footer -->
  <div class="flex items-center justify-between pt-6 border-t border-gremius-border">
    <button
      class="px-4 py-2 text-gremius-subtle hover:text-gremius-text transition-colors"
      onclick={onCancel}
    >
      Cancel
    </button>
    
    <div class="flex items-center gap-2">
      {#if step > 1}
        <button
          class="px-4 py-2 btn-secondary"
          onclick={prevStep}
        >
          Back
        </button>
      {/if}
      
      {#if step < 3}
        <button
          class="px-4 py-2 btn-primary flex items-center gap-2"
          onclick={nextStep}
        >
          Next
          <ChevronRight class="w-4 h-4" />
        </button>
      {:else}
        <button
          class="px-4 py-2 btn-primary flex items-center gap-2"
          onclick={handleSave}
        >
          <Check class="w-4 h-4" />
          Save Field
        </button>
      {/if}
    </div>
  </div>
</div>

<style>
  .btn-primary {
    @apply bg-gremius-cyan text-black font-medium rounded-lg hover:brightness-110 transition-all;
  }
  .btn-secondary {
    @apply bg-gremius-surface border border-gremius-border text-gremius-text rounded-lg hover:border-gremius-cyan/50 transition-all;
  }
</style>
