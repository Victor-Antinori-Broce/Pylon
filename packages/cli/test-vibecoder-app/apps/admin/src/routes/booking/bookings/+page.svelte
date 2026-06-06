<script lang="ts">
  import { api } from "$lib/api";
  import { CalendarDays, Search, Plus, Clock, DoorOpen, Users, ChevronLeft, ChevronRight } from "lucide-svelte";
  import { onMount } from "svelte";

  interface Booking {
    id: string;
    roomId: string;
    roomName?: string;
    title: string;
    description?: string;
    startTime: string;
    endTime: string;
    status: "pending" | "confirmed" | "checked_in" | "checked_out" | "cancelled" | "rejected";
    bookedForName?: string;
    bookedForEmail?: string;
    expectedAttendees?: number;
    eventType?: string;
    createdAt: string;
  }

  let bookings: Booking[] = $state([]);
  let loading = $state(true);
  let searchQuery = $state("");
  let statusFilter = $state("");
  let currentPage = $state(1);
  let totalPages = $state(1);

  const statusOptions = [
    { value: "pending", label: "Pendiente", color: "amber" },
    { value: "confirmed", label: "Confirmada", color: "emerald" },
    { value: "checked_in", label: "Check-in", color: "cyan" },
    { value: "checked_out", label: "Check-out", color: "zinc" },
    { value: "cancelled", label: "Cancelada", color: "red" },
  ];

  const filteredBookings = $derived(
    bookings.filter(b => {
      const matchesSearch = !searchQuery || 
        b.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.bookedForName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.roomName?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = !statusFilter || b.status === statusFilter;
      return matchesSearch && matchesStatus;
    })
  );

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString("es-ES", { 
      day: "numeric", 
      month: "short",
      year: "numeric"
    });
  }

  function formatTime(dateStr: string): string {
    return new Date(dateStr).toLocaleTimeString("es-ES", { 
      hour: "2-digit", 
      minute: "2-digit" 
    });
  }

  function getStatusColor(status: string): string {
    const colors: Record<string, string> = {
      pending: "bg-amber-500/20 text-amber-400 border-amber-500/30",
      confirmed: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
      checked_in: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
      checked_out: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
      cancelled: "bg-red-500/20 text-red-400 border-red-500/30",
      rejected: "bg-red-500/20 text-red-400 border-red-500/30",
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
      rejected: "Rechazada",
    };
    return labels[status] || status;
  }

  async function loadBookings() {
    try {
      loading = true;
      const res = await api.get(`/booking/bookings?limit=50&page=${currentPage}`) as { docs: Booking[], totalDocs: number };
      bookings = res.docs || [];
      totalPages = Math.ceil((res.totalDocs || 0) / 50) || 1;
    } catch (e) {
      console.error("Error loading bookings:", e);
    } finally {
      loading = false;
    }
  }

  async function updateStatus(id: string, newStatus: string) {
    try {
      await api.patch(`/booking/bookings/${id}`, { status: newStatus });
      await loadBookings();
    } catch (e) {
      console.error("Error updating status:", e);
      alert("Error al actualizar estado");
    }
  }

  onMount(loadBookings);
</script>

