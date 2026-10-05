<script lang="ts">
  import { Save, Check, AlertCircle, ChevronDown } from "lucide-svelte";

  import { autosaveStore } from "$lib/states/autosave.svelte";

  import VersionHistory from "./VersionHistory.svelte";

  let showDropdown = $state(false);

  function toggleDropdown() {
    showDropdown = !showDropdown;
  }

  function closeDropdown() {
    showDropdown = false;
  }
</script>

<div class="relative">
  <button
    class="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium transition-colors
      {autosaveStore.status === 'saving'
      ? 'text-amber-400 bg-amber-400/10'
      : autosaveStore.status === 'unsaved'
        ? 'text-kitsuden-accent-2 bg-kitsuden-accent-2/10'
        : 'text-emerald-400 bg-emerald-400/10'}"
    onclick={toggleDropdown}
    aria-haspopup="true"
    aria-expanded={showDropdown}
  >
    <!--
      ── POR QUE PONE «BORRADOR» Y NO «SAVED» ────────────────────────────────

      Este indicador habla del borrador en ESTE NAVEGADOR (localStorage), no de
      lo guardado en el servidor. Puesto al lado de un boton «Save Post», un
      «Saved» a secas dice justo lo contrario de la verdad: que el post esta a
      salvo. Y quien lo lea asi cerrara la pestana sin guardar.

      Vale igual para el otro sitio que usa este indicador (`AutoFormModal`):
      alli tambien es un borrador local.
    -->
    {#if autosaveStore.status === "saving"}
      <Save class="w-3.5 h-3.5 animate-pulse" />
      <span>Guardando borrador…</span>
    {:else if autosaveStore.status === "unsaved"}
      <AlertCircle class="w-3.5 h-3.5" />
      <span>Borrador sin guardar</span>
    {:else}
      <Check class="w-3.5 h-3.5" />
      <span>Borrador guardado</span>
    {/if}
    <ChevronDown class="w-3 h-3 ml-0.5 transition-transform {showDropdown ? 'rotate-180' : ''}" />
  </button>

  {#if showDropdown}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="fixed inset-0 z-40" onclick={closeDropdown}></div>
    <div
      class="absolute right-0 top-full mt-2 z-50 w-72 bg-kitsuden-card border border-kitsuden-border rounded-lg shadow-xl p-3"
    >
      <VersionHistory onRestore={closeDropdown} />
    </div>
  {/if}
</div>
