#!/bin/sh
# ===================================================================
# Kitsuden Start Script with Auto-Setup
#
# Estrategia de Migraciones:
#   1. Migraciones Drizzle (core schema)
#   2. Cada kon maneja sus propias tablas via SQL
# ===================================================================

set -e

# Dos conexiones, y la distincion es de seguridad, no de estilo:
#
#   DATABASE_ADMIN_URL  administrar: crear la base, instalar pgvector, migrar,
#                       crear el rol de aplicacion. Necesita superusuario.
#   DATABASE_URL        servir: lo que usa la API en caliente. Rol NORMAL.
#
# Postgres IGNORA las politicas RLS para un superusuario. Con una sola URL de
# superusuario para todo, el aislamiento entre tenants no se aplicaba: las
# politicas existian y eran decorativas. Esa es exactamente la clase de fallo
# que no da error — funciona igual, solo que sin aislar nada.
#
# Si no se define DATABASE_ADMIN_URL se usa DATABASE_URL para ambas cosas, que
# es el comportamiento antiguo. Sigue arrancando, pero el paso [4/6] avisa.
DB_URL="${DATABASE_URL}"
if [ -z "$DB_URL" ]; then
    echo "ERROR: DATABASE_URL is not set. Configure it in your .env file."
    exit 1
fi
DB_ADMIN_URL="${DATABASE_ADMIN_URL:-$DATABASE_URL}"
API_URL="${BETTER_AUTH_URL:-http://localhost:3000}"

echo "==================================================================="
echo "  Kitsuden Auto-Setup"
echo "==================================================================="

# [0/6] Configuracion publica — ANTES de tocar la base.
#
# Una instalacion marcada como publica (overlay TLS, KITSUDEN_PUBLIC=true) no
# arranca si alguna URL sigue en localhost, si el correo iria a la consola o si
# el secreto de sesion es corto. Ninguna de las tres da error al arrancar:
# fallan despues, delante de un usuario. Por eso se comprueban aqui.
echo ""
echo "[0/6] Checking public configuration..."
if ! bun run /app/apps/api/scripts/verify-public-config.ts; then
    echo ""
    echo "   ABORTADO: la configuracion publica no esta lista (ver arriba)."
    exit 1
fi

# Se parsea la URL de ADMIN: es la que usan los pasos 1-4.
DB_HOST=$(echo "$DB_ADMIN_URL" | sed -n 's|.*@\([^:/]*\).*|\1|p')
DB_PORT=$(echo "$DB_ADMIN_URL" | sed -n 's|.*@[^:]*:\([0-9]*\)/.*|\1|p')
DB_NAME=$(echo "$DB_ADMIN_URL" | sed -n 's|.*/\([^?]*\)$|\1|p')
DB_USER=$(echo "$DB_ADMIN_URL" | sed -n 's|.*://\([^:]*\):.*|\1|p')
DB_PASS=$(echo "$DB_ADMIN_URL" | sed -n 's|.*://[^:]*:\([^@]*\)@.*|\1|p')

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-kitsuden_prod}"
DB_USER="${DB_USER:-kitsuden}"

ADMIN_DB_URL="postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/postgres"

echo ""
echo "[1/6] Checking PostgreSQL..."
echo "   Host: $DB_HOST:$DB_PORT"
echo "   Database: $DB_NAME"

MAX_RETRIES=60
RETRY_COUNT=0

while ! pg_isready -h "$DB_HOST" -p "$DB_PORT" -q 2>/dev/null; do
    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
        echo "ERROR: PostgreSQL not responding"
        exit 1
    fi
    echo "   Waiting... ($RETRY_COUNT/$MAX_RETRIES)"
    sleep 2
done

echo "   OK - PostgreSQL ready"

