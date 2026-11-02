/**
 * esports: aceptar una invitación no te da el alias de otro del equipo
 * ============================================================================
 *
 * Auditoría 2026-10-25: `aliasOwnership` daba por «tuyo» cualquier jugador del
 * equipo al que te invitaron. Un invitado se inscribía en torneos con el alias
 * del capitán (historial, clasificación) y le bloqueaba la plaza. Ahora la
 * invitación solo hace tuyo el jugador con el que la aceptaste.
 */
import { describe, it, expect, beforeAll } from "bun:test";

import { aliasOwnership } from "../../../../packages/kons/kon-esports/player-identity";
import {
  players,
  playersToTeams,
  teamInvites,
  teams,
} from "../../../../packages/kons/kon-esports/esports.schema";
import { db } from "../db";

import { isDatabaseAvailable, generateTestId } from "./setup";

let dbAvailable = false;

describe("aliasOwnership por invitación", () => {
  beforeAll(async () => {
    dbAvailable = await isDatabaseAvailable();
  });

  it("el invitado es dueño de SU jugador, no del capitán", async () => {
    if (!dbAvailable) return;
    const sufijo = generateTestId();
    const capitanUser = `cap-${sufijo}`;
    const invitadoUser = `inv-${sufijo}`;

    const [capitan] = await db.insert(players).values({ alias: `Capitan-${sufijo}` }).returning();
    const [invitado] = await db.insert(players).values({ alias: `Invitado-${sufijo}` }).returning();
    const [equipo] = await db
      .insert(teams)
      .values({ name: `Equipo-${sufijo}`, captainId: capitan!.id, createdByUserId: capitanUser } as never)
      .returning();
    await db.insert(playersToTeams).values([
      { playerId: capitan!.id, teamId: equipo!.id, role: "captain" },
      { playerId: invitado!.id, teamId: equipo!.id, role: "player" },
    ] as never);
    await db.insert(teamInvites).values({
      teamId: equipo!.id,
      token: `t${sufijo}`.slice(0, 64),
      status: "accepted",
      invitedUserId: invitadoUser,
      acceptedPlayerId: invitado!.id,
    } as never);

    const deCapitan = await aliasOwnership(db as never, capitan!.alias, invitadoUser);
    expect(deCapitan.status).toBe("taken");
    const suyo = await aliasOwnership(db as never, invitado!.alias, invitadoUser);
    expect(suyo).toEqual({ status: "mine", playerId: invitado!.id });
  });
});
