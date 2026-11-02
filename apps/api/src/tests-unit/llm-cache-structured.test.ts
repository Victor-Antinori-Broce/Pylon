/**
 * LLM — caché semántica y salida estructurada
 * ============================================================================
 * Todo en memoria: sin Valkey, sin red, sin API keys. Los proveedores se
 * inyectan como fakes deterministas.
 */

import {
  SemanticCache,
  llmMemoryStore,
  extractJson,
  generateStructured,
  type LLMEmbeddingProvider,
  type StructuredProvider,
} from "@kitsuden/engine";
import { describe, expect, test, beforeEach } from "bun:test";
import { z } from "zod";

/**
 * Embeddings deterministas por bolsa de palabras: dos frases con las mismas
 * palabras dan vectores idénticos (similitud 1), y frases distintas dan
 * similitud baja. Suficiente para probar la lógica de la caché sin red.
 */
const bagOfWords: LLMEmbeddingProvider = {
  async embed(text: string) {
    const vec = new Array(26).fill(0);
    for (const word of text.toLowerCase().split(/\W+/).filter(Boolean)) {
      for (const ch of word) {
        const i = ch.charCodeAt(0) - 97;
        if (i >= 0 && i < 26) vec[i] += 1;
      }
    }
    return vec;
  },
};

const RESPONSE = {
  content: "Un kon se crea con kitsuden create-kon",
  model: "test",
  tokensIn: 120,
  tokensOut: 40,
};

describe("caché semántica", () => {
  let cache: SemanticCache;

  beforeEach(() => {
    cache = new SemanticCache({ store: llmMemoryStore(), embeddings: bagOfWords, threshold: 0.9 });
  });

  test("miss cuando está vacía", async () => {
    expect(await cache.lookup("agent-1", "¿cómo hago un kon?")).toBeNull();
    expect(cache.getStats().misses).toBe(1);
  });

  test("acierto EXACTO con la misma consulta", async () => {
    await cache.store_("agent-1", "¿cómo hago un kon?", RESPONSE);
    const hit = await cache.lookup("agent-1", "¿cómo hago un kon?");

    expect(hit).not.toBeNull();
    expect(hit!.hit).toBe("exact");
    expect(hit!.content).toBe(RESPONSE.content);
    expect(hit!.similarity).toBe(1);
  });

  test("acierto SEMÁNTICO con la consulta reformulada (lo que la caché exacta pierde)", async () => {
    await cache.store_("agent-1", "como hago un kon", RESPONSE);

    // Mismas palabras, distinto orden: la caché exacta fallaría.
    const hit = await cache.lookup("agent-1", "hago un kon como");
    expect(hit).not.toBeNull();
    expect(hit!.hit).toBe("semantic");
    expect(hit!.similarity).toBeGreaterThanOrEqual(0.9);
    expect(hit!.content).toBe(RESPONSE.content);
  });

  test("NO acierta con una consulta realmente distinta", async () => {
    await cache.store_("agent-1", "como hago un kon", RESPONSE);
    expect(await cache.lookup("agent-1", "zzzz")).toBeNull();
  });

  test("los scopes están AISLADOS (no se filtran respuestas entre tenants)", async () => {
    await cache.store_("tenant-a", "consulta compartida", RESPONSE);

    expect(await cache.lookup("tenant-a", "consulta compartida")).not.toBeNull();
    expect(await cache.lookup("tenant-b", "consulta compartida")).toBeNull();
  });

  test("sin proveedor de embeddings degrada a caché exacta (no lanza)", async () => {
    const exact = new SemanticCache({ store: llmMemoryStore() });
    await exact.store_("a", "hola mundo", RESPONSE);

    expect((await exact.lookup("a", "hola mundo"))!.hit).toBe("exact");
    expect(await exact.lookup("a", "mundo hola")).toBeNull(); // sin semántica
  });

  test("un store roto NO rompe la petición", async () => {
    const broken = new SemanticCache({
      store: {
        async get() {
          throw new Error("Valkey caído");
        },
        async set() {
          throw new Error("Valkey caído");
        },
        async keys() {
          throw new Error("Valkey caído");
        },
        async del() {
          throw new Error("Valkey caído");
        },
      },
    });

    expect(await broken.lookup("a", "x")).toBeNull(); // miss, no excepción
    await broken.store_("a", "x", RESPONSE); // tampoco lanza
  });

  test("stats: hitRate y tokens ahorrados", async () => {
    await cache.store_("a", "pregunta uno", RESPONSE);
    await cache.lookup("a", "pregunta uno"); // exacto
    await cache.lookup("a", "zzzz"); // miss

    const stats = cache.getStats();
    expect(stats.exactHits).toBe(1);
    expect(stats.misses).toBe(1);
    expect(stats.hitRate).toBe(0.5);
    expect(stats.tokensSaved).toBe(RESPONSE.tokensIn);
  });

  test("invalidate limpia el scope", async () => {
    await cache.store_("a", "una", RESPONSE);
    await cache.store_("a", "otra", RESPONSE);

    const removed = await cache.invalidate("a");
    expect(removed).toBeGreaterThan(0);
    expect(await cache.lookup("a", "una")).toBeNull();
  });

  test("umbral alto evita falsos positivos (respuesta incorrecta > coste de otra llamada)", async () => {
    const strict = new SemanticCache({
      store: llmMemoryStore(),
      embeddings: bagOfWords,
      threshold: 0.999,
    });
    await strict.store_("a", "abc def", RESPONSE);
    expect(await strict.lookup("a", "abc xyz")).toBeNull();
  });
});

