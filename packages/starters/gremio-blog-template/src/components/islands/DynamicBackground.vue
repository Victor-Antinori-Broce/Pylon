<!--
  DynamicBackground.vue — Full-screen background that fades when you hover a game card.
  Subscribes to the interaction store for background URL changes.
-->
<template>
  <div class="dynamic-bg" aria-hidden="true">
    <Transition name="bg-fade">
      <div
        v-if="bgUrl"
        :key="bgUrl"
        class="bg-layer"
        :style="{ backgroundImage: `url(${bgUrl})` }"
      />
    </Transition>
    <!-- Permanent overlay so text stays readable -->
    <div class="bg-overlay" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { onBackgroundChange } from "../../stores/interaction";

const bgUrl = ref<string | null>(null);
let unsub: (() => void) | null = null;

onMounted(() => {
  unsub = onBackgroundChange((url) => {
    bgUrl.value = url;
  });
});

onUnmounted(() => {
  unsub?.();
});
</script>

<style scoped>
.dynamic-bg {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  overflow: hidden;
}

.bg-layer {
  position: absolute;
  inset: -20px; /* slight overscan for blur */
  background-size: cover;
  background-position: center;
  filter: blur(30px) saturate(1.4);
  transform: scale(1.1);
  will-change: opacity;
}

.bg-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    180deg,
    rgba(9, 9, 14, 0.7) 0%,
    rgba(9, 9, 14, 0.85) 50%,
    rgba(9, 9, 14, 0.95) 100%
  );
}

/* Transitions */
.bg-fade-enter-active,
.bg-fade-leave-active {
  transition: opacity 0.5s ease;
}
.bg-fade-enter-from,
.bg-fade-leave-to {
  opacity: 0;
}
</style>
