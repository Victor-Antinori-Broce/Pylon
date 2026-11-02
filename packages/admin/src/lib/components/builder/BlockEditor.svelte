<script lang="ts">
  import { t } from "$lib/i18n";
  /**
   * BlockEditor.svelte — Edit form for a single block's data
   */
  import {
    X,
    Trash2,
    Check,
    Sparkles,
    FileText,
    Images,
    Map,
    Tv,
    Code2,
    AlertTriangle,
    Minus,
    Clapperboard,
    SlidersHorizontal,
    Columns,
    Table2,
    Image as ImageIcon,
  } from "lucide-svelte";

  import MediaPicker from "$lib/components/media/MediaPicker.svelte";

  import { untrack } from "svelte";

  import { getBlockDef, type BlockFieldDef, type PageBlock } from "../../../types/blocks";

  interface Props {
    block: PageBlock;
    onUpdate?: (block: PageBlock) => void;
    onDelete?: () => void;
    onClose?: () => void;
  }

  const { block, onUpdate, onDelete, onClose }: Props = $props();

  /**
   * Qué campo está esperando una imagen. `null` = el selector está cerrado.
   *
   * Se guarda la CLAVE y no un booleano porque un bloque puede tener varios
   * campos de imagen (fondo, logo, portada); con un booleano, la elegida iría
   * siempre al primero.
   */
  let campoEligiendo = $state<string | null>(null);

  /**
   * Opciones de los campos `remote-select`, por clave de campo.
   *
   * `undefined` = todavía no se ha pedido; `[]` = se pidió y no hay ninguna.
   * La distinción importa: con las dos como lista vacía, «cargando» y «no hay
   * ninguna tier list creada» se ven igual, y el segundo caso manda a buscar
   * una avería en vez de a crear la primera.
   */
  let opcionesRemotas = $state<Record<string, { value: string; label: string }[]>>({});
  let fallosRemotos = $state<Record<string, string>>({});

  /**
   * Pide las opciones de un campo remoto UNA vez.
   *
   * Se lanza desde el marcado (`{#await}` no encaja: el campo se repinta en
   * cada tecleo de otro campo y volvería a pedirlas). El centinela de
   * `opcionesRemotas` es lo que evita la tormenta de peticiones.
   */
  /**
   * Pide las opciones de los campos remotos del bloque abierto.
   *
   * ── POR QUE `untrack` ────────────────────────────────────────────────────
   *
   * En Svelte 5 todo lo que se LEE dentro de un efecto pasa a ser dependencia
   * suya, incluido lo que leen las funciones que llama. `cargarOpciones` lee
   * `opcionesRemotas` para no repetir la petición… y también lo ESCRIBE. Sin
   * aislar la llamada, cargar provocaría cargar.
   *
   * Es el mismo fallo que ya apareció cuatro veces en este panel, y tiene
   * guardián: `efectos-que-se-realimentan.test.ts`.
   */
  $effect(() => {
    const campos = blockDef?.fields ?? [];
    untrack(() => {
      for (const campo of campos) {
        if (campo.type === "remote-select" && campo.source) {
          void cargarOpciones(campo.key, campo.source);
        }
      }
    });
  });

  async function cargarOpciones(clave: string, fuente: NonNullable<BlockFieldDef["source"]>) {
    if (opcionesRemotas[clave] !== undefined) return;
    // Se marca ANTES de esperar: sin esto, dos repintados seguidos lanzan dos
    // peticiones porque ninguna ha terminado cuando llega la segunda.
    opcionesRemotas = { ...opcionesRemotas, [clave]: [] };

    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL ?? ""}/api${fuente.endpoint}`, { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const cuerpo = await res.json();
      const lista = (cuerpo?.[fuente.listKey] ?? []) as Record<string, unknown>[];

      opcionesRemotas = {
        ...opcionesRemotas,
        [clave]: lista.map((x) => ({
          value: String(x[fuente.valueKey] ?? ""),
          label: String(x[fuente.labelKey] ?? x[fuente.valueKey] ?? ""),
        })),
      };
    } catch (err) {
      /**
       * Que el kon que aporta las opciones esté apagado es una configuración
       * válida, no una avería. Se dice en el propio campo en vez de dejar un
       * desplegable vacío sin explicación.
       */
      fallosRemotos = {
        ...fallosRemotos,
        [clave]: err instanceof Error ? err.message : "no se pudieron cargar",
      };
    }
  }

  /**
   * Campo de galería que tiene el selector múltiple abierto.
   *
   * Se separa de `campoEligiendo` porque los dos abren el MISMO componente con
   * contratos distintos: uno devuelve una imagen y cierra, el otro va sumando
   * y no cierra. Con una sola variable habría que preguntar el tipo del campo
   * en cada manejador, y ese es el tipo de bifurcación que acaba resolviendo
   * mal uno de los dos casos.
   */
  let galeriaEligiendo = $state<string | null>(null);

  interface ImagenDeGaleria {
    url: string;
    alt?: string;
    caption?: string;
    /** Id en la biblioteca, si vino de ahí. Sirve para marcarla en el selector. */
    mediaId?: string;
  }

  /** Las imágenes de un campo de galería, tolerando lo que haya guardado. */
  function imagenesDe(key: string): ImagenDeGaleria[] {
    const v = block.data[key];
    return Array.isArray(v) ? (v as ImagenDeGaleria[]) : [];
  }

  function actualizarImagenes(key: string, imagenes: ImagenDeGaleria[]) {
    updateField(key, imagenes);
  }

  function quitarImagen(key: string, i: number) {
    actualizarImagenes(
      key,
      imagenesDe(key).filter((_, j) => j !== i)
    );
  }

  /** Mueve una imagen una posición. En un carrusel el orden ES el contenido. */
  function moverImagen(key: string, i: number, delta: number) {
    const imagenes = [...imagenesDe(key)];
    const destino = i + delta;
    if (destino < 0 || destino >= imagenes.length) return;
    [imagenes[i], imagenes[destino]] = [imagenes[destino], imagenes[i]];
    actualizarImagenes(key, imagenes);
  }

  function editarImagen(key: string, i: number, campo: "alt" | "caption", valor: string) {
    const imagenes = [...imagenesDe(key)];
    imagenes[i] = { ...imagenes[i], [campo]: valor };
    actualizarImagenes(key, imagenes);
  }

  /**
   * Alterna una imagen de la biblioteca en la galería.
   *
   * Alternar y no solo añadir: en el selector múltiple se marca lo elegido, y
   * si volver a pulsar no lo quitara, un clic de más obligaría a cerrar y
   * buscar la miniatura para borrarla.
   */
  function alternarEnGaleria(key: string, media: { id: string; url: string; alt?: string }) {
    const imagenes = imagenesDe(key);
    const i = imagenes.findIndex((img) => img.mediaId === media.id || img.url === media.url);

    if (i >= 0) {
      quitarImagen(key, i);
      return;
    }

    actualizarImagenes(key, [
      ...imagenes,
      { url: media.url, alt: media.alt ?? "", mediaId: media.id },
    ]);
  }

  const iconMap: Record<string, typeof Sparkles> = {
    Sparkles,
    FileText,
    Images,
    Map,
    Tv,
    Code2,
    AlertTriangle,
    Minus,
    Clapperboard,
    SlidersHorizontal,
    Columns,
    Table2,
  };

  const blockDef = $derived(getBlockDef(block.type));
  const jsonErrors: Record<string, string> = $state({});

  function updateField(key: string, value: any) {
    const updated = { ...block, data: { ...block.data, [key]: value } };
    onUpdate?.(updated);
  }

  function updateJsonField(key: string, raw: string) {
    try {
      const parsed = JSON.parse(raw);
      updateField(key, parsed);
      delete jsonErrors[key];
    } catch {
      jsonErrors[key] = t("blockEditor.invalidJson");
    }
  }

  function jsonStringify(val: any): string {
    if (val === undefined || val === null) return "";
    if (typeof val === "string") return val;
    return JSON.stringify(val, null, 2);
  }

  function getIcon(iconName: string): typeof Sparkles {
    return iconMap[iconName] || FileText;
  }
</script>

<div class="h-full flex flex-col">
  <!-- Header -->
  <div class="p-4 border-b border-kitsuden-border shrink-0">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-3">
        {#if blockDef}
          {@const BI = getIcon(blockDef.icon)}
          <div
            class="w-8 h-8 rounded-lg flex items-center justify-center"
            style="background: {blockDef.color}15; border: 1px solid {blockDef.color}25"
          >
            <BI class="w-4 h-4" style="color: {blockDef.color}" />
          </div>
        {/if}
        <div>
          <h3 class="text-sm font-semibold text-kitsuden-text">{blockDef?.label || t("blockEditor.block")}</h3>
          <p class="text-[10px] text-kitsuden-subtle font-mono">{block.type}</p>
        </div>
      </div>
      <button onclick={onClose} class="btn-icon p-1"><X class="w-4 h-4" /></button>
    </div>
  </div>

  <!-- Fields -->
  <div class="flex-1 overflow-y-auto p-4 space-y-4">
    {#each blockDef?.fields || [] as field}
      <div class="space-y-1.5">
        <!-- Text -->
        {#if field.type === "text"}
          <label class="label block"
            >{field.label}
            {#if field.required}<span class="text-kitsuden-accent-2">*</span>{/if}</label
          >
          <input
            value={block.data[field.key] || ""}
            oninput={(e) => updateField(field.key, e.currentTarget.value)}
            type="text"
            placeholder={field.placeholder}
            class="input"
          />
        {/if}

        <!-- Textarea -->
        {#if field.type === "textarea"}
          <label class="label block"
            >{field.label}
            {#if field.required}<span class="text-kitsuden-accent-2">*</span>{/if}</label
          >
          <textarea
            value={block.data[field.key] || ""}
            oninput={(e) => updateField(field.key, e.currentTarget.value)}
            placeholder={field.placeholder}
            rows="4"
            class="textarea"
          ></textarea>
        {/if}

        <!-- URL / Image -->
        {#if field.type === "url" || field.type === "image"}
          <label class="label block"
            >{field.label}
            {#if field.required}<span class="text-kitsuden-accent-2">*</span>{/if}</label
          >
          <div class="flex items-center gap-2">
            <input
              value={block.data[field.key] || ""}
              oninput={(e) => updateField(field.key, e.currentTarget.value)}
              type="url"
              placeholder={field.placeholder || "https://"}
              class="input flex-1"
            />
            <!--
              ── EL BOTÓN QUE FALTABA ────────────────────────────────────────

              Un campo de imagen era una caja de texto donde pegar una URL a
              mano. Para poner una imagen propia en un bloque había que irse a
              la biblioteca, copiar la URL, volver y pegarla — y la mitad de las
              veces se acababa enlazando una imagen de otra web.

              El campo de texto se conserva: enlazar una imagen externa sigue
              siendo legítimo, y quitarlo habría roto los bloques ya guardados.
            -->
            {#if field.type === "image"}
              <button
                type="button"
                class="btn-ghost btn-sm shrink-0 gap-1.5"
                onclick={() => (campoEligiendo = field.key)}
                title={t("blockEditor.elegirDeLaBibliotecaO")}
              >
                <ImageIcon class="h-4 w-4" />
                {t("blockEditor.biblioteca")}
              </button>
            {/if}
          </div>
          {#if field.type === "image" && block.data[field.key]}
            <div class="mt-2 rounded-lg border border-kitsuden-border overflow-hidden">
              <img src={block.data[field.key]} class="w-full h-32 object-cover" alt="" />
            </div>
          {/if}
        {/if}

        <!-- Select -->
        {#if field.type === "select"}
          <label class="label block"
            >{field.label}
            {#if field.required}<span class="text-kitsuden-accent-2">*</span>{/if}</label
          >
          <select
            value={block.data[field.key] || ""}
            onchange={(e) => updateField(field.key, e.currentTarget.value)}
            class="select"
          >
            {#each field.options || [] as opt}
              <option value={opt.value}>{opt.label}</option>
            {/each}
          </select>
        {/if}

        <!-- Number -->
        <!--
          ── Desplegable con opciones de la API ──────────────────────────────

          El campo pedia el slug a mano (`placeholder: "meta-5-4"`). Escribirlo
          mal no da ningun error: la pagina se guarda y sale sin la tier list.
        -->
        {#if field.type === "remote-select"}
          <label class="label block"
            >{field.label}
            {#if field.required}<span class="text-kitsuden-accent-2">*</span>{/if}</label
          >
          {#if field.source}
            <select
              value={block.data[field.key] || ""}
              onchange={(e) => updateField(field.key, e.currentTarget.value)}
              class="select"
            >
              <option value="">{t("blockEditor.elige")}</option>
              {#each opcionesRemotas[field.key] || [] as opt}
                <option value={opt.value}>{opt.label}</option>
              {/each}
            </select>

            {#if fallosRemotos[field.key]}
              <p class="text-xs text-kitsuden-accent-2 mt-1">
                {t("blockEditor.noSePudieronCargarLas", { v: fallosRemotos[field.key] })}
              </p>
            {:else if opcionesRemotas[field.key]?.length === 0}
              <p class="text-xs text-kitsuden-text-dim mt-1">
                {t("blockEditor.todaviaNoHayNingunaCreada")}
              </p>
            {/if}
          {/if}
        {/if}

        <!-- Number -->
        {#if field.type === "number"}
          <label class="label block"
            >{field.label}
            {#if field.required}<span class="text-kitsuden-accent-2">*</span>{/if}</label
          >
          <input
            value={block.data[field.key] || ""}
            oninput={(e) => updateField(field.key, Number(e.currentTarget.value))}
            type="number"
            class="input"
          />
        {/if}

        <!-- Boolean -->
        {#if field.type === "boolean"}
          <div class="flex items-center justify-between py-1">
            <label class="text-sm text-kitsuden-text">{field.label}</label>
            <button
              type="button"
              onclick={() => updateField(field.key, !block.data[field.key])}
              class="relative w-10 h-6 rounded-full transition-colors {block.data[field.key]
                ? 'bg-kitsuden-accent'
                : 'bg-kitsuden-border'}"
            >
              <span
                class="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform {block
                  .data[field.key]
                  ? 'translate-x-[18px]'
                  : 'translate-x-[2px]'}"
              ></span>
            </button>
          </div>
        {/if}

        <!--
          ── GALERÍA ────────────────────────────────────────────────────────

          Antes esto era el campo `json`: una caja de texto con `[]` dentro
          donde había que escribir a mano el array de imágenes, con la
          biblioteca de medios a un clic de distancia. Montar un carrusel
          significaba ir a la biblioteca, copiar cada URL y componer el JSON.

          Ahora se eligen (o se suben) desde el mismo selector que el resto del
          panel, así que todo lo que entra queda TAMBIÉN en la biblioteca y se
          puede reutilizar en otro bloque.
        -->
        {#if field.type === "gallery"}
          {@const imagenes = imagenesDe(field.key)}
          <!--
            `span` y no `label`: una galería no tiene UN control al que apuntar
            —tiene un alt y un pie por imagen, más los botones de orden—, así que
            un `label` aquí no asocia nada y solo engaña al lector de pantalla.
          -->
          <span class="label block">
            {field.label}
            {#if field.required}<span class="text-kitsuden-accent-2">*</span>{/if}
          </span>

          {#if imagenes.length === 0}
            <p class="text-xs text-kitsuden-subtle italic">{t("blockEditor.sinImagenesTodavia")}</p>
          {:else}
            <div class="space-y-2">
              {#each imagenes as img, i (img.mediaId ?? img.url ?? i)}
                <div
                  class="flex gap-2 rounded-lg border border-kitsuden-border bg-kitsuden-bg/40 p-2"
                >
                  <img
                    src={img.url}
                    alt={img.alt || ""}
                    class="h-16 w-16 shrink-0 rounded object-cover"
                  />
                  <div class="min-w-0 flex-1 space-y-1">
                    <input
                      value={img.alt ?? ""}
                      oninput={(e) => editarImagen(field.key, i, "alt", e.currentTarget.value)}
                      placeholder={t("blockEditor.textoAlternativoAccesibilidadYSeo")}
                      class="input w-full text-xs"
                    />
                    <input
                      value={img.caption ?? ""}
                      oninput={(e) => editarImagen(field.key, i, "caption", e.currentTarget.value)}
                      placeholder={t("blockEditor.pieDeFotoOpcional")}
                      class="input w-full text-xs"
                    />
                  </div>
                  <div class="flex shrink-0 flex-col gap-1">
                    <!-- El orden ES el contenido en un carrusel. -->
                    <button
                      type="button"
                      class="btn-ghost px-1.5 py-0.5 text-xs disabled:opacity-30"
                      disabled={i === 0}
                      onclick={() => moverImagen(field.key, i, -1)}
                      title={t("blockEditor.subir")}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      class="btn-ghost px-1.5 py-0.5 text-xs disabled:opacity-30"
                      disabled={i === imagenes.length - 1}
                      onclick={() => moverImagen(field.key, i, 1)}
                      title={t("blockEditor.bajar")}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      class="btn-ghost px-1.5 py-0.5 text-xs text-kitsuden-accent-2"
                      onclick={() => quitarImagen(field.key, i)}
                      title={t("blockEditor.quitar")}
                    >
                      <Trash2 class="h-3 w-3" />
                    </button>
                  </div>
                </div>
              {/each}
            </div>
          {/if}

          <button
            type="button"
            class="btn-ghost btn-sm mt-2 w-full gap-1.5 text-xs"
            onclick={() => (galeriaEligiendo = field.key)}
          >
            <ImageIcon class="h-3.5 w-3.5" />
            {imagenes.length === 0 ? t("blockEditor.elegirOSubirImagenes") : t("blockEditor.anadirMas")}
          </button>
        {/if}

        <!-- JSON -->
        {#if field.type === "json"}
          <label class="label block"
            >{field.label}
            {#if field.required}<span class="text-kitsuden-accent-2">*</span>{/if}</label
          >
          <textarea
            value={jsonStringify(block.data[field.key])}
            oninput={(e) => updateJsonField(field.key, e.currentTarget.value)}
            rows="5"
            placeholder={field.helpText}
            class="textarea font-mono text-xs"
          ></textarea>
          {#if jsonErrors[field.key]}<p class="text-[10px] text-kitsuden-accent-2">
              {jsonErrors[field.key]}
            </p>{/if}
        {/if}

        <!-- Help text -->
        {#if field.helpText && field.type !== "json"}
          <p class="text-[10px] text-kitsuden-subtle">{field.helpText}</p>
        {/if}
      </div>
    {/each}
  </div>

  <!-- Footer -->
  <div class="p-4 border-t border-kitsuden-border shrink-0 flex items-center justify-between">
    <button
      onclick={onDelete}
      class="btn-ghost btn-sm text-kitsuden-accent-2 hover:bg-kitsuden-accent-2/10"
      ><Trash2 class="w-3.5 h-3.5" /> {t("blockEditor.remove")}</button
    >
    <button onclick={onClose} class="btn-primary btn-sm"><Check class="w-3.5 h-3.5" /> {t("blockEditor.done")}</button>
  </div>
</div>

<MediaPicker
  open={campoEligiendo !== null}
  title={t("blockEditor.elegirImagenDelBloque")}
  onSelect={(media) => {
    if (campoEligiendo) updateField(campoEligiendo, media.url);
    campoEligiendo = null;
  }}
  onClose={() => (campoEligiendo = null)}
/>

<!--
  El MISMO componente en modo múltiple. Sube a la biblioteca igual, así que lo
  que se arrastre aquí queda disponible para cualquier otro bloque o post — que
  es lo que diferencia esto de pegar URLs sueltas.
-->
<MediaPicker
  open={galeriaEligiendo !== null}
  multiple
  title={t("blockEditor.imagenesDeLaGaleria")}
  selectedIds={galeriaEligiendo
    ? imagenesDe(galeriaEligiendo)
        .map((img) => img.mediaId)
        .filter((id): id is string => !!id)
    : []}
  onSelect={(media) => {
    if (galeriaEligiendo) alternarEnGaleria(galeriaEligiendo, media);
  }}
  onClose={() => (galeriaEligiendo = null)}
/>
