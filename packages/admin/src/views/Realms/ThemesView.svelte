<script lang="ts">
  import { Palette, Check, Download, Trash2, Eye, Upload, AlertCircle } from "lucide-svelte";
  import { toast } from "svelte-sonner";

  import Modal from "$lib/components/ui/Modal.svelte";
  import { currentTheme, setTheme, themes as builtinThemes } from "$lib/theme.svelte";

  interface ThemeConfig {
    id: string;
    name: string;
    description: string;
    preview: string;
    primary?: string;
    secondary?: string;
    accent?: string;
    cssVars?: Record<string, string>;
  }

  let customThemes = $state<ThemeConfig[]>([]);
  let showImportModal = $state(false);
  let jsonInput = $state("");
  let jsonError = $state("");

  const allThemes = $derived([...builtinThemes, ...customThemes]);

  function handleActivate(id: string) {
    setTheme(id);
    toast.success("Theme activated");
  }

  function handleDelete(theme: ThemeConfig) {
    if (theme.id === $currentTheme) {
      toast.error("Cannot delete the active theme");
      return;
    }
    customThemes = customThemes.filter((t) => t.id !== theme.id);
    toast.success("Theme deleted");
  }

  function validateJson() {
    jsonError = "";
    if (!jsonInput.trim()) {
      jsonError = "Paste theme JSON first";
      return false;
    }
    try {
      const parsed = JSON.parse(jsonInput);
      if (!parsed.id || !parsed.name || !parsed.preview) {
        jsonError = "Theme must have id, name, and preview fields";
        return false;
      }
      return true;
    } catch {
      jsonError = "Invalid JSON";
      return false;
    }
  }

  function importTheme() {
    if (!validateJson()) return;
    try {
      const parsed = JSON.parse(jsonInput) as ThemeConfig;
      if (allThemes.some((t) => t.id === parsed.id)) {
        jsonError = `A theme with id "${parsed.id}" already exists`;
        return;
      }
      customThemes = [...customThemes, parsed];
      jsonInput = "";
      jsonError = "";
      showImportModal = false;
      toast.success(`Theme "${parsed.name}" imported`);
    } catch {
      jsonError = "Failed to import theme";
    }
  }

  // Reactive CSS variable inspector
  let cssVarEntries = $state<{ key: string; value: string }[]>([]);

  $effect(() => {
    const _ = $currentTheme; // dependency
    const root = getComputedStyle(document.documentElement);
    const theme = allThemes.find((t) => t.id === $currentTheme);
    const keys = theme?.cssVars ? Object.keys(theme.cssVars) : [];
    cssVarEntries = keys.map((key) => ({
      key,
      value: root.getPropertyValue(key).trim(),
    }));
  });
</script>

