#!/usr/bin/env bash
#
# Kitsuden en tu máquina, con un solo comando. Solo necesita Docker.
#
#   ./install.sh             crea .env, compila, arranca e imprime las URLs
#   ./install.sh --dry-run   solo crea .env y dice qué usaría
#   ./install.sh --rebuild   vuelve a compilar (tras actualizar el código)
#
# Para un servidor con dominio y TLS: scripts/deploy.sh (docs/install/server.md).
#
# No pisa nada ajeno. Si en esta máquina ya hay otra instalación, elige otro
# prefijo (kitsuden2…) y otros puertos: docker-compose.yml nombra sus volúmenes
# con KITSUDEN_INSTANCE, así que sin esto compartiría la base con la primera.
# Mantener en paralelo con install.ps1.

set -euo pipefail
cd "$(dirname "$0")"

MARCA="# Created by install.sh"
DRY_RUN=false
REBUILD=false
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    --rebuild) REBUILD=true ;;
    -h | --help) sed -n '3,8p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $arg (see --help)" >&2; exit 2 ;;
  esac
done

morir() { printf '\nInstall stopped: %s\n' "$1" >&2; exit 1; }

command -v docker >/dev/null 2>&1 || morir "Docker is not installed. Get it at https://docs.docker.com/get-docker/ and run this again."
docker compose version >/dev/null 2>&1 || morir "this needs the Docker Compose v2 plugin ('docker compose')."
docker info >/dev/null 2>&1 || morir "Docker is installed but not running. Start it and run this again."

# Un checkout con override es un despliegue a medida: esto no es para él.
[ -f docker-compose.override.yml ] && morir "this folder has a docker-compose.override.yml, so it is a custom deployment. Use your own deploy process."

compose() { docker compose -f docker-compose.yml "$@"; }
secreto() { od -An -tx1 -N32 /dev/urandom | tr -d ' \n'; }
valor_env() { sed -n "s/^$1=//p" .env | tr -d '\r' | tail -n 1; }

puerto_ocupado() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }
puerto_libre() {
  local p="$1"
  while puerto_ocupado "$p"; do p=$((p + 1)); done
  echo "$p"
}

instancia_ocupada() {
  docker ps -a --format '{{.Names}}' | grep -qx "$1_db_prod" && return 0
  docker volume inspect "$1_postgres_prod" >/dev/null 2>&1
}

crear_env() {
  local instancia=kitsuden n=2
  while instancia_ocupada "$instancia"; do
    instancia="kitsuden$n"
    n=$((n + 1))
  done
  local api admin db valkey
  api=$(puerto_libre 3000)
  admin=$(puerto_libre 3001)
  [ "$admin" = "$api" ] && admin=$(puerto_libre $((api + 1)))
  db=$(puerto_libre 5432)
  valkey=$(puerto_libre 6379)

  umask 077
  local linea
  {
    printf '%s. Secrets are in here: never commit it, and keep a copy.\n' "$MARCA"
    while IFS= read -r linea || [ -n "$linea" ]; do
      linea="${linea%$'\r'}"
      case "$linea" in
        *'=<openssl rand -hex 32>') linea="${linea%%=*}=$(secreto)" ;;
        SITE_DOMAIN=* | ACME_EMAIL=* | MAIL_FROM=*) linea="${linea%%=*}=" ;;
        COMPOSE_PROJECT_NAME=*) linea="COMPOSE_PROJECT_NAME=$instancia" ;;
      esac
      printf '%s\n' "$linea"
    done <.env.production.example
    cat <<EOF

# --- This machine (install.sh) ---
KITSUDEN_INSTANCE=$instancia
KITSUDEN_API_IMAGE=$instancia/api:latest
KITSUDEN_ADMIN_IMAGE=$instancia/admin:latest
API_PORT=$api
ADMIN_PORT=$admin
DB_PORT=$db
VALKEY_PORT=$valkey
BETTER_AUTH_URL=http://localhost:$api
ADMIN_URL=http://localhost:$admin
APP_URL=http://localhost:$admin
ALLOWED_ORIGINS=http://localhost:$admin,http://127.0.0.1:$admin,http://localhost:$api,http://127.0.0.1:$api
EOF
  } >.env.tmp
  grep -qE '^[A-Z_]+=<' .env.tmp && { rm -f .env.tmp; morir ".env.production.example has a placeholder this script does not know."; }
  mv .env.tmp .env
  chmod 600 .env
}

