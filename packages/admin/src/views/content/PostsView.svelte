<script lang="ts">
  /**
   * PostsView.svelte
   * 
   * Blog Posts management view - Core Grimoire
   * Uses DataExplorer with custom field types and calculated fields
   */
  import DataExplorer from "$lib/components/DataExplorer.svelte";
  import { calculatedHelpers } from "$lib/data-explorer/fieldRegistry";
  import { Edit2, Eye, Trash2, FileText, Megaphone, Plus } from "lucide-svelte";
  import { goto } from "$app/navigation";
  
  // Column configuration with field types
  const columns = [
    {
      field: "title",
      label: "Title",
      width: "30%",
      fieldConfig: { 
        type: "text", 
        options: { maxLength: 200 }
      }
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
            archived: "bg-gray-500/10 text-gray-400 border-gray-500/20"
          }
        }
      }
    },
    {
      field: "author",
      label: "Author",
      width: "150px",
      fieldConfig: {
        type: "calculated",
        options: {
          calculate: (row: any) => row.author?.name || row.author?.email || "—"
        }
      }
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
          format: "text"
        }
      }
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
          format: "text"
        }
      }
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
          format: "badge"
        }
      }
    }
  ];
  
  // Row actions
  const rowActions = [
    {
      id: "edit",
      label: "Edit",
      icon: Edit2,
      handler: (row: any) => {
        goto(`/content/edit?collection=blog-posts&id=${row.id}`);
      }
    },
    {
      id: "view",
      label: "View",
      icon: Eye,
      handler: (row: any) => {
        window.open(`/blog/${row.slug}`, "_blank");
      }
    }
  ];
  
  // Bulk actions
  const bulkActions = [
    {
      id: "publish",
      label: "Publish Selected",
      icon: Megaphone,
      handler: async (ids: string[]) => {
        console.log("Publishing:", ids);
      }
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
      }
    }
  ];
  
  // Complete configuration
  const config = {
    table: "blog_posts",
    label: "Blog Posts",
    columns,
    searchableFields: ["title", "excerpt"],
    filterableFields: ["status", "authorId"],
    rowActions,
    bulkActions
  };
  
  function handleRowClick(row: any) {
    goto(`/content/edit?collection=blog-posts&id=${row.id}`);
  }
</script>

<div class="space-y-6 animate-fade-in">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div>
      <h1 class="text-2xl font-bold text-gremius-text flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-gremius-cyan/20 to-gremius-purple/20 border border-gremius-cyan/20 flex items-center justify-center">
          <FileText class="w-5 h-5 text-gremius-cyan" />
        </div>
        Blog Posts
      </h1>
      <p class="text-sm text-gremius-subtle mt-1">
        Manage your content with rich text editing, SEO, and scheduling
      </p>
    </div>
    <a 
      href="/content/edit?collection=blog-posts" 
      class="group inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-gremius-cyan to-cyan-400 text-black rounded-xl font-semibold shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40 hover:scale-105 active:scale-95 transition-all duration-200"
    >
      <Plus class="w-4 h-4" />
      <span>Nuevo Post</span>
    </a>
  </div>

  <!-- DataExplorer -->
  <DataExplorer
    table="blog_posts"
    {config}
    apiEndpoint="/api/blog"
    onRowClick={handleRowClick}
  />
</div>
