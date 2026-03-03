/**
 * Gremio CMS — Matches Module Routes
 */

import { Hono } from "hono";
import { eq, asc, and } from "drizzle-orm";

// App context injections
import { db } from "../../../apps/api/src/db";
import { matches } from "./matches.schema";
import { tournaments, tournamentParticipants } from "../grimoire-tournaments/tournaments.schema";
import { players } from "../grimoire-players/players.schema";
import { teams } from "../grimoire-teams/teams.schema";

export const matchesRoutes = new Hono();

// ── GET Matches by Tournament ──
matchesRoutes.get("/tournament/:tournamentId", async (c) => {
    const { tournamentId } = c.req.param();

    const results = await db.select()
        .from(matches)
        .where(eq(matches.tournamentId, tournamentId))
        .orderBy(asc(matches.round), asc(matches.matchOrder));

    return c.json(results);
});

// ── Generate Brackets ──
// Triggered when tournament transitions from Open to InProgress
matchesRoutes.post("/tournament/:tournamentId/generate", async (c) => {
    const { tournamentId } = c.req.param();

    // 1. Validate Tournament State
    const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, tournamentId)).limit(1);
    if (!tournament) return c.json({ error: "Tournament not found" }, 404);
    if (tournament.status !== "InProgress") {
        // Force status to InProgress for bracket generation if not already
        await db.update(tournaments).set({ status: "InProgress", updatedAt: new Date() }).where(eq(tournaments.id, tournamentId));
    }

    // 2. Clear existing matches (optional: safety for resets)
    await db.delete(matches).where(eq(matches.tournamentId, tournamentId));

    // 3. Fetch Participants (Pending -> auto approve for simplicity or fetch Approved)
    const participants = await db
        .select()
        .from(tournamentParticipants)
        .where(eq(tournamentParticipants.tournamentId, tournamentId));

    if (participants.length < 2) {
        return c.json({ error: "Not enough participants to generate brackets" }, 400);
    }

    // Shuffle for random seeding
    const shuffled = participants.sort(() => 0.5 - Math.random());

    // Single Elimination Setup: Next power of 2
    const maxP = tournament.maxParticipants; // E.g. 8
    const rounds = Math.log2(maxP); // 3 rounds (Quarter, Semi, Final)

    // Build matches backwards (Final -> Semis -> Quarters)
    // Store them to insert later and link 'nextMatchId'
    let dbMatches = [];

    // We need to keep track of generated matches to link them
    const matchMap = new Map(); // key `${round}-${order}` -> generated match object

    for (let r = rounds; r >= 1; r--) {
        const matchesInRound = Math.pow(2, rounds - r);
        for (let order = 1; order <= matchesInRound; order++) {
            const matchKey = `${r}-${order}`;

            // Determine what the 'nextMatchId' is
            // A match in Round R, order O feeds into Round R+1, order Math.ceil(O/2)
            let nextMatchRefId = null;
            if (r < rounds) {
                const nextOrder = Math.ceil(order / 2);
                nextMatchRefId = matchMap.get(`${r + 1}-${nextOrder}`)?.id;
            }

            const matchObj = {
                id: crypto.randomUUID(), // Temporarily generate UUID to link them prior to insert
                tournamentId: tournament.id,
                round: r,
                matchOrder: order,
                nextMatchId: nextMatchRefId, // the UUID we generated for the next round match
                status: "Pending",
                participant1Id: null,
                participant2Id: null,
            };

            matchMap.set(matchKey, matchObj);
            dbMatches.push(matchObj);
        }
    }

    // Fill Round 1 participants
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

        if (m.participant1Id && m.participant2Id) {
            m.status = "Ready";
        } else if (m.participant1Id || m.participant2Id) {
            // Automatic bye advancement if we don't have enough players could go here.
            // For now just keep it ready.
            m.status = "Ready";
        }
    }

    // Insert all
    await db.insert(matches).values(dbMatches);

    return c.json({ message: "Brackets generated", matches: dbMatches.length });
});

// ── Report Match Result ──
matchesRoutes.put("/:id", async (c) => {
    const { id } = c.req.param();
    const body = await c.req.json(); // { participant1Score, participant2Score, winnerId }

    const [match] = await db.select().from(matches).where(eq(matches.id, id)).limit(1);
    if (!match) return c.json({ error: "Match not found" }, 404);

    // Mark as Completed
    const [updated] = await db
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

    // Advance winner to the NEXT match if exists
    if (match.nextMatchId && body.winnerId) {
        const [nextMatch] = await db.select().from(matches).where(eq(matches.id, match.nextMatchId)).limit(1);

        if (nextMatch) {
            // Determine if they fall into participant 1 or 2 slot based on match mapping math
            // Slot 1 is usually for odd matchOrder of previous round, Slot 2 for even.
            const isSlot1 = (match.matchOrder % 2) !== 0;

            const updateData: any = {};
            if (isSlot1) {
                updateData.participant1Id = body.winnerId;
            } else {
                updateData.participant2Id = body.winnerId;
            }

            // If the other slot is filled, they are Ready to play
            const willBeReady = (isSlot1 && nextMatch.participant2Id) || (!isSlot1 && nextMatch.participant1Id);
            if (willBeReady) {
                updateData.status = "Ready";
            }

            await db.update(matches).set(updateData).where(eq(matches.id, nextMatch.id));
        }
    } else {
        // If there's no next match, this was the Final. 
        // Mark tournament as completed.
        await db.update(tournaments)
            .set({ status: "Completed", updatedAt: new Date() })
            .where(eq(tournaments.id, match.tournamentId));
    }

    return c.json(updated);
});
