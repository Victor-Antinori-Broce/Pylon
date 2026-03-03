/**
 * Gremio CMS — Tournaments Module Routes
 */

import { Hono } from "hono";
import { eq, desc, ilike, sql } from "drizzle-orm";

// App context injections
import { db } from "../../../apps/api/src/db";
import { tournaments, tournamentParticipants } from "./tournaments.schema";
import { games } from "../grimoire-games/games.schema";
import { players } from "../grimoire-players/players.schema";
import { teams } from "../grimoire-teams/teams.schema";

export const tournamentsRoutes = new Hono();

tournamentsRoutes.get("/", async (c) => {
    const search = c.req.query("search");
    const status = c.req.query("status");

    let query = db
        .select({ tournament: tournaments, game: games })
        .from(tournaments)
        .innerJoin(games, eq(tournaments.gameId, games.id))
        .orderBy(desc(tournaments.createdAt)) as any;

    // Need to dynamically construct where clause ideally, simplest version for now:
    if (search || status) {
        const conditions = [];
        if (search) conditions.push(ilike(tournaments.title, `%${search}%`));
        if (status) conditions.push(eq(tournaments.status, status as any));

        // Combining conditions using AND could be done with Drizzle's `and()`, but to keep it simple:
        const results = await db.select({ tournament: tournaments, game: games })
            .from(tournaments)
            .innerJoin(games, eq(tournaments.gameId, games.id))
            .where(sql`${search ? ilike(tournaments.title, `%${search}%`) : sql`TRUE`} AND ${status ? eq(tournaments.status, status as any) : sql`TRUE`}`)
            .orderBy(desc(tournaments.createdAt));

        return c.json(results.map(r => ({ ...r.tournament, game: r.game })));
    }

    const results = await query;
    return c.json(results.map((r: any) => ({ ...r.tournament, game: r.game })));
});

tournamentsRoutes.get("/:id", async (c) => {
    const { id } = c.req.param();
    const [tournament] = await db
        .select({ tournament: tournaments, game: games })
        .from(tournaments)
        .innerJoin(games, eq(tournaments.gameId, games.id))
        .where(eq(tournaments.id, id))
        .limit(1);

    if (!tournament) return c.json({ error: "Tournament not found" }, 404);

    const participantsData = await db
        .select({
            participant: tournamentParticipants,
            player: players,
            team: teams,
        })
        .from(tournamentParticipants)
        .leftJoin(players, eq(tournamentParticipants.playerId, players.id))
        .leftJoin(teams, eq(tournamentParticipants.teamId, teams.id))
        .where(eq(tournamentParticipants.tournamentId, id));

    return c.json({
        ...tournament.tournament,
        game: tournament.game,
        participants: participantsData.map(p => ({
            ...p.participant,
            player: p.player || null,
            team: p.team || null,
        })),
    });
});

tournamentsRoutes.post("/", async (c) => {
    const body = await c.req.json();

    const [tournament] = await db
        .insert(tournaments)
        .values({
            title: body.title,
            gameId: body.gameId,
            format: body.format || "1v1",
            maxParticipants: body.maxParticipants,
            status: body.status || "Draft",
        })
        .returning();

    return c.json(tournament, 201);
});

tournamentsRoutes.post("/:id/register", async (c) => {
    const { id } = c.req.param();
    const body = await c.req.json();

    const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, id)).limit(1);
    if (!tournament) return c.json({ error: "Tournament not found" }, 404);

    if (tournament.status !== "Open") {
        return c.json({ error: `Tournament is currently ${tournament.status}, inscriptions are closed.` }, 400);
    }

    // Checking current participants
    const [{ count }] = await db
        .select({ count: sql<number>`count(*)` })
        .from(tournamentParticipants)
        .where(eq(tournamentParticipants.tournamentId, id));

    if (Number(count) >= tournament.maxParticipants) {
        return c.json({ error: "Tournament has reached max participants." }, 400);
    }

    if (tournament.format === "1v1" && !body.playerId) {
        return c.json({ error: "playerId is required for 1v1 tournaments" }, 400);
    }

    if (tournament.format === "Team" && !body.teamId) {
        return c.json({ error: "teamId is required for Team tournaments" }, 400);
    }

    try {
        const [participant] = await db
            .insert(tournamentParticipants)
            .values({
                tournamentId: id,
                playerId: body.playerId || null,
                teamId: body.teamId || null,
                status: "Pending", // Default, might be auto-approved depending on business rule
            })
            .returning();

        return c.json(participant, 201);
    } catch (error: any) {
        // Unique constraint violation (likely already registered)
        return c.json({ error: "Failed to register. You may already be registered.", details: error.message }, 400);
    }
});

tournamentsRoutes.patch("/:id", async (c) => {
    const { id } = c.req.param();
    const body = await c.req.json();

    const [updated] = await db
        .update(tournaments)
        .set({ ...body, updatedAt: new Date() })
        .where(eq(tournaments.id, id))
        .returning();

    if (!updated) return c.json({ error: "Tournament not found" }, 404);
    return c.json(updated);
});
