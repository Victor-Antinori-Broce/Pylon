<script lang="ts">
  /**
   * PostsView.svelte
   *
   * Blog Posts management view - Core Grimoire
   * Uses DataExplorer with custom field types and calculated fields
   */
  import { Edit2, Eye, Trash2, FileText, Megaphone, Plus } from "lucide-svelte";

  import DataExplorer from "$lib/components/DataExplorer.svelte";
  import { calculatedHelpers } from "$lib/data-explorer/fieldRegistry";

  import { goto } from "$app/navigation";

  // Column configuration with field types
  const columns = [
    {
      field: "title",
      label: "Title",
      width: "30%",
      fieldConfig: {
        type: "text",
        options: { maxLength: 200 },
      },
    },
    {
      field: "status",
      label: "Status",
      width: "120px",
      fieldConfig: {
        type: "status-badge",
        options: {
          colors: {
            draft: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
            scheduled: "bg-blue-500/10 text-blue-500 border-blue-500/20",
            published: "bg-green-500/10 text-green-500 border-green-500/20",
            archived: "bg-gray-500/10 text-gray-400 border-gray-500/20",
          },
        },
      },
    },
    /**
     * El idioma, para poder distinguir las versiones de un mismo articulo.
     *
     * Sin esta columna, un articulo y su traduccion son dos filas con titulos
     * distintos y ninguna pista de que son el mismo: la lista parece llena de
     * duplicados y no hay forma de saber cual editar.
     */
    {
      field: "locale",
      label: "Idioma",
      width: "90px",
      fieldConfig: {
        type: "calculated",
        options: {
          calculate: (row: any) => (row.locale || "es").toUpperCase(),
        },
      },
    },
    {
      field: "author",
      label: "Author",
      width: "150px",
      fieldConfig: {
        type: "calculated",
        options: {
          calculate: (row: any) => row.author?.name || row.author?.email || "—",
        },
      },
    },
    {
      field: "readingTime",
      label: "Read Time",
      width: "100px",
      fieldConfig: {
        type: "calculated",
        options: {
          calculate: (row: any) => {
            if (!row.content) return "—";
            const words = String(row.content).split(/\s+/).length;
            const minutes = Math.ceil(words / 200);
            return `${minutes} min`;
          },
          format: "text",
        },
      },
    },
    {
      field: "publishedAt",
      label: "Published",
      width: "120px",
      fieldConfig: {
        type: "calculated",
        options: {
          calculate: (row: any) => {
            if (!row.publishedAt) return "—";
            return calculatedHelpers.timeAgo(row.publishedAt);
          },
          format: "text",
        },
      },
    },
    {
      field: "isLive",
      label: "Visibility",
      width: "100px",
      fieldConfig: {
        type: "calculated",
        options: {
          calculate: (row: any) => {
            if (row.status !== "published") return "Draft";
            const pubDate = new Date(row.publishedAt);
            return pubDate <= new Date() ? "Live" : "Scheduled";
          },
          format: "badge",
        },
      },
    },
  ];

  // Row actions
  const rowActions = [
    {
      id: "edit",
      label: "Edit",
      icon: Edit2,
      handler: (row: any) => {
        goto(`/content/edit?collection=blog-posts&id=${row.id}`);
      },
    },
    {
      id: "view",
      label: "View",
      icon: Eye,
      handler: (row: any) => {
        window.open(`/blog/${row.slug}`, "_blank");
      },
    },
  ];

  // Bulk actions
  const bulkActions = [
    {
      id: "publish",
      label: "Publish Selected",
      icon: Megaphone,
      handler: async (ids: string[]) => {
        console.log("Publishing:", ids);
      },
    },
    {
      id: "delete",
      label: "Delete",
      icon: Trash2,
      variant: "danger" as const,
      handler: async (ids: string[]) => {
        if (confirm(`Delete ${ids.length} posts?`)) {
          console.log("Deleting:", ids);
        }
      },
    },
  ];

  // Complete configuration
  const config = {
    table: "blog_posts",
    label: "Blog Posts",
    columns,
    searchableFields: ["title", "excerpt"],
    filterableFields: ["status", "authorId"],
    rowActions,
    bulkActions,
  };

  function handleRowClick(row: any) {
    goto(`/content/edit?collection=blog-posts&id=${row.id}`);
  }
</script>

<div class="space-y-6 animate-fade-in">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div>
      <h1 class="text-2xl font-bold text-kitsuden-text flex items-center gap-3">
        <div
          class="w-10 h-10 rounded-xl bg-gradient-to-br from-kitsuden-accent/20 to-kitsuden-purple/20 border border-kitsuden-accent/20 flex items-center justify-center"
        >
          <FileText class="w-5 h-5 text-kitsuden-accent" />
        </div>
        Blog Posts
      </h1>
      <p class="text-sm text-kitsuden-subtle mt-1">
        Manage your content with rich text editing, SEO, and scheduling
      </p>
    </div>
    <a
      href="/content/edit?collection=blog-posts"
      class="group inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-kitsuden-accent to-kitsuden-accent text-black rounded-xl font-semibold shadow-lg shadow-kitsuden-accent/25 hover:shadow-kitsuden-accent/40 hover:scale-105 active:scale-95 transition-all duration-200"
    >
      <Plus class="w-4 h-4" />
      <span>Nuevo Post</span>
    </a>
  </div>

  <!-- DataExplorer -->
  <!--
    ── POR QUE `status: "all"` ────────────────────────────────────────────────

    Esta pantalla se llama «All Posts» y no enseñaba todos: `GET /api/blog`
    tiene `status` por defecto en `published`, así que la lista de una
    instalación con un borrador y ningún publicado salía VACIA. Y no había
    forma de pedir el resto — el parámetro solo cambiaba de un estado a otro,
    nunca los quitaba.

    Desde fuera se lee como «no hay posts», que es exactamente lo contrario de
    lo que pasa. Por eso «Borradores» sí enseñaba el post y «All Posts» no.

    `all` solo lo atiende la API para `admin` y `editor`; a quien no tenga
    sesión le sigue devolviendo lo publicado y nada más.
  -->
  <DataExplorer
    table="blog_posts"
    {config}
    apiEndpoint="/api/blog"
    queryParams={{ status: "all" }}
    onRowClick={handleRowClick}
  />
</div>
