# Variables de entorno

Tres sitios distintos, que conviene no mezclar:

| Fichero                                         | Lo lee                                                                                              | Para                                                      |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `.env` en la raíz                               | `docker compose` (interpola `docker-compose*.yml`) y `scripts/deploy.sh` (solo `KITSUDEN_OVERLAYS`) | servidor con Docker. Plantilla: `.env.production.example` |
| `apps/api/.env`                                 | la API cuando corre **fuera** de Docker (`bun run dev`) y los scripts de `apps/api/scripts`         | desarrollo. Plantilla: `apps/api/.env.example`            |
| `packages/starters/kitsuden-starter-basic/.env` | la web (Astro) al compilar y al arrancar                                                            | la web pública. Plantilla: `.env.example` del starter     |

Con Docker, las URLs de conexión (`DATABASE_URL`, `REDIS_URL`…) **no** se
escriben: las arma `docker-compose.yml` a partir de las de abajo. Genera cada
secreto con `openssl rand -hex 32` y no lo pegues en scripts sueltos.

Leyenda: **Obligatoria** = sin ella no arranca (o compose se niega a
interpolar). **Pública** = solo la exige el modo público
(`docker-compose.tls.yml`, `KITSUDEN_PUBLIC=true`), que **aborta el arranque**
si falta o apunta a localhost (`apps/api/src/lib/config-publica.ts`).

## Servidor con Docker (`.env` de la raíz)

### Proyecto y despliegue

| Variable               |             | Qué es y por qué                                                                                                                                                                                          |
| ---------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `COMPOSE_PROJECT_NAME` | recomendada | Prefijo del único volumen sin `name:` (los medios: `<proyecto>_kitsuden_uploads_prod`). Fíjalo: si dependes del nombre de la carpeta, renombrarla «pierde» los medios (siguen en el volumen viejo).       |
| `KITSUDEN_OVERLAYS`    | opcional    | Solo para `scripts/deploy.sh`: overlays de compose propios (otra web, servicios extra), separados por comas, que el script añade **después** de `docker-compose.tls.yml`. Del `.env` lee solo esta línea. |

### Base de datos

| Variable            |                            | Qué es y por qué                                                                                                                                                                                                                                                                                              |
| ------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POSTGRES_USER`     | opcional (`kitsuden`)      | Superusuario. **Solo** migra, crea el rol de la app y hace copias; la API no sirve tráfico con él. La imagen de Postgres lo crea **solo la primera vez** que el volumen está vacío: cambiarlo después no cambia nada en la base ([problemas.md](problemas.md#postgresql-responde-pero-no-acepta-al-usuario)). |
| `POSTGRES_PASSWORD` | **obligatoria**            | Su contraseña (compose aborta sin ella).                                                                                                                                                                                                                                                                      |
| `DDL_DB_PASSWORD` | recommended | Contraseña del rol limitado que crea tablas en caliente (activar un kon desde el panel, el Vault). Sin ella, activar un kon falla. |
| `KITSUDEN_INSTANCE` | optional | Prefijo de contenedores, volúmenes y red, por defecto `kitsuden`. Para una segunda instalación en la misma máquina; `install.sh` lo elige. No lo cambies en una instalación con datos: apuntaría a volúmenes vacíos. |
| `POSTGRES_DB`       | opcional (`kitsuden_prod`) | Nombre de la base.                                                                                                                                                                                                                                                                                            |
| `APP_DB_USER`       | opcional (`kitsuden_app`)  | Rol **sin** superusuario con el que corre la API. Postgres ignora las políticas RLS para un superusuario: con una sola cuenta, el aislamiento entre usuarios sería decorativo. Lo crea el arranque, con sus `GRANT`.                                                                                          |
| `APP_DB_PASSWORD`   | **obligatoria**            | Su contraseña; el arranque la (re)aplica con `ALTER ROLE` en cada inicio.                                                                                                                                                                                                                                     |
| `DB_PORT`           | opcional (`5432`)          | Puerto del host para Postgres (solo en `BIND_ADDRESS`).                                                                                                                                                                                                                                                       |

### Secretos de la aplicación

| Variable               |                                                 | Qué es y por qué                                                                                                                                                                                                                               |
| ---------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BETTER_AUTH_SECRET`   | **obligatoria**, ≥ 32 caracteres                | Firma las sesiones. La API no arranca con uno más corto. Cambiarlo cierra todas las sesiones.                                                                                                                                                  |
| `KITSUDEN_SECRETS_KEY` | recomendada                                     | Clave AES-256-GCM de los secretos guardados en la base (gestor de secretos). Sin ella se deriva de `BETTER_AUTH_SECRET` —aceptable en desarrollo—, y rotar uno rompería el otro. **Perderla = perder esos secretos**: guárdala con las copias. |
| `SITIO_API_CLAVE`      | recomendada; **obligatoria** con el overlay TLS | La comparten la API y la web (en la web se llama `KITSUDEN_SITE_KEY`). Con ella el límite de peticiones se cuenta por **visitante**; sin ella, toda la web es un solo cliente y al pasar el cupo la web responde errores a todos.              |

