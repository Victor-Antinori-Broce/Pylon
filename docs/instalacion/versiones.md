# Versiones y compatibilidad (Kitsuden ↔ Inti)

Kitsuden y los paquetes de Inti (`@intijs/*`) viven en repositorios distintos
y ninguno está publicado en npm (Inti se instala desde git con un commit fijo).
Cada uno lleva su versión semver, y entre ellos manda otra cosa: la **versión
de contrato** de cada superficie de la API que consume alguien de fuera.

## `GET /api/version`

Pública, sin sesión, sin datos de despliegue:

```json
{
  "producto": "kitsuden",
  "version": "0.9.0-beta",
  "contratos": { "page-builder": 1, "games": 1, "games-editorial": 1, "admin-registry": 1 }
}
```

- `version`: semver de la API (`VERSION_DE_KITSUDEN` en
  `packages/shared/src/contratos.ts`; un test exige que coincida con
  `apps/api/package.json` y el `package.json` raíz).
- `contratos`: versión **mayor** (entero) de cada contrato, de `CONTRATOS` en
  el mismo fichero. Solo aparecen los contratos que esa instalación **sirve**:
  con `kon-blocks` apagado no sale `page-builder`, y con `kon-games` apagado no
  salen `games` ni `games-editorial` (el mapa contrato → kon es `KON_DE_CONTRATO`
  en `apps/api/src/routes/version.ts`; el adaptador de Inti tiene una copia
  para decir qué kon activar). Ruta: `apps/api/src/routes/version.ts`, montada en
  `index.ts` con `app.route("/api/version", versionRoutes)`.

| Contrato          | Rutas                                                                                                                                                                                                     | Consumidor                 |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `page-builder`    | `GET /api/page-builder/pages`, `/pages/:id` (uuid o slug), `/block-types`; `POST /pages/:pageId/blocks`, `PATCH`/`DELETE /blocks/:id`, `POST /pages/:pageId/blocks/reorder`, `POST /blocks/:id/duplicate` | `@intijs/adapter-kitsuden` |
| `games`           | `GET /api/games/slug/:slug`, `GET /api/games/:id` (en especial `blocks[]`: `id`, `type`, `order`, `data`, `editorial`)                                                                                    | adaptador, webs            |
| `games-editorial` | `PATCH /api/games/:id/bloques/:bloqueId/editorial`, `PUT /api/games/:id/bloques/orden`                                                                                                                    | adaptador                  |
| `admin-registry`  | `GET /api/admin/registry` (cabecera `X-Kitsuden-Contract`)                                                                                                                                                | paneles alternativos       |

## Política

### API de Kitsuden (semver)

- **patch** (`0.9.1`): correcciones sin cambios de contrato.
- **minor** (`0.10.0`): funciones nuevas; los contratos solo crecen de forma
  compatible. Mientras Kitsuden esté en `0.x`, un _minor_ **puede** subir un
  contrato (semver permite romper en 0.x), y entonces lo dice en las notas.
- **major** (`1.0.0` → `2.0.0`): cuando sube cualquier contrato a partir de 1.0.

### Qué es un cambio incompatible de contrato

Sube el número del contrato (en `CONTRATOS`):

- quitar o renombrar un campo de una respuesta o de un cuerpo de petición;
- cambiar su tipo o su **significado** (que `sortOrder` deje de ser número,
  que `order` empiece en 1, que `editorial.oculto` cambie de sentido);
- volver obligatorio algo que era opcional en una petición;
- cambiar el envoltorio de una respuesta (`{ "blockTypes": [...] }` → array);
- quitar o mover una ruta, o cambiar el código de un caso documentado
  (404 ↔ 403, 200 ↔ 201);
- exigir otro permiso o scope para lo que ya se podía hacer.

**No** lo sube (compatible): añadir campos a una respuesta, rutas nuevas,
parámetros opcionales, tipos de bloque nuevos en `/block-types`, aceptar más
formas de entrada. Un cliente debe ignorar lo que no conoce.

Un contrato **nuevo** aparece en `contratos`; uno **retirado** deja de
aparecer (y el cliente que lo necesite debe tratarlo como incompatible).

### `@intijs/*` (semver)

- `@intijs/adapter-kitsuden` declara qué versiones entiende de cada contrato
  (`CONTRATOS_ADMITIDOS`, `[mínima, máxima]`). Admitir una versión nueva
  **además** de las anteriores es _minor_; dejar de admitir una es _major_.
