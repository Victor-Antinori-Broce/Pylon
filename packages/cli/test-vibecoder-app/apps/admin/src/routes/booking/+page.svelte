<script lang="ts">
  import { onMount } from "svelte";
  import { CalendarDays, Clock, Users, DoorOpen, Plus, ChevronLeft, ChevronRight, CheckCircle, XCircle } from "lucide-svelte";
  import { api } from "$lib/api";

  // Types
  interface Room {
    id: string;
    name: string;
    capacity: number;
    type: string;
    status: string;
  }

  interface Booking {
    id: string;
    roomId: string;
    roomName?: string;
    title: string;
    startTime: string;
    endTime: string;
    status: "pending" | "confirmed" | "checked_in" | "checked_out" | "cancelled";
    bookedForName?: string;
    expectedAttendees?: number;
  }

  // Quick links for booking
  const quickLinks = [
    { href: "/booking/rooms", icon: DoorOpen, title: "Salas", description: "Gestionar salas y recursos" },
    { href: "/booking/bookings", icon: CalendarDays, title: "Reservas", description: "Ver todas las reservas" },
  ];

  // State
  let rooms: Room[] = $state([]);
  let bookings: Booking[] = $state([]);
  let selectedDate = $state(new Date());
  let loading = $state(true);

  // Get week dates
  function getWeekDates(date: Date): Date[] {
    const start = new Date(date);
    const day = start.getDay();
    const diff = start.getDate() - day + (day === 0 ? -6 : 1);
    start.setDate(diff);
    start.setHours(0, 0, 0, 0);
    
    const week: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      week.push(d);
    }
    return week;
  }

  const weekDates = $derived(getWeekDates(selectedDate));
  const weekRange = $derived({
    start: weekDates[0],
    end: weekDates[6]
  });

  function formatDate(date: Date): string {
    return date.toLocaleDateString("es-ES", { weekday: "short", day: "numeric" });
  }

  function formatTime(dateStr: string): string {
    return new Date(dateStr).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  }

  function isToday(date: Date): boolean {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  }

  function isSameDay(date1: Date, date2: Date): boolean {
    return date1.toDateString() === date2.toDateString();
  }

  function getBookingsForDay(date: Date): Booking[] {
    return bookings
      .filter(b => {
        const bookingDate = new Date(b.startTime);
        return isSameDay(bookingDate, date);
      })
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  }

  function previousWeek() {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() - 7);
    selectedDate = newDate;
    loadBookings();
  }

  function nextWeek() {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + 7);
    selectedDate = newDate;
    loadBookings();
  }

  function goToToday() {
    selectedDate = new Date();
    loadBookings();
  }

  function getStatusColor(status: string): string {
    const colors: Record<string, string> = {
      pending: "bg-amber-500/20 text-amber-400 border-amber-500/30",
      confirmed: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
      checked_in: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
      checked_out: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
      cancelled: "bg-red-500/20 text-red-400 border-red-500/30",
    };
    return colors[status] || "bg-zinc-500/20 text-zinc-400";
  }

  function getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      pending: "Pendiente",
      confirmed: "Confirmada",
      checked_in: "Check-in",
      checked_out: "Check-out",
      cancelled: "Cancelada",
    };
    return labels[status] || status;
  }

  async function loadRooms() {
    try {
      const res = await api.get("/booking/rooms") as { docs: Room[] };
      rooms = res.docs || [];
    } catch (e) {
      console.error("Error loading rooms:", e);
    }
  }

  async function loadBookings() {
    try {
      const startStr = weekDates[0].toISOString();
      const endStr = weekDates[6].toISOString();
      const res = await api.get(`/booking/bookings?startAfter=${startStr}&startBefore=${endStr}&limit=100`) as { docs: Booking[] };
      bookings = res.docs || [];
    } catch (e) {
      console.error("Error loading bookings:", e);
    }
  }

  onMount(async () => {
    try {
      loading = true;
      await Promise.all([loadRooms(), loadBookings()]);
    } finally {
      loading = false;
    }
  });

  const todayBookings = $derived(bookings.filter(b => {
    const bookingDate = new Date(b.startTime);
    return isToday(bookingDate);
  }));

  const pendingCount = $derived(todayBookings.filter(b => b.status === "pending").length);
  const checkedInCount = $derived(todayBookings.filter(b => b.status === "checked_in").length);
</script>

