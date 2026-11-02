/**
 * Page builder — política de autorización
 * ============================================================================
 *
 * Las escrituras de `/api/page-builder` solo pedían `requireAuth` (cualquier
 * cuenta: el alta es abierta). Lo tapaba la regla por prefijo de
 * `apps/api/src/middleware/auth-guard.ts` (staff, o un agente con
 * `contenido:editar`). Esta política hace que el kon se autorice solo.
 *
 * Mismos permisos que la puerta: equipo (`admin`|`editor`) o un agente con el
 * scope EXACTO `contenido:editar` (el de Inti). El motor añade además, por su
 * cuenta, el scope `page:<acción>` y `admin`.
 */
import { definePolicy, type AuthzUser } from "@kitsuden/engine";

export const SCOPE_CONTENIDO = "contenido:editar";

export function esEquipo(user: AuthzUser | null | undefined): boolean {
  return user?.role === "admin" || user?.role === "editor";
}

/** Equipo, o agente con `contenido:editar` (coincidencia exacta, como la puerta). */
export function editaContenido(user: AuthzUser | null | undefined): boolean {
  return (
    esEquipo(user) ||
    (user?.role === "agent" && Array.isArray(user.scopes) && user.scopes.includes(SCOPE_CONTENIDO))
  );
}

export function registerBlocksPolicy(): void {
  definePolicy("page", {
    /** Borradores, archivadas y páginas con `requireAuth`, sin restricción. */
    viewUnpublished: (u) => editaContenido(u),
    create: (u) => editaContenido(u),
    update: (u) => editaContenido(u),
    delete: (u) => editaContenido(u),
    /** Marcar la portada del sitio: solo el equipo humano. */
    setHomepage: (u) => esEquipo(u),
  });
}

registerBlocksPolicy();
