<script lang="ts">
  import { t } from "$lib/i18n";
  import "../style.css";
  import "../assets/main.css";
  import { onMount } from "svelte";
  import { Toaster } from "svelte-sonner";

  import {
    checkSession,
    isLoggedIn,
    isStaff,
    getChecked,
    isInitialized,
    checkInit,
  } from "$lib/auth.svelte";
  import SidebarLayout from "$lib/components/layout/SidebarLayout.svelte";
  import { loadTheme, currentTheme } from "$lib/theme.svelte";
  import LoginView from "$views/auth/LoginView.svelte";
  import SetupView from "$views/auth/SetupView.svelte";

  // Svelte 5 children snippet for layout
  const { children } = $props<{ children: () => any }>();

  const checked = $derived(getChecked());
  // Una cuenta «user» con sesión (el alta es abierta) no ve el panel: la API ya
  // le niega todo y la carcasa solo enseñaba pantallas rotas.
  const loggedIn = $derived(isLoggedIn() && isStaff());
  const initialized = $derived(isInitialized());
  let loading = $state(true);

  onMount(async () => {
    await loadTheme();
    await checkInit();

    // Only check session if the system is already initialized
    if (isInitialized()) {
      await checkSession();
    }

    loading = false;
  });
</script>

<!--
  Contenedor de los avisos. Un centenar de llamadas a toast() repartidas por el
  panel no pintaban nada porque nadie montaba <Toaster />: guardar, borrar o
  fallar no daba ninguna señal.
-->
<Toaster theme={currentTheme() === "latte" ? "light" : "dark"} richColors position="bottom-right" />

{#if loading}
  <div class="min-h-screen flex items-center justify-center bg-kitsuden-bg">
    <div class="flex flex-col items-center gap-4">
      <div
        class="w-8 h-8 border-2 border-kitsuden-accent/30 border-t-kitsuden-accent rounded-full animate-spin"
      ></div>
      <p class="text-kitsuden-subtle text-sm">{t("common.loading")}</p>
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
  <div class="min-h-screen flex items-center justify-center bg-kitsuden-bg">
    <div class="flex flex-col items-center gap-4">
      <div
        class="w-8 h-8 border-2 border-kitsuden-accent/30 border-t-kitsuden-accent rounded-full animate-spin"
      ></div>
      <p class="text-kitsuden-subtle text-sm">{t("common.loading")}</p>
    </div>
  </div>
{/if}
