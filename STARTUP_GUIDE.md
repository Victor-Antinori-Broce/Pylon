# 🚀 GremiusCMS — Guía de Configuración y Desarrollo

Bienvenido al sistema GremiusCMS. Esta guía detalla los pasos para levantar el entorno completo, gestionar la arquitectura modular y validar las integraciones de infraestructura.

---

## 📋 Requisitos Previos

- **Bun**: 1.1+ (Runtime principal de la API)
- **Node.js**: 20+ (Para el frontend Astro)
- **pnpm**: 9+
- **Docker + Docker Compose**: v2+

---

## 🏗️ Paso 1: Infraestructura Base

GremiusCMS utiliza una infraestructura moderna basada en contenedores.

```bash
# Iniciar base de datos, almacenamiento S3 y cache
docker compose up -d
```

**Servicios levantados:**
- **PostgreSQL 16**: Capa de persistencia relacional.
- **Valkey / DragonflyDB**: Fork optimizado de Redis para colas de BullMQ y cache.
- **MinIO**: Almacenamiento de objetos S3 para media.

---

## ⚡ Paso 2: Configuración del Entorno

1. Copia el archivo de ejemplo:
   ```bash
   cp apps/api/.env.example apps/api/.env
   ```

2. Variables críticas en `.env`:
   - `DATABASE_URL`: Conexión a Postgres.
   - `VALKEY_URL`: Url de Valkey (ej. `redis://localhost:6379`).
   - `BETTER_AUTH_SECRET`: Clave aleatoria para seguridad de sesiones.

---

## 📦 Paso 3: Gestión de Arquitectura Modular

GremiusCMS es **Modular por Diseño**. No necesitas cargar código que no usas.

### Habilitar Módulos
Edita `apps/api/gremius.config.ts`:
```typescript
const config: GremiusConfig = {
  modules: [
    "booking",   // Sistema de Reservas
    "directory", // Directorio de Empleados
    "academy",   // LMS / Academia
    "dms",       // Gestión Documental
    "formulas",  // Motor de KPIs
  ],
};
```

**¿Cómo funciona?**
Al arrancar, el `module-loader` importa dinámicamente las rutas Hono, los servicios y fusiona los esquemas de Drizzle de los módulos activos. Si un módulo no está en la lista, sus tablas no aparecerán en la DB y sus rutas devolverán 404.

---

## 🤖 Uso del Formato TOON (AI Optimization)

TOON es un formato ultra-compacto para agentes de IA.

### Probar TOON:
```bash
# Usando Header
curl http://localhost:3001/api/custom/academy/courses -H "Accept: application/vnd.toon"

# Usando Query Param
curl http://localhost:3001/api/custom/academy/courses?format=toon
```

---

## 🛠️ Comandos de Desarrollo Frecuentes

### Base de Datos (Drizzle)
Desde la raíz o en `apps/api`:
- `pnpm db:push`: Sincroniza el esquema consolidado (Core + Módulos) con la DB.
- `pnpm db:seed`: Puebla la base de datos con un superadmin y datos de prueba.
- `pnpm db:studio`: Abre una interfaz web para ver los datos.

### Infraestructura (Valkey)
```bash
# Verificar conexión
docker exec -it gremius-cache redis-cli ping

# Ver tareas pendientes en colas (BullMQ)
docker exec -it gremius-cache redis-cli keys "bull:*"
```

---

## 📊 Inventario de Módulos Core

| Módulo | Key | Base URL | Rol |
|:---|:---|:---|:---|
| **Academy** | `academy` | `/api/custom/academy` | Creador de cursos, tests y diplomas. |
| **DMS** | `dms` | `/api/custom/docs` | Aprobación de manuales y documentos. |
| **Booking** | `booking` | `/api/custom/reservations` | Alquiler de espacios y recursos. |
| **Directory** | `directory` | `/api/custom/directorio` | Gestión de headcount y departamentos. |
| **Formulas** | `formulas` | `/api/custom/formulas` | Generador dinámico de KPIs matemáticos. |
| **CRM** | `gremius-crm` | — | Automatización de pipeline de ventas. |

---

## ❓ Troubleshooting Común

**1. Error: "Valkey not available"**
Verifica que el contenedor `gremius-cache` esté corriendo: `docker compose ps`. Asegúrate de que `VALKEY_URL` sea el puerto correcto.

**2. Error de tipos en Drizzle**
Si has habilitado un nuevo módulo, ejecuta `pnpm db:push` para que las tablas existan antes de que la API intente consultarlas.

**3. TOON devuelve JSON**
Verifica que estás pasando el header `Accept: application/vnd.toon` correctamente o que el query param no tenga errores tipográficos.
