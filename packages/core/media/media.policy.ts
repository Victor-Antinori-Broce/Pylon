/**
 * Media — Authorization Policy
 * ============================================================================
 *
 * Deny-by-default. Importar este módulo registra la policy "media".
 *
 * La mediateca es del EQUIPO: sube, ordena y borra quien edita el sitio
 * (`admin`/`editor`). Las rutas solo pedían sesión —y el alta es pública—, así
 * que la única defensa era la regla por prefijo de `auth-guard.ts`; quitarla
 * dejaba a cualquier cuenta subir ficheros al dominio de la API.
 *
 * Los FICHEROS se sirven sin sesión (`/media/*` y las transformaciones), que es
 * lo que pinta la web. Lo que no es público es el CATÁLOGO: el listado, la
 * ficha de cada medio (nombre original, carpeta, metadatos) y las carpetas.
 *
 * La configuración (proveedor de almacenamiento y sus credenciales, prueba de
 * conexión) es de `admin`: puede contener claves de S3/R2, y la prueba de
 * conexión escribe en una ruta del disco o llama a un endpoint arbitrario.
 */
import { definePolicy, type AuthzUser } from "@kitsuden/engine";

const esStaff = (user: AuthzUser | null | undefined): boolean =>
  user?.role === "admin" || user?.role === "editor";

export function registerMediaPolicy(): void {
  definePolicy<unknown>("media", {
    /** Listado, ficha y carpetas. */
    view: (user) => esStaff(user),
    create: (user) => esStaff(user),
    update: (user) => esStaff(user),
    delete: (user) => esStaff(user),
    configure: (user) => user?.role === "admin",
  });
}

registerMediaPolicy();
