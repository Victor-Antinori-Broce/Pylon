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
  } from "lucide-svelte";
  import { onMount } from "svelte";

  import { api } from "$lib/api";
  import PromoteFromDataset from "$lib/components/blog/PromoteFromDataset.svelte";
  import SlashCommandEditor from "$lib/components/editor/SlashCommandEditor.svelte";
  import LivePreview from "$lib/components/LivePreview.svelte";
  import SplitPane from "$lib/components/SplitPane.svelte";
  import Modal from "$lib/components/ui/Modal.svelte";

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
  let activeTab = $state<"content" | "seo" | "settings">("content");
  let showMediaModal = $state(false);
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
  let publishedAt = $state<string>("");
  let authorId = $state<string>("");
  let featuredImageId = $state<string>("");
  let featuredImageUrl = $state<string>("");
  let tags = $state<Array<{ id: string; name: string; slug: string }>>([]);
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
  });

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

  // ─── Lifecycle ──────────────────────────────────────
  onMount(async () => {
    try {
      await Promise.all([loadTags(), loadAuthors(), loadMedia()]);

      if (postId) {
        await loadPost();
      }
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
      content = post.content || "";
      excerpt = post.excerpt || "";
      status = post.status || "draft";
      publishedAt = post.publishedAt ? new Date(post.publishedAt).toISOString().slice(0, 16) : "";
      authorId = post.authorId || "";
      featuredImageId = post.featuredImageId || "";
      featuredImageUrl = post.featuredImage?.url || "";
      tags = post.tags || [];

      if (post.seoOverrides) {
        seoOverrides = {
          ...seoOverrides,
          ...post.seoOverrides,
        };
      }
    } catch (err: any) {
      error = err.message || "Failed to load post";
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

  async function loadMedia() {
    try {
      const response = await api.getMedia({ limit: 50 });
      mediaList = response.docs || [];
    } catch (err) {
      console.error("Failed to load media:", err);
    }
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
      const postData = {
        title: title.trim(),
        slug: slug || generateSlug(title),
        content,
        excerpt: excerpt.trim(),
        status,
        publishedAt:
          status === "scheduled"
            ? new Date(publishedAt).toISOString()
            : status === "published"
              ? new Date().toISOString()
              : null,
        authorId,
        featuredImageId: featuredImageId || null,
        tags: tags.map((t) => t.id),
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
        },
      };

      if (postId) {
        await api.updatePost(postId, postData as any);
      } else {
        await api.createPost(postData as any);
      }

      goto("/posts");
    } catch (err: any) {
      error = err.message || "Failed to save post";
    } finally {
      saving = false;
    }
  }

  async function handleDelete() {
    if (!confirm("Are you sure you want to delete this post?")) return;

    try {
      await api.deletePost(postId!);
      goto("/posts");
    } catch (err: any) {
      error = err.message || "Failed to delete post";
    }
  }

  function handlePreview() {
    const previewSlug = slug || "preview";
    window.open(`/blog/${previewSlug}?preview=true`, "_blank");
  }

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

<div class="h-[calc(100vh-4rem)] flex flex-col bg-gremius-bg">
  <!-- Header -->
  <header
    class="flex items-center justify-between px-6 py-4 border-b border-gremius-border bg-gremius-card shrink-0"
  >
    <div class="flex items-center gap-4">
      <a href="/posts" class="btn-icon hover:bg-gremius-border/50 transition-colors">
        <ArrowLeft class="w-5 h-5" />
      </a>
      <div>
        <h1 class="text-xl font-bold text-gremius-text flex items-center gap-3">
          <div
            class="w-9 h-9 rounded-xl bg-gradient-to-br from-gremius-green/20 to-gremius-cyan/20 border border-gremius-green/20 flex items-center justify-center"
          >
            <FileText class="w-4 h-4 text-gremius-green" />
          </div>
          {postId ? "Edit Post" : "New Post"}
        </h1>
        <p class="text-xs text-gremius-subtle mt-0.5">
          {seoScore >= 80
            ? "SEO Optimized"
            : seoScore >= 50
              ? "SEO Needs Improvement"
              : "SEO Incomplete"} •
          <span
            class={seoScore >= 80
              ? "text-gremius-green"
              : seoScore >= 50
                ? "text-amber-400"
                : "text-gremius-pink"}
          >
            {seoScore}% score
          </span>
        </p>
      </div>
    </div>

    <div class="flex items-center gap-2">
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

  <!-- Tabs -->
  <div
    class="flex items-center gap-1 px-6 py-2 border-b border-gremius-border bg-gremius-card/50 shrink-0"
  >
    <button
      class="px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 {activeTab ===
      'content'
        ? 'bg-gremius-cyan/10 text-gremius-cyan'
        : 'text-gremius-subtle hover:text-gremius-text hover:bg-gremius-border/30'}"
      onclick={() => (activeTab = "content")}
    >
      <FileText class="w-4 h-4" />
      Content
    </button>
    <button
      class="px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 {activeTab ===
      'seo'
        ? 'bg-gremius-cyan/10 text-gremius-cyan'
        : 'text-gremius-subtle hover:text-gremius-text hover:bg-gremius-border/30'}"
      onclick={() => (activeTab = "seo")}
    >
      <Search class="w-4 h-4" />
      SEO
      {#if seoScore < 80}
        <span class="w-2 h-2 rounded-full bg-gremius-pink"></span>
      {:else}
        <CheckCircle2 class="w-3.5 h-3.5 text-gremius-green" />
      {/if}
    </button>
    <button
      class="px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 {activeTab ===
      'settings'
        ? 'bg-gremius-cyan/10 text-gremius-cyan'
        : 'text-gremius-subtle hover:text-gremius-text hover:bg-gremius-border/30'}"
      onclick={() => (activeTab = "settings")}
    >
      <Settings class="w-4 h-4" />
      Settings
    </button>
  </div>

  <!-- Error Alert -->
  {#if error}
    <div
      class="mx-6 mt-4 p-3 rounded-lg bg-gremius-pink/10 border border-gremius-pink/20 text-gremius-pink text-sm shrink-0"
    >
      {error}
    </div>
  {/if}

  <!-- Content Area -->
  {#if loading}
    <div class="flex-1 flex items-center justify-center">
      <div class="flex flex-col items-center gap-3">
        <Loader2 class="w-8 h-8 text-gremius-cyan animate-spin" />
        <p class="text-gremius-subtle text-sm">Loading editor...</p>
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
                  class="label block text-xs font-semibold uppercase text-gremius-subtle tracking-wider mb-2"
                >
                  Post Title
                </label>
                <input
                  type="text"
                  bind:value={title}
                  oninput={handleTitleChange}
                  placeholder="Enter an engaging title..."
                  class="input w-full text-2xl font-bold py-3"
                />
                <div class="flex justify-between mt-1.5">
                  <span class="text-[10px] text-gremius-subtle">
                    {title.length} characters
                  </span>
                  <span
                    class="text-[10px] {title.length >= 30 && title.length <= 60
                      ? 'text-gremius-green'
                      : 'text-gremius-pink'}"
                  >
                    Optimal: 30-60 chars
                  </span>
                </div>
              </div>

              <!-- Slug -->
              <div>
                <label
                  class="label block text-xs font-semibold uppercase text-gremius-subtle tracking-wider mb-2"
                >
                  URL Slug
                </label>
                <div
                  class="flex items-center gap-2 px-3 py-2 rounded-xl border border-gremius-border bg-gremius-bg"
                >
                  <span class="text-gremius-subtle text-sm font-mono">/blog/</span>
                  <input
                    type="text"
                    bind:value={slug}
                    placeholder="your-post-slug"
                    class="flex-1 bg-transparent text-sm text-gremius-cyan font-mono outline-none"
                  />
                </div>
              </div>

              <!-- Featured Image -->
              <div>
                <label
                  class="label block text-xs font-semibold uppercase text-gremius-subtle tracking-wider mb-2"
                >
                  Featured Image
                </label>
                {#if featuredImageUrl}
                  <div class="relative rounded-xl overflow-hidden border border-gremius-border">
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
                    onclick={() => (showMediaModal = true)}
                    class="w-full p-8 rounded-xl border-2 border-dashed border-gremius-border hover:border-gremius-cyan/50 hover:bg-gremius-cyan/5 transition-all flex flex-col items-center gap-3"
                  >
                    <Image class="w-8 h-8 text-gremius-subtle" />
                    <span class="text-sm text-gremius-subtle">Click to select featured image</span>
                    <span class="text-[10px] text-gremius-subtle/60">Recommended: 1200x630px</span>
                  </button>
                {/if}
              </div>

              <!-- Excerpt -->
              <div>
                <label
                  class="label block text-xs font-semibold uppercase text-gremius-subtle tracking-wider mb-2"
                >
                  Excerpt / Summary
                </label>
                <textarea
                  bind:value={excerpt}
                  rows="3"
                  placeholder="Brief summary of your post (appears in previews and search results)..."
                  class="input w-full resize-none"
                ></textarea>
                <div class="flex justify-between mt-1.5">
                  <span class="text-[10px] text-gremius-subtle">
                    {excerpt.length} characters
                  </span>
                  <span
                    class="text-[10px] {excerpt.length >= 120 && excerpt.length <= 160
                      ? 'text-gremius-green'
                      : 'text-amber-400'}"
                  >
                    Optimal: 120-160 chars
                  </span>
                </div>
              </div>

              <!-- Content Editor -->
              <div>
                <label
                  class="label block text-xs font-semibold uppercase text-gremius-subtle tracking-wider mb-2"
                >
                  Content
                </label>
                <SlashCommandEditor
                  value={content}
                  onChange={(v) => (content = v)}
                  placeholder="Start writing... Type '/' for commands"
                />
              </div>
            </div>
          </div>

          <!-- Sidebar -->
          <div class="h-full overflow-y-auto border-l border-gremius-border bg-gremius-card/30 p-6">
            <div class="space-y-6">
              <!-- Status -->
              <div class="card p-4">
                <h3 class="font-semibold text-gremius-text mb-4 flex items-center gap-2">
                  <Settings class="w-4 h-4" />
                  Publishing
                </h3>

                <div class="space-y-4">
                  <div>
                    <label class="label block text-xs mb-1.5">Status</label>
                    <select bind:value={status} class="select w-full">
                      <option value="draft">📝 Draft</option>
                      <option value="scheduled">📅 Scheduled</option>
                      <option value="published">🚀 Published</option>
                      <option value="archived">📦 Archived</option>
                    </select>
                  </div>

                  {#if status === "scheduled"}
                    <div>
                      <label class="label block text-xs mb-1.5 flex items-center gap-1">
                        <Calendar class="w-3 h-3" />
                        Publish Date
                      </label>
                      <input
                        type="datetime-local"
                        bind:value={publishedAt}
                        class="input w-full text-sm"
                      />
                    </div>
                  {/if}

                  <div>
                    <label class="label block text-xs mb-1.5 flex items-center gap-1">
                      <User class="w-3 h-3" />
                      Author
                    </label>
                    <select bind:value={authorId} class="select w-full">
                      <option value="">Select author...</option>
                      {#each availableAuthors as author}
                        <option value={author.id}>{author.name}</option>
                      {/each}
                    </select>
                  </div>
                </div>
              </div>

              <!-- Tags -->
              <div class="card p-4">
                <h3 class="font-semibold text-gremius-text mb-4 flex items-center gap-2">
                  <Tag class="w-4 h-4" />
                  Tags
                </h3>

                <div class="flex flex-wrap gap-2 mb-3">
                  {#each tags as tag}
                    <span
                      class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gremius-cyan/10 text-gremius-cyan text-xs"
                    >
                      {tag.name}
                      <button onclick={() => toggleTag(tag)} class="hover:text-gremius-pink">
                        <X class="w-3 h-3" />
                      </button>
                    </span>
                  {/each}
                  {#if tags.length === 0}
                    <span class="text-xs text-gremius-subtle italic">No tags selected</span>
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
                <h3 class="font-semibold text-gremius-text mb-3 flex items-center gap-2">
                  <Search class="w-4 h-4" />
                  SEO Summary
                </h3>
                <div class="space-y-2">
                  <div class="flex items-center justify-between text-xs">
                    <span class="text-gremius-subtle">Score</span>
                    <span
                      class={seoScore >= 80
                        ? "text-gremius-green"
                        : seoScore >= 50
                          ? "text-amber-400"
                          : "text-gremius-pink"}
                    >
                      {seoScore}%
                    </span>
                  </div>
                  <div class="w-full h-1.5 bg-gremius-border rounded-full overflow-hidden">
                    <div
                      class="h-full rounded-full transition-all {seoScore >= 80
                        ? 'bg-gremius-green'
                        : seoScore >= 50
                          ? 'bg-amber-400'
                          : 'bg-gremius-pink'}"
                      style="width: {seoScore}%"
                    ></div>
                  </div>
                  <button
                    onclick={() => (activeTab = "seo")}
                    class="text-xs text-gremius-cyan hover:underline mt-2"
                  >
                    Improve SEO →
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      {/if}

      <!-- TAB: SEO -->
      {#if activeTab === "seo"}
        <div class="h-full overflow-y-auto p-6">
          <div class="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8">
            <!-- SEO Form -->
            <div class="space-y-6">
              <div>
                <h2 class="text-lg font-semibold text-gremius-text mb-1">SEO Settings</h2>
                <p class="text-sm text-gremius-subtle">Optimize your post for search engines</p>
              </div>

              <!-- Meta Title -->
              <div>
                <div class="flex items-center justify-between mb-2">
                  <label class="label text-xs uppercase">Meta Title</label>
                  <span
                    class="text-[10px] {(seoOverrides.metaTitle || title).length <= 60
                      ? 'text-gremius-green'
                      : 'text-gremius-pink'}"
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
                <p class="text-[10px] text-gremius-subtle mt-1">Leave empty to use post title</p>
              </div>

              <!-- Meta Description -->
              <div>
                <div class="flex items-center justify-between mb-2">
                  <label class="label text-xs uppercase">Meta Description</label>
                  <span
                    class="text-[10px] {(seoOverrides.metaDescription || excerpt).length <= 160
                      ? 'text-gremius-green'
                      : 'text-gremius-pink'}"
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
                <label class="label block text-xs uppercase mb-2">Canonical URL</label>
                <input
                  type="url"
                  bind:value={seoOverrides.canonicalUrl}
                  placeholder="https://yoursite.com/blog/{slug}"
                  class="input w-full"
                />
              </div>

              <!-- Robots -->
              <div class="card p-4">
                <h3 class="font-medium text-gremius-text mb-3 text-sm">Robots Meta</h3>
                <div class="space-y-3">
                  <label class="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      bind:checked={seoOverrides.robotsIndex}
                      class="w-4 h-4 rounded border-gremius-border"
                    />
                    <span class="text-sm">Allow search engines to index this page</span>
                  </label>
                  <label class="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      bind:checked={seoOverrides.robotsFollow}
                      class="w-4 h-4 rounded border-gremius-border"
                    />
                    <span class="text-sm">Allow search engines to follow links</span>
                  </label>
                </div>
              </div>

              <!-- OG Settings -->
              <div class="card p-4">
                <h3 class="font-medium text-gremius-text mb-3 text-sm flex items-center gap-2">
                  <Share2 class="w-4 h-4" />
                  Social Sharing (Open Graph)
                </h3>

                <div class="space-y-4">
                  <div>
                    <label class="label block text-xs mb-1.5">OG Title</label>
                    <input
                      type="text"
                      bind:value={seoOverrides.ogTitle}
                      placeholder={seoOverrides.metaTitle || title}
                      class="input w-full text-sm"
                    />
                  </div>

                  <div>
                    <label class="label block text-xs mb-1.5">OG Description</label>
                    <textarea
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
                <h2 class="text-lg font-semibold text-gremius-text mb-1">Previews</h2>
                <p class="text-sm text-gremius-subtle">See how your post will appear</p>
              </div>

              <!-- Google Preview -->
              <div>
                <h3 class="text-xs font-medium text-gremius-subtle uppercase tracking-wider mb-3">
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
                <h3 class="text-xs font-medium text-gremius-subtle uppercase tracking-wider mb-3">
                  Social Share
                </h3>
                <div
                  class="rounded-lg overflow-hidden border border-gremius-border bg-gremius-card max-w-md"
                >
                  {#if featuredImageUrl}
                    <img src={featuredImageUrl} alt="" class="w-full h-48 object-cover" />
                  {:else}
                    <div class="w-full h-48 bg-gremius-border flex items-center justify-center">
                      <Image class="w-12 h-12 text-gremius-subtle/50" />
                    </div>
                  {/if}
                  <div class="p-3">
                    <p class="text-gremius-text font-semibold text-sm line-clamp-1">
                      {seoOverrides.ogTitle || seoOverrides.metaTitle || title || "Post Title"}
                    </p>
                    <p class="text-gremius-subtle text-xs mt-1 line-clamp-2">
                      {seoOverrides.ogDescription ||
                        seoOverrides.metaDescription ||
                        excerpt ||
                        "No description provided."}
                    </p>
                    <p class="text-gremius-subtle/60 text-[10px] mt-2 uppercase tracking-wider">
                      yoursite.com
                    </p>
                  </div>
                </div>
              </div>

              <!-- SEO Checklist -->
              <div class="card p-4">
                <h3 class="font-medium text-gremius-text mb-3 text-sm">SEO Checklist</h3>
                <div class="space-y-2">
                  {#each [{ label: "Title is set", pass: title.length > 0 }, { label: "Title length optimal (30-60)", pass: title.length >= 30 && title.length <= 60 }, { label: "Slug is set", pass: slug.length > 0 }, { label: "Content has 300+ chars", pass: content.length > 300 }, { label: "Excerpt is set", pass: excerpt.length > 0 }, { label: "Meta title optimized", pass: seoOverrides.metaTitle.length > 0 }, { label: "Meta description optimized", pass: seoOverrides.metaDescription.length > 0 }, { label: "Featured image selected", pass: !!featuredImageId }, { label: "Has at least one tag", pass: tags.length > 0 }] as check}
                    <div class="flex items-center gap-2 text-xs">
                      {#if check.pass}
                        <CheckCircle2 class="w-3.5 h-3.5 text-gremius-green shrink-0" />
                        <span class="text-gremius-text-dim">{check.label}</span>
                      {:else}
                        <div
                          class="w-3.5 h-3.5 rounded-full border border-gremius-subtle/30 shrink-0"
                        ></div>
                        <span class="text-gremius-subtle">{check.label}</span>
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
              <h2 class="text-lg font-semibold text-gremius-text mb-1">Post Settings</h2>
              <p class="text-sm text-gremius-subtle">Advanced configuration options</p>
            </div>

            <!-- Publishing Settings -->
            <div class="card p-6 space-y-6">
              <h3 class="font-medium text-gremius-text flex items-center gap-2">
                <Calendar class="w-4 h-4" />
                Publishing Schedule
              </h3>

              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label class="label block text-xs mb-2">Status</label>
                  <select bind:value={status} class="select w-full">
                    <option value="draft">📝 Draft</option>
                    <option value="scheduled">📅 Scheduled</option>
                    <option value="published">🚀 Published</option>
                    <option value="archived">📦 Archived</option>
                  </select>
                </div>

                {#if status === "scheduled"}
                  <div>
                    <label class="label block text-xs mb-2 flex items-center gap-1">
                      <Clock class="w-3 h-3" />
                      Publish At
                    </label>
                    <input type="datetime-local" bind:value={publishedAt} class="input w-full" />
                  </div>
                {/if}
              </div>
            </div>

            <!-- Author Settings -->
            <div class="card p-6 space-y-4">
              <h3 class="font-medium text-gremius-text flex items-center gap-2">
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

            <!-- Danger Zone -->
            {#if postId}
              <div class="card p-6 border-gremius-pink/30">
                <h3 class="font-medium text-gremius-pink flex items-center gap-2 mb-4">
                  <Trash2 class="w-4 h-4" />
                  Danger Zone
                </h3>
                <p class="text-sm text-gremius-subtle mb-4">
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
            <LivePreview {title} {content} {excerpt} {featuredImageUrl} {slug} {status} />
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

<!-- Media Selector Modal -->
{#if showMediaModal}
  <Modal title="Select Featured Image" onClose={() => (showMediaModal = false)}>
    <div class="p-4">
      {#if mediaList.length === 0}
        <div class="text-center py-8">
          <Image class="w-12 h-12 text-gremius-subtle mx-auto mb-3" />
          <p class="text-gremius-subtle">No images found</p>
          <p class="text-xs text-gremius-subtle/60 mt-1">
            Upload images in the Media Library first
          </p>
        </div>
      {:else}
        <div class="grid grid-cols-3 gap-3 max-h-96 overflow-y-auto">
          {#each mediaList as media}
            <button
              onclick={() => selectFeaturedImage(media)}
              class="relative aspect-square rounded-lg overflow-hidden border-2 transition-all {featuredImageId ===
              media.id
                ? 'border-gremius-cyan'
                : 'border-transparent hover:border-gremius-border'}"
            >
              <img
                src={media.url}
                alt={media.alt || media.filename}
                class="w-full h-full object-cover"
              />
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </Modal>
{/if}

<!-- Tag Selector Modal -->
{#if showTagModal}
  <Modal title="Manage Tags" onClose={() => (showTagModal = false)}>
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
      <div class="border-t border-gremius-border pt-4">
        <p class="text-xs text-gremius-subtle mb-3">Click to toggle tags</p>
        <div class="flex flex-wrap gap-2 max-h-64 overflow-y-auto">
          {#each availableTags as tag}
            <button
              onclick={() => toggleTag(tag)}
              class="px-3 py-1.5 rounded-full text-sm transition-colors {tags.find(
                (t) => t.id === tag.id
              )
                ? 'bg-gremius-cyan text-black'
                : 'bg-gremius-border/50 text-gremius-text hover:bg-gremius-border'}"
            >
              {tag.name}
            </button>
          {/each}
        </div>
      </div>
    </div>
  </Modal>
{/if}

<!-- Promote From Dataset Modal -->
<PromoteFromDataset
  isOpen={showDatasetModal}
  onClose={() => (showDatasetModal = false)}
  onSelect={handleDatasetSelect}
/>

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
