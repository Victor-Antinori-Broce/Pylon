<script lang="ts">
  import "../style.css";
  import { onMount } from "svelte";
  import { checkSession } from "$lib/auth.svelte";
  import { loadTheme } from "$lib/theme.svelte";
  import SidebarLayout from "$lib/components/layout/SidebarLayout.svelte";
  import LoginView from "$views/auth/LoginView.svelte";
  import SetupView from "$views/auth/SetupView.svelte";
  import { isLoggedIn, getChecked, isInitialized, checkInit } from "$lib/auth.svelte";
  
  let checked = $derived(getChecked());
  let loggedIn = $derived(isLoggedIn());
  let initialized = $derived(isInitialized());
  let loading = $state(true);
  
  onMount(async () => {
    await loadTheme();
    await checkInit();
    
    // Only check session if the system is already initialized
    if (isInitialized()) {
      await checkSession();
    }
    
    loading = false;
    
    console.log("🚀 Gremius Admin initialized");
  });
</script>

{#if loading}
  <div class="min-h-screen flex items-center justify-center bg-gremius-bg">
    <div class="flex flex-col items-center gap-4">
      <div class="w-8 h-8 border-2 border-gremius-cyan/30 border-t-gremius-cyan rounded-full animate-spin"></div>
      <p class="text-gremius-subtle text-sm">Loading...</p>
    </div>
  </div>
{:else if !initialized}
  <SetupView />
{:else if loggedIn}
  <SidebarLayout>
    <slot />
  </SidebarLayout>
{:else if checked}
  <LoginView />
{:else}
  <div class="min-h-screen flex items-center justify-center bg-gremius-bg">
    <div class="flex flex-col items-center gap-4">
      <div class="w-8 h-8 border-2 border-gremius-cyan/30 border-t-gremius-cyan rounded-full animate-spin"></div>
      <p class="text-gremius-subtle text-sm">Loading...</p>
    </div>
  </div>
{/if}

