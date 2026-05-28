<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { CalendarDays, ArrowLeft, DoorOpen, Clock, Users, Save, Loader2, AlertCircle } from "lucide-svelte";
  import { api } from "$lib/api";

  interface Room {
    id: string;
    name: string;
    capacity: number;
    type: string;
    status: string;
    hourlyRate?: string;
    location?: string;
  }

  // Form state
  let rooms: Room[] = $state([]);
  let loading = $state(true);
  let saving = $state(false);
  let error = $state<string | null>(null);

  // Form fields
  let roomId = $state("");
  let title = $state("");
  let description = $state("");
  let eventType = $state("meeting");
  let startDate = $state("");
  let startTime = $state("09:00");
  let endDate = $state("");
  let endTime = $state("10:00");
  let bookedForName = $state("");
  let bookedForEmail = $state("");
  let bookedForPhone = $state("");
  let expectedAttendees = $state(1);
  let specialRequests = $state("");

  const eventTypes = [
    { value: "meeting", label: "Reunión" },
    { value: "workshop", label: "Taller" },
    { value: "presentation", label: "Presentación" },
    { value: "training", label: "Capacitación" },
    { value: "interview", label: "Entrevista" },
    { value: "social", label: "Evento Social" },
    { value: "other", label: "Otro" },
  ];

  // Set default dates to today
  onMount(async () => {
    const today = new Date();
    const dateStr = today.toISOString().split("T")[0];
    startDate = dateStr;
    endDate = dateStr;
    await loadRooms();
  });

  async function loadRooms() {
    try {
      loading = true;
      const res = await api.get("/booking/rooms") as { docs: Room[] };
      rooms = (res.docs || []).filter(r => r.status === "available");
    } catch (e) {
      console.error("Error loading rooms:", e);
      error = "No se pudieron cargar las salas disponibles";
    } finally {
      loading = false;
    }
  }

  function buildDateTime(date: string, time: string): string {
    return new Date(`${date}T${time}:00`).toISOString();
  }

  let selectedRoom = $derived(rooms.find(r => r.id === roomId));

  async function handleSubmit() {
    error = null;

    // Validation
    if (!roomId) { error = "Selecciona una sala"; return; }
    if (!title.trim()) { error = "El título es obligatorio"; return; }
    if (!startDate || !startTime) { error = "La fecha/hora de inicio es obligatoria"; return; }
    if (!endDate || !endTime) { error = "La fecha/hora de fin es obligatoria"; return; }

    const startISO = buildDateTime(startDate, startTime);
    const endISO = buildDateTime(endDate, endTime);

    if (new Date(endISO) <= new Date(startISO)) {
      error = "La hora de fin debe ser posterior a la hora de inicio";
      return;
    }

    saving = true;
    try {
      const payload = {
        roomId,
        title: title.trim(),
        description: description.trim() || undefined,
        eventType,
        startTime: startISO,
        endTime: endISO,
        bookedForName: bookedForName.trim() || undefined,
        bookedForEmail: bookedForEmail.trim() || undefined,
        bookedForPhone: bookedForPhone.trim() || undefined,
        expectedAttendees,
        specialRequests: specialRequests.trim() || undefined,
      };

      await api.post("/booking/bookings", payload);
      goto("/booking/bookings");
    } catch (e: any) {
      console.error("Error creating booking:", e);
      if (e?.body?.error) {
        error = e.body.error;
      } else {
        error = "Error al crear la reserva. Verifica los datos e intenta de nuevo.";
      }
    } finally {
      saving = false;
    }
  }
</script>

