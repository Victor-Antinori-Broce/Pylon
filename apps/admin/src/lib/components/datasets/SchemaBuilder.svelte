<script lang="ts">
  /**
   * SchemaBuilder.svelte — Drag-and-drop field designer
   * Three-panel layout: Field Palette | Field List | Field Settings
   * Enterprise tabs: Fields | Security | Workflow
   */
  import { 
    Type, Hash, ToggleLeft, Calendar, ImageIcon, Link2, Mail, List, Braces, FileText, GitBranch,
    GripVertical, X, Plus, Save, Layers, Shield, ShieldOff, Lock, Globe, Users, UserCheck, 
    GitPullRequest, Zap, CheckCircle
  } from "lucide-svelte";
  import { slide } from "svelte/transition";
  import {
    FIELD_TYPE_OPTIONS, generateSlug, generateFieldKey, createEmptyField,
    type FieldDefinition, type FieldType, type DatasetDefinition, type RelationType, type RelationTarget,
  } from "../../../types/datasets";

  // ─── Props ──────────────────────────────────────────
  interface Props {
    definition: DatasetDefinition;
    allDatasets?: DatasetDefinition[];
    onSave?: (def: DatasetDefinition) => void;
    onCancel?: () => void;
  }
  
  let { definition, allDatasets = [], onSave, onCancel }: Props = $props();

  // ─── Tab system ─────────────────────────────────────
  type TabId = "fields" | "security" | "workflow";
  let activeTab = $state<TabId>("fields");
  
  const tabs = [
    { id: "fields" as const, label: "Fields", icon: Layers },
    { id: "security" as const, label: "Security", icon: Shield },
    { id: "workflow" as const, label: "Workflow", icon: GitPullRequest },
  ];

  // ─── Access option cards ────────────────────────────
  const readAccessOptions = [
    { value: "admin" as const, label: "Admin", desc: "Only admins", icon: Lock },
    { value: "authenticated" as const, label: "Users", desc: "Logged-in users", icon: Users },
    { value: "public" as const, label: "Public", desc: "Everyone", icon: Globe },
  ];

  const writeAccessOptions = [
    { value: "admin" as const, label: "Admin Only", desc: "Only admins can create/edit", icon: Lock },
    { value: "authenticated" as const, label: "Authenticated", desc: "Any logged-in user", icon: UserCheck },
  ];

  // ─── Icon map ───────────────────────────────────────
  const iconMap: Record<string, typeof Type> = {
    Type, Hash, ToggleLeft, Calendar, ImageIcon, Link2, Mail, List, Braces, FileText, GitBranch,
  };

  const iconOptions = ["📦", "⚔️", "🛡️", "🧪", "👤", "🗺️", "📊", "🏆", "📜", "🎮", "🎯", "🔮", "💎", "🏠", "🔧"];

  // ─── Local State ────────────────────────────────────
  let localDef = $state<DatasetDefinition>(JSON.parse(JSON.stringify(definition)));
  let selectedFieldId = $state<string | null>(null);
  let dragOverIndex = $state(-1);
  let dragFieldType: FieldType | null = null;
  let dragFieldIndex: number | null = null;

  // Watch for prop changes
  $effect(() => {
    localDef = JSON.parse(JSON.stringify(definition));
  });

  // ─── Computed ───────────────────────────────────────
  let selectedField = $derived(localDef.fields.find((f) => f.id === selectedFieldId) || null);
  let otherDatasets = $derived(allDatasets.filter((d) => d.id !== localDef.id));
  
  let validationErrors = $derived(() => {
    const errs: string[] = [];
    if (!localDef.name.trim()) errs.push("Dataset name is required");
    if (localDef.fields.length === 0) errs.push("Add at least one field");
    for (const f of localDef.fields) {
      if (!f.label.trim()) errs.push(`Field at position ${f.order + 1} needs a label`);
      if (!f.key.trim()) errs.push(`Field "${f.label}" needs a key`);
    }
    const keys = localDef.fields.map((f) => f.key).filter(Boolean);
    const dups = keys.filter((k, i) => keys.indexOf(k) !== i);
    if (dups.length) errs.push(`Duplicate field key: "${dups[0]}"`);
    return errs;
  });
  
  let canSave = $derived(validationErrors().length === 0);

  // ─── Enterprise: Enable / Disable ───────────────────
  function enablePolicy() {
    localDef.policyJson = {
      readAccess: "admin",
      writeAccess: "admin",
      enableRLS: false,
      rlsRules: [],
    };
  }

  function enableWorkflow() {
    localDef.workflowJson = {
      requireApproval: true,
      approverUserIds: [],
    };
  }

  function addRLSRule() {
    if (!localDef.policyJson) return;
    if (!localDef.policyJson.rlsRules) localDef.policyJson.rlsRules = [];
    localDef.policyJson.rlsRules.push({ field: "", operator: "eq", value: "" });
  }

  function addApprover() {
    if (!localDef.workflowJson) return;
    if (!localDef.workflowJson.approverUserIds) localDef.workflowJson.approverUserIds = [];
    localDef.workflowJson.approverUserIds.push("");
  }

  // ─── Relation field helpers ─────────────────────────
  function setRelationType(t: RelationType) {
    if (!selectedField) return;
    if (!selectedField.relation) {
      selectedField.relation = { target: "games", type: t, displayField: "title" };
    } else {
      selectedField.relation.type = t;
    }
  }

  // ─── Field CRUD ─────────────────────────────────────
  function addField(type: FieldType) {
    const order = localDef.fields.length;
    const field = createEmptyField(type, order);
    if (type === "select") field.options = [{ label: "", value: "" }];
    if (type === "relation") field.relation = { target: "games", type: "one-to-many", displayField: "title" };
    localDef.fields.push(field);
    selectedFieldId = field.id;
  }

  function removeField(idx: number) {
    const f = localDef.fields[idx];
    if (selectedFieldId === f.id) selectedFieldId = null;
    localDef.fields.splice(idx, 1);
    reorder();
  }

  function selectField(id: string) {
    selectedFieldId = selectedFieldId === id ? null : id;
  }

  function collapseAll() {
    selectedFieldId = null;
  }

  // ─── Drag & Drop ────────────────────────────────────
  function onDragStartPalette(e: DragEvent, type: FieldType) {
    dragFieldType = type;
    dragFieldIndex = null;
    if (e.dataTransfer) e.dataTransfer.effectAllowed = "copy";
  }

  function onDragStartField(e: DragEvent, idx: number) {
    dragFieldType = null;
    dragFieldIndex = idx;
    if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
  }

  function onDropZone() {
    if (dragFieldType) {
      addField(dragFieldType);
    }
    dragFieldType = null;
    dragFieldIndex = null;
    dragOverIndex = -1;
  }

  function onDropReorder(targetIdx: number) {
    if (dragFieldType) {
      const order = targetIdx;
      const field = createEmptyField(dragFieldType, order);
      if (dragFieldType === "select") field.options = [{ label: "", value: "" }];
      if (dragFieldType === "relation") field.relation = { target: "games", type: "one-to-many", displayField: "title" };
      localDef.fields.splice(targetIdx, 0, field);
      selectedFieldId = field.id;
      reorder();
    } else if (dragFieldIndex !== null && dragFieldIndex !== targetIdx) {
      const [moved] = localDef.fields.splice(dragFieldIndex, 1);
      localDef.fields.splice(targetIdx, 0, moved);
      reorder();
    }
    dragFieldType = null;
    dragFieldIndex = null;
    dragOverIndex = -1;
  }

  function reorder() {
    localDef.fields.forEach((f, i) => (f.order = i));
  }

  // ─── Auto-generate helpers ──────────────────────────
  function autoSlug() {
    localDef.slug = generateSlug(localDef.name);
  }

  function autoFieldKey(field: FieldDefinition) {
    if (!field.key || field.key === generateFieldKey(field.label.slice(0, -1))) {
      field.key = generateFieldKey(field.label);
    }
  }

  function addSelectOption() {
    if (!selectedField) return;
    if (!selectedField.options) selectedField.options = [];
    selectedField.options.push({ label: "", value: "" });
  }

  // ─── Utility ────────────────────────────────────────
  function getFieldColor(type: FieldType): string {
    return FIELD_TYPE_OPTIONS.find((f) => f.type === type)?.color || "#888";
  }
  
  function getFieldIcon(type: FieldType): typeof Type {
    const opt = FIELD_TYPE_OPTIONS.find((f) => f.type === type);
    return iconMap[opt?.icon || "Type"] || Type;
  }
  
  function getFieldTypeLabel(type: FieldType): string {
    return FIELD_TYPE_OPTIONS.find((f) => f.type === type)?.label || type;
  }

  function save() {
    if (canSave && onSave) onSave(localDef);
  }
