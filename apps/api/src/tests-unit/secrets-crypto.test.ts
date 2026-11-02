/**
 * Tests unitarios del Secrets Manager (crypto puro — NO requiere PostgreSQL).
 * Las funciones de CRUD/hot-injection se validan en integración (test:all).
 */
import { describe, it, expect, beforeAll } from "bun:test";

// La clave maestra debe existir ANTES de la primera llamada de cifrado
beforeAll(() => {
  process.env.KITSUDEN_SECRETS_KEY = "kitsuden-test-master-key-for-unit-tests-32ch";
});

import { encryptSecret, decryptSecret, isValidSecretKey } from "../services/secrets";

describe("Secrets Manager — AES-256-GCM", () => {
  it("roundtrip encrypt → decrypt", () => {
    const enc = encryptSecret("sk-super-secreto-123");
    expect(decryptSecret(enc)).toBe("sk-super-secreto-123");
  });

  it("cada cifrado usa IV único (mismo plaintext ≠ mismo ciphertext)", () => {
    const a = encryptSecret("mismo-valor");
    const b = encryptSecret("mismo-valor");
    expect(a.iv).not.toBe(b.iv);
    expect(a.valueEncrypted).not.toBe(b.valueEncrypted);
    expect(decryptSecret(a)).toBe(decryptSecret(b));
  });

  it("detecta manipulación del ciphertext (auth tag GCM)", () => {
    const enc = encryptSecret("valor-original");
    const tampered = {
      ...enc,
      valueEncrypted: (enc.valueEncrypted[0] === "a" ? "b" : "a") + enc.valueEncrypted.slice(1),
    };
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("detecta manipulación del auth tag", () => {
    const enc = encryptSecret("valor-original");
    const tampered = {
      ...enc,
      authTag: (enc.authTag[0] === "0" ? "1" : "0") + enc.authTag.slice(1),
    };
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("soporta valores unicode y multilinea", () => {
    const value = "línea1\nlínea2 🔑 ñandú\ttab";
    expect(decryptSecret(encryptSecret(value))).toBe(value);
  });

  it("soporta valores largos (10KB)", () => {
    const value = "x".repeat(10_000);
    expect(decryptSecret(encryptSecret(value))).toBe(value);
  });
});

describe("Secrets Manager — validación de keys", () => {
  it("acepta UPPER_SNAKE_CASE", () => {
    expect(isValidSecretKey("OPENAI_API_KEY")).toBe(true);
    expect(isValidSecretKey("STRIPE_SECRET_KEY")).toBe(true);
    // Reservadas (auditoría 2026-10-25): cambian cómo arranca o se protege el proceso
    for (const k of ["KITSUDEN_SECRETS_KEY", "PATH", "NODE_OPTIONS", "NODE_ENV", "LD_PRELOAD", "BETTER_AUTH_SECRET", "PGPASSWORD", "DATABASE_URL"]) {
      expect(isValidSecretKey(k), k).toBe(false);
    }
    expect(isValidSecretKey("S3_ACCESS_KEY_2")).toBe(true);
  });

  it("rechaza formatos inválidos", () => {
    expect(isValidSecretKey("openai_api_key")).toBe(false); // minúsculas
    expect(isValidSecretKey("OPENAI-API-KEY")).toBe(false); // guiones
    expect(isValidSecretKey("2FA_TOKEN")).toBe(false); // empieza con número
    expect(isValidSecretKey("KEY WITH SPACE")).toBe(false);
    expect(isValidSecretKey("K")).toBe(false); // muy corta
    expect(isValidSecretKey("DROP TABLE;--")).toBe(false); // injection attempt
  });
});
