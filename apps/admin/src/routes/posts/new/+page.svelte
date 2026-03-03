<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { ArrowLeft, Save, FileText } from "lucide-svelte";
  import { api } from "$lib/api";

  let title = $state("");
  let slug = $state("");
  let content = $state("");
  let excerpt = $state("");
  let status = $state<"draft" | "published">("draft");
  let saving = $state(false);
  let error = $state<string | null>(null);

  function generateSlug(title: string) {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  }

  function handleTitleChange() {
    if (!slug) {
      slug = generateSlug(title);
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
      await api.createPost({
        title,
        slug: slug || generateSlug(title),
        content,
        excerpt,
        status,
      });
      goto("/posts");
    } catch (err: any) {
      error = err.message || "Failed to create post";
    } finally {
      saving = false;
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
          New Post
        </h1>
        <p class="text-sm text-gremius-subtle mt-1">
          Create a new blog post
        </p>
      </div>
    </div>
    <button 
      class="btn-primary" 
      onclick={handleSave}
      disabled={saving}
    >
      <Save class="w-4 h-4" />
      {saving ? 'Saving...' : 'Save Post'}
    </button>
  </div>

  {#if error}
    <div class="p-3 rounded-lg bg-gremius-pink/10 border border-gremius-pink/20 text-gremius-pink text-sm">
      {error}
    </div>
  {/if}

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
            oninput={handleTitleChange}
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
</div>