describe("extractJson", () => {
  test("JSON directo", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  test("dentro de un bloque de código (lo más común)", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('```\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  test("con prosa alrededor", () => {
    expect(extractJson('Claro, aquí tienes:\n{"a":1}\nEspero que sirva.')).toEqual({ a: 1 });
  });

  test("respeta llaves dentro de strings", () => {
    expect(extractJson('{"texto":"esto tiene } dentro"}')).toEqual({
      texto: "esto tiene } dentro",
    });
  });

  test("arrays", () => {
    expect(extractJson("El resultado: [1,2,3]")).toEqual([1, 2, 3]);
  });

  test("lanza si no hay JSON", () => {
    expect(() => extractJson("no hay nada aquí")).toThrow(/no contiene JSON/);
  });
});

describe("generateStructured", () => {
  const Person = z.object({ name: z.string(), age: z.number().int().positive() });

  /** Proveedor fake que devuelve respuestas guionizadas, una por intento. */
  function scripted(responses: string[], mode: "json_schema" | "prompt" = "json_schema") {
    let i = 0;
    const calls: any[] = [];
    const provider: StructuredProvider = {
      name: "fake",
      structuredMode: mode,
      async complete(req) {
        calls.push(req);
        return { text: responses[Math.min(i++, responses.length - 1)], tokensIn: 10, tokensOut: 5 };
      },
    };
    return { provider, calls };
  }

  test("acierta a la primera", async () => {
    const { provider } = scripted(['{"name":"Ada","age":36}']);
    const r = await generateStructured(provider, {
      messages: [{ role: "user", content: "Extrae los datos" }],
      schema: Person,
    });

    expect(r.ok).toBe(true);
    expect(r.data).toEqual({ name: "Ada", age: 36 });
    expect(r.attempts).toBe(1);
  });

  test("REINTENTA con el error de validación y acierta después", async () => {
    const { provider, calls } = scripted([
      '{"name":"Ada","age":"treinta y seis"}', // age no es número
      '{"name":"Ada","age":36}',
    ]);

    const r = await generateStructured(provider, {
      messages: [{ role: "user", content: "Extrae" }],
      schema: Person,
    });

    expect(r.ok).toBe(true);
    expect(r.attempts).toBe(2);
    // Al modelo se le devolvió QUÉ campo falló — eso es lo que sube el acierto.
    const followUp = calls[1].messages.map((m: any) => m.content).join("\n");
    expect(followUp).toContain("age");
  });

  test("recupera JSON envuelto en bloque de código", async () => {
    const { provider } = scripted(['```json\n{"name":"Ada","age":36}\n```']);
    const r = await generateStructured(provider, {
      messages: [{ role: "user", content: "x" }],
      schema: Person,
    });
    expect(r.ok).toBe(true);
  });

  test("falla explícitamente tras agotar reintentos (no devuelve datos a medias)", async () => {
    const { provider } = scripted(['{"name":"Ada"}']); // siempre falta age
    const r = await generateStructured(
      provider,
      { messages: [{ role: "user", content: "x" }], schema: Person },
      { maxRetries: 1 }
    );

    expect(r.ok).toBe(false);
    expect(r.data).toBeUndefined();
    expect(r.attempts).toBe(2);
    expect(r.error).toContain("age");
    expect(r.raw).toBeDefined(); // queda el crudo para diagnóstico
  });

  test("acumula tokens de todos los intentos", async () => {
    const { provider } = scripted(['{"bad":1}', '{"name":"Ada","age":36}']);
    const r = await generateStructured(provider, {
      messages: [{ role: "user", content: "x" }],
      schema: Person,
    });
    expect(r.tokensIn).toBe(20); // 2 intentos × 10
    expect(r.tokensOut).toBe(10);
  });

  test("modo 'prompt' inyecta el schema como instrucción de sistema", async () => {
    const { provider, calls } = scripted(['{"name":"Ada","age":36}'], "prompt");
    await generateStructured(provider, {
      messages: [{ role: "user", content: "x" }],
      schema: Person,
    });

    const system = calls[0].messages.find((m: any) => m.role === "system");
    expect(system.content).toContain("JSON Schema");
  });

  test("texto basura falla limpio, sin lanzar", async () => {
    const { provider } = scripted(["lo siento, no puedo"]);
    const r = await generateStructured(
      provider,
      { messages: [{ role: "user", content: "x" }], schema: Person },
      { maxRetries: 0 }
    );
    expect(r.ok).toBe(false);
    expect(r.error).toBeDefined();
  });
});
