# 🐳 GremiusCMS - Configuración Docker

## ✅ Archivos Actualizados

### Producción (Recomendado para servidores)
- **`docker-compose.yml`** - Inicia TODO: DB, Cache, Storage, API, Admin, Web
- **`docker/Dockerfile.prod`** - Multi-stage build (API + Admin + Web en uno)
- **`docker/migrate.sh`** - Script de migraciones seguras

### Desarrollo (Local)
- **`docker-compose.dev.yml`** - Solo infraestructura (DB, MinIO, Valkey)
- **`scripts/dev-start-*.ps1`** - Scripts para iniciar en dev

---

## 🚀 Uso en PRODUCCIÓN

### 1. Configurar variables de entorno

```bash
cp .env.example .env
# Editar .env con valores de producción
```

Variables mínimas requeridas:
```env
POSTGRES_PASSWORD=password_seguro
S3_SECRET_KEY=secret_key_seguro
BETTER_AUTH_SECRET=jwt_secret_muy_largo_32_chars_min
```

### 2. Iniciar

```bash
docker compose up -d
```

O simplemente haz doble clic en **`start.bat`** (Windows).

### 3. Configurar MinIO (primera vez)

```bash
# Abrir http://localhost:9001
# Login con S3_ACCESS_KEY / S3_SECRET_KEY
# Crear bucket: gremius-uploads (o el nombre que configuraste)
```

### 4. Acceder

- **Panel Admin**: http://localhost:3001/admin
- **API**: http://localhost:3000
- **Web**: http://localhost:3002

---

## 🔧 Uso en DESARROLLO

### Opción 1: Script automático

```powershell
.\scripts\dev-start-simple.ps1
```

### Opción 2: Comandos manuales

```bash
# Infraestructura
docker compose -f docker-compose.dev.yml up -d

# Dependencias y build
pnpm install
pnpm --filter @gremius/shared build

# Migraciones (con confirmación)
cd apps/api
echo "y" | pnpm db:push
cd ../..

# Iniciar apps
pnpm dev
```

---

## 📊 Diferencias entre Dev y Prod

| Característica | Desarrollo | Producción |
|----------------|------------|------------|
| **Archivo compose** | `docker-compose.dev.yml` | `docker-compose.yml` |
| **Apps** | Corren local (`pnpm dev`) | En contenedores |
| **Migraciones** | `db:push` (auto-acepta) | `db:migrate` (seguro) |
| **Hot reload** | ✅ Sí | ❌ No |
| **Puertos expuestos** | Todos (5432, 9000, etc.) | Solo apps (3000, 3001, 3002) |
| **Optimización** | Rápido | Optimizado |

---

## 🗂️ Dockerfiles Disponibles

| Dockerfile | Uso | Estado |
|------------|-----|--------|
| `Dockerfile.prod` | Producción (multi-stage) | ✅ **USAR ESTE** |
| `Dockerfile.dev` | Desarrollo con auto-setup | ✅ Opcional |
| `Dockerfile.api` | API individual (antiguo) | ⚠️ Legacy |
| `Dockerfile.web` | Web individual (antiguo) | ⚠️ Legacy |
| `Dockerfile.admin` | Admin individual (antiguo) | ⚠️ Legacy |
| `Dockerfile.cms` | CMS (antiguo) | ⚠️ Legacy |

**Nota**: Los archivos "Legacy" se mantienen por compatibilidad. El nuevo `Dockerfile.prod` reemplaza a todos los individuales con un build multi-stage más eficiente.

---

## 🆘 Troubleshooting

### "Bind for 0.0.0.0:3000 failed"

El puerto está ocupado. Cambia en `.env`:
```env
API_PORT=3003
ADMIN_PORT=3004
WEB_PORT=3005
```

### "relation does not exist"

Las migraciones no se ejecutaron. En producción:
```bash
docker compose exec gremius_api bun run db:migrate
```

### Permisos de MinIO

Si hay errores de S3, asegúrate de:
1. Crear el bucket en http://localhost:9001
2. Verificar S3_BUCKET en `.env` coincide con el nombre del bucket

### Limpiar todo (⚠️ borra datos)

```bash
# Producción
docker compose down -v

# Desarrollo
docker compose -f docker-compose.dev.yml down -v
```

---

## 📖 Comandos Útiles

```bash
# Ver estado
docker compose ps

# Ver logs
docker compose logs -f
docker compose logs -f gremius_api

# Reiniciar un servicio
docker compose restart gremius_api

# Ejecutar comandos en un contenedor
docker compose exec gremius_api sh

# Reconstruir imagen
docker compose up -d --build gremius_api
```
