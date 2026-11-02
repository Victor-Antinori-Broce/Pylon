<script lang="ts">
  /**
   * Icono de un kon, venga como venga.
   *
   * ── DOS CONVENCIONES CONVIVIENDO ─────────────────────────────────────────
   *
   * En este repo el campo `icon` significa dos cosas distintas según de dónde
   * salga, y eso NO es un descuido que se pueda "arreglar" borrando una:
   *
   *   · `/api/modules` (module-registry.ts) devuelve EMOJIS: «🖼️», «🗃️», «🧱».
   *   · `kon.json` y el registro de admin devuelven NOMBRES de lucide:
   *     «Gamepad2», «FileText», «Tv».
   *
   * Los emojis son de los módulos del núcleo, escritos a mano; los nombres, de
   * los kons descubiertos del sistema de ficheros. La lista del admin mezcla
   * ambas fuentes, así que este componente tiene que entender las dos.
   *
   * ── LOS DOS FALLOS QUE ESTO CORRIGE ──────────────────────────────────────
   *
   * 1. Pintar todo como texto: los nombres de lucide salían como la palabra
   *    «Gamepad2» desbordando la tarjeta.
   * 2. Pintar todo como componente: los emojis no están en el mapa, así que
   *    caían al icono genérico y TODAS las tarjetas mostraban la misma caja.
   *
   * Los dos tenían el mismo aspecto de "así está diseñado".
   */
  import { ICONOS } from "$lib/iconos";
  import Package from "lucide-svelte/icons/package";

  const {
    name,
    size = 18,
    class: clase = "",
  }: { name?: string | null; size?: number; class?: string } = $props();

  const Icono = $derived(name ? ICONOS[name] : undefined);

  /**
   * ¿Es un emoji (o cualquier glifo) en vez de un nombre de componente?
   *
   * Un nombre de lucide es siempre un identificador en PascalCase. Lo que no
   * lo sea se pinta tal cual: así un emoji se ve como emoji, y un nombre mal
   * escrito se ve literalmente — que es feo, pero visible, y por tanto se
   * arregla. El icono genérico lo escondería.
   */
  const esGlifo = $derived(!!name && !Icono && !/^[A-Z][A-Za-z0-9]*$/.test(name));
</script>

{#if Icono}
  <Icono {size} class={clase} />
{:else if esGlifo}
  <span class={clase} style="font-size: {size}px; line-height: 1">{name}</span>
{:else}
  <Package {size} class={clase} />
{/if}
