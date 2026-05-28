<script lang="ts">
  import { goto } from "$app/navigation";
  import {
    Search,
    FilePlus,
    FolderPlus,
    Image,
    Database,
    FileText,
    Blocks,
    Gamepad2,
    GraduationCap,
    Settings,
    Book,
    Castle,
    Zap,
    Bot,
    LayoutDashboard,
  } from "lucide-svelte";
  import { fade, scale } from "svelte/transition";
  import { cn } from "$lib/utils";

  interface NavItem {
    path: string;
    label: string;
    icon: any;
  }

  type CommandType = "nav" | "action" | "recent";

  interface CommandItem {
    id: string;
    type: CommandType;
    label: string;
    shortcut?: string;
    icon: any;
    action: () => void;
  }

  let {
    navItems = [],
    bottomNavItems = [],
  }: {
    navItems?: NavItem[];
    bottomNavItems?: NavItem[];
  } = $props();

  let open = $state(false);
  let query = $state("");
  let selectedIndex = $state(0);
  let inputRef: HTMLInputElement;

  // Mock recent datasets / entries
  const recentItems: CommandItem[] = [
    {
      id: "recent-1",
      type: "recent",
      label: "Users Dataset",
      icon: Database,
      action: () => goto("/datasets/users"),
    },
    {
      id: "recent-2",
      type: "recent",
      label: "Blog Posts Dataset",
      icon: FileText,
      action: () => goto("/datasets/posts"),
    },
    {
      id: "recent-3",
      type: "recent",
      label: "Media Assets",
      icon: Image,
      action: () => goto("/media"),
    },
    {
      id: "recent-4",
      type: "recent",
      label: "Page Builder Blocks",
      icon: Blocks,
      action: () => goto("/blocks"),
    },
    {
      id: "recent-5",
      type: "recent",
      label: "Academy Courses",
      icon: GraduationCap,
      action: () => goto("/academy"),
    },
    {
      id: "recent-6",
      type: "recent",
      label: "Games Registry",
      icon: Gamepad2,
      action: () => goto("/games"),
    },
  ];

  // Quick actions
  const actionItems: CommandItem[] = [
    {
      id: "action-1",
      type: "action",
      label: "New Post",
      shortcut: "N",
      icon: FilePlus,
      action: () => goto("/posts/new"),
    },
    {
      id: "action-2",
      type: "action",
      label: "New Dataset",
      shortcut: "D",
      icon: FolderPlus,
      action: () => goto("/datasets/new"),
    },
    {
      id: "action-3",
      type: "action",
      label: "Go to Media",
      shortcut: "M",
      icon: Image,
      action: () => goto("/media"),
    },
    {
      id: "action-4",
      type: "action",
      label: "Go to Dashboard",
      shortcut: "H",
      icon: LayoutDashboard,
      action: () => goto("/"),
    },
    {
      id: "action-5",
      type: "action",
      label: "Go to Settings",
      shortcut: ",",
      icon: Settings,
      action: () => goto("/settings"),
    },
  ];

  // Build full command list from props + static items
  let allItems = $derived<CommandItem[]>([
    ...actionItems,
    ...recentItems,
    ...navItems.map((item) => ({
      id: `nav-${item.path}`,
      type: "nav" as CommandType,
      label: item.label,
      icon: item.icon,
      action: () => goto(item.path),
    })),
    ...bottomNavItems.map((item) => ({
      id: `nav-bottom-${item.path}`,
      type: "nav" as CommandType,
      label: item.label,
      icon: item.icon,
      action: () => goto(item.path),
    })),
  ]);

  let filteredItems = $derived<CommandItem[]>(
    query.trim() === ""
      ? allItems
      : allItems.filter((item) =>
          item.label.toLowerCase().includes(query.toLowerCase())
        )
  );

  // Reset selection when query changes
  $effect(() => {
    query;
    selectedIndex = 0;
  });

  // Focus input when opened
  $effect(() => {
    if (open && inputRef) {
      setTimeout(() => inputRef.focus(), 10);
    }
  });

  function handleWindowKeydown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      open = !open;
      if (!open) {
        query = "";
      }
      return;
    }

    if (!open) return;

    if (e.key === "Escape") {
      e.preventDefault();
      closePalette();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      selectedIndex = (selectedIndex + 1) % Math.max(filteredItems.length, 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      selectedIndex =
        (selectedIndex - 1 + Math.max(filteredItems.length, 1)) %
        Math.max(filteredItems.length, 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filteredItems[selectedIndex]) {
        executeItem(filteredItems[selectedIndex]);
      }
    }
  }

  function closePalette() {
    open = false;
    query = "";
    selectedIndex = 0;
  }

  function executeItem(item: CommandItem) {
    item.action();
    closePalette();
  }

  function handleBackdropClick() {
    closePalette();
  }

  function typeLabel(type: CommandType): string {
    switch (type) {
      case "nav":
        return "Page";
      case "action":
        return "Action";
      case "recent":
        return "Recent";
      default:
        return "";
    }
  }
