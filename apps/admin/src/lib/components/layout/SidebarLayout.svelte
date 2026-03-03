<script lang="ts">
  import { onMount, type Component } from "svelte";
  import { page } from "$app/stores";
  import { 
    Sword, LayoutDashboard, Gamepad2, Tv, FileText, Settings, Database,
    PanelLeftClose, PanelLeftOpen, ImageIcon, Library, LogOut,
    Calculator, Table2, Briefcase,
    Blocks, Megaphone, BookOpen, Book, Castle, Webhook, Home, Users,
    ChartLine
  } from "lucide-svelte";
  import { signOut, getUser } from "$lib/auth.svelte";
  
  let collapsed = $state(false);
  let apiOnline = $state(false);
  let enabledModules = $state<Set<string>>(new Set());
  
  const user = $derived(getUser());
  
  // Get current path from SvelteKit
  let currentPath = $derived($page.url.pathname);
  
  // Map nav items to their module keys (null = always show)
  interface NavItem {
    path: string;
    label: string;
    icon: Component;
    moduleKey?: string; // If set, only show when this module is enabled
  }

  const allNavItems: NavItem[] = [
    { path: "/", label: "Dashboard", icon: BookOpen },
    { path: "/games", label: "Games", icon: Gamepad2, moduleKey: "games" },
    { path: "/posts", label: "Blog Posts", icon: FileText, moduleKey: "blog" },
    { path: "/media", label: "Media Library", icon: ImageIcon, moduleKey: "media-library" },
    { path: "/datasets", label: "Data Sets", icon: Database },
    { path: "/builder", label: "Page Builder", icon: Blocks, moduleKey: "blocks" },
    { path: "/streamers", label: "Streamers", icon: Tv, moduleKey: "streamers" },
    { path: "/data/games", label: "Data Explorer", icon: Table2, moduleKey: "connectors" },
    { path: "/formulas", label: "KPIs", icon: ChartLine, moduleKey: "formulas" },
    { path: "/gremius-crm", label: "Gremius CRM", icon: Briefcase, moduleKey: "gremius-crm" },
  ];
  
  const bottomNavItems: NavItem[] = [
    { path: "/grimoires", label: "Grimoires", icon: Book },
    { path: "/realms", label: "Realms", icon: Castle },
    { path: "/webhooks", label: "Webhooks", icon: Webhook, moduleKey: "webhooks" },
    { path: "/workers", label: "Workers", icon: Home },
    { path: "/settings", label: "Settings", icon: Settings },
  ];

  // Filter nav items based on enabled modules
  let visibleNavItems = $derived(
    allNavItems.filter(item => !item.moduleKey || enabledModules.has(item.moduleKey))
  );
  let visibleBottomItems = $derived(
    bottomNavItems.filter(item => !item.moduleKey || enabledModules.has(item.moduleKey))
  );
  
  function handleLogout() {
    signOut();
    window.location.href = "/login";
  }
  
  function isActive(path: string): boolean {
    if (path === "/") return currentPath === "/";
    return currentPath.startsWith(path);
  }
  
  onMount(async () => {
    const API = import.meta.env.VITE_API_URL || "http://localhost:3001";
    
    // Check API health
    try {
      const res = await fetch(`${API}/api/health`);
      apiOnline = res.ok;
    } catch {
      apiOnline = false;
    }
    
    // Fetch enabled modules
    try {
      const res = await fetch(`${API}/api/modules`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        const docs: { key: string; enabled: boolean }[] = data.docs || [];
        enabledModules = new Set(docs.filter(m => m.enabled).map(m => m.key));
      }
    } catch {
      // If modules API fails, show all items as fallback
      enabledModules = new Set(allNavItems.map(i => i.moduleKey).filter(Boolean) as string[]);
    }
  });
  
  // Slot content
  let { children }: { children?: import("svelte").Snippet } = $props();
</script>

