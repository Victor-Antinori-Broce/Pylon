<script lang="ts">
  import { onMount } from "svelte";
  import { Plus, FileText } from "lucide-svelte";
  import { api } from "$lib/api";

  interface Post {
    id: string;
    title: string;
    slug: string;
    status: "draft" | "published" | "archived";
    publishedAt?: string;
    author?: { name: string };
  }

  let posts = $state<Post[]>([]);
  let loading = $state(true);

  onMount(async () => {
    try {
      const data = await api.getPosts();
      posts = data.docs || [];
    } catch {
      // empty
    } finally {
      loading = false;
    }
  });

  function statusColor(status: string): string {
    switch (status) {
      case "published": return "bg-gremius-green/10 text-gremius-green border-gremius-green/20";
      case "draft": return "bg-gremius-yellow/10 text-gremius-yellow border-gremius-yellow/20";
      case "archived": return "bg-gremius-subtle/10 text-gremius-subtle border-gremius-subtle/20";
      default: return "bg-gremius-surface text-gremius-text-dim";
    }
  }
</script>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <div>
      <h2 class="text-xl font-bold text-gremius-text">Blog Posts</h2>
      <p class="text-sm text-gremius-text-dim mt-0.5">Manage your content</p>
    </div>
    <a href="/posts/new" class="btn-primary inline-flex items-center gap-2">
      <Plus class="w-4 h-4" /> New Post
    </a>
  </div>

  {#if loading}
    <div class="flex justify-center py-20">
      <div class="w-6 h-6 border-2 border-gremius-cyan/30 border-t-gremius-cyan rounded-full animate-spin"></div>
    </div>
  {:else if posts.length === 0}
    <div class="card p-16 text-center">
      <div class="text-4xl mb-3">📝</div>
      <p class="text-gremius-text-dim">No posts yet.</p>
      <p class="text-xs text-gremius-subtle mt-1">Create your first blog post.</p>
    </div>
  {:else}
    <div class="space-y-3">
      {#each posts as post}
        <a
          href={`/posts/${post.id}`}
          class="card p-4 flex items-center justify-between group hover:border-gremius-cyan/30 transition-colors"
        >
          <div class="flex items-center gap-4">
            <div class="w-10 h-10 rounded-lg bg-gremius-surface flex items-center justify-center">
              <FileText class="w-5 h-5 text-gremius-cyan" />
            </div>
            <div>
              <h3 class="font-semibold text-gremius-text group-hover:text-gremius-cyan transition-colors">
                {post.title}
              </h3>
              <p class="text-xs text-gremius-subtle mt-0.5">
                /{post.slug} · {post.author?.name || "Unknown"}
              </p>
            </div>
          </div>
          <span class="px-2 py-1 text-xs rounded-full border {statusColor(post.status)}">
            {post.status}
          </span>
        </a>
      {/each}
    </div>
  {/if}
</div>
