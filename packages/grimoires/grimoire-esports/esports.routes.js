// @ts-nocheck
/**
 * Esports Module — Dependency Injection Wrapper
 *
 * All routes refactored to use GrimoireContext for DI
 */
import { Hono } from "hono";
import { eq, desc, ilike, sql, asc } from "drizzle-orm";
import { tournaments, tournamentParticipants, players, teams, matches, playersToTeams } from "./esports.schema";
/**
 * Create Players router with DI
 */
function createPlayersRouter(ctx) {
    const app = new Hono();
    const { db, auth } = ctx;
    // List Players
    app.get("/", async (c) => {
        const search = c.req.query("search");
        let query = db.instance.select().from(players).orderBy(desc(players.createdAt));
        if (search) {
            query = db.instance.select().from(players).where(ilike(players.alias, `%${search}%`)).orderBy(desc(players.createdAt));
        }
        const results = await query;
        return c.json(results);
    });
    // Get Player by ID
    app.get("/:id", async (c) => {
        const { id } = c.req.param();
        const [player] = await db.instance.select().from(players).where(eq(players.id, id)).limit(1);
        if (!player)
            return c.json({ error: "Player not found" }, 404);
        const playerTeams = await db.instance
            .select({ team: teams })
            .from(playersToTeams)
            .innerJoin(teams, eq(playersToTeams.teamId, teams.id))
            .where(eq(playersToTeams.playerId, id));
        return c.json({ ...player, teams: playerTeams.map((r) => r.team) });
    });
    // Create Player
    app.post("/", auth.requireAuth, async (c) => {
        const body = await c.req.json();
        const [player] = await db.instance
            .insert(players)
            .values({
            alias: body.alias,
            avatarId: body.avatarId,
            bio: body.bio,
            socialLinks: body.socialLinks ? JSON.stringify(body.socialLinks) : null,
            coreUserId: body.coreUserId,
        })
            .returning();
        return c.json(player, 201);
    });
    // Update Player
    app.patch("/:id", auth.requireAuth, async (c) => {
        const { id } = c.req.param();
        const body = await c.req.json();
        const updates = { ...body, updatedAt: new Date() };
        if (body.avatarUrl !== undefined) {
            updates.avatarId = body.avatarUrl;
            delete updates.avatarUrl;
        }
        if (body.socialLinks && typeof body.socialLinks === "object") {
            updates.socialLinks = JSON.stringify(body.socialLinks);
        }
        const [updated] = await db.instance.update(players).set(updates).where(eq(players.id, id)).returning();
        if (!updated)
            return c.json({ error: "Player not found" }, 404);
        return c.json(updated);
    });
    // Delete Player
    app.delete("/:id", auth.requireAuth, async (c) => {
        const { id } = c.req.param();
        const [deleted] = await db.instance.delete(players).where(eq(players.id, id)).returning({ id: players.id });
        if (!deleted)
            return c.json({ error: "Player not found" }, 404);
        return c.json({ deleted: true, id: deleted.id });
    });
    return app;
}
/**
 * Create Teams router with DI
 */
