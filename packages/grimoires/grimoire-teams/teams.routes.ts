/**
 * Gremio CMS — Teams Module Routes
 */

import { Hono } from "hono";
import { eq, desc, ilike } from "drizzle-orm";

// App context injections
import { db } from "../../../apps/api/src/db";
import { teams, playersToTeams } from "./teams.schema";
import { players } from "../grimoire-players/players.schema";

export const teamsRoutes = new Hono();

teamsRoutes.get("/", async (c) => {
    const search = c.req.query("search");

    let query = db.select().from(teams).orderBy(desc(teams.createdAt));

    if (search) {
        query = db.select().from(teams).where(ilike(teams.name, `%${search}%`)).orderBy(desc(teams.createdAt)) as any;
    }

    const results = await query;
    return c.json(results);
});

teamsRoutes.get("/:id", async (c) => {
    const { id } = c.req.param();
    const [team] = await db.select().from(teams).where(eq(teams.id, id)).limit(1);

    if (!team) return c.json({ error: "Team not found" }, 404);

    const membersData = await db
        .select({ player: players })
        .from(playersToTeams)
        .innerJoin(players, eq(playersToTeams.playerId, players.id))
        .where(eq(playersToTeams.teamId, team.id));

    return c.json({
        ...team,
        members: membersData.map((m) => m.player),
    });
});

teamsRoutes.post("/", async (c) => {
    const body = await c.req.json();

    const [team] = await db
        .insert(teams)
        .values({
            name: body.name,
            logoUrl: body.logoUrl,
            captainId: body.captainId,
        })
        .returning();

    if (body.memberIds && Array.isArray(body.memberIds) && body.memberIds.length > 0) {
        await db.insert(playersToTeams).values(
            body.memberIds.map((playerId: string) => ({ teamId: team.id, playerId }))
        );
    }

    return c.json(team, 201);
});

teamsRoutes.patch("/:id", async (c) => {
    const { id } = c.req.param();
    const body = await c.req.json();

    const { memberIds, ...updates } = body;

    const [updated] = await db
        .update(teams)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(teams.id, id))
        .returning();

    if (!updated) return c.json({ error: "Team not found" }, 404);

    if (memberIds !== undefined) {
        await db.delete(playersToTeams).where(eq(playersToTeams.teamId, id));
        if (memberIds.length > 0) {
            await db.insert(playersToTeams).values(
                memberIds.map((playerId: string) => ({ teamId: id, playerId }))
            );
        }
    }

    return c.json(updated);
});

teamsRoutes.delete("/:id", async (c) => {
    const { id } = c.req.param();
    const [deleted] = await db.delete(teams).where(eq(teams.id, id)).returning({ id: teams.id });
    if (!deleted) return c.json({ error: "Team not found" }, 404);
    return c.json({ deleted: true, id: deleted.id });
});
