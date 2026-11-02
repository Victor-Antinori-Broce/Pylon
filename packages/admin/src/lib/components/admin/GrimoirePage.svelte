<script lang="ts">
  import { t as tr } from "$lib/i18n";
  import CustomViewHost from "./CustomViewHost.svelte";
  /**
   * GrimoirePage.svelte — Hybrid Rendering Edition
   *
   * Supports two modes:
   * 1. LEGACY: Full custom Svelte view (monolith) — loaded via GRIMOIRE_VIEW_REGISTRY
   * 2. HYBRID: Multiple views per grimoire — DataExplorer for grid/kanban/calendar,
   *    Custom Svelte components only for type: "custom" views
   *
   * Flow:
   * 1. Fetch grimoire config from /api/admin/registry
   * 2. If legacy custom view exists → load monolith (backward compat)
   * 3. If admin.views declared → render tabs (DataExplorer + custom views)
   * 4. Fallback to auto-generated DataExplorer config
   */
  import type { Component } from "svelte";

  import DataExplorer from "$lib/components/admin/DataExplorer.svelte";
  import { moduleStore } from "$lib/states/modules.svelte";
  import {
    getGrimoireConfig,
    loadCustomView,
    generateExplorerConfig,
    generateDefaultConfig,
    hasCustomView,
    type GrimoireAdminConfig,
    type AdminViewConfig,
  } from "$lib/grimoire-loader";
  import type { AdminConfig } from "$lib/types/admin";

  const { grimoireId, initialViewId }: { grimoireId: string; initialViewId?: string } = $props();

  // Legacy mode state
  let LegacyView: Component | null = $state(null);

  // Hybrid mode state
  let grimoireConfig = $state<GrimoireAdminConfig | null>(null);
  let activeViewId = $state<string>(initialViewId || "");
  let customViews = $state<Record<string, Component>>({});

  // Shared state
  let loading = $state(true);
  let error = $state<string | null>(null);

  /**
   * ¿Está este kon activado?
   *
   * Sin esto, entrar a un kon APAGADO pintaba su explorador de datos como si
   * nada: cabecera, «0 records» y un botón «Agregar» que abría un formulario
   * quejándose de que no encuentra la tabla. Y no la encuentra porque el kon no
   * está instalado — sus migraciones no han corrido y sus tablas no existen.
   *
   * El mensaje resultante hablaba de una tabla que falta, cuando lo que falta
   * es el kon entero. Preguntarlo aquí convierte un error técnico sin salida en
   * una frase con un botón.
   */
  const sinPrefijo = $derived(grimoireId.replace(/^kon-/, ""));

  /**
   * ¿El id de la URL corresponde a un KON?
   *
   * No todo lo que cuelga de `/g/` lo es. `grimoire-loader.ts` registra vistas
   * del sistema por clave —`system-tools-editor`, `system-tools-builder`— y el
   * editor de contenido vive en `/g/system-tools/editor`.
   *
   * La primera versión de la comprobación de abajo no lo distinguía, así que
   * `system-tools` no aparecía entre los kons activos y el editor pasó a
   * responder «Este kon no está activado». Rompí una pantalla que funcionaba
   * intentando arreglar otra — y dos rondas antes había dejado escrito en
   * `routes/content/edit/+page.ts` que `system-tools` NO es un kon, justo para
   * no cometer este error.
   */
  const esUnKon = $derived(
    moduleStore.modules.some(
      (m) => m.key === grimoireId || m.key.replace(/^kon-/, "") === sinPrefijo
    )
  );

  /**
   * Solo se bloquea lo que ES un kon y está apagado.
   *
   * Si el id no es de ningún kon, esta pantalla no tiene nada que decir al
   * respecto: la sirve el registro de vistas del sistema o no existe, y en el
   * segundo caso el propio cargador dará su error.
   */
  // `konActivo` ya compara por kon —prefijado o no—, que es lo que aquí se
  // hacía a mano con dos `has()`. Una sola regla, en el store.
  const konActivado = $derived(!esUnKon || moduleStore.konActivo(grimoireId));

  // Core engines with custom views that are not in the registry
  const CORE_ENGINES_WITH_VIEWS = ["media-library", "media"];

  /**
   * `$effect` y no `onMount`: hay que recargar al CAMBIAR de kon.
   *
   * Al navegar entre kons del menu, SvelteKit reutiliza este mismo componente
   * en vez de montarlo otra vez, asi que `onMount` no volvia a dispararse: la
   * pagina se quedaba con la configuracion del kon anterior y solo se
   * actualizaba pulsando F5. Con dos kons distintos eso significa ver los datos
   * del que no has pedido, que es peor que un error.
   *
   * Leer `grimoireId` dentro del efecto es lo que crea la dependencia; en
   * cuanto cambia, esto se vuelve a ejecutar solo.
   */
  $effect(() => {
    const kon = grimoireId;

    // Estado limpio en cada cambio: sin esto se veria la vista del kon anterior
    // mientras carga el nuevo, y un error viejo sobreviviria a la navegacion.
    loading = true;
    error = null;
    LegacyView = null;
    grimoireConfig = null;
    customViews = {};
    activeViewId = initialViewId || "";

    void cargarKon(kon);
  });

  async function cargarKon(grimoireId: string) {
    try {
      // Step 1: Fetch auto-discovered config from registry
      const config = await getGrimoireConfig(grimoireId);
      grimoireConfig = config;

      if (config) {
        // Set default active view (respect URL if provided)
        if (!activeViewId) {
          activeViewId = config.defaultView || config.views[0]?.id || "";
        }

        // Step 2: Check for LEGACY monolith view (full grimoire custom view)
        // This takes precedence for backward compatibility during migration
        const hasLegacyCustom =
          hasCustomView(grimoireId) || CORE_ENGINES_WITH_VIEWS.includes(grimoireId);

        if (hasLegacyCustom && !hasHybridViews(config)) {
          // Legacy mode: load the full monolith view
          const view = await loadCustomView(grimoireId);
          if (view) {
            LegacyView = view;
            loading = false;
            return;
          }
        }

        // Step 3: Hybrid mode — load custom views for type: "custom" entries
        for (const view of config.views) {
          if (view.type === "custom") {
            const custom = await loadCustomView(grimoireId, view.id);
            if (custom) {
              customViews = { ...customViews, [view.id]: custom };
            }
          }
        }
      } else {
        // No registry config — try per-view custom component first (e.g. system-tools/editor)
        if (initialViewId) {
          const view = await loadCustomView(grimoireId, initialViewId);
          if (view) {
            LegacyView = view;
            loading = false;
            return;
          }
        }

        // Fallback to legacy monolith view
        if (hasCustomView(grimoireId) || CORE_ENGINES_WITH_VIEWS.includes(grimoireId)) {
          const view = await loadCustomView(grimoireId);
          if (view) {
            LegacyView = view;
            loading = false;
            return;
          }
        }

        console.warn(`[GrimoirePage] No registry config for ${grimoireId}, using defaults`);
      }
    } catch (err) {
      console.error(`[GrimoirePage] Failed to load grimoire "${grimoireId}":`, err);
      error = err instanceof Error ? err.message : tr("grimoirePage.failedToLoadGrimoire");
    } finally {
      loading = false;
    }
  }

  /**
   * Check if grimoire config uses hybrid rendering (mix of custom + DataExplorer views)
   */
  function hasHybridViews(config: GrimoireAdminConfig): boolean {
    const customCount = config.views.filter((v) => v.type === "custom").length;
    const explorerCount = config.views.filter((v) => v.type !== "custom").length;
    // Hybrid = has BOTH custom and explorer views, OR only explorer views (no legacy monolith)
    return customCount > 0 || explorerCount > 0;
  }

  /**
   * Get DataExplorer config for the currently active view
   */
  function getActiveExplorerConfig(): AdminConfig | undefined {
    if (!grimoireConfig) return undefined;
    return generateExplorerConfig(grimoireConfig, activeViewId);
  }

  /**
   * Check if the active view is a custom Svelte component
   *
   * Declared-but-unloaded custom views count too: DataExplorer cannot render
   * them, so the template shows the "not yet implemented" card instead.
   */
  function isActiveViewCustom(): boolean {
    if (!grimoireConfig) return false;
    const view = grimoireConfig.views.find((v) => v.id === activeViewId);
    return view?.type === "custom";
  }

  /**
   * La vista activa, si es un Web Component aportado por un kon.
   *
   * Estas no las pinta DataExplorer ni son componentes Svelte del admin: son
   * artefactos que sirve el propio kon y que monta `CustomViewHost`. Cuatro
   * kons los traen —tierlist, broadcast, broadcast-moba y esports— y hasta
   * ahora ninguno se mostraba: el registro convertia su tipo en «grid» y aqui
   * no habia rama que los montara.
   */
  const vistaElementoActiva = $derived.by(() => {
    if (!grimoireConfig) return null;
    const vista = grimoireConfig.views.find((v) => v.id === activeViewId);
    if (vista?.type !== "element" || !vista.element || !vista.src) return null;
    return { element: vista.element, src: vista.src, konId: grimoireId };
  });

  /**
   * Get the active custom view component
   */
  function getActiveCustomView(): Component | undefined {
    return customViews[activeViewId];
  }

  /**
   * Get label for a view tab
   */
  function getViewLabel(view: AdminViewConfig): string {
    return view.title || view.id;
  }