# `pg_isready` solo confirma que el servidor CONTESTA. No comprueba que podamos
# autenticarnos, y ese es justo el fallo que se cuela hasta el paso [4/6] y
# aparece disfrazado de "Failed query: CREATE TABLE kitsuden_migrations".
#
# La causa casi siempre es la misma y no la dice ningun mensaje de Postgres:
# la imagen oficial ejecuta `initdb` —y crea POSTGRES_USER— UNA sola vez, cuando
# el volumen esta vacio. Si despues cambias POSTGRES_USER o POSTGRES_PASSWORD en
# el .env, el volumen conserva el usuario viejo, el nuevo no existe, y lo unico
# que ves es `password authentication failed for user "..."`.
#
# La comprobacion se hace contra la base de mantenimiento `postgres`, no contra
# $DB_NAME: si la que falta es la BASE (volumen nuevo con otro POSTGRES_DB, o
# un DATABASE_URL que apunta a una base que nadie ha creado), Postgres dice
# `database "..." does not exist`, y antes eso se anunciaba como un problema
# del usuario. Una base que falta no es un error: la crea el paso [2/6].
ERR_AUTH=$(psql "$ADMIN_DB_URL" -c "SELECT 1" 2>&1 >/dev/null) || {
    case "$ERR_AUTH" in
        *"database \""*"\" does not exist"*)
            # Ni siquiera existe la base `postgres`: el usuario entra, pero no
            # hay donde comprobarlo. Lo dira el paso [2/6].
            ;;
        *)
            echo ""
            echo "ERROR: PostgreSQL responde, pero no acepta al usuario '$DB_USER'."
            echo ""
            echo "  La imagen de Postgres crea POSTGRES_USER solo al inicializar un"
            echo "  volumen VACIO. Si cambiaste POSTGRES_USER o POSTGRES_PASSWORD"
            echo "  despues de la primera vez, el volumen sigue con el usuario anterior"
            echo "  y el nuevo no existe."
            echo ""
            echo "  Opciones, de menos a mas destructiva:"
            echo ""
            echo "    1. Devuelve POSTGRES_USER/POSTGRES_PASSWORD a los valores con los"
            echo "       que se creo el volumen."
            echo ""
            echo "    2. Crea el usuario nuevo en la base que ya existe, conectandote"
            echo "       con el antiguo (<contenedor-db>: el de Postgres, ver docker ps):"
            echo "         docker exec -u postgres <contenedor-db> psql -d $DB_NAME -U <usuario-antiguo> \\"
            echo "           -c \"CREATE ROLE $DB_USER LOGIN SUPERUSER PASSWORD '<contrasena>';\""
            echo ""
            echo "    3. Empieza de cero. BORRA TODOS LOS DATOS:"
            echo "         docker compose down -v"
            echo ""
            echo "  Para ver que usuarios existen ahora mismo:"
            echo "    docker exec -u postgres <contenedor-db> psql -d $DB_NAME -U <usuario-antiguo> \\"
            echo "      -c \"SELECT rolname, rolsuper FROM pg_roles WHERE rolcanlogin\""
            echo ""
            exit 1
            ;;
    esac
}

echo "   OK - autenticacion correcta ($DB_USER)"

# Auto-create database
echo ""
echo "[2/6] Checking database '$DB_NAME'..."

DB_EXISTS=$(psql "$ADMIN_DB_URL" -t -A -c "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" 2>/dev/null || echo "")

if [ "$DB_EXISTS" = "1" ]; then
    echo "   OK - Database exists"
else
    echo "   Creating database..."
    # Si no se puede crear, el fallo es de la BASE, y se dice asi. Antes un
    # `|| true` lo callaba y el error salia en el paso [4/6] como un fallo de
    # migracion.
    if ! psql "$ADMIN_DB_URL" -c "CREATE DATABASE \"$DB_NAME\" OWNER \"$DB_USER\";" 2>&1; then
        echo ""
        echo "ERROR: la base de datos '$DB_NAME' no existe y el usuario '$DB_USER'"
        echo "  no puede crearla. El usuario SI es valido: lo que falta es la base."
        echo ""
        echo "  Creala con un usuario que tenga CREATEDB (o dale ese permiso a"
        echo "  '$DB_USER'), o corrige el nombre de la base en DATABASE_URL /"
        echo "  DATABASE_ADMIN_URL (POSTGRES_DB en docker-compose)."
        exit 1
    fi
