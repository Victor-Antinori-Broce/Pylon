/**
 * esports: un torneo en borrador no existe por NINGUNA ruta pública
 * ============================================================================
 *
 * Auditoría 2026-10-25: las rutas secundarias (partidos, cuadro, fases,
 * check-in, emisiones…) enseñaban el borrador. Ahora `borradores-ocultos.ts`
 * responde 404 a quien no puede verlo, como a un id que no existe. Y los
 * jugadores/equipos públicos ya no llevan los ids de cuenta.
 *
 * El kon se monta aquí con su propio router: en la configuración de pruebas está
 * apagado, y con `app` todo daba 404 y «un borrador da 404» pasaba sin probar nada.
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { sql } from "drizzle-orm";
import { Hono } from "hono";

import { players, tournaments } from "../../../../packages/kons/kon-esports/esports.schema";
import { kon } from "../../../../packages/kons/kon-esports/index";
import { db } from "../db";
import { createTestKonContext } from "../lib/test-kon-context";

import { isDatabaseAvailable, generateTestId } from "./setup";

let dbAvailable = false;
const app = new Hono();
const pedir = (ruta: string) => app.request(new Request(`http://localhost:3000/api/esports${ruta}`));

describe("esports: borradores ocultos", () => {
  let borrador = "";
  let abierto = "";
  let jugador = "";

  beforeAll(async () => {
    dbAvailable = await isDatabaseAvailable();
    if (!dbAvailable) return;
    const sinSesion = async (_c: unknown, seguir: () => Promise<void>) => seguir();
    const ctx = createTestKonContext({
      db: { instance: db } as never,
      auth: { requireAuth: sinSesion, optionalAuth: sinSesion } as never,
    });
    app.route("/api/esports", kon.createRouter!(ctx) as never);
    const s = generateTestId();
    const juego = (await db.execute(
      sql`INSERT INTO games (title, slug, status) VALUES (${`J-${s}`}, ${`j-${s}`.toLowerCase()}, 'published') RETURNING id`
    )) as unknown as { rows: { id: string }[] };
    const gameId = juego.rows[0]!.id;
    const crear = async (status: string) =>
      (await db.insert(tournaments).values({ title: `T-${status}-${s}`, status, gameId, maxParticipants: 8 } as never).returning())[0]!.id;
    borrador = await crear("Draft");
    abierto = await crear("Open");
    jugador = (await db.insert(players).values({ alias: `J-${s}`, coreUserId: crypto.randomUUID() } as never).returning())[0]!
      .id;
  });

  it("las rutas secundarias de un borrador dan 404 a un anónimo", async () => {
    if (!dbAvailable) return;
    for (const ruta of [
      `/matches/tournament/${borrador}`,
      `/tournament/${borrador}/phases`,
      `/tournament/${borrador}/check-in`,
      `/public/tournament/${borrador}/streams`,
    ]) {
      expect((await pedir(ruta)).status, ruta).toBe(404);
    }
  });

  it("las mismas rutas de un torneo abierto no se cortan aquí", async () => {
    if (!dbAvailable) return;
    expect((await pedir(`/matches/tournament/${abierto}`)).status).toBe(200);
  });

  it("la lista de partidos no trae los de un borrador; los jugadores, sin id de cuenta", async () => {
    if (!dbAvailable) return;
    const partidos = (await (await pedir("/matches")).json()) as { tournamentId: string }[];
    expect(partidos.some((p) => p.tournamentId === borrador)).toBe(false);
    const ficha = await pedir(`/players/${jugador}`);
    expect(ficha.status).toBe(200);
    expect(((await ficha.json()) as Record<string, unknown>).coreUserId).toBeUndefined();
  });
});
