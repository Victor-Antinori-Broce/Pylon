/**
 * Ejemplo — los sets de un torneo, para reportar desde la mesa
 * ============================================================================
 *
 * Copia el PATRÓN, no el diseño. Lo que importa de este fichero:
 *
 *   · `sets` ya viene filtrado: sin byes, sin sets resueltos y sin huecos TBD.
 *     No hace falta filtrarlo otra vez.
 *   · Se reporta con `set.matchId` y el `id` del LADO, que es un id de
 *     participante. Mandar el id del jugador es el error más común.
 *   · En suizo, `siguientePaso` dice cuándo se puede emparejar: el botón solo
 *     sale cuando no quedan sets abiertos, porque la API rechaza emparejar con
 *     la ronda a medias.
 */

import { useState } from "react";

import { useBracket, type KitsudenConfig } from "../index.js";

export function SetsDelTorneo({
  config,
  tournamentId,
}: {
  config: KitsudenConfig;
  tournamentId: string;
}) {
  const { torneo, sets, siguientePaso, loading, error, reportar, emparejarSiguienteRonda } =
    useBracket(config, tournamentId);
  const [aviso, setAviso] = useState<string | null>(null);

  if (loading) return <p>Cargando…</p>;
  if (error) return <p role="alert">{error.message}</p>;
  if (!torneo) return null;

  const intentar = (accion: Promise<unknown>) => {
    setAviso(null);
    accion.catch((e: Error) => setAviso(e.message));
  };

  return (
    <div>
      <h2>{torneo.title}</h2>
      {aviso && <p role="alert">{aviso}</p>}

      {sets.length === 0 ? <p>No hay sets abiertos.</p> : null}

      <ul>
        {sets.map((set) => (
          <li key={set.matchId}>
            <span>Ronda {set.ronda}: </span>
            {set.lados.map((lado) => (
              <button
                key={lado.id}
                type="button"
                onClick={() => intentar(reportar(set.matchId, lado.id))}
              >
                Gana {lado.nombre}
              </button>
            ))}
          </li>
        ))}
      </ul>

      {siguientePaso === "emparejar" ? (
        <button type="button" onClick={() => intentar(emparejarSiguienteRonda())}>
          Emparejar siguiente ronda
        </button>
      ) : null}
      {siguientePaso === "terminado" ? <p>El suizo ha terminado.</p> : null}
    </div>
  );
}
