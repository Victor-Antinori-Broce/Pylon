# Instalar Kitsuden

**¿Solo quieres tenerlo en marcha en tu máquina?** `./install.sh` (en Windows:
`powershell -ExecutionPolicy Bypass -File install.ps1`) lo hace todo y solo
necesita Docker. Estas guías son para hacerlo a mano, en un servidor o para
desarrollar.

Guía para instalar Kitsuden (y, si se quiere, una web pública hecha con el
starter e Inti) en una máquina nueva, escrita para alguien que **no** es el
propietario del proyecto. Versión en inglés: [`../install/`](../install/README.md).

Cada comando lleva su estado:

- **(probado 2026-10-15)**: se ejecutó tal cual ese día en una copia limpia,
  con una pila Docker propia, y se anota lo que salió.
- **(no probado)**: se explica lo que hace y por qué, pero no se pudo ejecutar
  en la prueba (dominio real, TLS, correo…).

Un comando que cambió después de esa fecha no lleva la marca de prueba.

## Índice

|                                                        |                                                                      |
| ------------------------------------------------------ | -------------------------------------------------------------------- |
| [Requisitos y piezas](#qué-se-instala)                 | qué es cada cosa y qué hace falta                                    |
| [Instalación en local](local.md)                       | para desarrollar, en tu ordenador                                    |
| [Instalación en un servidor (Docker)](servidor.md)     | la forma recomendada; incluye VPS, dominio y TLS                     |
| [Variables de entorno](variables.md)                   | una a una: obligatorias, opcionales y por qué                        |
| [Primer arranque](primer-arranque.md)                  | migraciones, primer administrador, activar kons                      |
| [Crear una web con el starter](webs-con-el-starter.md) | `kitsuden-starter-basic`: desarrollo, compilación, Docker            |
| [Conectar Inti](inti.md)                               | edición visual: adaptador, clave de agente, sesión de editor, cookie |
| [Copias y restauración](copias.md)                     | qué se copia, dónde, y cómo volver atrás                             |
| [Actualizar de versión](actualizar.md)                 | código nuevo, migraciones, webs                                      |
| [Versiones y compatibilidad](versiones.md)             | semver, contratos de la API, matriz Kitsuden ↔ Inti                  |
| [Problemas típicos](problemas.md)                      | síntomas, causas y arreglos                                          |

## Qué se instala

```
  navegador ──► web pública (Astro, starter)  ──► API de Kitsuden (Bun + Hono) ──► PostgreSQL 16 + pgvector
           └──► panel (SvelteKit + nginx)      ─┘        │                      └─► Valkey (caché, colas)
                                                         └─► /app/data (medios, o S3)
  editor   ──► web pública con INTI=true ──(clave de agente)──► API
```

| Pieza                   | Dónde vive                                                                      | Imprescindible                    |
| ----------------------- | ------------------------------------------------------------------------------- | --------------------------------- |
| API                     | `apps/api`                                                                      | sí                                |
| Base de datos           | Postgres **16** con la extensión **pgvector** (imagen `pgvector/pgvector:pg16`) | sí                                |
| Valkey (o Redis 7)      | caché, colas, límites de peticiones                                             | sí                                |
| Panel de administración | `packages/admin` (SvelteKit estático servido por nginx)                         | sí, para administrar              |
| Kons                    | `packages/kons/*`, `packages/core/*`                                            | los que actives                   |
| Web pública             | `packages/starters/kitsuden-starter-basic` (Astro 7, renderizado en servidor)   | no (Kitsuden es _headless_)       |
| Inti                    | repositorio aparte (`@intijs/*`), se instala desde git                          | no: solo para editar sobre la web |
| Copias                  | servicio `kitsuden_backup` (misma imagen que la API)                            | sí en producción                  |

Los paquetes del monorepo (`@kitsuden/*`) **no** están publicados en npm: se
usan desde el propio repositorio (espacio de trabajo de pnpm).

### Requisitos

**Servidor con Docker (recomendado):**

- Linux x86_64 con Docker Engine 24+ y el plugin `docker compose` v2.
  Probado con Docker Desktop (Windows, motor Linux) y compose v2; para un VPS,
  Ubuntu 24.04 ([servidor.md](servidor.md#7-preparar-un-vps)).
- BuildKit (viene activo en Docker moderno): los `Dockerfile` usan
  `COPY --parents` y cachés de montaje.
- **Memoria para compilar**: la imagen de la API tardó **21 min** en compilarse
  en la prueba del 2026-10-15 (con otra carga en la máquina). Con 4 GB de RAM
  va justo: añade swap ([servidor.md](servidor.md#7-preparar-un-vps)).
- Disco: imagen de la API ≈ 1,4 GB, panel ≈ 110 MB, más la caché de
  compilación (varios GB) y los medios.

**Desarrollo en local, además:**

- [Bun](https://bun.sh) 1.3+ (la API corre con Bun; probado 1.3.14). Instálalo
  **antes** de `pnpm install`: el `prepare` de `@kitsuden/shared` compila con Bun.
- Node.js **22.12** o más nuevo (lo exige el starter; probado 22.19) y
  **pnpm 9** (`npm i -g pnpm@9.15.4`, la versión de `packageManager` y de las
  imágenes; el `pnpm-lock.yaml` es de esa versión).
- Postgres 16 + pgvector y Valkey 7 (lo más fácil: los contenedores de
  [local.md](local.md)).
- En **Windows**, una ruta corta para el repositorio (por ejemplo `C:\src\kitsuden`):
  ver [problemas.md](problemas.md#al-instalar).

**Para Inti:** `@intijs/core` y `@intijs/adapter-kitsuden` (desde git, ver
[inti.md](inti.md)) y un Kitsuden con `kon-blocks` (páginas) y, para editar
fichas de juego, `kon-games`.

## Estado de los bloqueos para instalar en limpio

En la primera versión de esta guía (2026-10-15) había seis cosas que impedían
instalar desde un `git clone`. Estado a 2026-10-19:

1. **Faltaban ficheros en git — resuelto.** El conjunto público lo define el
   `.gitignore` de la raíz (una lista de lo permitido): un clon limpio trae los
   kons, el starter neutro, los scripts de arranque y migración, los compose y
   el `Caddyfile`.
2. **El starter dependía de Inti por ruta local — resuelto.** El starter
   neutro (`kitsuden-starter-basic`) no tiene ninguna dependencia de Inti; Inti
   se instala desde git cuando se quiere ([inti.md](inti.md)).
3. **El primer administrador no se podía crear — arreglado.**
   `POST /api/system/setup` queda fuera de la puerta de administración
   temprana (`apps/api/src/middleware/auth-guard.ts`); el panel abre la
   pantalla de alta cuando no hay usuarios ([primer-arranque.md](primer-arranque.md#2-el-primer-administrador)).
4. **Las claves de agente creadas desde el panel no autenticaban — arreglado.**
   Ahora se guardan con su `key_id` y el analizador ya no se confunde con un
   `_` dentro del secreto ([inti.md](inti.md#2-la-clave-de-agente)).
5. **Nombres fijos en el compose — sigue así.** `container_name`, volúmenes
   con `name:` y la red `kitsuden_net_prod` son fijos: solo cabe **una**
   instalación por máquina. Para una segunda (pruebas) hace falta un overlay
   que los cambie ([servidor.md](servidor.md#una-segunda-instalación-en-la-misma-máquina)).
6. **`docker compose up` sin `-f` mezcla `docker-compose.override.yml` — sigue
   así** allí donde exista ese fichero (es local, de desarrollo, y un clon
   limpio no lo trae; enciende SeaweedFS). En un servidor usa siempre
   `-f docker-compose.yml` (o con el overlay TLS).
