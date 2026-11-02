<script lang="ts">
  import { t } from "$lib/i18n";
  /**
   * MediaPicker.svelte — elegir (o subir) una imagen de la biblioteca
   * ==========================================================================
   *
   * Esto vivía dentro de `BlogPostEditor.svelte`, un fichero de 2000 líneas.
   * Como consecuencia, la ÚNICA pantalla del admin desde la que se podía elegir
   * o subir una imagen era el editor de blog: el constructor de páginas pedía
   * las imágenes como una caja de texto para pegar una URL a mano, y el
   * formulario de datasets tenía su propia subida —rota— escrita aparte.
   *
   * Al sacarlo, cualquier kon con un campo de imagen hereda la biblioteca.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * LO QUE ESTE COMPONENTE NO HACE
   *
   * No decide qué se hace con la imagen elegida. Avisa con `onSelect` y ya:
   * uno la mete en el texto, otro la pone de portada, otro la guarda en un
   * campo. Meter aquí esa decisión es lo que lo ató al editor del blog.
   * ─────────────────────────────────────────────────────────────────────────
   */
  import { Image, Loader2, Plus, Search } from "lucide-svelte";

  import { api } from "$lib/api";
  import Modal from "$lib/components/ui/Modal.svelte";
  import { subirMedios } from "$lib/media/upload";
  import { urlDeMedio } from "$lib/states/media.svelte";

  export interface MedioElegido {
    id: string;
    url: string;
    filename: string;
    alt?: string;
  }

  interface Props {
    open: boolean;
    title?: string;
    /** Id del que ya está elegido, para marcarlo en la rejilla. */
    selectedId?: string | null;
    /**
     * Elegir VARIAS de una vez.
     *
     * ── POR QUE HACE FALTA ──────────────────────────────────────────────────
     *
     * El bloque «Image Gallery» pedía sus imágenes como un JSON a mano —una
     * caja de texto con `[]` dentro— porque este selector solo sabía devolver
     * una. Montar un carrusel obligaba a ir a la biblioteca, copiar cada URL y
     * pegarlas formando el array. Con la biblioteca aquí al lado.
     *
     * En este modo el modal NO se cierra al elegir: se van marcando y se sale
     * con «Listo». Cerrarse en cada clic es lo que convierte elegir ocho
     * imágenes en abrir ocho veces el selector.
     */
    multiple?: boolean;
    /** Los ya elegidos, para marcarlos. Solo en modo múltiple. */
    selectedIds?: string[];
    onSelect: (media: MedioElegido) => void;
    onClose: () => void;
  }

  const {
    open,
    title = t("mediaPicker.elegirImagen"),
    selectedId = null,
    multiple = false,
    selectedIds = [],
    onSelect,
    onClose,
  }: Props = $props();

  /** ¿Está ya elegida? Sirve para las dos formas de marcar. */
  function elegida(id: string): boolean {
    return multiple ? selectedIds.includes(id) : selectedId === id;
  }

  let medios = $state<MedioElegido[]>([]);
  let busqueda = $state("");
  let buscando = $state(false);
  let subiendo = $state(false);
  let error = $state<string | null>(null);
  let temporizador: ReturnType<typeof setTimeout> | null = null;

  /**
   * La biblioteca se carga al ABRIR, no al montar.
   *
   * Este componente se instancia junto al formulario que lo usa, y muchos
   * formularios no llegan a abrirlo nunca. Cargar en el montaje sería una
   * petición por cada campo de imagen de la pantalla.
   */
  $effect(() => {
    if (open) void cargar();
  });

  async function cargar() {
    buscando = true;
    try {
      /**
       * `type: "image"` porque la rejilla pinta cada elemento con un `<img>`:
       * un PDF o un vídeo salían como icono roto ocupando sitio.
       */
      const respuesta = await api.getMedia({
        limit: 50,
        type: "image",
        search: busqueda.trim() || undefined,
      });
      medios = (respuesta.docs || []) as MedioElegido[];
    } catch (err) {
      error = err instanceof Error ? err.message : t("mediaPicker.noSePudoCargarLa");
    } finally {
      buscando = false;
    }
  }

  /**
   * Se busca EN EL SERVIDOR, con retardo.
   *
   * Filtrar en el cliente solo miraría las 50 ya cargadas, así que una imagen
   * antigua no aparecería nunca por mucho que se escribiera su nombre — y eso
   * se lee como «esa imagen no existe».
   */
  function buscar(texto: string) {
    busqueda = texto;
    if (temporizador) clearTimeout(temporizador);
    temporizador = setTimeout(() => void cargar(), 250);
  }

  async function subir(ficheros: FileList | null) {
    if (!ficheros || ficheros.length === 0) return;

    subiendo = true;
    error = null;
    try {
      const { subidos, errores } = await subirMedios(ficheros);
      if (errores.length > 0) error = errores.join(" · ");

      if (subidos.length === 0) return;

      // Se eligen directamente los recién subidos: quien acaba de dar unos
      // ficheros no debería tener que volver a buscarlos en la rejilla.
      //
      // En modo múltiple entran TODOS. Quedarse con el primero —como hacía
      // antes— significa que arrastras ocho imágenes para montar un carrusel y
      // se añade una: el resto sí se sube a la biblioteca, pero no entra en el
      // bloque, y desde fuera parece que la subida falló a medias.
      if (multiple) {
        for (const medio of subidos) onSelect(medio);
      } else {
        onSelect(subidos[0]);
      }

      // La rejilla se recarga para que lo subido aparezca también ahí; si no,
      // quitar una imagen del bloque la dejaría sin forma de volver a elegirla
      // hasta recargar la pantalla.
      await cargar();
    } catch (err) {
      error = err instanceof Error ? err.message : t("mediaPicker.noSePudoSubir");
    } finally {
      subiendo = false;
    }
  }
