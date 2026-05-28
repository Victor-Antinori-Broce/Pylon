# 🎓 Academy LMS - Setup & Configuration Guide

Guía de configuración para integrar Academy LMS con el sistema de Gremius.

---

## ✅ Estado de Integración

### Registro en Sistema

El Academy LMS ya está **registrado** en el sistema Gremius:

| Componente | Estado | Ubicación |
|------------|--------|-----------|
| GRIMOIRE_REGISTRY | ✅ Registrado | `apps/api/src/services/module-registry.ts` (línea 129) |
| gremius.config.ts | ✅ Incluido | `apps/api/gremius.config.ts` (línea 67) |
| GRIMOIRE_DIR_MAP | ✅ Mapeado | `apps/api/src/lib/module-loader.ts` (línea 343) |

### Configuración de Grimoire

Archivo: `packages/grimoires/grimoire-academy-lms/grimoire.json`

```json
{
  "id": "grimoire-academy-lms",
  "name": "Academy LMS",
  "type": "grimoire",
  "category": "content",
  "mount": {
    "path": "/api/academy",
    "router": "academyLMSRoutes"
  },
  "toggle": {
    "enabledByDefault": false,
    "canDisable": true,
    "requiresRestart": false
  }
}
```

---

## 🔄 Funcionamiento del Toggle

### Cómo Funciona

1. **Registro**: Academy está en `GRIMOIRE_REGISTRY` con categoría `"optional"`
2. **Configuración**: Listado en `gremius.config.ts` → `grimoires: ["academy", ...]`
3. **Carga**: El `module-loader.ts` lo carga dinámicamente desde `packages/grimoires/grimoire-academy-lms/`
4. **Estado**: Se guarda en la tabla `modules` de la base de datos

### API de Toggle

```bash
# Listar todos los módulos con su estado
GET /api/modules

# Verificar si se puede desactivar
GET /api/modules/academy/check

# Activar/Desactivar
PATCH /api/modules/academy
{
  "enabled": true | false
}
```

### Estados del Toggle

| Estado | Comportamiento |
|--------|----------------|
| `enabled: true` | ✅ Rutas montadas en `/api/academy`, visible en sidebar |
| `enabled: false` | ❌ Rutas no disponibles, oculto en sidebar |

---

## 📍 Sidebar Integration

### Vista de Admin

Archivo creado: `packages/admin/src/views/academy/AcademyView.svelte`

El sistema detecta automáticamente la vista si sigue la convención:
- 📁 `packages/admin/src/views/{grimoire-id}/`
- 📄 `{PascalCase(grimoire-id)}View.svelte`

Para Academy:
- 📁 `packages/admin/src/views/academy/`
- 📄 `AcademyView.svelte`

### Detección Automática

El `admin-registry.ts` detecta la vista buscando:
1. `views/academy/AcademyView.svelte` ✅
2. `views/AcademyView.svelte`
3. `views/academy/index.svelte`

### Navegación en Sidebar

```
📊 Dashboard
📁 Content
   ├── 📝 Blog Posts
   ├── 🎓 Academy LMS ← AQUÍ
   └── 🖼️ Media Library
📁 Data
📁 System
```

---

## 🚀 Endpoints Disponibles

Cuando el toggle está **ON**:

### Base URL
```
/api/academy
```

### Endpoints Principales

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/cursos` | Listar cursos |
| POST | `/cursos` | Crear curso |
| GET | `/cursos/:id` | Ver curso |
| GET | `/dashboard` | Métricas |
| GET | `/certificados/:id/pdf` | Descargar PDF |
| GET | `/exportar/asignaciones` | Excel |

### Documentación Completa

Ver: `packages/grimoires/grimoire-academy-lms/API.md`

---

## 🎨 Frontend Components

### Vista Principal (AcademyView.svelte)

Incluye:
- 📊 Stats cards (Cursos, Estudiantes, Completados, Tasa)
- ⚡ Quick actions (Cursos, Grupos, Learning Paths)
- 📚 Lista de cursos recientes
- 📥 Exportaciones (Excel)

### Iconos Usados

```svelte
import { 
  GraduationCap,  // Logo principal
  BookOpen,       // Cursos
  Users,          // Estudiantes
  Trophy,         // Completados
  TrendingUp,     // Tasa éxito
  Route,          // Learning Paths
  Award           // Certificados
} from "lucide-svelte";
```

---

## 🗄️ Tablas de Base de Datos

Al activar el grimoire, se crean automáticamente:

### Tablas Principales (20)
- `perfil_usuario_capacitaciones` - Roles de usuarios
- `cursos` - Cursos disponibles
- `grupos_asignacion` - Grupos de estudiantes
- `modulos` - Módulos de cursos
- `temas` - Contenido de módulos
- `quizzes` - Evaluaciones
- `progreso_cursos` - Progreso por curso
- `learning_paths` - Rutas de aprendizaje
- `certificados` - Certificados generados
- `encuestas_satisfaccion` - Feedback

### Enums (7)
- `rol_capacitaciones` - admin, supervisor, estudiante
- `tipo_curso` - INDUCCION, GESTION, TECNICO, etc.
- `departamento` - 13 departamentos
- `cargo` - 7 niveles de cargo

---

## ⚙️ Configuración Manual (si es necesario)

### 1. Verificar Registro

Asegúrate de que Academy esté en `GRIMOIRE_REGISTRY`:

```typescript
// apps/api/src/services/module-registry.ts
{
  key: "academy",
  name: "Gremius Academy LMS",
  category: "optional",
  // ...
}
```

### 2. Verificar Config

Asegúrate de que Academy esté en `gremius.config.ts`:

```typescript
// apps/api/gremius.config.ts
const GRIMOIRES = [
  // ...
  "academy",  // ← Debe estar aquí
  // ...
];
```

### 3. Activar en Base de Datos

Si necesitas activar manualmente:

```sql
-- Ver estado actual
SELECT * FROM modules WHERE key = 'academy';

