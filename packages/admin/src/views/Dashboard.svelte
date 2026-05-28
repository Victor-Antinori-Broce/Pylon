<script lang="ts">
  /**
   * Dashboard.svelte - Professional Dashboard with Empty States
   * 
   * Shows real-time stats from core grimoires with professional empty states
   */
  import { onMount } from "svelte";
  import { 
    LayoutDashboard, 
    TrendingUp, 
    Users, 
    Activity,
    Zap,
    BookOpen,
    PenTool,
    Image,
    UserPlus,
    Database,
    FileText,
    FolderKanban,
    Layers,
    Blocks,
    Settings,
    Sparkles,
    BarChart3,
    Inbox,
    AlertCircle,
    Plus,
    ArrowRight,
    Clock,
    Calendar,
    ChevronRight
  } from "lucide-svelte";
  import type { ComponentType, SvelteComponent } from "svelte";
  import WidgetSlot from "../lib/WidgetSlot.svelte";
  import { componentRegistry } from "../lib/registry.svelte";
  import { goto } from "$app/navigation";
  
  const API_URL = import.meta.env.VITE_API_URL ?? "";
  
  // Icon component type (lucide icons)
  type IconComponent = ComponentType<SvelteComponent<{ class?: string }>>;
  
  // Stats state
  type StatItem = {
    label: string;
    value: string | number;
    icon: IconComponent;
    color: string;
    hasData: boolean;
    href?: string;
  };
  
  type ActivityItem = {
    icon: IconComponent;
    color: string;
    text: string;
    time: string;
    href?: string;
  };
  
  let stats = $state<StatItem[]>([]);
  let loadingStats = $state(true);
  
  // Activity state
  let recentActivity = $state<ActivityItem[]>([]);
  let loadingActivity = $state(true);
  
  // Grimoires state
  let enabledModules = $state<string[]>([]);
  let loadingModules = $state(true);
  
  // Define default stat cards (always shown)
  type DefaultStat = Omit<StatItem, 'value' | 'hasData'> & { key: string };
  
  const defaultStats: DefaultStat[] = [
    { key: 'users', label: 'Usuarios', icon: Users, color: 'cyan', href: '/users' },
    { key: 'posts', label: 'Posts', icon: FileText, color: 'green', href: '/posts' },
    { key: 'datasets', label: 'Datasets', icon: Database, color: 'amber', href: '/datasets' },
    { key: 'media', label: 'Media', icon: Image, color: 'purple', href: '/media' },
  ];
  
  onMount(async () => {
    await Promise.all([
      loadStats(),
      loadRecentActivity(),
      loadEnabledModules()
    ]);
  });
  
  async function loadStats() {
    loadingStats = true;
    try {
      const results = await Promise.allSettled([
        fetch(`${API_URL}/api/auth/users/count`, { credentials: "include" }),
        fetch(`${API_URL}/api/blog/posts/count`, { credentials: "include" }),
        fetch(`${API_URL}/api/datasets/count`, { credentials: "include" }),
        fetch(`${API_URL}/api/media/count`, { credentials: "include" }),
      ]);
      
      const newStats: StatItem[] = [];
      
      for (let i = 0; i < defaultStats.length; i++) {
        const stat = defaultStats[i];
        const res = results[i];
        let value: string | number = "—";
        let hasData = false;
        
        if (res.status === "fulfilled" && res.value.ok) {
          try {
            const data = await res.value.json();
            if (data && typeof data.count === 'number') {
              value = formatNumber(data.count);
              hasData = data.count > 0;
            }
          } catch (e) {
            // Keep default "—" value
          }
        }
        
        newStats.push({
          ...stat,
          value,
          hasData,
        });
      }
      
      stats = newStats;
    } catch (err) {
      console.error("Failed to load stats:", err);
      // Show empty stats on error
      stats = defaultStats.map(s => ({ ...s, value: "—", hasData: false }));
    } finally {
      loadingStats = false;
    }
  }
  
  async function loadRecentActivity() {
    loadingActivity = true;
    try {
      const [auditRes, actionsRes, datasetsRes] = await Promise.allSettled([
        fetch(`${API_URL}/api/admin/agents/logs?limit=5`, { credentials: "include" }),
        fetch(`${API_URL}/api/actions?limit=5`, { credentials: "include" }),
        fetch(`${API_URL}/api/datasets?limit=5&orderBy=createdAt&order=desc`, { credentials: "include" }),
      ]);
      
      const activities: ActivityItem[] = [];
      
      if (auditRes.status === "fulfilled" && auditRes.value.ok) {
        const data = await auditRes.value.json();
        if (data.success && Array.isArray(data.data) && data.data.length > 0) {
          activities.push(...data.data.slice(0, 3).map((log: any) => ({
            icon: Activity,
            color: log.success ? "cyan" : "pink",
            text: `Agent executed: ${log.action || "action"}`,
            time: formatTimeAgo(log.createdAt),
            href: `/agents/logs`
          })));
        }
      }
      
      if (actionsRes.status === "fulfilled" && actionsRes.value.ok) {
        const data = await actionsRes.value.json();
        if (Array.isArray(data.docs) && data.docs.length > 0) {
          activities.push(...data.docs.slice(0, 3).map((action: any) => ({
            icon: Zap,
            color: action.status === 'active' ? "green" : "subtle",
            text: `Action ${action.status}: ${action.name}`,
            time: formatTimeAgo(action.createdAt),
            href: `/actions`
          })));
        }
      }
      
      if (datasetsRes.status === "fulfilled" && datasetsRes.value.ok) {
        const data = await datasetsRes.value.json();
        if (Array.isArray(data.docs) && data.docs.length > 0) {
          activities.push(...data.docs.slice(0, 3).map((ds: any) => ({
            icon: Database,
            color: "amber",
            text: `Dataset created: ${ds.name}`,
            time: formatTimeAgo(ds.createdAt),
            href: `/datasets`
          })));
        }
      }
      
      // Sort by time (most recent first) - parse the time strings
      recentActivity = activities
        .sort((a, b) => {
          // Simple string comparison for time ago format
          return a.time.localeCompare(b.time);
        })
        .slice(0, 6);
    } catch (err) {
      console.error("Failed to load activity:", err);
      recentActivity = [];
    } finally {
      loadingActivity = false;
    }
  }
  
  async function loadEnabledModules() {
    loadingModules = true;
    try {
      const res = await fetch(`${API_URL}/api/modules`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        const enabled = data.modules
          ?.filter((m: any) => m.enabled !== false)
          ?.map((m: any) => m.id) || [];
        enabledModules = enabled;
        componentRegistry.setEnabledModules(enabled);
      }
    } catch {
      enabledModules = [];
    } finally {
      loadingModules = false;
    }
  }
  
  function formatNumber(n: number): string {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
    if (n >= 1000) return (n / 1000).toFixed(1) + "K";
    return n.toString();
  }
  
  function formatTimeAgo(date: string): string {
    if (!date) return "";
    const now = new Date();
    const then = new Date(date);
    const diff = now.getTime() - then.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  }
  
  // Quick actions configuration
  const quickActions = [
    { label: "New Post", href: "/posts/new", icon: PenTool, color: "green", description: "Create a blog post" },
    { label: "New Dataset", href: "/datasets/new", icon: Database, color: "amber", description: "Create data collection" },
    { label: "New Page", href: "/blocks/new", icon: Blocks, color: "pink", description: "Build a page" },
    { label: "Upload Media", href: "/media", icon: Image, color: "purple", description: "Add files" },
  ];
  
  // Core grimoires for sidebar
  const coreGrimoires = [
    { id: 'datasets', label: 'Datasets', description: 'Data collections', icon: Database, color: 'amber', href: '/datasets' },
    { id: 'blog', label: 'Blog', description: 'Posts & articles', icon: FileText, color: 'green', href: '/posts' },
    { id: 'pages', label: 'Pages', description: 'Page builder', icon: Blocks, color: 'pink', href: '/blocks' },
    { id: 'media', label: 'Media', description: 'File library', icon: Image, color: 'purple', href: '/media' },
    { id: 'actions', label: 'Actions', description: 'Automations', icon: Zap, color: 'cyan', href: '/actions' },
  ];
  
  // Helper function to get border color class
  function getBorderHoverClass(color: string): string {
    const map: Record<string, string> = {
      cyan: 'hover:border-cyan-500/30',
      green: 'hover:border-green-500/30',
      amber: 'hover:border-amber-500/30',
      purple: 'hover:border-purple-500/30',
      pink: 'hover:border-pink-500/30',
    };
    return map[color] || '';
  }
  
  // Helper function to get text hover class
  function getTextHoverClass(color: string): string {
    const map: Record<string, string> = {
      cyan: 'group-hover:text-gremius-cyan',
      green: 'group-hover:text-gremius-green',
      amber: 'group-hover:text-gremius-amber',
      purple: 'group-hover:text-gremius-purple',
      pink: 'group-hover:text-gremius-pink',
      subtle: 'group-hover:text-gremius-subtle',
    };
    return map[color] || '';
  }
  
  // Helper function to get background class
  function getBgClass(color: string): string {
    const map: Record<string, string> = {
      cyan: 'bg-gremius-cyan/10',
      green: 'bg-gremius-green/10',
      amber: 'bg-gremius-amber/10',
      purple: 'bg-gremius-purple/10',
      pink: 'bg-gremius-pink/10',
      subtle: 'bg-gremius-subtle/10',
    };
    return map[color] || '';
  }
  
  // Helper function to get text color class
  function getTextClass(color: string): string {
    const map: Record<string, string> = {
      cyan: 'text-gremius-cyan',
      green: 'text-gremius-green',
      amber: 'text-gremius-amber',
      purple: 'text-gremius-purple',
      pink: 'text-gremius-pink',
      subtle: 'text-gremius-subtle',
    };
    return map[color] || '';
  }
