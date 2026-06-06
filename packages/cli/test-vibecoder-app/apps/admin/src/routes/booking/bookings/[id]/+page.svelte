<script lang="ts">
  import { api } from "$lib/api";
  import { CalendarDays, Clock, DoorOpen, Users, Mail, Phone, ArrowLeft, CheckCircle, XCircle, UserCheck, UserX, MessageSquare } from "lucide-svelte";
  import { onMount } from "svelte";

  import { page } from "$app/state";

  interface Booking {
    id: string;
    roomId: string;
    room?: {
      name: string;
      location?: string;
      capacity?: number;
    };
    title: string;
    description?: string;
    startTime: string;
    endTime: string;
    status: "pending" | "confirmed" | "checked_in" | "checked_out" | "cancelled" | "rejected";
    bookedForName?: string;
    bookedForEmail?: string;
    bookedForPhone?: string;
    expectedAttendees?: number;
    maxAttendees?: number;
    eventType?: string;
    specialRequests?: string;
    attendees?: Array<{
      name: string;
      email: string;
      status?: string;
    }>;
    checkedInAt?: string;
    checkedOutAt?: string;
    cancelledAt?: string;
    cancellationReason?: string;
    createdAt: string;
    updatedAt: string;
    notes?: Array<{
      id: string;
      note: string;
      isInternal: boolean;
      createdAt: string;
      userId?: string;
    }>;
  }

  const bookingId = $derived(page.params.id);
  let booking = $state<Booking | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let newNote = $state("");
  let isInternalNote = $state(false);
  let actionLoading = $state(false);

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString("es-ES", { 
      weekday: "long",
      day: "numeric", 
      month: "long",
      year: "numeric"
    });
  }

  function formatTime(dateStr: string): string {
    return new Date(dateStr).toLocaleTimeString("es-ES", { 
      hour: "2-digit", 
      minute: "2-digit" 
    });
  }

  function formatDateTime(dateStr: string): string {
    return new Date(dateStr).toLocaleString("es-ES", { 
      day: "numeric", 
      month: "short",
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
      checked_in: "Check-in realizado",
      checked_out: "Check-out realizado",
      cancelled: "Cancelada",
      rejected: "Rechazada",
    };
    return labels[status] || status;
  }

  async function loadBooking() {
    try {
      loading = true;
      error = null;
      const res = await api.get(`/booking/bookings/${bookingId}`) as Booking;
      booking = res;
    } catch (e) {
      error = "Error cargando la reserva";
      console.error(e);
    } finally {
      loading = false;
    }
  }

  async function updateStatus(newStatus: string, extraData?: Record<string, any>) {
    try {
      actionLoading = true;
      await api.patch(`/booking/bookings/${bookingId}`, { 
        status: newStatus,
        ...extraData 
      });
      await loadBooking();
    } catch (e) {
      alert("Error al actualizar estado");
      console.error(e);
    } finally {
      actionLoading = false;
    }
  }

  async function addNote() {
    if (!newNote.trim()) return;
    try {
      await api.post(`/booking/bookings/${bookingId}/notes`, {
        note: newNote,
        isInternal: isInternalNote,
      });
      newNote = "";
      isInternalNote = false;
      await loadBooking();
    } catch (e) {
      alert("Error al agregar nota");
      console.error(e);
    }
  }

  onMount(loadBooking);
</script>

<div class="space-y-6">
  <!-- Back Button -->
  <a href="/booking/bookings" class="inline-flex items-center gap-2 text-gremius-subtle hover:text-white transition-colors">
    <ArrowLeft class="w-4 h-4" />
    Volver a reservas
  </a>

  {#if loading}
    <div class="card p-8 animate-pulse">
      <div class="h-8 bg-white/10 rounded w-1/3 mb-4"></div>
      <div class="h-4 bg-white/10 rounded w-1/2"></div>
    </div>
  {:else if error}
    <div class="card p-8 text-center">
      <XCircle class="w-16 h-16 text-red-400 mx-auto mb-4" />
      <h3 class="text-lg font-medium text-white mb-2">{error}</h3>
      <button class="btn btn-primary mt-4" onclick={loadBooking}>Reintentar</button>
    </div>
  {:else if booking}
    <!-- Header -->
    <div class="flex flex-col md:flex-row md:items-start justify-between gap-4">
      <div>
        <div class="flex items-center gap-3 mb-2">
          <h1 class="text-2xl font-semibold text-white">{booking.title}</h1>
          <span class="inline-flex items-center px-3 py-1 rounded-full text-sm border {getStatusColor(booking.status)}">
            {getStatusLabel(booking.status)}
          </span>
        </div>
        <p class="text-gremius-subtle">
          Creada el {formatDateTime(booking.createdAt)}
        </p>
      </div>

      <!-- Action Buttons -->
      <div class="flex flex-wrap gap-2">
        {#if booking.status === "pending"}
          <button 
            class="btn btn-emerald"
            disabled={actionLoading}
            onclick={() => updateStatus("confirmed")}
          >
            <CheckCircle class="w-4 h-4" />
            Confirmar
          </button>
          <button 
            class="btn btn-red"
            disabled={actionLoading}
            onclick={() => updateStatus("rejected", { rejectionReason: "Rechazada por administrador" })}
          >
            <XCircle class="w-4 h-4" />
            Rechazar
          </button>
        {:else if booking.status === "confirmed"}
          <button 
            class="btn btn-cyan"
            disabled={actionLoading}
            onclick={() => updateStatus("checked_in")}
          >
            <UserCheck class="w-4 h-4" />
            Check-in
          </button>
          <button 
            class="btn btn-red"
            disabled={actionLoading}
            onclick={() => {
              const reason = prompt("Motivo de cancelación:");
              if (reason) updateStatus("cancelled", { cancellationReason: reason });
            }}
          >
            <UserX class="w-4 h-4" />
            Cancelar
          </button>
        {:else if booking.status === "checked_in"}
          <button 
            class="btn btn-zinc"
            disabled={actionLoading}
            onclick={() => updateStatus("checked_out")}
          >
            <CheckCircle class="w-4 h-4" />
            Check-out
          </button>
        {/if}
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Main Info -->
      <div class="lg:col-span-2 space-y-6">
        <!-- Room Info -->
        <div class="card p-6">
          <h2 class="text-lg font-medium text-white mb-4 flex items-center gap-2">
            <DoorOpen class="w-5 h-5 text-gremius-cyan" />
            Información de la Sala
          </h2>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p class="text-sm text-gremius-subtle">Sala</p>
              <p class="text-white font-medium">{booking.room?.name || booking.roomId}</p>
            </div>
            {#if booking.room?.location}
              <div>
                <p class="text-sm text-gremius-subtle">Ubicación</p>
                <p class="text-white">{booking.room.location}</p>
              </div>
            {/if}
            {#if booking.room?.capacity}
              <div>
                <p class="text-sm text-gremius-subtle">Capacidad</p>
                <p class="text-white flex items-center gap-1">
                  <Users class="w-4 h-4" />
                  {booking.room.capacity} personas
                </p>
              </div>
            {/if}
          </div>
        </div>

        <!-- Date & Time -->
        <div class="card p-6">
          <h2 class="text-lg font-medium text-white mb-4 flex items-center gap-2">
            <CalendarDays class="w-5 h-5 text-gremius-cyan" />
            Fecha y Hora
          </h2>
          <div class="flex items-center gap-6">
            <div class="flex-1">
              <p class="text-sm text-gremius-subtle">Fecha</p>
              <p class="text-white font-medium text-lg">{formatDate(booking.startTime)}</p>
            </div>
            <div class="text-gremius-subtle">
              <Clock class="w-8 h-8" />
            </div>
            <div class="flex-1">
              <p class="text-sm text-gremius-subtle">Horario</p>
              <p class="text-white font-medium text-lg">
                {formatTime(booking.startTime)} - {formatTime(booking.endTime)}
              </p>
            </div>
          </div>
          {#if booking.eventType}
            <div class="mt-4 pt-4 border-t border-gremius-border">
              <p class="text-sm text-gremius-subtle">Tipo de evento</p>
              <p class="text-white">{booking.eventType}</p>
            </div>
          {/if}
        </div>

        <!-- Attendees -->
        {#if booking.bookedForName || booking.expectedAttendees}
          <div class="card p-6">
            <h2 class="text-lg font-medium text-white mb-4 flex items-center gap-2">
              <Users class="w-5 h-5 text-gremius-cyan" />
              Información de Contacto
            </h2>
            <div class="space-y-3">
              {#if booking.bookedForName}
                <div>
                  <p class="text-sm text-gremius-subtle">Reservado para</p>
                  <p class="text-white font-medium">{booking.bookedForName}</p>
                </div>
              {/if}
              {#if booking.bookedForEmail}
                <div class="flex items-center gap-2">
                  <Mail class="w-4 h-4 text-gremius-subtle" />
                  <a href="mailto:{booking.bookedForEmail}" class="text-gremius-cyan hover:underline">
                    {booking.bookedForEmail}
                  </a>
                </div>
              {/if}
              {#if booking.bookedForPhone}
                <div class="flex items-center gap-2">
                  <Phone class="w-4 h-4 text-gremius-subtle" />
                  <a href="tel:{booking.bookedForPhone}" class="text-gremius-cyan hover:underline">
                    {booking.bookedForPhone}
                  </a>
                </div>
              {/if}
              {#if booking.expectedAttendees}
                <div class="pt-2 border-t border-gremius-border">
                  <p class="text-sm text-gremius-subtle">Asistentes esperados</p>
                  <p class="text-white">{booking.expectedAttendees} personas</p>
                </div>
              {/if}
            </div>
          </div>
        {/if}

        <!-- Special Requests -->
        {#if booking.specialRequests}
          <div class="card p-6">
            <h2 class="text-lg font-medium text-white mb-4">Solicitudes Especiales</h2>
            <p class="text-white whitespace-pre-wrap">{booking.specialRequests}</p>
          </div>
        {/if}

        <!-- Notes -->
        <div class="card p-6">
          <h2 class="text-lg font-medium text-white mb-4 flex items-center gap-2">
            <MessageSquare class="w-5 h-5 text-gremius-cyan" />
            Notas y Actividad
          </h2>
          
          <!-- Add Note -->
          <div class="mb-4 p-4 bg-gremius-bg rounded-lg">
            <textarea
              bind:value={newNote}
              placeholder="Agregar nota..."
              rows="3"
              class="w-full px-3 py-2 bg-gremius-card border border-gremius-border rounded-lg text-white placeholder:text-gremius-subtle focus:border-gremius-cyan/50 focus:outline-none resize-none"
            ></textarea>
            <div class="flex items-center justify-between mt-3">
              <label class="flex items-center gap-2 text-sm text-gremius-subtle cursor-pointer">
                <input type="checkbox" bind:checked={isInternalNote} class="rounded border-gremius-border" />
                Nota interna (no visible para el cliente)
              </label>
              <button class="btn btn-primary btn-sm" onclick={addNote} disabled={!newNote.trim()}>
                Agregar Nota
              </button>
            </div>
          </div>

          <!-- Notes List -->
          {#if booking.notes && booking.notes.length > 0}
            <div class="space-y-3">
              {#each booking.notes.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) as note}
                <div class="p-4 bg-gremius-bg rounded-lg {note.isInternal ? 'border-l-2 border-amber-500' : ''}">
                  <p class="text-white">{note.note}</p>
                  <div class="flex items-center gap-2 mt-2 text-xs text-gremius-subtle">
                    <span>{formatDateTime(note.createdAt)}</span>
                    {#if note.isInternal}
                      <span class="px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded">Interna</span>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          {:else}
            <p class="text-center text-gremius-subtle py-4">No hay notas registradas</p>
          {/if}
        </div>
      </div>

      <!-- Sidebar -->
      <div class="space-y-6">
        <!-- Timeline -->
        <div class="card p-6">
          <h3 class="font-medium text-white mb-4">Timeline</h3>
          <div class="space-y-4">
            <div class="flex gap-3">
              <div class="w-2 h-2 rounded-full bg-gremius-cyan mt-2"></div>
              <div>
                <p class="text-sm text-white">Reserva creada</p>
                <p class="text-xs text-gremius-subtle">{formatDateTime(booking.createdAt)}</p>
              </div>
            </div>
            {#if booking.checkedInAt}
              <div class="flex gap-3">
                <div class="w-2 h-2 rounded-full bg-cyan-500 mt-2"></div>
                <div>
                  <p class="text-sm text-white">Check-in</p>
                  <p class="text-xs text-gremius-subtle">{formatDateTime(booking.checkedInAt)}</p>
                </div>
              </div>
            {/if}
            {#if booking.checkedOutAt}
              <div class="flex gap-3">
                <div class="w-2 h-2 rounded-full bg-zinc-500 mt-2"></div>
                <div>
                  <p class="text-sm text-white">Check-out</p>
                  <p class="text-xs text-gremius-subtle">{formatDateTime(booking.checkedOutAt)}</p>
                </div>
              </div>
            {/if}
            {#if booking.cancelledAt}
              <div class="flex gap-3">
                <div class="w-2 h-2 rounded-full bg-red-500 mt-2"></div>
                <div>
                  <p class="text-sm text-white">Cancelada</p>
                  <p class="text-xs text-gremius-subtle">{formatDateTime(booking.cancelledAt)}</p>
                </div>
              </div>
            {/if}
          </div>
        </div>

        <!-- Quick Actions -->
        <div class="card p-6">
          <h3 class="font-medium text-white mb-4">Acciones Rápidas</h3>
          <div class="space-y-2">
            <a href="/booking/rooms/{booking.roomId}" class="btn btn-ghost w-full justify-start">
              <DoorOpen class="w-4 h-4 mr-2" />
              Ver Sala
            </a>
            {#if booking.bookedForEmail}
              <a href="mailto:{booking.bookedForEmail}" class="btn btn-ghost w-full justify-start">
                <Mail class="w-4 h-4 mr-2" />
                Enviar Email
              </a>
            {/if}
          </div>
        </div>

        <!-- Meta -->
        <div class="card p-6">
          <h3 class="font-medium text-white mb-4">Información</h3>
          <div class="space-y-2 text-sm">
            <div class="flex justify-between">
              <span class="text-gremius-subtle">ID:</span>
              <span class="text-white font-mono">{booking.id.slice(0, 8)}...</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gremius-subtle">Actualizado:</span>
              <span class="text-white">{formatDateTime(booking.updatedAt)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .card {
    @apply bg-gremius-card border border-gremius-border rounded-xl;
  }
  
  .btn {
    @apply inline-flex items-center justify-center px-4 py-2 rounded-lg font-medium transition-all gap-2;
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
  
  .btn-emerald {
    @apply bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30;
  }
  
  .btn-cyan {
    @apply bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 border border-cyan-500/30;
  }
  
  .btn-red {
    @apply bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30;
  }
  
  .btn-zinc {
    @apply bg-zinc-500/20 text-zinc-400 hover:bg-zinc-500/30 border border-zinc-500/30;
  }
</style>