fi

# Verify pgvector
echo ""
echo "[3/6] Checking pgvector..."

PGVECTOR_CHECK=$(psql "$DB_ADMIN_URL" -t -A -c "SELECT 1 FROM pg_extension WHERE extname = 'vector'" 2>/dev/null || echo "")

if [ "$PGVECTOR_CHECK" = "1" ]; then
    echo "   OK - pgvector installed"
else
    echo "   Installing pgvector..."
    psql "$DB_ADMIN_URL" -c "CREATE EXTENSION IF NOT EXISTS vector;" 2>&1 || echo "   WARN: Could not install pgvector"
fi

# Database Migrations - SOLO CORE
echo ""
cd /app/apps/api
echo "[4/6] Running core migrations + RLS..."

# Antes esto era `bunx drizzle-kit migrate || echo "No pending migrations"`, y
# tenía DOS fallos graves:
#
#   1. drizzle-kit solo conoce las 2 migraciones de drizzle/. Las otras 29 de
#      src/db/migrations/ no las aplicaba nadie — el esquema se mantenía a mano.
#   2. El `|| echo` se tragaba el error. Una migración que reventaba imprimía
#      "No pending migrations" y la API arrancaba igual, con el esquema a medias.
#      Un fallo de migración tiene que PARAR el despliegue, no maquillarse.
#
# El runner aplica la cadena completa y, a continuación, las políticas RLS —
# que también dependían de que alguien se acordara de ejecutar un script.
#
# Sin `||`: `set -e` está activo arriba, así que si esto falla el contenedor
# no arranca. Es lo que queremos.
# DATABASE_URL se sobreescribe SOLO para este comando: migrar es DDL y necesita
# el superusuario. La API, mas abajo, arranca con la de servir.
#
# El rol de la app tiene que EXISTIR antes de migrar. Varias migraciones dan
# permisos con `IF EXISTS (SELECT 1 FROM pg_roles ...) THEN GRANT` sobre sus
# funciones (0056 la cola, 0057 las trazas), y una migracion aplicada no se
# repite: en una base vacia se saltaban el GRANT y la API recibia «permission
# denied for function kitsuden_cola_reclamar» para siempre. Los trabajos en
# segundo plano no corrian. Nadie lo vio porque solo pasa en una instalacion
# nueva. Aqui solo se crea; los permisos sobre tablas siguen mas abajo.
APP_USER=$(echo "$DB_URL" | sed -n 's|.*://\([^:]*\):.*|\1|p')
APP_PASS=$(echo "$DB_URL" | sed -n 's|.*://[^:]*:\([^@]*\)@.*|\1|p')
if [ "$DB_ADMIN_URL" != "$DB_URL" ] && [ -n "$APP_USER" ] && [ -n "$APP_PASS" ]; then
    psql "$DB_ADMIN_URL" -v ON_ERROR_STOP=1 -q <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${APP_USER}') THEN
    CREATE ROLE "${APP_USER}" LOGIN PASSWORD '${APP_PASS}' NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
END
\$\$;
SQL
fi

DATABASE_URL="$DB_ADMIN_URL" bun run scripts/migrate.ts

echo "   Migrations + RLS complete"

# Comprobar que lo que el codigo DECLARA existe de verdad en la base.
#
# Migrar sin errores no garantiza que el esquema este completo: una tabla puede
# estar declarada en `schema-core.ts` y no tener migracion que la cree. Paso con
# `auth_accounts`, y el sintoma fue que en una instalacion NUEVA era imposible
# crear el primer administrador — 500 en «System Init» y, en el log,
# `relation "auth_accounts" does not exist`. Peor: better-auth guarda el usuario
# en `auth_users` y la credencial en `auth_accounts`, asi que se creaba el
# usuario SIN contrasena y reintentar ya no arreglaba nada.
#
# Nadie lo vio en meses porque las instalaciones existentes ya tenian esas
# tablas. Solo aparece en un servidor recien montado: justo el peor momento.
#
# Corre con la URL de ADMIN porque consulta el catalogo del sistema. Si falta
# algo, `set -e` detiene el arranque: un despliegue que no arranca se arregla;
# uno que arranca a medias se descubre cuando alguien no puede entrar.
echo ""
echo "   Verificando esquema..."
DATABASE_URL="$DB_ADMIN_URL" bun run scripts/verificar-esquema.ts

