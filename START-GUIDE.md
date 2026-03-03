# 🚀 GremiusCMS - Guía de Inicio

## 📁 Estructura de Archivos

```
├── docker-compose.yml          ← PRODUCCIÓN: Todo en uno
├── docker-compose.dev.yml      ← DESARROLLO: Solo infraestructura
├── docker/
│   ├── Dockerfile.prod         ← Multi-stage para producción
│   ├── Dockerfile.dev          ← Imagen de desarrollo (opcional)
│   └── migrate.sh              ← Script de migraciones seguras
├── scripts/
│   ├── dev-start-simple.ps1    ← Dev: Script simple
│   ├── dev-start-full.ps1      ← Dev: Script con healthchecks
│   └── dev-start.bat           ← Dev: Doble clic para Windows
└── start.bat                   ← Alias para producción
```

---

## 🎯 PRODUCCIÓN - `docker compose up`

### Requisitos:
- Docker + Docker Compose
- Archivo `.env` configurado (ver `.env.example`)

### Comando único:

```bash
docker compose up -d
```

**Listo.** Espera ~1-2 minutos para que todo compile e inicie, luego accede a:

| Servicio | URL | Descripción |
|----------|-----|-------------|
| **Panel Admin** | http://localhost:3001/admin | Gestión del CMS |
| **API** | http://localhost:3000 | Backend API |
| **Web** | http://localhost:3002 | Sitio público |
| **MinIO Console** | http://localhost:9001 | Storage (user/pass en .env) |

### Comandos útiles:

```bash
# Ver logs
docker compose logs -f

# Ver logs de un servicio específico
docker compose logs -f gremius_api

# Detener todo
docker compose down

# Detener y borrar datos (⚠️ cuidado)
docker compose down -v

# Reconstruir imágenes
docker compose up -d --build
```

### Variables de entorno importantes (.env):

```env
# Base de datos
POSTGRES_USER=gremius
POSTGRES_PASSWORD=tu-password-segura
POSTGRES_DB=gremius_prod

# Storage
S3_ACCESS_KEY=gremius_minio
S3_SECRET_KEY=tu-secret-key
S3_BUCKET=gremius-uploads

# Auth
BETTER_AUTH_SECRET=tu-jwt-secret-muy-largo
BETTER_AUTH_URL=http://localhost:3000

# Puertos
API_PORT=3000
ADMIN_PORT=3001
WEB_PORT=3002
```

---

## 🔧 DESARROLLO - Scripts

### Opción A: Script Simple (Recomendado)

```powershell
# Desde PowerShell
.\scripts\dev-start-simple.ps1

# O desde el batch
dev-start.bat

# O con pnpm
pnpm dev:start:simple
```

**¿Qué hace?**
1. `pnpm install`
2. `docker compose -f docker-compose.dev.yml up -d` (solo infra)
3. Espera 20s
4. Build de `shared`
5. `db:push` con confirmación automática
6. `pnpm dev` (hot-reload)

### Opción B: Script Completo (con healthchecks)

```powershell
.\scripts\dev-start-full.ps1
# o
pnpm dev:start
```

**Ventaja:** Verifica que PostgreSQL, MinIO y Valkey estén realmente saludables antes de continuar.

**Parámetros:**
```powershell
.\scripts\dev-start-full.ps1 -SkipInstall      # Omite pnpm install
.\scripts\dev-start-full.ps1 -SkipBuild        # Omite build de shared
.\scripts\dev-start-full.ps1 -SkipMigrations   # Omite db:push
.\scripts\dev-start-full.ps1 -ResetDb          # Borra y recrea la DB
```

### Opción C: Manual (para debugging)

```bash
# 1. Infraestructura
docker compose -f docker-compose.dev.yml up -d

# 2. Esperar...
sleep 20

# 3. Dependencias y build
pnpm install
pnpm --filter @gremius/shared build

# 4. Migraciones
cd apps/api
echo "y" | pnpm db:push
cd ../..

# 5. Iniciar
pnpm dev
```

---

## 🔄 Diferencias Clave

| Aspecto | DESARROLLO | PRODUCCIÓN |
|---------|------------|------------|
| **Comando** | `pnpm dev:start:simple` | `docker compose up -d` |
| **Migraciones** | `db:push` (acepta cambios) | `db:migrate` (seguro) |
| **Código** | Hot-reload local | Pre-compilado en imagen |
| **Apps** | Corren en tu máquina (pnpm dev) | Corren en contenedores |
| **Infra** | Docker (PostgreSQL, MinIO, Valkey) | Docker (todo incluido) |
| **Debug** | ✅ Fácil (breakpoints, logs) | ⚠️ Más complejo |

---

## 🆘 Solución de Problemas

### Error: "Port already in use"

```bash
# Ver qué usa el puerto
netstat -ano | findstr :3000

# Cambiar en .env
API_PORT=3003
ADMIN_PORT=3004
WEB_PORT=3005
```

### Error: "Database does not exist"

```bash
# En desarrollo: reiniciar DB
docker compose -f docker-compose.dev.yml down -v
docker compose -f docker-compose.dev.yml up -d

# En producción: verificar POSTGRES_DB en .env
```

### Error: "Migration failed"

```bash
# Ver estado de migraciones
cd apps/api
pnpm db:studio

# Resetear (⚠️ borra datos)
pnpm db:push --force
```

### Contenedor no inicia

```bash
# Ver logs
docker compose logs gremius_api

# Reconstruir
docker compose up -d --build --no-deps gremius_api
```

---

## 📝 Resumen de Comandos

```bash
# === PRODUCCIÓN ===
docker compose up -d              # Iniciar todo
docker compose down               # Detener
docker compose logs -f            # Ver logs
docker compose up -d --build      # Reconstruir e iniciar

# === DESARROLLO ===
pnpm dev:start:simple             # Iniciar con script simple
pnpm dev:start                    # Iniciar con healthchecks
pnpm dev:infra                    # Solo infraestructura Docker
pnpm dev:down                     # Detener infraestructura
pnpm dev                          # Solo iniciar apps (ya está todo listo)
```

---

## 🎉 Primera vez en producción

```bash
# 1. Copiar y configurar .env
cp .env.example .env
# Editar .env con tus valores

# 2. Iniciar
docker compose up -d

# 3. Crear bucket en MinIO (primera vez)
# Ir a http://localhost:9001
# Login con S3_ACCESS_KEY / S3_SECRET_KEY
# Crear bucket "gremius-uploads"

# 4. Acceder al admin
# http://localhost:3001/admin
# Crear primer usuario admin

# 5. ¡Listo!
```

---

¿Preguntas? Revisa el archivo `ARCHITECTURE.md` para más detalles técnicos.
