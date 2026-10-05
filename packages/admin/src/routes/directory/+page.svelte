<script lang="ts">
  /**
   * Redirector heredado: esta pantalla la sirve `/g/[id]` con el renderizador
   * generico, a partir del `kon.json` del kon.
   *
   * El destino era `/g/grimoire-directory`, un id de antes del renombrado
   * grimoire -> kon: el kon se llama `kon-directory`. Llevaba dias llevando a
   * una pantalla vacia, y la sonda de enlaces no lo veia porque
   * `/g/grimoire-directory` encaja perfectamente con la ruta `/g/[id]` — el id
   * puede ser cualquier cosa. Solo fallaba al hacer clic.
   */
  import { onMount } from "svelte";

  import { goto } from "$app/navigation";

  onMount(() => {
    goto("/g/kon-directory");
  });
</script>

<div class="flex items-center justify-center h-96">
  <div class="flex flex-col items-center gap-4">
    <div
      class="w-8 h-8 border-2 border-kitsuden-accent/30 border-t-kitsuden-accent rounded-full animate-spin"
    ></div>
    <p class="text-kitsuden-subtle text-sm">Redirecting to grimoire-directory...</p>
  </div>
</div>