<div class="flex h-screen overflow-hidden">
  <!-- Sidebar -->
  <aside
    class="flex flex-col border-r border-gremius-border bg-gremius-card transition-all duration-300 ease-out shrink-0"
    class:w-16={collapsed}
    class:w-60={!collapsed}
  >
    <!-- Logo -->
    <div class="flex items-center h-14 px-4 border-b border-gremius-border shrink-0">
      <div class="flex items-center gap-3 overflow-hidden">
        <div class="w-8 h-8 rounded-lg bg-gremius-cyan/10 flex items-center justify-center shrink-0">
          <Sword class="w-4 h-4 text-gremius-cyan" />
        </div>
        {#if !collapsed}
          <span class="font-semibold text-sm tracking-tight whitespace-nowrap">
            Gremius
          </span>
        {/if}
      </div>
    </div>

    <!-- Nav -->
    <nav class="flex-1 overflow-y-auto py-3 px-2">
      <!-- Core navigation -->
      <div class="space-y-0.5">
        {#each visibleNavItems as item}
          {@const active = isActive(item.path)}
          {@const Icon = item.icon}
          <a
            href={item.path}
            class="flex items-center gap-3 rounded-lg text-sm transition-all duration-150 {collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5'} {active ? 'bg-gremius-cyan/10 text-gremius-cyan border border-gremius-cyan/20' : 'text-gremius-text-dim hover:bg-gremius-border/30 hover:text-gremius-text border border-transparent'}"
            title={collapsed ? item.label : undefined}
          >
            <Icon class="w-[18px] h-[18px] shrink-0" />
            {#if !collapsed}
              <span class="whitespace-nowrap">{item.label}</span>
            {/if}
          </a>
        {/each}
      </div>

      <!-- System nav -->
      <div class="mt-5 mb-2 px-3" class:hidden={collapsed}>
        <p class="text-[9px] font-semibold uppercase tracking-[0.15em] text-gremius-subtle">System</p>
      </div>
      <div class="my-3 mx-3 h-px bg-gremius-border" class:hidden={!collapsed}></div>

      <div class="space-y-0.5">
        {#each visibleBottomItems as item}
          {@const active = isActive(item.path)}
          {@const Icon = item.icon}
          <a
            href={item.path}
            class="flex items-center gap-3 rounded-lg text-sm transition-all duration-150 {collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5'} {active ? 'bg-gremius-cyan/10 text-gremius-cyan border border-gremius-cyan/20' : 'text-gremius-text-dim hover:bg-gremius-border/30 hover:text-gremius-text border border-transparent'}"
            title={collapsed ? item.label : undefined}
          >
            <Icon class="w-[18px] h-[18px] shrink-0" />
            {#if !collapsed}
              <span class="whitespace-nowrap">{item.label}</span>
            {/if}
          </a>
        {/each}
      </div>
    </nav>

    <!-- Collapse toggle -->
    <div class="border-t border-gremius-border shrink-0">
      {#if user}
        <div class="px-2 pt-3" class:pb-1={collapsed} class:pb-2={!collapsed}>
          <div class="flex items-center rounded-lg {collapsed ? 'justify-center px-2 py-2' : 'gap-3 px-3 py-2'}">
            <div class="w-8 h-8 rounded-full bg-gradient-to-br from-gremius-cyan/30 to-gremius-pink/30 flex items-center justify-center text-xs font-bold text-gremius-text shrink-0">
              {user.name?.[0]?.toUpperCase() || '?'}
            </div>
            {#if !collapsed}
              <div class="flex-1 min-w-0">
                <p class="text-xs font-medium text-gremius-text truncate">{user.name}</p>
                <p class="text-[10px] text-gremius-subtle truncate">{user.email}</p>
              </div>
              <button
                onclick={handleLogout}
                class="p-1.5 rounded-lg text-gremius-text-dim hover:bg-gremius-pink/10 hover:text-gremius-pink transition-colors"
                title="Sign out"
              >
                <LogOut class="w-3.5 h-3.5" />
              </button>
            {/if}
          </div>
        </div>
      {/if}
      <button
        onclick={() => collapsed = !collapsed}
        class="flex items-center gap-3 w-full rounded-lg text-sm text-gremius-text-dim hover:bg-gremius-border/30 hover:text-gremius-text transition-all px-2 py-2 mx-2 mb-2 {collapsed ? 'justify-center' : 'px-3'}"
      >
        {#if !collapsed}
          <PanelLeftClose class="w-[18px] h-[18px] shrink-0" />
          <span class="whitespace-nowrap">Collapse</span>
        {:else}
          <PanelLeftOpen class="w-[18px] h-[18px] shrink-0" />
        {/if}
      </button>
    </div>
  </aside>

  <!-- Main Content -->
  <main class="flex-1 overflow-y-auto bg-gremius-bg">
    <!-- Top bar -->
    <header class="sticky top-0 z-30 flex items-center justify-between h-14 px-6 border-b border-gremius-border bg-gremius-bg/80 backdrop-blur-xl">
      <div class="flex items-center gap-3">
        <h1 class="text-sm font-semibold text-gremius-text">Admin</h1>
      </div>
      <div class="flex items-center gap-3">
        <div class="flex items-center gap-2 text-xs {apiOnline ? 'text-gremius-green' : 'text-gremius-pink'}">
          <span class="w-2 h-2 rounded-full {apiOnline ? 'bg-gremius-green animate-pulse' : 'bg-gremius-subtle'}"></span>
          {apiOnline ? "API Connected" : "API Offline"}
        </div>
        <div class="w-8 h-8 rounded-full bg-gremius-cyan/10 border border-gremius-cyan/20 flex items-center justify-center text-xs font-bold text-gremius-cyan">
          A
        </div>
      </div>
    </header>

    <!-- Page content -->
    <div class="p-6">
      {@render children?.()}
    </div>
  </main>
</div>
