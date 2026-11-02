# Instalación en local (desarrollo)

Para trabajar en el código: la API corre con Bun en tu máquina y la base de
datos y Valkey en contenedores. Si solo quieres **usar** Kitsuden, es más
simple la [instalación con Docker](servidor.md), también en tu ordenador.

Lo marcado **(probado)** se ejecutó el **2026-10-15** sobre una copia limpia de
la carpeta (Windows 11 + Git Bash, Docker Desktop, Bun 1.3.14, Node 22.19,
pnpm 9.15.4), con puertos distintos de los de abajo para no chocar con la
instalación existente.

## 1. Código y dependencias

```bash
git clone https://github.com/Victor-Antinori-Broce/kitsuden.git ~/src/kitsuden
cd ~/src/kitsuden
# Bun 1.3+ ANTES de pnpm install: el prepare de @kitsuden/shared compila con Bun
npm i -g pnpm@9.15.4          # la versión del lockfile y de las imágenes
pnpm install --frozen-lockfile
```

**(probado 2026-10-15** sobre una copia de la carpeta, no sobre un clon**)**:
5 min 50 s con la caché de pnpm vacía para este proyecto (1 321 paquetes).
Aviso esperable:

- `Failed to create bin … kitsuden-mcp … standalone.js` — el binario del
  servidor MCP no existe hasta compilarlo; no afecta a la API.

`pnpm install` compila de paso `@kitsuden/shared` (su `prepare`). Si cambias
`packages/shared/src`, vuelve a compilarlo: la API lo importa desde `dist/`.

```bash
pnpm --filter @kitsuden/shared build      # ✅ @kitsuden/shared — 102 KB
```

> **Windows**: pon el repositorio en una ruta corta (`C:\src\kitsuden`). Con la
> carpeta dentro de `AppData\Local\Temp\…` la API no arrancó: `sharp` no pudo
> cargar su DLL (`El nombre del archivo o la extensión es demasiado largo`).
> `subst` no lo arregla (Bun resuelve la ruta real). Ver [problemas.md](problemas.md).

## 2. Postgres y Valkey

Con los contenedores de desarrollo del repositorio:

```bash
pnpm dev:infra        # docker compose -f docker-compose.dev.yml up -d  (no probado)
```

(Postgres :5432, Valkey :6379 y MinIO; exige `POSTGRES_PASSWORD` en el `.env`
de la raíz. Ojo: ese compose publica los puertos en **todas** las interfaces y
usa `minio:latest`, que ya no se mantiene.) Mejor, a mano y con nombres propios
(lo que se hizo en la prueba) **(probado)**:

```bash
docker run -d --name kitsuden_dev_db -e POSTGRES_USER=kitsuden -e POSTGRES_PASSWORD=<pass> \
  -e POSTGRES_DB=kitsuden_dev -p 127.0.0.1:5432:5432 pgvector/pgvector:pg16
docker run -d --name kitsuden_dev_state -p 127.0.0.1:6379:6379 valkey/valkey:7-alpine
docker exec kitsuden_dev_db pg_isready -U kitsuden -h 127.0.0.1    # repetir hasta «accepting connections»
```

Hace falta la imagen **con pgvector** (`pgvector/pgvector:pg16`): con un
Postgres sin la extensión, el migrador se niega antes de empezar (comprueba
`pg_available_extensions`).

**No** apuntes a la base de una instalación en marcha: `scripts/dev-start-*.ps1`
se niegan a correr con la pila de producción encendida porque comparten
puertos y harían `db:push` contra ella.

## 3. `apps/api/.env`

```bash
cp apps/api/.env.example apps/api/.env
```

y deja como mínimo (explicación de cada una en [variables.md](variables.md#api-sin-docker-appsapienv)):

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

`PORT` importa: sin él, la API escucha en **3001** (el valor por defecto de
`apps/api/src/index.ts` y `src/lib/config.ts`), que choca con el panel de
Docker. `apps/api/.env.example` ya trae `PORT=3000`, el puerto que usan Docker,
el starter y esta guía.

Usa `127.0.0.1` en las URLs de conexión: en Windows `localhost` puede
resolverse a `::1` y los puertos publicados por Docker solo escuchan en IPv4.

## 4. Migraciones

```bash
cd apps/api
bun run scripts/migrate.ts          # = pnpm db:migrate desde la raíz
```

**(probado)**: 59 migraciones en 1 min 40 s, luego RLS («RLS activo en 9
tablas (9 con FORCE)») y un aviso esperado en desarrollo:

```
!  La conexion usa 'kitsuden', que es SUPERUSUARIO, y no hay
   DATABASE_ADMIN_URL definida: la API servira con esta MISMA cuenta.
```

Es correcto para desarrollar; en producción la API corre con un rol sin
superusuario (lo monta Docker solo). Más sobre el migrador (y la regla de
`--baseline` para bases que ya existían) en [primer-arranque.md](primer-arranque.md#migraciones).

**No** uses `pnpm db:push` (empuja el esquema de Drizzle sin pasar por el
historial de migraciones) ni `--todos-los-kons` (es una comprobación de CI:
crea las tablas de todos los kons).

## 5. Arrancar la API

```bash
cd apps/api
bun run dev                          # bun --watch src/index.ts
```

**(probado)** con `bun run src/index.ts`: `/live` responde en segundos; los
kons tardan algo más en montarse (en el log, `✅ kon-blocks [kon, modern] →
/api/page-builder`). Comprobación:

```bash
curl -s http://127.0.0.1:3000/live                                   # 200
curl -s http://127.0.0.1:3000/api/system/init-check                  # {"initialized":false}
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/api/page-builder/block-types   # 200
```

En la primera prueba, con la máquina muy cargada (dos compilaciones Docker a
la vez), los kons **no** se montaron: las consultas del arranque agotaron el
tiempo de conexión del pool (`Connection terminated due to connection
timeout`) y `/api/page-builder/*` daba 404. Reiniciar la API con la máquina
libre lo resolvió. Ver [problemas.md](problemas.md#los-kons-no-se-montan-404-en-sus-rutas).

## 6. El panel

```bash
pnpm dev:admin                       # Vite en http://localhost:5173 (no probado en esta guía)
```

`ADMIN_URL` y `ALLOWED_ORIGINS` de la API tienen que incluir ese origen.

## 7. Primer administrador y kons

Igual que en Docker: [primer-arranque.md](primer-arranque.md). Con el panel en
Vite (`http://localhost:5173`) la pantalla de alta aparece mientras no haya
usuarios; también vale `POST /api/system/setup` contra la API.

## 8. Una web

[webs-con-el-starter.md](webs-con-el-starter.md): `pnpm --filter @kitsuden/starter-basic dev`
con `KITSUDEN_API_URL=http://localhost:3000` en el `.env` del starter.
