<script lang="ts">
  import { t as tr, localeFormato } from "$lib/i18n";
  import {
    Search,
    Filter,
    Plus,
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
    ArrowUpDown,
    ArrowUp,
    ArrowDown,
    Eye,
    EyeOff,
    Edit,
    Trash2,
    Download,
    RefreshCw,
    X,
    Check,
    ExternalLink,
    Mail,
    FileJson,
    Columns3,
    Copy,
  } from "lucide-svelte";
  import { onMount, untrack } from "svelte";

  import type {
    AdminConfig,
    SchemaColumn,
    KanbanView,
    CalendarView as CalendarViewType,
    RowAction,
  } from "$lib/types/admin";

  import { toast } from "svelte-sonner";

  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";

  import AutoFormModal from "./AutoFormModal.svelte";
  import CalendarView from "./CalendarView.svelte";
  import KanbanBoard from "./KanbanBoard.svelte";

  interface TableSchema {
    name: string;
    columns: SchemaColumn[];
    primaryKey: string;
  }

  interface Props {
    grimoireId: string;
    config?: AdminConfig;
    viewId?: string;
    /** All tables in this grimoire (for inline relation detection) */
    allTables?: Array<{ name: string; label: string }>;
  }

  let { grimoireId, config, viewId, allTables }: Props = $props();

  // State
  let loading = $state(true);
  let data = $state<any[]>([]);
  let selectedRows = $state<Set<string>>(new Set());
  let searchQuery = $state("");
  let currentPage = $state(1);
  let pageSize = $state(25);
  let totalCount = $state(0);
  // Multi-column sort: array of { column, direction } in priority order
  let sortStack = $state<{ column: string; direction: "asc" | "desc" }[]>([]);
  // Backward-compatible single sort accessors
  const sortColumn = $derived(sortStack[0]?.column || null);
  const sortDirection = $derived<"asc" | "desc">(sortStack[0]?.direction || "asc");
  // Column visibility
  let hiddenColumns = $state<Set<string>>(new Set());
  let showColumnMenu = $state(false);
  let activeFilters = $state<Record<string, any>>({});
  let showFilters = $state(false);
  let schema = $state<TableSchema | null>(null);
  let bulkActionLoading = $state(false);

  // Modal state
  let showFormModal = $state(false);
  let editRecord = $state<Record<string, any> | null>(null);
  let showDeleteConfirm = $state(false);
  let deleteTarget = $state<any>(null);
  let deleting = $state(false);
  let showBulkDeleteConfirm = $state(false);

  // FK display cache: { "games": { "uuid-123": "Fortnite" } }
  let fkDisplayCache = $state<Record<string, Record<string, string>>>({});
  // FK options for filter dropdowns
  let filterRelationOptions = $state<Record<string, { value: string; label: string }[]>>({});

  // Dynamic table discovery for grimoires
  let discoveredViews = $state<Array<{ id: string; type: "grid"; title: string; table: string }>>(
    []
  );

  // View tabs (when config has multiple views) + discovered views
  const views = $derived([
    ...(config?.views || []),
    ...discoveredViews.filter(
      (dv) => !(config?.views || []).some((cv: any) => cv.table === dv.table)
    ),
  ]);

  /**
   * La pestaña activa y la tabla que enseña
   * --------------------------------------------------------------------------
   *
   * ── EL FALLO QUE ESTO ARREGLA ────────────────────────────────────────────
   *
   * `activeView` se derivaba de la PROP `viewId`, y el clic en una pestaña
   * escribía en un `activeViewId` local que solo alimentaba el color del botón.
   * Resultado: la pestaña se marcaba como activa, `loadData()` volvía a pedir
   * la tabla ANTERIOR, y `loadSchema()` ni se llamaba.
   *
   * Se veía como una incoherencia sin causa aparente: la pestaña «Temas»
   * resaltada, la cabecera del botón diciendo «Agregar Perfil usuario
   * capacitaciones» y debajo las filas de otra tabla. Tres cosas en pantalla
   * describiendo tres estados distintos.
   *
   * Ahora `activeViewId` es la única fuente: la prop solo lo INICIALIZA, y todo
   * lo demás se deriva de él.
   *
   * ── SIN TABLA NO HAY TABLA ───────────────────────────────────────────────
   *
   * `tablaActiva` puede ser `null`, y eso es una respuesta válida: una vista de
   * tipo `dashboard`, `custom` o `element` no tiene tabla que enseñar.
   *
   * Antes caía a `|| grimoireId`, que convertía «esta vista no es una tabla» en
   * «la tabla se llama kon-booking». El panel pedía el esquema de una tabla con
   * ese nombre, no existía, y el diagnóstico que enseñaba era
   *
   *     Could not load schema for table "kon-booking"
   *
   * es decir: el id del kon disfrazado de tabla que falta. Un respaldo que
   * fabrica un nombre falso cuesta más de depurar que la ausencia del dato.
   */
  let activeViewId = $state("");

  const activeView = $derived(views.find((v) => v.id === activeViewId) || views[0]);

  /** Nombre de la tabla de la vista activa, o `null` si la vista no muestra una. */
  const tablaActiva = $derived<string | null>((activeView as any)?.table ?? null);

  const displayTable = $derived(tablaActiva ?? grimoireId);

  /**
   * Nombre para el botón «Agregar», o `null` si no hay uno de fiar.
   *
   * ── POR QUE YA NO SE SINGULARIZA ─────────────────────────────────────────
   *
   * Aquí había una regla que quitaba la `s` o la `es` final del título de la
   * vista. Con «Cursos» → «Curso» funcionaba, y por eso pasó. Con la primera
   * vista en inglés produjo esto:
   *
   *     "All Games".replace(/e?s$/i, "")  →  "All Gam"
   *
   * Y el botón decía **«Agregar All Gam»**. La regla no falla: acierta a veces,
   * que es peor — nadie la revisa hasta que sale una palabra rota en pantalla.
   *
   * La forma correcta en esta arquitectura es la misma que para todo lo demás:
   * **el kon lo declara**. Si no lo declara, el botón dice «Agregar» a secas,
   * que no es tan bonito pero nunca es una palabra inventada. El contexto —el
   * título de la pantalla, justo encima— ya dice de qué.
   */
  const etiquetaDeAlta = $derived.by<string | null>(() => {
    const vista = activeView as { singularName?: string } | undefined;
    if (vista?.singularName) return vista.singularName;

    /**
     * ── LA ETIQUETA ES LA DE LA TABLA QUE SE ESTA VIENDO ───────────────────
     *
     * `config.singularName` sale de `grimoire.tables[0].label`: la PRIMERA
     * tabla del kon, fija, la misma para todas las pestañas. En CardSim, que
     * tiene siete tablas y ninguna vista declarada, eso significaba estar en
     * «Cartas» y que el botón dijera **«Agregar Juegos»** — porque
     * `cardsim_games` es la primera de la lista.
     *
     * Es la misma familia que el `apiBase` que servía la primera tabla a las
     * once pestañas de Academy: coger `[0]` y llamarlo «el del kon» acierta
     * mientras solo hay uno.
     *
     * Se busca la etiqueta de `tablaActiva` en las tablas que el kon declara.
     * Si no está —una vista sin tabla, o una tabla descubierta que el
     * manifiesto no nombra— se cae a lo de antes y, si tampoco, el botón dice
     * «Agregar» a secas: nunca una palabra que no toca.
     */
    const deLaTabla = allTables?.find((t) => t.name === tablaActiva)?.label;
    if (deLaTabla) return deLaTabla;

    return config?.singularName || null;
  });

  const columns = $derived<SchemaColumn[]>(schema?.columns || generateColumnsFromData(data));

  // Separate columns for display vs filtering
  const visibleColumns = $derived(columns.filter((c) => !hiddenColumns.has(c.name)));
  const displayColumns = $derived(visibleColumns.slice(0, 12));
  const filterableColumns = $derived(
    columns.filter(
      (c) =>
        c.name !== "id" &&
        !c.name.endsWith("At") &&
        c.name !== "created_at" &&
        c.name !== "updated_at" &&
        c.type !== "json"
    )
  );

  // Search fields: all text-like columns
  const searchFields = $derived(
    columns
      .filter(
        (c) =>
          ["text", "string", "varchar", "email", "url"].includes(c.type || "") ||
          [
            "name",
            "title",
            "label",
            "slug",
            "description",
            "displayName",
            "display_name",
            "email",
          ].includes(c.name)
      )
      .map((c) => c.name)
  );

  // ── Row Actions ──
  const rowActions = $derived<RowAction[]>((activeView as any)?.rowActions || []);

  /**
   * Filtro fijo de la vista, declarado en el `kon.json` del kon.
   *
   * No es lo mismo que `activeFilters`: este lo pone el manifiesto y define QUE
   * ES la pestaña —«Borradores» son los que tienen `status: draft`—, mientras
   * que `activeFilters` es lo que añade quien mira. Por eso se aplica siempre,
   * incluso cuando la persona ha limpiado sus filtros: sin el, «Borradores»
   * dejaria de ser «Borradores».
   */
  const filtroDeLaVista = $derived<Record<string, unknown>>(
    (activeView as any)?.defaultFilter ?? {}
  );

  /**
   * La prop `viewId` INICIALIZA la pestaña; no la gobierna.
   *
   * ── EL BUCLE QUE ESTO EVITA ──────────────────────────────────────────────
   *
   * La versión anterior de este efecto hacía, sin más:
   *
   *     const pedida = viewId || config?.defaultView;
   *     if (pedida && views.some(...)) activeViewId = pedida;
   *     else if (!activeViewId && ...) activeViewId = views[0].id;
   *
   * y leía `activeViewId` en la segunda rama, así que el efecto era DEPENDIENTE
   * de `activeViewId`. Al pulsar una pestaña, `switchView` escribía
   * `activeViewId = otra`, eso volvía a disparar el efecto, `pedida` seguía
   * siendo la prop original… y lo devolvía a su sitio. La pestaña rebotaba en
   * el mismo instante en que la pulsabas.
   *
   * Es peor que el fallo que vino a corregir: antes las pestañas no hacían nada
   * porque `activeView` no dependía de `activeViewId`; después no hacían nada
   * porque el efecto las revertía. Desde fuera se veía idéntico.
   *
   * ── LA REGLA ─────────────────────────────────────────────────────────────
   *
   * La prop se aplica UNA vez por cada valor nuevo de la prop. Lo que el
   * usuario haga después manda hasta que la prop vuelva a cambiar — que es lo
   * que ocurre al navegar desde el menú lateral, y entonces sí debe imponerse.
   *
   * `untrack` en la lectura de `activeViewId` es la otra mitad: sin él, el
   * efecto seguiría reaccionando a sus propias escrituras.
   */
  let ultimaPropAplicada = $state<string | undefined>(undefined);

  $effect(() => {
    const pedida = viewId || config?.defaultView;
    const disponibles = views;

    if (pedida !== ultimaPropAplicada) {
      ultimaPropAplicada = pedida;
      if (pedida && disponibles.some((v) => v.id === pedida)) {
        activeViewId = pedida;
        return;
      }
    }

    // Primera pintada sin nada elegido: se abre la primera pestaña.
    if (!untrack(() => activeViewId) && disponibles.length > 0) {
      activeViewId = disponibles[0]!.id;
    }
  });

  const API_URL = import.meta.env.VITE_API_URL ?? "";

  /**
   * Build the full API endpoint for the current table.
   *
   * Handles three cases:
   * 1. No apiEndpoint → falls back to /api/explorer/{tableName}
   * 2. Full endpoint path (e.g., /api/datasets/id/entries, /api/explorer/games) → use as-is
   * 3. Base path (e.g., /api/directory, /api/crm) → append table name
   *
   * We detect "full path" vs "base path" by checking segment count:
   *   /api/explorer/games → 3 segments → full (used as-is)
   *   /api/datasets/id/entries → 4 segments → full (used as-is)
   *   /api/directory → 2 segments → base (needs table appended)
   *   /api/crm → 2 segments → base (needs table appended)
   */
  function getEndpoint(tblName?: string): string {
    const table = tblName ?? tablaActiva ?? grimoireId;
    const base = config?.apiEndpoint;
    if (!base) return `/api/explorer/${table}`;
    // Count path segments after removing leading slash
    const segments = base.replace(/^\//, "").split("/");
    // If 3+ segments (e.g., /api/explorer/games, /api/datasets/id/entries), it's a full path
    if (segments.length >= 3) return base;
    // 2 segments (e.g., /api/directory, /api/crm) → append table name
    return `${base}/${table}`;
  }

  /** The base API endpoint (without table) — used by AutoFormModal */
  const apiBaseEndpoint = $derived.by(() => {
    const ep = config?.apiEndpoint;
    if (!ep) return undefined;
    const segments = ep.replace(/^\//, "").split("/");
    // Only pass base paths (/api/directory, /api/crm) — 2 segments
    // Full paths (/api/explorer/games, /api/datasets/id/entries) should not be passed
    return segments.length <= 2 ? ep : undefined;
  });

  // FK column detection
  const FK_TABLE_MAP: Record<string, string> = {
    game_id: "games",
    gameId: "games",
    platform_id: "platforms",
    platformId: "platforms",
    tag_id: "tags",
    tagId: "tags",
    streamer_id: "streamers",
    streamerId: "streamers",
    collection_id: "collections",
    collectionId: "collections",
    user_id: "auth_users",
    userId: "auth_users",
    author_id: "auth_users",
    authorId: "auth_users",
    assigned_to_id: "auth_users",
    assignedToId: "auth_users",
    contact_id: "contacts",
    contactId: "contacts",
    dataset_id: "datasets",
    datasetId: "datasets",
    cover_art_id: "media",
    coverArtId: "media",
    featured_image_id: "media",
    featuredImageId: "media",
    avatar_id: "media",
    avatarId: "media",
    icon_id: "media",
    iconId: "media",
    thumbnail_id: "media",
    thumbnailId: "media",
    uploaded_by_id: "auth_users",
    uploadedById: "auth_users",
    created_by_id: "auth_users",
    createdById: "auth_users",
  };

  function isRelationColumn(colName: string): boolean {
    return colName.endsWith("_id") || (colName.endsWith("Id") && colName !== "id");
  }

  function getRelatedTable(colName: string): string | undefined {
    if (FK_TABLE_MAP[colName]) return FK_TABLE_MAP[colName];
    const base = colName.replace(/_id$/, "").replace(/Id$/, "");
    return base.endsWith("s") ? base : base + "s";
  }

  onMount(async () => {
    /**
     * ── EL DESCUBRIMIENTO ES PARA CUANDO NO HAY MANIFIESTO ──────────────────
     *
     * Mira qué tablas tiene el kon EN LA BASE y les inventa un nombre a partir
     * del nombre de la tabla (`cardsim_games` → «Cardsim games»). Sirve para el
     * caso de cero configuración: sueltas un directorio con su `kon.json` y
     * aparece en el panel.
     *
     * Pero si el kon YA DECLARA sus tablas, esto sobra y estorba. En CardSim se
     * veía así: la fila de pestañas de arriba con las etiquetas buenas —Juegos,
     * Cartas, Mazos…— y JUSTO DEBAJO otra fila con las mismas siete tablas
     * rebautizadas «Cardsim games», «Cardsim decks»… Dos veces lo mismo, una
     * con nombres peores.
     *
     * La condición anterior era `config.views.length === 0`, y no bastaba:
     * `onMount` corre en el primer render, cuando el contenedor todavía no ha
     * resuelto qué vista está activa, así que `config.views` llega vacío y el
     * descubrimiento se dispara igual.
     *
     * `allTables` viene del manifiesto y es estable desde el primer momento.
     * Si trae algo, el manifiesto manda y no hay nada que descubrir — además,
     * el explorador solo puede abrir tablas declaradas, así que descubrir otras
     * no serviría de nada.
     */
    const elKonDeclaraSusTablas = (allTables?.length ?? 0) > 0;
    if (elKonDeclaraSusTablas) return;

    if (!config?.views || config.views.length === 0) {
      await discoverGrimoireTables();
    }
  });

  /**
   * Recarga esquema y datos cada vez que cambia la tabla que se enseña.
   *
   * Esto era un `onMount`, y por eso cambiar de pestaña no recargaba nada:
   * `onMount` corre UNA vez por montaje, y el router de SvelteKit reutiliza el
   * componente. La pestaña cambiaba, la tabla de abajo no.
   *
   * Es el mismo fallo que ya se corrigió en `GrimoirePage` y en
   * `CustomViewHost`: en Svelte 5, «cuando esto cambie» es `$effect`, no
   * `onMount`. Aquí se repitió porque se arregló caso por caso en lugar de
   * buscar el patrón.
   *
   * La dependencia es `tablaActiva` y no `activeViewId` a propósito: dos
   * pestañas pueden apuntar a la MISMA tabla con filtros distintos (Blog tiene
   * «Borradores» y «Programados», las dos sobre `blog_posts`), y ahí recargar
   * el esquema no aporta nada.
   */
  $effect(() => {
    const tabla = tablaActiva;
    if (!tabla) {
      // Una vista sin tabla —panel, vista propia— no tiene nada que pedir.
      // Se limpia lo anterior para no enseñar las filas de la pestaña previa
      // debajo de una vista que no las ha pedido.
      schema = null;
      data = [];
      totalCount = 0;
      loading = false;
      return;
    }

    // Los ajustes de la pestaña anterior no valen para esta tabla: un filtro
    // sobre una columna que aquí no existe devuelve cero filas sin explicar por
    // qué, y el orden apuntaría a una columna inexistente.
    currentPage = 1;
    sortStack = [];
    activeFilters = {};
    hiddenColumns = new Set();
    schema = null;

    /**
     * ── POR QUE `untrack` SI AQUI YA HAY UN `await` ─────────────────────────
     *
     * Porque el aislamiento no puede depender de un detalle sutil. Svelte 5
     * deja de rastrear lecturas después del primer `await`, así que esta carga
     * PROBABLEMENTE no se realimenta hoy. «Probablemente» y «sutil» es
     * exactamente como sobrevivió el mismo fallo en el otro explorador, donde
     * la llamada era síncrona y ataba el efecto a lo que la propia carga
     * escribe: cargar provocaba cargar.
     *
     * Decirlo explícitamente no cuesta nada —`untrack` no cambia lo que se
     * ejecuta, solo de qué se depende— y hace que la garantía se lea en el
     * código en vez de deducirse del orden de los `await`.
     */
    untrack(() => {
      void (async () => {
        await loadSchema();
        await loadData();
      })();
    });
  });

  /**
   * Cambiar de PESTAÑA recarga los datos, aunque la tabla sea la misma.
   *
   * El efecto de arriba depende de `tablaActiva`, y su propio comentario ya
   * decía que dos pestañas pueden compartir tabla con filtros distintos —
   * «Borradores» y «Programados» de Blog, las dos sobre `blog_posts`—. Pero
   * entonces `tablaActiva` no cambia, el efecto no se dispara y la rejilla se
   * queda con las filas de la pestaña anterior. Con el filtro ya en su sitio,
   * eso significaría enseñar los borradores bajo el título «Programados».
   *
   * Se salta la primera pasada: el efecto de la tabla ya carga al abrir, y sin
   * esto se harían dos peticiones idénticas nada más entrar.
   */
  let vistaYaCargada = $state<string | null>(null);

  $effect(() => {
    const vista = activeViewId;
    if (!vista || !untrack(() => tablaActiva)) return;

    if (vistaYaCargada === null) {
      vistaYaCargada = vista;
      return;
    }
    if (vistaYaCargada === vista) return;

    vistaYaCargada = vista;
    untrack(() => {
      currentPage = 1;
      activeFilters = {};
      void loadData();
    });
  });

  async function discoverGrimoireTables() {
    try {
      const res = await fetch(`${API_URL}/api/explorer/discover/${grimoireId}`, {
        credentials: "include",
      });
      if (res.ok) {
        const result = await res.json();
        if (result.tables && result.tables.length > 0) {
          discoveredViews = result.tables.map((t: any) => ({
            id: `grid-${t.name}`,
            type: "grid" as const,
            // Si el manifiesto le puso nombre, ese. Humanizar el nombre de la
            // tabla es el ÚLTIMO recurso, no el primero: «Cardsim games» es
            // peor que «Juegos» en todos los idiomas.
            title:
              allTables?.find((d) => d.name === t.name)?.label ??
              t.name.replace(/_/g, " ").replace(/^\w/, (c: string) => c.toUpperCase()),
            table: t.name,
          }));
          // If no config, build one from discovered tables
          if (!config) {
            config = {
              name: grimoireId
                .replace(/^grimoire-/, "")
                .replace(/_/g, " ")
                .replace(/^\w/, (c) => c.toUpperCase()),
              singularName: tr("dataExplorer.registro"),
              views: discoveredViews,
              apiEndpoint: `/api/explorer/${result.tables[0].name}`,
            };
          }
        }
      }
    } catch (e) {
      console.warn("[DataExplorer] Discovery failed, using defaults:", e);
    }
  }

  function generateColumnsFromData(rows: any[]): SchemaColumn[] {
    if (!rows.length) return [];
    return Object.keys(rows[0]).map((key) => ({
      name: key,
      type: typeof rows[0][key],
      nullable: true,
    }));
  }

  // ── Schema-first loading ──
  async function loadSchema() {
    const tableName = tablaActiva;
    if (!tableName) return;

    // If using custom apiEndpoint (like /api/directory), skip schema introspection
    // and generate columns from data instead
    if (config?.apiEndpoint && !config.apiEndpoint.includes("/api/explorer")) {
      console.log(
        `[DataExplorer] Using custom API endpoint ${config.apiEndpoint}, skipping schema introspection`
      );
      schema = null; // Will generate columns from data
      return;
    }

    // Try endpoint 1: /api/explorer/schema/json/:table
    try {
      const res = await fetch(`${API_URL}/api/explorer/schema/json/${tableName}`, {
        credentials: "include",
      });
      if (res.ok) {
        const jsonSchema = await res.json();
        if (jsonSchema.properties) {
          const cols: SchemaColumn[] = Object.entries(jsonSchema.properties).map(
            ([name, prop]: [string, any]) => ({
              name,
              type: inferTypeFromJsonSchema(prop),
              nullable: !jsonSchema.required?.includes(name),
              isPrimary: name === jsonSchema["x-kitsuden"]?.primaryKey,
            })
          );
          schema = {
            name: tableName,
            columns: cols,
            primaryKey: jsonSchema["x-kitsuden"]?.primaryKey || "id",
          };
          return;
        }
      }
    } catch {
      // Continue to fallback
    }

    // Try endpoint 2: /api/schema/tables/:table (schema introspection)
    try {
      const res = await fetch(`${API_URL}/api/schema/tables/${tableName}`, {
        credentials: "include",
      });
      if (res.ok) {
        const result = await res.json();
        if (result.table) {
          const introspected = result.table;
          const cols: SchemaColumn[] = introspected.columns.map((c: any) => ({
            name: c.name,
            type: c.type || inferTypeFromDbType(c.type),
            nullable: c.nullable !== false,
            isPrimary: introspected.primaryKey?.includes(c.name),
          }));
          schema = {
            name: tableName,
            columns: cols,
            primaryKey: introspected.primaryKey?.[0] || "id",
          };
          return;
        }
      }
    } catch {
      // Schema endpoint might not exist for this table — will infer from data
    }
  }

  function inferTypeFromDbType(dataType: string): string {
    const type = dataType?.toLowerCase() || "";
    if (type.includes("int")) return "number";
    if (type.includes("float") || type.includes("decimal") || type.includes("numeric"))
      return "number";
    if (type.includes("bool")) return "boolean";
    if (type.includes("timestamp") || type.includes("date")) return "date";
    if (type.includes("json")) return "json";
    if (type.includes("uuid")) return "uuid";
    return "text";
  }

  function inferTypeFromJsonSchema(prop: any): string {
    if (prop["x-relation"]) return "relation";
    if (prop.format === "date-time") return "date";
    if (prop.format === "email") return "email";
    if (prop.format === "uri") return "url";
    if (prop.format === "uuid" && !prop["x-relation"]) return "id";
    if (prop.type === "boolean") return "boolean";
    if (prop.type === "integer" || prop.type === "number") return "number";
    if (prop.type === "object") return "json";
    if (prop.readOnly) return "readonly";
    return "text";
  }

  async function loadData() {
    loading = true;
    try {
      const params = new URLSearchParams();
      params.set("limit", String(pageSize));
      params.set("page", String(currentPage));

      // Global search across ALL text columns
      if (searchQuery) {
        params.set("search", searchQuery);
        // Fallback for APIs that don't support global search
        if (searchFields.length > 0) {
          params.set("search_fields", searchFields.join(","));
          // Also send legacy single-field filter for backward compat
          params.set("filter_field", searchFields[0]);
          params.set("filter_op", "contains");
          params.set("filter_value", searchQuery);
        }
      }

      // Multi-column sort
      if (sortStack.length > 0) {
        params.set(
          "sort",
          sortStack.map((s) => `${s.direction === "desc" ? "-" : ""}${s.column}`).join(",")
        );
        // Legacy single sort for backward compat
        params.set("dir", sortStack[0].direction);
      }

      // Apply active filters
      Object.entries(activeFilters).forEach(([key, value]) => {
        if (value !== undefined && value !== "" && value !== null) {
          params.set("filter_field", key);
          if (typeof value === "boolean") {
            params.set("filter_op", "equals");
            params.set("filter_value", String(value));
          } else {
            params.set("filter_op", "contains");
            params.set("filter_value", String(value));
          }
        }
      });

      /**
       * El filtro de la vista va DESPUES, y con `equals`.
       *
       * Después porque define qué es la pestaña y no puede quedar pisado por lo
       * que haya elegido quien mira; la API solo admite un filtro por petición
       * (`filter_field` es una clave única en la URL), así que el orden ES la
       * precedencia.
       *
       * `equals` y no `contains` porque un `contains` sobre estados haría que
       * «draft» encajara con cualquier estado que lo contenga. Hoy ninguno lo
       * hace; mañana un `draft_review` rompería «Borradores» sin tocar nada.
       */
      Object.entries(filtroDeLaVista).forEach(([key, value]) => {
        if (value === undefined || value === null || value === "") return;
        params.set("filter_field", key);
        params.set("filter_op", "equals");
        params.set("filter_value", String(value));
      });

      const tableName = tablaActiva;
      if (!tableName) return;
      const endpoint = getEndpoint(tableName);

      const res = await fetch(`${API_URL}${endpoint}?${params}`, {
        credentials: "include",
      });

      if (res.ok) {
        const result = await res.json();
        // Sobre una variable local: leer `data` justo después de asignarlo
        // vuelve a atar la función a su propia salida en cuanto alguien la
        // llame desde un efecto. Ver la nota de arriba.
        const filas = result.data || result.docs || result;
        data = filas;
        totalCount = result.pagination?.total || result.totalDocs || result.total || filas.length;

        // If we didn't get schema from the schema endpoint, infer from data
        if (!schema && result.columns && result.columns.length > 0) {
          schema = {
            name: tableName,
            columns: result.columns.map((col: any) => ({
              name: col.field,
              type: col.type,
              nullable: true,
            })),
            primaryKey: "id",
          };
        }

        // Load FK display values for relation columns
        await loadFkDisplayValues();
      }
    } catch (e) {
      console.error("Failed to load data", e);
    } finally {
      loading = false;
    }
  }

  async function loadFkDisplayValues() {
    const relationCols = columns.filter((c) => isRelationColumn(c.name));
    if (relationCols.length === 0 || data.length === 0) return;

    for (const col of relationCols) {
      const relTable = getRelatedTable(col.name);
      if (!relTable || fkDisplayCache[relTable]) continue;

      try {
        const res = await fetch(`${API_URL}/api/explorer/${relTable}/options`, {
          credentials: "include",
        });
        if (res.ok) {
          const result = await res.json();
          const map: Record<string, string> = {};
          const options: { value: string; label: string }[] = [];
          for (const opt of result.options || []) {
            map[String(opt.value)] = opt.label;
            options.push(opt);
          }
          fkDisplayCache[relTable] = map;
          fkDisplayCache = { ...fkDisplayCache }; // trigger reactivity
          // Store options for filter dropdowns
          filterRelationOptions[col.name] = options;
          filterRelationOptions = { ...filterRelationOptions };
        }
      } catch {
        // FK table not in registry — skip silently
      }
    }
  }

  function resolveFkDisplay(colName: string, rawValue: any): string {
    if (rawValue === null || rawValue === undefined) return "-";
    const relTable = getRelatedTable(colName);
    if (relTable && fkDisplayCache[relTable]) {
      return fkDisplayCache[relTable][String(rawValue)] || String(rawValue).slice(0, 8) + "…";
    }
    return String(rawValue).slice(0, 8) + "…";
  }

  async function handleInlineEdit(rowId: string, field: string, value: any) {
    const endpoint = getEndpoint();
    try {
      const res = await fetch(`${API_URL}${endpoint}/${rowId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ [field]: value }),
      });

      if (!res.ok) {
        console.error("Failed to update", await res.text());
      }
    } catch (e) {
      console.error("Error updating record", e);
    }
  }

  async function handleDelete(record: any) {
    deleting = true;
    const endpoint = getEndpoint();
    try {
      const res = await fetch(`${API_URL}${endpoint}/${record.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        showDeleteConfirm = false;
        deleteTarget = null;
        await loadData();
      } else {
        console.error("Failed to delete", await res.text());
      }
    } catch (e) {
      console.error("Error deleting record", e);
    } finally {
      deleting = false;
    }
  }

  // ── Row Actions ──
  async function executeRowAction(action: RowAction, row: any) {
    if (action.confirm && !confirm(action.confirm)) return;
    const endpoint = getEndpoint();
    try {
      const url = action.endpoint
        ? `${API_URL}${endpoint}/${row.id}/${action.endpoint}`
        : `${API_URL}${endpoint}/${row.id}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: action.id }),
      });
      if (res.ok) {
        if (action.refresh) await loadData();
      } else {
        console.error("Row action failed", await res.text());
      }
    } catch (e) {
      console.error("Error executing row action", e);
    }
  }

  function getRowActionClasses(variant?: string): string {
    const base =
      "group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all duration-200 text-xs font-medium ";
    switch (variant) {
      case "success":
        return (
          base +
          "bg-emerald-500/5 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500/30"
        );
      case "warning":
        return (
          base +
          "bg-amber-500/5 border-amber-500/20 text-amber-400 hover:bg-amber-500/10 hover:border-amber-500/30"
        );
      case "danger":
        return (
          base +
          "bg-red-500/5 border-red-500/20 text-red-400 hover:bg-red-500/10 hover:border-red-500/30"
        );
      case "primary":
        return (
          base +
          "bg-kitsuden-accent/5 border-kitsuden-accent/20 text-kitsuden-accent hover:bg-kitsuden-accent/10 hover:border-kitsuden-accent/30"
        );
      default:
        return (
          base +
          "bg-kitsuden-surface border-kitsuden-border text-kitsuden-text hover:bg-kitsuden-accent/5 hover:border-kitsuden-accent/20 hover:text-kitsuden-accent"
        );
    }
  }

  // ── Bulk Actions ──
  function deselectAll() {
    selectedRows = new Set();
  }

  function getSelectedRows() {
    return data.filter((row) => selectedRows.has(row.id));
  }

  function hasStatusField() {
    return data.length > 0 && data.some((row) => row.status !== undefined);
  }

  async function handleBulkStatusUpdate(status: string) {
    if (selectedRows.size === 0) return;
    bulkActionLoading = true;
    const endpoint = getEndpoint();
    for (const id of selectedRows) {
      try {
        await fetch(`${API_URL}${endpoint}/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ status }),
        });
      } catch {}
    }
    bulkActionLoading = false;
    await loadData();
  }

  async function handleBulkPublish() {
    await handleBulkStatusUpdate("published");
  }

  async function handleBulkUnpublish() {
    await handleBulkStatusUpdate("draft");
  }

  async function handleBulkDuplicate() {
    if (selectedRows.size === 0) return;
    bulkActionLoading = true;
    const endpoint = getEndpoint();
    const selectedData = getSelectedRows();
    for (const row of selectedData) {
      try {
        const copy = { ...row };
        delete copy.id;
        delete copy.createdAt;
        delete copy.updatedAt;
        if (copy.status !== undefined) copy.status = "draft";
        if (copy.title) copy.title = `${copy.title} (Copy)`;

        await fetch(`${API_URL}${endpoint}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(copy),
        });
      } catch {}
    }
    selectedRows = new Set();
    bulkActionLoading = false;
    await loadData();
  }

  function confirmBulkDelete() {
    showBulkDeleteConfirm = true;
  }

  async function executeBulkDelete() {
    showBulkDeleteConfirm = false;
    bulkActionLoading = true;
    const endpoint = getEndpoint();
    for (const id of selectedRows) {
      try {
        await fetch(`${API_URL}${endpoint}/${id}`, {
          method: "DELETE",
          credentials: "include",
        });
      } catch {}
    }
    selectedRows = new Set();
    bulkActionLoading = false;
    await loadData();
  }

  function handleExportCsv() {
    /**
     * Sin filas no hay nada que exportar — pero hay que DECIRLO.
     *
     * Antes era un `return` a secas: se pulsaba «Exportar», no pasaba
     * absolutamente nada, no salía ningún mensaje y no se descargaba ningún
     * fichero. Desde fuera es indistinguible de un botón roto, y es justo el
     * caso más frecuente en una instalación nueva, donde las tablas están
     * vacías.
     */
    if (data.length === 0) {
      toast.info(tr("dataExplorer.noHayNadaQueExportar"));
      return;
    }
    const headers = Object.keys(data[0]);
    const csvRows = [
      headers.join(","),
      ...data.map((row) =>
        headers
          .map((h) => {
            const val = row[h];
            if (val === null || val === undefined) return "";
            const str = typeof val === "object" ? JSON.stringify(val) : String(val);
            return str.includes(",") || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
          })
          .join(",")
      ),
    ];
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${grimoireId}-export.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * `?crear=1` abre el formulario de alta nada más entrar.
   *
   * Hace falta porque desde otras pantallas se enlaza «crear un X», y sin esto
   * lo único que se puede hacer es llevar a la lista y esperar que la persona
   * vuelva a pulsar. El botón «New Game» de la vista de juegos hacía
   * exactamente eso: navegaba a esta pantalla y ahí se quedaba, de modo que
   * parecía que no hacía nada.
   *
   * Se limpia el parámetro de la URL después: si no, recargar o volver atrás
   * reabriría el formulario una y otra vez.
   */
  let altaPorUrlHecha = $state(false);

  $effect(() => {
    if (altaPorUrlHecha) return;
    if (!browser) return;
    if ($page.url.searchParams.get("crear") !== "1") return;
    if (!tablaActiva) return;

    altaPorUrlHecha = true;
    untrack(() => {
      void openCreateModal();
      const limpia = new URL($page.url);
      limpia.searchParams.delete("crear");
      void goto(`${limpia.pathname}${limpia.search}`, { replaceState: true, noScroll: true });
    });
  });

  async function openCreateModal() {
    /**
     * Sin tabla no se abre el formulario.
     *
     * El respaldo `?? grimoireId` se quitó de `tablaActiva` hace tiempo por
     * fabricar nombres falsos, y seguía vivo justo aquí, en el sitio donde más
     * duele: el modal pedía el esquema de una tabla llamada como el kon y
     * enseñaba «Could not load schema for table "kon-character-builder"» — el id del kon
     * disfrazado de tabla que falta.
     *
     * Decirlo es más útil que inventarlo: si la vista activa no tiene tabla,
     * no hay nada que dar de alta desde aquí.
     */
    if (!tablaActiva) {
      toast.error(tr("dataExplorer.estaVistaNoTieneUna"));
      return;
    }

    // Ensure schema is loaded before opening modal
    if (!schema || columns.length === 0) {
      await loadSchema();
    }
    editRecord = null;
    showFormModal = true;
  }

  async function openEditModal(row: any) {
    // Ensure schema is loaded before opening modal
    if (!schema || columns.length === 0) {
      await loadSchema();
    }
    editRecord = { ...row };
    showFormModal = true;
  }

  function confirmDelete(row: any) {
    deleteTarget = row;
    showDeleteConfirm = true;
  }

  function handleSort(column: string, multi = false) {
    const existing = sortStack.findIndex((s) => s.column === column);

    if (multi) {
      // Shift+click: add/toggle column in multi-sort stack
      if (existing >= 0) {
        const current = sortStack[existing];
        if (current.direction === "desc") {
          // Third click: remove from stack
          sortStack = sortStack.filter((_, i) => i !== existing);
        } else {
          sortStack = sortStack.map((s, i) => (i === existing ? { ...s, direction: "desc" } : s));
        }
      } else {
        sortStack = [...sortStack, { column, direction: "asc" }];
      }
    } else {
      // Normal click: single-column sort
      if (existing >= 0 && sortStack.length === 1) {
        const current = sortStack[0];
        if (current.direction === "desc") {
          sortStack = []; // Third click: clear sort
        } else {
          sortStack = [{ column, direction: "desc" }];
        }
      } else {
        sortStack = [{ column, direction: "asc" }];
      }
    }
    loadData();
  }

  function getSortIndex(column: string): number {
    return sortStack.findIndex((s) => s.column === column);
  }

  function getSortDir(column: string): "asc" | "desc" | null {
    const s = sortStack.find((s) => s.column === column);
    return s?.direction || null;
  }

  function toggleColumnVisibility(colName: string) {
    const newSet = new Set(hiddenColumns);
    if (newSet.has(colName)) {
      newSet.delete(colName);
    } else {
      newSet.add(colName);
    }
    hiddenColumns = newSet;
  }

  function showAllColumns() {
    hiddenColumns = new Set();
  }

  function handleSortClick(column: string, e: MouseEvent) {
    handleSort(column, e.shiftKey);
  }

  function handleSearch(e: Event) {
    searchQuery = (e.target as HTMLInputElement).value;
    currentPage = 1;
    loadData();
  }

  function applyFilter(field: string, value: any) {
    if (value === "" || value === null || value === undefined) {
      const { [field]: _, ...rest } = activeFilters;
      activeFilters = rest;
    } else {
      activeFilters = { ...activeFilters, [field]: value };
    }
    currentPage = 1;
    loadData();
  }

  function clearAllFilters() {
    activeFilters = {};
    currentPage = 1;
    loadData();
  }

  function toggleRowSelection(id: string) {
    const newSet = new Set(selectedRows);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    selectedRows = newSet;
  }

  function toggleAllSelection() {
    if (selectedRows.size === data.length) {
      selectedRows = new Set();
    } else {
      selectedRows = new Set(data.map((row) => row.id));
    }
  }

  function getCellValue(row: any, column: string) {
    return column.split(".").reduce((obj, key) => obj?.[key], row);
  }

  // ── Typed Cell Rendering ──
  function getColumnType(colName: string): string {
    const col = columns.find((c) => c.name === colName);
    if (col?.type) return col.type;
    // Infer from name patterns
    if (isRelationColumn(colName)) return "relation";
    if (colName.includes("url") || colName.includes("Url")) return "url";
    if (colName.includes("email")) return "email";
    if (colName.includes("color") || colName.includes("Color")) return "color";
    if (
      colName.endsWith("At") ||
      colName.endsWith("_at") ||
      colName.includes("date") ||
      colName.includes("Date")
    )
      return "date";
    return "text";
  }

  function formatValue(value: any): string {
    if (value === null || value === undefined) return "-";
    if (typeof value === "boolean") return value ? "✓" : "✗";
    if (value instanceof Date) return value.toLocaleDateString(localeFormato());
    if (typeof value === "object") return JSON.stringify(value).slice(0, 50) + "...";
    return String(value);
  }

  function formatDate(value: any): string {
    if (!value) return "-";
    try {
      const d = new Date(value);
      if (isNaN(d.getTime())) return String(value);
      return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    } catch {
      return String(value);
    }
  }

  function formatDateTime(value: any): string {
    if (!value) return "-";
    try {
      const d = new Date(value);
      if (isNaN(d.getTime())) return String(value);
      return d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return String(value);
    }
  }

  /**
   * Cambia de pestaña.
   *
   * No recarga nada por su cuenta: escribe el estado y el `$effect` de arriba
   * se encarga. Antes llamaba a `loadData()` directamente —y a `loadSchema()`
   * nunca—, así que la carga y la pestaña podían acabar describiendo tablas
   * distintas.
   *
   * También actualiza la URL, porque `/g/[id]/[viewId]` existe como ruta: sin
   * esto, recargar la página devolvía a la primera pestaña y no se podía
   * enlazar una vista concreta.
   */
  function switchView(vId: string) {
    if (vId === activeViewId) return;
    activeViewId = vId;

    if (typeof window !== "undefined") {
      const destino = `/g/${grimoireId}/${vId}`;
      if (window.location.pathname !== destino) {
        // `replaceState` y no `goto`: navegar remontaría el componente y
        // perdería el estado que acabamos de fijar.
        window.history.replaceState(window.history.state, "", destino);
      }
    }
  }

  function getFilterInputType(col: SchemaColumn): string {
    if (isRelationColumn(col.name)) return "relation";
    const t = col.type?.toLowerCase() || "text";
    if (t === "boolean") return "boolean";
    if (t === "number" || t === "integer") return "number";
    if (t === "date") return "date";
    return "text";
  }

  const totalPages = $derived(Math.ceil(totalCount / pageSize));
  const activeFilterCount = $derived(Object.keys(activeFilters).length);
</script>

<!-- View-type routing -->
{#if activeView?.type === "kanban"}
  <KanbanBoard view={activeView as KanbanView} apiEndpoint={config?.apiEndpoint} />
{:else if activeView?.type === "calendar"}
  <CalendarView view={activeView as CalendarViewType} apiEndpoint={config?.apiEndpoint} />
{:else}
  <!-- Grid View (default) -->
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-xl font-semibold text-kitsuden-text">
          {config?.name || activeView?.title || grimoireId}
        </h1>
        <p class="text-sm text-kitsuden-text-dim">
          {tr("dataExplorer.records", { v: totalCount.toLocaleString(localeFormato()) })}
        </p>
      </div>

      <div class="flex items-center gap-2">
        <button
          class="group inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-xl bg-kitsuden-surface border border-kitsuden-border text-kitsuden-text hover:bg-kitsuden-accent/5 hover:border-kitsuden-accent/20 hover:text-kitsuden-accent transition-all duration-200"
          onclick={() => loadData()}
          title={tr("dataExplorer.actualizar")}
        >
          <RefreshCw class="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" />
          <span class="hidden sm:inline">{tr("dataExplorer.actualizar")}</span>
        </button>

        <button
          class="group inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-xl bg-kitsuden-surface border border-kitsuden-border text-kitsuden-text hover:bg-emerald-500/5 hover:border-emerald-500/20 hover:text-emerald-400 transition-all duration-200"
          onclick={handleExportCsv}
          title={tr("dataExplorer.exportarComoCsv")}
        >
          <Download class="w-4 h-4 group-hover:translate-y-0.5 transition-transform" />
          <span class="hidden sm:inline">{tr("dataExplorer.exportar")}</span>
        </button>

        <button
          class="group inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-kitsuden-accent to-kitsuden-accent text-black rounded-xl font-semibold shadow-lg shadow-kitsuden-accent/25 hover:shadow-kitsuden-accent/40 hover:scale-105 active:scale-95 transition-all duration-200"
          onclick={openCreateModal}
        >
          <Plus class="w-4 h-4 group-hover:rotate-90 transition-transform duration-300" />
          <span>{tr("dataExplorer.agregar")}{etiquetaDeAlta ? ` ${etiquetaDeAlta}` : ""}</span>
        </button>
      </div>
    </div>

    <!-- View Tabs (when multiple views exist) -->
    {#if views.length > 1}
      <div
        class="flex items-center gap-1 p-1 bg-kitsuden-bg border border-kitsuden-border rounded-lg w-fit"
      >
        {#each views as v}
          <button
            class="px-3 py-1.5 text-sm rounded-md transition-colors {activeView?.id === v.id
              ? 'bg-kitsuden-card text-kitsuden-text shadow-sm'
              : 'text-kitsuden-text-dim hover:text-kitsuden-text'}"
            onclick={() => switchView(v.id)}
          >
            {v.title}
          </button>
        {/each}
      </div>
    {/if}

    <!-- Toolbar -->
    <div
      class="flex items-center gap-3 p-3 bg-kitsuden-card border border-kitsuden-border rounded-lg"
    >
      <div class="relative flex-1 max-w-md">
        <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-kitsuden-text-dim" />
        <input
          type="text"
          placeholder={tr("dataExplorer.buscarEnTodosLosCampos")}
          class="input pl-10 w-full"
          value={searchQuery}
          oninput={handleSearch}
        />
      </div>

      <button
        class="group inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-xl bg-kitsuden-surface border border-kitsuden-border text-kitsuden-text hover:bg-kitsuden-accent/5 hover:border-kitsuden-accent/20 transition-all duration-200 {showFilters
          ? 'bg-kitsuden-accent/10 text-kitsuden-accent border-kitsuden-accent/30'
          : ''}"
        onclick={() => (showFilters = !showFilters)}
      >
        <Filter class="w-4 h-4 group-hover:scale-110 transition-transform" />
        <span class="hidden sm:inline">{tr("dataExplorer.filtros")}</span>
        {#if activeFilterCount > 0}
          <span
            class="ml-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-kitsuden-accent text-white"
          >
            {activeFilterCount}
          </span>
        {/if}
      </button>

      <!-- Column Visibility Toggle -->
      <div class="relative">
        <button
          class="group inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-xl bg-kitsuden-surface border border-kitsuden-border text-kitsuden-text hover:bg-kitsuden-accent/5 hover:border-kitsuden-accent/20 transition-all duration-200 {showColumnMenu
            ? 'bg-kitsuden-accent/10 text-kitsuden-accent border-kitsuden-accent/30'
            : ''}"
          onclick={() => (showColumnMenu = !showColumnMenu)}
          title={tr("dataExplorer.mostrarOcultarColumnas")}
        >
          <Columns3 class="w-4 h-4 group-hover:scale-110 transition-transform" />
          <span class="hidden sm:inline">{tr("dataExplorer.columnas")}</span>
          {#if hiddenColumns.size > 0}
            <span
              class="ml-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-500 text-white"
            >
              {hiddenColumns.size}
            </span>
          {/if}
        </button>

        {#if showColumnMenu}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="fixed inset-0 z-40" onclick={() => (showColumnMenu = false)}></div>
          <div
            class="absolute right-0 top-full mt-1 z-50 w-56 bg-kitsuden-card border border-kitsuden-border rounded-lg shadow-xl p-2 max-h-80 overflow-y-auto"
          >
            <div class="flex items-center justify-between px-2 py-1 mb-1">
              <p class="text-xs font-semibold text-kitsuden-subtle uppercase tracking-wider">
                {tr("dataExplorer.columns")}
              </p>
              {#if hiddenColumns.size > 0}
                <button
                  class="text-[10px] text-kitsuden-accent hover:underline"
                  onclick={showAllColumns}>{tr("dataExplorer.showAll")}</button
                >
              {/if}
            </div>
            {#each columns as col}
              <label
                class="flex items-center gap-2 px-2 py-1.5 hover:bg-kitsuden-bg rounded cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={!hiddenColumns.has(col.name)}
                  onchange={() => toggleColumnVisibility(col.name)}
                  class="w-3.5 h-3.5 rounded border-kitsuden-border accent-kitsuden-accent"
                />
                <span class="text-sm text-kitsuden-text-dim truncate">
                  {col.name
                    .replace(/([A-Z])/g, " $1")
                    .replace(/_/g, " ")
                    .replace(/^\w/, (c) => c.toUpperCase())
                    .trim()}
                </span>
              </label>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Sort indicator -->
      {#if sortStack.length > 0}
        <div class="flex items-center gap-1 text-xs text-kitsuden-subtle">
          <ArrowUpDown class="w-3.5 h-3.5" />
          {tr("dataExplorer.sort", { sortStackCount: sortStack.length })}{sortStack.length > 1 ? "s" : ""}
          <button
            class="text-kitsuden-accent hover:underline ml-1"
            onclick={() => {
              sortStack = [];
              loadData();
            }}>{tr("dataExplorer.clear")}</button
          >
        </div>
      {/if}
    </div>

    <!-- Filter Sidebar -->
    {#if showFilters}
      <div class="p-4 bg-kitsuden-card border border-kitsuden-border rounded-lg space-y-3">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-semibold text-kitsuden-text">{tr("dataExplorer.filters")}</h3>
          {#if activeFilterCount > 0}
            <button class="text-xs text-kitsuden-accent hover:underline" onclick={clearAllFilters}>
              {tr("dataExplorer.clearAll", { activeFilterCount })}
            </button>
          {/if}
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {#each filterableColumns.slice(0, 12) as col}
            {@const filterType = getFilterInputType(col)}
            <div>
              <label
                for="filter-{col.name}"
                class="block text-xs font-medium text-kitsuden-text-dim mb-1"
              >
                {col.name
                  .replace(/_id$/, "")
                  .replace(/Id$/, "")
                  .replace(/([A-Z])/g, " $1")
                  .replace(/_/g, " ")
                  .replace(/^\w/, (c) => c.toUpperCase())
                  .trim()}
              </label>

              {#if filterType === "boolean"}
                <select
                  id="filter-{col.name}"
                  class="input w-full text-sm"
                  value={activeFilters[col.name] ?? ""}
                  onchange={(e) => {
                    const v = (e.target as HTMLSelectElement).value;
                    applyFilter(col.name, v === "" ? null : v === "true");
                  }}
                >
                  <option value="">{tr("dataExplorer.all")}</option>
                  <option value="true">{tr("common.yes")}</option>
                  <option value="false">{tr("common.no")}</option>
                </select>
              {:else if filterType === "relation"}
                <select
                  id="filter-{col.name}"
                  class="input w-full text-sm"
                  value={activeFilters[col.name] ?? ""}
                  onchange={(e) =>
                    applyFilter(col.name, (e.target as HTMLSelectElement).value || null)}
                >
                  <option value="">{tr("dataExplorer.all")}</option>
                  {#if filterRelationOptions[col.name]}
                    {#each filterRelationOptions[col.name] as opt}
                      <option value={opt.value}>{opt.label}</option>
                    {/each}
                  {/if}
                </select>
              {:else if filterType === "number"}
                <input
                  id="filter-{col.name}"
                  type="number"
                  class="input w-full text-sm"
                  placeholder={tr("dataExplorer.filtrar")}
                  value={activeFilters[col.name] ?? ""}
                  onchange={(e) =>
                    applyFilter(col.name, (e.target as HTMLInputElement).value || null)}
                />
              {:else if filterType === "date"}
                <input
                  id="filter-{col.name}"
                  type="date"
                  class="input w-full text-sm"
                  value={activeFilters[col.name] ?? ""}
                  onchange={(e) =>
                    applyFilter(col.name, (e.target as HTMLInputElement).value || null)}
                />
              {:else}
                <input
                  id="filter-{col.name}"
                  type="text"
                  class="input w-full text-sm"
                  placeholder={tr("dataExplorer.filtrar")}
                  value={activeFilters[col.name] ?? ""}
                  oninput={(e) =>
                    applyFilter(col.name, (e.target as HTMLInputElement).value || null)}
                />
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Bulk Actions Bar -->
    {#if selectedRows.size > 0}
      <div
        class="sticky top-4 z-20 flex flex-wrap items-center justify-between gap-3 p-3 bg-kitsuden-card border border-kitsuden-border rounded-lg shadow-lg shadow-black/10"
      >
        <div class="flex items-center gap-3">
          <span
            class="px-2.5 py-1 text-sm font-medium rounded-full bg-kitsuden-accent/10 text-kitsuden-accent border border-kitsuden-accent/20"
          >
            {tr("dataExplorer.selected", { size: selectedRows.size })}
          </span>
          {#if selectedRows.size < data.length}
            <button
              class="text-xs text-kitsuden-text-dim hover:text-kitsuden-accent transition-colors"
              onclick={() => {
                selectedRows = new Set(data.map((row) => row.id));
              }}
            >
              {tr("dataExplorer.selectAll", { dataCount: data.length })}
            </button>
          {:else}
            <button
              class="text-xs text-kitsuden-text-dim hover:text-kitsuden-accent transition-colors"
              onclick={deselectAll}
            >
              {tr("dataExplorer.deselectAll")}
            </button>
          {/if}
        </div>

        <div class="flex items-center gap-2">
          {#if hasStatusField()}
            <button
              class="group inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-kitsuden-surface border border-kitsuden-border text-kitsuden-text hover:bg-emerald-500/10 hover:border-emerald-500/30 hover:text-emerald-400 transition-all duration-200 disabled:opacity-50"
              onclick={handleBulkPublish}
              disabled={bulkActionLoading}
              title={tr("dataExplorer.publishSelected")}
            >
              <Eye class="w-3.5 h-3.5" />
              {tr("dataExplorer.publish")}
            </button>
            <button
              class="group inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-kitsuden-surface border border-kitsuden-border text-kitsuden-text hover:bg-amber-500/10 hover:border-amber-500/30 hover:text-amber-400 transition-all duration-200 disabled:opacity-50"
              onclick={handleBulkUnpublish}
              disabled={bulkActionLoading}
              title={tr("dataExplorer.unpublishSelected")}
            >
              <EyeOff class="w-3.5 h-3.5" />
              {tr("dataExplorer.unpublish")}
            </button>
          {/if}

          <button
            class="group inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-kitsuden-surface border border-kitsuden-border text-kitsuden-text hover:bg-kitsuden-accent/10 hover:border-kitsuden-accent/30 hover:text-kitsuden-accent transition-all duration-200 disabled:opacity-50"
            onclick={handleBulkDuplicate}
            disabled={bulkActionLoading}
            title={tr("dataExplorer.duplicateSelected")}
          >
            <Copy class="w-3.5 h-3.5" />
            {tr("dataExplorer.duplicate")}
          </button>

          <div class="w-px h-6 bg-kitsuden-border mx-1"></div>

          <button
            class="group inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-gradient-to-r from-red-500/10 to-red-600/10 text-red-400 border border-red-500/20 hover:from-red-500/20 hover:to-red-600/20 hover:border-red-500/30 transition-all duration-200 disabled:opacity-50"
            onclick={confirmBulkDelete}
            disabled={bulkActionLoading}
            title={tr("dataExplorer.deleteSelected")}
          >
            <Trash2 class="w-3.5 h-3.5 group-hover:animate-pulse" />
            {tr("common.delete")}
          </button>
        </div>
      </div>
    {/if}

    <!-- Data Table -->
    <div class="border border-kitsuden-border rounded-lg overflow-hidden bg-kitsuden-card">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-kitsuden-border bg-kitsuden-bg">
              <th class="w-10 p-3">
                <input
                  type="checkbox"
                  checked={data.length > 0 && selectedRows.size === data.length}
                  indeterminate={selectedRows.size > 0 && selectedRows.size < data.length}
                  onchange={toggleAllSelection}
                  class="w-4 h-4 rounded border-kitsuden-border accent-kitsuden-accent"
                />
              </th>
              {#each displayColumns as column}
                {@const dir = getSortDir(column.name)}
                {@const idx = getSortIndex(column.name)}
                <th class="p-3 text-left">
                  <button
                    class="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider transition-colors {dir
                      ? 'text-kitsuden-accent'
                      : 'text-kitsuden-subtle hover:text-kitsuden-accent'}"
                    onclick={(e) => handleSortClick(column.name, e)}
                    title={tr("dataExplorer.clicParaOrdenarShiftClic")}
                  >
                    {#if isRelationColumn(column.name)}
                      {column.name
                        .replace(/_id$/, "")
                        .replace(/Id$/, "")
                        .replace(/_/g, " ")
                        .replace(/^\w/, (c) => c.toUpperCase())}
                    {:else}
                      {column.name
                        .replace(/([A-Z])/g, " $1")
                        .replace(/_/g, " ")
                        .replace(/^\w/, (c) => c.toUpperCase())
                        .trim()}
                    {/if}
                    {#if dir === "asc"}
                      <ArrowUp class="w-3 h-3" />
                    {:else if dir === "desc"}
                      <ArrowDown class="w-3 h-3" />
                    {:else}
                      <ArrowUpDown class="w-3 h-3 opacity-0 group-hover:opacity-30" />
                    {/if}
                    {#if sortStack.length > 1 && idx >= 0}
                      <span
                        class="text-[9px] font-bold bg-kitsuden-accent/20 text-kitsuden-accent rounded-full w-4 h-4 flex items-center justify-center"
                        >{idx + 1}</span
                      >
                    {/if}
                  </button>
                </th>
              {/each}
              <th
                class="p-3 text-right text-xs font-semibold uppercase tracking-wider text-kitsuden-subtle"
                >{tr("common.acciones")}</th
              >
            </tr>
          </thead>
          <tbody>
            {#if loading}
              {#each Array(5) as _, i}
                <tr class="border-b border-kitsuden-border">
                  {#each Array(Math.min(displayColumns.length + 2, 10)) as __}
                    <td class="p-3">
                      <div class="h-4 bg-kitsuden-border/30 rounded animate-pulse"></div>
                    </td>
                  {/each}
                </tr>
              {/each}
            {:else if data.length === 0}
              <tr>
                <td colspan="100" class="p-12 text-center">
                  <div class="flex flex-col items-center gap-3">
                    <div
                      class="w-12 h-12 rounded-full bg-kitsuden-border/20 flex items-center justify-center"
                    >
                      <FileJson class="w-6 h-6 text-kitsuden-subtle" />
                    </div>
                    <p class="text-kitsuden-text-dim">{tr("dataExplorer.noSeEncontraronRegistros")}</p>
                    {#if searchQuery || activeFilterCount > 0}
                      <button
                        class="text-xs px-3 py-1.5 rounded-lg bg-kitsuden-accent/10 text-kitsuden-accent hover:bg-kitsuden-accent/20 transition-colors"
                        onclick={() => {
                          searchQuery = "";
                          clearAllFilters();
                        }}
                      >
                        {tr("dataExplorer.limpiarBusquedaYFiltros")}
                      </button>
                    {/if}
                  </div>
                </td>
              </tr>
            {:else}
              {#each data as row}
                <tr
                  class="border-b border-kitsuden-border hover:bg-kitsuden-accent/[0.03] transition-colors"
                >
                  <td class="p-3">
                    <input
                      type="checkbox"
                      checked={selectedRows.has(row.id)}
                      onchange={() => toggleRowSelection(row.id)}
                      class="w-4 h-4 rounded border-kitsuden-border accent-kitsuden-accent"
                    />
                  </td>
                  {#each displayColumns as column}
                    {@const value = getCellValue(row, column.name)}
                    {@const colType = getColumnType(column.name)}
                    <td class="p-3">
                      <!-- BOOLEAN: colored badge -->
                      {#if colType === "boolean"}
                        {#if value === true}
                          <span
                            class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          >
                            <Check class="w-3 h-3" /> {tr("dataExplorer.si")}
                          </span>
                        {:else if value === false}
                          <span
                            class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20"
                          >
                            <X class="w-3 h-3" /> {tr("common.no")}
                          </span>
                        {:else}
                          <span class="text-kitsuden-subtle">-</span>
                        {/if}

                        <!-- DATE: formatted -->
                      {:else if colType === "date"}
                        <span
                          class="text-kitsuden-text-dim text-xs"
                          title={value ? String(value) : ""}
                        >
                          {formatDateTime(value)}
                        </span>

                        <!-- RELATION: FK badge -->
                      {:else if colType === "relation" || isRelationColumn(column.name)}
                        <span
                          class="inline-flex items-center px-2 py-0.5 rounded-md bg-kitsuden-surface text-xs font-medium text-kitsuden-text-dim"
                          title={String(value || "")}
                        >
                          {resolveFkDisplay(column.name, value)}
                        </span>

                        <!-- URL: clickable link -->
                      {:else if colType === "url"}
                        {#if value}
                          <a
                            href={value}
                            target="_blank"
                            rel="noopener"
                            class="inline-flex items-center gap-1 text-kitsuden-accent hover:underline text-xs truncate max-w-[200px]"
                            onclick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink class="w-3 h-3 shrink-0" />
                            {String(value)
                              .replace(/^https?:\/\//, "")
                              .slice(0, 30)}
                          </a>
                        {:else}
                          <span class="text-kitsuden-subtle">-</span>
                        {/if}

                        <!-- EMAIL: clickable mailto -->
                      {:else if colType === "email"}
                        {#if value}
                          <a
                            href="mailto:{value}"
                            class="inline-flex items-center gap-1 text-kitsuden-accent hover:underline text-xs"
                            onclick={(e) => e.stopPropagation()}
                          >
                            <Mail class="w-3 h-3 shrink-0" />
                            {value}
                          </a>
                        {:else}
                          <span class="text-kitsuden-subtle">-</span>
                        {/if}

                        <!-- COLOR: swatch + hex -->
                      {:else if colType === "color"}
                        {#if value}
                          <div class="flex items-center gap-2">
                            <div
                              class="w-5 h-5 rounded border border-kitsuden-border shrink-0"
                              style="background-color: {value}"
                            ></div>
                            <span class="text-xs text-kitsuden-text-dim font-mono">{value}</span>
                          </div>
                        {:else}
                          <span class="text-kitsuden-subtle">-</span>
                        {/if}

                        <!-- ID: truncated mono -->
                      {:else if colType === "id"}
                        <span class="text-xs text-kitsuden-subtle font-mono" title={value}>
                          {value ? String(value).slice(0, 8) + "…" : "-"}
                        </span>

                        <!-- IMAGE: thumbnail (detect by column name) -->
                      {:else if column.name === "image" || column.name === "portada" || column.name === "cover" || column.name === "thumbnailUrl" || column.name === "thumbnail_url"}
                        {#if value}
                          <img
                            src={value}
                            alt=""
                            class="w-10 h-10 object-cover rounded border border-kitsuden-border"
                          />
                        {:else}
                          <div
                            class="w-10 h-10 bg-kitsuden-border/30 rounded flex items-center justify-center text-xs text-kitsuden-text-dim"
                          >
                            N/A
                          </div>
                        {/if}

                        <!-- JSON: preview -->
                      {:else if colType === "json"}
                        {#if value !== null && value !== undefined}
                          <span
                            class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-kitsuden-surface text-kitsuden-subtle"
                            title={JSON.stringify(value, null, 2)}
                          >
                            <FileJson class="w-3 h-3" />
                            {Array.isArray(value)
                              ? `[${value.length}]`
                              : `{${Object.keys(value).length}}`}
                          </span>
                        {:else}
                          <span class="text-kitsuden-subtle">-</span>
                        {/if}

                        <!-- NUMBER: formatted -->
                      {:else if colType === "number"}
                        <span class="text-kitsuden-text tabular-nums">
                          {value !== null && value !== undefined
                            ? Number(value).toLocaleString(localeFormato())
                            : "-"}
                        </span>

                        <!-- DEFAULT TEXT -->
                      {:else}
                        <span class="text-kitsuden-text truncate max-w-[250px] block">
                          {formatValue(value)}
                        </span>
                      {/if}
                    </td>
                  {/each}
                  <td class="p-3 text-right">
                    <div class="flex items-center justify-end gap-2 flex-wrap">
                      {#each rowActions as action}
                        {@const visible =
                          !action.showIf || row[action.showIf.field] === action.showIf.equals}
                        {#if visible}
                          <button
                            class={getRowActionClasses(action.variant)}
                            title={action.label}
                            onclick={() => executeRowAction(action, row)}
                          >
                            <span>{action.label}</span>
                          </button>
                        {/if}
                      {/each}
                      <button
                        class="group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-kitsuden-surface border border-kitsuden-border text-kitsuden-text hover:bg-kitsuden-accent/10 hover:border-kitsuden-accent/30 hover:text-kitsuden-accent transition-all duration-200"
                        title={tr("dataExplorer.editar")}
                        onclick={() => openEditModal(row)}
                      >
                        <Edit class="w-3.5 h-3.5" />
                        <span class="text-xs font-medium">{tr("dataExplorer.editar")}</span>
                      </button>
                      <button
                        class="group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-kitsuden-surface border border-kitsuden-border text-kitsuden-text hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-400 transition-all duration-200"
                        title={tr("common.eliminar")}
                        onclick={() => confirmDelete(row)}
                      >
                        <Trash2 class="w-3.5 h-3.5" />
                        <span class="text-xs font-medium">{tr("common.eliminar")}</span>
                      </button>
                    </div>
                  </td>
                </tr>
              {/each}
            {/if}
          </tbody>
        </table>
      </div>

      <!-- Pagination -->
      <div class="flex items-center justify-between p-3 border-t border-kitsuden-border">
        <div class="text-sm text-kitsuden-text-dim">
          {#if totalCount > 0}
            {tr("dataExplorer.showingToOf", { v: (currentPage - 1) * pageSize + 1, v2: Math.min(
              currentPage * pageSize,
              totalCount
            ), totalCount })}
          {:else}
            {tr("dataExplorer.noRecords")}
          {/if}
        </div>

        <div class="flex items-center gap-2">
          <select
            class="px-3 py-2 text-sm rounded-xl bg-kitsuden-surface border border-kitsuden-border text-kitsuden-text focus:outline-none focus:ring-2 focus:ring-kitsuden-accent/50 focus:border-kitsuden-accent/50 transition-all duration-200 hover:border-kitsuden-accent/30 cursor-pointer"
            bind:value={pageSize}
            onchange={() => {
              currentPage = 1;
              loadData();
            }}
          >
            <option value={10}>{tr("dataExplorer.n10PorPagina")}</option>
            <option value={25}>{tr("dataExplorer.n25PorPagina")}</option>
            <option value={50}>{tr("dataExplorer.n50PorPagina")}</option>
            <option value={100}>{tr("dataExplorer.n100PorPagina")}</option>
          </select>

          <div
            class="flex items-center gap-1 bg-kitsuden-surface border border-kitsuden-border rounded-xl p-1"
          >
            <button
              class="group p-2 rounded-lg text-kitsuden-text-dim hover:bg-kitsuden-accent/10 hover:text-kitsuden-accent disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-all duration-200"
              disabled={currentPage === 1}
              onclick={() => {
                currentPage = 1;
                loadData();
              }}
              title={tr("dataExplorer.primeraPagina")}
            >
              <ChevronsLeft class="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
            </button>
            <button
              class="group p-2 rounded-lg text-kitsuden-text-dim hover:bg-kitsuden-accent/10 hover:text-kitsuden-accent disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-all duration-200"
              disabled={currentPage === 1}
              onclick={() => {
                currentPage--;
                loadData();
              }}
              title={tr("dataExplorer.paginaAnterior")}
            >
              <ChevronLeft class="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
            </button>

            <span
              class="px-4 py-1 text-sm font-semibold text-kitsuden-text tabular-nums bg-kitsuden-bg rounded-lg border border-kitsuden-border min-w-[80px] text-center"
            >
              {currentPage} / {totalPages || 1}
            </span>

            <button
              class="group p-2 rounded-lg text-kitsuden-text-dim hover:bg-kitsuden-accent/10 hover:text-kitsuden-accent disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-all duration-200"
              disabled={currentPage >= totalPages}
              onclick={() => {
                currentPage++;
                loadData();
              }}
              title={tr("dataExplorer.paginaSiguiente")}
            >
              <ChevronRight class="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </button>
            <button
              class="group p-2 rounded-lg text-kitsuden-text-dim hover:bg-kitsuden-accent/10 hover:text-kitsuden-accent disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-all duration-200"
              disabled={currentPage >= totalPages}
              onclick={() => {
                currentPage = totalPages;
                loadData();
              }}
              title={tr("dataExplorer.ultimaPagina")}
            >
              <ChevronsRight class="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- Auto-Form Modal -->
<!--
  Sin tabla no se pinta el formulario. Es la otra mitad del guardia de
  `openCreateModal`: la condición de render y la de apertura tienen que decir
  lo mismo, o el tipo miente en una de las dos.
-->
{#if showFormModal && tablaActiva}
  <AutoFormModal
    tableName={tablaActiva}
    {columns}
    editData={editRecord}
    apiEndpoint={apiBaseEndpoint}
    {grimoireId}
    onsave={() => loadData()}
    onclose={() => {
      showFormModal = false;
      editRecord = null;
    }}
  />
{/if}

<!-- Delete Confirmation Modal -->
{#if showDeleteConfirm && deleteTarget}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
    onclick={() => {
      showDeleteConfirm = false;
      deleteTarget = null;
    }}
  >
    <div
      class="bg-kitsuden-card border border-kitsuden-border rounded-xl shadow-2xl p-6 max-w-sm w-full"
      onclick={(e) => e.stopPropagation()}
    >
      <div class="flex items-center gap-3 mb-4">
        <div class="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
          <Trash2 class="w-6 h-6 text-red-400" />
        </div>
        <div>
          <h3 class="text-lg font-semibold text-kitsuden-text">{tr("dataExplorer.eliminarRegistro")}</h3>
          <p class="text-sm text-kitsuden-text-dim">{tr("dataExplorer.estaAccionNoSePuede")}</p>
        </div>
      </div>
      <div class="flex items-center justify-end gap-3">
        <button
          class="px-5 py-2.5 text-sm font-medium rounded-xl bg-kitsuden-surface border border-kitsuden-border text-kitsuden-text hover:bg-kitsuden-bg transition-all duration-200"
          onclick={() => {
            showDeleteConfirm = false;
            deleteTarget = null;
          }}
        >
          {tr("common.cancelar")}
        </button>
        <button
          class="group inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-xl bg-gradient-to-r from-red-500 to-red-600 text-white shadow-lg shadow-red-500/25 hover:shadow-red-500/40 hover:scale-105 active:scale-95 transition-all duration-200 disabled:opacity-50 disabled:hover:scale-100"
          disabled={deleting}
          onclick={() => handleDelete(deleteTarget)}
        >
          <Trash2 class="w-4 h-4 group-hover:animate-bounce" />
          {deleting ? tr("dataExplorer.eliminando") : tr("common.eliminar")}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Bulk Delete Confirmation Modal -->
{#if showBulkDeleteConfirm}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
    onclick={() => {
      showBulkDeleteConfirm = false;
    }}
  >
    <div
      class="bg-kitsuden-card border border-kitsuden-border rounded-xl shadow-2xl p-6 max-w-sm w-full"
      onclick={(e) => e.stopPropagation()}
    >
      <div class="flex items-center gap-3 mb-4">
        <div class="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
          <Trash2 class="w-6 h-6 text-red-400" />
        </div>
        <div>
          <h3 class="text-lg font-semibold text-kitsuden-text">
            {tr("dataExplorer.deleteRecords", { size: selectedRows.size })}
          </h3>
          <p class="text-sm text-kitsuden-text-dim">{tr("dataExplorer.thisActionCannotBeUndone")}</p>
        </div>
      </div>
      <div class="flex items-center justify-end gap-3">
        <button
          class="px-5 py-2.5 text-sm font-medium rounded-xl bg-kitsuden-surface border border-kitsuden-border text-kitsuden-text hover:bg-kitsuden-bg transition-all duration-200"
          onclick={() => {
            showBulkDeleteConfirm = false;
          }}
        >
          {tr("common.cancel")}
        </button>
        <button
          class="group inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-xl bg-gradient-to-r from-red-500 to-red-600 text-white shadow-lg shadow-red-500/25 hover:shadow-red-500/40 hover:scale-105 active:scale-95 transition-all duration-200 disabled:opacity-50 disabled:hover:scale-100"
          disabled={bulkActionLoading}
          onclick={executeBulkDelete}
        >
          <Trash2 class="w-4 h-4 group-hover:animate-bounce" />
          {bulkActionLoading ? tr("dataExplorer.deleting") : tr("common.delete")}
        </button>
      </div>
    </div>
  </div>
{/if}