</script>

<Modal {open} {title} {onClose}>
  <div class="p-4">
    <div class="mb-3 flex items-center gap-2">
      <div class="relative flex-1">
        <Search
          class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-kitsuden-subtle"
        />
        <input
          type="text"
          value={busqueda}
          oninput={(e) => buscar(e.currentTarget.value)}
          placeholder={t("mediaPicker.buscarPorNombreDeFichero")}
          class="input w-full pl-9"
        />
        {#if buscando}
          <Loader2
            class="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-kitsuden-subtle"
          />
        {/if}
      </div>

      <!--
        Subir desde aquí mismo. Es lo que hace que el selector sirva de algo en
        una instalación nueva: sin esto la biblioteca está vacía y la única
        salida es irse a otra pantalla y volver.
      -->
      <label
        class="btn-ghost btn-sm shrink-0 cursor-pointer gap-1.5 {subiendo
          ? 'pointer-events-none opacity-60'
          : ''}"
      >
        {#if subiendo}
          <Loader2 class="h-4 w-4 animate-spin" />
          {t("mediaPicker.subiendo")}
        {:else}
          <Plus class="h-4 w-4" />
          {t("mediaPicker.subir")}
        {/if}
        <input
          type="file"
          accept="image/*"
          multiple
          class="hidden"
          disabled={subiendo}
          onchange={(e) => {
            void subir(e.currentTarget.files);
            e.currentTarget.value = "";
          }}
        />
      </label>
    </div>

    {#if error}
      <p
        class="mb-3 rounded-lg border border-kitsuden-accent-2/40 bg-kitsuden-accent-2/10 px-3 py-2 text-xs text-kitsuden-accent-2"
      >
        {error}
      </p>
    {/if}

    {#if medios.length === 0}
      <div class="py-8 text-center">
        <Image class="mx-auto mb-3 h-12 w-12 text-kitsuden-subtle" />
        {#if busqueda.trim()}
          <!--
            Distinguir «no hay nada» de «no hay nada QUE COINCIDA» no es
            cosmético: con el mensaje de «sube imágenes primero» delante de una
            búsqueda sin resultados, cualquiera concluye que la biblioteca está
            vacía y se va a subir algo que ya tiene.
          -->
          <p class="text-kitsuden-subtle">{t("mediaPicker.ningunaImagenCoincideCon", { busqueda })}</p>
          <button
            class="mt-2 text-xs text-kitsuden-accent hover:underline"
            onclick={() => buscar("")}
          >
            {t("mediaPicker.verTodas")}
          </button>
        {:else}
          <p class="text-kitsuden-subtle">{t("mediaPicker.noHayImagenesTodavia")}</p>
          <p class="mt-1 text-xs text-kitsuden-subtle/60">
            {t("mediaPicker.usaSubirAquiArribaNo")}
          </p>
        {/if}
      </div>
    {:else}
      <div class="grid max-h-96 grid-cols-3 gap-3 overflow-y-auto">
        {#each medios as media (media.id)}
          <button
            onclick={() => onSelect(media)}
            class="relative aspect-square overflow-hidden rounded-lg border-2 transition-all {elegida(
              media.id
            )
              ? 'border-kitsuden-accent'
              : 'border-transparent hover:border-kitsuden-border'}"
          >
            <img
              src={urlDeMedio(media.url)}
              alt={media.alt || media.filename}
              class="h-full w-full object-cover"
            />
            {#if multiple && elegida(media.id)}
              <!--
                La marca importa más en múltiple: sin ella, tras elegir cinco no
                hay forma de saber cuáles llevas sin cerrar y volver a mirar.
              -->
              <span
                class="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-kitsuden-accent text-[10px] font-bold text-black"
              >
                {selectedIds.indexOf(media.id) + 1}
              </span>
            {/if}
          </button>
        {/each}
      </div>
    {/if}

    {#if multiple}
      <div class="mt-4 flex items-center justify-between border-t border-kitsuden-border pt-3">
        <span class="text-xs text-kitsuden-subtle">
          {selectedIds.length}
          {selectedIds.length === 1 ? t("mediaPicker.imagenElegida") : t("mediaPicker.imagenesElegidas")}
        </span>
        <button class="btn-primary btn-sm" onclick={onClose}>{t("mediaPicker.listo")}</button>
      </div>
    {/if}
  </div>
</Modal>