function createTeamsRouter(ctx) {
    const app = new Hono();
    const { db, auth } = ctx;
    // List Teams
    app.get("/", async (c) => {
        const search = c.req.query("search");
        let query = db.instance.select().from(teams).orderBy(desc(teams.createdAt));
        if (search) {
            query = db.instance.select().from(teams).where(ilike(teams.name, `%${search}%`)).orderBy(desc(teams.createdAt));
        }
        const results = await query;
        return c.json(results);
    });
    // Get Team by ID
    app.get("/:id", async (c) => {
        const { id } = c.req.param();
        const [team] = await db.instance.select().from(teams).where(eq(teams.id, id)).limit(1);
        if (!team)
            return c.json({ error: "Team not found" }, 404);
        const membersData = await db.instance
            .select({ player: players })
            .from(playersToTeams)
            .innerJoin(players, eq(playersToTeams.playerId, players.id))
            .where(eq(playersToTeams.teamId, team.id));
        let captain = null;
        if (team.captainId) {
            const [captainData] = await db.instance.select().from(players).where(eq(players.id, team.captainId)).limit(1);
            captain = captainData || null;
        }
        return c.json({ ...team, captain, members: membersData.map((m) => m.player) });
    });
    // Create Team
    app.post("/", auth.requireAuth, async (c) => {
        const body = await c.req.json();
        const [team] = await db.instance
            .insert(teams)
            .values({ name: body.name, logoId: body.logoId, captainId: body.captainId })
            .returning();
        if (body.memberIds && Array.isArray(body.memberIds) && body.memberIds.length > 0) {
            await db.instance.insert(playersToTeams).values(body.memberIds.map((playerId) => ({ teamId: team.id, playerId })));
        }
        return c.json(team, 201);
    });
    // Update Team
    app.patch("/:id", auth.requireAuth, async (c) => {
        const { id } = c.req.param();
        const body = await c.req.json();
        const { memberIds, logoUrl, logoId, ...updates } = body;
        if (logoUrl !== undefined || logoId !== undefined) {
            updates.logoId = logoId ?? logoUrl;
        }
        const [updated] = await db.instance.update(teams).set({ ...updates, updatedAt: new Date() }).where(eq(teams.id, id)).returning();
        if (!updated)
            return c.json({ error: "Team not found" }, 404);
        if (memberIds !== undefined) {
            await db.instance.delete(playersToTeams).where(eq(playersToTeams.teamId, id));
            if (memberIds.length > 0) {
                await db.instance.insert(playersToTeams).values(memberIds.map((playerId) => ({ teamId: id, playerId })));
            }
        }
        return c.json(updated);
    });
    // Delete Team
    app.delete("/:id", auth.requireAuth, async (c) => {
        const { id } = c.req.param();
        const [deleted] = await db.instance.delete(teams).where(eq(teams.id, id)).returning({ id: teams.id });
        if (!deleted)
            return c.json({ error: "Team not found" }, 404);
        return c.json({ deleted: true, id: deleted.id });
    });
    return app;
}
/**
 * Create Tournaments router with DI
 */
