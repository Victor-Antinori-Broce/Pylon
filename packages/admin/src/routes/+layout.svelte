<script lang="ts">
  import "../style.css";
  import "../assets/main.css";
  import { onMount } from "svelte";

  import { checkSession, isLoggedIn, getChecked, isInitialized, checkInit } from "$lib/auth.svelte";
  import SidebarLayout from "$lib/components/layout/SidebarLayout.svelte";
  import { loadTheme } from "$lib/theme.svelte";
  import LoginView from "$views/auth/LoginView.svelte";
  import SetupView from "$views/auth/SetupView.svelte";

  // Svelte 5 children snippet for layout
  const { children } = $props<{ children: () => any }>();

  const checked = $derived(getChecked());
  const loggedIn = $derived(isLoggedIn());
  const initialized = $derived(isInitialized());
  let loading = $state(true);

  onMount(async () => {
    console.log("[layout] onMount start");
    await loadTheme();
    await checkInit();
    console.log(`[layout] initialized=${isInitialized()}`);

    // Only check session if the system is already initialized
    if (isInitialized()) {
      await checkSession();
    }

    loading = false;

    console.log(
      `[layout] onMount done: loggedIn=${loggedIn}, checked=${checked}, initialized=${initialized}`
    );
  });

  // Debug: watch state changes
  $effect(() => {
    console.log(
      `[layout] STATE: loading=${loading}, loggedIn=${loggedIn}, checked=${checked}, initialized=${initialized}`
    );
  });
</script>

{#if loading}
  <div class="min-h-screen flex items-center justify-center bg-gremius-bg">
    <div class="flex flex-col items-center gap-4">
      <div
        class="w-8 h-8 border-2 border-gremius-cyan/30 border-t-gremius-cyan rounded-full animate-spin"
      ></div>
      <p class="text-gremius-subtle text-sm">Loading...</p>
    </div>
  </div>
{:else if !initialized}
  <SetupView />
{:else if loggedIn}
  <SidebarLayout>
    {@render children()}
  </SidebarLayout>
{:else if checked}
  <LoginView />
{:else}
  <div class="min-h-screen flex items-center justify-center bg-gremius-bg">
    <div class="flex flex-col items-center gap-4">
      <div
        class="w-8 h-8 border-2 border-gremius-cyan/30 border-t-gremius-cyan rounded-full animate-spin"
      ></div>
      <p class="text-gremius-subtle text-sm">Loading...</p>
    </div>
  </div>
{/if}
