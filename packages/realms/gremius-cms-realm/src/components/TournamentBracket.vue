<script setup lang="ts">
import { ref, onMounted } from 'vue';

const props = defineProps({
  tournamentId: {
    type: String,
    required: true
  }
});

const matches = ref([]);
const loading = ref(true);
const error = ref(null);

onMounted(async () => {
  try {
    const res = await fetch(`/api/tournaments/${props.tournamentId}/matches`);
    if (!res.ok) throw new Error('Failed to load bracket data');
    const data = await res.json();
    matches.value = data;
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
});

// Group matches by round for easier rendering
const rounds = computed(() => {
  if (!matches.value.length) return [];
  
  const grouped = {};
  matches.value.forEach(match => {
    if (!grouped[match.round]) {
      grouped[match.round] = [];
    }
    grouped[match.round].push(match);
  });
  
  // Convert object to array sorted by round
  return Object.keys(grouped)
    .sort((a, b) => Number(a) - Number(b))
    .map(key => ({
      roundNumber: Number(key),
      matches: grouped[key].sort((a, b) => a.matchOrder - b.matchOrder)
    }));
});

const formatName = (participantInfo, placeholder) => {
    if (!participantInfo) return placeholder;
    return participantInfo.alias || participantInfo.name || "TBD";
};
</script>

<template>
  <div class="bracket-container">
    <div v-if="loading" class="loading-glitch">INITIALIZING BRACKET_DATA...</div>
    <div v-else-if="error" class="error-msg">SYS_ERR: {{ error }}</div>
    
    <div v-else class="bracket-tree">
      <div v-for="round in rounds" :key="round.roundNumber" class="bracket-round">
        <h3 class="round-title">ROUND {{ round.roundNumber }}</h3>
        
        <div class="matches-col">
          <div v-for="match in round.matches" :key="match.id" class="match-card">
            
            <div class="match-participant" :class="{ 'winner': match.winnerId === match.participant1Id }">
              <span class="p-name">{{ formatName(match.participant1, 'TBD') }}</span>
              <span class="p-score">{{ match.participant1Score }}</span>
            </div>
            
            <div class="match-divider">VS</div>
            
            <div class="match-participant" :class="{ 'winner': match.winnerId === match.participant2Id }">
              <span class="p-name">{{ formatName(match.participant2, 'TBD') }}</span>
              <span class="p-score">{{ match.participant2Score }}</span>
            </div>
            
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bracket-container {
  width: 100%;
  overflow-x: auto;
  padding: var(--space-xl) 0;
  font-family: var(--font-mono);
}

.loading-glitch, .error-msg {
  color: var(--gremius-cyan);
  text-align: center;
  font-size: 1.5rem;
  letter-spacing: 0.2em;
  text-shadow: var(--shadow-glow-cyan);
  animation: pulse 2s infinite;
}

.error-msg {
  color: var(--gremius-red);
  text-shadow: 0 0 10px rgba(239, 68, 68, 0.5);
}

.bracket-tree {
  display: flex;
  gap: var(--space-2xl);
  min-width: max-content;
  padding: 0 var(--space-md);
}

.bracket-round {
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
}

.round-title {
  color: var(--gremius-pink);
  font-size: 0.875rem;
  letter-spacing: 0.1em;
  text-align: center;
  margin-bottom: var(--space-md);
  text-shadow: var(--shadow-glow-pink);
}

.matches-col {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: var(--space-xl);
  height: 100%;
}

.match-card {
  background: var(--gremius-elevated);
  border: 1px solid var(--gremius-border-subtle);
  border-radius: var(--radius-sm);
  width: 200px;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
  box-shadow: var(--shadow-sm);
  transition: var(--transition-normal);
}

.match-card:hover {
  border-color: var(--gremius-cyan-dim);
  box-shadow: var(--shadow-glow-cyan);
  transform: translateY(-2px);
}

/* Connecting physical lines could be complex with CSS alone in a dynamic flex layout, 
   so we keep it simple or implement borders pseudo-elements if strictly required. */

.match-participant {
  display: flex;
  justify-content: space-between;
  padding: var(--space-sm) var(--space-md);
  background: var(--gremius-card);
  color: var(--gremius-text-secondary);
  border-left: 2px solid transparent;
}

.match-participant.winner {
  color: var(--gremius-text);
  background: rgba(0, 229, 255, 0.05); /* very subtle cyan bg */
  border-left-color: var(--gremius-cyan);
  font-weight: bold;
}

.match-participant.winner .p-name {
  color: var(--gremius-cyan);
  text-shadow: var(--shadow-glow-cyan);
}
.match-participant.winner .p-score {
  color: var(--gremius-success); /* explicitly requested neon success color */
}

.p-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 80%;
}

.p-score {
  font-weight: bold;
}

.match-divider {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 20px;
  background: var(--gremius-border);
  font-size: 0.65rem;
  color: var(--gremius-text-muted);
  letter-spacing: 0.1em;
  border-top: 1px solid var(--gremius-border-subtle);
  border-bottom: 1px solid var(--gremius-border-subtle);
}

@keyframes pulse {
  0% { opacity: 0.7; }
  50% { opacity: 1; }
  100% { opacity: 0.7; }
}
</style>
