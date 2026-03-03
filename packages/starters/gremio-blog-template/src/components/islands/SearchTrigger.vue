<template>
  <button
    @click="openSearch"
    class="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-1.5
           text-sm text-zinc-500 hover:border-gremius-cyan/30 hover:text-zinc-300 transition-all cursor-pointer"
  >
    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
    <span class="hidden sm:inline">Search</span>
    <kbd class="hidden sm:inline-flex items-center gap-0.5 rounded-md bg-white/5 border border-white/10 px-1.5 py-0.5 text-[10px] font-mono text-zinc-500">
      ⌘K
    </kbd>
  </button>
</template>

<script setup lang="ts">
import { openSearch } from "@/stores/ui";
</script>