### Dominios (solo overlay TLS)

| Variable          |                                  | Qué es y por qué                                                                                                             |
| ----------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `SITE_DOMAIN`     | **pública**                      | La web (`ejemplo.com`). De ella salen `SITE_URL` (se graba en la web al compilar), `APP_URL` y `ALLOWED_ORIGINS`.            |
| `KITSUDEN_DOMAIN` | opcional (`panel.<SITE_DOMAIN>`) | El panel y la API que usa el navegador (el nginx del panel reenvía `/api/*`). De ella salen `BETTER_AUTH_URL` y `ADMIN_URL`. |
| `ACME_EMAIL`      | **pública**                      | Avisos de Let's Encrypt.                                                                                                     |

### Correo

| Variable                                                                         |                              | Qué es y por qué                                                                                                                                                  |
| -------------------------------------------------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RESEND_API_KEY` o `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`/`SMTP_SECURE` | **pública** (uno de los dos) | Sin transporte el Mailer cae al driver `log` (los correos de recuperar contraseña salen por la consola). En modo público eso **aborta el arranque**, a propósito. |
| `MAIL_FROM`                                                                      | **pública**                  | Remitente con el dominio real (`Nombre <noreply@ejemplo.com>`); `@localhost` lo rechazan los proveedores.                                                         |
| `MAIL_DRIVER`                                                                    | opcional                     | Fuerza un driver (`resend`, `smtp`, `log`). Por defecto: Resend si hay clave, SMTP si hay host, `log` si nada.                                                    |

### Almacenamiento

| Variable                                  |                    | Qué es y por qué                                                                                                                                                                        |
| ----------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DEFAULT_STORAGE_PROVIDER`                | opcional (`local`) | `local` = volumen de la API (`/app/data`, servido en `/media`). `s3` (o `minio`) = un S3.                                                                                               |
| `S3_ACCESS_KEY`, `S3_SECRET_KEY`          | solo con `s3`      | Con almacenamiento local no hacen falta (`apps/api/src/lib/config.ts` solo las exige con `s3`/`minio`). Una imagen compilada antes de ese cambio las pedía (`S3_ACCESS_KEY: Required`). |
| `S3_BUCKET`, `S3_REGION`, `S3_PUBLIC_URL` | con `s3`           | Bucket, región y URL pública desde la que se sirven los ficheros. El endpoint lo fija `docker-compose.yml` (SeaweedFS interno): para un S3 externo, cámbialo en un overlay.             |

### Copias

| Variable                                  |                        | Qué es y por qué                                                            |
| ----------------------------------------- | ---------------------- | --------------------------------------------------------------------------- |
| `BACKUP_INTERVAL_HOURS`                   | opcional (`24`)        | Cada cuánto `pg_dump`.                                                      |
| `BACKUP_KEEP`                             | opcional (`14`)        | Volcados que se conservan.                                                  |
| `BACKUP_MEDIA_DIAS` / `BACKUP_MEDIA_KEEP` | opcionales (`7` / `2`) | Copia completa (tar) del volumen de medios cada N días; cuántas se guardan. |

