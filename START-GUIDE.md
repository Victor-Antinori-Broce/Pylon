# 🚀 Guía de Inicio - Gremius

> **Elige tu camino.** Gremius puede usarse de dos formas: como backend instantáneo que tu IA configura, o como framework que modificas a tu gusto.

---

## 🎮 ¿Cuál eres tú?

| 🎮 **Vibecoder** | 🛠️ **Developer** |
|:---:|:---:|
| Uso Cursor, Bolt, v0 o Replit para construir apps | Sé TypeScript y quiero entender/modificar el framework |
| No quiero tocar SQL ni migraciones | Quiero crear grimoires propios o modificar el core |
| Quiero un backend funcional en 5 minutos | Necesito hot-reload, breakpoints y tests |
| Mi IA (Claude/Cursor) configura todo por MCP | Quiero entender cómo funciona el engine por dentro |
| **→ Modo Vibecoder** | **→ Modo Developer** |

---

## 🎮 Modo Vibecoder (Rápido)

> Backend funcional en **3 comandos**. Sin pnpm. Sin builds. Sin migraciones manuales.

### Requisitos
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) instalado
- [Git](https://git-scm.com/) instalado

### Paso 1: Crear proyecto

```bash
npx gremius init my-app
# o con template: npx gremius init my-app --template blog
```

### Paso 2: Iniciar todo

```bash
cd my-app
./init.sh        # Linux/Mac
init.bat         # Windows
```

La primera vez clona el código fuente de Gremius y compila (~2-3 minutos).

### Paso 3: Acceder

| Servicio | URL | Para qué sirve |
|----------|-----|----------------|
| **API** | http://localhost:3000 | Tu backend (REST API + MCP) |
| **Admin** | http://localhost:3001/admin | Panel de gestión |
| **Docs** | http://localhost:3000/api/swagger | Documentación OpenAPI |

### ✅ Listo

Tu backend está corriendo. Ahora puedes:

| Servicio | URL | Para qué sirve |
|----------|-----|----------------|
| **API** | http://localhost:3000 | Tu backend (REST API + MCP) |
| **Admin** | http://localhost:3001/admin | Panel de gestión |
| **Docs** | http://localhost:3001/api/docs | Documentación OpenAPI |

### Paso 3: Crear tu primer usuario

Ve a http://localhost:3001/admin y sigue el wizard de setup.

### ✅ Listo

Tu backend está corriendo. Ahora puedes:
- Conectar **Cursor/Claude** vía MCP: [docs/vibecoder/MCP_SETUP_GUIDE.md](docs/vibecoder/MCP_SETUP_GUIDE.md)
- Crear datasets desde el admin sin escribir SQL
- Consumir la API REST desde tu frontend

### Comandos útiles

```bash
# Ver logs
docker compose logs -f

# Detener
docker compose down

# Detener y borrar todo (⚠️ datos incluidos)
docker compose down -v

# Cambiar template después de crear
# Edita realm.json y reinicia: docker compose up -d --build
```

---

## 🛠️ Modo Developer (Control Total)

> Quieres modificar grimoires, crear features, o contribuir al core. Necesitas el stack completo.

### Requisitos
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [pnpm](https://pnpm.io/installation) (>= 9.0)
- [Bun](https://bun.sh/) (>= 1.1)
- Node.js >= 20.0.0

### Paso 1: Crear proyecto developer

```bash
npx gremius init my-app --mode developer
# o con template: npx gremius init my-app --mode developer --template saas
```

Esto genera una estructura de monorepo con `docker-compose.yml` (solo infra), `schemas/`, `grimoires/`, etc.

### Paso 2: Iniciar stack

```bash
cd my-app
docker compose up -d          # Start Postgres, Valkey, MinIO
pnpm install                  # Install dependencies
pnpm dev:start:simple         # Start API + Admin with hot-reload
```

### Opción A: Script Simple (Recomendado)

Si ya tienes el monorepo clonado:

```powershell
# PowerShell
.\scripts\dev-start-simple.ps1

# O batch (doble clic)
dev-start.bat

# O pnpm
pnpm dev:start:simple
```

**¿Qué hace?**
1. `pnpm install`
2. `docker compose -f docker-compose.dev.yml up -d` (solo infra: PostgreSQL, MinIO, Valkey)
3. Espera 20s a que la DB esté lista
4. Build de `@gremius/shared`
5. `db:push` con confirmación automática
6. `pnpm dev` (hot-reload de API + Admin)

### Opción B: Script Completo (con healthchecks)

```powershell
.\scripts\dev-start-full.ps1
# o
pnpm dev:start
```

**Ventaja:** Verifica que PostgreSQL, MinIO y Valkey estén saludables antes de continuar.

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

# 2. Esperar a que PostgreSQL esté listo
sleep 20

# 3. Dependencias y build
pnpm install
pnpm --filter @gremius/shared build

# 4. Migraciones
cd apps/api
echo "y" | pnpm db:push
cd ../..

# 5. Iniciar en modo dev (hot-reload)
pnpm dev
```

---

## 🔄 Diferencias entre modos

| Aspecto | 🎮 Vibecoder | 🛠️ Developer |
|---------|-------------|--------------|
| **Inicio** | `npx gremius init my-app` | `npx gremius init my-app --mode developer` |
| **Comando** | `./init.sh` | `pnpm dev:start:simple` |
| **Código** | Build desde fuente en Docker | Hot-reload local |
| **Infra** | Todo en contenedores | Solo DB/Cache en Docker. Apps locales |
| **Debug** | ⚠️ Requiere entrar al contenedor | ✅ Breakpoints, logs fácil |
| **Modificar core** | ❌ No | ✅ Sí |
| **Crear grimoires** | ⚠️ Solo instalar existentes | ✅ Desarrollar nuevos |
| **Ideal para** | Probar, MVP, side-projects | Contribuir, extender, enterprise |

---

## 🆘 Solución de Problemas

### "Port already in use"

```bash
# Ver qué usa el puerto
netstat -ano | findstr :3000

# Cambiar en .env
API_PORT=3003
ADMIN_PORT=3004
WEB_PORT=3005
```

### "Database does not exist"

```bash
# Modo Vibecoder: reiniciar todo
docker compose down -v
docker compose up -d

# Modo Developer: reiniciar solo DB
docker compose -f docker-compose.dev.yml down -v
docker compose -f docker-compose.dev.yml up -d
```

### "Migration failed" (solo Developer)

```bash
cd apps/api
pnpm db:studio        # Ver estado
pnpm db:push --force  # Resetear (⚠️ borra datos)
```

### Contenedor no inicia (solo Vibecoder)

```bash
# Ver logs del contenedor
docker compose logs -f gremius_api

# Reconstruir imágenes
docker compose up -d --build
```

---

## 📝 Resumen de Comandos

```bash
# === 🎮 MODO VIBECODER ===
npx gremius init my-app           # Crear proyecto
npx gremius init my-app --template blog --start  # Crear y arrancar
./init.sh                         # Clonar fuente e iniciar
docker compose up -d --build      # Reconstruir y arrancar
docker compose down               # Detener
docker compose logs -f            # Ver logs

# === 🛠️ MODO DEVELOPER ===
npx gremius init my-app --mode developer         # Crear proyecto
pnpm dev:start:simple             # Script simple (recomendado)
pnpm dev:start                    # Script con healthchecks
pnpm dev:infra                    # Solo infraestructura Docker
pnpm dev:down                     # Detener infraestructura
pnpm dev                          # Solo apps (infra ya lista)
```

---

## 🎯 Próximos pasos

| Si eres... | Ve a... |
|-----------|---------|
| 🎮 **Vibecoder** con Cursor/Claude | [docs/vibecoder/MCP_SETUP_GUIDE.md](docs/vibecoder/MCP_SETUP_GUIDE.md) |
| 🎮 **Vibecoder** que quiere templates | `npx gremius init my-app --template blog` (también: saas, ecommerce) |
| 🛠️ **Developer** que quiere entender la arquitectura | [ARCHITECTURE.md](ARCHITECTURE.md) |
| 🛠️ **Developer** que quiere crear grimoires | [docs/internal/GRIMOIRE_ZERO_CONFIG.md](docs/internal/GRIMOIRE_ZERO_CONFIG.md) |
| 🛠️ **Developer** que quiere el roadmap técnico | [backendbaas.md](backendbaas.md) |

---

## 💡 Nota para vibecoders

> No necesitas entender qué es `pnpm`, `db:push`, o `drizzle-orm`.
> 
> Si tu IA (Cursor/Claude) te pide un backend, dale la URL `http://localhost:3001/api/mcp` y deja que configure todo por ti.
>
> Si algo falla, usa **Modo Vibecoder** → `docker compose down -v` → `docker compose up -d`. Eso reinicia todo a cero.

---

*¿Preguntas? Elige tu camino arriba y sigue los pasos. Si te atoras en modo Vibecoder, pregunta a tu IA. Si te atoras en modo Developer, revisa `ARCHITECTURE.md`.*