<div class="space-y-6 max-w-3xl">
  <!-- Header -->
  <div class="flex items-center gap-4">
    <a href="/booking/bookings" class="p-2 rounded-lg hover:bg-white/5 text-gremius-subtle hover:text-white transition-colors">
      <ArrowLeft class="w-5 h-5" />
    </a>
    <div>
      <h1 class="text-2xl font-semibold text-white flex items-center gap-3">
        <CalendarDays class="w-7 h-7 text-gremius-cyan" />
        Nueva Reserva
      </h1>
      <p class="text-gremius-subtle mt-1">Crear una nueva reserva de sala</p>
    </div>
  </div>

  {#if error}
    <div class="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20">
      <AlertCircle class="w-5 h-5 text-red-400 shrink-0" />
      <p class="text-sm text-red-400">{error}</p>
    </div>
  {/if}

  {#if loading}
    <div class="flex items-center justify-center h-64">
      <div class="flex flex-col items-center gap-4">
        <div class="w-8 h-8 border-2 border-gremius-cyan/30 border-t-gremius-cyan rounded-full animate-spin"></div>
        <p class="text-gremius-subtle text-sm">Cargando salas...</p>
      </div>
    </div>
  {:else}
    <form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="space-y-6">
      <!-- Room Selection -->
      <div class="card p-6">
        <h2 class="text-lg font-medium text-white flex items-center gap-2 mb-4">
          <DoorOpen class="w-5 h-5 text-gremius-cyan" />
          Sala
        </h2>

        {#if rooms.length === 0}
          <p class="text-gremius-subtle text-sm">No hay salas disponibles</p>
        {:else}
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            {#each rooms as room}
              <button
                type="button"
                class="p-4 rounded-xl border text-left transition-all
                  {roomId === room.id 
                    ? 'border-gremius-cyan bg-gremius-cyan/10 ring-1 ring-gremius-cyan/30' 
                    : 'border-gremius-border bg-gremius-bg hover:border-gremius-cyan/30 hover:bg-white/5'}"
                onclick={() => roomId = room.id}
              >
                <p class="font-medium text-white">{room.name}</p>
                <div class="flex items-center gap-4 mt-2 text-xs text-gremius-subtle">
                  <span class="flex items-center gap-1">
                    <Users class="w-3 h-3" />
                    {room.capacity} personas
                  </span>
                  {#if room.location}
                    <span>{room.location}</span>
                  {/if}
                  {#if room.hourlyRate}
                    <span>${room.hourlyRate}/hr</span>
                  {/if}
                </div>
              </button>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Event Details -->
      <div class="card p-6">
        <h2 class="text-lg font-medium text-white flex items-center gap-2 mb-4">
          <CalendarDays class="w-5 h-5 text-gremius-cyan" />
          Detalles del evento
        </h2>

        <div class="space-y-4">
          <div>
            <label for="title" class="block text-sm font-medium text-gremius-subtle mb-1.5">
              Título <span class="text-red-400">*</span>
            </label>
            <input
              id="title"
              type="text"
              bind:value={title}
              placeholder="Nombre de la reunión o evento"
              class="input w-full"
              required
            />
          </div>

          <div>
            <label for="eventType" class="block text-sm font-medium text-gremius-subtle mb-1.5">
              Tipo de evento
            </label>
            <select id="eventType" bind:value={eventType} class="input w-full">
              {#each eventTypes as et}
                <option value={et.value}>{et.label}</option>
              {/each}
            </select>
          </div>

          <div>
            <label for="description" class="block text-sm font-medium text-gremius-subtle mb-1.5">
              Descripción
            </label>
            <textarea
              id="description"
              bind:value={description}
              placeholder="Descripción opcional del evento"
              class="input w-full min-h-[80px] resize-y"
              rows="3"
            ></textarea>
          </div>
        </div>
      </div>

      <!-- Date & Time -->
      <div class="card p-6">
        <h2 class="text-lg font-medium text-white flex items-center gap-2 mb-4">
          <Clock class="w-5 h-5 text-gremius-cyan" />
          Fecha y Hora
        </h2>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label for="startDate" class="block text-sm font-medium text-gremius-subtle mb-1.5">
              Fecha inicio <span class="text-red-400">*</span>
            </label>
            <input id="startDate" type="date" bind:value={startDate} class="input w-full" required />
          </div>
          <div>
            <label for="startTime" class="block text-sm font-medium text-gremius-subtle mb-1.5">
              Hora inicio <span class="text-red-400">*</span>
            </label>
            <input id="startTime" type="time" bind:value={startTime} class="input w-full" required />
          </div>
          <div>
            <label for="endDate" class="block text-sm font-medium text-gremius-subtle mb-1.5">
              Fecha fin <span class="text-red-400">*</span>
            </label>
            <input id="endDate" type="date" bind:value={endDate} class="input w-full" required />
          </div>
          <div>
            <label for="endTime" class="block text-sm font-medium text-gremius-subtle mb-1.5">
              Hora fin <span class="text-red-400">*</span>
            </label>
            <input id="endTime" type="time" bind:value={endTime} class="input w-full" required />
          </div>
        </div>
      </div>

      <!-- Attendee Info -->
      <div class="card p-6">
        <h2 class="text-lg font-medium text-white flex items-center gap-2 mb-4">
          <Users class="w-5 h-5 text-gremius-cyan" />
          Información del asistente
        </h2>

        <div class="space-y-4">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label for="bookedForName" class="block text-sm font-medium text-gremius-subtle mb-1.5">
                Nombre del organizador
              </label>
              <input
                id="bookedForName"
                type="text"
                bind:value={bookedForName}
                placeholder="Nombre completo"
                class="input w-full"
              />
            </div>
            <div>
              <label for="bookedForEmail" class="block text-sm font-medium text-gremius-subtle mb-1.5">
                Email
              </label>
              <input
                id="bookedForEmail"
                type="email"
                bind:value={bookedForEmail}
                placeholder="correo@ejemplo.com"
                class="input w-full"
              />
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label for="bookedForPhone" class="block text-sm font-medium text-gremius-subtle mb-1.5">
                Teléfono
              </label>
              <input
                id="bookedForPhone"
                type="tel"
                bind:value={bookedForPhone}
                placeholder="+52 123 456 7890"
                class="input w-full"
              />
            </div>
            <div>
              <label for="expectedAttendees" class="block text-sm font-medium text-gremius-subtle mb-1.5">
                Asistentes esperados
              </label>
              <input
                id="expectedAttendees"
                type="number"
                bind:value={expectedAttendees}
                min="1"
                max={selectedRoom?.capacity || 999}
                class="input w-full"
              />
              {#if selectedRoom && expectedAttendees > selectedRoom.capacity}
                <p class="text-xs text-amber-400 mt-1">
                  ⚠️ La sala tiene capacidad para {selectedRoom.capacity} personas
                </p>
              {/if}
            </div>
          </div>

          <div>
            <label for="specialRequests" class="block text-sm font-medium text-gremius-subtle mb-1.5">
              Solicitudes especiales
            </label>
            <textarea
              id="specialRequests"
              bind:value={specialRequests}
              placeholder="Equipos especiales, arreglo de la sala, catering, etc."
              class="input w-full min-h-[60px] resize-y"
              rows="2"
            ></textarea>
          </div>
        </div>
      </div>

      <!-- Summary & Submit -->
      {#if roomId && title && startDate && startTime && endDate && endTime}
        <div class="card p-4 border-gremius-cyan/20 bg-gremius-cyan/5">
          <h3 class="text-sm font-medium text-gremius-cyan mb-2">Resumen de la reserva</h3>
          <div class="grid grid-cols-2 gap-2 text-sm">
            <span class="text-gremius-subtle">Sala:</span>
            <span class="text-white">{selectedRoom?.name || roomId}</span>
            <span class="text-gremius-subtle">Evento:</span>
            <span class="text-white">{title}</span>
            <span class="text-gremius-subtle">Inicio:</span>
            <span class="text-white">{startDate} {startTime}</span>
            <span class="text-gremius-subtle">Fin:</span>
            <span class="text-white">{endDate} {endTime}</span>
            {#if expectedAttendees > 1}
              <span class="text-gremius-subtle">Asistentes:</span>
              <span class="text-white">{expectedAttendees}</span>
            {/if}
          </div>
        </div>
      {/if}

      <!-- Actions -->
      <div class="flex items-center justify-end gap-3">
        <a href="/booking/bookings" class="btn btn-ghost">
          Cancelar
        </a>
        <button
          type="submit"
          class="btn btn-primary gap-2"
          disabled={saving || !roomId || !title}
        >
          {#if saving}
            <Loader2 class="w-4 h-4 animate-spin" />
            Creando...
          {:else}
            <Save class="w-4 h-4" />
            Crear Reserva
          {/if}
        </button>
      </div>
    </form>
  {/if}
</div>

<style>
  .card {
    @apply bg-gremius-card border border-gremius-border rounded-xl;
  }

  .input {
    @apply px-4 py-2.5 bg-gremius-bg border border-gremius-border rounded-lg text-white 
           placeholder:text-gremius-subtle focus:border-gremius-cyan/50 focus:outline-none 
           focus:ring-1 focus:ring-gremius-cyan/20 transition-all;
  }

  .btn {
    @apply inline-flex items-center justify-center px-5 py-2.5 rounded-lg font-medium transition-all;
  }

  .btn-primary {
    @apply bg-gremius-cyan text-gremius-bg hover:bg-gremius-cyan/90 disabled:opacity-50 disabled:cursor-not-allowed;
  }

  .btn-ghost {
    @apply text-gremius-subtle hover:text-white hover:bg-white/5;
  }
</style>