# ── Rol de aplicacion ──────────────────────────────────────────────────────
#
# Sus permisos se dan DESPUES de migrar, porque los GRANT necesitan que las
# tablas existan. Idempotente: se puede reejecutar en cada arranque sin efecto.
#
# `ALTER DEFAULT PRIVILEGES` es la parte que se olvida y luego duele: sin ella,
# cada tabla nueva que cree una migracion futura nace sin permisos para el rol
# de aplicacion, y la API empieza a dar "permission denied" en produccion por
# una tabla que en desarrollo funcionaba.
if [ "$DB_ADMIN_URL" = "$DB_URL" ]; then
    echo ""
    echo "   AVISO: DATABASE_ADMIN_URL no esta definida, asi que la API correra"
    echo "   con la MISMA cuenta que migra. Si es superusuario, Postgres ignora"
    echo "   las politicas RLS y el aislamiento entre tenants NO se aplica."
elif [ -n "$APP_USER" ] && [ -n "$APP_PASS" ]; then
    echo ""
    echo "   Rol de aplicacion: $APP_USER (sin superusuario)"
    psql "$DB_ADMIN_URL" -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${APP_USER}') THEN
    CREATE ROLE "${APP_USER}" LOGIN PASSWORD '${APP_PASS}' NOSUPERUSER NOCREATEDB NOCREATEROLE;
  ELSE
    ALTER ROLE "${APP_USER}" WITH LOGIN PASSWORD '${APP_PASS}' NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
END
\$\$;

GRANT CONNECT ON DATABASE "${DB_NAME}" TO "${APP_USER}";
GRANT USAGE ON SCHEMA public TO "${APP_USER}";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "${APP_USER}";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO "${APP_USER}";

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "${APP_USER}";
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO "${APP_USER}";

-- Una consulta colgada o una transacción olvidada no puede bloquear la base:
-- solo para el rol de la aplicación; las migraciones y cargas usan el de admin.
ALTER ROLE "${APP_USER}" SET statement_timeout = '60s';
ALTER ROLE "${APP_USER}" SET idle_in_transaction_session_timeout = '60s';
SQL
    echo "   Permisos concedidos (incluidas tablas futuras)"
fi

# ── Rol de DDL limitado (opcional: DATABASE_DDL_URL) ───────────────────────
#
# Para lo que la API crea EN CALIENTE (activar un kon desde el panel, el
# Vault) sin darle el superusuario: un rol sin SUPERUSER, sin BYPASSRLS, sin
# CREATEROLE/CREATEDB, con CREATE en `public` y nada mas. Es dueno solo de lo
# que crea; las tablas del nucleo siguen siendo del administrador. Ver
# apps/api/src/lib/conexion-ddl.ts y docs/agents/sandbox.md.
DDL_URL="${DATABASE_DDL_URL:-}"
DDL_USER=$(echo "$DDL_URL" | sed -n 's|.*://\([^:]*\):.*|\1|p')
DDL_PASS=$(echo "$DDL_URL" | sed -n 's|.*://[^:]*:\([^@]*\)@.*|\1|p')
if [ -n "$DDL_URL" ] && [ -n "$DDL_USER" ] && [ -n "$DDL_PASS" ] && [ "$DDL_URL" != "$DB_ADMIN_URL" ]; then
    echo ""
    echo "   Rol de DDL limitado: $DDL_USER"
    psql "$DB_ADMIN_URL" -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${DDL_USER}') THEN
    CREATE ROLE "${DDL_USER}" LOGIN PASSWORD '${DDL_PASS}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
  ELSE
    ALTER ROLE "${DDL_USER}" WITH LOGIN PASSWORD '${DDL_PASS}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
  END IF;