</script>

<svelte:window onkeydown={handleWindowKeydown} />

{#if open}
  <!-- Backdrop -->
  <div
    class="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[18vh] bg-black/60 backdrop-blur-sm"
    transition:fade={{ duration: 150 }}
    onclick={handleBackdropClick}
  >
    <!-- Palette -->
    <div
      class="w-full max-w-xl overflow-hidden rounded-xl border border-gremius-border bg-gremius-card shadow-2xl"
      transition:scale={{ duration: 150, start: 0.95 }}
      onclick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <!-- Search Input -->
      <div class="flex items-center gap-3 border-b border-gremius-border px-4 py-3">
        <Search class="h-5 w-5 shrink-0 text-gremius-text-dim" />
        <input
          bind:this={inputRef}
          bind:value={query}
          type="text"
          placeholder="Search commands, pages, and recent items..."
          class="flex-1 bg-transparent text-sm text-gremius-text placeholder:text-gremius-subtle focus:outline-none"
        />
        <kbd
          class="hidden items-center gap-1 rounded border border-gremius-border bg-gremius-bg px-2 py-1 font-mono text-[10px] text-gremius-text-dim sm:inline-flex"
        >
          ESC
        </kbd>
      </div>

      <!-- Results -->
      <div class="max-h-[50vh] overflow-y-auto py-1">
        {#if filteredItems.length === 0}
          <div class="px-4 py-8 text-center text-sm text-gremius-text-dim">
            No results found for "{query}"
          </div>
        {:else}
          {#each filteredItems as item, i (item.id)}
            {@const Icon = item.icon}
            <button
              class={cn(
                "flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors",
                i === selectedIndex
                  ? "bg-gremius-cyan/10 text-gremius-text"
                  : "text-gremius-text-dim hover:bg-gremius-border/30 hover:text-gremius-text"
              )}
              onclick={() => executeItem(item)}
              onmouseenter={() => (selectedIndex = i)}
              type="button"
            >
              <Icon class="h-4 w-4 shrink-0" />
              <span class="flex-1 truncate">{item.label}</span>
              {#if item.shortcut}
                <kbd
                  class="rounded border border-gremius-border bg-gremius-bg px-1.5 py-0.5 font-mono text-[10px] text-gremius-text-dim"
                >
                  {item.shortcut}
                </kbd>
              {/if}
              <span class="text-[10px] text-gremius-subtle">{typeLabel(item.type)}</span>
            </button>
          {/each}
        {/if}
      </div>

      <!-- Footer -->
      <div
        class="flex items-center justify-between border-t border-gremius-border bg-gremius-bg/50 px-4 py-2"
      >
        <div class="flex items-center gap-3 text-[10px] text-gremius-subtle">
          <span class="flex items-center gap-1">
            <kbd class="rounded border border-gremius-border bg-gremius-bg px-1 py-0.5 font-mono">↑</kbd>
            <kbd class="rounded border border-gremius-border bg-gremius-bg px-1 py-0.5 font-mono">↓</kbd>
            <span>to navigate</span>
          </span>
          <span class="flex items-center gap-1">
            <kbd class="rounded border border-gremius-border bg-gremius-bg px-1 py-0.5 font-mono">↵</kbd>
            <span>to select</span>
          </span>
        </div>
        <div class="text-[10px] text-gremius-subtle">
          {filteredItems.length} result{filteredItems.length === 1 ? "" : "s"}
        </div>
      </div>
    </div>
  </div>
{/if}
