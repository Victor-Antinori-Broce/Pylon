<script lang="ts">
  /**
   * Dashboard.svelte
   * 
   * Vista principal del Admin con soporte para widgets dinámicos.
   * Los módulos pueden registrar widgets en los slots:
   * - dashboard:top
   * - dashboard:stats
   * - dashboard:content
   * - dashboard:bottom
   */
  import { onMount, type Component } from "svelte";
  import { 
    LayoutDashboard, 
    TrendingUp, 
    Users, 
    Activity,
    Zap,
    BookOpen,
    PenTool,
    Image,
    UserPlus
  } from "lucide-svelte";
  import WidgetSlot from "../lib/WidgetSlot.svelte";
  import { componentRegistry } from "../lib/registry.svelte";
  
  // Stats de ejemplo
  let stats = $state([
    { label: "Total Users", value: "1,234", change: "+12%", icon: Users, color: "cyan" },
    { label: "Active Sessions", value: "89", change: "+5%", icon: Activity, color: "green" },
    { label: "Page Views", value: "45.2K", change: "+23%", icon: TrendingUp, color: "purple" },
    { label: "API Calls", value: "892K", change: "+8%", icon: Zap, color: "amber" },
  ]);
  
  // Cargar módulos habilitados al montar
  onMount(async () => {
    // En una implementación real, esto vendría de la API
    // Por ahora simulamos algunos módulos habilitados
    componentRegistry.setEnabledModules(["games", "webhooks", "analytics"]);
  });
</script>

<div class="space-y-6 animate-fade-in">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div>
      <h1 class="text-2xl font-bold text-gremius-text flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-gremius-cyan/20 to-gremius-purple/20 border border-gremius-cyan/20 flex items-center justify-center">
          <BookOpen class="w-5 h-5 text-gremius-cyan" />
        </div>
        Dashboard
      </h1>
      <p class="text-sm text-gremius-subtle mt-1">
        Overview of your CMS and system metrics.
      </p>
    </div>
  </div>

  <!-- Widget Slot: Top -->
  <WidgetSlot 
    name="dashboard:top" 
    wrapper="card"
    class="grid grid-cols-1 lg:grid-cols-2 gap-4"
  >
    <svelte:fragment slot="empty">
      <!-- No mostrar nada cuando está vacío -->
    </svelte:fragment>
  </WidgetSlot>

  <!-- Stats Grid -->
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
    {#each stats as stat}
      {@const Icon = stat.icon}
      <div class="card p-4 hover:border-gremius-cyan/30 transition-colors">
        <div class="flex items-start justify-between">
          <div>
            <p class="text-xs text-gremius-subtle uppercase tracking-wider">{stat.label}</p>
            <p class="text-2xl font-bold text-gremius-text mt-1">{stat.value}</p>
            <p class="text-xs text-gremius-green mt-1">{stat.change} from last month</p>
          </div>
          <div class="w-10 h-10 rounded-lg bg-gremius-{stat.color}/10 flex items-center justify-center">
            <Icon class="w-5 h-5 text-gremius-{stat.color}" />
          </div>
        </div>
      </div>
    {/each}
  </div>

  <!-- Widget Slot: Stats (para widgets que extienden las stats) -->
  <WidgetSlot 
    name="dashboard:stats" 
    wrapper="none"
    class="grid grid-cols-1 lg:grid-cols-3 gap-4"
  />

  <!-- Main Content Area -->
  <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
    <!-- Left Column (2/3) -->
    <div class="lg:col-span-2 space-y-6">
      <!-- Recent Activity -->
      <div class="card">
        <div class="p-4 border-b border-gremius-border flex items-center justify-between">
          <h3 class="font-semibold text-gremius-text">Recent Activity</h3>
          <button class="text-xs text-gremius-cyan hover:underline">View All</button>
        </div>
        <div class="p-4">
          <div class="space-y-4">
            {#each [1, 2, 3, 4, 5] as i}
              <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-full bg-gremius-cyan/10 flex items-center justify-center">
                  <Activity class="w-4 h-4 text-gremius-cyan" />
                </div>
                <div class="flex-1">
                  <p class="text-sm text-gremius-text">System update completed</p>
                  <p class="text-xs text-gremius-subtle">2 hours ago</p>
                </div>
              </div>
            {/each}
          </div>
        </div>
      </div>

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
      <div class="card p-4">
        <h3 class="font-semibold text-gremius-text mb-4">Quick Actions</h3>
        <div class="space-y-2">
          <button class="w-full btn-secondary justify-start">
            <PenTool class="w-4 h-4" />
            New Post
          </button>
          <button class="w-full btn-secondary justify-start">
            <Image class="w-4 h-4" />
            Upload Media
          </button>
          <button class="w-full btn-secondary justify-start">
            <UserPlus class="w-4 h-4" />
            Manage Users
          </button>
        </div>
      </div>

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

