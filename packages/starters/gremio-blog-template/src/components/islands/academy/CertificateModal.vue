<!--
  CertificateModal.vue — Certificate display with CSS-only reveal animation.
  Modal that appears when a user passes a quiz.
-->
<template>
  <Teleport to="body">
    <Transition name="cert">
      <div v-if="visible" class="cert-overlay" @click.self="close">
        <div class="cert-container">
          <!-- Close button -->
          <button class="cert-close" @click="close" aria-label="Cerrar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M6 18 18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>

          <!-- Certificate -->
          <div class="certificate">
            <!-- Decorative border corners -->
            <div class="cert-corner cert-tl" />
            <div class="cert-corner cert-tr" />
            <div class="cert-corner cert-bl" />
            <div class="cert-corner cert-br" />

            <!-- Content -->
            <div class="cert-body">
              <div class="cert-emblem">
                <svg class="emblem-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 0v-3.675A55.378 55.378 0 0 1 12 8.443m-7.007 11.55A5.981 5.981 0 0 0 6.75 15.75v-1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </div>

              <p class="cert-label">Certificado de Completación</p>

              <h2 class="cert-institution">Gremius Academy</h2>

              <p class="cert-affirm">Certifica que</p>

              <h3 class="cert-name">{{ userName || 'Participante' }}</h3>

              <p class="cert-detail">
                Ha completado satisfactoriamente el curso
              </p>

              <h4 class="cert-course">{{ courseName }}</h4>

              <div class="cert-score-section">
                <span class="cert-score">Puntaje: {{ score }}%</span>
              </div>

              <div class="cert-date">
                {{ formattedDate }}
              </div>

              <!-- Confetti particles (CSS only) -->
              <div class="confetti-container" aria-hidden="true">
                <div v-for="i in 20" :key="i" class="confetti-piece" :style="confettiStyle(i)" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  visible: boolean;
  userName?: string;
  courseName: string;
  score: number;
  completedAt?: string;
}>();

const emit = defineEmits<{
  close: [];
}>();

function close() {
  emit("close");
}

const formattedDate = computed(() => {
  const d = props.completedAt ? new Date(props.completedAt) : new Date();
  return d.toLocaleDateString("es-ES", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
});

function confettiStyle(i: number) {
  const hue = (i * 37) % 360;
  const left = ((i * 17) % 100);
  const delay = (i * 0.15) % 2;
  const duration = 1.5 + (i % 3) * 0.5;
  const size = 4 + (i % 4) * 2;
  return {
    left: `${left}%`,
    animationDelay: `${delay}s`,
    animationDuration: `${duration}s`,
    width: `${size}px`,
    height: `${size}px`,
    backgroundColor: `hsl(${hue}, 80%, 65%)`,
  };
}
</script>

<style scoped>
/* ── Overlay ── */
.cert-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(6px);
  padding: 1rem;
}

.cert-container {
  position: relative;
  max-width: 36rem;
  width: 100%;
}

.cert-close {
  position: absolute;
  top: -2.5rem;
  right: 0;
  width: 2rem;
  height: 2rem;
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  transition: color 0.2s;
  z-index: 1;
}

.cert-close:hover {
  color: #fff;
}

.cert-close svg {
  width: 1.25rem;
  height: 1.25rem;
}

