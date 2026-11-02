/**
 * Versiones de CONTRATO de la API pública de Kitsuden
 * ============================================================================
 *
 * La versión de Kitsuden (`0.9.0-beta`, la de `apps/api/package.json`) dice
 * qué código corre. No dice si un cliente ajeno —Inti con
 * `@intijs/adapter-kitsuden`, un panel alternativo, un script— sigue
 * entendiendo lo que responde: dos versiones de Kitsuden pueden hablar el
 * mismo contrato, y una sola versión menor puede romperlo.
 *
 * Por eso cada superficie que consume alguien de fuera lleva su propio número
 * ENTERO (una versión «mayor»), que `GET /api/version` publica tal cual:
 *
 *   page-builder     /api/page-builder/pages, /pages/:id, /block-types y las
 *                    escrituras de bloques (POST/PATCH/DELETE, reorder,
 *                    duplicate)
 *   games            lectura de fichas: GET /api/games/slug/:slug y /:id
 *                    (sobre todo `blocks[]`: id, type, order, data, editorial)
 *   games-editorial  PATCH /api/games/:id/bloques/:bloqueId/editorial y
 *                    PUT /api/games/:id/bloques/orden
 *   admin-registry   GET /api/admin/registry (ver admin-registry-contract.ts)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Cuándo se sube un número (política completa: docs/instalacion/versiones.md)
 *
 * NO lo sube (compatible):
 *   - añadir un campo a una respuesta
 *   - añadir una ruta nueva, o un parámetro opcional a una existente
 *   - añadir un tipo de bloque a `/block-types`
 *   - aceptar más formas de entrada de las que se aceptaban
 *
 * SÍ lo sube (incompatible):
 *   - quitar o renombrar un campo de una respuesta o de un cuerpo
 *   - cambiar su tipo o su significado (p. ej. `sortOrder` deja de ser número,
 *     `order` pasa a contarse desde 1, `editorial.oculto` cambia de sentido)
 *   - volver obligatorio algo que era opcional en una petición
 *   - cambiar el envoltorio (`{ blockTypes: [...] }` → array suelto)
 *   - quitar o mover una ruta, o cambiar el código de estado de un caso
 *     documentado (404 ↔ 403, 200 ↔ 201)
 *   - exigir un permiso/scope distinto para lo que ya se podía hacer
 *
 * Al subir uno: cambiar AQUÍ el número, regenerar las respuestas de
 * referencia (`contratos/inti/respuestas-de-referencia.json`) y anotarlo en
 * la matriz de compatibilidad de docs/instalacion/versiones.md.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { ADMIN_REGISTRY_VERSION } from "./admin-registry-contract";
import { VERSION_SDK_DE_KONS } from "./operaciones";

/**
 * Versión semver de Kitsuden (la API). Tiene que coincidir con `version` de
 * `apps/api/package.json` y del `package.json` raíz: lo vigila
 * `tests/unit/contrato-inti.test.ts`. Vive aquí y no se lee del package.json
 * porque la API se empaqueta con `bun build` y su tsconfig no resuelve JSON.
 */
export const VERSION_DE_KITSUDEN = "0.9.0-beta";

export const CONTRATOS = {
  "page-builder": 1,
  games: 1,
  "games-editorial": 1,
  "admin-registry": ADMIN_REGISTRY_VERSION,
} as const;

export type NombreDeContrato = keyof typeof CONTRATOS;

/**
 * Versiones de los contratos de CÓDIGO (no de HTTP): lo que un kon de terceros
 * necesita saber para declararse compatible. Mismo criterio que `CONTRATOS`
 * (entero, sube solo si se rompe algo), pero en su propio campo de
 * `GET /api/version` (`sdk`): un cliente HTTP como Inti no depende de ellos.
 *
 *   kons   el SDK de operaciones (`operaciones.ts`, docs/kons/README.md).
 *          Un kon lo declara con `sdk: 1` (en su definición o en kon.json);
 *          el cargador se niega a montar uno que pida una versión mayor.
 */
export const SDKS = {
  kons: VERSION_SDK_DE_KONS,
} as const;

/** Lo que responde `GET /api/version` */
export interface RespuestaDeVersion {
  /** Nombre del producto: siempre "kitsuden" (permite reconocer la API) */
  producto: "kitsuden";
  /** Versión semver de la API (la de `apps/api/package.json`) */
  version: string;
  /** Versión mayor de cada contrato público */
  contratos: Record<string, number>;
  /** Versión de cada contrato de código (`SDKS`): el SDK de kons. */
  sdk?: Record<string, number>;
}
