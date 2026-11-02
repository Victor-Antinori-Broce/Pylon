/**
 * Hooks de dominio — el estado y las reglas, sin imponer apariencia
 * ============================================================================
 *
 * ── PARA QUE ───────────────────────────────────────────────────────────────
 *
 * Una IA genera una interfaz bonita en un prompt. Lo que hace mal es hablar
 * con el backend: a qué ruta se reporta un set, qué id se manda —el de la fila
 * o el del jugador—, cuándo se puede emparejar la ronda siguiente, cómo se
 * mueve una ficha sin que la pantalla parpadee.
 *
 * Estos hooks resuelven esa parte y devuelven datos y acciones. No pintan
 * nada: el componente lo escribe quien los usa, con su diseño.
 *
 * ── LO QUE NO HACEN ────────────────────────────────────────────────────────
 *
 * Tiempo real. Esports no publica estado sincronizado todavía, así que se
 * refresca por sondeo (`pollMs`). Cuando lo publique, estos hooks son el único
 * sitio que habrá que cambiar.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  moverEnTierList,
  nombresDeParticipantes,
  pedirAKitsuden,
  setsAbiertos,
  siguientePasoDelSuizo,
  vistaDeTierList,
  type EstadoDelSuizo,
  type FilaDeSet,
  type KitsudenConfig,
  type TierListData,
  type TorneoDetalle,
} from "./dominio-puro.js";
import { useKitsudenQuery } from "./index.js";

/** Refresca cada `ms` mientras el componente esté montado. `0` lo desactiva. */
function useSondeo(refetch: () => void, ms: number): void {
  useEffect(() => {
    if (!ms) return;
    const id = setInterval(refetch, ms);
    return () => clearInterval(id);
  }, [refetch, ms]);
}

// ── Tier list ────────────────────────────────────────────────────────────────

/**
 * Una plantilla de tier list, agrupada por filas, con las acciones que tiene.
 *
 *     const { vista, colocar, sincronizar } = useTierList(config, "campeones");
 *     vista?.filas.map(({ tier, items }) => …)
 *     await colocar(item.id, "s");     // null lo devuelve al pool
 *
 * `colocar` es OPTIMISTA: mueve la ficha al momento y, si la API la rechaza,
 * la devuelve a donde estaba y relanza el error. Sin eso, arrastrar una ficha
 * se siente roto aunque funcione.
 */
export function useTierList(config: KitsudenConfig, slug: string) {
  const consulta = useKitsudenQuery(
    () =>
      pedirAKitsuden<{ data: TierListData }>(
        config,
        "GET",
        `/tierlist/templates/${encodeURIComponent(slug)}`
      ),
    [config.baseUrl, config.token, slug]
  );

  const [lista, setLista] = useState<TierListData | null>(null);
  useEffect(() => {
    if (consulta.data) setLista(consulta.data.data);
  }, [consulta.data]);

  const colocar = useCallback(
    async (itemId: string, tierId: string | null) => {
      if (!lista) return;
      const previa = lista;
      setLista(moverEnTierList(lista, itemId, tierId));
      try {
        const r = await pedirAKitsuden<{ data: TierListData }>(
          config,
          "POST",
          `/tierlist/templates/${encodeURIComponent(slug)}/place`,
          { itemId, tierId }
        );
        setLista(r.data);
      } catch (error) {
        setLista(previa);
        throw error;
      }
    },
    [config, slug, lista]
  );

  /**
   * Trae lo nuevo del catálogo. Lo ya colocado no se mueve; lo que sale del
   * catálogo deja de ocupar sitio.
   */
  const sincronizar = useCallback(
    async (opciones: { datasetId?: string; confirm?: boolean } = {}) => {
      const r = await pedirAKitsuden<unknown>(
        config,
        "POST",
        `/tierlist/templates/${encodeURIComponent(slug)}/sync`,
        opciones
      );
      consulta.refetch();
      return r;
    },
    [config, slug, consulta]
  );

  const vista = useMemo(() => (lista ? vistaDeTierList(lista) : null), [lista]);

  return {
    lista,
    vista,
    loading: consulta.loading,
    error: consulta.error,
    refetch: consulta.refetch,
    colocar,
    sincronizar,
  };
}

// ── Cuadro / sets de un torneo ───────────────────────────────────────────────

interface EstadoDeTorneo {
  torneo: TorneoDetalle;
  filas: FilaDeSet[];
  /** Suizo: `{ round, totalRounds, complete, standings }`. Resto: la tabla del formato. */
  clasificacion: unknown;
}

/**
 * Los sets abiertos de un torneo, con nombres, y las acciones para avanzarlo.
 *
 *     const { sets, reportar, siguientePaso, emparejarSiguienteRonda } =
 *       useBracket(config, torneoId);
 *     sets.map((s) => <button onClick={() => reportar(s.matchId, s.lados[0].id)} />)
 *
 * `reportar` manda el id de la FILA (`matchId`) y el de PARTICIPANTE: son los
 * dos ids que más se confunden con el del jugador. Funciona igual en
 * eliminación, round robin y suizo.
 */
