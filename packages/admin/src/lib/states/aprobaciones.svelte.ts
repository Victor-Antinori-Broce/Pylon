/**
 * El contador de propuestas pendientes (fase F) que enseña el menú.
 *
 * Se pide al entrar y cada 30 s mientras haya alguien del equipo en el panel;
 * la bandeja lo refresca al decidir. Un fallo (sin permiso, API caída) deja el
 * último valor: el contador no es motivo para enseñar un error.
 */
import { countPendingProposals } from "$lib/services/approvals";

const estado = $state({ pendientes: 0 });
let intervalo: ReturnType<typeof setInterval> | null = null;

export const aprobaciones = {
  get pendientes() {
    return estado.pendientes;
  },
  async refrescar(): Promise<void> {
    try {
      estado.pendientes = await countPendingProposals();
    } catch {
      /* se queda el último */
    }
  },
  /** Empieza a vigilar; devuelve cómo parar. */
  vigilar(ms = 30_000): () => void {
    void this.refrescar();
    if (!intervalo) intervalo = setInterval(() => void this.refrescar(), ms);
    return () => {
      if (intervalo) clearInterval(intervalo);
      intervalo = null;
    };
  },
};
