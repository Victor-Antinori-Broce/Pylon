<!--
  SatisfactionSurvey.vue — Star-rating + comments form.
  Shown after passing the quiz, mandatory before certificate download.
-->
<template>
  <div class="survey-component">
    <!-- Already submitted state -->
    <div v-if="submitted" class="survey-done">
      <svg class="done-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <p class="done-text">¡Gracias por tu retroalimentación!</p>
    </div>

    <!-- Survey form -->
    <div v-else class="survey-form">
      <h3 class="survey-title">Encuesta de Satisfacción</h3>
      <p class="survey-desc">
        Tu opinión nos ayuda a mejorar. Completa esta encuesta para descargar tu certificado.
      </p>

      <!-- Star rating -->
      <div class="rating-section">
        <label class="rating-label">¿Cómo calificarías este curso?</label>
        <div class="stars">
          <button
            v-for="star in 5"
            :key="star"
            class="star-btn"
            :class="{ 'star-active': rating >= star, 'star-hover': hoverRating >= star }"
            @click="rating = star"
            @mouseenter="hoverRating = star"
            @mouseleave="hoverRating = 0"
            :aria-label="`${star} estrellas`"
          >
            <svg viewBox="0 0 24 24" :fill="rating >= star || hoverRating >= star ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="1.5">
              <path d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>
        <span class="rating-text">{{ ratingText }}</span>
      </div>

      <!-- Comments -->
      <div class="comments-section">
        <label class="comments-label" for="survey-comments">Comentarios (opcional)</label>
        <textarea
          id="survey-comments"
          v-model="comments"
          class="comments-input"
          rows="4"
          placeholder="¿Qué mejorarías del curso?"
          maxlength="2000"
        />
      </div>

      <!-- Error -->
      <div v-if="error" class="survey-error">{{ error }}</div>

      <!-- Submit -->
      <button
        class="survey-submit"
        :disabled="submitting || rating === 0"
        @click="submit"
      >
        <span v-if="submitting" class="spinner-small" />
        {{ submitting ? 'Enviando...' : 'Enviar encuesta' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";

const props = defineProps<{
  courseId: string;
  apiBase?: string;
}>();

const emit = defineEmits<{
  submitted: [];
}>();

const API = props.apiBase || "http://localhost:3001/api/custom";

const rating = ref(0);
const hoverRating = ref(0);
const comments = ref("");
const submitting = ref(false);
const submitted = ref(false);
const error = ref<string | null>(null);

const ratingText = computed(() => {
  const labels = ["", "Muy malo", "Malo", "Regular", "Bueno", "Excelente"];
  const active = hoverRating.value || rating.value;
  return labels[active] || "";
});

async function submit() {
  if (rating.value === 0) return;
  submitting.value = true;
  error.value = null;

  try {
    const res = await fetch(`${API}/academy/courses/${props.courseId}/survey`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        rating: rating.value,
        comments: comments.value || undefined,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || "Error al enviar la encuesta.");
    }

    submitted.value = true;
    emit("submitted");
  } catch (e: any) {
    error.value = e.message;
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
.survey-component {
  max-width: 28rem;
}

/* ── Done ── */
.survey-done {
  text-align: center;
  padding: 2rem;
  border-radius: 0.75rem;
  background: rgba(16, 185, 129, 0.06);
  border: 1px solid rgba(16, 185, 129, 0.2);
}

.done-icon {
  width: 2.5rem;
  height: 2.5rem;
  color: #34d399;
  margin: 0 auto 0.75rem;
}

.done-text {
  font-family: 'DM Sans', sans-serif;
  font-size: 0.9rem;
  color: #34d399;
}

/* ── Form ── */
.survey-form {
  padding: 1.5rem;
  border-radius: 0.75rem;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.survey-title {
  font-family: 'Source Serif 4', 'Georgia', serif;
  font-size: 1.2rem;
  font-weight: 700;
  color: #f1f5f9;
  margin-bottom: 0.35rem;
}

.survey-desc {
  font-family: 'DM Sans', sans-serif;
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.4);
  margin-bottom: 1.5rem;
  line-height: 1.5;
}

/* ── Stars ── */
.rating-section {
  margin-bottom: 1.5rem;
}

.rating-label {
  display: block;
  font-family: 'DM Sans', sans-serif;
  font-size: 0.8rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 0.6rem;
}

.stars {
  display: flex;
  gap: 0.3rem;
}

.star-btn {
  width: 2.2rem;
  height: 2.2rem;
  padding: 0.25rem;
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.15);
  cursor: pointer;
  transition: all 0.15s;
  border-radius: 0.25rem;
}

.star-btn:hover {
  transform: scale(1.1);
}

.star-active,
.star-hover {
  color: #fbbf24 !important;
}

.rating-text {
  display: block;
  margin-top: 0.4rem;
  font-family: 'DM Sans', sans-serif;
  font-size: 0.7rem;
  color: rgba(255, 255, 255, 0.35);
  min-height: 1rem;
}

/* ── Comments ── */
.comments-section {
  margin-bottom: 1.25rem;
}

.comments-label {
  display: block;
  font-family: 'DM Sans', sans-serif;
  font-size: 0.8rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 0.4rem;
}

.comments-input {
  width: 100%;
  padding: 0.6rem 0.8rem;
  border-radius: 0.5rem;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.8);
  font-family: 'DM Sans', sans-serif;
  font-size: 0.8rem;
  resize: vertical;
  transition: border-color 0.2s;
  box-sizing: border-box;
}

.comments-input::placeholder {
  color: rgba(255, 255, 255, 0.25);
}

.comments-input:focus {
  outline: none;
  border-color: rgba(99, 102, 241, 0.4);
}

/* ── Error ── */
.survey-error {
  color: #f87171;
  font-size: 0.75rem;
  margin-bottom: 0.75rem;
}

/* ── Submit ── */
.survey-submit {
  display: inline-flex;
  align-items: center;
  padding: 0.6rem 1.5rem;
  border-radius: 0.5rem;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: #fff;
  font-family: 'DM Sans', sans-serif;
  font-size: 0.85rem;
  font-weight: 600;
  border: none;
  cursor: pointer;
  transition: all 0.2s;
  width: 100%;
  justify-content: center;
}

.survey-submit:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 8px 25px rgba(99, 102, 241, 0.3);
}

.survey-submit:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.spinner-small {
  display: inline-block;
  width: 1rem;
  height: 1rem;
  border: 2px solid rgba(255, 255, 255, 0.2);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  margin-right: 0.4rem;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