export function useBracket(
  config: KitsudenConfig,
  tournamentId: string,
  opciones: { pollMs?: number } = {}
) {
  const id = encodeURIComponent(tournamentId);

  const consulta = useKitsudenQuery<EstadoDeTorneo>(async () => {
    const torneo = await pedirAKitsuden<TorneoDetalle>(config, "GET", `/esports/tournaments/${id}`);
    const filas = await pedirAKitsuden<FilaDeSet[]>(
      config,
      "GET",
      `/esports/matches/tournament/${id}`
    );

    let clasificacion: unknown = null;
    if (torneo.bracketFormat === "swiss") {
      clasificacion = (
        await pedirAKitsuden<{ data: unknown }>(config, "GET", `/esports/tournament/${id}/swiss`)
      ).data;
    } else if (torneo.bracketFormat === "round_robin") {
      clasificacion = await pedirAKitsuden<unknown>(
        config,
        "GET",
        `/esports/matches/tournament/${id}/standings`
      );
    } else if (filas.length > 0) {
      clasificacion = (
        await pedirAKitsuden<{ standings: unknown }>(
          config,
          "GET",
          `/esports/matches/tournament/${id}/bracket`
        )
      ).standings;
    }

    return { torneo, filas, clasificacion };
  }, [config.baseUrl, config.token, tournamentId]);

  useSondeo(consulta.refetch, opciones.pollMs ?? 15_000);

  const nombres = useMemo(
    () => (consulta.data ? nombresDeParticipantes(consulta.data.torneo) : {}),
    [consulta.data]
  );
  const sets = useMemo(
    () => (consulta.data ? setsAbiertos(consulta.data.filas, nombres) : []),
    [consulta.data, nombres]
  );

  const siguientePaso = useMemo(() => {
    const d = consulta.data;
    if (!d || d.torneo.bracketFormat !== "swiss" || !d.clasificacion) return null;
    return siguientePasoDelSuizo(d.clasificacion as EstadoDelSuizo, sets.length);
  }, [consulta.data, sets.length]);

  const reportar = useCallback(
    async (
      matchId: string,
      winnerId: string,
      marcador?: { participant1Score?: number; participant2Score?: number }
    ) => {
      const r = await pedirAKitsuden<unknown>(
        config,
        "POST",
        `/esports/matches/tournament/${id}/report`,
        { matchId, winnerId, ...marcador }
      );
      consulta.refetch();
      return r;
    },
    [config, id, consulta]
  );

  const emparejarSiguienteRonda = useCallback(async () => {
    const r = await pedirAKitsuden<unknown>(
      config,
      "POST",
      `/esports/tournament/${id}/swiss/next-round`
    );
    consulta.refetch();
    return r;
  }, [config, id, consulta]);

  return {
    torneo: consulta.data?.torneo ?? null,
    sets,
    nombres,
    clasificacion: consulta.data?.clasificacion ?? null,
    siguientePaso,
    loading: consulta.loading,
    error: consulta.error,
    refetch: consulta.refetch,
    reportar,
    emparejarSiguienteRonda,
  };
}

// ── Check-in ─────────────────────────────────────────────────────────────────

export interface EstadoDeCheckIn {
  state: "disabled" | "scheduled" | "open" | "closed";
  countdown: number | null;
  summary: {
    total: number;
    checkedIn: number;
    missing: number;
    missingIds: string[];
    checkedInIds: string[];
  };
}

/**
 * El check-in de un torneo para la mesa del TO.
 *
 * Refresca solo cada 10 s: se mira mientras la gente va llegando, y recargar a
 * mano es justo lo que nadie hace con sesenta personas delante.
 *
 * `resolverAusentes("drop")` es para ANTES de generar el cuadro; `"dq"` para
 * después. La API pide confirmación en dos pasos y este hook respeta eso:
 * sin `confirmar: true` solo devuelve el plan.
 */
export function useCheckIn(
  config: KitsudenConfig,
  tournamentId: string,
  opciones: { pollMs?: number } = {}
) {
  const id = encodeURIComponent(tournamentId);

  const consulta = useKitsudenQuery(
    () => pedirAKitsuden<EstadoDeCheckIn>(config, "GET", `/esports/tournament/${id}/check-in`),
    [config.baseUrl, config.token, tournamentId]
  );
  useSondeo(consulta.refetch, opciones.pollMs ?? 10_000);

  const marcar = useCallback(
    async (participantId: string) => {
      await pedirAKitsuden(
        config,
        "POST",
        `/esports/participant/${encodeURIComponent(participantId)}/check-in`
      );
      consulta.refetch();
    },
    [config, consulta]
  );

  const deshacer = useCallback(
    async (participantId: string) => {
      await pedirAKitsuden(
        config,
        "DELETE",
        `/esports/participant/${encodeURIComponent(participantId)}/check-in`
      );
      consulta.refetch();
    },
    [config, consulta]
  );

  const abrirVentana = useCallback(
    async (opensAt: Date | null, closesAt: Date | null) => {
      await pedirAKitsuden(config, "POST", `/esports/tournament/${id}/check-in/window`, {
        opensAt: opensAt?.toISOString() ?? null,
        closesAt: closesAt?.toISOString() ?? null,
      });
      consulta.refetch();
    },
    [config, id, consulta]
  );

  const resolverAusentes = useCallback(
    async (action: "drop" | "dq", confirmar = false) => {
      const r = await pedirAKitsuden<unknown>(
        config,
        "POST",
        `/esports/tournament/${id}/check-in/resolve`,
        {
          action,
          ...(confirmar ? { confirm: true } : {}),
        }
      );
      if (confirmar) consulta.refetch();
      return r;
    },
    [config, id, consulta]
  );

  return {
    estado: consulta.data,
    loading: consulta.loading,
    error: consulta.error,
    refetch: consulta.refetch,
    marcar,
    deshacer,
    abrirVentana,
    resolverAusentes,
  };
}
