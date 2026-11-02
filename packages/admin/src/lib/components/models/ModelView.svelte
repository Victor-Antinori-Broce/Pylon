<!--
  La vista de un modelo (defineModelo, fase H3), generada de su DESCRIPTOR:
  la lista paginada, el alta y la edición, sin una línea escrita para ese
  modelo. Las columnas, los controles del formulario, lo obligatorio, los
  valores de un enumerado y los límites salen del modelo; lo que el usuario no
  puede ver o tocar lo decide la API (permiso + RLS), no esta vista.

  Props: `descriptor` (GET <base>/_model o /api/models) y `base`, la ruta de
  la colección (`/api/notas/notes`).
-->
<script lang="ts">
  import type { CampoDescrito, DescriptorDeModelo } from "@kitsuden/shared";

  import { api } from "$lib/api";
  import { t } from "$lib/i18n";

  interface Props {
    descriptor: DescriptorDeModelo;
    base: string;
  }

  let { descriptor, base }: Props = $props();

  type Fila = Record<string, unknown> & { id: string };

  const API = import.meta.env.VITE_API_URL ?? "";
  const POR_PAGINA = 20;

  let filas = $state<Fila[]>([]);
  let total = $state(0);
  let desde = $state(0);
  let cargando = $state(true);
  let error = $state<string | null>(null);
  let aviso = $state<string | null>(null);
  /** `null`: lista; `"nueva"`: alta; una fila: edición. */
  let editando = $state<Fila | "nueva" | null>(null);
  let valores = $state<Record<string, unknown>>({});
  let fallosDeCampo = $state<Record<string, string>>({});
  let guardando = $state(false);

  /** Las columnas de la lista: el título primero, luego lo corto, hasta cinco. */
  const columnas = $derived.by(() => {
    const cortos = descriptor.campos.filter((c) => c.tipo !== "json" && c.tipo !== "textoLargo");
    const titulo = cortos.find((c) => c.clave === descriptor.titulo);
    return [...(titulo ? [titulo] : []), ...cortos.filter((c) => c !== titulo)].slice(0, 5);
  });

  async function pedir(metodo: string, ruta: string, cuerpo?: unknown): Promise<unknown> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const token = api.getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${API}${ruta}`, {
      method: metodo,
      headers,
      credentials: "include",
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
    if (res.status === 204) return null;
    const datos = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const e = new Error(String(datos.detail ?? datos.message ?? datos.title ?? `HTTP ${res.status}`)) as Error & {
        cuerpo?: Record<string, unknown>;
      };
      e.cuerpo = datos;
      throw e;
    }
    return datos;
  }

  async function cargar() {
    cargando = true;
    error = null;
    try {
      const r = (await pedir("GET", `${base}?limit=${POR_PAGINA}&offset=${desde}`)) as { data: Fila[]; total: number };
      filas = r.data;
      total = r.total;
    } catch (e) {
      error = (e as Error).message || t("models.errorLoading");
    } finally {
      cargando = false;
    }
  }

  $effect(() => {
    // Recarga al cambiar de modelo o de página.
    void base;
    void desde;
    void cargar();
  });

  // ── Valores del formulario ↔ JSON ────────────────────────────────────────

  function aControl(c: CampoDescrito, v: unknown): unknown {
    if (v === null || v === undefined) return c.tipo === "booleano" ? false : "";
    if (c.tipo === "fecha") {
      const d = new Date(String(v));
      if (Number.isNaN(d.getTime())) return "";
      const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
      return local.toISOString().slice(0, 16);
    }
    if (c.tipo === "json") return JSON.stringify(v, null, 2);
    if (c.tipo === "entero" || c.tipo === "numero") return String(v);
    return v;
  }

  /** `undefined` = no mandar; lanza si el JSON no se puede leer. */
  function deControl(c: CampoDescrito, v: unknown): unknown {
    if (c.tipo === "booleano") return v === true;
    const texto = typeof v === "string" ? v : v == null ? "" : String(v);
    if (texto.trim() === "") return c.requerido ? undefined : null;
    switch (c.tipo) {
      case "entero":
      case "numero":
        return Number(texto);
      case "fecha":
        return new Date(texto).toISOString();
      case "json":
        try {
          return JSON.parse(texto);
        } catch {
          throw new Error(c.clave);
        }
      default:
        return texto;
    }
  }

  function abrir(fila: Fila | "nueva") {
    editando = fila;
    fallosDeCampo = {};
    aviso = null;
    const v: Record<string, unknown> = {};
    for (const c of descriptor.campos) {
      v[c.clave] = aControl(c, fila === "nueva" ? (c.porDefecto ?? null) : fila[c.clave]);
    }
    valores = v;
  }

  async function guardar(evento: SubmitEvent) {
    evento.preventDefault();
    if (!editando) return;
    const cuerpo: Record<string, unknown> = {};
    fallosDeCampo = {};
    for (const c of descriptor.campos) {
      let valor: unknown;
      try {
        valor = deControl(c, valores[c.clave]);
      } catch {
        fallosDeCampo = { ...fallosDeCampo, [c.clave]: t("models.invalidJson") };
        continue;
      }
      if (valor === undefined) continue;
      if (editando === "nueva" && valor === null) continue;
      if (editando !== "nueva" && JSON.stringify(valor) === JSON.stringify(editando[c.clave] ?? null)) continue;
      cuerpo[c.clave] = valor;
    }
    if (Object.keys(fallosDeCampo).length) return;
    guardando = true;
    try {
      if (editando === "nueva") {
        await pedir("POST", base, cuerpo);
        aviso = t("models.created");
      } else {
        await pedir("PATCH", `${base}/${editando.id}`, cuerpo);
        aviso = t("models.saved");
      }
      editando = null;
      await cargar();
    } catch (e) {
      const detalle = (e as Error & { cuerpo?: { details?: { fields?: Record<string, string[]> } } }).cuerpo;
      const campos = detalle?.details?.fields ?? {};
      fallosDeCampo = Object.fromEntries(Object.entries(campos).map(([k, v]) => [k, v.join(" ")]));
      error = `${t("models.errorSaving")}: ${(e as Error).message}`;
    } finally {
      guardando = false;
    }
  }

  async function borrar(fila: Fila) {
    if (!confirm(t("models.confirmDelete"))) return;
    try {
      await pedir("DELETE", `${base}/${fila.id}`);
      aviso = t("models.deleted");
      await cargar();
    } catch (e) {
      error = `${t("models.errorDeleting")}: ${(e as Error).message}`;
    }
  }

  function mostrar(c: CampoDescrito, v: unknown): string {
    if (v === null || v === undefined || v === "") return t("models.none");
    if (c.tipo === "booleano") return v ? t("models.yes") : t("models.no");
    if (c.tipo === "fecha") return new Date(String(v)).toLocaleString();
    return String(v);
  }
</script>

<section class="space-y-4" data-testid="model-view" data-model={descriptor.nombre}>
  <header class="flex flex-wrap items-start justify-between gap-3">
    <div class="min-w-0">
      <h2 class="text-lg font-semibold text-zinc-100">{descriptor.etiqueta}</h2>
      <p class="text-sm text-zinc-400">{descriptor.descripcion}</p>
      <p class="mt-1 text-xs text-zinc-500">
        {t("models.readAccess", { value: t(`models.access_${descriptor.acceso.leer}`) })} ·
        {t("models.writeAccess", { value: t(`models.access_${descriptor.acceso.escribir}`) })} ·
        {t("models.scopes", { read: descriptor.scopes.leer, write: descriptor.scopes.escribir })}
      </p>
    </div>
    {#if editando === null}
      <button class="btn-primary btn-sm" data-testid="model-new" onclick={() => abrir("nueva")}>{t("models.newRow")}</button>
    {/if}
  </header>

  {#if error}
    <div class="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300" role="alert">{error}</div>
  {/if}
  {#if aviso}
    <div class="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-300" role="status">{aviso}</div>
  {/if}

  {#if editando !== null}
    <form class="card p-4 space-y-3" data-testid="model-form" onsubmit={guardar}>
      <h3 class="text-sm font-semibold text-zinc-200">
        {editando === "nueva"
          ? t("models.createTitle", { model: descriptor.etiqueta })
          : t("models.editTitle", { model: descriptor.etiqueta })}
      </h3>
      {#each descriptor.campos as c (c.clave)}
        <div class="space-y-1">
          <label class="text-xs text-zinc-400" for={`campo-${c.clave}`}>
            {c.etiqueta}{#if c.requerido}<span class="text-zinc-500"> ({t("models.required")})</span>{/if}
          </label>
          {#if c.tipo === "booleano"}
            <input
              id={`campo-${c.clave}`}
              type="checkbox"
              checked={valores[c.clave] === true}
              onchange={(e) => (valores[c.clave] = (e.currentTarget as HTMLInputElement).checked)}
            />
          {:else if c.tipo === "enumerado"}
            <select id={`campo-${c.clave}`} class="input w-full text-sm" bind:value={valores[c.clave]} required={c.requerido}>
              {#if !c.requerido}<option value="">{t("models.none")}</option>{/if}
              {#each c.valores ?? [] as v (v)}<option value={v}>{v}</option>{/each}
            </select>
          {:else if c.tipo === "textoLargo" || c.tipo === "json"}
            <textarea
              id={`campo-${c.clave}`}
              class="input w-full text-sm font-mono"
              rows={c.tipo === "json" ? 4 : 5}
              maxlength={c.max}
              bind:value={valores[c.clave]}
            ></textarea>
          {:else if c.tipo === "entero" || c.tipo === "numero"}
            <input
              id={`campo-${c.clave}`}
              type="number"
              class="input w-full text-sm"
              step={c.tipo === "entero" ? 1 : "any"}
              min={c.min}
              max={c.max}
              required={c.requerido && c.porDefecto === undefined}
              bind:value={valores[c.clave]}
            />
          {:else if c.tipo === "fecha"}
            <input id={`campo-${c.clave}`} type="datetime-local" class="input w-full text-sm" bind:value={valores[c.clave]} />
          {:else}
            <input
              id={`campo-${c.clave}`}
              type="text"
              class="input w-full text-sm"
              maxlength={c.max}
              minlength={c.min}
              required={c.requerido && c.porDefecto === undefined}
              bind:value={valores[c.clave]}
            />
          {/if}
          {#if c.descripcion}<p class="text-[11px] text-zinc-500">{c.descripcion}</p>{/if}
          {#if fallosDeCampo[c.clave]}<p class="text-xs text-red-400" data-testid={`error-${c.clave}`}>{fallosDeCampo[c.clave]}</p>{/if}
        </div>
      {/each}
      <div class="flex gap-2">
        <button type="submit" class="btn-primary btn-sm" disabled={guardando} data-testid="model-save">{t("models.save")}</button>
        <button type="button" class="btn-ghost btn-sm" onclick={() => (editando = null)}>{t("models.cancel")}</button>
      </div>
    </form>
  {:else if cargando}
    <p class="text-sm text-zinc-500">{t("models.loading")}</p>
  {:else if filas.length === 0}
    <div class="card p-12 text-center text-sm text-zinc-500">{t("models.noRows")}</div>
  {:else}
    <div class="overflow-x-auto rounded-lg border border-zinc-800">
      <table class="w-full text-sm" data-testid="model-table">
        <thead class="text-left text-xs text-zinc-500">
          <tr>
            {#each columnas as c (c.clave)}<th class="px-3 py-2">{c.etiqueta}</th>{/each}
            {#if descriptor.conDueno}<th class="px-3 py-2">{t("models.owner")}</th>{/if}
            <th class="px-3 py-2">{t("models.updatedAt")}</th>
            <th class="px-3 py-2 text-right">{t("models.actions")}</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-zinc-800/70">
          {#each filas as fila (fila.id)}
            <tr>
              {#each columnas as c (c.clave)}<td class="px-3 py-2 text-zinc-200">{mostrar(c, fila[c.clave])}</td>{/each}
              {#if descriptor.conDueno}<td class="px-3 py-2 text-zinc-400">{String(fila.ownerId ?? t("models.none"))}</td>{/if}
              <td class="px-3 py-2 text-zinc-400">{new Date(String(fila.updatedAt)).toLocaleString()}</td>
              <td class="px-3 py-2 text-right whitespace-nowrap">
                <button class="btn-ghost btn-sm" onclick={() => abrir(fila)}>{t("models.edit")}</button>
                <button class="btn-ghost btn-sm text-red-400" onclick={() => borrar(fila)}>{t("models.delete")}</button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <div class="flex items-center justify-between text-xs text-zinc-500">
      <span>{t("models.rows", { n: total })}</span>
      <span class="flex gap-2">
        <button class="btn-ghost btn-sm" disabled={desde === 0} onclick={() => (desde = Math.max(0, desde - POR_PAGINA))}>{t("models.previous")}</button>
        <button class="btn-ghost btn-sm" disabled={desde + POR_PAGINA >= total} onclick={() => (desde += POR_PAGINA)}>{t("models.next")}</button>
      </span>
    </div>
  {/if}
</section>