- En `0.x`, un _minor_ puede romper (y lo dice el changelog).
- `@intijs/core` sigue su propio semver; su relación con Kitsuden pasa siempre
  por el adaptador.

### Qué hace el adaptador con todo esto

Perezoso: construir el adaptador y **leer** no consultan nada. Antes de la
**primera escritura** pide `/api/version` una vez:

| La API responde                                                             | El adaptador                                                                                                                              |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| contratos dentro de `CONTRATOS_ADMITIDOS`                                   | escribe                                                                                                                                   |
| un contrato que usa la escritura **mayor** que el admitido                  | no escribe; error: «Kitsuden X habla «page-builder» v2 y @intijs/adapter-kitsuden Y solo entiende v1: actualiza @intijs/adapter-kitsuden» |
| un contrato **menor** que el mínimo                                         | no escribe; error que pide actualizar Kitsuden                                                                                            |
| no declara un contrato que la escritura necesita (p. ej. `games-editorial`) | no escribe esa parte; el error nombra el kon que lo sirve (lo normal es que esté apagado). Lo demás sigue                                 |
| 404/405 (Kitsuden sin la ruta)                                              | **aviso** una vez y escribe                                                                                                               |
| error de red, 5xx o algo que no es de Kitsuden                              | aviso, escribe, y vuelve a preguntar en la siguiente escritura                                                                            |

`checkCompatibility: false` lo desactiva; `adapter.checkCompatibility()` lo
hace a mano (por ejemplo, al arrancar).

## Matriz de compatibilidad

| `@intijs/adapter-kitsuden` | entiende `page-builder` / `games` / `games-editorial` | Kitsuden                                                                                                                                                                                                                |
| -------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1.x (con comprobación)   | 1 / 1 / 1                                             | 0.9.0-beta con `/api/version` montada: comprobado. Kitsuden anterior (sin la ruta): funciona con un aviso, sin comprobación; sin capa editorial de juegos (antes de 2026-10-14), las ediciones de fichas fallan con 404 |

Al subir un contrato, añade aquí una fila nueva (y en la documentación de Inti,
`apps/docs/src/content/docs/adapters/kitsuden.mdx`).

## El test de contrato compartido

Para que «sigue siendo compatible» no dependa de memoria:

- **Respuestas de referencia**: `packages/shared/contratos/inti/respuestas-de-referencia.json`.
  Son respuestas **reales**: las genera `tests/unit/contrato-inti.test.ts`
  montando los routers de verdad (page-builder, games, `/api/version`) sobre
  PGlite con una semilla fija, con las tablas generadas desde los esquemas
  Drizzle.
- **Lado Kitsuden** (vitest): en cada ejecución repite esas peticiones y exige
  el mismo estado HTTP y que cada campo de la referencia siga existiendo con el
  mismo tipo (los campos nuevos están permitidos). También comprueba que el
  fichero corresponde a los `CONTRATOS` actuales.
- **Lado Inti** (`bun test`, `packages/adapter-kitsuden/tests/contrato.test.ts`):
  el adaptador lee, ordena y escribe contra esas mismas respuestas y cuerpos.
  Lleva una copia en `tests/contrato/`; si el repositorio de Kitsuden está al
  lado (por defecto busca `../cms`; con un clon llamado `kitsuden`, pasa
  `KITSUDEN_REPO=../kitsuden`) usa la canónica y exige que la copia sea
  idéntica.

Cuando un cambio de la API es **intencionado**:

```bash
# 1. si es incompatible, sube el contrato en packages/shared/src/contratos.ts
# 2. regenera las respuestas
ACTUALIZAR_CONTRATO_INTI=1 pnpm vitest run --config=tests/unit/vitest.config.ts tests/unit/contrato-inti.test.ts
# 3. cópialas al adaptador y ajusta lo que deje de entender
cp packages/shared/contratos/inti/respuestas-de-referencia.json ../inti/packages/adapter-kitsuden/tests/contrato/
cd ../inti && KITSUDEN_REPO=../kitsuden bun test packages/adapter-kitsuden   # la ruta de tu clon
```

Si el cambio **no** era intencionado, el test de Kitsuden falla con la ruta y
el campo (`GET /api/games/slug/:slug → $.blocks[0].order: falta`) antes de que
lo note ningún editor.
