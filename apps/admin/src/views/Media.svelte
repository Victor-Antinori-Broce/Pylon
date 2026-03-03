<script lang="ts">
  import { ImageIcon, UploadCloud, Trash2, Copy, CheckCircle2 } from "lucide-svelte";
  import { onMount } from "svelte";

  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

  let mediaItems = $state<any[]>([]);
  let loading = $state(true);
  let uploading = $state(false);
  let error = $state<string | null>(null);
  let copiedUrl = $state<string | null>(null);

  async function loadMedia() {
    loading = true;
    try {
      const res = await fetch(`${API_URL}/api/media?limit=100`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load media.");
      const data = await res.json();
      mediaItems = data.docs || [];
    } catch (err: any) {
      error = err.message;
    } finally {
      loading = false;
    }
  }

  async function handleFileSelect(e: Event) {
    const files = (e.target as HTMLInputElement).files;
    if (!files || files.length === 0) return;

    uploading = true;
    error = null;

    try {
      for (let i=0; i < files.length; i++) {
        const file = files[i];
        const formData = new FormData();
        formData.append("file", file);
        
        const res = await fetch(`${API_URL}/api/media/upload`, {
          method: "POST",
          body: formData,
          credentials: "include"
        });
        
        if (!res.ok) throw new Error("Upload failed for " + file.name);
      }
      
      await loadMedia();
    } catch (err: any) {
      error = err.message;
    } finally {
      uploading = false;
      // Reset input
      (e.target as HTMLInputElement).value = "";
    }
  }

  async function deleteMedia(id: string) {
    if (!confirm("Are you sure? This will delete the image permanently.")) return;
    try {
      const res = await fetch(`${API_URL}/api/media/${id}`, {
        method: "DELETE",
        credentials: "include"
      });
      if (!res.ok) throw new Error("Failed to delete");
      mediaItems = mediaItems.filter(m => m.id !== id);
    } catch (err: any) {
      alert(err.message);
    }
  }

  function copyUrl(url: string) {
    navigator.clipboard.writeText(url).then(() => {
      copiedUrl = url;
      setTimeout(() => copiedUrl = null, 2000);
    });
  }

  onMount(() => {
    loadMedia();
  });
</script>

<div class="space-y-6 animate-fade-in relative">
  <div class="flex items-center justify-between">
    <div>
      <h1 class="text-2xl font-bold text-gremius-text flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-gremius-purple/20 to-gremius-pink/20 border border-gremius-purple/20 flex items-center justify-center">
          <ImageIcon class="w-5 h-5 text-gremius-purple" />
        </div>
        Media Library
      </h1>
      <p class="text-sm text-gremius-subtle mt-1">
        Manage images, videos, and files. Files are automatically optimized to WebP.
      </p>
    </div>
    
    <label class="btn-primary cursor-pointer relative overflow-hidden">
      {#if uploading}
        <div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
        Uploading...
      {:else}
        <UploadCloud class="w-4 h-4" />
        Upload Files
      {/if}
      <input 
        type="file" 
        multiple 
        accept="image/*" 
        class="absolute inset-0 opacity-0 cursor-pointer" 
        onchange={handleFileSelect}
        disabled={uploading}
      />
    </label>
  </div>

  {#if error}
    <div class="p-4 bg-red-500/10 border border-red-500/20 text-red-500 rounded-lg text-sm">
      {error}
    </div>
  {/if}

  {#if loading}
    <div class="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
      {#each Array(12) as _}
        <div class="aspect-square rounded-xl bg-gremius-bg border border-gremius-border animate-pulse"></div>
      {/each}
    </div>
  {:else if mediaItems.length === 0}
    <div class="card p-16 text-center border-dashed border-gremius-border">
      <div class="w-16 h-16 rounded-full bg-gremius-bg flex items-center justify-center mx-auto mb-4 border border-gremius-border">
        <ImageIcon class="w-8 h-8 text-gremius-subtle" />
      </div>
      <h3 class="text-lg font-medium text-gremius-text mb-2">No media found</h3>
      <p class="text-sm text-gremius-subtle">
        Upload images to use them in your content, games, and blog posts.
      </p>
    </div>
  {:else}
    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
      {#each mediaItems as media (media.id)}
        <div class="group relative aspect-square rounded-xl bg-[#0a0a12] border border-gremius-border overflow-hidden hover:border-gremius-purple/50 transition-colors">
          <!-- Checkerboard background for transparent images -->
          <div class="absolute inset-0 opacity-[0.03]" style="background-image: linear-gradient(45deg, #fff 25%, transparent 25%), linear-gradient(-45deg, #fff 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #fff 75%), linear-gradient(-45deg, transparent 75%, #fff 75%); background-size: 16px 16px; background-position: 0 0, 0 8px, 8px -8px, -8px 0px;"></div>
          
          <img 
            src={media.url} 
            alt={media.filename} 
            class="absolute inset-0 w-full h-full object-contain p-2"
            loading="lazy"
          />

          <!-- Overlay -->
          <div class="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/80 via-black/40 to-transparent translate-y-full group-hover:translate-y-0 transition-transform">
            <p class="text-[10px] font-medium text-gremius-text truncate px-1">{media.filename}</p>
            <div class="flex items-center justify-between mt-2">
              <span class="text-[9px] text-gremius-subtle bg-black/50 px-1.5 py-0.5 rounded backdrop-blur-sm uppercase">
                {media.mimeType.split('/')[1] || 'FILE'}
              </span>
              <div class="flex items-center gap-1">
                <button 
                  class="p-1.5 bg-gremius-purple/20 hover:bg-gremius-purple/40 text-gremius-purple rounded backdrop-blur-sm transition-colors"
                  onclick={() => copyUrl(media.url)}
                  title="Copy URL"
                >
                  {#if copiedUrl === media.url}
                    <CheckCircle2 class="w-3 h-3" />
                  {:else}
                    <Copy class="w-3 h-3" />
                  {/if}
                </button>
                <button 
                  class="p-1.5 bg-red-500/20 hover:bg-red-500/40 text-red-400 rounded backdrop-blur-sm transition-colors"
                  onclick={() => deleteMedia(media.id)}
                  title="Delete"
                >
                  <Trash2 class="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
