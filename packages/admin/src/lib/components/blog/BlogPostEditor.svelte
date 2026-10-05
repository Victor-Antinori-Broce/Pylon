<script lang="ts">
  /**
   * BlogPostEditor.svelte — Complete Blog Post Editor with SEO
   *
   * Features:
   * ✓ Rich Text Editor (MDX)
   * ✓ SEO Panel (meta title, description, OG tags, robots)
   * ✓ Featured Image Selector
   * ✓ Tags Management
   * ✓ Scheduling (datepicker)
   * ✓ Author Selector
   * ✓ Google/Social Preview
   */
  import {
    ArrowLeft,
    Save,
    FileText,
    Trash2,
    Eye,
    EyeOff,
    Calendar,
    Clock,
    User,
    Tag,
    Image,
    Settings,
    Search,
    Share2,
    CheckCircle2,
    X,
    Plus,
    Loader2,
    Database,
    LayoutGrid,
    FolderTree,
    Gamepad2,
    History,
    AlertTriangle,
    Users,
  } from "lucide-svelte";
  import { onMount, onDestroy, untrack } from "svelte";

  import MdxEditor from "$lib/components/editor/MdxEditor.svelte";
  import PageBuilder from "$lib/components/builder/PageBuilder.svelte";
  import type { PageBlock } from "$types/blocks";

  import { api } from "$lib/api";
  import PromoteFromDataset from "$lib/components/blog/PromoteFromDataset.svelte";
  import SlashCommandEditor from "$lib/components/editor/SlashCommandEditor.svelte";
  import LivePreview from "$lib/components/LivePreview.svelte";
  import SplitPane from "$lib/components/SplitPane.svelte";
  import MediaPicker from "$lib/components/media/MediaPicker.svelte";
  import { subirMedios } from "$lib/media/upload";
  import Modal from "$lib/components/ui/Modal.svelte";
  import AutoSaveIndicator from "$lib/components/admin/AutoSaveIndicator.svelte";
  import { autosaveStore } from "$lib/states/autosave.svelte";
  import type { ApiError, BlogCategory } from "$lib/api";

  import { goto } from "$app/navigation";

  // ─── Props ──────────────────────────────────────────
  interface Props {
    postId?: string | null;
  }

  const { postId = null }: Props = $props();

  // ─── State ──────────────────────────────────────────
  let loading = $state(true);
  let saving = $state(false);
  let error = $state<string | null>(null);
  let activeTab = $state<"content" | "blocks" | "seo" | "settings">("content");

  /**
   * Cómo se escribe el contenido. UN campo, dos formas de escribirlo.
   *
   * ── POR QUÉ NO SON DOS EDITORES ──────────────────────────────────────────
   *
   * Habia TRES componentes de edicion en el repo y dos pantallas distintas:
   *
   *   · `SlashCommandEditor` — area de texto con menu de barra. Lo usaba este
   *     editor, que es el unico que sabia guardar.
   *   · `MdxEditor` — markdown con vista previa en vivo. Vivia en `EditorView`,
   *     una pantalla aparte cuyo boton «Save Draft» NO tenia `onclick`: se podia
   *     escribir y no se guardaba nada.
   *   · `PageBuilder` — bloques. En otra pantalla mas.
   *
   * Los dos primeros emiten exactamente lo mismo —una cadena de markdown— asi
   * que no eran dos editores: eran dos interfaces sobre el mismo campo,
   * separadas por accidente. Aqui conviven como modos, y cambiar de uno a otro
   * no pierde nada porque el dato es el mismo.
   *
   * Los bloques SI son otro campo (`blocks`, jsonb) y por eso tienen pestaña
   * propia, no modo.
   */
  let modoContenido = $state<"markdown" | "rapido">("markdown");
  let showMediaModal = $state(false);

  /**
   * Para qué se abrió la biblioteca de medios.
   *
   * El mismo modal sirve para la imagen de PORTADA y para insertar una en el
   * TEXTO. Sin esta distinción, elegir una imagen para el cuerpo del artículo
   * cambiaría la portada del post — y al revés.
   */
  let destinoDeLaImagen = $state<"portada" | "contenido">("portada");

  /**
   * Los dos editores exponen `insertarImagen`. La referencia hace falta porque
   * la posición del cursor vive dentro de cada uno: el contenedor sabe QUÉ
   * imagen, el editor sabe DÓNDE.
   */
  let editorMarkdown = $state<{ insertarImagen: (url: string, alt?: string) => void } | null>(null);
  let editorRapido = $state<{
    insertarImagen: (url: string, alt?: string) => void;
    recordarPosicion: () => void;
  } | null>(null);

  /** Texto de búsqueda del selector de medios. */
  let busquedaMedios = $state("");
  let buscandoMedios = $state(false);
  let temporizadorBusqueda: ReturnType<typeof setTimeout> | null = null;
  let subiendoImagen = $state(false);
  let errorDeSubida = $state<string | null>(null);
  let showTagModal = $state(false);
  let showDatasetModal = $state(false);
  let availableTags = $state<Array<{ id: string; name: string; slug: string }>>([]);
  let availableAuthors = $state<Array<{ id: string; name: string; email: string; image?: string }>>(
    []
  );
  let mediaList = $state<Array<{ id: string; url: string; filename: string; alt?: string }>>([]);
  let newTagName = $state("");
  let showPreview = $state(false);

  // Post data
  let title = $state("");
  let slug = $state("");
  let content = $state("");
  let excerpt = $state("");
  let status = $state<"draft" | "published" | "scheduled" | "archived">("draft");
  /** El hilo de comentarios de este artículo. Abierto por defecto, como en WordPress. */
  let commentsEnabled = $state(true);

  /**
   * ── IDIOMA Y GRUPO DE TRADUCCIONES ────────────────────────────────────────
   *
   * Una entrada por idioma, atadas por `translationGroupId`: el modelo de
   * YouTube. Para traducir un articulo se crea OTRO articulo, se le pone su
   * idioma y se pega aqui el grupo del original.
   *
   * El grupo se ensena como texto y no como desplegable a proposito: la lista
   * de articulos traducibles puede ser de miles, y el caso real es «acabo de
   * copiar el enlace del original». El boton de al lado lo rellena con el
   * grupo del articulo que se esta editando.
   */
  let locale = $state("es");
  let translationGroupId = $state("");
  const IDIOMAS_DEL_PANEL = [
    { codigo: "es", nombre: "Espanol" },
    { codigo: "en", nombre: "Ingles" },
    { codigo: "pt", nombre: "Portugues" },
  ];
  /**
   * Con qué plantilla se pinta en la web.
   *
   * `tips` es la lista numerada con índice lateral pegajoso: cada H2 del
   * contenido se convierte en un paso del índice. Para «12 consejos para
   * empezar» y demás listas; para lo demás, `article`.
   */
  let layout = $state<"article" | "tips">("article");
  let publishedAt = $state<string>("");
  let authorId = $state<string>("");
  let featuredImageId = $state<string>("");
  let featuredImageUrl = $state<string>("");
  let tags = $state<Array<{ id: string; name: string; slug: string }>>([]);
  /** Categorias del post (ids). El catalogo completo esta en `categoriasDisponibles`. */
  let categoryIds = $state<string[]>([]);

  /**
   * Los juegos de los que trata la entrada.
   *
   * La API aceptaba `gameIds` desde el principio y la tabla puente existía,
   * pero el panel no los enseñaba: atar una entrada a su juego solo se podía
   * con una llamada a mano. De esa relación sale la insignia que la portada
   * pone sobre la tarjeta, así que sin esto no habría forma de que saliera.
   */
  let gameIds = $state<string[]>([]);
  let juegosDisponibles = $state<Array<{ id: string; title: string }>>([]);
  let categoriasDisponibles = $state<BlogCategory[]>([]);
  let showCategoryModal = $state(false);
  let nuevaCategoria = $state({ name: "", parentId: "" });

  /**
   * Marca de version con la que se abrio el post.
   *
   * Viaja en cada guardado como `expectedUpdatedAt` y es lo que permite a la
   * API detectar que otra persona guardo mientras tanto. Se refresca despues de
   * cada guardado propio, porque a partir de ahi la version buena es la nuestra.
   */
  let versionCargada = $state<string | null>(null);

  /** Aviso de edicion simultanea (409). Se separa de `error` porque no es un fallo. */
  let conflicto = $state<{ mensaje: string; cuando: string | null } | null>(null);

  /** Borrador local encontrado al abrir, a la espera de que se decida. */
  let borradorPendiente = $state<{ cuando: number; datos: Record<string, any> } | null>(null);
  /** Bloques del post. Columna `blocks` (jsonb); la API los acepta al crear y al editar. */
  let blocks = $state<PageBlock[]>([]);
  let seoOverrides = $state({
    metaTitle: "",
    metaDescription: "",
    ogTitle: "",
    ogDescription: "",
    ogImageId: "",
    canonicalUrl: "",
    robotsIndex: true,
    robotsFollow: true,
    structuredData: {} as any,
    /**
     * Los grupos de la comunidad que anuncia ESTA entrada (tarjetas «Unirme
     * al grupo» al final del artículo). Viven aquí y no en columna propia:
     * `seo_overrides` es el único jsonb libre de la tabla y la API guarda sus
     * claves tal cual, así que no hace falta migración. Vacío = el de la web.
     */
    facebookGroupUrl: "",
    whatsappGroupUrl: "",
  });

  /**
   * Los grupos llegan como null de la API (se guardan así cuando están vacíos)
   * y el formulario trabaja con texto: sin esto, un post guardado sin grupo
   * rompería el editor al llamar a .trim() sobre null.
   */
  function conGruposEnTexto<T extends { facebookGroupUrl?: unknown; whatsappGroupUrl?: unknown }>(s: T) {
    return {
      ...s,
      facebookGroupUrl: typeof s.facebookGroupUrl === "string" ? s.facebookGroupUrl : "",
      whatsappGroupUrl: typeof s.whatsappGroupUrl === "string" ? s.whatsappGroupUrl : "",
    };
  }

  /** Las mismas reglas que aplica la web: lo que no pase, no se enseña */
  const enlaceDeFacebookValido = (u: string) =>
    /^https:\/\/(?:www\.|m\.|web\.)?facebook\.com\/[^\s"'<>]+$/i.test(u.trim());
  const enlaceDeWhatsappValido = (u: string) => /^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]{10,40}\/?$/.test(u.trim());

  // ─── Derived state ─────────────────────────────────
  const isScheduled = $derived(status === "scheduled");
  const isPublished = $derived(status === "published");
  const metaTitlePreview = $derived(seoOverrides.metaTitle || title);
  const metaDescPreview = $derived(seoOverrides.metaDescription || excerpt);
  const seoScore = $derived(calculateSeoScore());

  function calculateSeoScore(): number {
    let score = 0;
    let max = 0;

    // Title checks (20 points)
    max += 20;
    if (title.length >= 30 && title.length <= 60) score += 20;
    else if (title.length > 0) score += 10;

    // Slug (10 points)
    max += 10;
    if (slug.length > 0) score += 10;

    // Content (20 points)
    max += 20;
    if (content.length > 300) score += 20;
    else if (content.length > 0) score += 10;

    // Excerpt (10 points)
    max += 10;
    if (excerpt.length >= 120 && excerpt.length <= 160) score += 10;
    else if (excerpt.length > 0) score += 5;

    // SEO overrides (20 points)
    max += 20;
    if (seoOverrides.metaTitle) score += 10;
    if (seoOverrides.metaDescription) score += 10;

    // Featured image (10 points)
    max += 10;
    if (featuredImageId) score += 10;

    // Tags (10 points)
    max += 10;
    if (tags.length > 0) score += Math.min(tags.length * 2, 10);

    return Math.round((score / max) * 100);
  }

  // ─── Autoguardado local ─────────────────────────────
  //
  // ── QUE RESUELVE, Y QUE NO ────────────────────────────────────────────────
  //
  // Cerrar la pestana a media entrada perdia TODO lo escrito. No habia copia en
  // ninguna parte: ni borrador local, ni historial de versiones en la base.
  //
  // Esto es lo primero, no lo segundo: guarda en `localStorage` del navegador
  // cada pocos segundos y ofrece recuperar al volver a abrir. NO es un
  // historial de versiones del post —eso vive en el servidor y es otra cosa— ni
  // sirve para recuperar desde otro ordenador.
  //
  // El `autosaveStore` ya existia en el repo, completo, usado solo por
  // `AutoFormModal`. Esto lo enchufa; no reimplementa nada.

  /** Clave del borrador. Un post nuevo y uno existente no comparten cajon. */
  const claveBorrador = `blog_${postId ?? "nuevo"}`;

  /**
   * Lo que se guarda. Todo lo que el editor puede cambiar y nada mas: si
   * entrara aqui algo derivado (el `seoScore`, por ejemplo) cada recalculo
   * marcaria el borrador como sucio sin que nadie haya escrito una letra.
   */
  function instantanea(): Record<string, any> {
    return {
      title,
      slug,
      content,
      blocks,
      excerpt,
      status,
      layout,
      publishedAt,
      authorId,
      featuredImageId,
      featuredImageUrl,
      tags,
      categoryIds,
      gameIds,
      seoOverrides,
    };
  }

  function aplicarInstantanea(d: Record<string, any>) {
    title = d.title ?? "";
    slug = d.slug ?? "";
    content = d.content ?? "";
    blocks = Array.isArray(d.blocks) ? d.blocks : [];
    excerpt = d.excerpt ?? "";
    status = d.status ?? "draft";
    layout = d.layout === "tips" ? "tips" : "article";
    publishedAt = d.publishedAt ?? "";
    authorId = d.authorId ?? "";
    featuredImageId = d.featuredImageId ?? "";
    featuredImageUrl = d.featuredImageUrl ?? "";
    tags = Array.isArray(d.tags) ? d.tags : [];
    categoryIds = Array.isArray(d.categoryIds) ? d.categoryIds : [];
    gameIds = Array.isArray(d.gameIds) ? d.gameIds : [];
    if (d.seoOverrides) seoOverrides = conGruposEnTexto({ ...seoOverrides, ...d.seoOverrides });
  }

  /**
   * Cada cambio alimenta al store.
   *
   * `untrack` alrededor de `updateData` NO es adorno: el store es reactivo
   * (`status` es `$state`) y escribirlo dentro de un `$effect` que tambien lo
   * leyera crearia un bucle de realimentacion. Ya paso una vez en este mismo
   * panel, con el selector de vistas del explorador, y el sintoma —la interfaz
   * peleandose con quien la usa— no se parece en nada a la causa.
   */
  $effect(() => {
    const datos = instantanea();
    if (!autosaveStore.currentKey) return;
    untrack(() => autosaveStore.updateData(datos));
  });

  /**
   * Restaurar una version desde el historial tiene que MOVER el formulario.
   *
   * `AutoSaveIndicator` despliega `VersionHistory`, y su boton «Restore» llama a
   * `restoreVersion`, que deja los datos en `autosaveStore.restoredData` y ya
   * esta: el store no sabe pintar nada. Sin este efecto el boton existe, se
   * pulsa, no da error — y no pasa NADA. Es el mismo patron que tenia el editor
   * de bloques antes de conectarlo: codigo completo y desenchufado.
   *
   * Se limpia `restoredData` despues para que no se vuelva a aplicar solo.
   */
  $effect(() => {
    const recuperado = autosaveStore.restoredData;
    if (!recuperado) return;
    untrack(() => {
      aplicarInstantanea(recuperado);
      autosaveStore.restoredData = null;
    });
  });

  // El borrador SOBREVIVE al cerrar: se para el reloj, no se borra. Borrarlo
  // aqui haria que salir de la pantalla destruyese justo lo que esto protege.
  onDestroy(() => autosaveStore.stopAutosave());

  function recuperarBorrador() {
    if (!borradorPendiente) return;
    aplicarInstantanea(borradorPendiente.datos);
    borradorPendiente = null;
  }

  function descartarBorrador() {
    autosaveStore.deleteAllVersions(claveBorrador);
    borradorPendiente = null;
    autosaveStore.startAutosave(claveBorrador, instantanea());
  }

  // ─── Lifecycle ──────────────────────────────────────
  onMount(async () => {
    try {
      // Sin `loadMedia()`: la biblioteca ya no se precarga al abrir el editor.
      // La carga `MediaPicker` cuando se abre de verdad, que es lo correcto —
      // la mayoría de las veces se escribe un post sin tocar ninguna imagen, y
      // esa petición no se usaba.
      await Promise.all([loadTags(), loadCategorias(), loadAuthors(), loadJuegos()]);

      if (postId) {
        await loadPost();
      }

      /**
       * El autoguardado arranca DESPUES de cargar, no antes.
       *
       * Si arrancara antes, su primera instantanea seria el formulario vacio y
       * la carga del post contaria como «cambios sin guardar» nada mas abrir.
       */
      const guardadas = autosaveStore.versionesGuardadas(claveBorrador);
      const ultima = guardadas[0];

      /**
       * Solo se ofrece recuperar si el borrador es MAS NUEVO que lo que hay en
       * el servidor. Si no, seria ofrecer volver a una version vieja despues de
       * haber guardado bien — que es perder trabajo, no recuperarlo.
       */
      const guardadoEnServidor = versionCargada ? new Date(versionCargada).getTime() : 0;
      if (ultima && ultima.timestamp > guardadoEnServidor) {
        borradorPendiente = { cuando: ultima.timestamp, datos: ultima.data };
      } else if (ultima) {
        autosaveStore.deleteAllVersions(claveBorrador);
      }

      autosaveStore.startAutosave(claveBorrador, instantanea());
    } catch (err: any) {
      error = err.message || "Failed to initialize editor";
    } finally {
      loading = false;
    }
  });

  // ─── Data loading ───────────────────────────────────
  async function loadPost() {
    try {
      const post = await api.getPost(postId!);
      title = post.title || "";
      slug = post.slug || "";
      /**
       * `content` es `jsonb` en la base y los tres editores hablan en CADENA.
       *
       * Una fila antigua podria traer un objeto en vez de texto —jsonb admite
       * las dos cosas— y entonces el editor pintaria `[object Object]` y lo
       * guardaria asi, destruyendo el post al primer guardado. Se normaliza al
       * cargar en vez de confiar.
       */
      content =
        typeof post.content === "string"
          ? post.content
          : post.content
            ? JSON.stringify(post.content, null, 2)
            : "";
      blocks = Array.isArray((post as { blocks?: PageBlock[] }).blocks)
        ? ((post as { blocks?: PageBlock[] }).blocks as PageBlock[])
        : [];
      excerpt = post.excerpt || "";
      status = post.status || "draft";
      // `!== false` y no `=== true`: un post anterior a la columna trae
      // `undefined`, y con `=== true` saldría como cerrado sin que nadie lo
      // hubiera decidido.
      commentsEnabled = post.commentsEnabled !== false;
      locale = (post as any).locale || "es";
      translationGroupId = (post as any).translationGroupId || "";
      layout = post.layout === "tips" ? "tips" : "article";
      publishedAt = post.publishedAt ? new Date(post.publishedAt).toISOString().slice(0, 16) : "";
      authorId = post.authorId || "";
      featuredImageId = post.featuredImageId || "";
      featuredImageUrl = post.featuredImage?.url || "";
      /**
       * Las etiquetas llegan como IDS y aqui se necesitan como objetos.
       *
       * Antes esto era `post.tags || []`, y la API nunca ha devuelto `tags`:
       * `GET /api/blog/:id` entregaba la fila cruda y las etiquetas viven en
       * una tabla de relacion. Resultado: abrir un post existente lo mostraba
       * SIEMPRE sin etiquetas. Se veia como «este post no tiene», no como «no
       * te las he traido».
       *
       * `availableTags` ya esta cargado en `onMount`, asi que el mapeo es local.
       */
      const idsDeEtiquetas = (post as { tagIds?: string[] }).tagIds ?? [];
      tags = idsDeEtiquetas
        .map((id) => availableTags.find((t) => t.id === id))
        .filter((t): t is { id: string; name: string; slug: string } => !!t);

      gameIds = Array.isArray((post as { gameIds?: string[] }).gameIds)
        ? ((post as { gameIds?: string[] }).gameIds as string[])
        : [];
      categoryIds = Array.isArray((post as { categoryIds?: string[] }).categoryIds)
        ? ((post as { categoryIds?: string[] }).categoryIds as string[])
        : [];

      // La version con la que se abre. Sin esto no hay forma de detectar que
      // otra persona ha guardado por debajo.
      versionCargada = (post as { updatedAt?: string }).updatedAt ?? null;

      if (post.seoOverrides) {
        seoOverrides = conGruposEnTexto({
          ...seoOverrides,
          ...post.seoOverrides,
        });
      }
    } catch (err: any) {
      error = err.message || "Failed to load post";
    }
  }

  async function loadJuegos() {
    try {
      const respuesta = await api.getGames({ limit: 100 });
      juegosDisponibles = (respuesta.docs ?? []).map((juego) => ({
        id: juego.id,
        title: juego.title,
      }));
    } catch {
      // Sin kon de juegos instalado no hay nada que elegir, y eso no es un
      // error del editor: el resto del formulario sigue sirviendo.
      juegosDisponibles = [];
    }
  }

  async function loadCategorias() {
    try {
      const respuesta = await api.getBlogCategories();
      categoriasDisponibles = respuesta.docs || [];
    } catch (err) {
      // Que falle el catalogo no puede impedir editar el post.
      console.error("Failed to load categories:", err);
    }
  }

  function alternarJuego(id: string) {
    gameIds = gameIds.includes(id) ? gameIds.filter((x) => x !== id) : [...gameIds, id];
  }

  function alternarCategoria(id: string) {
    categoryIds = categoryIds.includes(id)
      ? categoryIds.filter((x) => x !== id)
      : [...categoryIds, id];
  }

  /** Nombre con sangria segun la profundidad, para que el arbol se lea plano. */
  function profundidadDe(cat: BlogCategory): number {
    let n = 0;
    let actual: BlogCategory | undefined = cat;
    // El tope corta cualquier anillo que se hubiera colado; la API lo impide al
    // escribir, pero esto se pinta con lo que llegue.
    while (actual?.parentId && n < 10) {
      actual = categoriasDisponibles.find((x) => x.id === actual!.parentId);
      n++;
    }
    return n;
  }

  async function crearCategoria() {
    if (!nuevaCategoria.name.trim()) return;
    try {
      const creada = await api.createBlogCategory({
        name: nuevaCategoria.name.trim(),
        slug: generateSlug(nuevaCategoria.name),
        parentId: nuevaCategoria.parentId || null,
      });
      categoriasDisponibles = [...categoriasDisponibles, creada];
      categoryIds = [...categoryIds, creada.id];
      nuevaCategoria = { name: "", parentId: "" };
    } catch (err: any) {
      error = err.message || "No se pudo crear la categoria";
    }
  }

  async function loadTags() {
    try {
      const response = await api.getTags();
      availableTags = response.docs || [];
    } catch (err) {
      console.error("Failed to load tags:", err);
    }
  }

  async function loadAuthors() {
    // TODO: Replace with actual API endpoint when available
    // For now, using a mock - in real implementation this should call api.getUsers()
    availableAuthors = [{ id: "1", name: "Current User", email: "user@example.com" }];
  }

  // ─── Helpers ────────────────────────────────────────
  function generateSlug(text: string) {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  }

  function handleTitleChange() {
    if (!slug && title) {
      slug = generateSlug(title);
    }
  }

  function selectFeaturedImage(media: { id: string; url: string }) {
    featuredImageId = media.id;
    featuredImageUrl = media.url;
    showMediaModal = false;
  }

  /**
   * Ficheros pegados o arrastrados sobre el editor.
   *
   * Va directo: se suben y se insertan sin pasar por la biblioteca. Abrir el
   * selector después de que alguien haya pegado una captura sería pedirle que
   * vuelva a elegir lo que acaba de dar.
   *
   * `destinoDeLaImagen` se fija a "contenido" porque `elegirImagen` decide con
   * él, y si el último uso del modal fue la portada, la captura pegada se
   * habría ido a la imagen destacada.
   */
  async function subirFicherosAlContenido(ficheros: File[]) {
    if (ficheros.length === 0) return;

    // `destinoDeLaImagen` decide a dónde va en `elegirImagen`. Si el último uso
    // del selector fue la portada, sin esto la captura pegada se habría ido a
    // la imagen destacada.
    destinoDeLaImagen = "contenido";
    errorDeSubida = null;
    subiendoImagen = true;

    try {
      const { subidos, errores } = await subirMedios(ficheros);
      if (errores.length > 0) errorDeSubida = errores.join(" · ");
      if (subidos[0]) elegirImagen(subidos[0]);
    } catch (err) {
      errorDeSubida = err instanceof Error ? err.message : "No se pudo subir";
    } finally {
      subiendoImagen = false;
    }
  }

  /** Abre la biblioteca para meter una imagen EN EL TEXTO. */
  function pedirImagenParaContenido() {
    // Se anota el cursor ANTES de abrir el modal. En cuanto el modal enfoca su
    // buscador, el textarea pierde el foco y su `selectionStart` deja de valer;
    // sin esta línea la imagen se insertaba al principio del artículo.
    //
    // El modo Markdown no lo necesita: CodeMirror mantiene su propia selección
    // aunque pierda el foco.
    editorRapido?.recordarPosicion();

    destinoDeLaImagen = "contenido";
    errorDeSubida = null;
    showMediaModal = true;
  }

  /** Abre la biblioteca para la imagen de PORTADA. */
  function pedirImagenDePortada() {
    destinoDeLaImagen = "portada";
    errorDeSubida = null;
    showMediaModal = true;
  }

  /**
   * Una imagen elegida en la biblioteca. A dónde va lo decide `destinoDeLaImagen`.
   *
   * El `alt` sale del que ya tenga el fichero en la biblioteca. Es lo que hace
   * que insertar desde aquí sea mejor que escribir el markdown a mano: a mano,
   * el `alt` se queda casi siempre en «alt» — y el `alt` es accesibilidad y es
   * SEO, dos de las cosas que este editor mide en su propia puntuación.
   */
  function elegirImagen(media: { id: string; url: string; filename: string; alt?: string }) {
    if (destinoDeLaImagen === "portada") {
      selectFeaturedImage(media);
      return;
    }

    const texto = media.alt || media.filename.replace(/\.[^.]+$/, "");
    const editor = modoContenido === "markdown" ? editorMarkdown : editorRapido;
    editor?.insertarImagen(media.url, texto);
    showMediaModal = false;
  }

  function removeFeaturedImage() {
    featuredImageId = "";
    featuredImageUrl = "";
  }

  function toggleTag(tag: { id: string; name: string; slug: string }) {
    const exists = tags.find((t) => t.id === tag.id);
    if (exists) {
      tags = tags.filter((t) => t.id !== tag.id);
    } else {
      tags = [...tags, tag];
    }
  }

  async function createNewTag() {
    if (!newTagName.trim()) return;

    try {
      const slug = generateSlug(newTagName);
      const newTag = await api.createTag({
        name: newTagName.trim(),
        slug,
      });
      availableTags = [...availableTags, newTag];
      tags = [...tags, newTag];
      newTagName = "";
    } catch (err: any) {
      error = err.message || "Failed to create tag";
    }
  }

  async function handleSave() {
    if (!title.trim()) {
      error = "Title is required";
      return;
    }

    saving = true;
    error = null;

    try {
      /**
       * El cuerpo tiene que encajar con `createPostSchema` de la API, y no
       * encajaba. Tres desajustes, comprobados pasando este mismo objeto por el
       * esquema real:
       *
       *   · `publishedAt: null` y `featuredImageId: null` → **400**. El esquema
       *     los declara `.optional()`, que en zod significa `undefined`, NO
       *     `null`. Guardar un BORRADOR SIN IMAGEN —el caso mas comun, un post
       *     nuevo— fallaba siempre con «Validation failed».
       *   · `tags` no existe en el esquema: se llama `tagIds`. Zod descarta las
       *     claves que no conoce en vez de protestar, asi que las etiquetas
       *     desaparecian EN SILENCIO. Ese es peor que el 400: el post se guarda
       *     y las etiquetas no, sin un solo aviso.
       *
       * Por eso los opcionales se OMITEN cuando no hay valor, en vez de
       * enviarse en `null`.
       */
      const postData: Record<string, unknown> = {
        title: title.trim(),
        slug: slug || generateSlug(title),
        content,
        // Los bloques viajan con el post: sin esto, la pestaña de bloques seria
        // decorativa — se editarian y no se guardarian.
        blocks,
        excerpt: excerpt.trim(),
        status,
        // Sin esta línea el interruptor sería decorativo: Zod descarta en
        // silencio lo que no llega, así que cerrar el hilo no daría ningún
        // error y el post se guardaría con los comentarios abiertos.
        commentsEnabled,
        // Igual que arriba: sin esta línea el selector sería decorativo.
        layout,
        /**
         * Y lo mismo con el idioma: sin estas dos lineas, marcar un articulo
         * como ingles lo guardaria como espanol —la columna tiene DEFAULT
         * 'es'— sin dar ningun error.
         */
        locale,
        translationGroupId: translationGroupId.trim() || null,
        seoOverrides: {
          metaTitle: seoOverrides.metaTitle || null,
          metaDescription: seoOverrides.metaDescription || null,
          ogTitle: seoOverrides.ogTitle || null,
          ogDescription: seoOverrides.ogDescription || null,
          ogImageId: seoOverrides.ogImageId || null,
          canonicalUrl: seoOverrides.canonicalUrl || null,
          robotsIndex: seoOverrides.robotsIndex,
          robotsFollow: seoOverrides.robotsFollow,
          structuredData: seoOverrides.structuredData || null,
          facebookGroupUrl: seoOverrides.facebookGroupUrl.trim() || null,
          whatsappGroupUrl: seoOverrides.whatsappGroupUrl.trim() || null,
        },
      };

      const fechaPublicacion =
        status === "scheduled"
          ? new Date(publishedAt).toISOString()
          : status === "published"
            ? new Date().toISOString()
            : null;

      if (fechaPublicacion) postData.publishedAt = fechaPublicacion;
      if (featuredImageId) postData.featuredImageId = featuredImageId;
      if (authorId) postData.authorId = authorId;
      if (tags.length > 0) postData.tagIds = tags.map((t) => t.id);

      // Las categorias SI se mandan vacias: `[]` significa «quitalas todas», y
      // omitirlas significa «no las toques». Son cosas distintas y la API las
      // distingue (`categoryIds !== undefined`). Con las etiquetas no se puede
      // hacer lo mismo sin cambiar el contrato existente.
      if (postId || categoryIds.length > 0) postData.categoryIds = categoryIds;

      // Mismo trato que las categorias: `[]` quita todos, omitirlo no toca nada.
      if (postId || gameIds.length > 0) postData.gameIds = gameIds;

      if (postId) {
        if (versionCargada) postData.expectedUpdatedAt = versionCargada;
        await api.updatePost(postId, postData as any);
      } else {
        await api.createPost(postData as any);
      }

      // Guardado en el servidor: el borrador local ya no hace falta y dejarlo
      // haria que la proxima apertura ofreciera recuperar algo ya guardado.
      autosaveStore.clearCurrentAutosave();

      goto("/g/kon-blog");
    } catch (err: any) {
      /**
       * 409 no es un fallo: es «otra persona guardo antes que tu, y no he
       * escrito nada para no borrar su trabajo».
       *
       * Se trata aparte porque la reaccion es distinta: no hay nada que
       * reintentar, hay que ver que cambio. Y sobre todo NO se limpia el
       * borrador local — es lo unico que conserva lo que se acaba de escribir.
       */
      const fallo = err as ApiError;
      if (fallo.status === 409) {
        const cuerpo = fallo.cuerpo as { message?: string; currentUpdatedAt?: string } | undefined;
        conflicto = {
          mensaje: cuerpo?.message || fallo.message,
          cuando: cuerpo?.currentUpdatedAt ?? null,
        };
      } else {
        error = fallo.message || "Failed to save post";
      }
    } finally {
      saving = false;
    }
  }

  async function handleDelete() {
    if (!confirm("Are you sure you want to delete this post?")) return;

    try {
      await api.deletePost(postId!);
      goto("/g/kon-blog");
    } catch (err: any) {
      error = err.message || "Failed to delete post";
    }
  }

  /*
   * `handlePreview` se ha eliminado.
   *
   * Abría `/blog/<slug>?preview=true` en otra pestaña, y esa ruta NO EXISTE:
   * en el repo solo está `apps/api`, no hay sitio público. Comprobado contra
   * la instalación: `:3001/blog/lo-que-sea` devuelve 200 porque nginx sirve el
   * panel para cualquier ruta, así que se abría una pestaña con el propio panel
   * en una ruta que su router no conoce.
   *
   * Y no lo llamaba NADIE: el botón «Preview» de la cabecera conmuta
   * `showPreview`, que es el panel lateral de aquí al lado. Era una función
   * muerta apuntando a una página inexistente — justo lo que alguien acaba
   * enganchando a un botón un día, creyendo que hay una vista previa pública.
   *
   * Cuando exista un frontend, este es el sitio donde va.
   */

  function handleDatasetSelect(data: {
    title: string;
    content: string;
    excerpt: string;
    featuredImageId?: string;
    tags: string[];
    source: {
      type: "dataset";
      datasetId: string;
      entryId: string;
    };
  }) {
    // Populate form with dataset entry data
    title = data.title;
    slug = generateSlug(data.title);
    content = data.content;
    excerpt = data.excerpt;
    featuredImageId = data.featuredImageId || "";

    // Generate tags from dataset entry
    // Note: These are tag names, we'd need to create/fetch actual tag objects
    // For now, we'll store them as placeholder tags
    tags = data.tags.map((tagName, index) => ({
      id: `temp-${index}`,
      name: tagName,
      slug: tagName.toLowerCase().replace(/\s+/g, "-"),
    }));

    // Optionally set SEO defaults
    if (!seoOverrides.metaTitle) {
      seoOverrides.metaTitle = data.title;
    }
    if (!seoOverrides.metaDescription) {
      seoOverrides.metaDescription = data.excerpt.substring(0, 160);
    }
  }

  function formatDateForInput(date: string): string {
    if (!date) return "";
    const d = new Date(date);
    return d.toISOString().slice(0, 16);
  }
