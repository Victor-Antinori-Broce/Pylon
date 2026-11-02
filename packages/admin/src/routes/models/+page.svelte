<!--
  Modelos (defineModelo, fase H3): la lista de los modelos de los kons
  montados (GET /api/models) y, para el elegido, su vista generada.
  `?model=<kon>/<nombre>` abre uno.
-->
<script lang="ts">
  import type { DescriptorDeModelo } from "@kitsuden/shared";
  import { Database } from "lucide-svelte";

  import ModelView from "$lib/components/models/ModelView.svelte";
  import { api } from "$lib/api";
  import { t } from "$lib/i18n";

  import { page } from "$app/stores";

  interface ModeloMontado {
    kon: string;
    mountPath: string;
    base: string;
    descriptor: DescriptorDeModelo;
  }

  let modelos = $state<ModeloMontado[]>([]);
  let cargando = $state(true);
  let error = $state<string | null>(null);
  let elegido = $state<string | null>($page.url.searchParams.get("model"));

  const clave = (m: ModeloMontado) => `${m.kon}/${m.descriptor.nombre}`;
  const activo = $derived(modelos.find((m) => clave(m) === elegido) ?? modelos[0] ?? null);

  $effect(() => {
    void (async () => {
      try {
        const r = await api.get<{ data: ModeloMontado[] }>("/api/models");
        modelos = r.data;
      } catch (e) {
        error = (e as Error).message || t("models.errorLoading");
      } finally {
        cargando = false;
      }
    })();
  });
</script>

<div class="h-full flex flex-col">
  <div class="flex items-center gap-3 px-6 py-4 border-b border-zinc-800">
    <div class="p-2 bg-indigo-500/10 rounded-lg">
      <Database size={20} class="text-indigo-400" />
    </div>
    <div class="min-w-0">
      <h1 class="text-lg font-semibold text-zinc-100">{t("models.title")}</h1>
      <p class="text-xs text-zinc-500">{t("models.subtitle")}</p>
    </div>
  </div>

  <div class="flex-1 overflow-auto p-6">
    {#if cargando}
      <p class="text-sm text-zinc-500">{t("models.loading")}</p>
    {:else if error}
      <div class="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300" role="alert">
        {t("models.errorLoading")}: {error}
      </div>
    {:else if modelos.length === 0}
      <div class="card p-12 text-center text-sm text-zinc-500">{t("models.empty")}</div>
    {:else}
      <div class="flex flex-col gap-6 md:flex-row">
        <nav class="md:w-56 shrink-0 space-y-1" aria-label={t("models.pick")}>
          {#each modelos as m (clave(m))}
            <button
              class="w-full rounded-lg px-3 py-2 text-left text-sm {activo && clave(activo) === clave(m)
                ? 'bg-indigo-500/10 text-indigo-300'
                : 'text-zinc-300 hover:bg-zinc-800/60'}"
              onclick={() => (elegido = clave(m))}
            >
              <span class="block font-medium">{m.descriptor.etiqueta}</span>
              <span class="block text-[11px] text-zinc-500">{m.kon}</span>
            </button>
          {/each}
        </nav>
        <div class="min-w-0 flex-1">
          {#if activo}
            {#key clave(activo)}
              <ModelView descriptor={activo.descriptor} base={activo.base} />
            {/key}
          {/if}
        </div>
      </div>
    {/if}
  </div>
</div>
