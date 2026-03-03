<template>
  <div class="calendar-widget p-4 rounded-xl border border-gremius-border bg-gremius-card/50">
    <!-- Header -->
    <div class="flex items-center justify-between mb-4">
       <button @click="prevMonth" class="btn-icon p-2 hover:bg-gremius-bg rounded-lg">
         <ChevronLeft class="w-5 h-5" />
       </button>
       <h3 class="text-lg font-semibold text-gremius-text">
         {{ currentMonthName }} {{ currentYear }}
       </h3>
       <button @click="nextMonth" class="btn-icon p-2 hover:bg-gremius-bg rounded-lg">
         <ChevronRight class="w-5 h-5" />
       </button>
    </div>

    <!-- Days Grid -->
    <div class="grid grid-cols-7 gap-1 text-center mb-2">
       <div v-for="day in ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']" :key="day" class="text-xs text-gremius-text-dim uppercase tracking-wider font-semibold py-2">
         {{ day }}
       </div>
    </div>
    
    <div class="grid grid-cols-7 gap-1">
       <!-- Empty slots -->
       <div v-for="n in startOffset" :key="`empty-${n}`" class="h-24 bg-transparent" />
       
       <!-- Days -->
       <div 
         v-for="day in daysInMonth" 
         :key="day" 
         class="h-24 border border-gremius-border/30 rounded-lg p-1 relative hover:bg-gremius-bg/50 transition-colors group overflow-hidden"
       >
         <div :class="['text-xs w-6 h-6 flex items-center justify-center rounded-full mb-1', isToday(day) ? 'bg-gremius-cyan text-white' : 'text-gremius-text-dim group-hover:text-gremius-text']">
           {{ day }}
         </div>
         
         <!-- Events -->
         <div class="space-y-1 overflow-y-auto max-h-[calc(100%-24px)] custom-scrollbar">
            <div 
              v-for="event in getEventsForDay(day)" 
              :key="event.id"
              class="text-[10px] bg-gremius-cyan/10 text-gremius-cyan px-1.5 py-0.5 rounded truncate border-l-2 border-gremius-cyan cursor-pointer hover:bg-gremius-cyan/20"
              @click="$emit('select', event)"
              :title="event.title"
            >
              {{ event.title }}
            </div>
         </div>
       </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { ChevronLeft, ChevronRight } from 'lucide-vue-next';

interface CalendarEvent {
  id: string;
  title: string;
  date: Date;
  [key: string]: any;
}

const props = defineProps<{
  events: CalendarEvent[];
}>();

const emit = defineEmits(['select']);

const currentDate = ref(new Date());

const currentYear = computed(() => currentDate.value.getFullYear());
const currentMonth = computed(() => currentDate.value.getMonth());

const currentMonthName = computed(() => {
  return currentDate.value.toLocaleDateString('en-US', { month: 'long' });
});

const daysInMonth = computed(() => {
  return new Date(currentYear.value, currentMonth.value + 1, 0).getDate();
});

const startOffset = computed(() => {
  return new Date(currentYear.value, currentMonth.value, 1).getDay();
});

function prevMonth() {
  currentDate.value = new Date(currentYear.value, currentMonth.value - 1, 1);
}

function nextMonth() {
  currentDate.value = new Date(currentYear.value, currentMonth.value + 1, 1);
}

function isToday(day: number) {
  const today = new Date();
  return today.getDate() === day && 
         today.getMonth() === currentMonth.value && 
         today.getFullYear() === currentYear.value;
}

function getEventsForDay(day: number) {
  return props.events.filter(e => {
    const d = new Date(e.date);
    return d.getDate() === day && 
           d.getMonth() === currentMonth.value && 
           d.getFullYear() === currentYear.value;
  });
}
</script>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 2px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(255,255,255,0.1);
  border-radius: 2px;
}
</style>
