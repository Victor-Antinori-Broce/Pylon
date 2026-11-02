/**
 * El actor EFECTIVO: una regla, dos idiomas (TypeScript y SQL), y las dos dicen lo mismo
 * ============================================================================
 *
 * Arreglos de la fase D (2026-10-25). Los kons reconocían a los agentes cada
 * uno a su manera (conta y ecommerce con su copia en plpgsql, blog y builder
 * en TypeScript) o no los reconocían (dms, members, booking, newsletter: un
 * agente `admin` veía listas vacías o 403). La regla vive ahora UNA vez:
 *
 *   packages/engine/src/actor-efectivo.ts         esAdminEfectivo, esStaffEfectivo,
 *                                                 agentePuede, agentePuedeEnKon
 *   apps/api/src/db/funciones-de-agente.sql       kitsuden_admin_efectivo, …
 *
 * Aquí se comparan las dos con la misma tabla en Postgres de verdad (PGlite),
 * se exige que las funciones copiadas de rls-policies.sql sigan idénticas, que
 * `can()` respete una denegación aunque la regla del kon diga que sí, y que
 * los dos caminos de migración apliquen el fichero antes de los kons.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { abreKonEntero } from "../../packages/shared/src/permisos-de-agente";
import {
  agentePuede,
  agentePuedeEnKon,
  esAdminEfectivo,
  esStaffEfectivo,
} from "../../packages/engine/src/actor-efectivo";
import { can, definePolicy } from "../../packages/engine/src/authz";

const DB = resolve(__dirname, "../../apps/api/src/db");
const FUNCIONES = readFileSync(resolve(DB, "funciones-de-agente.sql"), "utf8");

type Caso = { rol: string; scopes: string[] };

const CASOS: Caso[] = [
  { rol: "admin", scopes: [] },
  { rol: "editor", scopes: [] },
  { rol: "user", scopes: [] },
  { rol: "anonymous", scopes: [] },
  { rol: "agent", scopes: ["admin"] },
  { rol: "agent", scopes: ["admin:*"] },
  { rol: "agent", scopes: ["crm:*"] },
  { rol: "agent", scopes: ["kon:crm:*"] },
  { rol: "agent", scopes: ["kon:*"] },
  { rol: "agent", scopes: ["crm:view"] },
  { rol: "agent", scopes: ["crm:*", "!crm:*"] },
  { rol: "agent", scopes: ["admin", "!kon:crm:*"] },
  { rol: "agent", scopes: ["admin", "!kon:*"] },
  { rol: "agent", scopes: ["crm:*", "!crm:delete"] },
  { rol: "agent", scopes: ["mcp:connect"] },
  { rol: "agent", scopes: ["members:*"] },
  { rol: "agent", scopes: ["member:view"] },
  { rol: "agent", scopes: ["member:*", "!members:*"] },
  { rol: "agent", scopes: ["admin", "!member:view"] },
  { rol: "agent", scopes: ["*:view"] },
  { rol: "agent", scopes: ["conta:ver", "conta:escribir"] },
];

const KONS = ["crm", "members", "conta"];
const PEDIDOS = ["crm:view", "crm:delete", "member:view", "conta:ver", "conta:administrar"];

let pg: PGlite;

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(FUNCIONES);
});
afterAll(async () => pg?.close());

async function sqlCon<T>(c: Caso, consulta: string, params: unknown[]): Promise<T> {
  return pg.transaction(async (tx) => {
    await tx.query(
      "select set_config('app.current_user_id', 'x1', true), set_config('app.current_user_role', $1, true), set_config('app.agent_scopes', $2, true)",
      [c.rol, c.rol === "agent" ? c.scopes.join(",") : ""]
    );
    return (await tx.query<{ r: T }>(consulta, params)).rows[0]!.r;
  });
}

const usuario = (c: Caso) =>
  c.rol === "anonymous" ? null : { id: "x1", role: c.rol, ...(c.rol === "agent" ? { scopes: c.scopes } : {}) };

describe("TypeScript y SQL dicen lo mismo", () => {
  for (const c of CASOS) {
    const nombre = `${c.rol} ${JSON.stringify(c.scopes)}`;
    it(nombre, async () => {
      for (const kon of KONS) {
        expect(await sqlCon(c, "select kitsuden_admin_efectivo($1) as r", [kon]), `admin ${kon}`).toBe(
          esAdminEfectivo(usuario(c), kon)
        );
        expect(await sqlCon(c, "select kitsuden_staff_efectivo($1) as r", [kon]), `staff ${kon}`).toBe(
          esStaffEfectivo(usuario(c), kon)
        );
        expect(await sqlCon(c, "select kitsuden_agente_abre_kon($1) as r", [kon]), `abre ${kon}`).toBe(
          c.rol === "agent" && abreKonEntero(c.scopes, kon)
        );
        for (const p of PEDIDOS) {
          expect(
            await sqlCon(c, "select kitsuden_agente_puede_en_kon($1, $2) as r", [kon, p]),
            `puede_en_kon ${kon} ${p}`
          ).toBe(agentePuedeEnKon(usuario(c), kon, p));
        }
      }
      for (const p of PEDIDOS) {
        expect(await sqlCon(c, "select kitsuden_agente_puede($1) as r", [p]), `puede ${p}`).toBe(
          agentePuede(usuario(c), p)
        );
      }
    });
  }
});

describe("lo que se prometió", () => {
  it("`<kon>:*` es admin de SU kon y de ningún otro; `kon:*` no lo es de ninguno", () => {
    const ag = (...scopes: string[]) => ({ id: "a", role: "agent", scopes });
    expect(esAdminEfectivo(ag("crm:*"), "crm")).toBe(true);
    expect(esAdminEfectivo(ag("crm:*"), "dms")).toBe(false);
    expect(esAdminEfectivo(ag("crm:*"))).toBe(false);
    expect(esAdminEfectivo(ag("kon:*"), "crm")).toBe(false);
    expect(esAdminEfectivo(ag("admin"))).toBe(true);
    expect(esStaffEfectivo({ id: "e", role: "editor" }, "crm")).toBe(true);
    expect(esAdminEfectivo({ id: "e", role: "editor" }, "crm")).toBe(false);
    // Un humano con scopes inventados no gana nada por ellos.
    expect(esAdminEfectivo({ id: "u", role: "user", scopes: ["admin"] } as never, "crm")).toBe(false);
  });

  it("`can()`: una denegación gana aunque la regla del kon diga que sí", async () => {
    definePolicy("prueba-ae", { delete: (u) => esAdminEfectivo(u, "prueba-ae") });
    const ag = (...scopes: string[]) => ({ id: "a", role: "agent", scopes });
    expect(await can(ag("prueba-ae:*"), "delete", {}, "prueba-ae")).toBe(true);
    expect(await can(ag("prueba-ae:*", "!prueba-ae:delete"), "delete", {}, "prueba-ae")).toBe(false);
    expect(await can({ id: "h", role: "admin" }, "delete", {}, "prueba-ae")).toBe(true);
    // Aunque la regla diga que sí a todo el mundo: la clave lo tiene negado.
    definePolicy("prueba-ae-abierta", { ver: () => true });
    expect(await can(ag("mcp:connect"), "ver", {}, "prueba-ae-abierta")).toBe(true);
    expect(await can(ag("!prueba-ae-abierta:ver"), "ver", {}, "prueba-ae-abierta")).toBe(false);
  });

  it("las tres funciones copiadas de rls-policies.sql siguen idénticas", () => {
    const norm = (s: string) => s.replace(/\r\n/g, "\n");
    const rls = norm(readFileSync(resolve(DB, "rls-policies.sql"), "utf8"));
    const nuestras = norm(FUNCIONES);
    for (const f of ["kitsuden_patron_cubre", "kitsuden_agente_concede", "kitsuden_agente_denegado"]) {
      const trozo = (t: string) => {
        const i = t.indexOf(`CREATE OR REPLACE FUNCTION ${f}(`);
        expect(i, f).toBeGreaterThan(-1);
        return t.slice(i, t.indexOf("\n$FN$;", i));
      };
      expect(trozo(nuestras), f).toBe(trozo(rls));
    }
  });

  it("los dos caminos de migración aplican el fichero antes de las migraciones de los kons", () => {
    const migrate = readFileSync(resolve(__dirname, "../../apps/api/scripts/migrate.ts"), "utf8");
    expect(migrate).toContain('resolve(here, "../src/db/funciones-de-agente.sql")');
    expect(migrate.indexOf("await aplicarPoliticasRls([FUNCIONES_DE_AGENTE]);")).toBeLessThan(
      migrate.indexOf("const ms = await aplicar(f);")
    );
    const enCaliente = readFileSync(resolve(__dirname, "../../apps/api/src/lib/migraciones-kon.ts"), "utf8");
    expect(enCaliente.indexOf("readSqlFile(FUNCIONES_DE_AGENTE")).toBeGreaterThan(-1);
    expect(enCaliente.indexOf("readSqlFile(FUNCIONES_DE_AGENTE")).toBeLessThan(
      enCaliente.indexOf("for (const [i, stmt] of f.statements.entries())")
    );
  });
});
