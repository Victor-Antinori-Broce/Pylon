#!/bin/bash
# ===================================================================
# Kitsuden — desplegar / actualizar en el VPS (producción con TLS)
#
#   ./scripts/deploy.sh            compila y (re)arranca todo
#   ./scripts/deploy.sh --comprobar   solo valida .env y la configuración
#
# Guía completa (primer despliegue, datos, copias): docs/instalacion/servidor.md
#
# Reescrito el 2026-10-12. El anterior era peligroso en producción:
#   · usaba el compose base + override (SeaweedFS, puertos de desarrollo) y
#     NO el overlay TLS, así que la web nunca se servía;
#   · hacía `down --remove-orphans` antes de nada (todo caído mientras compila,
#     ~10 min);
#   · migraba con `bunx drizzle-kit migrate`, que aplica 2 de las ~100
#     migraciones (el arranque de la API ya migra con el runner bueno);
#   · lanzaba `src/db/seed.ts` contra la base real en cada despliegue;
#   · exigía DATABASE_URL/REDIS_URL en .env, que compose ya arma solo.
#
# No imprime secretos: nunca vuelca `docker compose config` ni el entorno.
# ===================================================================
set -euo pipefail

cd "$(dirname "$0")/.."
C=(docker compose -f docker-compose.yml -f docker-compose.tls.yml)

paso() { printf '\n\033[1;36m▶ %s\033[0m\n' "$1"; }
fallo() { printf '\033[0;31m✗ %s\033[0m\n' "$1" >&2; exit 1; }

# Overlays propios (otra web en lugar del starter neutro, servicios extra):
# KITSUDEN_OVERLAYS, en el entorno o en .env, ficheros separados por comas.
# Se añaden DESPUÉS de docker-compose.tls.yml:
#
#   KITSUDEN_OVERLAYS=docker-compose.miweb.yml ./scripts/deploy.sh
#
# Del .env se lee SOLO esa línea: el resto no se carga en este shell.
if [ -z "${KITSUDEN_OVERLAYS:-}" ] && [ -f .env ]; then
  KITSUDEN_OVERLAYS=$(sed -n 's/^KITSUDEN_OVERLAYS=//p' .env | tail -n 1 | tr -d "\"'\r")
fi
IFS=',' read -r -a OVERLAYS <<< "${KITSUDEN_OVERLAYS:-}"
for o in "${OVERLAYS[@]}"; do
  o=$(echo "$o" | xargs)
  [ -z "$o" ] && continue
  [ -f "$o" ] || fallo "KITSUDEN_OVERLAYS: no existe $o"
  C+=(-f "$o")
done

paso "1. Requisitos"
command -v docker >/dev/null || fallo "Docker no está instalado (ver docs/instalacion/servidor.md)"
docker compose version >/dev/null 2>&1 || fallo "Falta el plugin «docker compose» (v2)"
[ -f .env ] || fallo "No hay .env: cp .env.production.example .env y rellénalo"
# Un valor que EMPIEZA por «<» es un hueco de la plantilla (un MAIL_FROM real,
# «Nombre <correo>», no empieza por «<»)
if grep -qE '^[A-Z0-9_]+=<' .env; then
  fallo "El .env aún tiene valores <por rellenar>: $(grep -oE '^[A-Z0-9_]+=<' .env | cut -d= -f1 | tr '\n' ' ')"
fi
perm=$(stat -c %a .env 2>/dev/null || echo 600)
[ "$perm" = "600" ] || printf '⚠ .env tiene permisos %s; mejor: chmod 600 .env\n' "$perm"

paso "2. Configuración (sin imprimir valores)"
"${C[@]}" config -q || fallo "docker compose no acepta la configuración (mira el mensaje de arriba)"
echo "ok"

[ "${1:-}" = "--comprobar" ] && exit 0

paso "3. Compilar (API ~10 min, web unos minutos; los servicios actuales siguen sirviendo)"
"${C[@]}" build

paso "4. Arrancar / sustituir contenedores"
"${C[@]}" up -d --remove-orphans

paso "5. Esperar a que todo esté sano (hasta 5 min)"
for _ in $(seq 1 60); do
  malos=$("${C[@]}" ps --format '{{.Service}} {{.Health}}' | awk '$2 != "" && $2 != "healthy" && $1 != "kitsuden_backup" {print $1"("$2")"}')
  [ -z "$malos" ] && break
  sleep 5
done
"${C[@]}" ps --format 'table {{.Service}}\t{{.Status}}'
[ -z "${malos:-}" ] || fallo "Sin terminar de arrancar: $malos — ${C[*]} logs --tail 100 <servicio>"

paso "Hecho"
echo "Comprueba desde fuera: docs/instalacion/servidor.md"
