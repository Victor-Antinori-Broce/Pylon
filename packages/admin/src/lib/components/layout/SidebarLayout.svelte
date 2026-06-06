<script lang="ts">
  import {
    Sword,
    Gamepad2,
    Tv,
    FileText,
    Settings,
    Database,
    PanelLeftClose,
    PanelLeftOpen,
    ImageIcon,
    LogOut,
    Blocks,
    BookOpen,
    Book,
    Castle,
    Trophy,
    GraduationCap,
    FileStack,
    CalendarDays,
    Contact,
    PackageOpen,
    Zap,
    Bot,
    Briefcase,
    Landmark,
  } from "lucide-svelte";
  import { onMount } from "svelte";

  import { signOut, getUser } from "$lib/auth.svelte";
  import CommandPalette from "$lib/components/CommandPalette.svelte";
  import { moduleStore } from "$lib/states/modules.svelte";

  import GlobalSearch from "./GlobalSearch.svelte";

  import { page } from "$app/stores";

  let collapsed = $state(false);
  let apiOnline = $state(false);

  const user = $derived(getUser());

  // Get current path from SvelteKit
  const currentPath = $derived($page.url.pathname);

  // Map nav items to their module keys (null = always show)
  interface NavItem {
    path: string;
    label: string;
    icon: any; // Lucide-svelte types can conflict with base Svelte 5 types
    moduleKey?: string; // If set, only show when this module is enabled
    order?: number; // Lower = higher in the list (0 = first after dashboard)
    category?: "core" | "optional" | "realm"; // For grouping
  }

  // Navigation items organized by category and order
  //
  // ORDERING RULES:
  // 1. Dashboard is always first (order: undefined, hardcoded first)
  // 2. DataSets (grimoire-datasets) is ALWAYS second when enabled (order: 0)
  // 3. Other Core grimoires follow (order: 1, 2, 3...)
  // 4. Optional grimoires come after Core (order: 10, 11, 12...)
  // 5. Realm grimoires come last (order: 20, 21, 22...)
  //
  // This ensures DataSets maintains its position even when toggled on/off
  //
  // NOTE: Formulas/KPIs are part of DataSets (calculated fields).
  // NOTE: Connectors are part of Settings > Integrations.
  // NOTE: Webhooks/Workers are part of Actions (Engine level).
  // ═══════════════════════════════════════════════════════════════════════
  // DYNAMIC NAVIGATION — Fase H: Admin 100% Dinámico
  // All grimoire routes now use the dynamic /g/[grimoireId] path.
  // The GrimoirePage component renders views generically from grimoire.json.
  // Legacy static routes (/games, /blog, etc.) redirect to /g/[grimoireId].
  // ═══════════════════════════════════════════════════════════════════════

  const allNavItems: NavItem[] = [
    // ═══ DASHBOARD (Always first) ═══
    { path: "/", label: "Dashboard", icon: BookOpen },

    // ═══ CORE GRIMOIRES (Always shown first, can be toggled) ═══
    {
      path: "/g/grimoire-datasets",
      label: "DataSets",
      icon: Database,
      moduleKey: "grimoire-datasets",
      order: 0,
      category: "core",
    },
    {
      path: "/g/grimoire-media",
      label: "Media Library",
      icon: ImageIcon,
      moduleKey: "grimoire-media",
      order: 1,
      category: "core",
    },
    {
      path: "/g/grimoire-blocks",
      label: "Page Builder",
      icon: Blocks,
      moduleKey: "grimoire-blocks",
      order: 2,
      category: "core",
    },
    {
      path: "/g/grimoire-blog",
      label: "Blog Posts",
      icon: FileText,
      moduleKey: "grimoire-blog",
      order: 3,
      category: "core",
    },

    // ═══ OPTIONAL GRIMOIRES (order: 10+) ═══
    {
      path: "/g/grimoire-academy-lms",
      label: "Academy",
      icon: GraduationCap,
      moduleKey: "grimoire-academy-lms",
      order: 10,
      category: "optional",
    },
    {
      path: "/g/grimoire-dms",
      label: "Documents",
      icon: FileStack,
      moduleKey: "grimoire-dms",
      order: 12,
      category: "optional",
    },
    {
      path: "/g/grimoire-booking",
      label: "Booking",
      icon: CalendarDays,
      moduleKey: "grimoire-booking",
      order: 13,
      category: "optional",
    },
    {
      path: "/g/grimoire-directory",
      label: "Directory",
      icon: Contact,
      moduleKey: "grimoire-directory",
      order: 14,
      category: "optional",
    },
    {
      path: "/g/grimoire-crm",
      label: "Gremius CRM",
      icon: Briefcase,
      moduleKey: "grimoire-crm",
      order: 15,
      category: "optional",
    },
    {
      path: "/g/grimoire-conta",
      label: "Contabilidad",
      icon: Landmark,
      moduleKey: "grimoire-conta",
      order: 16,
      category: "optional",
    },

    // ═══ REALM GRIMOIRES (Esports/Gaming) (order: 20+) ═══
    {
      path: "/g/grimoire-games",
      label: "Games",
      icon: Gamepad2,
      moduleKey: "grimoire-games",
      order: 20,
      category: "realm",
    },
    {
      path: "/g/grimoire-streamers",
      label: "Streamers",
      icon: Tv,
      moduleKey: "grimoire-streamers",
      order: 21,
      category: "realm",
    },
    {
      path: "/g/grimoire-esports",
      label: "Esports",
      icon: Trophy,
      moduleKey: "grimoire-esports",
      order: 22,
      category: "realm",
    },
  ];

  const bottomNavItems: NavItem[] = [
    { path: "/grimoires", label: "Grimoires", icon: Book },
    { path: "/realms", label: "Realms", icon: Castle },
    { path: "/actions", label: "Actions", icon: Zap },
    { path: "/agents", label: "AI Agents", icon: Bot },
    { path: "/settings", label: "Settings", icon: Settings },
  ];

  // Keys already in the hardcoded nav (don't duplicate from filesystem scan)
  const hardcodedModuleKeys = new Set(
    allNavItems.filter((n) => n.moduleKey).map((n) => n.moduleKey!)
  );

  // Dynamically generated nav items from the filesystem
  // Exclude any module already present in the hardcoded nav list
  const filesystemNavItems = $derived(
    moduleStore.modules
      .filter(
        (m) =>
          m.source === "filesystem" &&
          moduleStore.enabledKeys.has(m.key) &&
          !hardcodedModuleKeys.has(m.key)
      )
      .map((m) => ({
        path: `/g/${m.key}`,
        label: m.name || m.key,
        icon: PackageOpen,
        moduleKey: m.key,
        order: 50,
      }))
  );

  // Filter nav items based on enabled modules from shared store
  // Then sort by order to maintain consistent positioning
  const visibleNavItems = $derived(
    [
      ...allNavItems.filter(
        (item) => !item.moduleKey || moduleStore.enabledKeys.has(item.moduleKey)
      ),
      ...filesystemNavItems,
    ].sort((a, b) => {
      // Dashboard (no order) always comes first
      if (a.path === "/") return -1;
      if (b.path === "/") return 1;

      // Then sort by order (undefined order goes to end)
      const orderA = a.order ?? 999;
      const orderB = b.order ?? 999;
      return orderA - orderB;
    })
  );

  const visibleBottomItems = $derived(
    bottomNavItems.filter((item) => !item.moduleKey || moduleStore.enabledKeys.has(item.moduleKey))
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
    const API = import.meta.env.VITE_API_URL ?? "";

    // Check API health
    try {
      const res = await fetch(`${API}/api/health`);
      apiOnline = res.ok;
    } catch {
      apiOnline = false;
    }

    // Fetch modules into shared store (if not already loaded)
    if (moduleStore.modules.length === 0) {
      await moduleStore.fetchModules();
    }
  });

  // Slot content
  const { children }: { children?: import("svelte").Snippet } = $props();
