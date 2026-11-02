/**
 * Tablas que el explorador de datos conoce (GET /api/explorer/tables), pedidas
 * una sola vez por carga de página. Sirve para no preguntar por opciones de
 * relación a tablas que solo existen en una suposición sobre el nombre de una
 * columna.
 */
const API_URL = import.meta.env.VITE_API_URL ?? "";

let pendiente: Promise<Set<string>> | null = null;

export function tablasConocidas(): Promise<Set<string>> {
  pendiente ??= fetch(`${API_URL}/api/explorer/tables`, { credentials: "include" })
    .then((r) => (r.ok ? r.json() : { tables: [] }))
    .then((d: { tables?: Array<{ key: string }> }) => new Set((d.tables ?? []).map((t) => t.key)))
    .catch(() => {
      pendiente = null; // reintentar en la próxima apertura
      return new Set<string>();
    });
  return pendiente;
}
