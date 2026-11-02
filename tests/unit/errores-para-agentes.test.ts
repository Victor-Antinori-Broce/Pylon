/**
 * Un campo mal nombrado no puede perderse en silencio
 * ============================================================================
 *
 * ── LO QUE PASABA ──────────────────────────────────────────────────────────
 *
 * Zod quita por defecto las claves que el esquema no conoce, y la respuesta
 * sale en 200. En este proyecto costó datos: el editor del blog mandaba `tags`,
 * la ruta esperaba `tagIds`, y las etiquetas desaparecían al guardar sin que
 * nada lo dijera.
 *
 * Un humano tarda en verlo. Un agente de IA no lo ve nunca: no puede depurar un
 * silencio, y confundir el nombre de un campo es justo el error que comete un
 * modelo. Kitsuden se vende a quien construye con agentes, así que este es el
 * error que más importa convertir en una frase.
 *
 * ── LO QUE VIGILA ──────────────────────────────────────────────────────────
 *
 * Que `validateRequest` responda 422 con la clave desconocida, la más parecida
 * y las válidas; que no moleste donde los extras son legítimos (query,
 * `passthrough`, registros, campos del servidor); y que deje su esquema en los
 * metadatos de la ruta, que es de donde sale el OpenAPI.
 */

import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  claveParecida,
  readRouteMeta,
  respondError,
  validateRequest,
  validated,
} from "@kitsuden/engine";

type Envelope = {
  error: {
    code: string;
    message: string;
    details?: {
      fields?: Record<string, string[]>;
      unknownKeys?: { path: string; key: string; didYouMean: string | null; validKeys: string[] }[];
      hint?: string;
    };
  };
};

/** Monta una ruta POST con el esquema y devuelve la respuesta al cuerpo dado. */
async function enviar(schema: z.ZodTypeAny, cuerpo: unknown) {
  let llegoAlHandler = false;
  const app = new Hono();
  app.onError((err, c) => respondError(c, err));
  app.post("/x", validateRequest(schema), (c) => {
    llegoAlHandler = true;
    return c.json(validated(c));
  });
  const res = await app.request("/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(cuerpo),
  });
  return { res, llegoAlHandler };
}

describe("un campo desconocido responde 422 y dice cuál es el bueno", () => {
  const Post = z.object({ title: z.string(), tagIds: z.array(z.string()).optional() });

  it("el caso real: `tags` en vez de `tagIds`", async () => {
    const { res, llegoAlHandler } = await enviar(Post, { title: "Hola", tags: ["a"] });

    expect(res.status).toBe(422);
    expect(llegoAlHandler, "un cuerpo con claves de más no puede llegar al handler").toBe(false);

    const cuerpo = (await res.json()) as Envelope;
    expect(cuerpo.error.code).toBe("VALIDATION");

    const desconocida = cuerpo.error.details?.unknownKeys?.[0];
    expect(desconocida).toMatchObject({ key: "tags", didYouMean: "tagIds" });
    expect(desconocida?.validKeys).toEqual(["title", "tagIds"]);

    // Y en `fields`, en una frase que se puede leer tal cual.
    expect(cuerpo.error.details?.fields?.tags?.[0]).toContain("¿Quisiste decir «tagIds»?");
    expect(cuerpo.error.details?.hint).toMatch(/en vez de ignorarlos/);
  });

  it("dentro de un objeto anidado dice la ruta completa", async () => {
    const Tema = z.object({ theme: z.object({ accent: z.string() }).optional() });
    const { res } = await enviar(Tema, { theme: { acent: "#fff" } });

    expect(res.status).toBe(422);
    const cuerpo = (await res.json()) as Envelope;
    expect(cuerpo.error.details?.unknownKeys?.[0]).toMatchObject({
      path: "theme",
      key: "acent",
      didYouMean: "accent",
    });
    expect(cuerpo.error.details?.fields?.["theme.acent"]).toBeDefined();
  });

  it("dentro de una lista dice qué elemento", async () => {
    const Items = z.object({
      items: z.array(z.object({ label: z.string(), imageUrl: z.string() })),
    });
    const { res } = await enviar(Items, { items: [{ label: "Aria", imgUrl: "x" }] });

    expect(res.status).toBe(422);
    const cuerpo = (await res.json()) as Envelope;
    expect(cuerpo.error.details?.unknownKeys?.[0]).toMatchObject({
      path: "items.0",
      key: "imgUrl",
      didYouMean: "imageUrl",
    });
  });

  it("la convención equivocada se reconoce: `tag_ids` → `tagIds`", () => {
    expect(claveParecida("tag_ids", ["title", "tagIds"])).toBe("tagIds");
    expect(claveParecida("TITLE", ["title"])).toBe("title");
  });

  it("si nada se parece, no se inventa una sugerencia", async () => {
    /**
     * Una sugerencia equivocada es peor que ninguna: el agente la seguiría y
     * acabaría mandando un campo válido con el dato de otro.
     */
    const { res } = await enviar(Post, { title: "Hola", zzqx: 1 });
    const cuerpo = (await res.json()) as Envelope;
    expect(cuerpo.error.details?.unknownKeys?.[0]?.didYouMean).toBeNull();
    expect(claveParecida("name", ["title", "tagIds"])).toBeNull();
  });

  it("un tipo mal y un campo desconocido se cuentan juntos", async () => {
    // Arreglar de uno en uno cuesta una ida y vuelta por error.
    const { res } = await enviar(Post, { title: 42, tags: ["a"] });
    const cuerpo = (await res.json()) as Envelope;
    expect(Object.keys(cuerpo.error.details?.fields ?? {}).sort()).toEqual(["tags", "title"]);
  });
});

