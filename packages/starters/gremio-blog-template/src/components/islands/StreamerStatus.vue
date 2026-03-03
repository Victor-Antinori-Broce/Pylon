<template>
  <!--
    StreamerStatus.vue — Live stream embed widget
    Supports Twitch, YouTube, and Kick embeds
  -->
  <div class="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
    <!-- Stream embed -->
    <div class="relative aspect-video bg-black">
      <!-- Twitch -->
      <iframe
        v-if="platform === 'twitch'"
        :src="`https://player.twitch.tv/?channel=${channelName}&parent=${hostname}&autoplay=${autoplay}`"
        class="absolute inset-0 w-full h-full"
        allowfullscreen
        frameborder="0"
      />
      <!-- YouTube -->
      <iframe
        v-else-if="platform === 'youtube'"
        :src="`https://www.youtube.com/embed/live_stream?channel=${channelName}&autoplay=${autoplay ? 1 : 0}`"
        class="absolute inset-0 w-full h-full"
        allowfullscreen
        frameborder="0"
      />
      <!-- Kick -->
      <iframe
        v-else-if="platform === 'kick'"
        :src="`https://player.kick.com/${channelName}`"
        class="absolute inset-0 w-full h-full"
        allowfullscreen
        frameborder="0"
      />

      <!-- Live badge overlay -->
      <div class="absolute top-3 left-3 flex items-center gap-2">
        <span class="flex items-center gap-1.5 rounded-full bg-red-600 px-2.5 py-1 text-[11px] font-bold text-white uppercase tracking-wider">
          <span class="w-2 h-2 rounded-full bg-white animate-pulse" />
          Live
        </span>
        <span class="rounded-full bg-black/60 backdrop-blur-sm px-2.5 py-1 text-[11px] text-white/80">
          {{ platformLabel }}
        </span>
      </div>
    </div>

    <!-- Chat (optional) -->
    <div v-if="showChat && platform === 'twitch'" class="h-[400px] border-t border-white/[0.06]">
      <iframe
        :src="`https://www.twitch.tv/embed/${channelName}/chat?parent=${hostname}&darkpopout`"
        class="w-full h-full"
        frameborder="0"
      />
    </div>

    <!-- Channel info bar -->
    <div class="flex items-center justify-between px-5 py-3 border-t border-white/[0.06] bg-white/[0.02]">
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 rounded-full bg-gremius-pink/10 border border-gremius-pink/20 flex items-center justify-center">
          <span class="text-xs font-bold text-gremius-pink">{{ channelName?.[0]?.toUpperCase() || '?' }}</span>
        </div>
        <div>
          <p class="text-sm font-medium text-gremius-text">{{ channelName }}</p>
          <p class="text-[10px] text-zinc-500">{{ platformLabel }}</p>
        </div>
      </div>
      <a
        :href="channelUrl"
        target="_blank"
        rel="noopener"
        class="gremius-btn-ghost text-xs"
      >
        Open Channel →
      </a>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(defineProps<{
  channelName: string;
  platform?: "twitch" | "youtube" | "kick";
  showChat?: boolean;
  autoplay?: boolean;
}>(), {
  platform: "twitch",
  showChat: false,
  autoplay: false,
});

const hostname = typeof window !== "undefined" ? window.location.hostname : "localhost";

const platformLabel = computed(() => {
  const labels = { twitch: "Twitch", youtube: "YouTube", kick: "Kick" };
  return labels[props.platform] || props.platform;
});

const channelUrl = computed(() => {
  switch (props.platform) {
    case "twitch": return `https://twitch.tv/${props.channelName}`;
    case "youtube": return `https://youtube.com/channel/${props.channelName}`;
    case "kick": return `https://kick.com/${props.channelName}`;
    default: return "#";
  }
});
</script>