</script>

<!--
  Un kon apagado se dice, no se disimula.

  Antes se pintaba su explorador igual: cabecera, «0 records» y un boton
  «Agregar» que abria un formulario quejandose de una tabla que no existe —
  porque el kon no esta instalado y sus migraciones no han corrido. El usuario
  leia «falta la tabla builder_definitions» cuando lo que faltaba era activar
  el kon.
-->
{#if !loading && !konActivado}
  <div class="card p-12 text-center">
    <h2 class="mb-2 text-lg font-semibold">{grimoireConfig?.name ?? grimoireId}</h2>
    <p class="mx-auto mb-6 max-w-md text-sm text-kitsuden-subtle">
      {tr("grimoirePage.esteKonNoEstaActivado")}
    </p>
    <a href="/kons" class="btn-primary inline-flex items-center gap-2">{tr("grimoirePage.irAKons")}</a>
  </div>
{:else if loading}
  <div class="flex items-center justify-center h-96">
    <div class="flex flex-col items-center gap-4">
      <div
        class="w-8 h-8 border-2 border-kitsuden-accent/30 border-t-kitsuden-accent rounded-full animate-spin"
      ></div>
      <p class="text-kitsuden-subtle text-sm">{tr("grimoirePage.loading", { grimoireId })}</p>
    </div>
  </div>
{:else if error && !grimoireConfig && !LegacyView}
  <div class="flex items-center justify-center h-96">
    <div class="text-center">
      <div class="text-4xl mb-4">⚠️</div>
      <h3 class="text-lg font-semibold text-kitsuden-text mb-2">{tr("grimoirePage.failedToLoad")}</h3>
      <p class="text-sm text-kitsuden-subtle">{error}</p>
    </div>
  </div>
{:else if LegacyView}
  <!-- LEGACY MODE: Full custom monolith view -->
  <LegacyView />
{:else if grimoireConfig && grimoireConfig.views.length > 0}
  <!-- HYBRID MODE: Tabs with DataExplorer + Custom views -->
  <div class="space-y-4">
    <!-- View Tabs -->
    {#if grimoireConfig.views.length > 1}
      <div class="border-b border-kitsuden-border">
        <div class="flex gap-1">
          {#each grimoireConfig.views as view}
            {@const isActive = activeViewId === view.id}
            {@const isCustomReady = view.type === "custom" ? view.id in customViews : true}
            <button
              onclick={() => (activeViewId = view.id)}
              class="group px-4 py-2.5 text-sm font-medium border-b-2 transition-all duration-200 inline-flex items-center gap-2"
              class:border-kitsuden-accent={isActive}
              class:text-kitsuden-accent={isActive}
              class:border-transparent={!isActive}
              class:text-kitsuden-text-dim={!isActive}
              class:hover:text-kitsuden-text={!isActive}
              disabled={view.type === "custom" && !isCustomReady}
              title={view.type === "custom" && !isCustomReady
                ? tr("grimoirePage.customViewNotYetImplemented")
                : undefined}
            >
              {#if view.type === "custom"}
                <span class="w-2 h-2 rounded-full bg-kitsuden-accent-2"></span>
              {:else if view.type === "kanban"}
                <span class="w-2 h-2 rounded-full bg-kitsuden-purple"></span>
              {:else if view.type === "calendar"}
                <span class="w-2 h-2 rounded-full bg-kitsuden-amber"></span>
              {:else}
                <span class="w-2 h-2 rounded-full bg-kitsuden-accent"></span>
              {/if}
              {getViewLabel(view)}
            </button>
          {/each}
        </div>
      </div>
    {/if}

    <!-- View Content -->
    <div class="animate-fade-in">
      {#if vistaElementoActiva}
        <CustomViewHost descriptor={vistaElementoActiva} viewId={activeViewId} />
      {:else if isActiveViewCustom()}
        {@const CustomComponent = getActiveCustomView()}
        {#if CustomComponent}
          <!--
            ── POR QUE SE LE PASA `viewId` ──────────────────────────────────

            Un mismo componente puede estar registrado para VARIAS vistas del
            kon. Games lo hace: «All Games» y «Collections» apuntan las dos a
            `GamesView.svelte`, que tiene sus propias pestañas dentro y abría
            siempre en la de juegos.

            Resultado: pulsabas «Collections» y salía la lista de juegos. No
            fallaba nada — enseñaba lo que no era, que es el mismo problema que
            «Programados» con los borradores dentro.

            Sin la prop, el componente no tiene forma de saber cuál se pulsó.
            Las vistas que no la declaren la ignoran sin más.
          -->
          <CustomComponent viewId={activeViewId} />
        {:else}
          <div class="card p-12 text-center">
            <p class="text-kitsuden-subtle">
              {tr("grimoirePage.customViewIsNotYet", { activeViewId })}
            </p>
          </div>
        {/if}
      {:else}
        {@const explorerConfig = getActiveExplorerConfig()}
        {#if explorerConfig}
          <DataExplorer
            {grimoireId}
            config={explorerConfig}
            viewId={activeViewId || "default"}
            allTables={grimoireConfig.tables.map((t) => ({ name: t.name, label: t.label }))}
          />
        {:else}
          <div class="card p-12 text-center">
            <p class="text-kitsuden-subtle">
              {tr("grimoirePage.noExplorerConfigurationForView", { activeViewId })}
            </p>
          </div>
        {/if}
      {/if}
    </div>
  </div>
{:else if grimoireConfig && grimoireConfig.tables.length === 0}
  <!--
    El kon existe y esta cargado, pero no expone datos: ni tablas propias ni
    vista a medida: los hay que solo aportan comportamiento a otros kons y no
    guardan nada propio.

    Antes se caia al explorador automatico, que pedia una tabla llamada como el
    kon y respondia «Collection no encontrada» con 0 columnas — un error que
    daba a entender que algo estaba roto cuando no habia nada que arreglar.
  -->
  <div class="card p-12 text-center">
    <h2 class="mb-2 text-lg font-semibold">{grimoireConfig.name}</h2>
    <p class="mx-auto max-w-md text-sm text-kitsuden-subtle">
      {tr("grimoirePage.esteKonNoGuardaDatos")}
    </p>
  </div>
{:else}
  <!-- FALLBACK: Auto-generated DataExplorer -->
  {#await generateDefaultConfig(grimoireId) then fallbackConfig}
    <DataExplorer
      {grimoireId}
      config={fallbackConfig}
      viewId="default"
      allTables={grimoireConfig?.tables.map((t) => ({ name: t.name, label: t.label }))}
    />
  {:catch}
    <div class="flex items-center justify-center h-96">
      <div class="text-center">
        <div class="text-4xl mb-4">📭</div>
        <h3 class="text-lg font-semibold text-kitsuden-text mb-2">{tr("grimoirePage.noConfiguration")}</h3>
        <p class="text-sm text-kitsuden-subtle">{tr("grimoirePage.thisGrimoireHasNoAdmin")}</p>
      </div>
    </div>
  {/await}
{/if}

<style>
  .animate-fade-in {
    animation: fadeIn 0.2s ease-out;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