<div class="space-y-6">
  <!-- Header -->
  <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
    <div>
      <h1 class="text-2xl font-semibold text-white flex items-center gap-3">
        <CalendarDays class="w-7 h-7 text-gremius-cyan" />
        Reservas
      </h1>
      <p class="text-gremius-subtle mt-1">Gestiona todas las reservas de salas</p>
    </div>
    
    <a href="/booking/bookings/new" class="btn btn-primary gap-2">
      <Plus class="w-4 h-4" />
      Nueva Reserva
    </a>
  </div>

  <!-- Filters -->
  <div class="card p-4">
    <div class="flex flex-col md:flex-row gap-4">
      <div class="flex-1 relative">
        <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gremius-subtle" />
        <input
          type="text"
          placeholder="Buscar reserva..."
          bind:value={searchQuery}
          class="w-full pl-10 pr-4 py-2 bg-gremius-bg border border-gremius-border rounded-lg text-white placeholder:text-gremius-subtle focus:border-gremius-cyan/50 focus:outline-none"
        />
      </div>
      
      <select
        bind:value={statusFilter}
        class="px-4 py-2 bg-gremius-bg border border-gremius-border rounded-lg text-white focus:border-gremius-cyan/50 focus:outline-none"
      >
        <option value="">Todos los estados</option>
        {#each statusOptions as opt}
          <option value={opt.value}>{opt.label}</option>
        {/each}
      </select>
    </div>
  </div>

  <!-- Bookings Table -->
  <div class="card overflow-hidden">
    {#if loading}
      <div class="p-8 space-y-4">
        {#each Array(5) as _}
          <div class="h-16 bg-white/5 rounded animate-pulse"></div>
        {/each}
      </div>
    {:else if filteredBookings.length === 0}
      <div class="p-12 text-center">
        <CalendarDays class="w-16 h-16 text-gremius-subtle mx-auto mb-4" />
        <h3 class="text-lg font-medium text-white mb-2">No hay reservas</h3>
        <p class="text-gremius-subtle mb-4">No se encontraron reservas con los filtros actuales</p>
      </div>
    {:else}
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead>
            <tr class="border-b border-gremius-border bg-gremius-card">
              <th class="px-4 py-3 text-left text-xs font-medium text-gremius-subtle uppercase">Reserva</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gremius-subtle uppercase">Sala</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gremius-subtle uppercase">Fecha/Hora</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gremius-subtle uppercase">Estado</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gremius-subtle uppercase">Acciones</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gremius-border">
            {#each filteredBookings as booking}
              <tr class="hover:bg-white/5 transition-colors">
                <td class="px-4 py-3">
                  <div>
                    <p class="font-medium text-white">{booking.title}</p>
                    {#if booking.bookedForName}
                      <p class="text-sm text-gremius-subtle flex items-center gap-1">
                        <Users class="w-3 h-3" />
                        {booking.bookedForName}
                        {#if booking.expectedAttendees}
                          <span class="text-xs">({booking.expectedAttendees} personas)</span>
                        {/if}
                      </p>
                    {/if}
                  </div>
                </td>
                <td class="px-4 py-3">
                  <div class="flex items-center gap-2">
                    <DoorOpen class="w-4 h-4 text-gremius-subtle" />
                    <span class="text-white">{booking.roomName || booking.roomId}</span>
                  </div>
                </td>
                <td class="px-4 py-3">
                  <div class="text-sm">
                    <p class="text-white">{formatDate(booking.startTime)}</p>
                    <p class="text-gremius-subtle flex items-center gap-1">
                      <Clock class="w-3 h-3" />
                      {formatTime(booking.startTime)} - {formatTime(booking.endTime)}
                    </p>
                  </div>
                </td>
                <td class="px-4 py-3">
                  <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs border {getStatusColor(booking.status)}">
                    {getStatusLabel(booking.status)}
                  </span>
                </td>
                <td class="px-4 py-3">
                  <div class="flex items-center gap-2">
                    {#if booking.status === "confirmed"}
                      <button 
                        class="btn-action bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30"
                        onclick={() => updateStatus(booking.id, "checked_in")}
                      >
                        Check-in
                      </button>
                    {:else if booking.status === "checked_in"}
                      <button 
                        class="btn-action bg-zinc-500/20 text-zinc-400 hover:bg-zinc-500/30"
                        onclick={() => updateStatus(booking.id, "checked_out")}
                      >
                        Check-out
                      </button>
                    {:else if booking.status === "pending"}
                      <button 
                        class="btn-action bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
                        onclick={() => updateStatus(booking.id, "confirmed")}
                      >
                        Confirmar
                      </button>
                    {/if}
                    <a href="/booking/bookings/{booking.id}" class="btn-action bg-white/5 text-gremius-subtle hover:text-white">
                      Ver
                    </a>
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <!-- Pagination -->
      {#if totalPages > 1}
        <div class="p-4 border-t border-gremius-border flex items-center justify-between">
          <p class="text-sm text-gremius-subtle">
            Página {currentPage} de {totalPages}
          </p>
          <div class="flex gap-2">
            <button 
              class="btn btn-sm btn-ghost" 
              disabled={currentPage === 1}
              onclick={() => { currentPage--; loadBookings(); }}
            >
              <ChevronLeft class="w-4 h-4" />
            </button>
            <button 
              class="btn btn-sm btn-ghost" 
              disabled={currentPage === totalPages}
              onclick={() => { currentPage++; loadBookings(); }}
            >
              <ChevronRight class="w-4 h-4" />
            </button>
          </div>
        </div>
      {/if}
    {/if}
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
    @apply text-gremius-subtle hover:text-white hover:bg-white/5 disabled:opacity-50;
  }
  
  .btn-action {
    @apply px-3 py-1 rounded text-xs font-medium transition-colors;
  }
</style>
