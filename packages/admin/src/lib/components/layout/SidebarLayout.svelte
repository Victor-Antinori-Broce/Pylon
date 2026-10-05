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
    Archive,
    Brain,
    Briefcase,
    Landmark,
  } from "lucide-svelte";
  import { onMount } from "svelte";

  import { signOut, getUser } from "$lib/auth.svelte";
  import CommandPalette from "$lib/components/CommandPalette.svelte";
  import KonIcon from "$lib/components/KonIcon.svelte";
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
    /** Nombre o glifo declarado por el kon. Si esta, manda sobre `icon`. */
    iconName?: string;
    moduleKey?: string; // If set, only show when this module is enabled
    order?: number; // Lower = higher in the list (0 = first after dashboard)
    category?: "core" | "optional" | "grimoire"; // For grouping
  }

  // Navigation items organized by category and order
  //
  // ORDERING RULES:
  // 1. Dashboard is always first (order: undefined, hardcoded first)
  // 2. DataSets (kon-datasets) is ALWAYS second when enabled (order: 0)
  // 3. Other Core kons follow (order: 1, 2, 3...)
  // 4. Optional kons come after Core (order: 10, 11, 12...)
  // 5. Grimoire kons come last (order: 20, 21, 22...)
  //
  // This ensures DataSets maintains its position even when toggled on/off
  //
  // NOTE: Formulas/KPIs are part of DataSets (calculated fields).
  // NOTE: Connectors are part of Settings > Integrations.
  // NOTE: Webhooks/Workers are part of Actions (Engine level).
  // ═══════════════════════════════════════════════════════════════════════
  // DYNAMIC NAVIGATION — Fase H: Admin 100% Dinámico
  // All kon routes now use the dynamic /g/[grimoireId] path.
  // The GrimoirePage component renders views generically from grimoire.json.
  // Legacy static routes (/games, /blog, etc.) redirect to /g/[grimoireId].
  // ═══════════════════════════════════════════════════════════════════════

  const allNavItems: NavItem[] = [
    // ═══ DASHBOARD (Always first) ═══
    { path: "/", label: "Dashboard", icon: BookOpen },

    // ═══ CORE KONS (Always shown first, can be toggled) ═══
    {
      path: "/g/kon-datasets",
      label: "DataSets",
      icon: Database,
      moduleKey: "kon-datasets",
      order: 0,
      category: "core",
    },
    {
      path: "/g/kon-media",
      label: "Media Library",
      icon: ImageIcon,
      moduleKey: "kon-media",
      order: 1,
      category: "core",
    },
    {
      path: "/g/kon-blocks",
      label: "Page Builder",
      icon: Blocks,
      moduleKey: "kon-blocks",
      order: 2,
      category: "core",
    },
    {
      path: "/g/kon-blog",
      label: "Blog Posts",
      icon: FileText,
      moduleKey: "kon-blog",
      order: 3,
      category: "core",
    },

    // ═══ OPTIONAL KONS (order: 10+) ═══
    {
      path: "/g/kon-academy-lms",
      label: "Academy",
      icon: GraduationCap,
      moduleKey: "kon-academy-lms",
      order: 10,
      category: "optional",
    },
    {
      path: "/g/kon-dms",
      label: "Documents",
      icon: FileStack,
      moduleKey: "kon-dms",
      order: 12,
      category: "optional",
    },
    {
      path: "/g/kon-booking",
      label: "Booking",
      icon: CalendarDays,
      moduleKey: "kon-booking",
      order: 13,
      category: "optional",
    },
    {
      path: "/g/kon-directory",
      label: "Directory",
      icon: Contact,
      moduleKey: "kon-directory",
      order: 14,
      category: "optional",
    },
    {
      path: "/g/kon-crm",
      label: "Kitsuden CRM",
      icon: Briefcase,
      moduleKey: "kon-crm",
      order: 15,
      category: "optional",
    },
    {
      path: "/g/kon-conta",
      label: "Contabilidad",
      icon: Landmark,
      moduleKey: "kon-conta",
      order: 16,
      category: "optional",
    },

    // ═══ GRIMOIRE KONS (Esports/Gaming) (order: 20+) ═══
    {
      path: "/g/kon-games",
      label: "Games",
      icon: Gamepad2,
      moduleKey: "kon-games",
      order: 20,
      category: "grimoire",
    },
    {
      path: "/g/kon-streamers",
      label: "Streamers",
      icon: Tv,
      moduleKey: "kon-streamers",
      order: 21,
      category: "grimoire",
    },
    {
      path: "/g/kon-esports",
      label: "Esports",
      icon: Trophy,
      moduleKey: "kon-esports",
      order: 22,
      category: "grimoire",
    },
  ];

  const bottomNavItems: NavItem[] = [
    { path: "/kons", label: "Kons", icon: Book },
    { path: "/grimoires", label: "Grimoires", icon: Castle },
    { path: "/actions", label: "Actions", icon: Zap },
    { path: "/brain", label: "KITSUDEN Brain", icon: Brain },
    { path: "/vault", label: "KITSUDEN Vault", icon: Archive },
    { path: "/agents", label: "AI Agents", icon: Bot },
    { path: "/settings", label: "Settings", icon: Settings },
  ];

  // Keys already in the hardcoded nav (don't duplicate from filesystem scan)
  const hardcodedModuleKeys = new Set(
    allNavItems.filter((n) => n.moduleKey).map((n) => n.moduleKey!)
  );

  // ═══ NAV DINÁMICO — cualquier kon habilitado que no esté curado arriba ═══
  // Cubre: kons auto-descubiertos del filesystem, kons instalados via
  // npm/marketplace, y kons aportados por el grimoire activo. Un kon
  // recién activado aparece aquí sin tocar este archivo (zero-config).
  // Se excluye la infraestructura core (webhooks, connectors, ai-memories),
  // que vive en Settings/Actions según las reglas de arriba.
  const CORE_INFRA_KEYS = new Set([
    "webhooks",
    "kon-webhooks",
    "connectors",
    "kon-connectors",
    "ai-memories",
  ]);

  const dynamicNavItems = $derived(
    moduleStore.modules
      .filter(
        (m) =>
          moduleStore.konActivo(m.key) &&
          !hardcodedModuleKeys.has(m.key) &&
          !CORE_INFRA_KEYS.has(m.key) &&
          (m.key.startsWith("kon-") || m.source === "filesystem" || m.source === "grimoire")
      )
      .map((m) => ({
        path: `/g/${m.key}`,
        label: m.name || m.key.replace(/^kon-/, ""),
        // El icono sale del manifiesto del kon, no fijo.
        //
        // Esto era `PackageOpen` para TODOS: el menu mostraba la misma caja en
        // cada entrada y no se distinguia un kon de otro de un vistazo.
        //
        // Se guarda el NOMBRE y no el componente ya resuelto porque el valor
        // puede ser un emoji («🖼️») en vez de un nombre de lucide («Tv»): los
        // modulos del nucleo usan una convencion y los kons del sistema de
        // ficheros la otra. Resolver aqui obligaria a elegir una y romper la
        // otra; `KonIcon` entiende las dos.
        icon: PackageOpen,
        iconName: m.icon,
        moduleKey: m.key,
        order: 50,
        category: (m.category === "grimoire" ? "grimoire" : "optional") as NavItem["category"],
      }))
  );

  // Filter nav items based on enabled modules from shared store
  // Then sort by order to maintain consistent positioning
  const visibleNavItems = $derived(
    [
      // Por kon, no por cadena: una entrada declarada como `blog` desaparecia
      // aunque lo encendido fuera `kon-blog`. Y un kon apagado —o uno que ya no
      // existe, que ni siquiera llega en `modules`— deja de tener enlace.
      ...allNavItems.filter((item) => !item.moduleKey || moduleStore.konActivo(item.moduleKey)),
      ...dynamicNavItems,
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
    bottomNavItems.filter((item) => !item.moduleKey || moduleStore.konActivo(item.moduleKey))
  );

  function handleLogout() {
    signOut();
    // `/login` no es una ruta: el layout enseña el formulario cuando no hay
    // sesión. Enviar ahí daba un 404 al cerrar sesión.
    window.location.href = "/";
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
    class="flex flex-col border-r border-kitsuden-border bg-kitsuden-card transition-all duration-300 ease-out shrink-0"
    class:w-16={collapsed}
    class:w-60={!collapsed}
  >
    <!-- Logo -->
    <div class="flex items-center h-14 px-4 border-b border-kitsuden-border shrink-0">
      <div class="flex items-center gap-3 overflow-hidden">
        <div
          class="w-8 h-8 rounded-lg bg-kitsuden-accent/10 flex items-center justify-center shrink-0"
        >
          <Sword class="w-4 h-4 text-kitsuden-accent" />
        </div>
        {#if !collapsed}
          <span class="font-semibold text-sm tracking-tight whitespace-nowrap"> Kitsuden </span>
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
              ? 'bg-kitsuden-accent/10 text-kitsuden-accent border border-kitsuden-accent/20'
              : 'text-kitsuden-text-dim hover:bg-kitsuden-border/30 hover:text-kitsuden-text border border-transparent'}"
            title={collapsed ? item.label : undefined}
          >
            {#if item.iconName}
              <KonIcon name={item.iconName} size={18} class="shrink-0" />
            {:else}
              <Icon class="w-[18px] h-[18px] shrink-0" />
            {/if}
            {#if !collapsed}
              <span class="whitespace-nowrap">{item.label}</span>
            {/if}
          </a>
        {/each}
      </div>

      <!-- System nav -->
      <div class="mt-5 mb-2 px-3" class:hidden={collapsed}>
        <p class="text-[9px] font-semibold uppercase tracking-[0.15em] text-kitsuden-subtle">
          System
        </p>
      </div>
      <div class="my-3 mx-3 h-px bg-kitsuden-border" class:hidden={!collapsed}></div>

      <div class="space-y-0.5">
        {#each visibleBottomItems as item}
          {@const active = isActive(item.path)}
          {@const Icon = item.icon}
          <a
            href={item.path}
            class="flex items-center gap-3 rounded-lg text-sm transition-all duration-150 {collapsed
              ? 'justify-center px-2 py-2.5'
              : 'px-3 py-2.5'} {active
              ? 'bg-kitsuden-accent/10 text-kitsuden-accent border border-kitsuden-accent/20'
              : 'text-kitsuden-text-dim hover:bg-kitsuden-border/30 hover:text-kitsuden-text border border-transparent'}"
            title={collapsed ? item.label : undefined}
          >
            {#if item.iconName}
              <KonIcon name={item.iconName} size={18} class="shrink-0" />
            {:else}
              <Icon class="w-[18px] h-[18px] shrink-0" />
            {/if}
            {#if !collapsed}
              <span class="whitespace-nowrap">{item.label}</span>
            {/if}
          </a>
        {/each}
      </div>
    </nav>

    <!-- Collapse toggle -->
    <div class="border-t border-kitsuden-border shrink-0">
      {#if user}
        <div class="px-2 pt-3" class:pb-1={collapsed} class:pb-2={!collapsed}>
          <div
            class="flex items-center rounded-lg {collapsed
              ? 'justify-center px-2 py-2'
              : 'gap-3 px-3 py-2'}"
          >
            <div
              class="w-8 h-8 rounded-full bg-gradient-to-br from-kitsuden-accent/30 to-kitsuden-accent-2/30 flex items-center justify-center text-xs font-bold text-kitsuden-text shrink-0"
            >
              {user.name?.[0]?.toUpperCase() || "?"}
            </div>
            {#if !collapsed}
              <div class="flex-1 min-w-0">
                <p class="text-xs font-medium text-kitsuden-text truncate">{user.name}</p>
                <p class="text-[10px] text-kitsuden-subtle truncate">{user.email}</p>
              </div>
              <button
                onclick={handleLogout}
                class="p-1.5 rounded-lg text-kitsuden-text-dim hover:bg-kitsuden-accent-2/10 hover:text-kitsuden-accent-2 transition-colors"
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
        class="flex items-center gap-3 w-full rounded-lg text-sm text-kitsuden-text-dim hover:bg-kitsuden-border/30 hover:text-kitsuden-text transition-all px-2 py-2 mx-2 mb-2 {collapsed
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
  <main class="flex-1 overflow-y-auto bg-kitsuden-bg">
    <!-- Top bar -->
    <header
      class="sticky top-0 z-30 flex items-center justify-between h-14 px-6 border-b border-kitsuden-border bg-kitsuden-bg/80 backdrop-blur-xl"
    >
      <div class="flex items-center gap-4 flex-1 min-w-0">
        <h1 class="text-sm font-semibold text-kitsuden-text shrink-0">Admin</h1>
        <GlobalSearch
          navItems={visibleNavItems}
          bottomNavItems={visibleBottomItems}
          filesystemNavItems={dynamicNavItems}
        />
      </div>
      <div class="flex items-center gap-3 shrink-0 ml-4">
        <div
          class="flex items-center gap-2 text-xs {apiOnline
            ? 'text-kitsuden-green'
            : 'text-kitsuden-accent-2'}"
        >
          <span
            class="w-2 h-2 rounded-full {apiOnline
              ? 'bg-kitsuden-green animate-pulse'
              : 'bg-kitsuden-subtle'}"
          ></span>
          {apiOnline ? "API Connected" : "API Offline"}
        </div>
        <div
          class="w-8 h-8 rounded-full bg-kitsuden-accent/10 border border-kitsuden-accent/20 flex items-center justify-center text-xs font-bold text-kitsuden-accent"
        >
          A
        </div>
      </div>
    </header>

    <!--
      Aviso de reinicio pendiente.

      Activar un kon crea sus tablas en caliente, pero sus rutas de API se
      montan al arrancar (Hono no admite `app.route()` tras la primera
      peticion). Sin este aviso el kon aparece en el menu y cada pantalla suya
      devuelve 404 sin decir por que.

      Va en el layout y no junto al interruptor porque quien activa un kon
      suele navegar acto seguido; ahi el aviso se habria perdido.
    -->
    {#if moduleStore.avisoDeReinicio}
      <div
        class="mx-6 mt-6 flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3"
        role="status"
      >
        <span class="mt-0.5 text-amber-400">⚠</span>
        <p class="flex-1 text-sm text-kitsuden-text">{moduleStore.avisoDeReinicio}</p>
        <button
          class="text-kitsuden-text-dim hover:text-kitsuden-text"
          onclick={() => (moduleStore.avisoDeReinicio = null)}
          aria-label="Cerrar aviso"
        >
          ×
        </button>
      </div>
    {/if}

    <!-- Page content -->
    <div class="p-6">
      {@render children?.()}
    </div>
  </main>
</div>
