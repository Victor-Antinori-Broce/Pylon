<!--
  ComparisonSlider.vue — Client-side hydrated island
  Before/After image comparison with draggable vertical divider.
  Supports mouse, touch, and keyboard (arrow keys).
-->
<template>
  <div
    class="comparison-slider"
    ref="containerRef"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointerleave="onPointerUp"
    @keydown.left="nudge(-2)"
    @keydown.right="nudge(2)"
    tabindex="0"
    role="slider"
    :aria-valuenow="Math.round(position)"
    aria-valuemin="0"
    aria-valuemax="100"
    aria-label="Comparison slider"
  >
    <!-- After (background — full width) -->
    <div class="layer after-layer">
      <img :src="afterImageUrl" :alt="afterLabel" loading="lazy" />
      <span class="image-label after-label">{{ afterLabel }}</span>
    </div>

    <!-- Before (clipped to position) -->
    <div class="layer before-layer" :style="{ clipPath: `inset(0 ${100 - position}% 0 0)` }">
      <img :src="beforeImageUrl" :alt="beforeLabel" loading="lazy" />
      <span class="image-label before-label">{{ beforeLabel }}</span>
    </div>

    <!-- Divider handle -->
    <div class="divider" :style="{ left: position + '%' }">
      <div class="divider-line" />
      <div class="divider-handle">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M7 4L3 10L7 16" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M13 4L17 10L13 16" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";

defineProps<{
  beforeImageUrl: string;
  afterImageUrl: string;
  beforeLabel: string;
  afterLabel: string;
}>();

const containerRef = ref<HTMLElement | null>(null);
const position = ref(50); // percentage 0-100
const dragging = ref(false);

function getPosition(clientX: number) {
  const el = containerRef.value;
  if (!el) return 50;
  const rect = el.getBoundingClientRect();
  const pct = ((clientX - rect.left) / rect.width) * 100;
  return Math.max(0, Math.min(100, pct));
}

function onPointerDown(e: PointerEvent) {
  dragging.value = true;
  position.value = getPosition(e.clientX);
  (e.target as HTMLElement)?.setPointerCapture?.(e.pointerId);
}

function onPointerMove(e: PointerEvent) {
  if (!dragging.value) return;
  position.value = getPosition(e.clientX);
}

function onPointerUp() {
  dragging.value = false;
}

function nudge(delta: number) {
  position.value = Math.max(0, Math.min(100, position.value + delta));
}
</script>

<style scoped>
.comparison-slider {
  position: relative;
  width: 100%;
  aspect-ratio: 16/9;
  border-radius: 1rem;
  overflow: hidden;
  cursor: ew-resize;
  user-select: none;
  touch-action: none;
  border: 1px solid rgba(255,255,255,0.08);
  background: #000;
  outline: none;
}
.comparison-slider:focus-visible {
  box-shadow: 0 0 0 2px rgba(0,229,255,0.4);
}

.layer {
  position: absolute;
  inset: 0;
}
.layer img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.image-label {
  position: absolute;
  bottom: 1rem;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  padding: 0.3em 0.8em;
  border-radius: 9999px;
  backdrop-filter: blur(8px);
  pointer-events: none;
}
.before-label {
  left: 1rem;
  background: rgba(0,229,255,0.2);
  color: #00E5FF;
  border: 1px solid rgba(0,229,255,0.25);
}
.after-label {
  right: 1rem;
  background: rgba(224,64,251,0.2);
  color: #E040FB;
  border: 1px solid rgba(224,64,251,0.25);
}

/* Divider */
.divider {
  position: absolute;
  top: 0;
  bottom: 0;
  transform: translateX(-50%);
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.divider-line {
  flex: 1;
  width: 2px;
  background: rgba(255,255,255,0.8);
  box-shadow: 0 0 12px rgba(0,229,255,0.3);
}

.divider-handle {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: rgba(0,0,0,0.7);
  backdrop-filter: blur(8px);
  border: 2px solid rgba(255,255,255,0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  box-shadow: 0 2px 16px rgba(0,0,0,0.5);
  transition: transform 0.15s, border-color 0.15s;
}
.comparison-slider:hover .divider-handle,
.comparison-slider:focus-visible .divider-handle {
  border-color: #00E5FF;
  transform: translateY(-50%) scale(1.1);
}
</style>
