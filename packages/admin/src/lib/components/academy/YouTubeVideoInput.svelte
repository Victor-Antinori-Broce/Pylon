<script lang="ts">
  import { Video, Loader2, AlertCircle, Check, ExternalLink } from "lucide-svelte";

  import { api } from "$lib/api";

  interface YouTubeInfo {
    videoId: string;
    embedUrl: string;
    thumbnailUrl: string;
    titulo?: string;
    valido: boolean;
  }

  interface Props {
    value: string;
    onChange: (value: string, info: YouTubeInfo | null) => void;
    label?: string;
    required?: boolean;
  }

  const { value = "", onChange, label = "Video de YouTube", required = false }: Props = $props();

  let loading = $state(false);
  let error = $state<string | null>(null);
  let videoInfo = $state<YouTubeInfo | null>(null);
  let inputValue = $state(value);

  // Validar URL de YouTube
  function isValidYouTubeUrl(url: string): boolean {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/watch\?.*v=([a-zA-Z0-9_-]{11})/,
    ];
    return patterns.some((p) => p.test(url));
  }

  async function handleValidate() {
    error = null;
    videoInfo = null;

    if (!inputValue.trim()) {
      onChange("", null);
      return;
    }

    if (!isValidYouTubeUrl(inputValue)) {
      error = "URL de YouTube no válida. Usa formato: https://www.youtube.com/watch?v=VIDEO_ID";
      return;
    }

    loading = true;

    try {
      const info = await api.getYouTubeInfo(inputValue);

      if (!info.valido) {
        error = "No se pudo extraer información del video";
        return;
      }

      videoInfo = info;
      // Guardamos la URL embed que es la que se usa para mostrar el video
      onChange(info.embedUrl, info);
    } catch (err: any) {
      error = err.message || "Error al validar el video";
    } finally {
      loading = false;
    }
  }

  function handleInput() {
    // Debounce para no hacer requests en cada tecla
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (inputValue && isValidYouTubeUrl(inputValue)) {
        handleValidate();
      }
    }, 800);
  }

  let debounceTimer: ReturnType<typeof setTimeout>;

  // Si viene un valor inicial, validarlo
  $effect(() => {
    if (value && !videoInfo) {
      inputValue = value;
      handleValidate();
    }
  });
</script>

<div class="space-y-3">
  <label class="block text-sm font-medium text-gremius-text">
    {label}
    {#if required}
      <span class="text-red-400">*</span>
    {/if}
  </label>

  <div class="relative">
    <div class="absolute left-3 top-1/2 -translate-y-1/2 text-gremius-subtle">
      <Video class="w-5 h-5" />
    </div>
    <input
      type="url"
      bind:value={inputValue}
      oninput={handleInput}
      onblur={handleValidate}
      placeholder="https://www.youtube.com/watch?v=..."
      class="w-full pl-10 pr-10 py-2 bg-gremius-surface border border-gremius-border rounded-lg text-gremius-text placeholder:text-gremius-subtle focus:outline-none focus:border-gremius-cyan/50"
    />
    {#if loading}
      <div class="absolute right-3 top-1/2 -translate-y-1/2">
        <Loader2 class="w-4 h-4 animate-spin text-gremius-cyan" />
      </div>
    {:else if videoInfo}
      <div class="absolute right-3 top-1/2 -translate-y-1/2 text-green-500">
        <Check class="w-4 h-4" />
      </div>
    {/if}
  </div>

  {#if error}
    <div class="flex items-center gap-2 text-sm text-red-400">
      <AlertCircle class="w-4 h-4" />
      {error}
    </div>
  {/if}

  <!-- Preview del video -->
  {#if videoInfo}
    <div class="card p-3 border-gremius-cyan/20">
      <div class="flex gap-3">
        <div class="w-32 h-20 bg-gremius-surface rounded-lg overflow-hidden flex-shrink-0">
          <img src={videoInfo.thumbnailUrl} alt="Thumbnail" class="w-full h-full object-cover" />
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium text-gremius-text truncate">
            {videoInfo.titulo || "Video de YouTube"}
          </p>
          <p class="text-xs text-gremius-subtle mt-1">
            ID: {videoInfo.videoId}
          </p>
          <a
            href={inputValue}
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-1 text-xs text-gremius-cyan hover:underline mt-2"
          >
            <ExternalLink class="w-3 h-3" />
            Ver en YouTube
          </a>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .card {
    @apply bg-gremius-card border border-gremius-border rounded-xl;
  }
</style>