describe("donde las claves extra son legítimas, no se rechazan", () => {
  it("`id`, `createdAt` y `updatedAt` se ignoran y se avisa", async () => {
    /**
     * Leer un objeto y devolverlo entero al actualizar es el patrón más común
     * de un cliente. Rechazarlo por traer campos que el servidor gestiona no
     * protegería nada y rompería ese patrón.
     */
    const { res, llegoAlHandler } = await enviar(z.object({ title: z.string() }), {
      id: "abc",
      title: "Hola",
      createdAt: "2026-01-01",
    });
    expect(res.status).toBe(200);
    expect(llegoAlHandler).toBe(true);
    expect(res.headers.get("X-Kitsuden-Ignored-Fields")).toBe("id, createdAt");
  });

  it("un esquema `passthrough` acepta lo que quiera", async () => {
    const { res } = await enviar(z.object({ a: z.string() }).passthrough(), { a: "1", b: 2 });
    expect(res.status).toBe(200);
  });

  it("un registro libre acepta cualquier clave", async () => {
    // Es la forma de los lados de Broadcast: la valida el perfil de juego, no la ruta.
    const { res } = await enviar(z.object({ sideA: z.record(z.string(), z.unknown()) }), {
      sideA: { name: "Aria", loQueSea: true },
    });
    expect(res.status).toBe(200);
  });

  it("en una unión basta con encajar limpio en una opción", async () => {
    const U = z.union([z.object({ a: z.number() }), z.object({ b: z.number() })]);
    expect((await enviar(U, { b: 1 })).res.status).toBe(200);
    expect((await enviar(U, { c: 1 })).res.status).toBe(422);
  });

  it("en la query se toleran parámetros de más", async () => {
    // `?utm_source=` o un anti-caché son normales en un enlace.
    const app = new Hono();
    app.onError((err, c) => respondError(c, err));
    app.get("/x", validateRequest(z.object({ page: z.coerce.number() }), "query"), (c) =>
      c.json(validated(c, "query"))
    );
    const res = await app.request("/x?page=2&utm_source=discord");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ page: 2 });
  });
});

describe("la ruta se describe sola", () => {
  const Cuerpo = z.object({ winnerId: z.string() });

  it("`validateRequest` deja su esquema y su objetivo", () => {
    const meta = readRouteMeta(validateRequest(Cuerpo));
    expect(meta?.validation?.[0]?.target).toBe("json");
    expect(meta?.validation?.[0]?.schema).toBe(Cuerpo);
  });

  it("se ve incluso a través del envoltorio de un sub-router con su propio onError", () => {
    /**
     * Hono envuelve el handler al montar un sub-router que tiene `onError`, y
     * guarda el original aparte. Sin atravesar ese envoltorio, las rutas de
     * esos routers saldrían en el OpenAPI sin cuerpo.
     */
    const sub = new Hono();
    sub.onError((err, c) => respondError(c, err));
    sub.post("/report", validateRequest(Cuerpo), (c) => c.json({}));

    const padre = new Hono();
    padre.route("/matches", sub);

    const ruta = padre.routes.filter((r) => r.method === "POST" && r.path === "/matches/report");
    expect(ruta.length, "la ruta del sub-router tiene que aparecer en el padre").toBeGreaterThan(0);

    const conEsquema = ruta.map((r) => readRouteMeta(r.handler)).find((m) => m?.validation?.length);
    expect(conEsquema?.validation?.[0]?.schema).toBe(Cuerpo);
  });
});
