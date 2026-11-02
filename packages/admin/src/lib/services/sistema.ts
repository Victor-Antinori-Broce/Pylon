/**
 * La «caja de cristal» (trazas de peticiones) y la cola de Postgres.
 * API: apps/api/src/routes/trazas.ts (/api/admin/requests) y
 * apps/api/src/routes/cola.ts (/api/admin/queue). Solo administradores.
 */

const RAIZ = import.meta.env.VITE_API_URL ?? "";

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "include", ...init });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(error.message || error.detail || error.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export interface BloqueoDeTraza {
  tabla: string;
  operacion: "update" | "delete";
  motivo: "no_es_tuyo" | "no_existe";
}

export interface TrazaDePeticion {
  creado: string;
  request_id: string | null;
  metodo: string;
  ruta: string;
  estado: number;
  actor_tipo: "humano" | "agente" | "anonimo";
  actor_id: string | null;
  kon: string | null;
  operacion: string | null;
  duracion_ms: number;
  tiempo_db_ms: number | null;
  consultas: number | null;
  filas_afectadas: number | null;
  bloqueos: number;
  detalle_bloqueos: BloqueoDeTraza[] | null;
}

export interface ResumenDeOperacion {
  kon: string | null;
  operacion: string | null;
  metodo: string;
  ruta: string;
  peticiones: number;
  errores: number;
  bloqueos: number;
  p95_ms: number;
  media_db_ms: number | null;
  filas: number;
}

export interface FiltroDeTrazas {
  hours?: number;
  blocked?: boolean;
  errors?: boolean;
  actor?: string;
}

export function listRequestTraces(
  f: FiltroDeTrazas = {}
): Promise<{ enabled: boolean; requests: TrazaDePeticion[] }> {
  const q = new URLSearchParams();
  if (f.hours) q.set("hours", String(f.hours));
  if (f.blocked) q.set("blocked", "1");
  if (f.errors) q.set("errors", "1");
  if (f.actor) q.set("actor", f.actor);
  return fetchJson(`${RAIZ}/api/admin/requests?${q}`);
}

export function requestTraceSummary(
  hours = 24
): Promise<{ enabled: boolean; operations: ResumenDeOperacion[] }> {
  return fetchJson(`${RAIZ}/api/admin/requests/summary?hours=${hours}`);
}

export interface TrabajoMuerto {
  id: string;
  queue: string;
  name: string;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  user_id: string | null;
  agent_id: string | null;
  created_at: string;
  finished_at: string | null;
}

export interface EstadoDeCola {
  worker: "running" | "stopped" | "disabled";
  escucha: boolean;
  porCola: Record<string, Record<string, number>>;
  totales: Record<string, number>;
  dead: TrabajoMuerto[];
}

export function queueStatus(): Promise<EstadoDeCola> {
  return fetchJson(`${RAIZ}/api/admin/queue`);
}

export function retryJob(id: string): Promise<{ success: boolean }> {
  return fetchJson(`${RAIZ}/api/admin/queue/${encodeURIComponent(id)}/retry`, { method: "POST" });
}

export function discardJob(id: string): Promise<{ success: boolean }> {
  return fetchJson(`${RAIZ}/api/admin/queue/${encodeURIComponent(id)}`, { method: "DELETE" });
}
