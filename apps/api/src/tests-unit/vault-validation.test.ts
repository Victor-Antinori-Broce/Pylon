/**
 * Tests unitarios de KITSUDEN Vault (validaciones puras — NO requiere PostgreSQL).
 * DDL real (createCollection/addColumn) se valida en integración (test:all).
 */
import { describe, it, expect, afterEach } from "bun:test";

import { vaultTableName, isVaultEnabled, VaultError, VAULT_PREFIX } from "../services/vault";

const originalFlag = process.env.KITSUDEN_VAULT_ENABLED;

afterEach(() => {
  if (originalFlag === undefined) delete process.env.KITSUDEN_VAULT_ENABLED;
  else process.env.KITSUDEN_VAULT_ENABLED = originalFlag;
});

describe("Vault — nombres de colección", () => {
  it("acepta snake_case válido y aplica el prefijo vault_", () => {
    expect(vaultTableName("proyectos")).toBe("vault_proyectos");
    expect(vaultTableName("crm_leads_2026")).toBe("vault_crm_leads_2026");
  });

  it("rechaza mayúsculas, guiones, espacios y caracteres SQL", () => {
    expect(() => vaultTableName("Proyectos")).toThrow(VaultError);
    expect(() => vaultTableName("crm-leads")).toThrow(VaultError);
    expect(() => vaultTableName("mi tabla")).toThrow(VaultError);
    expect(() => vaultTableName('x"; DROP TABLE auth_users;--')).toThrow(VaultError);
    expect(() => vaultTableName("")).toThrow(VaultError);
    expect(() => vaultTableName("1numero")).toThrow(VaultError);
  });

  it("rechaza nombres que exceden el largo máximo", () => {
    expect(() => vaultTableName("a".repeat(60))).toThrow(VaultError);
  });

  it("el prefijo garantiza aislamiento del core", () => {
    // Aunque el usuario intente nombrar su colección como una tabla core,
    // el prefijo la aísla: nunca colisiona con auth_users ni modules.
    expect(vaultTableName("auth_users")).toBe(`${VAULT_PREFIX}auth_users`);
    expect(vaultTableName("modules")).toBe(`${VAULT_PREFIX}modules`);
  });
});

describe("Vault — feature flag", () => {
  it("deshabilitado por defecto (decisión disruptiva opt-in, kitsuden.md §3)", () => {
    delete process.env.KITSUDEN_VAULT_ENABLED;
    expect(isVaultEnabled()).toBe(false);
  });

  it("habilitado solo con el valor exacto 'true'", () => {
    process.env.KITSUDEN_VAULT_ENABLED = "true";
    expect(isVaultEnabled()).toBe(true);
    process.env.KITSUDEN_VAULT_ENABLED = "1";
    expect(isVaultEnabled()).toBe(false);
    process.env.KITSUDEN_VAULT_ENABLED = "TRUE";
    expect(isVaultEnabled()).toBe(false);
  });
});

describe("Vault — VaultError", () => {
  it("transporta status HTTP", () => {
    const err = new VaultError(409, "already exists");
    expect(err.status).toBe(409);
    expect(err).toBeInstanceOf(Error);
  });
});