function createTournamentsRouter(ctx) {
    const app = new Hono();
    const { db, auth } = ctx;
    // List Tournaments
    app.get("/", async (c) => {
        const search = c.req.query("search");
        const status = c.req.query("status");
        let query = db.instance
            .select({
            id: tournaments.id,
            title: tournaments.title,
            gameId: tournaments.gameId,
            format: tournaments.format,
            maxParticipants: tournaments.maxParticipants,
            status: tournaments.status,
            createdAt: tournaments.createdAt,
            updatedAt: tournaments.updatedAt,
        })
            .from(tournaments)
            .orderBy(desc(tournaments.createdAt));
        if (search)
            query = query.where(ilike(tournaments.title, `%${search}%`));
        if (status)
            query = query.where(eq(tournaments.status, status));
        const results = await query;
        return c.json(results);
    });
    // Create Tournament
    app.post("/", auth.requireAuth, async (c) => {
        const body = await c.req.json();
        const [tournament] = await db.instance
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
    // Register Participant
    app.post("/:id/register", auth.requireAuth, async (c) => {
        const { id } = c.req.param();
        const body = await c.req.json();
        const [tournament] = await db.instance.select().from(tournaments).where(eq(tournaments.id, id)).limit(1);
        if (!tournament)
            return c.json({ error: "Tournament not found" }, 404);
        if (tournament.status !== "Open") {
            return c.json({ error: `Tournament is currently ${tournament.status}, inscriptions are closed.` }, 400);
        }
        const [{ count }] = await db.instance
            .select({ count: sql `count(*)` })
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
            const [participant] = await db.instance
                .insert(tournamentParticipants)
                .values({
                tournamentId: id,
                playerId: body.playerId || null,
                teamId: body.teamId || null,
                status: "Pending",
            })
                .returning();
            return c.json(participant, 201);
        }
        catch (error) {
            return c.json({ error: "Failed to register. You may already be registered.", details: error.message }, 400);
        }
    });
    // Get Tournament by ID
    app.get("/:id", async (c) => {
        const { id } = c.req.param();
        const [tournament] = await db.instance.select().from(tournaments).where(eq(tournaments.id, id)).limit(1);
        if (!tournament)
            return c.json({ error: "Tournament not found" }, 404);
        const participantsData = await db.instance
            .select({ participant: tournamentParticipants, player: players, team: teams })
            .from(tournamentParticipants)
            .leftJoin(players, eq(tournamentParticipants.playerId, players.id))
            .leftJoin(teams, eq(tournamentParticipants.teamId, teams.id))
            .where(eq(tournamentParticipants.tournamentId, id));
        return c.json({
            ...tournament,
            participants: participantsData.map(p => ({ ...p.participant, player: p.player || null, team: p.team || null })),
        });
    });
    // Update Tournament
    app.patch("/:id", auth.requireAuth, async (c) => {
        const { id } = c.req.param();
        const body = await c.req.json();
        const [updated] = await db.instance
            .update(tournaments)
            .set({ ...body, updatedAt: new Date() })
            .where(eq(tournaments.id, id))
            .returning();
        if (!updated)
            return c.json({ error: "Tournament not found" }, 404);
        return c.json(updated);
    });
    // Delete Tournament
    app.delete("/:id", auth.requireAuth, async (c) => {
        const { id } = c.req.param();
        const [deleted] = await db.instance.delete(tournaments).where(eq(tournaments.id, id)).returning({ id: tournaments.id });
        if (!deleted)
            return c.json({ error: "Tournament not found" }, 404);
        return c.json({ deleted: true, id: deleted.id });
    });
    return app;
}
/**
 * Create Matches router with DI
 */
function createMatchesRouter(ctx) {
    const app = new Hono();
    const { db, auth } = ctx;
    // GET All Matches
    app.get("/", async (c) => {
        const tournamentId = c.req.query("tournamentId");
        let query = db.instance.select().from(matches).orderBy(asc(matches.round), asc(matches.matchOrder));
        if (tournamentId)
            query = query.where(eq(matches.tournamentId, tournamentId));
        const results = await query;
        return c.json(results);
    });
    // GET Matches by Tournament
    app.get("/tournament/:tournamentId", async (c) => {
        const { tournamentId } = c.req.param();
        const results = await db.instance
            .select()
            .from(matches)
            .where(eq(matches.tournamentId, tournamentId))
            .orderBy(asc(matches.round), asc(matches.matchOrder));
        return c.json(results);
    });
    // Get Match by ID with Participants
    app.get("/:id", async (c) => {
        const { id } = c.req.param();
        const [match] = await db.instance.select().from(matches).where(eq(matches.id, id)).limit(1);
        if (!match)
            return c.json({ error: "Match not found" }, 404);
        const getParticipant = async (participantId) => {
            if (!participantId)
                return null;
            const [p] = await db.instance
                .select({ participant: tournamentParticipants, player: players, team: teams })
                .from(tournamentParticipants)
                .leftJoin(players, eq(tournamentParticipants.playerId, players.id))
                .leftJoin(teams, eq(tournamentParticipants.teamId, teams.id))
                .where(eq(tournamentParticipants.id, participantId))
                .limit(1);
            return p ? { ...p.participant, player: p.player, team: p.team } : null;
        };
        const [participant1, participant2, winner] = await Promise.all([
            getParticipant(match.participant1Id),
            getParticipant(match.participant2Id),
            getParticipant(match.winnerId),
        ]);
        return c.json({ ...match, participant1, participant2, winner });
    });
    // Generate Brackets
    app.post("/tournament/:tournamentId/generate", auth.requireAuth, async (c) => {
        const { tournamentId } = c.req.param();
        const [tournament] = await db.instance.select().from(tournaments).where(eq(tournaments.id, tournamentId)).limit(1);
        if (!tournament)
            return c.json({ error: "Tournament not found" }, 404);
        if (tournament.status !== "InProgress") {
            await db.instance.update(tournaments).set({ status: "InProgress", updatedAt: new Date() }).where(eq(tournaments.id, tournamentId));
        }
        await db.instance.delete(matches).where(eq(matches.tournamentId, tournamentId));
        const participants = await db.instance.select().from(tournamentParticipants).where(eq(tournamentParticipants.tournamentId, tournamentId));
        if (participants.length < 2)
            return c.json({ error: "Not enough participants to generate brackets" }, 400);
        const shuffled = participants.sort(() => 0.5 - Math.random());
        const maxP = tournament.maxParticipants;
        const rounds = Math.log2(maxP);
        let dbMatches = [];
        const matchMap = new Map();
        for (let r = rounds; r >= 1; r--) {
            const matchesInRound = Math.pow(2, rounds - r);
            for (let order = 1; order <= matchesInRound; order++) {
                const matchKey = `${r}-${order}`;
                let nextMatchRefId = null;
                if (r < rounds) {
                    const nextOrder = Math.ceil(order / 2);
                    nextMatchRefId = matchMap.get(`${r + 1}-${nextOrder}`)?.id;
                }
                const matchObj = {
                    id: crypto.randomUUID(),
                    tournamentId: tournament.id,
                    round: r,
                    matchOrder: order,
                    nextMatchId: nextMatchRefId,
                    status: "Pending",
                    participant1Id: null,
                    participant2Id: null,
                };
                matchMap.set(matchKey, matchObj);
                dbMatches.push(matchObj);
            }
        }
        const round1Matches = dbMatches.filter(m => m.round === 1).sort((a, b) => a.matchOrder - b.matchOrder);
        let pIndex = 0;
        for (let m of round1Matches) {
            if (pIndex < shuffled.length) {
                m.participant1Id = shuffled[pIndex].id;
                pIndex++;
            }
            if (pIndex < shuffled.length) {
                m.participant2Id = shuffled[pIndex].id;
                pIndex++;
            }
            if (m.participant1Id && m.participant2Id)
                m.status = "Ready";
            else if (m.participant1Id || m.participant2Id)
                m.status = "Ready";
        }
        await db.instance.insert(matches).values(dbMatches);
        return c.json({ message: "Brackets generated", matches: dbMatches.length });
    });
    // Report Match Result
    app.put("/:id", auth.requireAuth, async (c) => {
        const { id } = c.req.param();
        const body = await c.req.json();
        const [match] = await db.instance.select().from(matches).where(eq(matches.id, id)).limit(1);
        if (!match)
            return c.json({ error: "Match not found" }, 404);
        const [updated] = await db.instance
            .update(matches)
            .set({
            participant1Score: body.participant1Score,
            participant2Score: body.participant2Score,
            winnerId: body.winnerId,
            status: "Completed",
            updatedAt: new Date(),
        })
            .where(eq(matches.id, id))
            .returning();
        if (match.nextMatchId && body.winnerId) {
            const [nextMatch] = await db.instance.select().from(matches).where(eq(matches.id, match.nextMatchId)).limit(1);
            if (nextMatch) {
                const isSlot1 = (match.matchOrder % 2) !== 0;
                const updateData = {};
                if (isSlot1)
                    updateData.participant1Id = body.winnerId;
                else
                    updateData.participant2Id = body.winnerId;
                const willBeReady = (isSlot1 && nextMatch.participant2Id) || (!isSlot1 && nextMatch.participant1Id);
                if (willBeReady)
                    updateData.status = "Ready";
                await db.instance.update(matches).set(updateData).where(eq(matches.id, nextMatch.id));
            }
        }
        else {
            await db.instance.update(tournaments).set({ status: "Completed", updatedAt: new Date() }).where(eq(tournaments.id, match.tournamentId));
        }
        return c.json(updated);
    });
    // Delete Match
    app.delete("/:id", auth.requireAuth, async (c) => {
        const { id } = c.req.param();
        const [deleted] = await db.instance.delete(matches).where(eq(matches.id, id)).returning({ id: matches.id });
        if (!deleted)
            return c.json({ error: "Match not found" }, 404);
        return c.json({ deleted: true, id: deleted.id });
    });
    return app;
}
/**
 * Create Esports router with dependency injection
 */
export function createEsportsRouter(ctx) {
    const app = new Hono();
    app.route("/players", createPlayersRouter(ctx));
    app.route("/teams", createTeamsRouter(ctx));
    app.route("/tournaments", createTournamentsRouter(ctx));
    app.route("/matches", createMatchesRouter(ctx));
    return app;
}
// Legacy exports for backward compatibility (now all use DI)
export const playersRoutes = { __legacy: true };
export const teamsRoutes = { __legacy: true };
export const tournamentsRoutes = { __legacy: true };
export const matchesRoutes = { __legacy: true };
//# sourceMappingURL=esports.routes.js.map