END
\$\$;

GRANT CONNECT ON DATABASE "${DB_NAME}" TO "${DDL_USER}";
GRANT USAGE, CREATE ON SCHEMA public TO "${DDL_USER}";
GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES ON ALL TABLES IN SCHEMA public TO "${DDL_USER}";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO "${DDL_USER}";
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES ON TABLES TO "${DDL_USER}";

-- Lo que cree el rol de DDL lo usa la app (DML) sin pasar por el admin.
ALTER DEFAULT PRIVILEGES FOR ROLE "${DDL_USER}" IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "${APP_USER}";
ALTER DEFAULT PRIVILEGES FOR ROLE "${DDL_USER}" IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO "${APP_USER}";
ALTER ROLE "${DDL_USER}" SET statement_timeout = '120s';
SQL
    echo "   Rol de DDL listo (sin superusuario)"
fi

# ── El aislamiento se PRUEBA, no se declara ────────────────────────────────
#
# Hasta aqui todo lo que se ha comprobado son DECLARACIONES: que el rol existe,
# que no es superusuario, que las politicas se crearon. Ninguna de esas cosas
# demuestra que un usuario no vea las filas de otro.
#
# Y las cuatro formas de romper el aislamiento no dan error, dan datos: un rol
# que resulta superusuario, un BYPASSRLS concedido para depurar y no retirado,
# una tabla nueva con ENABLE pero sin FORCE, o una politica que siempre da
# verdadero. El sistema sigue funcionando igual de bien, enseniando datos ajenos.
#
# Asi que se comprueba contra la base real, con el rol real, en el despliegue:
# con el contexto fijado a un usuario que no existe, una tabla aislada tiene que
# devolver CERO filas. Si alguna devuelve mas, el arranque para aqui.
echo ""
echo "[4.5/6] Verifying RLS isolation..."
if ! bun run scripts/verify-rls.ts; then
    echo ""
    echo "   ABORTADO: el aislamiento entre usuarios no se esta aplicando."
    echo "   Arrancar aqui serviria datos de unos usuarios a otros."
    exit 1
fi

# Auto-Install Kons
echo ""
echo "[5/6] Installing kons..."

bun run - << 'KON_SCRIPT'
import { db } from "./src/db";
import { installedKons } from "./src/db/schema";
import { eq } from "drizzle-orm";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { readdir } from "fs/promises";

const KON_CONFIG_PATH = "./kitsuden.config.ts";

async function scanLocalKons() {
  const konsDir = "/app/packages/kons";
  const found = [];

  try {
    const entries = await readdir(konsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const konJsonPath = join(konsDir, entry.name, "kon.json");
      const kitsudenJsonPath = join(konsDir, entry.name, "kitsuden.json");

      let manifest = null;

      if (existsSync(konJsonPath)) {
        manifest = JSON.parse(readFileSync(konJsonPath, "utf-8"));
      } else if (existsSync(kitsudenJsonPath)) {
        manifest = JSON.parse(readFileSync(kitsudenJsonPath, "utf-8"));
      }

      if (manifest && manifest.id) {
        found.push({
          konId: manifest.id,
          name: manifest.name || manifest.id,
          description: manifest.description,
          version: manifest.version || "1.0.0",
          source: "local",
          path: join(konsDir, entry.name),
          manifest,
          enabled: true,
        });
      }
    }
  } catch (err) {
    console.log("   WARN: Scan error:", err.message);
  }

  return found;
}

async function getConfigKons() {
  try {
    if (!existsSync(KON_CONFIG_PATH)) return [];

    // Import the static config directly instead of regex-parsing TS
    const configModule = await import(KON_CONFIG_PATH);
    const staticConfig = configModule.staticConfig || configModule.default || configModule;
    return staticConfig.kons || staticConfig.modules || [];
  } catch (err) {
    console.log("   WARN: Could not import kitsuden.config.ts:", err.message);
    return [];
  }
}

