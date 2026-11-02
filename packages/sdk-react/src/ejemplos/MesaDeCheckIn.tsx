/**
 * Ejemplo — la mesa de check-in de un torneo presencial
 * ============================================================================
 *
 * Copia el PATRÓN, no el diseño. Lo que importa de este fichero:
 *
 *   · `useCheckIn` refresca solo cada 10 s mientras la gente llega.
 *   · Se ofrecen las DOS listas: ausentes para marcarlos y presentes para
 *     deshacer un clic de más. Sin la segunda, un error en la mesa es
 *     permanente.
 *   · Los nombres salen de `useBracket`, que ya los resuelve: el check-in solo
 *     trae ids de participante.
 *   · `resolverAusentes` va en dos pasos: primero el plan, luego `confirmar`.
 */

import { useState } from "react";

import { useBracket, useCheckIn, type KitsudenConfig } from "../index.js";

export function MesaDeCheckIn({
  config,
  tournamentId,
}: {
  config: KitsudenConfig;
  tournamentId: string;
}) {
  const { estado, error, marcar, deshacer, resolverAusentes } = useCheckIn(config, tournamentId);
  const { nombres } = useBracket(config, tournamentId, { pollMs: 0 });
  const [aviso, setAviso] = useState<string | null>(null);

  if (error) return <p role="alert">{error.message}</p>;
  if (!estado) return <p>Cargando…</p>;

  const nombre = (id: string) => nombres[id] ?? id.slice(0, 8);
  const intentar = (accion: Promise<unknown>) => {
    setAviso(null);
    accion.catch((e: Error) => setAviso(e.message));
  };

  const quitarAusentes = async () => {
    const plan = (await resolverAusentes("drop")) as {
      plan: { participantIds: string[]; remaining: number };
    };
    const n = plan.plan.participantIds.length;
    if (n > 0 && window.confirm(`¿Quitar a ${n}? Quedarían ${plan.plan.remaining}.`)) {
      await resolverAusentes("drop", true);
    }
  };

  return (
    <div>
      <p>
        {estado.summary.checkedIn} / {estado.summary.total} presentes · check-in {estado.state}
      </p>
      {aviso && <p role="alert">{aviso}</p>}

      <h3>Faltan</h3>
      {estado.summary.missingIds.map((id) => (
        <button key={id} type="button" onClick={() => intentar(marcar(id))}>
          {nombre(id)}
        </button>
      ))}

      <h3>Presentes</h3>
      {estado.summary.checkedInIds.map((id) => (
        <button key={id} type="button" title="Deshacer" onClick={() => intentar(deshacer(id))}>
          {nombre(id)} ✓
        </button>
      ))}

      <p>
        <button type="button" onClick={() => intentar(quitarAusentes())}>
          Quitar ausentes (antes de generar el cuadro)
        </button>
      </p>
    </div>
  );
}