</script>

<CommandPalette navItems={visibleNavItems} bottomNavItems={visibleBottomItems} />

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
        <div
          class="w-8 h-8 rounded-lg bg-gremius-cyan/10 flex items-center justify-center shrink-0"
        >
          <Sword class="w-4 h-4 text-gremius-cyan" />
        </div>
        {#if !collapsed}
          <span class="font-semibold text-sm tracking-tight whitespace-nowrap"> Gremius </span>
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
            class="flex items-center gap-3 rounded-lg text-sm transition-all duration-150 {collapsed
              ? 'justify-center px-2 py-2.5'
              : 'px-3 py-2.5'} {active
              ? 'bg-gremius-cyan/10 text-gremius-cyan border border-gremius-cyan/20'
              : 'text-gremius-text-dim hover:bg-gremius-border/30 hover:text-gremius-text border border-transparent'}"
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
        <p class="text-[9px] font-semibold uppercase tracking-[0.15em] text-gremius-subtle">
          System
        </p>
      </div>
      <div class="my-3 mx-3 h-px bg-gremius-border" class:hidden={!collapsed}></div>

      <div class="space-y-0.5">
        {#each visibleBottomItems as item}
          {@const active = isActive(item.path)}
          {@const Icon = item.icon}
          <a
            href={item.path}
            class="flex items-center gap-3 rounded-lg text-sm transition-all duration-150 {collapsed
              ? 'justify-center px-2 py-2.5'
              : 'px-3 py-2.5'} {active
              ? 'bg-gremius-cyan/10 text-gremius-cyan border border-gremius-cyan/20'
              : 'text-gremius-text-dim hover:bg-gremius-border/30 hover:text-gremius-text border border-transparent'}"
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
          <div
            class="flex items-center rounded-lg {collapsed
              ? 'justify-center px-2 py-2'
              : 'gap-3 px-3 py-2'}"
          >
            <div
              class="w-8 h-8 rounded-full bg-gradient-to-br from-gremius-cyan/30 to-gremius-pink/30 flex items-center justify-center text-xs font-bold text-gremius-text shrink-0"
            >
              {user.name?.[0]?.toUpperCase() || "?"}
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
        onclick={() => (collapsed = !collapsed)}
        class="flex items-center gap-3 w-full rounded-lg text-sm text-gremius-text-dim hover:bg-gremius-border/30 hover:text-gremius-text transition-all px-2 py-2 mx-2 mb-2 {collapsed
          ? 'justify-center'
          : 'px-3'}"
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
    <header
      class="sticky top-0 z-30 flex items-center justify-between h-14 px-6 border-b border-gremius-border bg-gremius-bg/80 backdrop-blur-xl"
    >
      <div class="flex items-center gap-4 flex-1 min-w-0">
        <h1 class="text-sm font-semibold text-gremius-text shrink-0">Admin</h1>
        <GlobalSearch
          navItems={visibleNavItems}
          bottomNavItems={visibleBottomItems}
          {filesystemNavItems}
        />
      </div>
      <div class="flex items-center gap-3 shrink-0 ml-4">
        <div
          class="flex items-center gap-2 text-xs {apiOnline
            ? 'text-gremius-green'
            : 'text-gremius-pink'}"
        >
          <span
            class="w-2 h-2 rounded-full {apiOnline
              ? 'bg-gremius-green animate-pulse'
              : 'bg-gremius-subtle'}"
          ></span>
          {apiOnline ? "API Connected" : "API Offline"}
        </div>
        <div
          class="w-8 h-8 rounded-full bg-gremius-cyan/10 border border-gremius-cyan/20 flex items-center justify-center text-xs font-bold text-gremius-cyan"
        >
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