-- Activar
UPDATE modules SET enabled = true WHERE key = 'academy';

-- O insertar si no existe
INSERT INTO modules (key, name, enabled, category, settings)
VALUES ('academy', 'Gremius Academy LMS', true, 'optional', '{}');
```

---

## 🧪 Testing

### Verificar Carga

```bash
# Reiniciar servidor
bun run dev:api

# Ver logs - debe aparecer:
# "✅ academy [grimoire, legacy] → /api/academy"
```

### Verificar API

```bash
# Test endpoint
curl http://localhost:3000/api/academy/dashboard \
  -H "Authorization: Bearer TOKEN"

# Response esperado:
# { "metricas": { "totalCursos": 0, ... } }
```

### Verificar Admin

1. Ir a: `http://localhost:5173/admin`
2. Login como admin
3. Verificar que "Academy LMS" aparezca en sidebar
4. Click en Academy → debe mostrar dashboard

---

## 🔧 Troubleshooting

### Problema: No aparece en sidebar

**Causa posible**: El toggle está OFF

**Solución**:
```bash
# Activar via API
curl -X PATCH http://localhost:3000/api/modules/academy \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{"enabled": true}'
```

### Problema: 404 en endpoints

**Causa posible**: Grimoire no cargado

**Solución**:
1. Verificar logs del servidor
2. Revisar que `grimoire-academy-lms/index.ts` exporte `academyLMSRoutes`
3. Reiniciar servidor

### Problema: Error al cargar vista

**Causa posible**: Archivo Svelte no encontrado

**Solución**:
```bash
# Verificar que existe
ls packages/admin/src/views/academy/AcademyView.svelte

# Si no existe, copiar desde el grimoire
cp packages/grimoires/grimoire-academy-lms/admin/AcademyView.svelte \
   packages/admin/src/views/academy/
```

---

## 📊 Flujo de Activación

```
┌─────────────────────────────────────────────────────────────┐
│  1. Usuario activa toggle "Academy LMS" en UI              │
└──────────────────┬──────────────────────────────────────────┘
                   │ PATCH /api/modules/academy
                   │ { enabled: true }
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  2. API actualiza tabla 'modules' en DB                    │
└──────────────────┬──────────────────────────────────────────┘
                   │ UPDATE modules SET enabled = true
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  3. Admin Registry detecta cambio en próximo refresh       │
│     (cache TTL: 60 segundos)                               │
└──────────────────┬──────────────────────────────────────────┘
                   │ GET /api/admin/registry
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  4. Sidebar muestra "Academy LMS"                          │
└──────────────────┬──────────────────────────────────────────┘
                   │ Click en Academy
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  5. Se carga AcademyView.svelte con dashboard              │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎯 Checklist de Verificación

- [x] Academy en GRIMOIRE_REGISTRY
- [x] Academy en gremius.config.ts
- [x] grimoire.json configurado correctamente
- [x] index.ts exporta academyLMSRoutes
- [x] Vista AcademyView.svelte creada
- [x] API endpoints funcionan
- [x] Toggle activa/desactiva correctamente
- [x] Sidebar muestra Academy cuando está activo
- [x] Sidebar oculta Academy cuando está inactivo

---

## 📝 Notas

- **Categoría**: Academy es `"optional"` (no core)
- **Default**: Desactivado por defecto (`enabledByDefault: false`)
- **Restart**: No requiere reinicio (`requiresRestart: false`)
- **Dependencias**: Requiere `users` (core)

---

**Documento creado**: 2024-03-11  
**Versión**: Academy LMS 1.1.0  
**Estado**: ✅ Listo para producción
