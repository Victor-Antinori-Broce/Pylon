<script lang="ts">
  import { onMount } from "svelte";
  import {
    Building2, Users, Briefcase, Network, Plus, Search,
    Mail, Phone, MapPin, X, Loader2, User
  } from "lucide-svelte";
  import { api } from "$lib/api";

  interface Organization {
    id: string;
    name: string;
    employeeCount: number;
  }

  interface Department {
    id: string;
    name: string;
    organizationId: string;
  }

  interface Position {
    id: string;
    title: string;
    organizationId: string;
    departmentId: string | null;
  }

  interface Employee {
    id: string;
    employeeId: string;
    firstName: string;
    lastName: string;
    displayName?: string;
    email: string;
    workEmail?: string;
    phone?: string;
    photoUrl?: string;
    departmentName?: string;
    positionTitle?: string;
    status: string;
    location?: string;
    organizationId?: string;
  }

  let employees: Employee[] = $state([]);
  let organizations: Organization[] = $state([]);
  let departments: Department[] = $state([]);
  let positions: Position[] = $state([]);
  let allEmployees: Employee[] = $state([]);

  let loading = $state(true);
  let searchQuery = $state("");

  // Modals
  let showEmployeeModal = $state(false);
  let showOrgModal = $state(false);
  let saving = $state(false);

  // Employee form
  let empFirstName = $state("");
  let empLastName = $state("");
  let empEmail = $state("");
  let empEmployeeId = $state("");
  let empOrgId = $state("");
  let empDeptId = $state("");
  let empPosId = $state("");
  let empManagerId = $state("");
  let empPhone = $state("");
  let empLocation = $state("");

  // Org form
  let orgName = $state("");

  const quickLinks = [
    {
      href: "/directory/org-chart",
      icon: Network,
      title: "Organigrama",
      description: "Visualización jerárquica de la organización"
    },
  ];

  onMount(async () => {
    await loadOrganizations();
    await loadEmployees();
    await loadMeta();
  });

  async function loadOrganizations() {
    try {
      const res = await api.get("/directory/organizations") as { docs: Organization[] };
      organizations = res.docs || [];
    } catch (e) {
      console.error("Error loading organizations:", e);
    }
  }

  async function loadMeta() {
    try {
      const [deptsRes, posRes, empsRes] = await Promise.all([
        api.get("/directory/departments") as Promise<{ docs: Department[] }>,
        api.get("/directory/positions") as Promise<{ docs: Position[] }>,
        api.get("/directory/employees?limit=1000") as Promise<{ docs: Employee[] }>,
      ]);
      departments = deptsRes.docs || [];
      positions = posRes.docs || [];
      allEmployees = empsRes.docs || [];
    } catch (e) {
      console.error("Error loading meta:", e);
    }
  }

  async function loadEmployees() {
    loading = true;
    try {
      const res = await api.get("/directory/employees") as { docs: Employee[] };
      employees = res.docs || [];
    } catch (e) {
      console.error("Error loading employees:", e);
    } finally {
      loading = false;
    }
  }

  const filteredEmployees = $derived(
    searchQuery
      ? employees.filter(e =>
          `${e.firstName} ${e.lastName}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
          e.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
          e.departmentName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          e.positionTitle?.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : employees
  );

  function resetEmployeeForm() {
    empFirstName = "";
    empLastName = "";
    empEmail = "";
    empEmployeeId = "";
    empOrgId = organizations[0]?.id || "";
    empDeptId = "";
    empPosId = "";
    empManagerId = "";
    empPhone = "";
    empLocation = "";
  }

  function resetOrgForm() {
    orgName = "";
  }

  async function saveOrganization(e: Event) {
    e.preventDefault();
    saving = true;
    try {
      await api.post("/directory/organizations", { name: orgName.trim() });
      showOrgModal = false;
      resetOrgForm();
      await loadOrganizations();
      await loadMeta();
    } catch (err: any) {
      alert(err?.body?.error || "Error al crear organización");
    } finally {
      saving = false;
    }
  }

  async function saveEmployee(e: Event) {
    e.preventDefault();
    saving = true;
    try {
      await api.post("/directory/employees", {
        organizationId: empOrgId,
        employeeId: empEmployeeId.trim(),
        firstName: empFirstName.trim(),
        lastName: empLastName.trim(),
        email: empEmail.trim(),
        departmentId: empDeptId || null,
        positionId: empPosId || null,
        managerId: empManagerId || null,
        phone: empPhone.trim() || undefined,
        location: empLocation.trim() || undefined,
        status: "active",
      });
      showEmployeeModal = false;
      resetEmployeeForm();
      await loadEmployees();
      await loadMeta();
    } catch (err: any) {
      alert(err?.body?.error || "Error al crear empleado");
    } finally {
      saving = false;
    }
  }

  function getInitials(firstName: string, lastName: string): string {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  }

  const orgDepartments = $derived(
    departments.filter(d => d.organizationId === empOrgId)
  );

  const orgPositions = $derived(
    positions.filter(p => p.organizationId === empOrgId && (!empDeptId || p.departmentId === empDeptId || !p.departmentId))
  );
</script>

<div class="space-y-6">
  <!-- Header -->
  <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
    <div>
      <h1 class="text-2xl font-semibold text-white flex items-center gap-3">
        <Building2 class="w-7 h-7 text-gremius-cyan" />
        Directorio
      </h1>
      <p class="text-gremius-subtle mt-1">Gestiona empleados, departamentos y organizaciones</p>
    </div>

    <div class="flex items-center gap-3">
      <button
        class="btn btn-secondary gap-2"
        onclick={() => { showOrgModal = true; resetOrgForm(); }}
      >
        <Building2 class="w-4 h-4" />
        Nueva Organización
      </button>
      <button
        class="btn btn-primary gap-2"
        onclick={() => { showEmployeeModal = true; resetEmployeeForm(); }}
      >
        <Plus class="w-4 h-4" />
        Nuevo Empleado
      </button>
    </div>
  </div>

  <!-- Quick Links -->
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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

  <!-- Stats -->
  <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
    <div class="card p-4 flex items-center gap-4">
      <div class="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center">
        <Users class="w-6 h-6 text-emerald-400" />
      </div>
      <div>
        <p class="text-2xl font-bold text-white">{employees.length}</p>
        <p class="text-sm text-gremius-subtle">Empleados activos</p>
      </div>
    </div>
    <div class="card p-4 flex items-center gap-4">
      <div class="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
        <Briefcase class="w-6 h-6 text-blue-400" />
      </div>
      <div>
        <p class="text-2xl font-bold text-white">{departments.length}</p>
        <p class="text-sm text-gremius-subtle">Departamentos</p>
      </div>
    </div>
    <div class="card p-4 flex items-center gap-4">
      <div class="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center">
        <Building2 class="w-6 h-6 text-purple-400" />
      </div>
      <div>
        <p class="text-2xl font-bold text-white">{organizations.length}</p>
        <p class="text-sm text-gremius-subtle">Organizaciones</p>
      </div>
    </div>
  </div>

  <!-- Employees List -->
  <div class="card p-4">
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
      <h2 class="text-lg font-semibold text-white flex items-center gap-2">
        <Users class="w-5 h-5 text-gremius-cyan" />
        Empleados
      </h2>
      <div class="relative max-w-sm w-full">
        <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gremius-subtle" />
        <input
          type="text"
          placeholder="Buscar empleado..."
          bind:value={searchQuery}
          class="w-full pl-10 pr-4 py-2 bg-gremius-bg border border-gremius-border rounded-lg text-white placeholder:text-gremius-subtle focus:border-gremius-cyan/50 focus:outline-none"
        />
      </div>
    </div>

    {#if loading}
      <div class="flex items-center justify-center h-64">
        <Loader2 class="w-8 h-8 animate-spin text-gremius-cyan" />
      </div>
    {:else if filteredEmployees.length === 0}
      <div class="text-center py-12">
        <User class="w-16 h-16 text-gremius-subtle mx-auto mb-4" />
        <h3 class="text-lg font-medium text-white mb-2">No hay empleados</h3>
        <p class="text-gremius-subtle mb-4">Comienza agregando el primer empleado</p>
        <button
          class="btn btn-primary"
          onclick={() => { showEmployeeModal = true; resetEmployeeForm(); }}
        >
          <Plus class="w-4 h-4 mr-2" />
          Agregar Empleado
        </button>
      </div>
    {:else}
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {#each filteredEmployees as emp}
          <div class="card p-4 hover:border-gremius-cyan/30 transition-all">
            <div class="flex items-start gap-4">
              <div class="w-12 h-12 rounded-full bg-gremius-cyan/20 flex items-center justify-center text-gremius-cyan font-semibold">
                {getInitials(emp.firstName, emp.lastName)}
              </div>
              <div class="flex-1 min-w-0">
                <p class="font-medium text-white truncate">
                  {emp.displayName || `${emp.firstName} ${emp.lastName}`}
                </p>
                <p class="text-sm text-gremius-cyan truncate">{emp.positionTitle || "Sin cargo"}</p>
                <p class="text-xs text-gremius-subtle truncate">{emp.departmentName || ""}</p>
                <div class="flex items-center gap-3 mt-2 text-xs text-gremius-subtle">
                  <a href="mailto:{emp.email}" class="flex items-center gap-1 hover:text-gremius-cyan" onclick={(e) => e.stopPropagation()}>
                    <Mail class="w-3 h-3" />
                    {emp.email}
                  </a>
                  {#if emp.phone}
                    <span class="flex items-center gap-1">
                      <Phone class="w-3 h-3" />
                      {emp.phone}
                    </span>
                  {/if}
                  {#if emp.location}
                    <span class="flex items-center gap-1">
                      <MapPin class="w-3 h-3" />
                      {emp.location}
                    </span>
                  {/if}
                </div>
              </div>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<!-- Create Organization Modal -->
{#if showOrgModal}
  <div class="fixed inset-0 z-50 flex items-center justify-center">
    <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" onclick={() => showOrgModal = false}></div>
    <div class="relative bg-gremius-card border border-gremius-border rounded-2xl shadow-2xl max-w-md w-full mx-4">
      <div class="flex items-center justify-between p-6 border-b border-gremius-border">
        <h3 class="text-lg font-semibold text-white">Nueva Organización</h3>
        <button onclick={() => showOrgModal = false} class="p-2 rounded-xl text-gremius-subtle hover:text-white hover:bg-white/5">
          <X class="w-5 h-5" />
        </button>
      </div>
      <form onsubmit={saveOrganization} class="p-6 space-y-4">
        <div>
          <label class="block text-sm font-medium text-gremius-subtle mb-1.5">Nombre *</label>
          <input
            bind:value={orgName}
            type="text"
            placeholder="Ej. Acme Corp"
            class="input w-full"
            required
          />
        </div>
        <div class="flex justify-end gap-3 pt-2">
          <button type="button" onclick={() => showOrgModal = false} class="btn btn-ghost">Cancelar</button>
          <button type="submit" disabled={saving || !orgName.trim()} class="btn btn-primary">
            {#if saving}
              <Loader2 class="w-4 h-4 animate-spin mr-2" />
              Creando...
            {:else}
              Crear
            {/if}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

<!-- Create Employee Modal -->
{#if showEmployeeModal}
  <div class="fixed inset-0 z-50 flex items-center justify-center">
    <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" onclick={() => showEmployeeModal = false}></div>
    <div class="relative bg-gremius-card border border-gremius-border rounded-2xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
      <div class="flex items-center justify-between p-6 border-b border-gremius-border">
        <h3 class="text-lg font-semibold text-white">Nuevo Empleado</h3>
        <button onclick={() => showEmployeeModal = false} class="p-2 rounded-xl text-gremius-subtle hover:text-white hover:bg-white/5">
          <X class="w-5 h-5" />
        </button>
      </div>
      <form onsubmit={saveEmployee} class="p-6 space-y-4">
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gremius-subtle mb-1.5">Nombre *</label>
            <input bind:value={empFirstName} type="text" placeholder="Ej. Juan" class="input w-full" required />
          </div>
          <div>
            <label class="block text-sm font-medium text-gremius-subtle mb-1.5">Apellido *</label>
            <input bind:value={empLastName} type="text" placeholder="Ej. Pérez" class="input w-full" required />
          </div>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gremius-subtle mb-1.5">Email *</label>
            <input bind:value={empEmail} type="email" placeholder="juan@empresa.com" class="input w-full" required />
          </div>
          <div>
            <label class="block text-sm font-medium text-gremius-subtle mb-1.5">ID de Empleado *</label>
            <input bind:value={empEmployeeId} type="text" placeholder="EMP-001" class="input w-full" required />
          </div>
        </div>

        <div>
          <label class="block text-sm font-medium text-gremius-subtle mb-1.5">Organización *</label>
          <select bind:value={empOrgId} class="input w-full" required>
            <option value="">Selecciona...</option>
            {#each organizations as org}
              <option value={org.id}>{org.name}</option>
            {/each}
          </select>
          {#if organizations.length === 0}
            <p class="text-xs text-amber-400 mt-1">Primero crea una organización.</p>
          {/if}
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gremius-subtle mb-1.5">Departamento</label>
            <select bind:value={empDeptId} class="input w-full">
              <option value="">Sin departamento</option>
              {#each orgDepartments as dept}
                <option value={dept.id}>{dept.name}</option>
              {/each}
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gremius-subtle mb-1.5">Cargo / Posición</label>
            <select bind:value={empPosId} class="input w-full">
              <option value="">Sin cargo</option>
              {#each orgPositions as pos}
                <option value={pos.id}>{pos.title}</option>
              {/each}
            </select>
          </div>
        </div>

        <div>
          <label class="block text-sm font-medium text-gremius-subtle mb-1.5">Manager</label>
          <select bind:value={empManagerId} class="input w-full">
            <option value="">Sin manager</option>
            {#each allEmployees.filter(e => e.organizationId === empOrgId || !empOrgId) as mgr}
              <option value={mgr.id}>{mgr.displayName || `${mgr.firstName} ${mgr.lastName}`}</option>
            {/each}
          </select>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gremius-subtle mb-1.5">Teléfono</label>
            <input bind:value={empPhone} type="tel" placeholder="+52 ..." class="input w-full" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gremius-subtle mb-1.5">Ubicación</label>
            <input bind:value={empLocation} type="text" placeholder="Ciudad / Oficina" class="input w-full" />
          </div>
        </div>

        <div class="flex justify-end gap-3 pt-4 border-t border-gremius-border">
          <button type="button" onclick={() => showEmployeeModal = false} class="btn btn-ghost">Cancelar</button>
          <button type="submit" disabled={saving || !empFirstName.trim() || !empLastName.trim() || !empEmail.trim() || !empEmployeeId.trim() || !empOrgId} class="btn btn-primary">
            {#if saving}
              <Loader2 class="w-4 h-4 animate-spin mr-2" />
              Creando...
            {:else}
              Crear Empleado
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
    @apply inline-flex items-center justify-center px-4 py-2 rounded-lg font-medium transition-all;
  }

  .btn-primary {
    @apply bg-gremius-cyan text-gremius-bg hover:bg-gremius-cyan/90 disabled:opacity-50;
  }

  .btn-secondary {
    @apply bg-gremius-surface border border-gremius-border text-white hover:bg-white/5;
  }

  .btn-ghost {
    @apply text-gremius-subtle hover:text-white hover:bg-white/5;
  }

  .input {
    @apply px-4 py-2.5 bg-gremius-bg border border-gremius-border rounded-lg text-white
           placeholder:text-gremius-subtle focus:border-gremius-cyan/50 focus:outline-none
           focus:ring-1 focus:ring-gremius-cyan/20 transition-all;
  }
</style>
