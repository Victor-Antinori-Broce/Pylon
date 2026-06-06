<script lang="ts">
  /**
   * DMSView - Document Management System
   * 
   * Vista personalizada para gestión documental con:
   * - Dashboard con estadísticas
   * - Navegación por categorías (árbol jerárquico)
   * - Lista de documentos con filtros avanzados
   * - Workflow visual de aprobación
   * - Gestión de versiones
   * - Audit trail
   */
  import { 
    FileText, FolderTree, GitBranch, 
    Plus, Search, MoreVertical, Eye, Edit2, CheckCircle, Clock, XCircle, AlertCircle,
    ChevronRight, ChevronDown, Folder, Tag, FileStack,
    ClipboardCheck, Archive, X
  } from "lucide-svelte";
  import { onMount } from "svelte";
  
  const API_URL = import.meta.env.VITE_API_URL ?? "";
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STATE
  // ═══════════════════════════════════════════════════════════════════════════
  
  const activeTab = $state("documents"); // documents, categories, versions, audit, stats
  let loading = $state(true);
  const error = $state<string | null>(null);
  
  // Categorías
  let categories = $state<any[]>([]);
  let selectedCategory = $state<any>(null);
  let expandedCategories = $state<Set<string>>(new Set());
  
  // Documentos
  let documents = $state<any[]>([]);
  const selectedDocument = $state<any>(null);
  let searchQuery = $state("");
  let statusFilter = $state<string>("");
  let typeFilter = $state<string>("");
  
  // Stats
  let stats = $state<any>(null);
  
  // Pagination
  let currentPage = $state(1);
  let totalPages = $state(1);
  const pageSize = $state(25);
  
  // Modals
  let showCreateModal = $state(false);
  const showVersionModal = $state(false);
  let showCategoryModal = $state(false);
  const showUploadModal = $state(false);

  // Form state
  const saving = $state(false);
  let newDocTitle = $state("");
  let newDocDescription = $state("");
  let newDocType = $state("manual");
  let newDocCategoryId = $state("");
  let newDocStatus = $state("draft");
  let newDocTags = $state("");
  let newCategoryName = $state("");
  let newCategoryDescription = $state("");
  let newCategoryIcon = $state("📁");
  let newCategoryColor = $state("#6366f1");
  let newCategoryParentId = $state("");
  
  // Document types
  const documentTypes = [
    { id: "manual", label: "Manual", icon: "📖", color: "#4F46E5" },
    { id: "policy", label: "Policy", icon: "📋", color: "#DC2626" },
    { id: "procedure", label: "Procedure", icon: "⚙️", color: "#059669" },
    { id: "template", label: "Template", icon: "📄", color: "#7C3AED" },
    { id: "guide", label: "Guide", icon: "🧭", color: "#EA580C" },
    { id: "training", label: "Training", icon: "🎓", color: "#0891B2" },
    { id: "report", label: "Report", icon: "📊", color: "#BE185D" },
    { id: "other", label: "Other", icon: "📎", color: "#6B7280" },
  ];
  
  const workflowStatuses = [
    { id: "draft", label: "Draft", color: "#6B7280", icon: Clock },
    { id: "in_review", label: "In Review", color: "#F59E0B", icon: ClipboardCheck },
    { id: "approved", label: "Approved", color: "#10B981", icon: CheckCircle },
    { id: "published", label: "Published", color: "#3B82F6", icon: CheckCircle },
    { id: "archived", label: "Archived", color: "#8B5CF6", icon: Archive },
    { id: "deprecated", label: "Deprecated", color: "#EF4444", icon: XCircle },
  ];
  
  // ═══════════════════════════════════════════════════════════════════════════
  // LIFECYCLE
  // ═══════════════════════════════════════════════════════════════════════════
  
  onMount(() => {
    loadCategories();
    loadDocuments();
    loadStats();
  });
  
  // ═══════════════════════════════════════════════════════════════════════════
  // DATA LOADING
  // ═══════════════════════════════════════════════════════════════════════════
  
  async function loadCategories() {
    try {
      const res = await fetch(`${API_URL}/api/dms/categories/tree`, {
        credentials: "include"
      });
      if (res.ok) {
        const result = await res.json();
        categories = result.docs || [];
      }
    } catch (e) {
      console.error("Failed to load categories:", e);
    }
  }
  
  async function loadDocuments() {
    loading = true;
    try {
      const params = new URLSearchParams();
      params.set("page", String(currentPage));
      params.set("limit", String(pageSize));
      
      if (selectedCategory?.id) params.set("categoryId", selectedCategory.id);
      if (searchQuery) params.set("search", searchQuery);
      if (statusFilter) params.set("status", statusFilter);
      if (typeFilter) params.set("type", typeFilter);
      
      const res = await fetch(`${API_URL}/api/dms/documents?${params}`, {
        credentials: "include"
      });
      
      if (res.ok) {
        const result = await res.json();
        documents = result.docs || [];
        totalPages = result.pagination?.totalPages || 1;
      }
    } catch (e) {
      console.error("Failed to load documents:", e);
    } finally {
      loading = false;
    }
  }
  
  async function loadStats() {
    try {
      const res = await fetch(`${API_URL}/api/dms/stats`, {
        credentials: "include"
      });
      if (res.ok) {
        stats = await res.json();
      }
    } catch (e) {
      console.error("Failed to load stats:", e);
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════
  
  function getStatusConfig(status: string) {
    return workflowStatuses.find(s => s.id === status) || workflowStatuses[0];
  }
  
  function getTypeConfig(type: string) {
    return documentTypes.find(t => t.id === type) || documentTypes[7];
  }
  
  function toggleCategory(category: any) {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category.id)) {
      newExpanded.delete(category.id);
    } else {
      newExpanded.add(category.id);
    }
    expandedCategories = newExpanded;
  }
  
  function selectCategory(category: any) {
    selectedCategory = category;
    currentPage = 1;
    loadDocuments();
  }
  
  function formatDate(date: string) {
    if (!date) return "—";
    return new Date(date).toLocaleDateString("es-ES", {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════
</script>

<div class="h-full flex flex-col bg-gremius-bg">
  <!-- Header -->
  <div class="border-b border-gremius-border bg-gremius-card px-6 py-4">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center">
          <FileStack class="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 class="text-xl font-bold text-gremius-text">Document Management</h1>
          <p class="text-sm text-gremius-subtle">Versioned document storage with approval workflows</p>
        </div>
      </div>
      
      <div class="flex items-center gap-3">
        <button
          class="btn-secondary"
          onclick={() => showCategoryModal = true}
        >
          <FolderTree class="w-4 h-4" />
          Categories
        </button>
        <button
          class="btn-primary"
          onclick={() => showCreateModal = true}
        >
          <Plus class="w-4 h-4" />
          New Document
        </button>
      </div>
    </div>
    
    <!-- Stats Row -->
    {#if stats}
      <div class="grid grid-cols-4 gap-4 mt-4 pt-4 border-t border-gremius-border">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
            <FileText class="w-5 h-5 text-blue-500" />
          </div>
          <div>
            <p class="text-2xl font-bold text-gremius-text">{stats.documents?.total || 0}</p>
            <p class="text-xs text-gremius-subtle">Total Documents</p>
          </div>
        </div>
        
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
            <CheckCircle class="w-5 h-5 text-green-500" />
          </div>
          <div>
            <p class="text-2xl font-bold text-gremius-text">{stats.documents?.published || 0}</p>
            <p class="text-xs text-gremius-subtle">Published</p>
          </div>
        </div>
        
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-lg bg-yellow-500/10 flex items-center justify-center">
            <Clock class="w-5 h-5 text-yellow-500" />
          </div>
          <div>
            <p class="text-2xl font-bold text-gremius-text">{stats.documents?.draft || 0}</p>
            <p class="text-xs text-gremius-subtle">Drafts</p>
          </div>
        </div>
        
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
            <AlertCircle class="w-5 h-5 text-purple-500" />
          </div>
          <div>
            <p class="text-2xl font-bold text-gremius-text">{stats.upcomingReviews?.length || 0}</p>
            <p class="text-xs text-gremius-subtle">Up for Review</p>
          </div>
        </div>
      </div>
    {/if}
  </div>
  
  <!-- Main Content -->
  <div class="flex-1 flex overflow-hidden">
    <!-- Sidebar - Categories -->
    <div class="w-64 border-r border-gremius-border bg-gremius-card flex flex-col">
      <div class="p-4 border-b border-gremius-border">
        <h3 class="font-semibold text-gremius-text flex items-center gap-2">
          <FolderTree class="w-4 h-4" />
          Categories
        </h3>
      </div>
      
      <div class="flex-1 overflow-y-auto p-2">
        <button
          class="w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 {selectedCategory === null ? 'bg-gremius-cyan/10 text-gremius-cyan' : 'text-gremius-text hover:bg-gremius-bg'}"
          onclick={() => selectCategory(null)}
        >
          <FileText class="w-4 h-4" />
          All Documents
        </button>
        
        {#each categories as category}
          <div class="mt-1">
            <div class="group flex items-center gap-1">
              <!-- Expand/Collapse Toggle -->
              {#if category.children?.length > 0}
                <button
                  class="p-1 hover:bg-gremius-bg rounded shrink-0"
                  onclick={() => toggleCategory(category)}
                >
                  {#if expandedCategories.has(category.id)}
                    <ChevronDown class="w-3.5 h-3.5 text-gremius-text-dim" />
                  {:else}
                    <ChevronRight class="w-3.5 h-3.5 text-gremius-text-dim" />
                  {/if}
                </button>
              {:else}
                <span class="w-6 shrink-0"></span>
              {/if}
              
              <!-- Category Button -->
              <button
                class="flex-1 text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 {selectedCategory?.id === category.id ? 'bg-gremius-cyan/10 text-gremius-cyan' : 'text-gremius-text hover:bg-gremius-bg'}"
                onclick={() => selectCategory(category)}
              >
                <span class="text-lg shrink-0">{category.icon || "📁"}</span>
                <span class="truncate">{category.name}</span>
                <span class="ml-auto text-xs text-gremius-subtle shrink-0">{category.documentCount || 0}</span>
              </button>
            </div>
            
            {#if expandedCategories.has(category.id) && category.children?.length > 0}
              <div class="ml-4 pl-2 border-l border-gremius-border">
                {#each category.children as child}
                  <button
                    class="w-full text-left px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 mt-0.5 {selectedCategory?.id === child.id ? 'bg-gremius-cyan/10 text-gremius-cyan' : 'text-gremius-subtle hover:text-gremius-text hover:bg-gremius-bg'}"
                    onclick={() => selectCategory(child)}
                  >
                    <span class="text-sm">{child.icon || "📂"}</span>
                    <span class="truncate">{child.name}</span>
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </div>
    
    <!-- Document List -->
    <div class="flex-1 flex flex-col min-w-0">
      <!-- Filters -->
      <div class="p-4 border-b border-gremius-border bg-gremius-card">
        <div class="flex items-center gap-3">
          <div class="relative flex-1 max-w-md">
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gremius-text-dim" />
            <input
              type="text"
              placeholder="Search documents..."
              class="w-full pl-10 pr-4 py-2 bg-gremius-bg border border-gremius-border rounded-lg text-gremius-text placeholder:text-gremius-text-dim focus:outline-none focus:border-gremius-cyan/50"
              bind:value={searchQuery}
              oninput={() => { currentPage = 1; loadDocuments(); }}
            />
          </div>
          
          <select
            class="px-3 py-2 bg-gremius-bg border border-gremius-border rounded-lg text-gremius-text focus:outline-none focus:border-gremius-cyan/50"
            bind:value={statusFilter}
            onchange={() => { currentPage = 1; loadDocuments(); }}
          >
            <option value="">All Status</option>
            {#each workflowStatuses as status}
              <option value={status.id}>{status.label}</option>
            {/each}
          </select>
          
          <select
            class="px-3 py-2 bg-gremius-bg border border-gremius-border rounded-lg text-gremius-text focus:outline-none focus:border-gremius-cyan/50"
            bind:value={typeFilter}
            onchange={() => { currentPage = 1; loadDocuments(); }}
          >
            <option value="">All Types</option>
            {#each documentTypes as type}
              <option value={type.id}>{type.label}</option>
            {/each}
          </select>
        </div>
      </div>
      
      <!-- Documents Grid -->
      <div class="flex-1 overflow-y-auto p-4">
        {#if loading}
          <div class="flex items-center justify-center h-full">
            <div class="w-8 h-8 border-2 border-gremius-cyan/30 border-t-gremius-cyan rounded-full animate-spin"></div>
          </div>
        {:else if documents.length === 0}
          <div class="flex flex-col items-center justify-center h-full text-center">
            <div class="w-16 h-16 rounded-full bg-gremius-bg flex items-center justify-center mb-4">
              <FileText class="w-8 h-8 text-gremius-text-dim" />
            </div>
            <h3 class="text-lg font-semibold text-gremius-text mb-1">No documents found</h3>
            <p class="text-sm text-gremius-subtle">
              {selectedCategory ? "This category is empty" : "Get started by creating your first document"}
            </p>
          </div>
        {:else}
          <div class="grid gap-3">
            {#each documents as doc}
              {@const status = getStatusConfig(doc.status)}
              {@const type = getTypeConfig(doc.type)}
              <div class="bg-gremius-card border border-gremius-border rounded-xl p-4 hover:border-gremius-cyan/30 transition-colors">
                <div class="flex items-start gap-4">
                  <!-- Type Icon -->
                  <div 
                    class="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0"
                    style="background-color: {type.color}20"
                  >
                    {type.icon}
                  </div>
                  
                  <!-- Content -->
                  <div class="flex-1 min-w-0">
                    <div class="flex items-start justify-between gap-4">
                      <div>
                        <div class="flex items-center gap-2 mb-1">
                          <span class="text-xs font-mono text-gremius-subtle">{doc.code}</span>
                          <span 
                            class="px-2 py-0.5 rounded-full text-xs font-medium"
                            style="background-color: {status.color}20; color: {status.color}"
                          >
                            {status.label}
                          </span>
                        </div>
                        <h3 class="font-semibold text-gremius-text truncate">{doc.title}</h3>
                        <p class="text-sm text-gremius-subtle line-clamp-1 mt-0.5">{doc.description || "No description"}</p>
                      </div>
                      
                      <!-- Actions -->
                      <div class="flex items-center gap-1 shrink-0">
                        <button class="p-2 hover:bg-gremius-bg rounded-lg text-gremius-text-dim hover:text-gremius-text" title="View">
                          <Eye class="w-4 h-4" />
                        </button>
                        <button class="p-2 hover:bg-gremius-bg rounded-lg text-gremius-text-dim hover:text-gremius-text" title="Edit">
                          <Edit2 class="w-4 h-4" />
                        </button>
                        <button class="p-2 hover:bg-gremius-bg rounded-lg text-gremius-text-dim hover:text-gremius-text" title="More">
                          <MoreVertical class="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    
                    <!-- Meta -->
                    <div class="flex items-center gap-4 mt-3 text-xs text-gremius-subtle">
                      <span class="flex items-center gap-1">
                        <GitBranch class="w-3.5 h-3.5" />
                        v{doc.currentVersionNumber}
                      </span>
                      {#if doc.categoryName}
                        <span class="flex items-center gap-1">
                          <Folder class="w-3.5 h-3.5" />
                          {doc.categoryName}
                        </span>
                      {/if}
                      {#if doc.tags?.length > 0}
                        <span class="flex items-center gap-1">
                          <Tag class="w-3.5 h-3.5" />
                          {doc.tags.slice(0, 3).join(", ")}
                          {#if doc.tags.length > 3}
                            <span class="text-gremius-text-dim">+{doc.tags.length - 3}</span>
                          {/if}
                        </span>
                      {/if}
                      <span class="ml-auto">Updated {formatDate(doc.updatedAt)}</span>
                      {#if doc.reviewDueDate}
                        <span class="flex items-center gap-1 {new Date(doc.reviewDueDate) < new Date() ? 'text-red-500' : ''}">
                          <AlertCircle class="w-3.5 h-3.5" />
                          Review due: {formatDate(doc.reviewDueDate)}
                        </span>
                      {/if}
                    </div>
                  </div>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
      
      <!-- Pagination -->
      {#if totalPages > 1}
        <div class="p-4 border-t border-gremius-border bg-gremius-card flex items-center justify-between">
          <span class="text-sm text-gremius-subtle">
            Page {currentPage} of {totalPages}
          </span>
          <div class="flex items-center gap-2">
            <button
              class="px-3 py-1.5 rounded-lg bg-gremius-bg border border-gremius-border text-gremius-text text-sm hover:border-gremius-cyan/50 disabled:opacity-50"
              disabled={currentPage === 1}
              onclick={() => { currentPage--; loadDocuments(); }}
            >
              Previous
            </button>
            <button
              class="px-3 py-1.5 rounded-lg bg-gremius-bg border border-gremius-border text-gremius-text text-sm hover:border-gremius-cyan/50 disabled:opacity-50"
              disabled={currentPage === totalPages}
              onclick={() => { currentPage++; loadDocuments(); }}
            >
              Next
            </button>
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>

<!-- Create Document Modal -->
{#if showCreateModal}
  <div class="fixed inset-0 z-50 flex items-center justify-center">
    <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" onclick={() => showCreateModal = false}></div>
    <div class="relative bg-gremius-card border border-gremius-border rounded-2xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
      <div class="flex items-center justify-between p-6 border-b border-gremius-border">
        <h3 class="text-lg font-semibold text-gremius-text">New Document</h3>
        <button
          onclick={() => showCreateModal = false}
          class="p-2 rounded-xl text-gremius-text-dim hover:text-gremius-text hover:bg-gremius-bg transition-all"
        >
          <X class="w-5 h-5" />
        </button>
      </div>
      <form onsubmit={saveDocument} class="p-6 space-y-4">
        <div>
          <label class="block text-xs text-gremius-subtle mb-1">Title *</label>
          <input
            bind:value={newDocTitle}
            type="text"
            placeholder="Document title"
            class="w-full bg-gremius-bg text-gremius-text border border-gremius-border rounded-lg px-3 py-2 text-sm focus:border-gremius-cyan/50 focus:outline-none"
            required
          />
        </div>
        <div>
          <label class="block text-xs text-gremius-subtle mb-1">Description</label>
          <textarea
            bind:value={newDocDescription}
            rows="3"
            placeholder="Short description"
            class="w-full bg-gremius-bg text-gremius-text border border-gremius-border rounded-lg px-3 py-2 text-sm focus:border-gremius-cyan/50 focus:outline-none"
          ></textarea>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-xs text-gremius-subtle mb-1">Type</label>
            <select
              bind:value={newDocType}
              class="w-full bg-gremius-bg text-gremius-text border border-gremius-border rounded-lg px-3 py-2 text-sm focus:border-gremius-cyan/50 focus:outline-none"
            >
              {#each documentTypes as t}
                <option value={t.id}>{t.label}</option>
              {/each}
            </select>
          </div>
          <div>
            <label class="block text-xs text-gremius-subtle mb-1">Status</label>
            <select
              bind:value={newDocStatus}
              class="w-full bg-gremius-bg text-gremius-text border border-gremius-border rounded-lg px-3 py-2 text-sm focus:border-gremius-cyan/50 focus:outline-none"
            >
              {#each workflowStatuses as s}
                <option value={s.id}>{s.label}</option>
              {/each}
            </select>
          </div>
        </div>
        <div>
          <label class="block text-xs text-gremius-subtle mb-1">Category</label>
          <select
            bind:value={newDocCategoryId}
            class="w-full bg-gremius-bg text-gremius-text border border-gremius-border rounded-lg px-3 py-2 text-sm focus:border-gremius-cyan/50 focus:outline-none"
          >
            <option value="">No category</option>
            {#each categories as cat}
              <option value={cat.id}>{cat.name}</option>
            {/each}
          </select>
        </div>
        <div>
          <label class="block text-xs text-gremius-subtle mb-1">Tags (comma separated)</label>
          <input
            bind:value={newDocTags}
            type="text"
            placeholder="policy, hr, 2025"
            class="w-full bg-gremius-bg text-gremius-text border border-gremius-border rounded-lg px-3 py-2 text-sm focus:border-gremius-cyan/50 focus:outline-none"
          />
        </div>
        <div class="flex justify-end gap-3 pt-4 border-t border-gremius-border">
          <button
            type="button"
            onclick={() => showCreateModal = false}
            class="px-5 py-2.5 text-sm font-medium rounded-xl bg-gremius-surface border border-gremius-border text-gremius-text hover:bg-gremius-bg transition-all"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !newDocTitle}
            class="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-xl bg-gradient-to-r from-gremius-cyan to-cyan-400 text-black shadow-lg hover:shadow-cyan-500/40 transition-all disabled:opacity-50"
          >
            {#if saving}
              <span class="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin"></span>
              Creating...
            {:else}
              <Plus class="w-4 h-4" />
              Create Document
            {/if}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

<!-- Create Category Modal -->
{#if showCategoryModal}
  <div class="fixed inset-0 z-50 flex items-center justify-center">
    <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" onclick={() => showCategoryModal = false}></div>
    <div class="relative bg-gremius-card border border-gremius-border rounded-2xl shadow-2xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
      <div class="flex items-center justify-between p-6 border-b border-gremius-border">
        <h3 class="text-lg font-semibold text-gremius-text">New Category</h3>
        <button
          onclick={() => showCategoryModal = false}
          class="p-2 rounded-xl text-gremius-text-dim hover:text-gremius-text hover:bg-gremius-bg transition-all"
        >
          <X class="w-5 h-5" />
        </button>
      </div>
      <form onsubmit={saveCategory} class="p-6 space-y-4">
        <div>
          <label class="block text-xs text-gremius-subtle mb-1">Name *</label>
          <input
            bind:value={newCategoryName}
            type="text"
            placeholder="Category name"
            class="w-full bg-gremius-bg text-gremius-text border border-gremius-border rounded-lg px-3 py-2 text-sm focus:border-gremius-cyan/50 focus:outline-none"
            required
          />
        </div>
        <div>
          <label class="block text-xs text-gremius-subtle mb-1">Description</label>
          <textarea
            bind:value={newCategoryDescription}
            rows="2"
            placeholder="Short description"
            class="w-full bg-gremius-bg text-gremius-text border border-gremius-border rounded-lg px-3 py-2 text-sm focus:border-gremius-cyan/50 focus:outline-none"
          ></textarea>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-xs text-gremius-subtle mb-1">Icon</label>
            <input
              bind:value={newCategoryIcon}
              type="text"
              placeholder="📁"
              class="w-full bg-gremius-bg text-gremius-text border border-gremius-border rounded-lg px-3 py-2 text-sm focus:border-gremius-cyan/50 focus:outline-none"
            />
          </div>
          <div>
            <label class="block text-xs text-gremius-subtle mb-1">Color</label>
            <input
              bind:value={newCategoryColor}
              type="color"
              class="w-full h-10 bg-gremius-bg border border-gremius-border rounded-lg px-2 py-1"
            />
          </div>
        </div>
        <div>
          <label class="block text-xs text-gremius-subtle mb-1">Parent Category</label>
          <select
            bind:value={newCategoryParentId}
            class="w-full bg-gremius-bg text-gremius-text border border-gremius-border rounded-lg px-3 py-2 text-sm focus:border-gremius-cyan/50 focus:outline-none"
          >
            <option value="">None (root)</option>
            {#each categories as cat}
              <option value={cat.id}>{cat.name}</option>
            {/each}
          </select>
        </div>
        <div class="flex justify-end gap-3 pt-4 border-t border-gremius-border">
          <button
            type="button"
            onclick={() => showCategoryModal = false}
            class="px-5 py-2.5 text-sm font-medium rounded-xl bg-gremius-surface border border-gremius-border text-gremius-text hover:bg-gremius-bg transition-all"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !newCategoryName}
            class="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-xl bg-gradient-to-r from-gremius-cyan to-cyan-400 text-black shadow-lg hover:shadow-cyan-500/40 transition-all disabled:opacity-50"
          >
            {#if saving}
              <span class="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin"></span>
              Creating...
            {:else}
              <Plus class="w-4 h-4" />
              Create Category
            {/if}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

<style>
  .btn-primary {
    @apply inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-gremius-cyan to-cyan-400 
           text-black rounded-lg font-medium hover:shadow-lg hover:shadow-cyan-500/25 
           transition-all duration-200;
  }
  
  .btn-secondary {
    @apply inline-flex items-center gap-2 px-4 py-2 bg-gremius-surface border border-gremius-border 
           text-gremius-text rounded-lg hover:border-gremius-cyan/50 transition-all duration-200;
  }
  
  .line-clamp-1 {
    display: -webkit-box;
    -webkit-line-clamp: 1;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
</style>