if [ -f .env ]; then
  # Un .env que no es nuestro puede ser una instalación real: no se toca.
  grep -qF "$MARCA" .env || morir "this folder already has a .env that this script did not create. Use scripts/deploy.sh, or move that file away."
  echo "Using the existing .env."
else
  [ -f .env.production.example ] || morir ".env.production.example is missing. Run this from a full copy of the repository."
  crear_env
  echo "Created .env with new random secrets."
fi

INSTANCIA=$(valor_env KITSUDEN_INSTANCE)
API_PORT=$(valor_env API_PORT)
ADMIN_PORT=$(valor_env ADMIN_PORT)
[ "$INSTANCIA" = kitsuden ] || echo "Another Kitsuden uses the default names on this machine, so this one is '$INSTANCIA'. They share nothing."

if $DRY_RUN; then
  echo "Dry run: would start '$INSTANCIA' with the API on port $API_PORT and the panel on port $ADMIN_PORT."
  exit 0
fi

# De una en una: compilarlas en paralelo llegó a tumbar Docker Desktop.
imagen_falta() { ! docker image inspect "$1" >/dev/null 2>&1; }
if $REBUILD || imagen_falta "$(valor_env KITSUDEN_API_IMAGE)"; then
  echo "Building the API image. The first time takes 5 to 15 minutes..."
  compose build kitsuden_api
fi
if $REBUILD || imagen_falta "$(valor_env KITSUDEN_ADMIN_IMAGE)"; then
  echo "Building the panel image..."
  compose build kitsuden_admin
fi

# Compilar tarda: los puertos elegidos pueden haberse ocupado mientras tanto, o
# desde el último arranque. Los de base y Valkey no los usa nadie a mano, así
# que se mueven solos; los de API y panel están en las URLs y se avisa.
poner_env() {
  sed "s/^$1=.*/$1=$2/" .env >.env.tmp
  mv .env.tmp .env
  chmod 600 .env
}
if [ -z "$(compose ps -q --status running kitsuden_api 2>/dev/null)" ]; then
  for clave in DB_PORT VALKEY_PORT; do
    actual=$(valor_env "$clave")
    if puerto_ocupado "$actual"; then
      nuevo=$(puerto_libre "$actual")
      echo "Port $actual is now in use, so $clave moves to $nuevo."
      poner_env "$clave" "$nuevo"
    fi
  done
  for puerto in "$API_PORT" "$ADMIN_PORT"; do
    puerto_ocupado "$puerto" && morir "port $puerto is in use by another program. Close it and run this again."
  done
fi

echo "Starting..."
compose up -d || morir "the containers did not start. Docker's reason is just above."

listo=false
for _ in $(seq 1 90); do
  if curl -fsS -m 3 -o /dev/null "http://127.0.0.1:$ADMIN_PORT/" 2>/dev/null &&
    curl -fsS -m 3 -o /dev/null "http://127.0.0.1:$API_PORT/live" 2>/dev/null; then
    listo=true
    break
  fi
  sleep 2
done
$listo || morir "it did not become ready in 3 minutes. See: docker compose -f docker-compose.yml logs kitsuden_api"

cat <<EOF

Kitsuden is running.

  1. Open the panel and create your administrator:
       http://localhost:$ADMIN_PORT
     Do this first: until an administrator exists, whoever gets there first
     becomes one. Everything listens on this machine only.

  2. In the panel, go to Agents, create one and copy its key.

  3. Point your MCP client at:
       http://localhost:$API_PORT/api/mcp

  API: http://localhost:$API_PORT    Guide for agents: http://localhost:$API_PORT/llms.txt

  Stop:    docker compose -f docker-compose.yml stop
  Start:   ./install.sh
  Logs:    docker compose -f docker-compose.yml logs -f kitsuden_api
  Delete everything, data included:
           docker compose -f docker-compose.yml down -v
EOF
