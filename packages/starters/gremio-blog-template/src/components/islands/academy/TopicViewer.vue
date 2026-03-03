<!--
  TopicViewer.vue — Rich text + video viewer for academy topics.
  Renders HTML content and embeds YouTube or MinIO video URLs.
-->
<template>
  <div class="topic-viewer">
    <!-- Topic navigation header -->
    <div class="topic-header">
      <span class="topic-number">{{ topicIndex + 1 }}</span>
      <h2 class="topic-title">{{ topic.title }}</h2>
    </div>

    <!-- Video embed -->
    <div v-if="videoEmbedUrl" class="video-wrapper">
      <iframe
        :src="videoEmbedUrl"
        class="video-frame"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowfullscreen
        loading="lazy"
      />
    </div>

    <!-- Direct video (MinIO/S3) -->
    <div v-else-if="isDirectVideo" class="video-wrapper">
      <video
        :src="topic.videoUrl"
        class="video-frame"
        controls
        preload="metadata"
      />
    </div>

    <!-- Rich text content -->
    <div
      v-if="htmlContent"
      class="topic-content prose"
      v-html="htmlContent"
    />

    <!-- Empty state -->
    <div v-if="!htmlContent && !videoEmbedUrl && !isDirectVideo" class="empty-state">
      <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <p>Este tema aún no tiene contenido.</p>
    </div>

    <!-- Completion button -->
    <div class="topic-complete-section">
      <button
        v-if="!isCompleted"
        class="complete-btn"
        :disabled="markingComplete"
        @click="markComplete"
      >
        <span v-if="markingComplete" class="spinner-tiny" />
        <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="check-icon">
          <path d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        {{ markingComplete ? 'Guardando...' : 'Marcar como completado' }}
      </button>
      <div v-else class="completed-badge">
        <svg viewBox="0 0 24 24" fill="currentColor" class="check-icon">
          <path fill-rule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm13.36-1.814a.75.75 0 1 0-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.14-.094l3.75-5.25Z" clip-rule="evenodd"/>
        </svg>
        Completado
      </div>
    </div>

    <!-- Navigation buttons -->
    <div class="topic-nav">
      <button
        v-if="topicIndex > 0"
        class="nav-btn"
        @click="$emit('navigate', topicIndex - 1)"
      >
        ← Anterior
      </button>
      <div class="nav-spacer" />
      <button
        v-if="hasNext"
        class="nav-btn nav-btn-primary"
        @click="$emit('navigate', topicIndex + 1)"
      >
        Siguiente →
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";

const props = defineProps<{
  topic: {
    id: string;
    title: string;
    content?: any;
    videoUrl?: string | null;
  };
  topicIndex: number;
  hasNext: boolean;
  completed?: boolean;
  apiBase?: string;
}>();

const emit = defineEmits<{
  navigate: [index: number];
  completed: [topicId: string];
}>();

const API = props.apiBase || "http://localhost:3001/api/custom";
const markingComplete = ref(false);
const isCompleted = ref(props.completed ?? false);

