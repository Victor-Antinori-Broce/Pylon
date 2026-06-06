<script lang="ts">
  import { api } from "$lib/api";
  import { DoorOpen, Plus, Search, Users, Clock, MapPin, CheckCircle, XCircle, Edit, Eye, X } from "lucide-svelte";
  import { onMount } from "svelte";

  interface Room {
    id: string;
    name: string;
    slug: string;
    description?: string;
    type: string;
    status: "available" | "maintenance" | "closed" | "reserved";
    capacity: number;
    location?: string;
    floor?: string;
    hourlyRate?: string;
    features: {
      hasProjector?: boolean;
      hasWhiteboard?: boolean;
      hasVideoConferencing?: boolean;
      hasAudioSystem?: boolean;
      hasParking?: boolean;
      wheelchairAccessible?: boolean;
      wifi?: boolean;
      airConditioning?: boolean;
    };
    availableFrom?: string;
    availableUntil?: string;
  }

  interface TimeSlot {
    start: string;
    end: string;
    available: boolean;
  }

  let rooms: Room[] = $state([]);
  let loading = $state(true);
  let searchQuery = $state("");
  let selectedType = $state("");
  let selectedDate = $state(new Date().toISOString().split("T")[0]);
  const availabilityMap = $state<Record<string, TimeSlot[]>>({});

  // Create modal state
  let showCreateModal = $state(false);
  let saving = $state(false);
  let newRoomName = $state("");
  let newRoomDescription = $state("");
  let newRoomType = $state("meeting_room");
  let newRoomCapacity = $state(4);
  let newRoomLocation = $state("");
  let newRoomFloor = $state("");
  let newRoomHourlyRate = $state("");
  let newRoomFeatures = $state({
    hasProjector: false,
    hasWhiteboard: false,
    hasVideoConferencing: false,
    hasAudioSystem: false,
    hasParking: false,
    wheelchairAccessible: false,
    wifi: false,
    airConditioning: false,
  });

  const roomTypes = [
    { value: "meeting_room", label: "Sala de reuniones" },
    { value: "conference_room", label: "Sala de conferencias" },
    { value: "office", label: "Oficina" },
    { value: "desk", label: "Escritorio" },
    { value: "studio", label: "Estudio" },
    { value: "event_space", label: "Espacio de eventos" },
    { value: "classroom", label: "Aula" },
    { value: "auditorium", label: "Auditorio" },
  ];

  const filteredRooms = $derived(
    rooms.filter(r => {
      const matchesSearch = !searchQuery || 
        r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.location?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType = !selectedType || r.type === selectedType;
      return matchesSearch && matchesType;
    })
  );

  function getStatusColor(status: string): string {
    const colors: Record<string, string> = {
      available: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
      maintenance: "bg-amber-500/20 text-amber-400 border-amber-500/30",
      closed: "bg-red-500/20 text-red-400 border-red-500/30",
      reserved: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    };
    return colors[status] || "bg-zinc-500/20 text-zinc-400";
  }

  function getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      available: "Disponible",
      maintenance: "Mantenimiento",
      closed: "Cerrada",
      reserved: "Reservada",
    };
    return labels[status] || status;
  }

  function getTypeLabel(type: string): string {
    return roomTypes.find(t => t.value === type)?.label || type;
  }

  async function loadRooms() {
    try {
      loading = true;
      const res = await api.get("/booking/rooms") as { docs: Room[] };
      rooms = res.docs || [];
      // Load availability for each room
      await Promise.all(rooms.map(r => loadAvailability(r.id)));
    } catch (e) {
      console.error("Error loading rooms:", e);
    } finally {
      loading = false;
    }
  }

  async function loadAvailability(roomId: string) {
    try {
      const res = await api.get(`/booking/rooms/${roomId}/slots?date=${selectedDate}&duration=60`) as { slots: TimeSlot[] };
      availabilityMap[roomId] = res.slots || [];
    } catch (e) {
      availabilityMap[roomId] = [];
    }
  }

  function getAvailableSlotsCount(roomId: string): number {
    const slots = availabilityMap[roomId] || [];
    return slots.filter(s => s.available).length;
  }

  function getNextAvailableSlot(roomId: string): string | null {
    const slots = availabilityMap[roomId] || [];
    const next = slots.find(s => s.available);
    if (next) {
      return new Date(next.start).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    }
    return null;
  }

  onMount(loadRooms);

  function resetRoomForm() {
    newRoomName = "";
    newRoomDescription = "";
    newRoomType = "meeting_room";
    newRoomCapacity = 4;
    newRoomLocation = "";
    newRoomFloor = "";
    newRoomHourlyRate = "";
    newRoomFeatures = {
      hasProjector: false,
      hasWhiteboard: false,
      hasVideoConferencing: false,
      hasAudioSystem: false,
      hasParking: false,
      wheelchairAccessible: false,
      wifi: false,
      airConditioning: false,
    };
  }

  async function saveRoom(e: Event) {
    e.preventDefault();
    saving = true;
    try {
      const payload: any = {
        name: newRoomName.trim(),
        description: newRoomDescription.trim() || undefined,
        type: newRoomType,
        capacity: Number(newRoomCapacity) || 4,
        location: newRoomLocation.trim() || undefined,
        floor: newRoomFloor.trim() || undefined,
        hourlyRate: newRoomHourlyRate.trim() || undefined,
        features: Object.fromEntries(
          Object.entries(newRoomFeatures).filter(([, v]) => v === true)
        ),
        status: "available",
      };

      await api.post("/booking/rooms", payload);
      showCreateModal = false;
      resetRoomForm();
      await loadRooms();
    } catch (e: any) {
      console.error("Error creating room:", e);
      alert(e?.body?.error || "Error al crear la sala");
    } finally {
      saving = false;
    }
  }