<div class="space-y-6">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div>
      <h1 class="text-2xl font-semibold text-white flex items-center gap-3">
        <CalendarDays class="w-7 h-7 text-gremius-cyan" />
        Booking Dashboard
      </h1>
      <p class="text-gremius-subtle mt-1">Gestión de reservas de salas y recursos</p>
    </div>
    
    <a href="/booking/bookings/new" class="btn btn-primary gap-2">
      <Plus class="w-4 h-4" />
      Nueva Reserva
    </a>
  </div>

  <!-- Quick Links -->
  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
    {#each quickLinks as link}
      <a href={link.href} class="card p-4 hover:border-gremius-cyan/50 transition-all group">
        <div class="flex items-center gap-4">
          <div class="w-12 h-12 rounded-xl bg-gremius-cyan/20 flex items-center justify-center group-hover:scale-110 transition-transform">
            <link.icon class="w-6 h-6 text-gremius-cyan" />
          </div>
          <div>
            <h3 class="font-medium text-white">{link.title}</h3>
            <p class="text-sm text-gremius-subtle">{link.description}</p>
          </div>
        </div>
      </a>
    {/each}
  </div>

  <!-- Stats Cards -->
  <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
    <div class="card p-4">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-sm text-gremius-subtle">Salas Disponibles</p>
          <p class="text-2xl font-semibold text-white mt-1">{rooms.filter(r => r.status === "available").length}</p>
        </div>
        <div class="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center">
          <DoorOpen class="w-6 h-6 text-emerald-400" />
        </div>
      </div>
    </div>

    <div class="card p-4">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-sm text-gremius-subtle">Reservas Hoy</p>
          <p class="text-2xl font-semibold text-white mt-1">{todayBookings.length}</p>
        </div>
        <div class="w-12 h-12 rounded-xl bg-gremius-cyan/20 flex items-center justify-center">
          <CalendarDays class="w-6 h-6 text-gremius-cyan" />
        </div>
      </div>
    </div>

    <div class="card p-4">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-sm text-gremius-subtle">Pendientes</p>
          <p class="text-2xl font-semibold text-amber-400 mt-1">{pendingCount}</p>
        </div>
        <div class="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center">
          <Clock class="w-6 h-6 text-amber-400" />
        </div>
      </div>
    </div>

    <div class="card p-4">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-sm text-gremius-subtle">Check-ins</p>
          <p class="text-2xl font-semibold text-cyan-400 mt-1">{checkedInCount}</p>
        </div>
        <div class="w-12 h-12 rounded-xl bg-cyan-500/20 flex items-center justify-center">
          <CheckCircle class="w-6 h-6 text-cyan-400" />
        </div>
      </div>
    </div>
  </div>

  <!-- Calendar Navigation -->
  <div class="card">
    <div class="p-4 border-b border-gremius-border flex items-center justify-between">
      <div class="flex items-center gap-4">
        <button onclick={previousWeek} class="btn-icon" aria-label="Semana anterior">
          <ChevronLeft class="w-5 h-5" />
        </button>
        <h2 class="text-lg font-medium text-white">
          {weekRange.start.toLocaleDateString("es-ES", { month: "long", day: "numeric" })} - 
          {weekRange.end.toLocaleDateString("es-ES", { month: "long", day: "numeric", year: "numeric" })}
        </h2>
        <button onclick={nextWeek} class="btn-icon" aria-label="Semana siguiente">
          <ChevronRight class="w-5 h-5" />
        </button>
      </div>
      <button onclick={goToToday} class="btn btn-sm btn-ghost">Hoy</button>
    </div>

    <!-- Week Calendar -->
    <div class="grid grid-cols-7 divide-x divide-gremius-border">
      {#each weekDates as date}
        <div class="min-h-[400px] {isToday(date) ? 'bg-gremius-cyan/5' : ''}">
          <!-- Day Header -->
          <div class="p-3 text-center border-b border-gremius-border {isToday(date) ? 'bg-gremius-cyan/10' : 'bg-gremius-card'}">
            <p class="text-xs text-gremius-subtle uppercase">{date.toLocaleDateString("es-ES", { weekday: "short" })}</p>
            <p class="text-lg font-semibold {isToday(date) ? 'text-gremius-cyan' : 'text-white'}">{date.getDate()}</p>
          </div>

          <!-- Bookings -->
          <div class="p-2 space-y-2">
            {#each getBookingsForDay(date) as booking}
              <a 
                href="/booking/bookings/{booking.id}"
                class="block p-2 rounded-lg border text-xs transition-all hover:scale-[1.02] {getStatusColor(booking.status)}"
              >
                <div class="flex items-center gap-1 font-medium">
                  <Clock class="w-3 h-3" />
                  {formatTime(booking.startTime)} - {formatTime(booking.endTime)}
                </div>
                <p class="truncate mt-1 font-medium">{booking.title}</p>
                <p class="truncate opacity-80">{booking.roomName || booking.roomId}</p>
                {#if booking.bookedForName}
                  <p class="truncate opacity-70 flex items-center gap-1 mt-0.5">
                    <Users class="w-3 h-3" />
                    {booking.bookedForName}
                  </p>
                {/if}
              </a>
            {/each}

            {#if getBookingsForDay(date).length === 0}
              <p class="text-center text-xs text-gremius-subtle py-4">Sin reservas</p>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  </div>
</div>

<style>
  .card {
    @apply bg-gremius-card border border-gremius-border rounded-xl;
  }
  
  .btn {
    @apply inline-flex items-center justify-center px-4 py-2 rounded-lg font-medium transition-all;
  }
  
  .btn-primary {
    @apply bg-gremius-cyan text-gremius-bg hover:bg-gremius-cyan/90;
  }
  
  .btn-sm {
    @apply px-3 py-1.5 text-sm;
  }
  
  .btn-ghost {
    @apply text-gremius-subtle hover:text-white hover:bg-white/5;
  }
  
  .btn-icon {
    @apply p-2 rounded-lg text-gremius-subtle hover:text-white hover:bg-white/5 transition-colors;
  }
</style>
