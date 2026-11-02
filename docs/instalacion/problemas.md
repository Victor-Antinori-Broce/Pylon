# Problemas típicos

Ordenados por el momento en que aparecen. Los marcados **(visto 2026-10-15)**
salieron al preparar esta guía.

## Al instalar

### `pnpm install` falla en el `prepare` de `@kitsuden/shared`

Compila con Bun: instala [Bun](https://bun.sh) 1.3+ antes de `pnpm install`.

### Con `INTI=true` la compilación de la web se detiene

Faltan `@intijs/core` y `@intijs/adapter-kitsuden`: se instalan desde git
([inti.md](inti.md#1-qué-hace-falta)). Con pnpm 10, además,
`onlyBuiltDependencies` en el `pnpm-workspace.yaml` de la web.

### Una web copiada dentro de `packages/starters/` rompe el `pnpm install` de la raíz

El espacio de trabajo de la raíz solo incluye `packages/starters/kitsuden-starter-*`.
Una carpeta con otro nombre queda fuera: dale su propio `pnpm-workspace.yaml`
y su lockfile ([webs-con-el-starter.md](webs-con-el-starter.md#dentro-del-monorepo)).

### Windows: `Could not load the "sharp" module … El nombre del archivo o la extensión es demasiado largo`

La DLL de `sharp` no carga desde una ruta muy larga (la prueba estaba en
`AppData\Local\Temp\claude\…\scratchpad\…`). Mueve el repositorio a una ruta
corta (`C:\src\kitsuden`). `subst` no basta: Bun resuelve la ruta real. **(visto)**

### `Failed to create bin … kitsuden-mcp`

Aviso de pnpm: el binario del servidor MCP no existe hasta compilarlo. Inocuo
para la API. **(visto)**

## Al compilar las imágenes

### La imagen de la API sale con nginx dentro

Se compiló `docker/Dockerfile.prod` sin `--target api`. Usa
`docker compose … build kitsuden_api`.

### `docker compose up` arranca SeaweedFS o pide claves S3

Sin `-f`, compose mezcla `docker-compose.override.yml` (desarrollo). Usa
`-f docker-compose.yml` (y `-f docker-compose.tls.yml` en público).

### `… is already in use by container "kitsuden_db_prod"` (u otro `*_prod`)

Ya hay una instalación en la máquina: los nombres son fijos. Para una segunda,
el overlay de [servidor.md](servidor.md#una-segunda-instalación-en-la-misma-máquina).
**Nunca** la arranques sin él: compartiría los volúmenes con nombre de la otra.

## Al arrancar la API

### `[0/6] … ABORTADO: la configuracion publica no esta lista`

Modo público (`KITSUDEN_PUBLIC=true`, overlay TLS) con alguna URL en
localhost, `http` en vez de `https`, sin transporte de correo, `MAIL_FROM` sin
dominio real o un `BETTER_AUTH_SECRET` de menos de 32 caracteres. El log dice
cuál. Es a propósito: fallarían más tarde, delante de un usuario.

### PostgreSQL responde, pero no acepta al usuario

`password authentication failed for user "…"`. (El paso `[1/6]` lo distingue
de una **base** que no existe: esa la crea el paso `[2/6]`, y si no puede, lo
dice así.) La imagen de Postgres crea
`POSTGRES_USER`/`POSTGRES_PASSWORD` **solo** al inicializar un volumen vacío;
si los cambiaste después, el volumen sigue con los viejos. Vuelve a los
valores originales, crea el usuario nuevo con el viejo, o (borrando todo)
`docker compose down -v`. El propio log del arranque explica los tres caminos.

### `S3_ACCESS_KEY: Required`

Imagen de la API compilada antes de que esas claves fueran opcionales con
almacenamiento local, o `DEFAULT_STORAGE_PROVIDER=s3` sin ellas. Recompila o
pon las claves ([variables.md](variables.md#almacenamiento)).

### El contenedor de la API no arranca tras una migración

El paso `[4/6]` para el arranque si una migración falla o si el esquema
resultante no tiene lo que el código declara (`verificar-esquema.ts`). El log
nombra la migración o la tabla. No lo «arregles» saltándote el paso: restaura
la copia anterior o corrige la migración con una **nueva** (las aplicadas no
se editan: el migrador se niega si cambia su checksum).

### `ABORTADO: el aislamiento entre usuarios no se esta aplicando`

`[4.5/6]`: el rol de la app es superusuario, tiene `BYPASSRLS`, o una tabla
quedó sin `FORCE ROW LEVEL SECURITY`. No es un falso positivo: con eso se
servirían datos de unos usuarios a otros.

### Los kons no se montan (404 en sus rutas)

- El kon no está activo: `GET /api/modules` (con sesión de admin) y actívalo
  ([primer-arranque.md](primer-arranque.md#3-activar-kons)).
- Arranque con la base lenta: el log lleva
  `Connection terminated due to connection timeout` y ningún `✅ kon-…`. Pasó
  en local con la máquina saturada (dos compilaciones a la vez); reiniciar la
  API lo resolvió. **(visto)**
- Docker reinició la pila y el contenedor sigue con la imagen **anterior**:
  compara `docker inspect <api> --format '{{.Image}}'` con
  `docker image inspect kitsuden/api:latest --format '{{.Id}}'`.

### `/health` da 503 o tarda segundos

Hace comprobaciones profundas (base, caché, cola). Para saber si el proceso
vive, `/live` (en la raíz, sin `/api`). El healthcheck de Docker usa `/live`.

## Primer uso

### `POST /api/system/setup` → `401 Session required`

Imagen de la API anterior al arreglo del 2026-10-15: recompila. Con el código
actual la ruta funciona mientras haya cero usuarios; después responde
`403 System already initialized`.

### El login funciona en el panel pero no en la web (o los comentarios fallan)

El origen de la web no está en `ALLOWED_ORIGINS` de la API. Las páginas
cargan igual; solo falla lo que usa la sesión.

### Las imágenes no se ven en la web

El starter sirve las imágenes desde su propio origen (`/img/…`, `/media/…`) y
las pide a `KITSUDEN_API_URL`. Si ese servidor no llega a la API (en Windows,
`localhost` frente a `127.0.0.1`/`::1`), las imágenes salen vacías: prueba la
otra forma del host.

### Las imágenes no se ven en producción tras restaurar

La base puede guardar URLs absolutas de la máquina de origen
(`http://localhost:3000/media/…`, escritas por cargadores o versiones antiguas;
la API actual guarda `/media/…` relativo). `docker/sql/cambiar-dominio-de-medios.sql`
las cambia en una transacción (uso en su cabecera).

### Las subidas desde el panel fallan tras restaurar los medios

Falta `chown -R 1000:1000` en el volumen: la API corre sin root.

### La web responde errores al cabo de un rato de visitas

Sin `SITIO_API_CLAVE` en la API y el mismo valor en `KITSUDEN_SITE_KEY` de la
web, todo el sitio cuenta como un solo cliente para el límite de 300
peticiones/min. Detrás de un proxy, además, `KITSUDEN_TRUST_PROXY=true` en la
web (si no, todos los visitantes tienen la IP del proxy).

## Inti

Ver la tabla de [inti.md](inti.md#5-problemas-típicos): clave que no
autentica, 401 tras activar un kon en caliente, nadie ve el editor en
producción (cookie), contratos incompatibles o un kon apagado.

## Copias

### `pg_restore: unsupported version (1.16) in file header`

Restauraste con el `pg_restore` de la imagen de Postgres 16. Usa el de la
imagen de la API ([copias.md](copias.md#restaurar-la-base)).

### `unrecognized configuration parameter "transaction_timeout"`

Inocuo: `pg_dump` ≥ 17 contra Postgres 16. `pg_restore` termina con código 1
por esas líneas, pero restaura todo. **(visto)**

### La primera copia ocupa 1 KB

Se hizo mientras la API aún migraba (arrancan a la vez). La siguiente ya
lleva todo; fuerza una con `bun run scripts/backup.ts` dentro de
`kitsuden_backup`. **(visto)**