async function markComplete() {
  markingComplete.value = true;
  try {
    const res = await fetch(`${API}/academy/topics/${props.topic.id}/complete`, {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) throw new Error("Error");
    isCompleted.value = true;
    emit("completed", props.topic.id);
  } catch {
    // silent fail — button stays clickable
  } finally {
    markingComplete.value = false;
  }
}

const videoEmbedUrl = computed(() => {
  const url = props.topic.videoUrl;
  if (!url) return null;

  // YouTube
  const ytMatch = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}`;

  return null;
});

const isDirectVideo = computed(() => {
  const url = props.topic.videoUrl;
  if (!url || videoEmbedUrl.value) return false;
  return /\.(mp4|webm|ogg)(\?|$)/i.test(url);
});

const htmlContent = computed(() => {
  const c = props.topic.content;
  if (!c) return null;
  if (typeof c === "string") return c;
  // If Lexical/Tiptap JSON, render as a simple fallback
  if (typeof c === "object" && c.html) return c.html;
  if (typeof c === "object" && c.content) {
    return JSON.stringify(c.content);
  }
  return null;
});
</script>

<style scoped>
.topic-viewer {
  max-width: 48rem;
}

.topic-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}

.topic-number {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: 0.5rem;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: #fff;
  font-family: 'DM Sans', sans-serif;
  font-size: 0.8rem;
  font-weight: 700;
  flex-shrink: 0;
}

.topic-title {
  font-family: 'Source Serif 4', 'Georgia', serif;
  font-size: 1.5rem;
  font-weight: 700;
  color: #f1f5f9;
  line-height: 1.3;
}

/* ── Video ── */
.video-wrapper {
  position: relative;
  aspect-ratio: 16 / 9;
  border-radius: 0.75rem;
  overflow: hidden;
  margin-bottom: 2rem;
  background: #000;
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.video-frame {
  width: 100%;
  height: 100%;
  border: none;
}

/* ── Content ── */
.topic-content {
  font-family: 'DM Sans', sans-serif;
  font-size: 0.95rem;
  line-height: 1.75;
  color: rgba(255, 255, 255, 0.7);
}

.topic-content :deep(h1),
.topic-content :deep(h2),
.topic-content :deep(h3) {
  font-family: 'Source Serif 4', 'Georgia', serif;
  color: #f1f5f9;
  margin-top: 2rem;
  margin-bottom: 0.75rem;
}

.topic-content :deep(a) {
  color: #a5b4fc;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.topic-content :deep(code) {
  background: rgba(255, 255, 255, 0.06);
  padding: 0.15rem 0.4rem;
  border-radius: 0.25rem;
  font-size: 0.85em;
}

.topic-content :deep(pre) {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 0.5rem;
  padding: 1rem;
  overflow-x: auto;
  margin: 1.5rem 0;
}

.topic-content :deep(img) {
  border-radius: 0.5rem;
  margin: 1.5rem 0;
}

.topic-content :deep(ul),
.topic-content :deep(ol) {
  padding-left: 1.5rem;
  margin: 1rem 0;
}

.topic-content :deep(li) {
  margin: 0.4rem 0;
}

/* ── Empty state ── */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 3rem;
  text-align: center;
  color: rgba(255, 255, 255, 0.3);
  font-size: 0.85rem;
}

.empty-icon {
  width: 2.5rem;
  height: 2.5rem;
  opacity: 0.4;
}

/* ── Navigation ── */
.topic-nav {
  display: flex;
  align-items: center;
  margin-top: 3rem;
  padding-top: 1.5rem;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.nav-spacer {
  flex: 1;
}

.nav-btn {
  padding: 0.5rem 1.25rem;
  border-radius: 0.5rem;
  font-family: 'DM Sans', sans-serif;
  font-size: 0.8rem;
  font-weight: 600;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: transparent;
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  transition: all 0.2s;
}

.nav-btn:hover {
  border-color: rgba(99, 102, 241, 0.4);
  color: #a5b4fc;
  background: rgba(99, 102, 241, 0.05);
}

.nav-btn-primary {
  background: rgba(99, 102, 241, 0.15);
  border-color: rgba(99, 102, 241, 0.3);
  color: #a5b4fc;
}

.nav-btn-primary:hover {
  background: rgba(99, 102, 241, 0.25);
}

/* ── Completion button ── */
.topic-complete-section {
  margin-top: 2rem;
  display: flex;
  justify-content: flex-end;
}

.complete-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.55rem 1.25rem;
  border-radius: 0.5rem;
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid rgba(16, 185, 129, 0.25);
  color: #34d399;
  font-family: 'DM Sans', sans-serif;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.complete-btn:hover:not(:disabled) {
  background: rgba(16, 185, 129, 0.18);
  border-color: rgba(16, 185, 129, 0.4);
}

.complete-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.completed-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.55rem 1.25rem;
  border-radius: 0.5rem;
  background: rgba(16, 185, 129, 0.08);
  color: #34d399;
  font-family: 'DM Sans', sans-serif;
  font-size: 0.8rem;
  font-weight: 600;
}

.check-icon {
  width: 1.1rem;
  height: 1.1rem;
}

.spinner-tiny {
  display: inline-block;
  width: 0.9rem;
  height: 0.9rem;
  border: 2px solid rgba(52, 211, 153, 0.2);
  border-top-color: #34d399;
  border-radius: 50%;
  animation: spin-tiny 0.6s linear infinite;
}

@keyframes spin-tiny {
  to { transform: rotate(360deg); }
}
</style>
