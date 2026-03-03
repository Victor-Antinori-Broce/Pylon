<template>
  <section class="relative flex min-h-[85vh] flex-col items-center justify-center text-center overflow-hidden">
    <!-- Animated background grid -->
    <div class="absolute inset-0 overflow-hidden">
      <!-- Grid lines -->
      <div
        class="absolute inset-0 opacity-[0.04]"
        style="background-image: linear-gradient(rgba(0,229,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(0,229,255,1) 1px, transparent 1px); background-size: 80px 80px;"
      />
      <!-- Radial gradient center glow -->
      <div class="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(0,229,255,0.06)_0%,_transparent_70%)]" />
      <!-- Top fade -->
      <div class="absolute top-0 inset-x-0 h-32 bg-gradient-to-b from-gremius-bg to-transparent" />
      <!-- Bottom fade -->
      <div class="absolute bottom-0 inset-x-0 h-48 bg-gradient-to-t from-gremius-bg to-transparent" />
    </div>

    <!-- Floating orbs (pure CSS) -->
    <div class="absolute w-[500px] h-[500px] rounded-full bg-gremius-cyan/[0.02] blur-[120px] -top-40 -left-40 animate-pulse-neon" />
    <div class="absolute w-[400px] h-[400px] rounded-full bg-gremius-pink/[0.03] blur-[100px] -bottom-20 -right-40" style="animation: pulse-neon 4s ease-in-out infinite reverse;" />

    <!-- Content -->
    <div class="relative z-10 max-w-3xl px-4">
      <!-- Hex icon -->
      <div
        ref="hexRef"
        :style="hexStyle"
        class="mx-auto mb-10 h-20 w-20 bg-gremius-cyan"
        style="clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)"
      />

      <!-- Glitch title -->
      <h1
        ref="titleRef"
        :style="titleStyle"
        class="font-display text-5xl font-bold tracking-tight text-gremius-heading md:text-7xl lg:text-8xl"
      >
        <span class="glitch" data-text="DECRYPTING">DECRYPTING</span>
        <br />
        <span class="text-gradient bg-gradient-gremius bg-clip-text text-transparent">THE META</span>
      </h1>

      <!-- Subtitle -->
      <p
        ref="subtitleRef"
        :style="subtitleStyle"
        class="mx-auto mt-8 max-w-xl text-lg text-zinc-400 leading-relaxed"
      >
        The high-performance gaming CMS. Lightning-fast pages, powerful data management,
        and a design system forged for the gaming community.
      </p>

      <!-- CTAs -->
      <div
        ref="ctaRef"
        :style="ctaStyle"
        class="mt-12 flex flex-wrap items-center justify-center gap-4"
      >
        <a href="/games" class="gremius-btn-primary group">
          <span>Explore Database</span>
          <svg class="w-4 h-4 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </a>
        <a href="/blog" class="gremius-btn-secondary">
          Read Blog
        </a>
      </div>
    </div>

    <!-- Stats bar -->
    <div
      ref="statsRef"
      :style="statsStyle"
      class="relative z-10 mt-24 w-full max-w-3xl"
    >
      <div class="hud-grid grid-cols-3">
        <div class="hud-cell text-center">
          <p class="font-display text-3xl font-bold text-gremius-cyan">100</p>
          <p class="mt-1 text-[11px] uppercase tracking-wider text-zinc-500">Lighthouse</p>
        </div>
        <div class="hud-cell text-center">
          <p class="font-display text-3xl font-bold text-gremius-pink">0<span class="text-base ml-0.5">kb</span></p>
          <p class="mt-1 text-[11px] uppercase tracking-wider text-zinc-500">Default JS</p>
        </div>
        <div class="hud-cell text-center">
          <p class="font-display text-3xl font-bold text-gremius-green">∞</p>
          <p class="mt-1 text-[11px] uppercase tracking-wider text-zinc-500">Data Tables</p>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, onMounted, type CSSProperties } from "vue";

// Simple staggered entry animation (no external deps needed)
const hexRef = ref<HTMLElement>();
const titleRef = ref<HTMLElement>();
const subtitleRef = ref<HTMLElement>();
const ctaRef = ref<HTMLElement>();
const statsRef = ref<HTMLElement>();

function initialStyle(delay: number): CSSProperties {
  return {
    opacity: "0",
    transform: "translateY(20px)",
    transition: `opacity 0.7s ease ${delay}s, transform 0.7s ease ${delay}s`,
  };
}

function visibleStyle(): CSSProperties {
  return { opacity: "1", transform: "translateY(0)" };
}

const hexStyle = ref<CSSProperties>(initialStyle(0.1));
const titleStyle = ref<CSSProperties>(initialStyle(0.2));
const subtitleStyle = ref<CSSProperties>(initialStyle(0.4));
const ctaStyle = ref<CSSProperties>(initialStyle(0.55));
const statsStyle = ref<CSSProperties>(initialStyle(0.7));

onMounted(() => {
  requestAnimationFrame(() => {
    hexStyle.value = { ...hexStyle.value, ...visibleStyle() };
    titleStyle.value = { ...titleStyle.value, ...visibleStyle() };
    subtitleStyle.value = { ...subtitleStyle.value, ...visibleStyle() };
    ctaStyle.value = { ...ctaStyle.value, ...visibleStyle() };
    statsStyle.value = { ...statsStyle.value, ...visibleStyle() };
  });
});
</script>
