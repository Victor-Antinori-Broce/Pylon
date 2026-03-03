<!--
  CourseCard.vue — Interactive course card for the Academy catalog.
  Shows title, description, thumbnail, and enrollment progress.
-->
<template>
  <a
    :href="`/academy/${course.slug}`"
    class="course-card group"
    @mouseenter="hovered = true"
    @mouseleave="hovered = false"
  >
    <!-- Thumbnail -->
    <div class="card-cover">
      <img
        v-if="course.thumbnailUrl"
        :src="course.thumbnailUrl"
        :alt="course.title"
        loading="lazy"
        class="cover-img"
      />
      <div v-else class="cover-placeholder">
        <svg class="placeholder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 0v-3.675A55.378 55.378 0 0 1 12 8.443m-7.007 11.55A5.981 5.981 0 0 0 6.75 15.75v-1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>

      <!-- Status pill -->
      <div class="status-pill" :class="statusClass">
        {{ statusLabel }}
      </div>

      <!-- Hover shimmer -->
      <div class="card-shimmer" />
    </div>

    <!-- Info -->
    <div class="card-body">
      <h3 class="card-title">{{ course.title }}</h3>
      <p v-if="course.description" class="card-desc">{{ course.description }}</p>

      <!-- Progress bar (if enrolled) -->
      <div v-if="enrollment" class="progress-section">
        <div class="progress-bar-bg">
          <div
            class="progress-bar-fill"
            :style="{ width: progressPercent + '%' }"
          />
        </div>
        <span class="progress-label">{{ progressPercent }}% completado</span>
      </div>

      <!-- Topics count -->
      <div class="card-meta">
        <span v-if="topicCount > 0" class="meta-item">
          <svg class="meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          {{ topicCount }} temas
        </span>
        <span v-if="hasQuiz" class="meta-item quiz-badge">
          <svg class="meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Evaluación
        </span>
      </div>
    </div>

    <!-- Glow border on hover -->
    <div class="card-glow" />
  </a>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";

const props = defineProps<{
  course: {
    id: string;
    title: string;
    slug: string;
    description?: string | null;
    thumbnailUrl?: string | null;
    status: string;
    topics?: any[];
    quiz?: any | null;
  };
  enrollment?: {
    status: string;
    topicsCompleted: number;
  } | null;
  topicCount?: number;
  hasQuiz?: boolean;
}>();

const hovered = ref(false);

const statusClass = computed(() => {
  if (props.enrollment?.status === "completed") return "status-completed";
  if (props.enrollment) return "status-enrolled";
  return "status-available";
});

const statusLabel = computed(() => {
  if (props.enrollment?.status === "completed") return "Completado ✓";
  if (props.enrollment?.status === "in_progress") return "En progreso";
  if (props.enrollment) return "Matriculado";
  return "Disponible";
});

const progressPercent = computed(() => {
  if (!props.enrollment || !props.topicCount) return 0;
  return Math.min(
    100,
    Math.round((props.enrollment.topicsCompleted / props.topicCount) * 100)
  );
});
</script>

<style scoped>
.course-card {
  display: flex;
  flex-direction: column;
  border-radius: 1rem;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.025);
  border: 1px solid rgba(255, 255, 255, 0.06);
  transition: border-color 0.3s, transform 0.3s, box-shadow 0.3s;
  text-decoration: none;
  position: relative;
}

.course-card:hover {
  border-color: rgba(99, 102, 241, 0.4);
  transform: translateY(-6px);
  box-shadow:
    0 20px 60px rgba(0, 0, 0, 0.4),
    0 0 40px rgba(99, 102, 241, 0.06);
}

/* ── Cover ── */
.card-cover {
  position: relative;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.02);
}

.cover-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.5s ease;
}

.course-card:hover .cover-img {
  transform: scale(1.06);
}

.cover-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.08), rgba(139, 92, 246, 0.04));
}

.placeholder-icon {
  width: 3rem;
  height: 3rem;
  color: rgba(99, 102, 241, 0.4);
}

.card-shimmer {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    105deg,
    transparent 40%,
    rgba(255, 255, 255, 0.03) 50%,
    transparent 60%
  );
  transform: translateX(-100%);
  transition: transform 0.8s ease;
  pointer-events: none;
}

.course-card:hover .card-shimmer {
  transform: translateX(100%);
}

/* ── Status pill ── */
.status-pill {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  padding: 0.2rem 0.6rem;
  border-radius: 9999px;
  font-size: 0.65rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  backdrop-filter: blur(8px);
}

.status-available {
  background: rgba(99, 102, 241, 0.2);
  color: #a5b4fc;
  border: 1px solid rgba(99, 102, 241, 0.3);
}

.status-enrolled {
  background: rgba(245, 158, 11, 0.2);
  color: #fbbf24;
  border: 1px solid rgba(245, 158, 11, 0.3);
}

.status-completed {
  background: rgba(16, 185, 129, 0.2);
  color: #34d399;
  border: 1px solid rgba(16, 185, 129, 0.3);
}

/* ── Body ── */
.card-body {
  padding: 1rem;
  flex: 1;
  display: flex;
  flex-direction: column;
}

.card-title {
  font-family: 'Source Serif 4', 'Georgia', serif;
  font-size: 1rem;
  font-weight: 700;
  color: #f1f5f9;
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  transition: color 0.2s;
}

.course-card:hover .card-title {
  color: #a5b4fc;
}

.card-desc {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.4);
  margin-top: 0.35rem;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* ── Progress ── */
.progress-section {
  margin-top: auto;
  padding-top: 0.75rem;
}

.progress-bar-bg {
  height: 4px;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.06);
  overflow: hidden;
}

.progress-bar-fill {
  height: 100%;
  border-radius: 9999px;
  background: linear-gradient(90deg, #6366f1, #8b5cf6);
  transition: width 0.5s ease;
}

.progress-label {
  font-size: 0.65rem;
  color: rgba(255, 255, 255, 0.35);
  margin-top: 0.3rem;
  display: block;
}

/* ── Meta ── */
.card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  margin-top: auto;
  padding-top: 0.75rem;
}

.meta-item {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.65rem;
  color: rgba(255, 255, 255, 0.35);
}

.meta-icon {
  width: 0.85rem;
  height: 0.85rem;
}

.quiz-badge {
  color: rgba(99, 102, 241, 0.7);
}

/* ── Glow ── */
.card-glow {
  position: absolute;
  inset: 0;
  border-radius: 1rem;
  background: radial-gradient(
    ellipse at top center,
    rgba(99, 102, 241, 0.04) 0%,
    transparent 60%
  );
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.3s;
}

.course-card:hover .card-glow {
  opacity: 1;
}
</style>