</script>

<div class="space-y-6">
  <!-- Header -->
  <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
    <div>
      <h1 class="text-2xl font-semibold text-white flex items-center gap-3">
        <DoorOpen class="w-7 h-7 text-gremius-cyan" />
        Salas y Recursos
      </h1>
      <p class="text-gremius-subtle mt-1">Gestiona salas, espacios y recursos reservables</p>
    </div>
    
    <button class="btn btn-primary gap-2" onclick={() => showCreateModal = true}>
      <Plus class="w-4 h-4" />
      Nueva Sala
    </button>
  </div>

  <!-- Filters -->
  <div class="card p-4">
    <div class="flex flex-col md:flex-row gap-4">
      <div class="flex-1 relative">
        <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gremius-subtle" />
        <input
          type="text"
          placeholder="Buscar sala o ubicación..."
          bind:value={searchQuery}
          class="w-full pl-10 pr-4 py-2 bg-gremius-bg border border-gremius-border rounded-lg text-white placeholder:text-gremius-subtle focus:border-gremius-cyan/50 focus:outline-none"
        />
      </div>
      
      <select
        bind:value={selectedType}
        class="px-4 py-2 bg-gremius-bg border border-gremius-border rounded-lg text-white focus:border-gremius-cyan/50 focus:outline-none"
      >
        <option value="">Todos los tipos</option>
        {#each roomTypes as type}
          <option value={type.value}>{type.label}</option>
        {/each}
      </select>

      <input
        type="date"
        bind:value={selectedDate}
        onchange={loadRooms}
        class="px-4 py-2 bg-gremius-bg border border-gremius-border rounded-lg text-white focus:border-gremius-cyan/50 focus:outline-none"
      />
    </div>
  </div>

  <!-- Rooms Grid -->
  {#if loading}
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {#each Array(6) as _}
        <div class="card p-4 animate-pulse">
          <div class="h-6 bg-white/10 rounded w-3/4 mb-4"></div>
          <div class="h-4 bg-white/10 rounded w-1/2 mb-2"></div>
          <div class="h-4 bg-white/10 rounded w-2/3"></div>
        </div>
      {/each}
    </div>
  {:else if filteredRooms.length === 0}
    <div class="card p-12 text-center">
      <DoorOpen class="w-16 h-16 text-gremius-subtle mx-auto mb-4" />
      <h3 class="text-lg font-medium text-white mb-2">No hay salas</h3>
      <p class="text-gremius-subtle mb-4">Comienza creando tu primera sala</p>
      <button class="btn btn-primary" onclick={() => showCreateModal = true}>
        <Plus class="w-4 h-4 mr-2" />
        Crear Sala
      </button>
    </div>
  {:else}
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {#each filteredRooms as room}
        <div class="card p-4 hover:border-gremius-cyan/30 transition-all group">
          <!-- Header -->
          <div class="flex items-start justify-between mb-3">
            <div>
              <h3 class="font-semibold text-white text-lg">{room.name}</h3>
              <span class="inline-flex items-center px-2 py-0.5 rounded text-xs border {getStatusColor(room.status)}">
                {getStatusLabel(room.status)}
              </span>
            </div>
            <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button class="btn-icon-sm" title="Ver detalle">
                <Eye class="w-4 h-4" />
              </button>
              <button class="btn-icon-sm" title="Editar">
                <Edit class="w-4 h-4" />
              </button>
            </div>
          </div>

          <!-- Info -->
          <div class="space-y-2 text-sm mb-4">
            <div class="flex items-center gap-2 text-gremius-subtle">
              <MapPin class="w-4 h-4" />
              <span>{room.location || "Sin ubicación"}{room.floor ? `, Piso ${room.floor}` : ""}</span>
            </div>
            <div class="flex items-center gap-2 text-gremius-subtle">
              <Users class="w-4 h-4" />
              <span>Capacidad: {room.capacity} personas</span>
            </div>
            {#if room.hourlyRate}
              <div class="flex items-center gap-2 text-gremius-subtle">
                <Clock class="w-4 h-4" />
                <span>${room.hourlyRate}/hora</span>
              </div>
            {/if}
          </div>

          <!-- Features -->
          {#if room.features && Object.values(room.features).some(Boolean)}
            <div class="flex flex-wrap gap-1 mb-4">
              {#if room.features.hasProjector}
                <span class="px-2 py-0.5 bg-gremius-cyan/10 text-gremius-cyan text-xs rounded">Proyector</span>
              {/if}
              {#if room.features.hasVideoConferencing}
                <span class="px-2 py-0.5 bg-gremius-cyan/10 text-gremius-cyan text-xs rounded">Videoconferencia</span>
              {/if}
              {#if room.features.wifi}
                <span class="px-2 py-0.5 bg-gremius-cyan/10 text-gremius-cyan text-xs rounded">WiFi</span>
              {/if}
              {#if room.features.airConditioning}
                <span class="px-2 py-0.5 bg-gremius-cyan/10 text-gremius-cyan text-xs rounded">A/C</span>
              {/if}
              {#if room.features.wheelchairAccessible}
                <span class="px-2 py-0.5 bg-gremius-cyan/10 text-gremius-cyan text-xs rounded">Accesible</span>
              {/if}
            </div>
          {/if}

          <!-- Availability Preview -->
          {#if room.status === "available"}
            <div class="border-t border-gremius-border pt-3">
              <p class="text-xs text-gremius-subtle mb-2">Disponibilidad {selectedDate}</p>
              {#if getAvailableSlotsCount(room.id) > 0}
                <div class="flex items-center gap-2">
                  <CheckCircle class="w-4 h-4 text-emerald-400" />
                  <span class="text-sm text-emerald-400">
                    {getAvailableSlotsCount(room.id)} slots disponibles
                  </span>
                </div>
                {#if getNextAvailableSlot(room.id)}
                  <p class="text-xs text-gremius-subtle mt-1">
                    Próximo: {getNextAvailableSlot(room.id)}
                  </p>
                {/if}
              {:else}
                <div class="flex items-center gap-2">
                  <XCircle class="w-4 h-4 text-red-400" />
                  <span class="text-sm text-red-400">No disponible hoy</span>
                </div>
              {/if}
            </div>
          {/if}

          <!-- Actions -->
          <div class="flex gap-2 mt-4">
            <a 
              href="/booking/bookings/new?roomId={room.id}" 
              class="flex-1 btn btn-primary btn-sm justify-center"
            >
              Reservar
            </a>
            <button 
              class="btn btn-ghost btn-sm"
              onclick={() => loadAvailability(room.id)}
              title="Ver slots"
            >
              <Clock class="w-4 h-4" />
            </button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<!-- Create Room Modal -->
{#if showCreateModal}
  <div class="fixed inset-0 z-50 flex items-center justify-center">
    <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" onclick={() => showCreateModal = false}></div>
    <div class="relative bg-gremius-card border border-gremius-border rounded-2xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
      <div class="flex items-center justify-between p-6 border-b border-gremius-border">
        <h3 class="text-lg font-semibold text-white">Nueva Sala</h3>
        <button
          onclick={() => showCreateModal = false}
          class="p-2 rounded-xl text-gremius-subtle hover:text-white hover:bg-white/5 transition-all"
        >
          <X class="w-5 h-5" />
        </button>
      </div>
      <form onsubmit={saveRoom} class="p-6 space-y-4">
        <div>
          <label class="block text-sm font-medium text-gremius-subtle mb-1.5">Nombre *</label>
          <input
            bind:value={newRoomName}
            type="text"
            placeholder="Ej. Sala de juntas A"
            class="input w-full"
            required
          />
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gremius-subtle mb-1.5">Tipo</label>
            <select bind:value={newRoomType} class="input w-full">
              {#each roomTypes as t}
                <option value={t.value}>{t.label}</option>
              {/each}
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gremius-subtle mb-1.5">Capacidad</label>
            <input
              bind:value={newRoomCapacity}
              type="number"
              min="1"
              class="input w-full"
            />
          </div>
        </div>

        <div>
          <label class="block text-sm font-medium text-gremius-subtle mb-1.5">Descripción</label>
          <textarea
            bind:value={newRoomDescription}
            rows="2"
            placeholder="Descripción opcional"
            class="input w-full min-h-[60px] resize-y"
          ></textarea>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gremius-subtle mb-1.5">Ubicación</label>
            <input
              bind:value={newRoomLocation}
              type="text"
              placeholder="Ej. Edificio Central"
              class="input w-full"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gremius-subtle mb-1.5">Piso</label>
            <input
              bind:value={newRoomFloor}
              type="text"
              placeholder="Ej. 3"
              class="input w-full"
            />
          </div>
        </div>

        <div>
          <label class="block text-sm font-medium text-gremius-subtle mb-1.5">Tarifa por hora</label>
          <input
            bind:value={newRoomHourlyRate}
            type="text"
            placeholder="Ej. 50"
            class="input w-full"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-gremius-subtle mb-2">Características</label>
          <div class="grid grid-cols-2 gap-3">
            {#each [
              { key: "hasProjector", label: "Proyector" },
              { key: "hasWhiteboard", label: "Pizarrón" },
              { key: "hasVideoConferencing", label: "Videoconferencia" },
              { key: "hasAudioSystem", label: "Audio" },
              { key: "hasParking", label: "Estacionamiento" },
              { key: "wheelchairAccessible", label: "Accesible" },
              { key: "wifi", label: "WiFi" },
              { key: "airConditioning", label: "A/C" },
            ] as feat}
              <label class="flex items-center gap-2 text-sm text-gremius-subtle cursor-pointer">
                <input
                  type="checkbox"
                  bind:checked={newRoomFeatures[feat.key as keyof typeof newRoomFeatures]}
                  class="w-4 h-4 rounded border-gremius-border bg-gremius-bg text-gremius-cyan focus:ring-gremius-cyan"
                />
                {feat.label}
              </label>
            {/each}
          </div>
        </div>

        <div class="flex justify-end gap-3 pt-4 border-t border-gremius-border">
          <button
            type="button"
            onclick={() => showCreateModal = false}
            class="px-5 py-2.5 text-sm font-medium rounded-xl bg-gremius-surface border border-gremius-border text-white hover:bg-white/5 transition-all"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving || !newRoomName.trim()}
            class="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-xl bg-gremius-cyan text-gremius-bg hover:bg-gremius-cyan/90 transition-all disabled:opacity-50"
          >
            {#if saving}
              <span class="w-4 h-4 border-2 border-gremius-bg/30 border-t-gremius-bg rounded-full animate-spin"></span>
              Creando...
            {:else}
              <Plus class="w-4 h-4" />
              Crear Sala
            {/if}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

<style>
  .card {
    @apply bg-gremius-card border border-gremius-border rounded-xl;
  }
  
  .btn {
    @apply inline-flex items-center px-4 py-2 rounded-lg font-medium transition-all;
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
  
  .btn-icon-sm {
    @apply p-1.5 rounded text-gremius-subtle hover:text-white hover:bg-white/5 transition-colors;
  }
</style>