</script>

<div class="h-[calc(100vh-4rem)] flex flex-col bg-kitsuden-bg">
  <!-- Header -->
  <header
    class="flex items-center justify-between px-6 py-4 border-b border-kitsuden-border bg-kitsuden-card shrink-0"
  >
    <div class="flex items-center gap-4">
      <a href="/g/kon-blog" class="btn-icon hover:bg-kitsuden-border/50 transition-colors">
        <ArrowLeft class="w-5 h-5" />
      </a>
      <div>
        <h1 class="text-xl font-bold text-kitsuden-text flex items-center gap-3">
          <div
            class="w-9 h-9 rounded-xl bg-gradient-to-br from-kitsuden-green/20 to-kitsuden-accent/20 border border-kitsuden-green/20 flex items-center justify-center"
          >
            <FileText class="w-4 h-4 text-kitsuden-green" />
          </div>
          {postId ? "Edit Post" : "New Post"}
        </h1>
        <p class="text-xs text-kitsuden-subtle mt-0.5">
          {seoScore >= 80
            ? "SEO Optimized"
            : seoScore >= 50
              ? "SEO Needs Improvement"
              : "SEO Incomplete"} •
          <span
            class={seoScore >= 80
              ? "text-kitsuden-green"
              : seoScore >= 50
                ? "text-amber-400"
                : "text-kitsuden-accent-2"}
          >
            {seoScore}% score
          </span>
        </p>
      </div>
    </div>

    <div class="flex items-center gap-2">
      <!--
        Estado del BORRADOR LOCAL, no del post. La distincion importa: «Saved»
        aqui significa «hay copia en este navegador», no «esta publicado». Por
        eso el indicador va separado del boton de guardar y no en su lugar.
      -->
      <AutoSaveIndicator />
      {#if !postId}
        <!-- New Post Options -->
        <button class="btn-ghost btn-sm gap-1.5" onclick={() => (showDatasetModal = true)}>
          <Database class="w-4 h-4" />
          From Dataset
        </button>
      {/if}
      <button class="btn-ghost btn-sm gap-1.5" onclick={() => (showPreview = !showPreview)}>
        {#if showPreview}
          <EyeOff class="w-4 h-4" />
          Hide Preview
        {:else}
          <Eye class="w-4 h-4" />
          Preview
        {/if}
      </button>
      {#if postId}
        <button class="btn-danger btn-sm gap-1.5" onclick={handleDelete}>
          <Trash2 class="w-4 h-4" />
          Delete
        </button>
      {/if}
      <button class="btn-primary btn-sm gap-1.5" onclick={handleSave} disabled={saving}>
        {#if saving}
          <Loader2 class="w-4 h-4 animate-spin" />
          Saving...
        {:else}
          <Save class="w-4 h-4" />
          Save Post
        {/if}
      </button>
    </div>
  </header>

  {#if borradorPendiente}
    <!--
      Hay una copia local mas nueva que lo guardado en el servidor. NO se aplica
      sola: sobrescribir lo que la persona acaba de abrir sin preguntar es
      exactamente la clase de perdida que esto viene a evitar.
    -->
    <div
      class="flex items-center justify-between gap-4 px-6 py-3 border-b border-amber-400/30 bg-amber-400/10 shrink-0"
    >
      <div class="flex items-center gap-2 text-sm text-amber-200">
        <History class="w-4 h-4 shrink-0" />
        <span>
          Hay cambios sin guardar de
          <strong>{new Date(borradorPendiente.cuando).toLocaleString()}</strong>
          en este navegador. ¿Recuperarlos?
        </span>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        <button class="btn-primary btn-sm" onclick={recuperarBorrador}>Recuperar</button>
        <button class="btn-ghost btn-sm" onclick={descartarBorrador}>Descartar</button>
      </div>
    </div>
  {/if}

  {#if conflicto}
    <!--
      409: otra persona guardo mientras este editor estaba abierto. No se ha
      escrito nada. El texto de quien edita sigue en pantalla y en el borrador
      local, asi que no se pierde nada al recargar en otra pestana.
    -->
    <div
      class="flex items-start justify-between gap-4 px-6 py-3 border-b border-kitsuden-accent-2/40 bg-kitsuden-accent-2/10 shrink-0"
    >
      <div class="flex items-start gap-2 text-sm text-kitsuden-accent-2">
        <AlertTriangle class="w-4 h-4 shrink-0 mt-0.5" />
        <div>
          <p class="font-medium">El post ha cambiado desde que lo abriste</p>
          <p class="text-xs opacity-90 mt-0.5">
            {conflicto.mensaje}
            {#if conflicto.cuando}
              (ultimo guardado: {new Date(conflicto.cuando).toLocaleString()})
            {/if}
          </p>
        </div>
      </div>
      <button class="btn-ghost btn-sm shrink-0" onclick={() => (conflicto = null)}>
        <X class="w-4 h-4" />
      </button>
    </div>
  {/if}

  <!-- Tabs -->
  <div
    class="flex items-center gap-1 px-6 py-2 border-b border-kitsuden-border bg-kitsuden-card/50 shrink-0"
  >
    <button
      class="px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 {activeTab ===
      'content'
        ? 'bg-kitsuden-accent/10 text-kitsuden-accent'
        : 'text-kitsuden-subtle hover:text-kitsuden-text hover:bg-kitsuden-border/30'}"
      onclick={() => (activeTab = "content")}
    >
      <FileText class="w-4 h-4" />
      Content
    </button>
    <!--
      Bloques: pestaña propia y no un modo de escritura, porque NO es el mismo
      dato. El texto vive en `content` y los bloques en la columna `blocks`
      (jsonb). Los dos se guardan con el post.
    -->
    <button
      class="px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 {activeTab ===
      'blocks'
        ? 'bg-kitsuden-accent/10 text-kitsuden-accent'
        : 'text-kitsuden-subtle hover:text-kitsuden-text hover:bg-kitsuden-border/30'}"
      onclick={() => (activeTab = "blocks")}
    >
      <LayoutGrid class="w-4 h-4" />
      Bloques
      {#if blocks.length > 0}
        <span class="rounded-full bg-kitsuden-border px-1.5 text-[10px]">{blocks.length}</span>
      {/if}
    </button>
    <button
      class="px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 {activeTab ===
      'seo'
        ? 'bg-kitsuden-accent/10 text-kitsuden-accent'
        : 'text-kitsuden-subtle hover:text-kitsuden-text hover:bg-kitsuden-border/30'}"
      onclick={() => (activeTab = "seo")}
    >
      <Search class="w-4 h-4" />
      SEO
      {#if seoScore < 80}
        <span class="w-2 h-2 rounded-full bg-kitsuden-accent-2"></span>
      {:else}
        <CheckCircle2 class="w-3.5 h-3.5 text-kitsuden-green" />
      {/if}
    </button>
    <button
      class="px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 {activeTab ===
      'settings'
        ? 'bg-kitsuden-accent/10 text-kitsuden-accent'
        : 'text-kitsuden-subtle hover:text-kitsuden-text hover:bg-kitsuden-border/30'}"
      onclick={() => (activeTab = "settings")}
    >
      <Settings class="w-4 h-4" />
      Settings
    </button>
  </div>

  <!-- Error Alert -->
  {#if error}
    <div
      class="mx-6 mt-4 p-3 rounded-lg bg-kitsuden-accent-2/10 border border-kitsuden-accent-2/20 text-kitsuden-accent-2 text-sm shrink-0"
    >
      {error}
    </div>
  {/if}

  <!-- Content Area -->
  {#if loading}
    <div class="flex-1 flex items-center justify-center">
      <div class="flex flex-col items-center gap-3">
        <Loader2 class="w-8 h-8 text-kitsuden-accent animate-spin" />
        <p class="text-kitsuden-subtle text-sm">Loading editor...</p>
      </div>
    </div>
  {:else}
    {#snippet editorPanels()}
      <!-- TAB: Content -->
      {#if activeTab === "content"}
        <div class="h-full grid grid-cols-1 lg:grid-cols-3 gap-0">
          <!-- Main Editor -->
          <div class="lg:col-span-2 h-full overflow-y-auto p-6">
            <div class="max-w-3xl mx-auto space-y-6">
              <!-- Title -->
              <div>
                <label
                  for="title"
                  class="label block text-xs font-semibold uppercase text-kitsuden-subtle tracking-wider mb-2"
                >
                  Post Title
                </label>
                <input
                  id="title"
                  type="text"
                  bind:value={title}
                  oninput={handleTitleChange}
                  placeholder="Enter an engaging title..."
                  class="input w-full text-2xl font-bold py-3"
                />
                <div class="flex justify-between mt-1.5">
                  <span class="text-[10px] text-kitsuden-subtle">
                    {title.length} characters
                  </span>
                  <span
                    class="text-[10px] {title.length >= 30 && title.length <= 60
                      ? 'text-kitsuden-green'
                      : 'text-kitsuden-accent-2'}"
                  >
                    Optimal: 30-60 chars
                  </span>
                </div>
              </div>

              <!-- Slug -->
              <div>
                <label
                  class="label block text-xs font-semibold uppercase text-kitsuden-subtle tracking-wider mb-2"
                >
                  URL Slug
                </label>
                <div
                  class="flex items-center gap-2 px-3 py-2 rounded-xl border border-kitsuden-border bg-kitsuden-bg"
                >
                  <span class="text-kitsuden-subtle text-sm font-mono">/blog/</span>
                  <input
                    type="text"
                    bind:value={slug}
                    placeholder="your-post-slug"
                    class="flex-1 bg-transparent text-sm text-kitsuden-accent font-mono outline-none"
                  />
                </div>
              </div>

              <!-- Content Editor -->
              <div>
                <div class="mb-2 flex items-center justify-between gap-3">
                  <label
                    class="label block text-xs font-semibold uppercase text-kitsuden-subtle tracking-wider"
                  >
                    Content
                  </label>

                  <div class="flex items-center gap-2">
                    <!--
                      ── POR QUÉ ESTÁ AQUÍ Y NO EN LA BARRA DEL EDITOR ───────

                      Porque tiene que salir en los DOS modos. El modo rápido
                      tiene barra de herramientas y el de markdown es CodeMirror
                      y no la tiene; un botón que aparece y desaparece al cambiar
                      de modo es peor que uno que siempre está en el mismo sitio.

                      (El modo rápido también lo tiene en su barra y en `/image`,
                      que es donde la mano va sola.)
                    -->
                    <button
                      type="button"
                      onclick={pedirImagenParaContenido}
                      class="flex items-center gap-1.5 rounded-lg border border-kitsuden-border px-2.5 py-1 text-xs font-medium text-kitsuden-subtle transition-colors hover:text-kitsuden-text"
                      title="Insertar una imagen de la biblioteca en el texto"
                    >
                      <Image class="h-3.5 w-3.5" />
                      Imagen
                    </button>

                    <!--
                      Dos formas de escribir el MISMO campo. No se pierde nada al
                      cambiar: los dos editores emiten markdown en texto plano.
                    -->
                    <div
                      class="flex items-center gap-1 rounded-lg border border-kitsuden-border p-0.5"
                    >
                      <button
                        type="button"
                        class="rounded-md px-2.5 py-1 text-xs font-medium transition-colors {modoContenido ===
                        'markdown'
                          ? 'bg-kitsuden-accent/10 text-kitsuden-accent'
                          : 'text-kitsuden-subtle hover:text-kitsuden-text'}"
                        onclick={() => (modoContenido = "markdown")}
                      >
                        Markdown
                      </button>
                      <button
                        type="button"
                        class="rounded-md px-2.5 py-1 text-xs font-medium transition-colors {modoContenido ===
                        'rapido'
                          ? 'bg-kitsuden-accent/10 text-kitsuden-accent'
                          : 'text-kitsuden-subtle hover:text-kitsuden-text'}"
                        onclick={() => (modoContenido = "rapido")}
                      >
                        Rápido
                      </button>
                    </div>
                  </div>
                </div>

                {#if modoContenido === "markdown"}
                  <div class="h-[32rem] overflow-hidden rounded-lg border border-kitsuden-border">
                    <MdxEditor
                      bind:this={editorMarkdown}
                      value={content}
                      onChange={(v) => (content = v)}
                      onSubirFicheros={subirFicherosAlContenido}
                    />
                  </div>
                {:else}
                  <SlashCommandEditor
                    bind:this={editorRapido}
                    value={content}
                    onChange={(v) => (content = v)}
                    onPedirImagen={pedirImagenParaContenido}
                    onSubirFicheros={subirFicherosAlContenido}
                    placeholder="Start writing... Type '/' for commands"
                  />
                {/if}

                <!--
                  ── AVISO DE SUBIDA, FUERA DEL MODAL ────────────────────────

                  Al pegar una captura el modal está CERRADO, así que su
                  indicador no se ve: durante dos o tres segundos no pasaba
                  nada en pantalla y el gesto parecía no haber funcionado —
                  que es cómo la gente pega la misma imagen tres veces.

                  Se pinta solo cuando el modal no está abierto, para no
                  duplicar el aviso cuando la subida sí viene de allí.
                -->
                {#if !showMediaModal && (subiendoImagen || errorDeSubida)}
                  <div class="mt-2 text-xs">
                    {#if subiendoImagen}
                      <span class="flex items-center gap-1.5 text-kitsuden-subtle">
                        <Loader2 class="h-3.5 w-3.5 animate-spin" />
                        Subiendo imagen…
                      </span>
                    {:else}
                      <span class="flex items-center gap-1.5 text-red-400">
                        <AlertTriangle class="h-3.5 w-3.5 shrink-0" />
                        {errorDeSubida}
                      </span>
                    {/if}
                  </div>
                {/if}
              </div>

              <!--
                La imagen destacada y el extracto van DESPUES del cuerpo.

                Estaban antes, asi que el campo donde se escribe el post —lo
                unico que de verdad se viene a hacer aqui— quedaba el cuarto y
                por debajo del pliegue: se abria «Nuevo Post» y no se veia
                donde escribir. Son metadatos; el cuerpo es el contenido.
              -->
              <!-- Featured Image -->
              <div>
                <label
                  class="label block text-xs font-semibold uppercase text-kitsuden-subtle tracking-wider mb-2"
                >
                  Featured Image
                </label>
                {#if featuredImageUrl}
                  <div class="relative rounded-xl overflow-hidden border border-kitsuden-border">
                    <img src={featuredImageUrl} alt="Featured" class="w-full h-48 object-cover" />
                    <button
                      onclick={removeFeaturedImage}
                      class="absolute top-2 right-2 btn-icon bg-black/60 hover:bg-black/80 text-white p-1.5 rounded-lg"
                    >
                      <X class="w-4 h-4" />
                    </button>
                  </div>
                {:else}
                  <button
                    onclick={pedirImagenDePortada}
                    class="w-full p-8 rounded-xl border-2 border-dashed border-kitsuden-border hover:border-kitsuden-accent/50 hover:bg-kitsuden-accent/5 transition-all flex flex-col items-center gap-3"
                  >
                    <Image class="w-8 h-8 text-kitsuden-subtle" />
                    <span class="text-sm text-kitsuden-subtle">Click to select featured image</span>
                    <span class="text-[10px] text-kitsuden-subtle/60">Recommended: 1200x630px</span>
                  </button>
                {/if}
              </div>

              <!-- Excerpt -->
              <div>
                <label
                  for="excerpt"
                  class="label block text-xs font-semibold uppercase text-kitsuden-subtle tracking-wider mb-2"
                >
                  Excerpt / Summary
                </label>
                <textarea
                  id="excerpt"
                  bind:value={excerpt}
                  rows="3"
                  placeholder="Brief summary of your post (appears in previews and search results)..."
                  class="input w-full resize-none"
                ></textarea>
                <div class="flex justify-between mt-1.5">
                  <span class="text-[10px] text-kitsuden-subtle">
                    {excerpt.length} characters
                  </span>
                  <span
                    class="text-[10px] {excerpt.length >= 120 && excerpt.length <= 160
                      ? 'text-kitsuden-green'
                      : 'text-amber-400'}"
                  >
                    Optimal: 120-160 chars
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- Sidebar -->
          <div
            class="h-full overflow-y-auto border-l border-kitsuden-border bg-kitsuden-card/30 p-6"
          >
            <div class="space-y-6">
              <!-- Status -->
              <div class="card p-4">
                <h3 class="font-semibold text-kitsuden-text mb-4 flex items-center gap-2">
                  <Settings class="w-4 h-4" />
                  Publishing
                </h3>

                <div class="space-y-4">
                  <div>
                    <label for="status" class="label block text-xs mb-1.5">Status</label>
                    <select id="status" bind:value={status} class="select w-full">
                      <option value="draft">📝 Draft</option>
                      <option value="scheduled">📅 Scheduled</option>
                      <option value="published">🚀 Published</option>
                      <option value="archived">📦 Archived</option>
                    </select>
                  </div>

                  <!--
                    ── EL INTERRUPTOR QUE FALTABA ──────────────────────────────
                  
                    La columna, la API y el bloque existian, y no habia forma de
                    tocarlo desde el panel: cerrar el hilo de un articulo solo se
                    podia con un PATCH a mano. En WordPress esto es la caja
                    «Discussion» de toda la vida.
                  -->
                  <div>
                    <label class="label flex items-center gap-2 text-xs cursor-pointer">
                      <input type="checkbox" bind:checked={commentsEnabled} class="checkbox" />
                      <span>Permitir comentarios</span>
                    </label>
                    <p class="text-xs opacity-60 mt-1">
                      {commentsEnabled
                        ? "Los lectores pueden comentar y votar en este articulo."
                        : "Hilo cerrado. Lo ya escrito no se borra: deja de admitirse mas."}
                    </p>
                  </div>

                  <!--
                    Idioma y traducciones.

                    Una entrada por idioma, atadas por un grupo. Para traducir
                    un articulo se crea otro, se le pone su idioma y se pega
                    aqui el grupo del original; el boton copia el del articulo
                    abierto, que es de donde se parte siempre.
                  -->
                  <div>
                    <label for="locale" class="label block text-xs mb-1.5">Idioma</label>
                    <select id="locale" bind:value={locale} class="select w-full">
                      {#each IDIOMAS_DEL_PANEL as idioma (idioma.codigo)}
                        <option value={idioma.codigo}>{idioma.nombre}</option>
                      {/each}
                    </select>
                    <p class="text-xs opacity-60 mt-1">
                      La web ensena una version por articulo: la de quien mira, y si no
                      existe, la inglesa.
                    </p>
                  </div>

                  <div>
                    <label for="grupo-traduccion" class="label block text-xs mb-1.5">
                      Traduccion de (grupo)
                    </label>
                    <input
                      id="grupo-traduccion"
                      type="text"
                      bind:value={translationGroupId}
                      placeholder="Vacio = articulo suelto"
                      class="input w-full font-mono text-xs"
                    />
                    <p class="text-xs opacity-60 mt-1">
                      Pega aqui el grupo del articulo original. Si esta vacio, este
                      articulo no tiene traducciones.
                    </p>
                    {#if postId}
                      <button
                        type="button"
                        class="btn btn-xs mt-2"
                        onclick={() => (translationGroupId = translationGroupId || postId)}
                      >
                        Usar este articulo como original
                      </button>
                    {/if}
                  </div>

                  <div>
                    <label for="layout" class="label block text-xs mb-1.5">Plantilla</label>
                    <select id="layout" bind:value={layout} class="select w-full">
                      <option value="article">Artículo</option>
                      <option value="tips">Tips (lista numerada con índice)</option>
                    </select>
                    <p class="text-xs opacity-60 mt-1">
                      {layout === "tips"
                        ? "Cada título H2 del contenido se numera y sale en el índice lateral."
                        : "El artículo de siempre, a una columna."}
                    </p>
                  </div>

                  {#if status === "scheduled"}
                    <div>
                      <label
                        for="publishedat"
                        class="label block text-xs mb-1.5 flex items-center gap-1"
                      >
                        <Calendar class="w-3 h-3" />
                        Publish Date
                      </label>
                      <input
                        id="publishedat"
                        type="datetime-local"
                        bind:value={publishedAt}
                        class="input w-full text-sm"
                      />
                    </div>
                  {/if}

                  <div>
                    <label
                      for="authorid"
                      class="label block text-xs mb-1.5 flex items-center gap-1"
                    >
                      <User class="w-3 h-3" />
                      Author
                    </label>
                    <select id="authorid" bind:value={authorId} class="select w-full">
                      <option value="">Select author...</option>
                      {#each availableAuthors as author}
                        <option value={author.id}>{author.name}</option>
                      {/each}
                    </select>
                  </div>
                </div>
              </div>

              <!--
                Categorias: la taxonomia JERARQUICA. Va encima de las etiquetas
                a proposito — es la que decide donde vive el post; las etiquetas
                solo lo describen.
              -->
              <div class="card p-4">
                <h3 class="font-semibold text-kitsuden-text mb-4 flex items-center gap-2">
                  <FolderTree class="w-4 h-4" />
                  Categorías
                </h3>

                {#if categoriasDisponibles.length === 0}
                  <p class="text-xs text-kitsuden-subtle italic mb-3">Aún no hay categorías.</p>
                {:else}
                  <div class="space-y-1 mb-3 max-h-56 overflow-y-auto">
                    {#each categoriasDisponibles as cat (cat.id)}
                      <label
                        class="flex items-center gap-2 py-1 text-sm text-kitsuden-text cursor-pointer hover:text-kitsuden-accent"
                        style="padding-left: {profundidadDe(cat) * 16}px"
                      >
                        <input
                          type="checkbox"
                          checked={categoryIds.includes(cat.id)}
                          onchange={() => alternarCategoria(cat.id)}
                          class="rounded border-kitsuden-border"
                        />
                        <span>{cat.name}</span>
                        {#if cat.postCount}
                          <span class="text-xs text-kitsuden-subtle">({cat.postCount})</span>
                        {/if}
                      </label>
                    {/each}
                  </div>
                {/if}

                <button
                  onclick={() => (showCategoryModal = true)}
                  class="btn-ghost btn-sm w-full gap-1.5 text-xs"
                >
                  <Plus class="w-3 h-3" />
                  Nueva categoría
                </button>
              </div>

              <!--
                Juegos: de aqui sale el corazon que la portada pone sobre la
                tarjeta y que lleva a la pantalla del juego. La relacion ya
                existia en la API; lo que faltaba era poder elegirla.
              -->
              <div class="card p-4">
                <h3 class="font-semibold text-kitsuden-text mb-4 flex items-center gap-2">
                  <Gamepad2 class="w-4 h-4" />
                  Juegos
                </h3>

                {#if juegosDisponibles.length === 0}
                  <p class="text-xs text-kitsuden-subtle italic">
                    No hay juegos que elegir todavia.
                  </p>
                {:else}
                  <div class="space-y-1 max-h-56 overflow-y-auto">
                    {#each juegosDisponibles as juego (juego.id)}
                      <label
                        class="flex items-center gap-2 py-1 text-sm text-kitsuden-text cursor-pointer hover:text-kitsuden-accent"
                      >
                        <input
                          type="checkbox"
                          checked={gameIds.includes(juego.id)}
                          onchange={() => alternarJuego(juego.id)}
                          class="rounded border-kitsuden-border"
                        />
                        <span>{juego.title}</span>
                      </label>
                    {/each}
                  </div>
                  <p class="text-xs opacity-60 mt-2">
                    En la portada, la tarjeta lleva la caratula del primero en un
                    corazon que abre la pantalla de ese juego.
                  </p>
                {/if}
              </div>

              <!-- Tags -->
              <div class="card p-4">
                <h3 class="font-semibold text-kitsuden-text mb-4 flex items-center gap-2">
                  <Tag class="w-4 h-4" />
                  Tags
                </h3>

                <div class="flex flex-wrap gap-2 mb-3">
                  {#each tags as tag}
                    <span
                      class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-kitsuden-accent/10 text-kitsuden-accent text-xs"
                    >
                      {tag.name}
                      <button onclick={() => toggleTag(tag)} class="hover:text-kitsuden-accent-2">
                        <X class="w-3 h-3" />
                      </button>
                    </span>
                  {/each}
                  {#if tags.length === 0}
                    <span class="text-xs text-kitsuden-subtle italic">No tags selected</span>
                  {/if}
                </div>

                <button
                  onclick={() => (showTagModal = true)}
                  class="btn-ghost btn-sm w-full gap-1.5 text-xs"
                >
                  <Plus class="w-3 h-3" />
                  Add Tags
                </button>
              </div>

              <!-- SEO Summary -->
              <div class="card p-4">
                <h3 class="font-semibold text-kitsuden-text mb-3 flex items-center gap-2">
                  <Search class="w-4 h-4" />
                  SEO Summary
                </h3>
                <div class="space-y-2">
                  <div class="flex items-center justify-between text-xs">
                    <span class="text-kitsuden-subtle">Score</span>
                    <span
                      class={seoScore >= 80
                        ? "text-kitsuden-green"
                        : seoScore >= 50
                          ? "text-amber-400"
                          : "text-kitsuden-accent-2"}
                    >
                      {seoScore}%
                    </span>
                  </div>
                  <div class="w-full h-1.5 bg-kitsuden-border rounded-full overflow-hidden">
                    <div
                      class="h-full rounded-full transition-all {seoScore >= 80
                        ? 'bg-kitsuden-green'
                        : seoScore >= 50
                          ? 'bg-amber-400'
                          : 'bg-kitsuden-accent-2'}"
                      style="width: {seoScore}%"
                    ></div>
                  </div>
                  <button
                    onclick={() => (activeTab = "seo")}
                    class="text-xs text-kitsuden-accent hover:underline mt-2"
                  >
                    Improve SEO →
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      {/if}

      <!--
        TAB: Bloques

        Pestaña propia y no un modo de escritura, porque NO es el mismo dato: el
        texto vive en `content` y los bloques en la columna `blocks` (jsonb).
        Los dos se guardan con el post.
      -->
      {#if activeTab === "blocks"}
        <div class="h-full overflow-y-auto p-6">
          <PageBuilder {blocks} onChange={(b) => (blocks = b)} />
        </div>
      {/if}

      <!-- TAB: SEO -->
      {#if activeTab === "seo"}
        <div class="h-full overflow-y-auto p-6">
          <div class="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8">
            <!-- SEO Form -->
            <div class="space-y-6">
              <div>
                <h2 class="text-lg font-semibold text-kitsuden-text mb-1">SEO Settings</h2>
                <p class="text-sm text-kitsuden-subtle">Optimize your post for search engines</p>
              </div>

              <!-- Meta Title -->
              <div>
                <div class="flex items-center justify-between mb-2">
                  <label class="label text-xs uppercase">Meta Title</label>
                  <span
                    class="text-[10px] {(seoOverrides.metaTitle || title).length <= 60
                      ? 'text-kitsuden-green'
                      : 'text-kitsuden-accent-2'}"
                  >
                    {(seoOverrides.metaTitle || title).length}/60
                  </span>
                </div>
                <input
                  type="text"
                  bind:value={seoOverrides.metaTitle}
                  placeholder={title}
                  class="input w-full"
                />
                <p class="text-[10px] text-kitsuden-subtle mt-1">Leave empty to use post title</p>
              </div>

              <!-- Meta Description -->
              <div>
                <div class="flex items-center justify-between mb-2">
                  <label class="label text-xs uppercase">Meta Description</label>
                  <span
                    class="text-[10px] {(seoOverrides.metaDescription || excerpt).length <= 160
                      ? 'text-kitsuden-green'
                      : 'text-kitsuden-accent-2'}"
                  >
                    {(seoOverrides.metaDescription || excerpt).length}/160
                  </span>
                </div>
                <textarea
                  bind:value={seoOverrides.metaDescription}
                  rows="3"
                  placeholder={excerpt}
                  class="input w-full resize-none"
                ></textarea>
              </div>

              <!-- Canonical URL -->
              <div>
                <label for="canonicalurl" class="label block text-xs uppercase mb-2"
                  >Canonical URL</label
                >
                <input
                  id="canonicalurl"
                  type="url"
                  bind:value={seoOverrides.canonicalUrl}
                  placeholder="https://yoursite.com/blog/{slug}"
                  class="input w-full"
                />
              </div>

              <!-- Robots -->
              <div class="card p-4">
                <h3 class="font-medium text-kitsuden-text mb-3 text-sm">Robots Meta</h3>
                <div class="space-y-3">
                  <label class="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      bind:checked={seoOverrides.robotsIndex}
                      class="w-4 h-4 rounded border-kitsuden-border"
                    />
                    <span class="text-sm">Allow search engines to index this page</span>
                  </label>
                  <label class="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      bind:checked={seoOverrides.robotsFollow}
                      class="w-4 h-4 rounded border-kitsuden-border"
                    />
                    <span class="text-sm">Allow search engines to follow links</span>
                  </label>
                </div>
              </div>

              <!-- OG Settings -->
              <div class="card p-4">
                <h3 class="font-medium text-kitsuden-text mb-3 text-sm flex items-center gap-2">
                  <Share2 class="w-4 h-4" />
                  Social Sharing (Open Graph)
                </h3>

                <div class="space-y-4">
                  <div>
                    <label for="ogtitle" class="label block text-xs mb-1.5">OG Title</label>
                    <input
                      id="ogtitle"
                      type="text"
                      bind:value={seoOverrides.ogTitle}
                      placeholder={seoOverrides.metaTitle || title}
                      class="input w-full text-sm"
                    />
                  </div>

                  <div>
                    <label for="ogdescription" class="label block text-xs mb-1.5"
                      >OG Description</label
                    >
                    <textarea
                      id="ogdescription"
                      bind:value={seoOverrides.ogDescription}
                      rows="2"
                      placeholder={seoOverrides.metaDescription || excerpt}
                      class="input w-full text-sm resize-none"
                    ></textarea>
                  </div>
                </div>
              </div>
            </div>

            <!-- Previews -->
            <div class="space-y-6">
              <div>
                <h2 class="text-lg font-semibold text-kitsuden-text mb-1">Previews</h2>
                <p class="text-sm text-kitsuden-subtle">See how your post will appear</p>
              </div>

              <!-- Google Preview -->
              <div>
                <h3 class="text-xs font-medium text-kitsuden-subtle uppercase tracking-wider mb-3">
                  Google Search
                </h3>
                <div class="bg-white rounded-lg p-4 font-sans">
                  <p class="text-[#1a0dab] text-lg truncate hover:underline cursor-pointer">
                    {metaTitlePreview || "Post Title"}
                  </p>
                  <p class="text-[#006621] text-xs mt-0.5">
                    yoursite.com › blog › {slug || "post-slug"}
                  </p>
                  <p class="text-[#545454] text-xs mt-1 line-clamp-2">
                    {metaDescPreview ||
                      "Add a meta description to improve your search result appearance and click-through rate."}
                  </p>
                </div>
              </div>

              <!-- Social Preview -->
              <div>
                <h3 class="text-xs font-medium text-kitsuden-subtle uppercase tracking-wider mb-3">
                  Social Share
                </h3>
                <div
                  class="rounded-lg overflow-hidden border border-kitsuden-border bg-kitsuden-card max-w-md"
                >
                  {#if featuredImageUrl}
                    <img src={featuredImageUrl} alt="" class="w-full h-48 object-cover" />
                  {:else}
                    <div class="w-full h-48 bg-kitsuden-border flex items-center justify-center">
                      <Image class="w-12 h-12 text-kitsuden-subtle/50" />
                    </div>
                  {/if}
                  <div class="p-3">
                    <p class="text-kitsuden-text font-semibold text-sm line-clamp-1">
                      {seoOverrides.ogTitle || seoOverrides.metaTitle || title || "Post Title"}
                    </p>
                    <p class="text-kitsuden-subtle text-xs mt-1 line-clamp-2">
                      {seoOverrides.ogDescription ||
                        seoOverrides.metaDescription ||
                        excerpt ||
                        "No description provided."}
                    </p>
                    <p class="text-kitsuden-subtle/60 text-[10px] mt-2 uppercase tracking-wider">
                      yoursite.com
                    </p>
                  </div>
                </div>
              </div>

              <!-- SEO Checklist -->
              <div class="card p-4">
                <h3 class="font-medium text-kitsuden-text mb-3 text-sm">SEO Checklist</h3>
                <div class="space-y-2">
                  {#each [{ label: "Title is set", pass: title.length > 0 }, { label: "Title length optimal (30-60)", pass: title.length >= 30 && title.length <= 60 }, { label: "Slug is set", pass: slug.length > 0 }, { label: "Content has 300+ chars", pass: content.length > 300 }, { label: "Excerpt is set", pass: excerpt.length > 0 }, { label: "Meta title optimized", pass: seoOverrides.metaTitle.length > 0 }, { label: "Meta description optimized", pass: seoOverrides.metaDescription.length > 0 }, { label: "Featured image selected", pass: !!featuredImageId }, { label: "Has at least one tag", pass: tags.length > 0 }] as check}
                    <div class="flex items-center gap-2 text-xs">
                      {#if check.pass}
                        <CheckCircle2 class="w-3.5 h-3.5 text-kitsuden-green shrink-0" />
                        <span class="text-kitsuden-text-dim">{check.label}</span>
                      {:else}
                        <div
                          class="w-3.5 h-3.5 rounded-full border border-kitsuden-subtle/30 shrink-0"
                        ></div>
                        <span class="text-kitsuden-subtle">{check.label}</span>
                      {/if}
                    </div>
                  {/each}
                </div>
              </div>
            </div>
          </div>
        </div>
      {/if}

      <!-- TAB: Settings -->
      {#if activeTab === "settings"}
        <div class="h-full overflow-y-auto p-6">
          <div class="max-w-2xl mx-auto space-y-8">
            <div>
              <h2 class="text-lg font-semibold text-kitsuden-text mb-1">Post Settings</h2>
              <p class="text-sm text-kitsuden-subtle">Advanced configuration options</p>
            </div>

            <!-- Publishing Settings -->
            <div class="card p-6 space-y-6">
              <h3 class="font-medium text-kitsuden-text flex items-center gap-2">
                <Calendar class="w-4 h-4" />
                Publishing Schedule
              </h3>

              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label for="status-2" class="label block text-xs mb-2">Status</label>
                  <select id="status-2" bind:value={status} class="select w-full">
                    <option value="draft">📝 Draft</option>
                    <option value="scheduled">📅 Scheduled</option>
                    <option value="published">🚀 Published</option>
                    <option value="archived">📦 Archived</option>
                  </select>
                </div>

                <!--
                  ── EL INTERRUPTOR QUE FALTABA ──────────────────────────────
                
                  La columna, la API y el bloque existian, y no habia forma de
                  tocarlo desde el panel: cerrar el hilo de un articulo solo se
                  podia con un PATCH a mano. En WordPress esto es la caja
                  «Discussion» de toda la vida.
                -->
                <div>
                  <label class="label flex items-center gap-2 text-xs cursor-pointer">
                    <input type="checkbox" bind:checked={commentsEnabled} class="checkbox" />
                    <span>Permitir comentarios</span>
                  </label>
                  <p class="text-xs opacity-60 mt-1">
                    {commentsEnabled
                      ? "Los lectores pueden comentar y votar en este articulo."
                      : "Hilo cerrado. Lo ya escrito no se borra: deja de admitirse mas."}
                  </p>
                </div>

                {#if status === "scheduled"}
                  <div>
                    <label
                      for="publishedat-2"
                      class="label block text-xs mb-2 flex items-center gap-1"
                    >
                      <Clock class="w-3 h-3" />
                      Publish At
                    </label>
                    <input
                      id="publishedat-2"
                      type="datetime-local"
                      bind:value={publishedAt}
                      class="input w-full"
                    />
                  </div>
                {/if}
              </div>
            </div>

            <!-- Author Settings -->
            <div class="card p-6 space-y-4">
              <h3 class="font-medium text-kitsuden-text flex items-center gap-2">
                <User class="w-4 h-4" />
                Author
              </h3>

              <select bind:value={authorId} class="select w-full">
                <option value="">Select author...</option>
                {#each availableAuthors as author}
                  <option value={author.id}>{author.name} ({author.email})</option>
                {/each}
              </select>
            </div>

            <!--
              Grupos de la comunidad de ESTA entrada: salen como dos tarjetas
              («Unirme al grupo de Facebook» / «de WhatsApp») al final del
              artículo. Vacío = el grupo general de la web (Ajustes → Redes).
            -->
            <div class="card p-6 space-y-4">
              <h3 class="font-medium text-kitsuden-text flex items-center gap-2">
                <Users class="w-4 h-4" />
                Grupos de la comunidad
              </h3>

              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label for="grupo-facebook" class="label block text-xs mb-2">Grupo de Facebook</label>
                  <input
                    id="grupo-facebook"
                    type="url"
                    bind:value={seoOverrides.facebookGroupUrl}
                    placeholder="https://www.facebook.com/groups/…"
                    class="input w-full"
                  />
                  {#if seoOverrides.facebookGroupUrl.trim() && !enlaceDeFacebookValido(seoOverrides.facebookGroupUrl)}
                    <p class="text-xs text-kitsuden-accent-2 mt-1">Tiene que ser un enlace de facebook.com: así no se enseñará.</p>
                  {/if}
                </div>
                <div>
                  <label for="grupo-whatsapp" class="label block text-xs mb-2">Grupo de WhatsApp</label>
                  <input
                    id="grupo-whatsapp"
                    type="url"
                    bind:value={seoOverrides.whatsappGroupUrl}
                    placeholder="https://chat.whatsapp.com/…"
                    class="input w-full"
                  />
                  {#if seoOverrides.whatsappGroupUrl.trim() && !enlaceDeWhatsappValido(seoOverrides.whatsappGroupUrl)}
                    <p class="text-xs text-kitsuden-accent-2 mt-1">Tiene que ser una invitación de chat.whatsapp.com: así no se enseñará.</p>
                  {/if}
                </div>
              </div>
              <p class="text-xs opacity-60">
                Vacío = el grupo general de la web. En WhatsApp, quien entra ve los números de los demás: activa «Aprobar nuevos participantes» en el grupo.
              </p>
            </div>

            <!-- Danger Zone -->
            {#if postId}
              <div class="card p-6 border-kitsuden-accent-2/30">
                <h3 class="font-medium text-kitsuden-accent-2 flex items-center gap-2 mb-4">
                  <Trash2 class="w-4 h-4" />
                  Danger Zone
                </h3>
                <p class="text-sm text-kitsuden-subtle mb-4">
                  Once deleted, this post cannot be recovered.
                </p>
                <button onclick={handleDelete} class="btn-danger">
                  <Trash2 class="w-4 h-4" />
                  Delete Post
                </button>
              </div>
            {/if}
          </div>
        </div>
      {/if}
    {/snippet}
    {#if showPreview}
      <div class="flex-1 overflow-hidden">
        <SplitPane show={true}>
          {#snippet left()}
            <div class="h-full overflow-hidden">
              {@render editorPanels()}
            </div>
          {/snippet}
          {#snippet right()}
            <LivePreview {title} {content} {excerpt} {featuredImageUrl} {slug} {status} {blocks} />
          {/snippet}
        </SplitPane>
      </div>
    {:else}
      <div class="flex-1 overflow-hidden">
        {@render editorPanels()}
      </div>
    {/if}
  {/if}
</div>

<!--
  El selector vive en `MediaPicker`, no aquí.

  Estuvo dentro de este fichero, y por eso la única pantalla del admin desde la
  que se podía elegir o subir una imagen era esta. Sacarlo es lo que le da la
  biblioteca al constructor de páginas y a los formularios de dataset.
-->
<MediaPicker
  open={showMediaModal}
  title={destinoDeLaImagen === "portada" ? "Imagen de portada" : "Insertar imagen en el texto"}
  selectedId={destinoDeLaImagen === "portada" ? featuredImageId : null}
  onSelect={elegirImagen}
  onClose={() => (showMediaModal = false)}
/>

<!-- Tag Selector Modal -->
<Modal open={showTagModal} title="Manage Tags" onClose={() => (showTagModal = false)}>
  <div class="p-4 space-y-4">
    <!-- New Tag Input -->
    <div class="flex gap-2">
      <input
        type="text"
        bind:value={newTagName}
        placeholder="New tag name..."
        class="input flex-1"
        onkeydown={(e) => e.key === "Enter" && createNewTag()}
      />
      <button onclick={createNewTag} class="btn-primary">
        <Plus class="w-4 h-4" />
      </button>
    </div>

    <!-- Available Tags -->
    <div class="border-t border-kitsuden-border pt-4">
      <p class="text-xs text-kitsuden-subtle mb-3">Click to toggle tags</p>
      <div class="flex flex-wrap gap-2 max-h-64 overflow-y-auto">
        {#each availableTags as tag}
          <button
            onclick={() => toggleTag(tag)}
            class="px-3 py-1.5 rounded-full text-sm transition-colors {tags.find(
              (t) => t.id === tag.id
            )
              ? 'bg-kitsuden-accent text-black'
              : 'bg-kitsuden-border/50 text-kitsuden-text hover:bg-kitsuden-border'}"
          >
            {tag.name}
          </button>
        {/each}
      </div>
    </div>
  </div>
</Modal>

<!-- Promote From Dataset Modal -->
<PromoteFromDataset
  isOpen={showDatasetModal}
  onClose={() => (showDatasetModal = false)}
  onSelect={handleDatasetSelect}
/>

<Modal open={showCategoryModal} title="Nueva categoría" onClose={() => (showCategoryModal = false)}>
  <div class="space-y-4">
    <div>
      <label for="cat-nombre" class="block text-sm font-medium text-kitsuden-text mb-1.5">
        Nombre
      </label>
      <input
        id="cat-nombre"
        type="text"
        bind:value={nuevaCategoria.name}
        placeholder="Guías"
        class="input w-full"
      />
      {#if nuevaCategoria.name.trim()}
        <p class="text-xs text-kitsuden-subtle mt-1">
          URL: <code>{generateSlug(nuevaCategoria.name)}</code>
        </p>
      {/if}
    </div>

    <div>
      <label for="cat-padre" class="block text-sm font-medium text-kitsuden-text mb-1.5">
        Dentro de
      </label>
      <select id="cat-padre" bind:value={nuevaCategoria.parentId} class="input w-full">
        <option value="">— Sin categoría superior —</option>
        {#each categoriasDisponibles as cat (cat.id)}
          <option value={cat.id}>{"— ".repeat(profundidadDe(cat))}{cat.name}</option>
        {/each}
      </select>
    </div>

    <div class="flex justify-end gap-2 pt-2">
      <button class="btn-ghost btn-sm" onclick={() => (showCategoryModal = false)}>
        Cancelar
      </button>
      <button
        class="btn-primary btn-sm"
        onclick={async () => {
          await crearCategoria();
          showCategoryModal = false;
        }}
        disabled={!nuevaCategoria.name.trim()}
      >
        Crear
      </button>
    </div>
  </div>
</Modal>

<style>
  /* Custom scrollbar for the editor */
  :global(.overflow-y-auto::-webkit-scrollbar) {
    width: 6px;
  }
  :global(.overflow-y-auto::-webkit-scrollbar-track) {
    background: transparent;
  }
  :global(.overflow-y-auto::-webkit-scrollbar-thumb) {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 3px;
  }
  :global(.overflow-y-auto::-webkit-scrollbar-thumb:hover) {
    background: rgba(255, 255, 255, 0.2);
  }
</style>
