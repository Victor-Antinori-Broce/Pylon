<script lang="ts">
  import { t } from "$lib/i18n";
  /**
   * Etiquetas y plataformas de un juego (kon-games), en el formulario del juego
   * ==========================================================================
   *
   * El formulario genérico solo sabe de las columnas de `games`; las etiquetas
   * y las plataformas son tablas puente (`games_to_tags`, `games_to_platforms`)
   * y salían como «solo lectura»: no había forma de marcar un juego como
   * «Gratis», «En pareja» o «Jugar online» —filtros que use tu web— ni de
   * decir que está en Switch sin tocar la base a mano.
   *
   * Aquí se eligen con un clic (chips) y se guardan DESPUÉS del juego, con el
   * endpoint de kon-games que ya sincroniza las dos relaciones
   * (`PATCH /api/games/:id` con `tagIds` y `platformIds`). `guardar(id)` lo
   * llama el formulario cuando tiene el id: al editar, el suyo; al crear, el
   * que devuelve la creación.
   */
  import { Loader2 } from "lucide-svelte";
  import { onMount } from "svelte";

  interface Opcion {
    id: string;
    name: string;
    slug: string;
    color?: string | null;
    shortName?: string | null;
  }

  interface Props {
    /** El juego que se edita; null al crear */
    juegoId: string | null;
  }

  const { juegoId }: Props = $props();

  const API_URL = import.meta.env.VITE_API_URL ?? "";

  let etiquetas = $state<Opcion[]>([]);
  let plataformas = $state<Opcion[]>([]);
  let elegidasEtiquetas = $state<Set<string>>(new Set());
  let elegidasPlataformas = $state<Set<string>>(new Set());
  let cargando = $state(true);
  let aviso = $state<string | null>(null);

  onMount(async () => {
    try {
      const pedir = (ruta: string) =>
        fetch(`${API_URL}${ruta}`, { credentials: "include" }).then((r) => r.json());
      const [t, p, juego] = await Promise.all([
        pedir("/api/games/tags"),
        pedir("/api/games/platforms"),
        juegoId ? pedir(`/api/games/${juegoId}`) : Promise.resolve(null),
      ]);
      etiquetas = t.docs ?? [];
      plataformas = p.docs ?? [];
      if (juego) {
        elegidasEtiquetas = new Set((juego.tags ?? []).map((x: Opcion) => x.id));
        elegidasPlataformas = new Set((juego.platforms ?? []).map((x: Opcion) => x.id));
      }
    } catch {
      aviso = t("etiquetasDelJuego.noSePudieronCargarLas");
    } finally {
      cargando = false;
    }
  });

  function alternar(conjunto: Set<string>, id: string): Set<string> {
    const nuevo = new Set(conjunto);
    if (nuevo.has(id)) nuevo.delete(id);
    else nuevo.add(id);
    return nuevo;
  }

  /** Guarda las dos relaciones del juego. Devuelve el error, o null si fue bien. */
  export async function guardar(id: string): Promise<string | null> {
    if (cargando || aviso) return null; // sin catálogo cargado no se pisa nada
    const res = await fetch(`${API_URL}/api/games/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        tagIds: [...elegidasEtiquetas],
        platformIds: [...elegidasPlataformas],
      }),
    });
    if (res.ok) return null;
    const err = await res.json().catch(() => ({}));
    return err.error || t("etiquetasDelJuego.noSePudieronGuardarLas");
  }
</script>

<div class="mt-6 space-y-5 border-t border-kitsuden-border pt-5">
  {#if cargando}
    <p class="flex items-center gap-2 text-sm text-kitsuden-subtle">
      <Loader2 class="h-4 w-4 animate-spin" /> {t("etiquetasDelJuego.cargandoEtiquetasYPlataformas")}
    </p>
  {:else if aviso}
    <p class="text-sm text-kitsuden-accent-2">{aviso}</p>
  {:else}
    <div>
      <p class="mb-1 text-sm font-medium text-kitsuden-text">{t("etiquetasDelJuego.etiquetas")}</p>
      <p class="mb-2 text-[11px] text-kitsuden-subtle">
        {t("etiquetasDelJuego.gratisEnParejaYJugar")}
      </p>
      {#if etiquetas.length === 0}
        <p class="text-xs text-kitsuden-subtle">{t("etiquetasDelJuego.noHayEtiquetasCrealasEn")}</p>
      {:else}
        <div class="flex flex-wrap gap-2">
          {#each etiquetas as e (e.id)}
            <button
              type="button"
              class="chip"
              class:chip--activo={elegidasEtiquetas.has(e.id)}
              style={e.color ? `--chip:${e.color}` : undefined}
              aria-pressed={elegidasEtiquetas.has(e.id)}
              onclick={() => (elegidasEtiquetas = alternar(elegidasEtiquetas, e.id))}
            >
              {e.name}
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <div>
      <p class="mb-2 text-sm font-medium text-kitsuden-text">{t("etiquetasDelJuego.plataformas")}</p>
      {#if plataformas.length === 0}
        <p class="text-xs text-kitsuden-subtle">
          {t("etiquetasDelJuego.noHayPlataformasCrealasEn")}
        </p>
      {:else}
        <div class="flex flex-wrap gap-2">
          {#each plataformas as p (p.id)}
            <button
              type="button"
              class="chip"
              class:chip--activo={elegidasPlataformas.has(p.id)}
              aria-pressed={elegidasPlataformas.has(p.id)}
              title={p.name}
              onclick={() => (elegidasPlataformas = alternar(elegidasPlataformas, p.id))}
            >
              {p.shortName || p.name}
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .chip {
    --chip: var(--color-kitsuden-accent, #7c3aed);
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--chip) 45%, transparent);
    padding: 0.3rem 0.8rem;
    font-size: 0.8rem;
    font-weight: 500;
    color: inherit;
    opacity: 0.75;
    transition:
      background 0.15s ease,
      opacity 0.15s ease;
  }
  .chip:hover {
    opacity: 1;
  }
  .chip--activo {
    background: var(--chip);
    border-color: var(--chip);
    color: #fff;
    opacity: 1;
  }
</style>