/* ── Certificate ── */
.certificate {
  position: relative;
  background: linear-gradient(170deg, #1a1a2e, #16213e);
  border: 2px solid rgba(99, 102, 241, 0.3);
  border-radius: 1rem;
  overflow: hidden;
  box-shadow:
    0 25px 80px rgba(0, 0, 0, 0.5),
    0 0 60px rgba(99, 102, 241, 0.08);
}

/* ── Corner decorations ── */
.cert-corner {
  position: absolute;
  width: 3rem;
  height: 3rem;
  border-color: rgba(99, 102, 241, 0.4);
  border-style: solid;
  border-width: 0;
}
.cert-tl { top: 0.5rem; left: 0.5rem; border-top-width: 2px; border-left-width: 2px; border-top-left-radius: 0.5rem; }
.cert-tr { top: 0.5rem; right: 0.5rem; border-top-width: 2px; border-right-width: 2px; border-top-right-radius: 0.5rem; }
.cert-bl { bottom: 0.5rem; left: 0.5rem; border-bottom-width: 2px; border-left-width: 2px; border-bottom-left-radius: 0.5rem; }
.cert-br { bottom: 0.5rem; right: 0.5rem; border-bottom-width: 2px; border-right-width: 2px; border-bottom-right-radius: 0.5rem; }

/* ── Body ── */
.cert-body {
  position: relative;
  padding: 3rem 2.5rem;
  text-align: center;
  z-index: 1;
}

.cert-emblem {
  margin-bottom: 1.25rem;
}

.emblem-icon {
  width: 3rem;
  height: 3rem;
  color: #a5b4fc;
  margin: 0 auto;
  animation: emblem-glow 2s ease-in-out infinite alternate;
}

@keyframes emblem-glow {
  from { filter: drop-shadow(0 0 4px rgba(99, 102, 241, 0.3)); }
  to { filter: drop-shadow(0 0 12px rgba(99, 102, 241, 0.6)); }
}

.cert-label {
  font-family: 'DM Sans', sans-serif;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.15em;
  color: rgba(165, 180, 252, 0.7);
  margin-bottom: 0.5rem;
}

.cert-institution {
  font-family: 'Source Serif 4', 'Georgia', serif;
  font-size: 2rem;
  font-weight: 800;
  background: linear-gradient(135deg, #a5b4fc, #c4b5fd, #e0e7ff);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  margin-bottom: 1.5rem;
}

.cert-affirm {
  font-family: 'DM Sans', sans-serif;
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.4);
  margin-bottom: 0.5rem;
}

.cert-name {
  font-family: 'Source Serif 4', 'Georgia', serif;
  font-size: 1.5rem;
  font-weight: 700;
  color: #f1f5f9;
  margin-bottom: 1rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid rgba(99, 102, 241, 0.2);
  display: inline-block;
}

.cert-detail {
  font-family: 'DM Sans', sans-serif;
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.45);
  margin-bottom: 0.35rem;
}

.cert-course {
  font-family: 'Source Serif 4', 'Georgia', serif;
  font-size: 1.1rem;
  font-weight: 600;
  color: #a5b4fc;
  margin-bottom: 1.25rem;
}

.cert-score-section {
  margin-bottom: 1rem;
}

.cert-score {
  display: inline-block;
  padding: 0.3rem 0.8rem;
  border-radius: 9999px;
  background: rgba(99, 102, 241, 0.15);
  border: 1px solid rgba(99, 102, 241, 0.25);
  font-family: 'DM Sans', sans-serif;
  font-size: 0.75rem;
  font-weight: 600;
  color: #a5b4fc;
}

.cert-date {
  font-family: 'DM Sans', sans-serif;
  font-size: 0.7rem;
  color: rgba(255, 255, 255, 0.3);
}

/* ── Confetti ── */
.confetti-container {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  z-index: 0;
}

.confetti-piece {
  position: absolute;
  top: -10px;
  border-radius: 1px;
  opacity: 0;
  animation: confetti-fall linear forwards;
}

@keyframes confetti-fall {
  0% {
    opacity: 1;
    transform: translateY(0) rotate(0deg);
  }
  100% {
    opacity: 0;
    transform: translateY(500px) rotate(720deg);
  }
}

/* ── Transitions ── */
.cert-enter-active {
  transition: all 0.4s ease-out;
}
.cert-leave-active {
  transition: all 0.25s ease-in;
}
.cert-enter-from {
  opacity: 0;
}
.cert-enter-from .certificate {
  transform: scale(0.85) translateY(20px);
}
.cert-leave-to {
  opacity: 0;
}
.cert-leave-to .certificate {
  transform: scale(0.9);
}
</style>
