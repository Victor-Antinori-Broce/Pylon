<script lang="ts">
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
  import { ArrowLeft, Save, FileText, Trash2 } from "lucide-svelte";
  import { api } from "$lib/api";

  const postId = $page.params.id;

  let title = $state("");
  let slug = $state("");
  let content = $state("");
  let excerpt = $state("");
  let status = $state<"draft" | "published" | "archived">("draft");
  let loading = $state(true);
  let saving = $state(false);
  let error = $state<string | null>(null);

  onMount(async () => {
    try {
      const post = await api.getPost(postId);
      title = post.title;
      slug = post.slug;
      content = post.content || "";
      excerpt = post.excerpt || "";
      status = post.status;
    } catch (err: any) {
      error = err.message || "Failed to load post";
    } finally {
      loading = false;
    }
  });

  async function handleSave() {
    if (!title.trim()) {
      error = "Title is required";
      return;
    }

    saving = true;
    error = null;

    try {
      await api.updatePost(postId, {
        title,
        slug,
        content,
        excerpt,
        status,
      });
      goto("/posts");
    } catch (err: any) {
      error = err.message || "Failed to update post";
    } finally {
      saving = false;
    }
  }

  async function handleDelete() {
    if (!confirm("Are you sure you want to delete this post?")) return;

    try {
      await api.deletePost(postId);
      goto("/posts");
    } catch (err: any) {
      error = err.message || "Failed to delete post";
    }
  }
</script>

<div class="space-y-6 animate-fade-in">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-4">
      <a href="/posts" class="btn-icon">
        <ArrowLeft class="w-5 h-5" />
      </a>
      <div>
        <h1 class="text-2xl font-bold text-gremius-text flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-gremius-green/20 to-gremius-cyan/20 border border-gremius-green/20 flex items-center justify-center">
            <FileText class="w-5 h-5 text-gremius-green" />
          </div>
          Edit Post
        </h1>
        <p class="text-sm text-gremius-subtle mt-1">
          Update blog post content
        </p>
      </div>
    </div>
    <div class="flex items-center gap-2">
      <button 
        class="btn-danger" 
        onclick={handleDelete}
      >
        <Trash2 class="w-4 h-4" />
        Delete
      </button>
      <button 
        class="btn-primary" 
        onclick={handleSave}
        disabled={saving}
      >
        <Save class="w-4 h-4" />
        {saving ? 'Saving...' : 'Save Changes'}
      </button>
    </div>
  </div>

  {#if error}
    <div class="p-3 rounded-lg bg-gremius-pink/10 border border-gremius-pink/20 text-gremius-pink text-sm">
      {error}
    </div>
  {/if}

  {#if loading}
    <div class="card p-12 text-center">
      <div class="w-8 h-8 border-2 border-gremius-cyan/30 border-t-gremius-cyan rounded-full animate-spin mx-auto mb-4"></div>
      <p class="text-gremius-subtle">Loading post...</p>
    </div>
  {:else}
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Main Content -->
      <div class="lg:col-span-2 space-y-4">
        <div class="card p-4 space-y-4">
          <div>
            <label class="label block text-xs font-semibold uppercase text-gremius-subtle tracking-wider mb-1.5">
              Title
            </label>
            <input
              type="text"
              bind:value={title}
              placeholder="Enter post title"
              class="input w-full text-lg"
            />
          </div>

          <div>
            <label class="label block text-xs font-semibold uppercase text-gremius-subtle tracking-wider mb-1.5">
              Slug
            </label>
            <div class="flex items-center gap-2">
              <span class="text-gremius-subtle">/</span>
              <input
                type="text"
                bind:value={slug}
                placeholder="post-url-slug"
                class="input w-full"
              />
            </div>
          </div>

          <div>
            <label class="label block text-xs font-semibold uppercase text-gremius-subtle tracking-wider mb-1.5">
              Content
            </label>
            <textarea
              bind:value={content}
              placeholder="Write your post content here..."
              rows="12"
              class="input w-full font-mono text-sm"
            ></textarea>
          </div>
        </div>
      </div>

      <!-- Sidebar -->
      <div class="space-y-4">
        <div class="card p-4">
          <h3 class="font-semibold text-gremius-text mb-4">Settings</h3>
          
          <div class="space-y-4">
            <div>
              <label class="label block text-xs font-semibold uppercase text-gremius-subtle tracking-wider mb-1.5">
                Status
              </label>
              <select bind:value={status} class="select w-full">
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </select>
            </div>

            <div>
              <label class="label block text-xs font-semibold uppercase text-gremius-subtle tracking-wider mb-1.5">
                Excerpt
              </label>
              <textarea
                bind:value={excerpt}
                placeholder="Brief description of the post"
                rows="4"
                class="input w-full text-sm"
              ></textarea>
            </div>
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>
