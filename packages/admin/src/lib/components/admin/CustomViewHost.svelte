<script lang="ts">
  import { t } from "$lib/i18n";
  /**
   * Anfitrión de una vista de admin agnóstica al framework.
   *
   * Monta un custom element que aporta un kon, cargado en runtime desde su
   * artefacto compilado. El kon puede haberlo escrito en React, Vue, Svelte o
   * JS plano — aquí da igual, porque lo que llega es un bundle, no fuente.
   *
   * Sobre el tema: NO se pasa por props. Las variables CSS del documento
   * atraviesan el Shadow DOM por herencia, así que la vista solo tiene que usar
   * `var(--kitsuden-accent, …)` y queda integrada. Es el mismo patrón que ya
   * se usa en el portal embebible del kon de newsletter.
   */
  import { createViewContext, type CustomViewDescriptor } from "@kitsuden/shared";

  import { customViewLoader } from "$lib/custom-view-loader";

  interface Props {
    descriptor: CustomViewDescriptor;
    viewId: string;
    /** Datos que la vista recibe como propiedad `params`. */
    params?: Record<string, unknown>;
    theme?: "light" | "dark";
    locale?: string;
    apiBase?: string;
  }

  let {
    descriptor,
    viewId,
    params = {},
    theme = "dark",
    locale = "es",
    apiBase = "/api",
  }: Props = $props();

  let mountPoint: HTMLDivElement | null = $state(null);
  let status: "loading" | "ready" | "error" = $state("loading");
  let errorMessage = $state("");
  let instance: HTMLElement | null = null;

  const context = $derived(
    createViewContext({ konId: descriptor.konId, viewId, apiBase, theme, locale })
  );

  /**
   * `$effect` y no `onMount`: hay que recargar al CAMBIAR de vista.
   *
   * Al pasar de una pestaña a otra del mismo kon, Svelte reutiliza este
   * componente en vez de montarlo de nuevo, asi que `onMount` no volvia a
   * dispararse. El descriptor cambiaba y no se cargaba nada.
   *
   * El sintoma era desconcertante: la cabecera del error decia «clasificaciones»
   * y pedia `<broadcast-clasificaciones>`, pero el mensaje seguia siendo el de
   * `scoreboard.js` — el intento anterior. Mandaba a mirar el fichero
   * equivocado.
   *
   * Es el mismo fallo que tenia `GrimoirePage` al cambiar de kon.
   */
  $effect(() => {
    // Leer el descriptor AQUI es lo que crea la dependencia.
    const actual = descriptor;
    let cancelled = false;

    // Estado limpio en cada cambio: sin esto se veria el error de la vista
    // anterior mientras carga la nueva.
    status = "loading";
    errorMessage = "";
    if (mountPoint) mountPoint.replaceChildren();
    instance = null;

    (async () => {
      try {
        const { tag } = await customViewLoader().load(actual);
        if (cancelled || !mountPoint) return;

        const el = document.createElement(tag);
        // Se pasan como PROPIEDADES, no atributos: los atributos solo admiten
        // strings y aquí van objetos.
        (el as HTMLElement & { context?: unknown }).context = context;
        (el as HTMLElement & { params?: unknown }).params = params;

        mountPoint.replaceChildren(el);
        instance = el;
        status = "ready";
      } catch (err) {
        if (cancelled) return;
        status = "error";
        errorMessage = err instanceof Error ? err.message : String(err);
        // El error va a consola además de a pantalla: quien escribe la vista
        // necesita la traza, no solo el resumen.
        console.error("[CustomViewHost] no se pudo montar la vista", actual, err);
      }
    })();

    return () => {
      cancelled = true;
      instance?.remove();
      instance = null;
    };
  });

  // El tema y los params pueden cambiar sin desmontar la vista: se reenvían.
  $effect(() => {
    if (instance) {
      (instance as HTMLElement & { context?: unknown }).context = context;
      (instance as HTMLElement & { params?: unknown }).params = params;
    }
  });
</script>

<div class="custom-view">
  {#if status === "loading"}
    <div class="state" role="status">
      <span class="spinner" aria-hidden="true"></span>
      <span>{t("customViewHost.cargandoVista")}</span>
    </div>
  {:else if status === "error"}
    <div class="state error" role="alert">
      <strong>{t("customViewHost.noSePudoCargarLa", { viewId })}</strong>
      <p>{errorMessage}</p>
      <p class="hint">
        {t("customViewHost.laAporta")} <code>{descriptor.konId}</code> {t("customViewHost.yDebeRegistrar")}
        <code>&lt;{descriptor.element}&gt;</code>.
      </p>
    </div>
  {/if}

  <!-- El custom element se inyecta aquí. Se mantiene en el DOM aunque esté
       cargando para que la referencia exista cuando llegue el artefacto. -->
  <div class="mount" class:hidden={status !== "ready"} bind:this={mountPoint}></div>
</div>

<style>
  .custom-view {
    display: flex;
    flex-direction: column;
    min-height: 12rem;
    width: 100%;
  }

  .mount {
    flex: 1;
    min-width: 0;
  }

  .hidden {
    display: none;
  }

  .state {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    color: rgb(var(--kitsuden-text-dim) / 1);
  }

  .state.error {
    align-items: flex-start;
    text-align: left;
    border: 1px solid rgb(var(--kitsuden-border) / 1);
    border-radius: 0.5rem;
    background: rgb(var(--kitsuden-card) / 1);
    color: rgb(var(--kitsuden-text) / 1);
  }

  .state.error p {
    margin: 0;
    font-size: 0.875rem;
    color: rgb(var(--kitsuden-text-dim) / 1);
  }

  .hint code {
    font-family: ui-monospace, monospace;
    font-size: 0.8125rem;
  }

  .spinner {
    width: 1.25rem;
    height: 1.25rem;
    border: 2px solid rgb(var(--kitsuden-border) / 1);
    border-top-color: rgb(var(--kitsuden-accent) / 1);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .spinner {
      animation: none;
    }
  }
</style>