</script>

<div class="space-y-6 animate-fade-in">
  <!-- Header -->
  <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
    <div>
      <h1 class="text-2xl font-bold text-gremius-text flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-gremius-cyan/20 to-gremius-purple/20 border border-gremius-cyan/20 flex items-center justify-center">
          <LayoutDashboard class="w-5 h-5 text-gremius-cyan" />
        </div>
        Dashboard
      </h1>
      <p class="text-sm text-gremius-subtle mt-1">
        Overview of your Gremius CMS instance
      </p>
    </div>
    <div class="flex items-center gap-2">
      <span class="text-xs text-gremius-subtle px-2 py-1 bg-gremius-surface rounded-full">
        {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
      </span>
    </div>
  </div>

  <!-- Stats Grid - Always visible -->
  <section>
    <div class="flex items-center justify-between mb-3">
      <h2 class="text-sm font-medium text-gremius-subtle uppercase tracking-wider">Overview</h2>
      {#if !loadingStats}
        <button 
          onclick={loadStats}
          class="text-xs text-gremius-cyan hover:underline flex items-center gap-1 cursor-pointer"
        >
          <Clock class="w-3 h-3" />
          Refresh
        </button>
      {/if}
    </div>
    
    {#if loadingStats}
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {#each [1, 2, 3, 4] as i}
          <div class="card p-4 animate-pulse">
            <div class="flex items-start justify-between">
              <div class="space-y-2">
                <div class="h-3 w-16 bg-gremius-bg rounded"></div>
                <div class="h-8 w-12 bg-gremius-bg rounded"></div>
              </div>
              <div class="w-10 h-10 rounded-lg bg-gremius-bg"></div>
            </div>
          </div>
        {/each}
      </div>
    {:else}
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {#each stats as stat}
          <a 
            href={stat.href || '#'}
            class="card p-4 transition-all hover:shadow-lg group {getBorderHoverClass(stat.color)}"
            class:opacity-60={!stat.hasData}
          >
            <div class="flex items-start justify-between">
              <div>
                <p class="text-xs text-gremius-subtle uppercase tracking-wider">{stat.label}</p>
                <p class="text-2xl font-bold text-gremius-text mt-1 {getTextHoverClass(stat.color)}">
                  {stat.value}
                </p>
                {#if !stat.hasData}
                  <p class="text-xs text-gremius-subtle/60 mt-1">No data</p>
                {/if}
              </div>
              <div class="w-10 h-10 rounded-lg {getBgClass(stat.color)} flex items-center justify-center group-hover:scale-110 transition-transform">
                <stat.icon class="w-5 h-5 {getTextClass(stat.color)}" />
              </div>
            </div>
          </a>
        {/each}
      </div>
    {/if}
  </section>

  <!-- Main Content Grid -->
  <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
    <!-- Left Column (2/3) -->
    <div class="lg:col-span-2 space-y-6">
      
      <!-- Recent Activity -->
      <section class="card">
        <div class="p-4 border-b border-gremius-border flex items-center justify-between">
          <h3 class="font-semibold text-gremius-text flex items-center gap-2">
            <Activity class="w-4 h-4 text-gremius-cyan" />
            Recent Activity
          </h3>
          {#if recentActivity.length > 0}
            <a href="/actions" class="text-xs text-gremius-cyan hover:underline flex items-center gap-1">
              View all
              <ChevronRight class="w-3 h-3" />
            </a>
          {/if}
        </div>
        
        <div class="p-4">
          {#if loadingActivity}
            <div class="space-y-4">
              {#each [1, 2, 3] as i}
                <div class="flex items-center gap-3 animate-pulse">
                  <div class="w-8 h-8 rounded-full bg-gremius-bg"></div>
                  <div class="flex-1 space-y-2">
                    <div class="h-4 bg-gremius-bg rounded w-3/4"></div>
                    <div class="h-3 bg-gremius-bg rounded w-1/4"></div>
                  </div>
                </div>
              {/each}
            </div>
          {:else if recentActivity.length > 0}
            <div class="space-y-3">
              {#each recentActivity as activity}
                <a 
                  href={activity.href || '#'}
                  class="flex items-center gap-3 p-2 rounded-lg hover:bg-gremius-bg/50 transition-colors group"
                >
                  <div class="w-8 h-8 rounded-full {getBgClass(activity.color)} flex items-center justify-center flex-shrink-0">
                    <activity.icon class="w-4 h-4 {getTextClass(activity.color)}" />
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="text-sm text-gremius-text truncate group-hover:text-gremius-cyan transition-colors">
                      {activity.text}
                    </p>
                    <p class="text-xs text-gremius-subtle">{activity.time}</p>
                  </div>
                  <ChevronRight class="w-4 h-4 text-gremius-subtle opacity-0 group-hover:opacity-100 transition-opacity" />
                </a>
              {/each}
            </div>
          {:else}
            <!-- Empty State -->
            <div class="text-center py-8">
              <div class="w-16 h-16 mx-auto mb-4 rounded-full bg-gremius-bg flex items-center justify-center">
                <Inbox class="w-8 h-8 text-gremius-subtle" />
              </div>
              <h4 class="text-sm font-medium text-gremius-text mb-1">No recent activity</h4>
              <p class="text-xs text-gremius-subtle mb-4">Start creating content to see activity here</p>
              <div class="flex items-center justify-center gap-2">
                <a href="/content/edit?collection=blog-posts" class="btn-primary text-xs inline-flex items-center gap-1">
                  <Plus class="w-3 h-3" />
                  Create Post
                </a>
              </div>
            </div>
          {/if}
        </div>
      </section>

      <!-- Widget Slot: Content -->
      <WidgetSlot 
        name="dashboard:content" 
        wrapper="card"
        class="space-y-4"
      />
    </div>

    <!-- Right Column (1/3) -->
    <div class="space-y-6">
      
      <!-- Quick Actions -->
      <section class="card p-4">
        <h3 class="font-semibold text-gremius-text mb-4 flex items-center gap-2">
          <Zap class="w-4 h-4 text-gremius-cyan" />
          Quick Actions
        </h3>
        <div class="space-y-2">
          {#each quickActions as action}
            <a 
              href={action.href}
              class="group flex items-center gap-3 p-3 rounded-lg hover:bg-gremius-bg transition-all border border-transparent {getBorderHoverClass(action.color)}"
            >
              <div class="w-10 h-10 rounded-lg {getBgClass(action.color)} flex items-center justify-center group-hover:scale-110 transition-transform">
                <action.icon class="w-5 h-5 {getTextClass(action.color)}" />
              </div>
              <div class="flex-1">
                <p class="text-sm font-medium text-gremius-text {getTextHoverClass(action.color)}">
                  {action.label}
                </p>
                <p class="text-xs text-gremius-subtle">{action.description}</p>
              </div>
              <ArrowRight class="w-4 h-4 text-gremius-subtle opacity-0 group-hover:opacity-100 transition-all transform group-hover:translate-x-1" />
            </a>
          {/each}
        </div>
      </section>

      <!-- Core Grimoires -->
      <section class="card p-4">
        <h3 class="font-semibold text-gremius-text mb-4 flex items-center gap-2">
          <Layers class="w-4 h-4 text-gremius-cyan" />
          Core Grimoires
        </h3>
        <div class="space-y-1">
          {#each coreGrimoires as grimoire}
            <a 
              href={grimoire.href}
              class="group flex items-center gap-3 p-2 rounded-lg hover:bg-gremius-bg transition-colors"
            >
              <div class="w-8 h-8 rounded-lg {getBgClass(grimoire.color)} flex items-center justify-center">
                <grimoire.icon class="w-4 h-4 {getTextClass(grimoire.color)}" />
              </div>
              <div class="flex-1">
                <p class="text-sm font-medium text-gremius-text {getTextHoverClass(grimoire.color)}">
                  {grimoire.label}
                </p>
                <p class="text-xs text-gremius-subtle">{grimoire.description}</p>
              </div>
              <ChevronRight class="w-4 h-4 text-gremius-subtle opacity-0 group-hover:opacity-100 transition-opacity" />
            </a>
          {/each}
        </div>
      </section>

      <!-- System Status -->
      <section class="card p-4">
        <h3 class="font-semibold text-gremius-text mb-3 flex items-center gap-2">
          <Sparkles class="w-4 h-4 text-gremius-cyan" />
          System Status
        </h3>
        <div class="space-y-2">
          <div class="flex items-center justify-between text-sm">
            <span class="text-gremius-subtle">API Status</span>
            <span class="flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
              <span class="text-green-400 text-xs">Online</span>
            </span>
          </div>
          <div class="flex items-center justify-between text-sm">
            <span class="text-gremius-subtle">Database</span>
            <span class="flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
              <span class="text-green-400 text-xs">Connected</span>
            </span>
          </div>
          <div class="flex items-center justify-between text-sm">
            <span class="text-gremius-subtle">Active Grimoires</span>
            <span class="text-gremius-text font-medium">
              {#if loadingModules}
                <span class="animate-pulse">—</span>
              {:else}
                {enabledModules.length}
              {/if}
            </span>
          </div>
        </div>
      </section>

      <!-- Widget Slot: Sidebar -->
      <WidgetSlot 
        name="dashboard:sidebar" 
        wrapper="card"
        class="space-y-4"
      />
    </div>
  </div>

  <!-- Widget Slot: Bottom (full width) -->
  <WidgetSlot 
    name="dashboard:bottom" 
    wrapper="none"
  />
</div>

<style>
  .card {
    background-color: rgb(var(--gremius-card) / 1);
    border: 1px solid rgb(var(--gremius-border) / 1);
    border-radius: 0.75rem;
  }
  
  .btn-primary {
    padding: 0.5rem 0.75rem;
    background-color: rgb(var(--gremius-cyan) / 1);
    color: black;
    border-radius: 0.5rem;
    font-weight: 500;
  }
  
  .btn-primary:hover {
    background-color: rgb(var(--gremius-cyan-hover) / 1);
  }
  
  .hover\:border-cyan-500\/30:hover {
    border-color: rgba(6, 182, 212, 0.3);
  }
  
  .hover\:border-green-500\/30:hover {
    border-color: rgba(34, 197, 94, 0.3);
  }
  
  .hover\:border-amber-500\/30:hover {
    border-color: rgba(245, 158, 11, 0.3);
  }
  
  .hover\:border-purple-500\/30:hover {
    border-color: rgba(168, 85, 247, 0.3);
  }
  
  .hover\:border-pink-500\/30:hover {
    border-color: rgba(236, 72, 153, 0.3);
  }
</style>
