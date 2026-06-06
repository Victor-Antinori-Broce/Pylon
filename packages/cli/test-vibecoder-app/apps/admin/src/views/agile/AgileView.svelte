<script lang="ts">
  /**
   * AgileView.svelte — Vista Personalizada para Grimoire Agile
   * 
   * Gestión de proyectos ágil con:
   * - Lista de proyectos
   * - Creación de proyectos
   * - Vista Kanban de issues por proyecto
   * - Gestión de intakes (triage)
   */
  import { api } from "$lib/api";
  import { 
    Kanban, Plus, FolderKanban, Inbox, Settings2,
    AlertCircle, CheckCircle2, XCircle, Clock, Search, User, X
  } from "lucide-svelte";
  import { onMount } from "svelte";

  // ═══════════════════════════════════════════════════════════════════════════════
  // TYPES
  // ═══════════════════════════════════════════════════════════════════════════════
  
  interface Project {
    id: string;
    name: string;
    identifier: string;
    description?: string;
    emoji?: string;
    color?: string;
    isArchived?: boolean;
    leadId?: string;
    keyCounter?: number;
    createdAt?: string;
    states?: State[];
  }

  interface State {
    id: string;
    name: string;
    color: string;
    group: "backlog" | "unstarted" | "started" | "completed" | "cancelled";
    sequence: number;
    isDefault?: boolean;
    isCompleted?: boolean;
  }

  interface Issue {
    id: string;
    key: string;
    name: string;
    type: string;
    priority: "urgent" | "high" | "medium" | "low";
    stateId: string;
    assigneeId?: string;
    estimate?: number;
    createdAt: string;
    updatedAt: string;
    state?: State;
  }

  interface Intake {
    id: string;
    title: string;
    description?: string;
    status: "pending" | "accepted" | "declined" | "duplicate" | "spam";
    source: string;
    suggestedType?: string;
    suggestedPriority?: string;
    createdIssueKey?: string;
    createdAt: string;
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // STATE
  // ═══════════════════════════════════════════════════════════════════════════════
  
  let projects = $state<Project[]>([]);
  let selectedProject = $state<Project | null>(null);
  let issues = $state<Issue[]>([]);
  let intakes = $state<Intake[]>([]);
  let states = $state<State[]>([]);
  
  let loading = $state(true);
  let error = $state("");
  let activeTab = $state<"board" | "intakes" | "settings">("board");
  
  // Modals
  let showCreateProject = $state(false);
  let showCreateIssue = $state(false);
  let showIntakeDetail = $state(false);
  let selectedIntake = $state<Intake | null>(null);
  
  // Forms
  let newProject = $state({ name: "", identifier: "", description: "" });
  let newIssue = $state({ name: "", description: "", type: "issue", priority: "medium" });
  
  // Search & Filter
  let searchQuery = $state("");
  let filterPriority = $state<string>("");

  const API_URL = import.meta.env.VITE_API_URL ?? "";

  // ═══════════════════════════════════════════════════════════════════════════════
  // LIFECYCLE
  // ═══════════════════════════════════════════════════════════════════════════════
  
  onMount(async () => {
    await loadProjects();
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // API CALLS
  // ═══════════════════════════════════════════════════════════════════════════════
  
  async function loadProjects() {
    try {
      loading = true;
      error = "";
      const data = await api.get<{ docs: Project[] }>("/agile/projects");
      projects = data.docs || [];
      
      // Auto-select first project if none selected
      if (!selectedProject && projects.length > 0) {
        await selectProject(projects[0]);
      }
    } catch (err: any) {
      error = err.message || "Failed to load projects";
      console.error("[AgileView] Failed to load projects:", err);
    } finally {
      loading = false;
    }
  }

  async function selectProject(project: Project) {
    selectedProject = project;
    await Promise.all([
      loadProjectDetails(project.id),
      loadIssues(project.id),
      loadIntakes(project.id)
    ]);
  }

  async function loadProjectDetails(projectId: string) {
    try {
      const data = await api.get<Project>(`/agile/projects/${projectId}`);
      states = data.states || [];
      // Update selected project with full details
      if (selectedProject?.id === projectId) {
        selectedProject = { ...selectedProject, ...data };
      }
    } catch (err) {
      console.error("[AgileView] Failed to load project details:", err);
    }
  }

  async function loadIssues(projectId: string) {
    try {
      const data = await api.get<{ docs: Issue[] }>(`/agile/${projectId}/issues?limit=100`);
      // Enrich issues with state data
      issues = (data.docs || []).map(issue => ({
        ...issue,
        state: states.find(s => s.id === issue.stateId)
      }));
    } catch (err) {
      console.error("[AgileView] Failed to load issues:", err);
      issues = [];
    }
  }

  async function loadIntakes(projectId: string) {
    try {
      const data = await api.get<{ docs: Intake[] }>(`/agile/${projectId}/intakes`);
      intakes = data.docs || [];
    } catch (err) {
      console.error("[AgileView] Failed to load intakes:", err);
      intakes = [];
    }
  }

  async function createProject() {
    if (!newProject.name || !newProject.identifier) return;
    
    try {
      await api.post("/agile/projects", {
        name: newProject.name,
        identifier: newProject.identifier.toUpperCase(),
        description: newProject.description
      });
      
      showCreateProject = false;
      newProject = { name: "", identifier: "", description: "" };
      await loadProjects();
    } catch (err: any) {
      alert(err.message || "Failed to create project");
    }
  }

  async function createIssue() {
    if (!selectedProject || !newIssue.name) return;
    
    try {
      await api.post(`/agile/${selectedProject.id}/issues`, {
        name: newIssue.name,
        descriptionHtml: newIssue.description,
        type: newIssue.type,
        priority: newIssue.priority
      });
      
      showCreateIssue = false;
      newIssue = { name: "", description: "", type: "issue", priority: "medium" };
      await loadIssues(selectedProject.id);
    } catch (err: any) {
      alert(err.message || "Failed to create issue");
    }
  }

  async function approveIntake(intake: Intake) {
    try {
      await api.post(`/agile/intakes/${intake.id}/approve`, {
        decidedBy: "current-user", // TODO: Get from auth
        reason: "Approved via UI"
      });
      await loadIntakes(selectedProject!.id);
      showIntakeDetail = false;
    } catch (err: any) {
      alert(err.message || "Failed to approve intake");
    }
  }

  async function declineIntake(intake: Intake) {
    try {
      await api.post(`/agile/intakes/${intake.id}/decline`, {
        decidedBy: "current-user",
        reason: "Declined via UI"
      });
      await loadIntakes(selectedProject!.id);
      showIntakeDetail = false;
    } catch (err: any) {
      alert(err.message || "Failed to decline intake");
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // COMPUTED
  // ═══════════════════════════════════════════════════════════════════════════════
  
  const filteredIssues = $derived(
    issues.filter(issue => {
      const matchesSearch = !searchQuery || 
        issue.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        issue.key.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesPriority = !filterPriority || issue.priority === filterPriority;
      return matchesSearch && matchesPriority;
    })
  );

  const issuesByState = $derived.by(() => {
    const grouped: Record<string, Issue[]> = {};
    states.forEach(state => {
      grouped[state.id] = filteredIssues.filter(i => i.stateId === state.id);
    });
    return grouped;
  });

  const pendingIntakes = $derived(intakes.filter(i => i.status === "pending"));

  function getPriorityColor(priority: string): string {
    const colors: Record<string, string> = {
      urgent: "#ef4444",
      high: "#f97316",
      medium: "#3b82f6",
      low: "#6b7280"
    };
    return colors[priority] || "#6b7280";
  }

  function getStatusIcon(status: string) {
    switch (status) {
      case "pending": return Clock;
      case "accepted": return CheckCircle2;
      case "declined": return XCircle;
      default: return AlertCircle;
    }
  }
</script>

<div class="h-full flex flex-col">
  <!-- Header -->
  <div class="flex items-center justify-between px-6 py-4 border-b border-gremius-border bg-gremius-card">
    <div class="flex items-center gap-4">
      <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
        <Kanban class="w-5 h-5 text-white" />
      </div>
      <div>
        <h1 class="text-xl font-bold text-gremius-text">Agile Tracker</h1>
        <p class="text-sm text-gremius-subtle">
          {#if selectedProject}
            {selectedProject.emoji || "📁"} {selectedProject.name}
          {:else}
            Select a project to start
          {/if}
        </p>
      </div>
    </div>
    
    <div class="flex items-center gap-3">
      <!-- Project Selector -->
      <select 
        class="bg-gremius-surface border border-gremius-border rounded-lg px-3 py-2 text-sm"
        onchange={(e) => {
          const project = projects.find(p => p.id === e.currentTarget.value);
          if (project) selectProject(project);
        }}
      >
        {#each projects as project}
          <option value={project.id} selected={selectedProject?.id === project.id}>
            {project.emoji || "📁"} {project.name}
          </option>
        {/each}
      </select>
      
      <button class="btn-secondary" onclick={() => showCreateProject = true}>
        <Plus class="w-4 h-4" /> New Project
      </button>
    </div>
  </div>

  <!-- Tabs -->
  {#if selectedProject}
    <div class="flex items-center gap-1 px-6 py-2 border-b border-gremius-border bg-gremius-surface/50">
      <button 
        class="px-4 py-2 text-sm font-medium rounded-lg transition-colors {activeTab === 'board' ? 'bg-gremius-card text-gremius-cyan' : 'text-gremius-subtle hover:text-gremius-text'}"
        onclick={() => activeTab = "board"}
      >
        <Kanban class="w-4 h-4 inline mr-2" /> Board
      </button>
      <button 
        class="px-4 py-2 text-sm font-medium rounded-lg transition-colors relative {activeTab === 'intakes' ? 'bg-gremius-card text-gremius-cyan' : 'text-gremius-subtle hover:text-gremius-text'}"
        onclick={() => activeTab = "intakes"}
      >
        <Inbox class="w-4 h-4 inline mr-2" /> Intakes
        {#if pendingIntakes.length > 0}
          <span class="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
            {pendingIntakes.length}
          </span>
        {/if}
      </button>
      <button 
        class="px-4 py-2 text-sm font-medium rounded-lg transition-colors {activeTab === 'settings' ? 'bg-gremius-card text-gremius-cyan' : 'text-gremius-subtle hover:text-gremius-text'}"
        onclick={() => activeTab = "settings"}
      >
        <Settings2 class="w-4 h-4 inline mr-2" /> Settings
      </button>
    </div>
  {/if}

  <!-- Content -->
  <div class="flex-1 overflow-hidden">
    {#if loading}
      <div class="flex items-center justify-center h-full">
        <div class="w-8 h-8 border-2 border-gremius-cyan/30 border-t-gremius-cyan rounded-full animate-spin"></div>
      </div>
    {:else if error}
      <div class="flex items-center justify-center h-full">
        <div class="text-center">
          <AlertCircle class="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p class="text-gremius-text">{error}</p>
        </div>
      </div>
    {:else if !selectedProject}
      <div class="flex items-center justify-center h-full">
        <div class="text-center">
          <FolderKanban class="w-16 h-16 text-gremius-subtle mx-auto mb-4" />
          <p class="text-gremius-text text-lg mb-2">No Project Selected</p>
          <p class="text-gremius-subtle mb-4">Create or select a project to get started</p>
          <button class="btn-primary" onclick={() => showCreateProject = true}>
            <Plus class="w-4 h-4" /> Create Project
          </button>
        </div>
      </div>
    {:else if activeTab === "board"}
      <!-- Board View -->
      <div class="h-full flex flex-col">
        <!-- Toolbar -->
        <div class="flex items-center justify-between px-6 py-3 border-b border-gremius-border">
          <div class="flex items-center gap-3">
            <div class="relative">
              <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gremius-subtle" />
              <input
                type="text"
                placeholder="Search issues..."
                bind:value={searchQuery}
                class="pl-10 pr-4 py-2 bg-gremius-surface border border-gremius-border rounded-lg text-sm w-64"
              />
            </div>
            <select bind:value={filterPriority} class="bg-gremius-surface border border-gremius-border rounded-lg px-3 py-2 text-sm">
              <option value="">All Priorities</option>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
          <button class="btn-primary" onclick={() => showCreateIssue = true}>
            <Plus class="w-4 h-4" /> New Issue
          </button>
        </div>

        <!-- Kanban Board -->
        <div class="flex-1 overflow-x-auto p-6">
          <div class="flex gap-4 h-full min-w-max">
            {#each states as state}
              {@const stateIssues = issuesByState()[state.id] || []}
              <div class="w-80 flex-shrink-0 flex flex-col bg-gremius-surface/30 rounded-xl border border-gremius-border/50">
                <!-- Column Header -->
                <div class="flex items-center justify-between p-3 border-b border-gremius-border/50">
                  <div class="flex items-center gap-2">
                    <div class="w-3 h-3 rounded-full" style="background-color: {state.color}"></div>
                    <span class="font-medium text-gremius-text">{state.name}</span>
                    <span class="text-xs text-gremius-subtle bg-gremius-card px-2 py-0.5 rounded-full">
                      {stateIssues.length}
                    </span>
                  </div>
                </div>
                
                <!-- Issues -->
                <div class="flex-1 overflow-y-auto p-2 space-y-2">
                  {#each stateIssues as issue}
                    <div class="bg-gremius-card p-3 rounded-lg border border-gremius-border/50 hover:border-gremius-cyan/50 transition-colors cursor-pointer group">
                      <div class="flex items-start justify-between mb-2">
                        <span class="text-xs text-gremius-subtle">{issue.key}</span>
                        <div class="flex items-center gap-1">
                          <div 
                            class="w-2 h-2 rounded-full"
                            style="background-color: {getPriorityColor(issue.priority)}"
                          ></div>
                        </div>
                      </div>
                      <p class="text-sm text-gremius-text mb-2 line-clamp-2">{issue.name}</p>
                      <div class="flex items-center justify-between">
                        <span class="text-xs text-gremius-subtle capitalize">{issue.type}</span>
                        {#if issue.assigneeId}
                          <div class="w-6 h-6 rounded-full bg-gremius-cyan/20 flex items-center justify-center">
                            <User class="w-3 h-3 text-gremius-cyan" />
                          </div>
                        {/if}
                      </div>
                    </div>
                  {/each}
                </div>
              </div>
            {/each}
          </div>
        </div>
      </div>
    {:else if activeTab === "intakes"}
      <!-- Intakes View -->
      <div class="h-full overflow-auto p-6">
        <div class="max-w-4xl mx-auto space-y-4">
          {#if intakes.length === 0}
            <div class="text-center py-12">
              <Inbox class="w-16 h-16 text-gremius-subtle mx-auto mb-4" />
              <p class="text-gremius-text">No intakes yet</p>
              <p class="text-gremius-subtle text-sm">AI suggestions will appear here</p>
            </div>
          {:else}
            {#each intakes as intake}
              {@const StatusIcon = getStatusIcon(intake.status)}
              <div class="bg-gremius-card p-4 rounded-xl border border-gremius-border/50 hover:border-gremius-cyan/30 transition-colors">
                <div class="flex items-start justify-between">
                  <div class="flex-1">
                    <div class="flex items-center gap-2 mb-1">
                      <StatusIcon class="w-4 h-4 {intake.status === 'pending' ? 'text-yellow-500' : intake.status === 'accepted' ? 'text-green-500' : 'text-red-500'}" />
                      <span class="font-medium text-gremius-text">{intake.title}</span>
                      <span class="text-xs px-2 py-0.5 rounded-full bg-gremius-surface text-gremius-subtle capitalize">
                        {intake.status}
                      </span>
                    </div>
                    {#if intake.description}
                      <p class="text-sm text-gremius-subtle mb-2">{intake.description}</p>
                    {/if}
                    <div class="flex items-center gap-4 text-xs text-gremius-subtle">
                      <span>Source: {intake.source}</span>
                      {#if intake.suggestedType}
                        <span>Type: {intake.suggestedType}</span>
                      {/if}
                      {#if intake.suggestedPriority}
                        <span>Priority: {intake.suggestedPriority}</span>
                      {/if}
                      {#if intake.createdIssueKey}
                        <span class="text-green-500">→ {intake.createdIssueKey}</span>
                      {/if}
                    </div>
                  </div>
                  {#if intake.status === "pending"}
                    <div class="flex items-center gap-2">
                      <button 
                        class="p-2 rounded-lg hover:bg-green-500/10 text-green-500"
                        onclick={() => { selectedIntake = intake; showIntakeDetail = true; }}
                      >
                        <CheckCircle2 class="w-5 h-5" />
                      </button>
                      <button 
                        class="p-2 rounded-lg hover:bg-red-500/10 text-red-500"
                        onclick={() => declineIntake(intake)}
                      >
                        <XCircle class="w-5 h-5" />
                      </button>
                    </div>
                  {/if}
                </div>
              </div>
            {/each}
          {/if}
        </div>
      </div>
    {:else if activeTab === "settings"}
      <!-- Settings View -->
      <div class="h-full overflow-auto p-6">
        <div class="max-w-2xl mx-auto space-y-6">
          <div class="bg-gremius-card p-6 rounded-xl border border-gremius-border/50">
            <h3 class="text-lg font-medium text-gremius-text mb-4">Project Settings</h3>
            <div class="space-y-4">
              <div>
                <label class="block text-sm text-gremius-subtle mb-1">Project Name</label>
                <p class="text-gremius-text">{selectedProject.name}</p>
              </div>
              <div>
                <label class="block text-sm text-gremius-subtle mb-1">Identifier</label>
                <p class="text-gremius-text font-mono">{selectedProject.identifier}</p>
              </div>
              <div>
                <label class="block text-sm text-gremius-subtle mb-1">Description</label>
                <p class="text-gremius-text">{selectedProject.description || "No description"}</p>
              </div>
              <div>
                <label class="block text-sm text-gremius-subtle mb-1">States</label>
                <div class="flex flex-wrap gap-2 mt-2">
                  {#each states as state}
                    <div class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gremius-surface border border-gremius-border/50">
                      <div class="w-2 h-2 rounded-full" style="background-color: {state.color}"></div>
                      <span class="text-sm">{state.name}</span>
                    </div>
                  {/each}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>

<!-- Create Project Modal -->
{#if showCreateProject}
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
    <div class="bg-gremius-card border border-gremius-border rounded-xl w-full max-w-md">
      <div class="flex items-center justify-between px-6 py-4 border-b border-gremius-border">
        <h3 class="text-lg font-bold text-gremius-text">Create New Project</h3>
        <button class="p-2 rounded-lg hover:bg-gremius-surface" onclick={() => showCreateProject = false}>
          <X class="w-5 h-5" />
        </button>
      </div>
      <div class="p-6 space-y-4">
        <div>
          <label class="block text-sm font-medium text-gremius-text mb-1.5">Project Name</label>
          <input
            type="text"
            bind:value={newProject.name}
            placeholder="My Awesome Project"
            class="w-full px-3 py-2 bg-gremius-surface border border-gremius-border rounded-lg text-sm"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gremius-text mb-1.5">Identifier</label>
          <input
            type="text"
            bind:value={newProject.identifier}
            placeholder="PROJ"
            class="w-full px-3 py-2 bg-gremius-surface border border-gremius-border rounded-lg text-sm font-mono uppercase"
          />
          <p class="text-xs text-gremius-subtle mt-1">Used for issue keys (e.g., PROJ-123)</p>
        </div>
        <div>
          <label class="block text-sm font-medium text-gremius-text mb-1.5">Description</label>
          <textarea
            bind:value={newProject.description}
            placeholder="What is this project about?"
            rows={3}
            class="w-full px-3 py-2 bg-gremius-surface border border-gremius-border rounded-lg text-sm resize-none"
          ></textarea>
        </div>
      </div>
      <div class="flex items-center justify-end gap-3 px-6 py-4 border-t border-gremius-border">
        <button class="btn-secondary" onclick={() => showCreateProject = false}>Cancel</button>
        <button 
          class="btn-primary"
          onclick={createProject}
          disabled={!newProject.name || !newProject.identifier}
        >
          Create Project
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Create Issue Modal -->
{#if showCreateIssue}
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
    <div class="bg-gremius-card border border-gremius-border rounded-xl w-full max-w-md">
      <div class="flex items-center justify-between px-6 py-4 border-b border-gremius-border">
        <h3 class="text-lg font-bold text-gremius-text">Create New Issue</h3>
        <button class="p-2 rounded-lg hover:bg-gremius-surface" onclick={() => showCreateIssue = false}>
          <X class="w-5 h-5" />
        </button>
      </div>
      <div class="p-6 space-y-4">
        <div>
          <label class="block text-sm font-medium text-gremius-text mb-1.5">Issue Title</label>
          <input
            type="text"
            bind:value={newIssue.name}
            placeholder="What needs to be done?"
            class="w-full px-3 py-2 bg-gremius-surface border border-gremius-border rounded-lg text-sm"
          />
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gremius-text mb-1.5">Type</label>
            <select bind:value={newIssue.type} class="w-full px-3 py-2 bg-gremius-surface border border-gremius-border rounded-lg text-sm">
              <option value="issue">Issue</option>
              <option value="feature">Feature</option>
              <option value="bug">Bug</option>
              <option value="improvement">Improvement</option>
              <option value="spike">Spike</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gremius-text mb-1.5">Priority</label>
            <select bind:value={newIssue.priority} class="w-full px-3 py-2 bg-gremius-surface border border-gremius-border rounded-lg text-sm">
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
        </div>
        <div>
          <label class="block text-sm font-medium text-gremius-text mb-1.5">Description</label>
          <textarea
            bind:value={newIssue.description}
            placeholder="Add more details..."
            rows={4}
            class="w-full px-3 py-2 bg-gremius-surface border border-gremius-border rounded-lg text-sm resize-none"
          ></textarea>
        </div>
      </div>
      <div class="flex items-center justify-end gap-3 px-6 py-4 border-t border-gremius-border">
        <button class="btn-secondary" onclick={() => showCreateIssue = false}>Cancel</button>
        <button 
          class="btn-primary"
          onclick={createIssue}
          disabled={!newIssue.name}
        >
          Create Issue
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Intake Detail Modal -->
{#if showIntakeDetail && selectedIntake}
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
    <div class="bg-gremius-card border border-gremius-border rounded-xl w-full max-w-lg">
      <div class="flex items-center justify-between px-6 py-4 border-b border-gremius-border">
        <h3 class="text-lg font-bold text-gremius-text">Review Intake</h3>
        <button class="p-2 rounded-lg hover:bg-gremius-surface" onclick={() => showIntakeDetail = false}>
          <X class="w-5 h-5" />
        </button>
      </div>
      <div class="p-6 space-y-4">
        <div>
          <label class="block text-sm text-gremius-subtle mb-1">Title</label>
          <p class="text-gremius-text font-medium">{selectedIntake.title}</p>
        </div>
        {#if selectedIntake.description}
          <div>
            <label class="block text-sm text-gremius-subtle mb-1">Description</label>
            <p class="text-gremius-text">{selectedIntake.description}</p>
          </div>
        {/if}
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm text-gremius-subtle mb-1">Suggested Type</label>
            <p class="text-gremius-text capitalize">{selectedIntake.suggestedType || "Not specified"}</p>
          </div>
          <div>
            <label class="block text-sm text-gremius-subtle mb-1">Suggested Priority</label>
            <p class="text-gremius-text capitalize">{selectedIntake.suggestedPriority || "Not specified"}</p>
          </div>
        </div>
        <div class="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
          <p class="text-sm text-yellow-400">
            <AlertCircle class="w-4 h-4 inline mr-1" />
            This will create a new issue in the project.
          </p>
        </div>
      </div>
      <div class="flex items-center justify-end gap-3 px-6 py-4 border-t border-gremius-border">
        <button class="btn-secondary" onclick={() => showIntakeDetail = false}>Cancel</button>
        <button 
          class="btn-danger"
          onclick={() => declineIntake(selectedIntake)}
        >
          Decline
        </button>
        <button 
          class="btn-primary"
          onclick={() => approveIntake(selectedIntake)}
        >
          <CheckCircle2 class="w-4 h-4" /> Approve & Create Issue
        </button>
      </div>
    </div>
  </div>
{/if}
