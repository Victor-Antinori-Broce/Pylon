<!--
  QuizRunner.vue — Interactive quiz component.
  Sends answers to backend for server-side grading.
  Never receives correct answers from the API.
-->
<template>
  <div class="quiz-runner">
    <!-- Loading state -->
    <div v-if="loading" class="quiz-loading">
      <div class="spinner" />
      <p>Cargando evaluación...</p>
    </div>

    <!-- Error state -->
    <div v-else-if="error" class="quiz-error">
      <p>{{ error }}</p>
      <button class="retry-btn" @click="loadQuiz">Reintentar</button>
    </div>

    <!-- Results view -->
    <div v-else-if="result" class="quiz-results">
      <div class="result-card" :class="result.passed ? 'result-passed' : 'result-failed'">
        <div class="result-icon">
          <svg v-if="result.passed" class="icon-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <svg v-else class="icon-x" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="m9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>

        <h3 class="result-title">
          {{ result.passed ? '¡Felicidades!' : 'No alcanzaste el puntaje mínimo' }}
        </h3>

        <div class="result-score">
          <span class="score-value">{{ result.score }}%</span>
          <span class="score-detail">
            {{ result.correctAnswers }} / {{ result.totalQuestions }} correctas
          </span>
        </div>

        <div v-if="result.passed && !surveyDone" class="survey-section">
          <p class="survey-prompt">Completa la encuesta de satisfacción para descargar tu certificado.</p>
          <SatisfactionSurvey :course-id="courseId" :api-base="apiBase" @submitted="onSurveyDone" />
        </div>

        <a
          v-if="result.passed && surveyDone"
          class="certificate-btn"
          :href="`${API}/academy/courses/${courseId}/certificate`"
          target="_blank"
        >
          🎓 Descargar Certificado
        </a>
        <button
          v-if="result.passed && surveyDone"
          class="certificate-btn-alt"
          @click="$emit('showCertificate')"
        >
          Ver Certificado
        </button>

        <button
          v-if="!result.passed"
          class="retry-btn"
          @click="resetQuiz"
        >
          Intentar de nuevo
        </button>
      </div>
    </div>

    <!-- Quiz form -->
    <div v-else-if="quiz" class="quiz-form">
      <div class="quiz-header">
        <h2 class="quiz-title">{{ quiz.title }}</h2>
        <p v-if="quiz.description" class="quiz-desc">{{ quiz.description }}</p>
        <div class="quiz-meta">
          <span>{{ quiz.questions.length }} preguntas</span>
          <span>·</span>
          <span>Puntaje mínimo: {{ quiz.passingScore }}%</span>
        </div>
      </div>

      <!-- Questions -->
      <div class="questions-list">
        <div
          v-for="(question, qIdx) in quiz.questions"
          :key="question.id"
          class="question-card"
        >
          <div class="question-header">
            <span class="question-num">{{ qIdx + 1 }}</span>
            <p class="question-text">{{ question.questionText }}</p>
          </div>

          <div class="options-list">
            <label
              v-for="(option, oIdx) in question.options"
              :key="oIdx"
              class="option-label"
              :class="{
                'option-selected': answers[question.id] === oIdx
              }"
            >
              <input
                type="radio"
                :name="`q-${question.id}`"
                :value="oIdx"
                class="option-radio"
                @change="answers[question.id] = oIdx"
              />
              <span class="option-marker">
                {{ String.fromCharCode(65 + oIdx) }}
              </span>
              <span class="option-text">{{ option }}</span>
            </label>
          </div>
        </div>
      </div>

      <!-- Submit -->
      <div class="quiz-actions">
        <div class="answered-count">
          {{ answeredCount }} / {{ quiz.questions.length }} respondidas
        </div>
        <button
          class="submit-btn"
          :disabled="submitting || answeredCount < quiz.questions.length"
          @click="submitQuiz"
        >
          <span v-if="submitting" class="spinner-small" />
          {{ submitting ? 'Enviando...' : 'Enviar respuestas' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, reactive } from "vue";
import SatisfactionSurvey from "./SatisfactionSurvey.vue";

const props = defineProps<{
  quizId: string;
  courseId: string;
  apiBase?: string;
}>();

defineEmits<{
  showCertificate: [];
}>();

const API = props.apiBase || "http://localhost:3001/api/custom";

const loading = ref(true);
const error = ref<string | null>(null);
const submitting = ref(false);
const quiz = ref<any>(null);
const result = ref<any>(null);
const answers = reactive<Record<string, number>>({});
const surveyDone = ref(false);

const answeredCount = computed(() => Object.keys(answers).length);

function onSurveyDone() {
  surveyDone.value = true;
}

async function loadQuiz() {
  loading.value = true;
  error.value = null;
  try {
    const res = await fetch(`${API}/academy/quizzes/${props.quizId}`, {
      credentials: "include",
    });
    if (!res.ok) throw new Error("No se pudo cargar el quiz.");
    quiz.value = await res.json();
  } catch (e: any) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

async function submitQuiz() {
  submitting.value = true;
  error.value = null;
  try {
    const res = await fetch(`${API}/academy/quizzes/${props.quizId}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ answers }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || "Error al enviar el quiz.");
    }
    const data = await res.json();
    result.value = data.data;
  } catch (e: any) {
    error.value = e.message;
  } finally {
    submitting.value = false;
  }
}

function resetQuiz() {
  result.value = null;
  Object.keys(answers).forEach((k) => delete answers[k]);
}

onMounted(loadQuiz);
</script>

<style scoped>
.quiz-runner {
  max-width: 48rem;
}

/* ── Loading ── */
.quiz-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  padding: 3rem;
  color: rgba(255, 255, 255, 0.4);
  font-size: 0.85rem;
}

.spinner {
  width: 2rem;
  height: 2rem;
  border: 2px solid rgba(99, 102, 241, 0.2);
  border-top-color: #6366f1;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
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

/* ── Error ── */
.quiz-error {
  text-align: center;
  padding: 2rem;
  color: #f87171;
  font-size: 0.85rem;
}

.retry-btn {
  margin-top: 1rem;
  padding: 0.5rem 1.25rem;
  border-radius: 0.5rem;
  background: rgba(99, 102, 241, 0.15);
  border: 1px solid rgba(99, 102, 241, 0.3);
  color: #a5b4fc;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.retry-btn:hover {
  background: rgba(99, 102, 241, 0.25);
}

/* ── Results ── */
.quiz-results {
  display: flex;
  justify-content: center;
  padding: 2rem 0;
}

.result-card {
  text-align: center;
  padding: 2.5rem;
  border-radius: 1rem;
  border: 1px solid;
  max-width: 24rem;
  width: 100%;
  animation: result-enter 0.5s ease-out;
}

@keyframes result-enter {
  from {
    opacity: 0;
    transform: scale(0.9) translateY(10px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.result-passed {
  background: rgba(16, 185, 129, 0.06);
  border-color: rgba(16, 185, 129, 0.2);
}

.result-failed {
  background: rgba(239, 68, 68, 0.06);
  border-color: rgba(239, 68, 68, 0.2);
}

.result-icon {
  margin-bottom: 1rem;
}

.icon-check {
  width: 3rem;
  height: 3rem;
  color: #34d399;
}

.icon-x {
  width: 3rem;
  height: 3rem;
  color: #f87171;
}

.result-title {
  font-family: 'Source Serif 4', 'Georgia', serif;
  font-size: 1.25rem;
  font-weight: 700;
  color: #f1f5f9;
  margin-bottom: 1rem;
}

.result-score {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin-bottom: 1.5rem;
}

.score-value {
  font-family: 'DM Sans', sans-serif;
  font-size: 2.5rem;
  font-weight: 800;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.score-detail {
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.4);
}

.certificate-btn {
  padding: 0.65rem 1.5rem;
  border-radius: 0.5rem;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: #fff;
  font-size: 0.85rem;
  font-weight: 600;
  border: none;
  cursor: pointer;
  transition: all 0.2s;
}

.certificate-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 8px 25px rgba(99, 102, 241, 0.3);
}

/* ── Quiz form ── */
.quiz-header {
  margin-bottom: 2rem;
}

.quiz-title {
  font-family: 'Source Serif 4', 'Georgia', serif;
  font-size: 1.5rem;
  font-weight: 700;
  color: #f1f5f9;
}

.quiz-desc {
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.5);
  margin-top: 0.5rem;
}

.quiz-meta {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.75rem;
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.35);
}

/* ── Questions ── */
.questions-list {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.question-card {
  padding: 1.25rem;
  border-radius: 0.75rem;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.question-header {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.question-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.5rem;
  height: 1.5rem;
  border-radius: 0.375rem;
  background: rgba(99, 102, 241, 0.15);
  color: #a5b4fc;
  font-size: 0.7rem;
  font-weight: 700;
}

.question-text {
  font-family: 'DM Sans', sans-serif;
  font-size: 0.9rem;
  color: #e2e8f0;
  line-height: 1.5;
}

.options-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding-left: 2.25rem;
}

.option-label {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.6rem 0.8rem;
  border-radius: 0.5rem;
  border: 1px solid rgba(255, 255, 255, 0.06);
  cursor: pointer;
  transition: all 0.15s;
}

.option-label:hover {
  border-color: rgba(99, 102, 241, 0.25);
  background: rgba(99, 102, 241, 0.04);
}

.option-selected {
  border-color: rgba(99, 102, 241, 0.4) !important;
  background: rgba(99, 102, 241, 0.08) !important;
}

.option-radio {
  display: none;
}

.option-marker {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.4rem;
  height: 1.4rem;
  border-radius: 0.3rem;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 0.65rem;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.4);
  flex-shrink: 0;
  transition: all 0.15s;
}

.option-selected .option-marker {
  background: #6366f1;
  border-color: #6366f1;
  color: #fff;
}

.option-text {
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.65);
}

/* ── Actions ── */
.quiz-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 2rem;
  padding-top: 1.5rem;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.answered-count {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.35);
}

.submit-btn {
  display: inline-flex;
  align-items: center;
  padding: 0.6rem 1.5rem;
  border-radius: 0.5rem;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: #fff;
  font-size: 0.85rem;
  font-weight: 600;
  border: none;
  cursor: pointer;
  transition: all 0.2s;
}

.submit-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 8px 25px rgba(99, 102, 241, 0.3);
}

.submit-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* ── Survey section ── */
.survey-section {
  margin-top: 1.5rem;
  text-align: left;
}

.survey-prompt {
  font-family: 'DM Sans', sans-serif;
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.5);
  margin-bottom: 1rem;
}

.certificate-btn-alt {
  display: inline-flex;
  align-items: center;
  margin-top: 0.5rem;
  padding: 0.5rem 1.25rem;
  border-radius: 0.5rem;
  background: transparent;
  border: 1px solid rgba(99, 102, 241, 0.3);
  color: #a5b4fc;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.certificate-btn-alt:hover {
  background: rgba(99, 102, 241, 0.08);
}
</style>