### Web pública (overlay TLS)

| Variable                   |                               | Qué es y por qué                                                                      |
| -------------------------- | ----------------------------- | ------------------------------------------------------------------------------------- |
| `SITE_NAME`, `SITE_LOCALE` | opcionales (`Kitsuden`, `en`) | Nombre e idioma de la interfaz del starter. Se **graban al compilar** `kitsuden_web`. |
| `TZ`                       | opcional (`UTC`)              | Zona de la web. API, base y copias van siempre en UTC.                                |

### Varios

| Variable                                                           |                                     | Qué es y por qué                                                                                                                                                                                                                             |
| ------------------------------------------------------------------ | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `KITSUDEN_SEGMENTOS_RESERVADOS`                                    | opcional (vacía)                    | Rutas de primer nivel de **tu** web que un juego (`kon-games`) no puede tomar como slug, separadas por comas (`torneos,tienda`). Se suman a las comunes de `packages/shared/src/sitio-publico.ts` (`blog`, `api`, `media`, `img`, `legal`…). |
| `KITSUDEN_VAULT_ENABLED`                                           | opcional (`false`)                  | Activa Vault (colecciones con `CREATE TABLE` reales). Apagado de serie a propósito.                                                                                                                                                          |
| `LOG_LEVEL`                                                        | opcional (`info`)                   | `debug`/`info`/`warn`/`error`.                                                                                                                                                                                                               |
| `ENABLE_SWAGGER`                                                   | opcional                            | Documentación interactiva en `/api/docs`. En el compose base está encendida; el overlay TLS la apaga salvo que la pidas.                                                                                                                     |
| `BIND_ADDRESS`                                                     | opcional (`127.0.0.1`)              | Interfaz donde se publican API, panel, Postgres y Valkey. `0.0.0.0` los expone **sin TLS** (y Docker se salta `ufw`).                                                                                                                        |
| `API_PORT`, `ADMIN_PORT`, `VALKEY_PORT`                            | opcionales (`3000`, `3001`, `6379`) | Puertos del host.                                                                                                                                                                                                                            |
| `KITSUDEN_API_IMAGE`, `KITSUDEN_ADMIN_IMAGE`, `KITSUDEN_WEB_IMAGE` | opcionales                          | Nombre de las imágenes (por defecto `kitsuden/*:latest`). Útil para una segunda instalación ([servidor.md](servidor.md#una-segunda-instalación-en-la-misma-máquina)).                                                                        |
| OAuth (GitHub/Google/Discord)                                      | —                                   | Hoy `docker-compose.yml` **no** pasa esas variables al contenedor de la API: si se quieren, hay que añadirlas a su `environment:` con un overlay.                                                                                            |

## Lo que pone `docker-compose.yml` en la API (no se escribe a mano)

Útil para entender un log o para la instalación sin Docker, donde sí se escriben:

| Variable                                   | Valor en Docker                                                                     | Qué es                                                                                                                                                         |
| ------------------------------------------ | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`                                     | `3000`                                                                              | Puerto dentro del contenedor (fuera de Docker, sin `PORT`, la API usa 3001).                                                                                   |
| `DATABASE_URL`                             | `postgresql://APP_DB_USER:…@kitsuden_db_prod:5432/POSTGRES_DB`                      | Con la que **sirve** la API (rol sin superusuario).                                                                                                            |
| `DATABASE_ADMIN_URL`                       | la del superusuario                                                                 | Con la que el arranque migra y crea el rol, y con la que el panel instala kons en caliente. Sin ella, activar un kon desde el panel no puede crear sus tablas. |
| `REDIS_URL`                                | `redis://kitsuden_state_prod:6379`                                                  | Valkey.                                                                                                                                                        |
| `BETTER_AUTH_URL`                          | `http://localhost:3000`; con TLS `https://KITSUDEN_DOMAIN`                          | URL pública de la API para better-auth (vueltas de OAuth, origen de las cookies).                                                                              |
| `ADMIN_URL`, `APP_URL`, `SITE_URL`         | localhost; con TLS, los dominios                                                    | Panel, «web principal» y sitio. En modo público no pueden ser localhost.                                                                                       |
| `ALLOWED_ORIGINS`                          | localhost:5173, :3000, :3001; con TLS `https://SITE_DOMAIN,https://KITSUDEN_DOMAIN` | CORS con credenciales. **Cada web pública necesita su origen aquí**: si falta, las páginas cargan pero el login y los comentarios fallan.                      |
| `KITSUDEN_PUBLIC`                          | `false`; con TLS `true`                                                             | Activa las comprobaciones de arranque del modo público.                                                                                                        |
| `STORAGE_LOCAL_PATH` / `STORAGE_LOCAL_URL` | `/app/data` / `/media`                                                              | Dónde se guardan los ficheros y con qué URL **relativa** se escriben en la base.                                                                               |
| `RATE_LIMIT_ENABLED`, `ENABLE_MCP`         | `true`                                                                              | Límite de peticiones y servidor MCP (`/api/mcp`).                                                                                                              |

## API sin Docker (`apps/api/.env`)

Las mismas variables, escritas a mano. Mínimo para arrancar **(probado
2026-10-15)**:

```dotenv
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://kitsuden:<pass>@127.0.0.1:5432/kitsuden_dev
REDIS_URL=redis://127.0.0.1:6379
BETTER_AUTH_SECRET=<openssl rand -hex 32>
BETTER_AUTH_URL=http://localhost:3000
ADMIN_URL=http://localhost:5173
ALLOWED_ORIGINS=http://localhost:4321,http://localhost:5173
DEFAULT_STORAGE_PROVIDER=local
```

Así la API usa el superusuario para todo y el migrador lo avisa («las
políticas quedan decorativas»): bien para desarrollar, **nunca** en
producción. Para reproducir producción, crea el rol de la app y define
`DATABASE_ADMIN_URL` (superusuario) y `DATABASE_URL` (rol de la app).

Opcionales que pueden interesar: `HOST` (interfaz de escucha, `0.0.0.0` por
defecto; `127.0.0.1` solo esta máquina, `::` también IPv6),
`DB_POOL_MAX` (20) / `DB_POOL_CONNECTION_TIMEOUT_MS` (5000) /
`DB_POOL_IDLE_TIMEOUT_MS` (con el pool agotado la API responde `503` con
`Retry-After`), `KITSUDEN_SECRETS_KEY`, `KITSUDEN_SEGMENTOS_RESERVADOS`,
`LOG_LEVEL`, `OPENAI_API_KEY`/`ANTHROPIC_API_KEY`/`DEEPSEEK_API_KEY`/`OLLAMA_BASE_URL`
(funciones de IA, cada una opcional), `ENABLE_SWAGGER`, `HEADLESS`,
`RATE_LIMIT_MAX_REQUESTS`, `RATE_LIMIT_WINDOW_MS`.

## Web pública (starter)

Tabla completa en el README del starter
(`packages/starters/kitsuden-starter-basic/README.md`) y en
[webs-con-el-starter.md](webs-con-el-starter.md#variables). En resumen:
`SITE_URL`, `SITE_NAME` y `SITE_LOCALE` se **graban al compilar**;
`KITSUDEN_API_URL`, `KITSUDEN_SITE_KEY`, `KITSUDEN_TRUST_PROXY`, `PORT`, `HOST`
e `INTI_KITSUDEN_TOKEN` se leen **al arrancar**.

## Inti

`INTI=true` (compilación con el editor), `INTI_KITSUDEN_TOKEN` (clave de
agente, solo al arrancar, nunca al compilar), `INTI_ADAPTER=kitsuden` e
`INTI_KITSUDEN_ENDPOINT` (los completa el middleware si faltan). Ver [inti.md](inti.md).
