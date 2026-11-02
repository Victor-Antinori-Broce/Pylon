#!/usr/bin/env bun
/**
 * Aplicar políticas RLS nativas (el Muro de Titanio)
 * ============================================================================
 *
 * Aplica, en orden:
 *   1. src/db/rls-policies.sql      — políticas originales (data_entries…)
 *   2. src/db/rls-owned-tables.sql  — expansión: toda tabla de propiedad
 *                                     PERSONAL, con ENABLE + FORCE
 *
 * Idempotente: se puede correr tras cada migración.
 *
 * REQUISITO para que esto sirva de algo: la app debe conectarse como rol
 * NO-superusuario — Postgres ignora RLS para superusuarios. Ver
 * docs/RLS_SETUP_GUIDE.md.
 *
 * USO:  bun run scripts/apply-rls.ts   (o `bun run db:rls` desde apps/api)
 */

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { aplicarPoliticasRls, comprobarSuperusuario, informarRls, verificarRls } from "./lib/rls";

const here = dirname(fileURLToPath(import.meta.url));

const SQL_FILES = [
  resolve(here, "../src/db/rls-policies.sql"),
  resolve(here, "../src/db/rls-owned-tables.sql"),
  // Núcleo: secretos, credenciales, auditoría y auth_users (2026-10-15)
  resolve(here, "../src/db/rls-solo-sistema.sql"),
];

/**
 * Aplica y verifica. La logica vive en scripts/lib/rls.ts porque el runner de
 * migraciones la usa tambien: RLS tiene que aplicarse en cada despliegue, no
 * cuando alguien se acuerde de ejecutar este script.
 */
async function applyRLSPolicies(): Promise<void> {
  await aplicarPoliticasRls(SQL_FILES);
  informarRls(await verificarRls(), await comprobarSuperusuario());
}

if (import.meta.main) {
  applyRLSPolicies().then(() => process.exit(0));
}

export { applyRLSPolicies };
