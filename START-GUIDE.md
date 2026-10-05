# 🚀 Guía de Inicio - Kitsuden

> **Elige tu camino.** Kitsuden puede usarse de dos formas: como backend instantáneo que tu IA configura, o como framework que modificas a tu gusto.

---

## 🎮 ¿Cuál eres tú?

|                 🎮 **Vibecoder**                  |                    🛠️ **Developer**                    |
| :-----------------------------------------------: | :----------------------------------------------------: |
| Uso Cursor, Bolt, v0 o Replit para construir apps | Sé TypeScript y quiero entender/modificar el framework |
|        No quiero tocar SQL ni migraciones         |     Quiero crear kons propios o modificar el core      |
|     Quiero un backend funcional en 5 minutos      |        Necesito hot-reload, breakpoints y tests        |
|   Mi IA (Claude/Cursor) configura todo por MCP    |   Quiero entender cómo funciona el engine por dentro   |
|               **→ Modo Vibecoder**                |                  **→ Modo Developer**                  |

---

## 🎮 Modo Vibecoder (Rápido)

> Backend funcional en **3 comandos**. Sin pnpm. Sin builds. Sin migraciones manuales.

### Requisitos

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) instalado
- [Git](https://git-scm.com/) instalado

### Paso 1: Crear proyecto

```bash
npx kitsuden init my-app
# o con template: npx kitsuden init my-app --template blog
```

### Paso 2: Iniciar todo

```bash
cd my-app
./init.sh        # Linux/Mac
init.bat         # Windows
```

La primera vez clona el código fuente de Kitsuden y compila (~2-3 minutos).

### Paso 3: Acceder

| Servicio  | URL                            | Para qué sirve                     |
| --------- | ------------------------------ | ---------------------------------- |
| **API**   | http://localhost:3000          | Tu backend (REST API + MCP)        |
| **Admin** | http://localhost:3001/admin    | Panel de gestión                   |
| **Docs**  | http://localhost:3000/api/docs | Documentación OpenAPI (Swagger UI) |

### ✅ Listo

Tu backend está corriendo. Ahora puedes:

- Conectar **Cursor/Claude** vía MCP: [docs/vibecoder/MCP_SETUP_GUIDE.md](docs/vibecoder/MCP_SETUP_GUIDE.md)
- Crear datasets desde el admin sin escribir SQL
- Consumir la API REST desde tu frontend

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
# Edita grimoire.json y reinicia: docker compose up -d --build
```

---

## 🛠️ Modo Developer (Control Total)

> Quieres modificar kons, crear features, o contribuir al core. Necesitas el stack completo.

### Requisitos

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [pnpm](https://pnpm.io/installation) (>= 9.0)
- [Bun](https://bun.sh/) (>= 1.1)
- Node.js >= 20.0.0

### Paso 1: Crear proyecto developer

```bash
npx kitsuden init my-app --mode developer
# o con template: npx kitsuden init my-app --mode developer --template saas
```

Esto genera una estructura de monorepo con `docker-compose.yml` (solo infra), `schemas/`, `kons/`, etc.

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
4. Build de `@kitsuden/shared`
5. `db:push` con confirmación automática
6. `pnpm dev` (hot-reload de API + Admin)

> **Puertos en modo Developer:** La API corre en `http://localhost:3000` y el Admin (Vite) en `http://localhost:5173`. En modo Vibecoder (Docker) el Admin se sirve en `http://localhost:3001`.

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
pnpm --filter @kitsuden/shared build

# 4. Migraciones
cd apps/api
echo "y" | pnpm db:push
cd ../..

# 5. Iniciar en modo dev (hot-reload)
pnpm dev
```

---

## 🔄 Diferencias entre modos

| Aspecto            | 🎮 Vibecoder                     | 🛠️ Developer                                |
| ------------------ | -------------------------------- | ------------------------------------------- |
| **Inicio**         | `npx kitsuden init my-app`       | `npx kitsuden init my-app --mode developer` |
| **Comando**        | `./init.sh`                      | `pnpm dev:start:simple`                     |
| **Código**         | Build desde fuente en Docker     | Hot-reload local                            |
| **Infra**          | Todo en contenedores             | Solo DB/Cache en Docker. Apps locales       |
| **Debug**          | ⚠️ Requiere entrar al contenedor | ✅ Breakpoints, logs fácil                  |
| **Modificar core** | ❌ No                            | ✅ Sí                                       |
| **Crear kons**     | ⚠️ Solo instalar existentes      | ✅ Desarrollar nuevos                       |
| **Ideal para**     | Probar, MVP, side-projects       | Contribuir, extender, enterprise            |

---

## 🆘 Solución de Problemas

### "Port already in use"

```bash
# Ver qué usa el puerto
netstat -ano | findstr :3000

# Cambiar en .env
API_PORT=3003
ADMIN_PORT=3004
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

### Tests fallan por timeout o PostgreSQL no disponible

```bash
# Levantar PostgreSQL dedicado para tests (puerto 5433)
pnpm test:db:up

# Correr tests con PostgreSQL real (recomendado)
cd apps/api
pnpm test

# O en una sola línea (levanta DB, corre tests, baja DB)
pnpm test:all

# Para usar pg-mem en memoria (más rápido pero menos compatible)
KITSUDEN_TEST_DB=memory pnpm test

# Bajar PostgreSQL de tests
pnpm test:db:down
```

> **Recomendación:** Usa PostgreSQL real para tests. Es el estándar en CI y
> garantiza compatibilidad total. `pg-mem` es útil para desarrollo rápido sin Docker.

### Contenedor no inicia (solo Vibecoder)

```bash
# Ver logs del contenedor
docker compose logs -f kitsuden_api

# Reconstruir imágenes
docker compose up -d --build
```

---

## 🔐 Autenticación y Agentes (NHI)

Kitsuden v0.8.0+ utiliza un sistema de identidades no humanas (**Agents NHI**) con tokens `kitsuden_agent_*`.

- **Legacy API Keys**: Los tokens `kitsuden_sk_*` están **deprecados** y dejarán de funcionar el **2026-08-01**.
- **Migración**: Ejecuta `pnpm auth:migrate` para convertir tus llaves legacy en Agentes.
- **RBAC granular**: Los agentes usan _scopes_ para limitar su acceso:
  - `admin:*`: Super-usuario (acceso total).
  - `read:*` / `write:*`: Wildcards de acción.
  - `*:dataset`: Acceso total a un recurso específico.
  - `dataset:read`, `media:write`, `mcp:connect`, etc.

Para crear un nuevo agente:

```bash
# Usa el playground en el admin o la API:
POST /api/admin/agents
{
  "name": "Mi Bot",
  "scopes": ["dataset:read", "mcp:connect"]
}
```

---

## 📝 Resumen de Comandos

```bash
# === 🎮 MODO VIBECODER ===
npx kitsuden init my-app           # Crear proyecto
npx kitsuden init my-app --template blog --start  # Crear y arrancar
./init.sh                         # Clonar fuente e iniciar
docker compose up -d --build      # Reconstruir y arrancar
docker compose down               # Detener
docker compose logs -f            # Ver logs

# === 🛠️ MODO DEVELOPER ===
npx kitsuden init my-app --mode developer         # Crear proyecto
pnpm dev:start:simple             # Script simple (recomendado)
pnpm dev:start                    # Script con healthchecks
pnpm dev:infra                    # Solo infraestructura Docker
pnpm dev:down                     # Detener infraestructura
pnpm dev                          # Solo apps (infra ya lista)

# === 🧪 TESTS ===
pnpm test:db:up                   # Levantar PostgreSQL de tests (puerto 5433)
pnpm test:db:down                 # Bajar PostgreSQL de tests
pnpm test:all                     # Tests con PostgreSQL real (cierra DB al final)
cd apps/api && pnpm test          # Tests rápidos (asume DB levantada)
KITSUDEN_TEST_DB=memory pnpm test  # Tests con pg-mem (sin Docker)
```

---

## 🎯 Próximos pasos

| Si eres...                                           | Ve a...                                                                |
| ---------------------------------------------------- | ---------------------------------------------------------------------- |
| 🎮 **Vibecoder** con Cursor/Claude                   | [docs/vibecoder/MCP_SETUP_GUIDE.md](docs/vibecoder/MCP_SETUP_GUIDE.md) |
| 🎮 **Vibecoder** que quiere templates                | `npx kitsuden init my-app --template blog` (también: saas, ecommerce)  |
| 🛠️ **Developer** que quiere entender la arquitectura | [ARCHITECTURE.md](ARCHITECTURE.md)                                     |
| 🛠️ **Developer** que quiere crear kons               | [docs/internal/KON_ZERO_CONFIG.md](docs/internal/KON_ZERO_CONFIG.md)   |
| 🛠️ **Developer** que quiere el roadmap técnico       | [backendbaas.md](backendbaas.md)                                       |

---

## 💡 Nota para vibecoders

> No necesitas entender qué es `pnpm`, `db:push`, o `drizzle-orm`.
>
> Si tu IA (Cursor/Claude) te pide un backend, dale la URL `http://localhost:3000/api/mcp` y deja que configure todo por ti.
>
> Si algo falla, usa **Modo Vibecoder** → `docker compose down -v` → `docker compose up -d`. Eso reinicia todo a cero.

---

_¿Preguntas? Elige tu camino arriba y sigue los pasos. Si te atoras en modo Vibecoder, pregunta a tu IA. Si te atoras en modo Developer, revisa `ARCHITECTURE.md`._