</script>

<div class="flex h-[calc(100vh-9rem)] gap-4 animate-fade-in">
  <!-- ═══ LEFT: Field Type Palette ═══ -->
  {#if activeTab === "fields"}
    <div class="w-56 shrink-0 card overflow-y-auto">
      <div class="p-3 border-b border-gremius-border sticky top-0 bg-gremius-card z-10">
        <p class="label">Field Types</p>
        <p class="text-[10px] text-gremius-subtle mt-0.5">Drag or click to add</p>
      </div>
      <div class="p-2 space-y-1">
        {#each FIELD_TYPE_OPTIONS as ft}
          <button
            onclick={() => addField(ft.type)}
            draggable="true"
            ondragstart={(e) => onDragStartPalette(e, ft.type)}
            class="flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-left text-sm hover:bg-gremius-border/30 transition-all cursor-grab active:cursor-grabbing group"
          >
            <div
              class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors"
              style="background: {ft.color}12; border: 1px solid {ft.color}25"
            >
              {#if iconMap[ft.icon]}
                {@const IconComponent = iconMap[ft.icon]}
                <IconComponent class="w-4 h-4" style="color: {ft.color}" />
              {/if}
            </div>
            <div class="min-w-0">
              <p class="font-medium text-gremius-text group-hover:text-gremius-text transition-colors">{ft.label}</p>
              <p class="text-[10px] text-gremius-subtle truncate">{ft.description}</p>
            </div>
          </button>
        {/each}
      </div>
    </div>
  {/if}

  <!-- ═══ CENTER: Tabbed Content ═══ -->
  <div class="flex-1 flex flex-col min-w-0">
    <!-- Dataset header -->
    <div class="card p-4 mb-4">
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="label mb-1.5 block">Dataset Name *</label>
          <input
            bind:value={localDef.name}
            oninput={autoSlug}
            type="text"
            placeholder="e.g. Weapons"
            class="input"
          />
        </div>
        <div>
          <label class="label mb-1.5 block">Slug</label>
          <div class="flex items-center gap-2">
            <input
              bind:value={localDef.slug}
              type="text"
              placeholder="weapons"
              class="input font-mono text-xs"
            />
            <select bind:value={localDef.icon} class="select w-20 text-center text-lg">
              {#each iconOptions as ic}
                <option value={ic}>{ic}</option>
              {/each}
            </select>
          </div>
        </div>
      </div>
      <div class="mt-3">
        <label class="label mb-1.5 block">Description</label>
        <input
          bind:value={localDef.description}
          type="text"
          placeholder="Optional description for this data set"
          class="input"
        />
      </div>
    </div>

    <!-- ═══ Tab Navigation ═══ -->
    <div class="flex items-center gap-1 mb-3">
      {#each tabs as tab}
        <button
          onclick={() => activeTab = tab.id}
          class="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all border {activeTab === tab.id ? 'bg-gremius-cyan-10 text-gremius-cyan border-gremius-cyan-20' : 'text-gremius-text-dim hover:text-gremius-text hover:bg-gremius-border/20 border-transparent'}"
        >
          <tab.icon class="w-3.5 h-3.5" />
          {tab.label}
          {#if tab.id === "security" && localDef.policyJson}
            <span class="w-1.5 h-1.5 rounded-full bg-gremius-amber"></span>
          {/if}
          {#if tab.id === "workflow" && localDef.workflowJson?.requireApproval}
            <span class="w-1.5 h-1.5 rounded-full bg-gremius-purple"></span>
          {/if}
        </button>
      {/each}
    </div>

    <!-- ════════════════════════════════════════ -->
    <!-- TAB: Fields -->
    <!-- ════════════════════════════════════════ -->
    {#if activeTab === "fields"}
      <div class="flex-1 flex flex-col min-h-0">
        <!-- Field list / drop zone -->
        <div
          class="flex-1 card overflow-y-auto"
          ondragover={(e) => { e.preventDefault(); dragOverIndex = -1; }}
          ondrop={(e) => { e.preventDefault(); onDropZone(); }}
        >
          <div class="p-3 border-b border-gremius-border sticky top-0 bg-gremius-card z-10 flex items-center justify-between">
            <div class="flex items-center gap-2">
              <p class="label">Schema Fields</p>
              <span class="badge-cyan text-[9px]">{localDef.fields.length}</span>
            </div>
            {#if localDef.fields.length > 0}
              <button onclick={collapseAll} class="btn-ghost btn-sm text-[10px]">Collapse All</button>
            {/if}
          </div>

          {#if localDef.fields.length === 0}
            <div class="flex flex-col items-center justify-center py-20 text-gremius-subtle">
              <Layers class="w-12 h-12 mb-4 text-gremius-muted" />
              <p class="text-sm font-medium">No fields yet</p>
              <p class="text-xs mt-1">Click or drag field types from the left panel</p>
            </div>
          {:else}
            <div class="divide-y divide-gremius-border/50">
              {#each localDef.fields as field, idx}
                <div
                  draggable="true"
                  ondragstart={(e) => onDragStartField(e, idx)}
                  ondragover={(e) => { e.preventDefault(); dragOverIndex = idx; }}
                  ondrop={(e) => { e.preventDefault(); e.stopPropagation(); onDropReorder(idx); }}
                  class="group transition-all {dragOverIndex === idx ? 'ring-2 ring-gremius-cyan-30 ring-inset' : ''} {selectedFieldId === field.id ? 'bg-gremius-cyan/[0.04]' : 'hover:bg-gremius-border/20'}"
                >
                  <!-- Field row -->
                  <div
                    role="button"
                    tabindex="0"
                    class="flex items-center gap-3 px-4 py-3 w-full text-left"
                    onclick={() => selectField(field.id)}
                    onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') selectField(field.id); }}
                  >
                    <!-- Drag handle -->
                    <GripVertical class="w-4 h-4 text-gremius-muted shrink-0 opacity-0 group-hover:opacity-60 cursor-grab transition-opacity" />

                    <!-- Type icon -->
                    <div
                      class="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
                      style="background: {getFieldColor(field.type)}15; border: 1px solid {getFieldColor(field.type)}20"
                    >
                      {#if getFieldIcon(field.type)}
                        {@const FieldIcon = getFieldIcon(field.type)}
                        <FieldIcon class="w-3.5 h-3.5" style="color: {getFieldColor(field.type)}" />
                      {/if}
                    </div>

                    <!-- Label + Key -->
                    <div class="flex-1 min-w-0">
                      <p class="text-sm font-medium text-gremius-text truncate">
                        {field.label || "Untitled Field"}
                        {#if field.isRequired}<span class="text-gremius-pink ml-1">*</span>{/if}
                      </p>
                      <p class="text-[10px] font-mono text-gremius-subtle">{field.key || "(no key)"} · {field.type}</p>
                    </div>

                    <!-- Badges -->
                    <div class="flex items-center gap-1.5 shrink-0">
                      {#if field.isUnique}<span class="badge-amber text-[8px] py-0">UNQ</span>{/if}
                      {#if field.relation}
                        <span class="badge-pink text-[8px] py-0">
                          {field.relation.type === "many-to-many" ? "M:N" : field.relation.type === "one-to-many" ? "1:N" : "1:1"}
                        </span>
                      {/if}
                    </div>

                    <!-- Delete -->
                    <button
                      type="button"
                      onclick={(e) => { e.stopPropagation(); removeField(idx); }}
                      class="btn-icon p-1.5 opacity-0 group-hover:opacity-100 hover:!text-gremius-pink transition-all"
                    >
                      <X class="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    {/if}

    <!-- ════════════════════════════════════════ -->
    <!-- TAB: Security -->
    <!-- ════════════════════════════════════════ -->
    {#if activeTab === "security"}
      <div class="flex-1 card overflow-y-auto">
        <div class="p-3 border-b border-gremius-border sticky top-0 bg-gremius-card z-10">
          <div class="flex items-center gap-2">
            <Shield class="w-4 h-4 text-gremius-amber" />
            <p class="label">Access Control</p>
          </div>
          <p class="text-[10px] text-gremius-subtle mt-0.5">Configure who can read and write. Leave disabled for admin-only access.</p>
        </div>

        {#if !localDef.policyJson}
          <div class="flex flex-col items-center justify-center py-20 text-gremius-subtle">
            <ShieldOff class="w-12 h-12 mb-4 text-gremius-muted" />
            <p class="text-sm font-medium text-gremius-text">Default: Admin Only</p>
            <p class="text-xs mt-1 mb-6 text-center max-w-xs">Only admins can read and write this dataset. Enable custom security to allow public or authenticated access.</p>
            <button onclick={enablePolicy} class="btn-primary">
              <Shield class="w-4 h-4" /> Enable Custom Security
            </button>
          </div>
        {:else}
          <div class="p-5 space-y-6">
            <!-- Read Access -->
            <div>
              <label class="label mb-2 block">Who can read?</label>
              <div class="grid grid-cols-3 gap-2">
                {#each readAccessOptions as opt}
                  <button
                    onclick={() => localDef.policyJson!.readAccess = opt.value}
                    class="card-glow p-3 text-center transition-all {localDef.policyJson!.readAccess === opt.value ? 'border-gremius-cyan-40 bg-gremius-cyan-5 text-gremius-cyan' : 'text-gremius-text-dim hover:text-gremius-text'}"
                  >
                    <opt.icon class="w-5 h-5 mx-auto mb-1.5" />
                    <p class="text-xs font-semibold">{opt.label}</p>
                    <p class="text-[9px] text-gremius-subtle mt-0.5">{opt.desc}</p>
                  </button>
                {/each}
              </div>
            </div>

            <!-- Write Access -->
            <div>
              <label class="label mb-2 block">Who can write?</label>
              <div class="grid grid-cols-2 gap-2">
                {#each writeAccessOptions as opt}
                  <button
                    onclick={() => localDef.policyJson!.writeAccess = opt.value}
                    class="card-glow p-3 text-center transition-all {localDef.policyJson!.writeAccess === opt.value ? 'border-gremius-pink-40 bg-gremius-pink-5 text-gremius-pink' : 'text-gremius-text-dim hover:text-gremius-text'}"
                  >
                    <opt.icon class="w-5 h-5 mx-auto mb-1.5" />
                    <p class="text-xs font-semibold">{opt.label}</p>
                    <p class="text-[9px] text-gremius-subtle mt-0.5">{opt.desc}</p>
                  </button>
                {/each}
              </div>
            </div>

            <!-- RLS Toggle -->
            <div class="pt-4 border-t border-gremius-border">
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-sm font-medium text-gremius-text flex items-center gap-2">
                    <Lock class="w-3.5 h-3.5 text-gremius-amber" />
                    Row-Level Security
                  </p>
                  <p class="text-[10px] text-gremius-subtle mt-0.5">Filter rows based on user context</p>
                </div>
                <button
                  onclick={() => localDef.policyJson!.enableRLS = !localDef.policyJson!.enableRLS}
                  class="relative w-10 h-6 rounded-full transition-colors {localDef.policyJson!.enableRLS ? 'bg-gremius-amber' : 'bg-gremius-border'}"
                >
                  <span class="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform {localDef.policyJson!.enableRLS ? 'translate-x-4.5' : 'translate-x-0.5'}"></span>
                </button>
              </div>

              <!-- RLS Rules -->
              {#if localDef.policyJson!.enableRLS}
                <div class="mt-4 space-y-3">
                  {#each localDef.policyJson!.rlsRules || [] as rule, ri}
                    <div class="flex items-center gap-2">
                      <input bind:value={rule.field} type="text" placeholder="field_key" class="input flex-1 font-mono text-xs" />
                      <select bind:value={rule.operator} class="select w-24 text-xs">
                        <option value="eq">equals</option>
                        <option value="neq">not equal</option>
                        <option value="contains">contains</option>
                        <option value="gt">greater</option>
                        <option value="lt">less</option>
                      </select>
                      <input bind:value={rule.value} type="text" placeholder="value or __USER_ID__" class="input flex-1 text-xs" />
                      <button onclick={() => localDef.policyJson!.rlsRules!.splice(ri, 1)} class="btn-icon p-1.5 hover:!text-gremius-pink">
                        <X class="w-3.5 h-3.5" />
                      </button>
                    </div>
                  {/each}
                  <button onclick={addRLSRule} class="btn-ghost btn-sm w-full justify-center">
                    <Plus class="w-3.5 h-3.5" /> Add Rule
                  </button>
                </div>
              {/if}
            </div>

            <!-- Remove policy -->
            <div class="pt-4 border-t border-gremius-border">
              <button onclick={() => localDef.policyJson = null} class="btn-ghost btn-sm text-gremius-pink hover:bg-gremius-pink/5">
                <X class="w-3.5 h-3.5" /> Remove Custom Security
              </button>
            </div>
          </div>
        {/if}
      </div>
    {/if}

    <!-- ════════════════════════════════════════ -->
    <!-- TAB: Workflow -->
    <!-- ════════════════════════════════════════ -->
    {#if activeTab === "workflow"}
      <div class="flex-1 card overflow-y-auto">
        <div class="p-3 border-b border-gremius-border sticky top-0 bg-gremius-card z-10">
          <div class="flex items-center gap-2">
            <GitPullRequest class="w-4 h-4 text-gremius-purple" />
            <p class="label">Workflow & Approvals</p>
          </div>
          <p class="text-[10px] text-gremius-subtle mt-0.5">Require review before entries go live. Leave disabled for instant publish.</p>
        </div>

        {#if !localDef.workflowJson || !localDef.workflowJson.requireApproval}
          <div class="flex flex-col items-center justify-center py-20 text-gremius-subtle">
            <Zap class="w-12 h-12 mb-4 text-gremius-muted" />
            <p class="text-sm font-medium text-gremius-text">Default: Instant Publish</p>
            <p class="text-xs mt-1 mb-6 text-center max-w-xs">New entries are published immediately. Enable approval workflow to require review before publishing.</p>
            <button onclick={enableWorkflow} class="btn-primary">
              <GitPullRequest class="w-4 h-4" /> Enable Approval Workflow
            </button>
          </div>
        {:else}
          <div class="p-5 space-y-6">
            <!-- Require Approval Toggle -->
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm font-medium text-gremius-text flex items-center gap-2">
                  <CheckCircle class="w-3.5 h-3.5 text-gremius-purple" />
                  Require Approval
                </p>
                <p class="text-[10px] text-gremius-subtle mt-0.5">New entries start as drafts until approved</p>
              </div>
              <button
                onclick={() => localDef.workflowJson!.requireApproval = !localDef.workflowJson!.requireApproval}
                class="relative w-10 h-6 rounded-full transition-colors {localDef.workflowJson!.requireApproval ? 'bg-gremius-purple' : 'bg-gremius-border'}"
              >
                <span class="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform {localDef.workflowJson!.requireApproval ? 'translate-x-4.5' : 'translate-x-0.5'}"></span>
              </button>
            </div>

            <!-- Approver IDs -->
            <div>
              <label class="label mb-2 block">Approver User IDs</label>
              <p class="text-[10px] text-gremius-subtle mb-3">Users who can review and publish draft entries</p>
              <div class="space-y-2">
                {#each localDef.workflowJson!.approverUserIds || [] as _, ai}
                  <div class="flex items-center gap-2">
                    <input bind:value={localDef.workflowJson!.approverUserIds![ai]} type="text" placeholder="User ID" class="input flex-1 font-mono text-xs" />
                    <button onclick={() => localDef.workflowJson!.approverUserIds!.splice(ai, 1)} class="btn-icon p-1.5 hover:!text-gremius-pink">
                      <X class="w-3.5 h-3.5" />
                    </button>
                  </div>
                {/each}
              </div>
              <button onclick={addApprover} class="btn-ghost btn-sm mt-2 w-full justify-center">
                <Plus class="w-3.5 h-3.5" /> Add Approver
              </button>
            </div>

            <!-- Remove workflow -->
            <div class="pt-4 border-t border-gremius-border">
              <button onclick={() => localDef.workflowJson = null} class="btn-ghost btn-sm text-gremius-pink hover:bg-gremius-pink/5">
                <X class="w-3.5 h-3.5" /> Remove Workflow
              </button>
            </div>
          </div>
        {/if}
      </div>
    {/if}

    <!-- Bottom action bar -->
    <div class="mt-4 flex items-center justify-between">
      {#if validationErrors().length > 0}
        <p class="text-xs text-gremius-pink">{validationErrors()[0]}</p>
      {:else}
        <div></div>
      {/if}
      <div class="flex items-center gap-3">
        <button onclick={onCancel} class="btn-ghost">Cancel</button>
        <button onclick={save} disabled={!canSave} class="btn-primary">
          <Save class="w-4 h-4" />
          {localDef.id ? "Update Schema" : "Create Dataset"}
        </button>
      </div>
    </div>
  </div>

  <!-- ═══ RIGHT: Field Settings Panel ═══ -->
  {#if selectedField && activeTab === "fields"}
    <div transition:slide={{ duration: 200, axis: "x" }} class="w-80 shrink-0 card overflow-y-auto">
      <div class="p-4 border-b border-gremius-border sticky top-0 bg-gremius-card z-10">
        <div class="flex items-center justify-between">
          <p class="label">Field Settings</p>
          <button onclick={() => selectedFieldId = null} class="btn-icon p-1">
            <X class="w-4 h-4" />
          </button>
        </div>
        <div class="flex items-center gap-2 mt-2">
          <div
            class="w-6 h-6 rounded flex items-center justify-center"
            style="background: {getFieldColor(selectedField.type)}15"
          >
            {#if getFieldIcon(selectedField.type)}
              {@const SFI = getFieldIcon(selectedField.type)}
              <SFI class="w-3 h-3" style="color: {getFieldColor(selectedField.type)}" />
            {/if}
          </div>
          <span class="text-xs font-medium text-gremius-text">{getFieldTypeLabel(selectedField.type)}</span>
        </div>
      </div>

      <div class="p-4 space-y-5">
        <!-- Label -->
        <div>
          <label class="label mb-1.5 block">Label *</label>
          <input bind:value={selectedField.label} oninput={() => autoFieldKey(selectedField)} type="text" placeholder="e.g. Weapon Name" class="input" />
        </div>

        <!-- Key -->
        <div>
          <label class="label mb-1.5 block">Machine Key</label>
          <input bind:value={selectedField.key} type="text" placeholder="e.g. weapon_name" class="input font-mono text-xs" />
        </div>

        <!-- Help text -->
        <div>
          <label class="label mb-1.5 block">Help Text</label>
          <input bind:value={selectedField.helpText} type="text" placeholder="Shown below the field" class="input" />
        </div>

        <!-- ── Validation Rules ── -->
        <div class="pt-3 border-t border-gremius-border">
          <p class="label mb-3">Validation Rules</p>

          <!-- Required -->
          <div class="flex items-center justify-between py-2">
            <div>
              <p class="text-sm text-gremius-text">Required</p>
              <p class="text-[10px] text-gremius-subtle">Must have a value</p>
            </div>
            <button
              onclick={() => selectedField.isRequired = !selectedField.isRequired}
              class="relative w-10 h-6 rounded-full transition-colors {selectedField.isRequired ? 'bg-gremius-cyan' : 'bg-gremius-border'}"
            >
              <span class="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform {selectedField.isRequired ? 'translate-x-4.5' : 'translate-x-0.5'}"></span>
            </button>
          </div>

          <!-- Unique -->
          <div class="flex items-center justify-between py-2">
            <div>
              <p class="text-sm text-gremius-text">Unique</p>
              <p class="text-[10px] text-gremius-subtle">No duplicate values</p>
            </div>
            <button
              onclick={() => selectedField.isUnique = !selectedField.isUnique}
              class="relative w-10 h-6 rounded-full transition-colors {selectedField.isUnique ? 'bg-gremius-amber' : 'bg-gremius-border'}"
            >
              <span class="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform {selectedField.isUnique ? 'translate-x-4.5' : 'translate-x-0.5'}"></span>
            </button>
          </div>

          <!-- Default value -->
          <div class="pt-2">
            <label class="label mb-1.5 block">Default Value</label>
            <input bind:value={selectedField.defaultValue} type="text" placeholder="e.g. Unknown" class="input" />
          </div>

          <!-- Regex (text, email, url) -->
          {#if ["text", "email", "url"].includes(selectedField.type)}
            <div class="pt-2">
              <label class="label mb-1.5 block">Validation Regex</label>
              <input bind:value={selectedField.validationRegex} type="text" placeholder="e.g. ^[A-Za-z0-9]+$" class="input font-mono text-xs" />
            </div>
          {/if}

          <!-- Min/Max (number) -->
          {#if selectedField.type === "number"}
            <div class="pt-2 grid grid-cols-2 gap-3">
              <div>
                <label class="label mb-1.5 block">Min</label>
                <input bind:value={selectedField.minValue} type="number" class="input" placeholder="0" />
              </div>
              <div>
                <label class="label mb-1.5 block">Max</label>
                <input bind:value={selectedField.maxValue} type="number" class="input" placeholder="100" />
              </div>
            </div>
          {/if}

          <!-- Min/Max length (text) -->
          {#if selectedField.type === "text"}
            <div class="pt-2 grid grid-cols-2 gap-3">
              <div>
                <label class="label mb-1.5 block">Min Length</label>
                <input bind:value={selectedField.minLength} type="number" class="input" placeholder="0" />
              </div>
              <div>
                <label class="label mb-1.5 block">Max Length</label>
                <input bind:value={selectedField.maxLength} type="number" class="input" placeholder="255" />
              </div>
            </div>
          {/if}
        </div>

        <!-- ── Select Options ── -->
        {#if selectedField.type === "select"}
          <div class="pt-3 border-t border-gremius-border">
            <p class="label mb-3">Options</p>
            <div class="space-y-2">
              {#each selectedField.options || [] as opt, oi}
                <div class="flex items-center gap-2">
                  <input bind:value={opt.label} oninput={() => opt.value = opt.label.toLowerCase().replace(/[^a-z0-9]+/g, "_")} type="text" placeholder="Option {oi + 1}" class="input flex-1" />
                  <button onclick={() => selectedField.options!.splice(oi, 1)} class="btn-icon p-1.5 hover:!text-gremius-pink">
                    <X class="w-3.5 h-3.5" />
                  </button>
                </div>
              {/each}
            </div>
            <button onclick={addSelectOption} class="btn-ghost btn-sm mt-2 w-full justify-center">
              <Plus class="w-3.5 h-3.5" /> Add Option
            </button>
          </div>
        {/if}

        <!-- ── Relation Config ── -->
        {#if selectedField.type === "relation"}
          <div class="pt-3 border-t border-gremius-border">
            <p class="label mb-3">
              <GitBranch class="w-3 h-3 inline text-gremius-pink mr-1" />
              Relationship
            </p>

            <!-- Target collection -->
            <div class="mb-3">
              <label class="label mb-1.5 block">Link to Collection</label>
              <select class="select">
                <option value="">— Select collection —</option>
                <option value="games">🎮 Games</option>
                <option value="blog-posts">📝 Blog Posts</option>
                <option value="platforms">🖥️ Platforms</option>
                <option value="tags">🏷️ Tags</option>
                <option value="streamers">📺 Streamers</option>
                <optgroup label="── Datasets ──">
                  {#each otherDatasets as ds}
                    <option value="dataset:{ds.id}">{ds.icon || "📦"} {ds.name}</option>
                  {/each}
                </optgroup>
              </select>
            </div>

            <!-- Relationship type -->
            <div class="mb-3">
              <label class="label mb-1.5 block">Cardinality</label>
              <div class="grid grid-cols-3 gap-2">
                {#each ["one-to-one", "one-to-many", "many-to-many"] as rt}
                  <button
                    onclick={() => setRelationType(rt as RelationType)}
                    class="card-glow p-3 text-center transition-all text-xs font-medium {selectedField.relation?.type === rt ? 'border-gremius-pink-40 bg-gremius-pink-5 text-gremius-pink' : 'text-gremius-text-dim hover:text-gremius-text'}"
                  >
                    <p class="text-lg mb-1">{rt === "one-to-one" ? "1↔1" : rt === "one-to-many" ? "1→N" : "M↔N"}</p>
                    <p>{rt === "one-to-one" ? "Has One" : rt === "one-to-many" ? "Has Many" : "Many-Many"}</p>
                  </button>
                {/each}
              </div>
            </div>

            <!-- Display field -->
            <div>
              <label class="label mb-1.5 block">Display Field</label>
              <input type="text" placeholder="e.g. title, name" class="input" />
              <p class="text-[10px] text-gremius-subtle mt-1">Which field to show in the selector</p>
            </div>
          </div>
        {/if}

        <!-- Grid settings -->
        <div class="pt-3 border-t border-gremius-border">
          <p class="label mb-3">Display</p>
          <div class="flex items-center justify-between py-2">
            <div>
              <p class="text-sm text-gremius-text">Hidden in Grid</p>
              <p class="text-[10px] text-gremius-subtle">Only visible in form</p>
            </div>
            <button
              onclick={() => selectedField.hidden = !selectedField.hidden}
              class="relative w-10 h-6 rounded-full transition-colors {selectedField.hidden ? 'bg-gremius-subtle' : 'bg-gremius-border'}"
            >
              <span class="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform {selectedField.hidden ? 'translate-x-4.5' : 'translate-x-0.5'}"></span>
            </button>
          </div>
          <div class="pt-2">
            <label class="label mb-1.5 block">Column Width (px)</label>
            <input bind:value={selectedField.width} type="number" placeholder="Auto" class="input" />
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .bg-gremius-cyan-10 { background-color: rgb(0 229 255 / 0.1); }
  .border-gremius-cyan-20 { border-color: rgb(0 229 255 / 0.2); }
  .border-gremius-cyan-40 { border-color: rgb(0 229 255 / 0.4); }
  .bg-gremius-cyan-5 { background-color: rgb(0 229 255 / 0.05); }
  .bg-gremius-pink-5 { background-color: rgb(255 42 109 / 0.05); }
  .border-gremius-pink-40 { border-color: rgb(255 42 109 / 0.4); }
  .border-gremius-amber-40 { border-color: rgb(255 171 0 / 0.4); }
</style>
