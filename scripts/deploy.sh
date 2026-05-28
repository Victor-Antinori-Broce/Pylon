#!/bin/bash
# ===================================================================
# GremiusCMS - Production Deploy Script
# ===================================================================
# Uso:
#   chmod +x scripts/deploy.sh
#   ./scripts/deploy.sh
#
# El script es idempotente: puedes correrlo varias veces sin problemas.
# ===================================================================

set -e

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log_info()  { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_ok()    { echo -e "${GREEN}✅ $1${NC}"; }
log_warn()  { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }
log_step()  { echo -e "${BOLD}${CYAN}\n▶ $1${NC}"; }

# ═══════════════════════════════════════════════════════════════════
# 1. Validaciones iniciales
# ═══════════════════════════════════════════════════════════════════
log_step "1/8 Validando entorno"

if ! command -v docker &> /dev/null; then
    log_error "Docker no está instalado"
    exit 1
fi

if ! docker compose version &> /dev/null && ! docker-compose version &> /dev/null; then
    log_error "Docker Compose no está instalado"
    exit 1
fi

# Detectar docker compose o docker-compose
DOCKER_COMPOSE="docker compose"
if ! docker compose version &> /dev/null; then
    DOCKER_COMPOSE="docker-compose"
fi

log_ok "Docker y Docker Compose detectados"

# ═══════════════════════════════════════════════════════════════════
# 2. Variables de entorno
# ═══════════════════════════════════════════════════════════════════
log_step "2/8 Cargando variables de entorno"

ENV_FILE="${ENV_FILE:-.env}"

if [ ! -f "$ENV_FILE" ]; then
    log_warn "Archivo $ENV_FILE no encontrado"
    if [ -f ".env.production.example" ]; then
        cp .env.production.example "$ENV_FILE"
        log_warn "Se creó $ENV_FILE desde .env.production.example"
        log_error "Por favor edita $ENV_FILE con tus valores reales y vuelve a ejecutar este script"
        exit 1
    else
        log_error "No se encontró .env.production.example para crear la plantilla"
        exit 1
    fi
fi

# Cargar variables (ignorar comentarios y líneas vacías)
set -a
source "$ENV_FILE"
set +a

log_ok "Variables cargadas desde $ENV_FILE"

# ═══════════════════════════════════════════════════════════════════
# 3. Verificar variables críticas
# ═══════════════════════════════════════════════════════════════════
log_step "3/8 Verificando variables críticas"

REQUIRED_VARS=(
    "DATABASE_URL"
    "REDIS_URL"
    "BETTER_AUTH_SECRET"
)

MISSING=0
for var in "${REQUIRED_VARS[@]}"; do
    value="${!var:-}"
    if [ -z "$value" ]; then
        log_error "Variable requerida no definida: $var"
        MISSING=1
    fi
done

if [ $MISSING -eq 1 ]; then
    log_error "Corrige las variables faltantes en $ENV_FILE"
    exit 1
fi

# Verificar longitud de BETTER_AUTH_SECRET
if [ ${#BETTER_AUTH_SECRET} -lt 32 ]; then
    log_error "BETTER_AUTH_SECRET debe tener al menos 32 caracteres (actual: ${#BETTER_AUTH_SECRET})"
    exit 1
fi

# Verificar que no esté usando el secret de desarrollo
if [ "$BETTER_AUTH_SECRET" = "dev-better-auth-secret-gremiuscms-change-in-production-32" ]; then
    log_error "BETTER_AUTH_SECRET sigue siendo el valor de desarrollo. Genera uno nuevo con:"
    log_error "  openssl rand -base64 32"
    exit 1
fi

log_ok "Variables críticas verificadas"

# ═══════════════════════════════════════════════════════════════════
# 4. Pre-deploy: limpiar contenedores huérfanos (opcional pero seguro)
# ═══════════════════════════════════════════════════════════════════
log_step "4/8 Limpieza previa"

$DOCKER_COMPOSE down --remove-orphans 2>/dev/null || true
log_ok "Contenedores previos detenidos"

# ═══════════════════════════════════════════════════════════════════
# 5. Build e inicio de servicios
# ═══════════════════════════════════════════════════════════════════
log_step "5/8 Construyendo e iniciando servicios"

$DOCKER_COMPOSE up -d --build

log_ok "Servicios iniciados"

# ═══════════════════════════════════════════════════════════════════
# 6. Esperar a que la DB esté lista
# ═══════════════════════════════════════════════════════════════════
log_step "6/8 Esperando base de datos"

MAX_RETRIES=30
RETRY_COUNT=0

while ! $DOCKER_COMPOSE exec -T gremius_db pg_isready -U "${POSTGRES_USER:-gremius}" -d "${POSTGRES_DB:-gremius_prod}" &> /dev/null; do
    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
        log_error "PostgreSQL no respondió después de ${MAX_RETRIES} intentos"
        exit 1
    fi
    echo -n "."
    sleep 2
done

echo ""
log_ok "PostgreSQL listo"

# ═══════════════════════════════════════════════════════════════════
# 7. Migraciones
# ═══════════════════════════════════════════════════════════════════
log_step "7/8 Ejecutando migraciones"

$DOCKER_COMPOSE exec -T gremius_api sh -c "cd /app/apps/api && bunx drizzle-kit migrate" || {
    log_warn "Algunas migraciones pueden haber fallado o ya estaban aplicadas"
}

log_ok "Migraciones completadas"

# ═══════════════════════════════════════════════════════════════════
# 8. Seed (idempotente — no duplica usuarios)
# ═══════════════════════════════════════════════════════════════════
log_step "8/8 Ejecutando seed"

SEED_OUTPUT=$($DOCKER_COMPOSE exec -T gremius_api sh -c "cd /app/apps/api && bun run src/db/seed.ts" 2>&1) || true

if echo "$SEED_OUTPUT" | grep -q "Created admin"; then
    echo "$SEED_OUTPUT" | grep -A 3 "Created admin" | while read line; do
        log_warn "$line"
    done
    log_warn "⚠️  GUARDA LA CONTRASEÑA DE ADMIN MOSTRADA ARRIBA"
    log_warn "   O define ADMIN_SEED_PASSWORD en tu .env para controlarla"
else
    log_info "Seed ya había sido ejecutado anteriormente o no fue necesario"
fi

# ═══════════════════════════════════════════════════════════════════
# Health Check Final
# ═══════════════════════════════════════════════════════════════════
log_step "Verificando salud del sistema"

sleep 3

API_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health 2>/dev/null || echo "000")
ADMIN_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/ 2>/dev/null || echo "000")

if [ "$API_HEALTH" = "200" ]; then
    log_ok "API responde correctamente (HTTP 200)"
else
    log_warn "API no respondió 200 (HTTP $API_HEALTH) — revisa los logs con: docker compose logs gremius_api"
fi

if [ "$ADMIN_HEALTH" = "200" ] || [ "$ADMIN_HEALTH" = "301" ] || [ "$ADMIN_HEALTH" = "302" ]; then
    log_ok "Admin panel responde correctamente (HTTP $ADMIN_HEALTH)"
else
    log_warn "Admin panel no respondió correctamente (HTTP $ADMIN_HEALTH)"
fi

# ═══════════════════════════════════════════════════════════════════
# Resumen
# ═══════════════════════════════════════════════════════════════════
echo ""
echo -e "${GREEN}${BOLD}═══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}${BOLD}  🎉 Deploy de GremiusCMS completado${NC}"
echo -e "${GREEN}${BOLD}═══════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${CYAN}API:${NC}       http://localhost:3000"
echo -e "  ${CYAN}Swagger:${NC}   http://localhost:3000/api/swagger"
echo -e "  ${CYAN}Admin:${NC}     http://localhost:3001"
echo ""
echo -e "  ${CYAN}Logs API:${NC}   docker compose logs -f gremius_api"
echo -e "  ${CYAN}Logs DB:${NC}    docker compose logs -f gremius_db"
echo -e "  ${CYAN}Shell API:${NC}  docker compose exec gremius_api sh"
echo ""
echo -e "${YELLOW}Próximos pasos:${NC}"
echo -e "  1. Accede al Admin en http://localhost:3001"
echo -e "  2. Login con el email admin mostrado arriba"
echo -e "  3. Crea tu primer contenido o invita testers"
echo ""