<div class="space-y-6 animate-fade-in">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div>
      <h1 class="text-2xl font-bold text-gremius-text flex items-center gap-3">
        <div
          class="w-10 h-10 rounded-xl bg-gradient-to-br from-gremius-purple/20 to-gremius-cyan/20 border border-gremius-purple/20 flex items-center justify-center"
        >
          <Palette class="w-5 h-5 text-gremius-purple" />
        </div>
        Themes
      </h1>
      <p class="text-sm text-gremius-subtle mt-1">Customize appearance & preview changes</p>
    </div>
  </div>

  <!-- Main Layout -->
  <div class="flex flex-col lg:flex-row gap-6">
    <!-- Left: Theme Cards -->
    <div class="lg:w-[60%] space-y-4">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        {#each allThemes as theme (theme.id)}
          <div
            class="card p-4 relative group transition-all"
            class:border-gremius-cyan={$currentTheme === theme.id}
            class:border-2={$currentTheme === theme.id}
            class:border-gremius-border={$currentTheme !== theme.id}
          >
            {#if $currentTheme === theme.id}
              <div class="absolute top-2 right-2">
                <span
                  class="px-2 py-1 text-[10px] font-medium bg-gremius-cyan/10 text-gremius-cyan rounded-full"
                >
                  Active
                </span>
              </div>
            {/if}

            <div class="flex items-center gap-3 mb-3">
              <div
                class="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                style="background: {theme.preview}"
              >
                <Palette class="w-5 h-5 text-gremius-text" />
              </div>
              <div class="min-w-0">
                <h3 class="font-semibold text-gremius-text truncate">{theme.name}</h3>
                <p class="text-xs text-gremius-subtle">{theme.description}</p>
              </div>
            </div>

            <div class="flex items-center gap-2 mt-4">
              {#if $currentTheme === theme.id}
                <button class="btn-secondary flex-1" disabled>
                  <Check class="w-4 h-4" />
                  Active
                </button>
              {:else}
                <button class="btn-primary flex-1" onclick={() => handleActivate(theme.id)}>
                  Activate
                </button>
              {/if}

              {#if !builtinThemes.some((t) => t.id === theme.id)}
                <button
                  class="p-2 rounded-lg text-gremius-text-dim hover:bg-gremius-pink/10 hover:text-gremius-pink transition-colors"
                  onclick={() => handleDelete(theme)}
                  title="Delete theme"
                >
                  <Trash2 class="w-4 h-4" />
                </button>
              {/if}
            </div>
          </div>
        {/each}

        <!-- Install New Theme Card -->
        <button
          class="card p-4 border-dashed border-2 border-gremius-border hover:border-gremius-cyan/50 transition-colors flex flex-col items-center justify-center min-h-[160px] gap-3"
          onclick={() => {
            showImportModal = true;
            jsonInput = "";
            jsonError = "";
          }}
        >
          <div class="w-10 h-10 rounded-lg bg-gremius-surface flex items-center justify-center">
            <Download class="w-5 h-5 text-gremius-cyan" />
          </div>
          <div class="text-center">
            <h3 class="font-semibold text-gremius-text">Install New Theme</h3>
            <p class="text-xs text-gremius-subtle mt-0.5">Paste JSON to import</p>
          </div>
        </button>
      </div>
    </div>

    <!-- Right: Live Preview Panel -->
    <div class="lg:w-[40%] space-y-4">
      <div class="card p-5 border border-gremius-border sticky top-4">
        <div class="flex items-center gap-2 mb-4">
          <Eye class="w-5 h-5 text-gremius-cyan" />
          <h2 class="text-lg font-semibold text-gremius-text">Live Preview</h2>
        </div>

        <!-- Mini UI Mockup -->
        <div
          class="rounded-lg border overflow-hidden mb-5"
          style="background: rgb(var(--gremius-bg)); border-color: rgb(var(--gremius-border));"
        >
          <!-- Mock header -->
          <div
            class="px-4 py-3 flex items-center justify-between border-b"
            style="background: rgb(var(--gremius-surface)); border-color: rgb(var(--gremius-border));"
          >
            <div class="flex items-center gap-2">
              <div class="w-6 h-6 rounded" style="background: rgb(var(--gremius-primary));"></div>
              <span class="text-sm font-medium" style="color: rgb(var(--gremius-text));"
                >Dashboard</span
              >
            </div>
            <div class="flex gap-1.5">
              <div
                class="w-2 h-2 rounded-full"
                style="background: rgb(var(--gremius-muted));"
              ></div>
              <div
                class="w-2 h-2 rounded-full"
                style="background: rgb(var(--gremius-muted));"
              ></div>
            </div>
          </div>

          <!-- Mock body -->
          <div class="p-4 space-y-3">
            <div
              class="rounded-md p-3 border space-y-2"
              style="background: rgb(var(--gremius-card)); border-color: rgb(var(--gremius-border)); color: rgb(var(--gremius-text));"
            >
              <div class="flex items-center justify-between">
                <span class="text-sm font-medium">Overview</span>
                <span
                  class="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                  style="background: rgb(var(--gremius-green) / 0.15); color: rgb(var(--gremius-green));"
                >
                  Live
                </span>
              </div>
              <div class="space-y-1.5">
                <div
                  class="h-2 rounded w-full"
                  style="background: rgb(var(--gremius-border));"
                ></div>
                <div
                  class="h-2 rounded w-3/4"
                  style="background: rgb(var(--gremius-border));"
                ></div>
                <div
                  class="h-2 rounded w-1/2"
                  style="background: rgb(var(--gremius-border));"
                ></div>
              </div>
              <div class="flex items-center gap-2 pt-1">
                <button
                  class="text-xs px-3 py-1.5 rounded-md font-medium"
                  style="background: rgb(var(--gremius-primary)); color: rgb(var(--gremius-bg));"
                >
                  Primary
                </button>
                <button
                  class="text-xs px-3 py-1.5 rounded-md font-medium"
                  style="background: rgb(var(--gremius-danger) / 0.15); color: rgb(var(--gremius-danger));"
                >
                  Danger
                </button>
              </div>
            </div>

            <div class="flex gap-2">
              <span
                class="text-[10px] px-2 py-1 rounded-full font-medium"
                style="background: rgb(var(--gremius-green) / 0.15); color: rgb(var(--gremius-green));"
              >
                Success
              </span>
              <span
                class="text-[10px] px-2 py-1 rounded-full font-medium"
                style="background: rgb(var(--gremius-amber) / 0.15); color: rgb(var(--gremius-amber));"
              >
                Warning
              </span>
            </div>
          </div>
        </div>

        <!-- CSS Variables Inspector -->
        <div>
          <h3 class="text-xs font-semibold uppercase tracking-wider text-gremius-subtle mb-3">
            CSS Variables
          </h3>
          <div class="space-y-1.5 max-h-[320px] overflow-y-auto pr-1">
            {#each cssVarEntries as entry (entry.key)}
              <div class="flex items-center gap-2.5 text-sm py-1">
                <div
                  class="w-5 h-5 rounded border shrink-0"
                  style="background: rgb({entry.value}); border-color: rgb(var(--gremius-border));"
                  title={entry.value}
                ></div>
                <code class="text-xs text-gremius-text-dim font-mono truncate">{entry.key}</code>
                <span class="text-xs text-gremius-subtle ml-auto font-mono shrink-0"
                  >{entry.value}</span
                >
              </div>
            {/each}
          </div>
        </div>
      </div>
    </div>
  </div>
</div>

<!-- Import Modal -->
<Modal
  bind:open={showImportModal}
  title="Install New Theme"
  description="Paste a ThemeConfig JSON object to import"
  size="lg"
>
  {#snippet children()}
    <div class="space-y-3">
      <textarea
        bind:value={jsonInput}
        rows="10"
        placeholder={`{\n  "id": "custom",\n  "name": "My Theme",\n  "description": "A custom theme",\n  "preview": "linear-gradient(135deg, #000, #fff)",\n  "cssVars": {\n    "--gremius-primary": "137 180 250"\n  }\n}`}
        class="w-full bg-gremius-bg text-gremius-text border border-gremius-border rounded-lg px-3 py-2 text-xs font-mono placeholder-gremius-text-dim focus:outline-none focus:border-gremius-cyan resize-y"
      ></textarea>

      {#if jsonError}
        <div class="flex items-center gap-2 text-xs text-gremius-pink">
          <AlertCircle class="w-4 h-4 shrink-0" />
          {jsonError}
        </div>
      {/if}
    </div>
  {/snippet}

  {#snippet footer()}
    <button
      class="btn-secondary"
      onclick={() => {
        showImportModal = false;
        jsonError = "";
      }}
    >
      Cancel
    </button>
    <button class="btn-secondary" onclick={validateJson}>
      <AlertCircle class="w-4 h-4" />
      Validate
    </button>
    <button class="btn-primary" onclick={importTheme}>
      <Upload class="w-4 h-4" />
      Import
    </button>
  {/snippet}
</Modal>
