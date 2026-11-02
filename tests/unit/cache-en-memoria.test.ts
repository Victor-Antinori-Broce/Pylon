/**
 * La caché en memoria del proceso: el sustituto de Valkey en instancia única
 * (kitsuden2.md B1b). Caduca, tiene tope y entiende los patrones de Valkey.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  memoriaDel,
  memoriaGet,
  memoriaKeys,
  memoriaSet,
  vaciarCacheEnMemoria,
} from "../../apps/api/src/lib/cache-en-memoria";

afterEach(() => {
  vaciarCacheEnMemoria();
  delete process.env.CACHE_MEMORY_MAX_KEYS;
  vi.useRealTimers();
});

describe("cache en memoria", () => {
  it("guarda, devuelve y borra", () => {
    memoriaSet("blog:1", "a", 60);
    expect(memoriaGet("blog:1")).toBe("a");
    memoriaDel("blog:1");
    expect(memoriaGet("blog:1")).toBeNull();
  });

  it("caduca con el TTL", () => {
    vi.useFakeTimers();
    memoriaSet("k", "v", 2);
    vi.advanceTimersByTime(1999);
    expect(memoriaGet("k")).toBe("v");
    vi.advanceTimersByTime(2);
    expect(memoriaGet("k")).toBeNull();
  });

  it("respeta el tope de claves sacando la más antigua", () => {
    process.env.CACHE_MEMORY_MAX_KEYS = "2";
    memoriaSet("a", "1", 60);
    memoriaSet("b", "2", 60);
    memoriaSet("c", "3", 60);
    expect(memoriaGet("a")).toBeNull();
    expect(memoriaGet("b")).toBe("2");
    expect(memoriaGet("c")).toBe("3");
  });

  it("los patrones de Valkey (`*`, `?`) casan como en SCAN MATCH", () => {
    memoriaSet("blog:list:1", "x", 60);
    memoriaSet("blog:post:2", "x", 60);
    memoriaSet("wiki:list:1", "x", 60);
    expect(memoriaKeys("blog:*").sort()).toEqual(["blog:list:1", "blog:post:2"]);
    expect(memoriaKeys("*:list:?")).toHaveLength(2);
    // Los caracteres de regex del patrón son literales.
    memoriaSet("a.b", "x", 60);
    expect(memoriaKeys("a.b")).toEqual(["a.b"]);
    expect(memoriaKeys("a?b")).toEqual(["a.b"]);
  });
});