async function main() {
  const [localKons, configIds] = await Promise.all([
    scanLocalKons(),
    getConfigKons(),
  ]);

  const toInstall = configIds.length > 0
    ? localKons.filter(g => configIds.includes(g.konId))
    : localKons;

  console.log("   Found " + localKons.length + " kons (" + toInstall.length + " active)");

  const installed = await db.select().from(installedKons);
  const installedIds = new Set(installed.map(i => i.konId));

  for (const kon of toInstall) {
    if (installedIds.has(kon.konId)) {
      console.log("   ✓ " + kon.konId + " already registered");
      continue;
    }

    try {
      await db.insert(installedKons).values({
        konId: kon.konId,
        name: kon.name,
        description: kon.description,
        version: kon.version,
        source: kon.source,
        sourceUrl: kon.sourceUrl,
        path: kon.path,
        manifest: kon.manifest,
        enabled: kon.enabled,
      });
      console.log("   + " + kon.konId + " registered");
    } catch (err) {
      console.log("   ✗ " + kon.konId + ": " + err.message);
    }
  }
}

// Salir SIEMPRE, no solo cuando hay error.
//
// Esto era `main().catch(() => process.exit(0))`, que solo termina por el
// camino malo. Por el bueno, `main()` acababa su trabajo —registraba los kons
// e imprimia cada linea— y el proceso NO salia: `db` deja abierto un pool de
// Postgres, y mientras quede un handle vivo el runtime no termina.
//
// El efecto era que el arranque se paraba aqui para siempre: el paso [6/6]
// nunca llegaba a ejecutar `bun run dist/index.js`, nada escuchaba en el 3000,
// y `docker compose up` acababa diciendo solo que el contenedor estaba
// 'unhealthy' — sin una sola linea de error, porque error no habia.
//
// El codigo de salida sigue siendo 0 tambien cuando falla, a proposito: que no
// se pueda registrar un kon no debe impedir que la API arranque.
main()
  .catch((err) => console.log('   WARN: ' + err.message))
  .finally(() => process.exit(0));
KON_SCRIPT

echo ""
echo "==================================================================="
echo "[6/6] Setup complete. Starting API..."
echo "==================================================================="
echo ""
echo "  API: ${API_URL}"
echo "  Docs: ${API_URL}/api/swagger"
echo ""

# ── La API sirve SIN el superusuario ───────────────────────────────────────
#
# Todo lo que necesitaba la URL de administracion (crear la base, pgvector,
# migrar, el rol de la app, verificar RLS) ya se hizo arriba, en ESTE shell.
# Con `exec` la API hereda el entorno: si DATABASE_ADMIN_URL siguiera ahi,
# cualquier fallo de la API —o codigo de usuario que escapara del sandbox—
# leeria el superusuario en `process.env` o en /proc/1/environ.
#
# `docker exec` NO se ve afectado: toma el entorno de la configuracion del
# contenedor, no el del proceso 1, asi que `docker exec <api> bun run
# scripts/migrate.ts --kon <id>` sigue teniendo la cuenta de administracion.
#
# KITSUDEN_API_KEEP_ADMIN_URL=true conserva el comportamiento anterior (por
# ejemplo, para activar kons que alteran tablas del nucleo sin reiniciar).
# Las variables de este script (DB_ADMIN_URL, ADMIN_DB_URL, DB_PASS…) no
# estan exportadas: no llegan a la API.
if [ "${KITSUDEN_API_KEEP_ADMIN_URL:-false}" = "true" ]; then
    echo "  AVISO: KITSUDEN_API_KEEP_ADMIN_URL=true — la API conserva DATABASE_ADMIN_URL."
else
    unset DATABASE_ADMIN_URL
    echo "  DATABASE_ADMIN_URL retirada del entorno de la API (solo rol de app${DDL_USER:+ + DDL limitado})."
fi
unset DDL_PASS DB_PASS APP_PASS

exec bun run dist/index.js
