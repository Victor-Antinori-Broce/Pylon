# Análisis de Problemas en el Panel de Svelte

## Resumen Ejecutivo

Se identificaron varios problemas en el panel de administración de Svelte relacionados con:
1. Nomenclatura incorrecta (Modules/Themes en lugar de Grimoires/Realms)
2. Rutas de API incorrectas causando errores 404 y 500
3. Vistas incompletas mostrando "Migration in progress"

---

## 1. Problemas de Nomenclatura

### Ubicación: `apps/admin/src/lib/components/layout/SidebarLayout.svelte`

**Problema:** El menú lateral muestra:
- "Modules" (línea 35) → Debe ser **"Grimoires"**
- "Themes" (línea 36) → Debe ser **"Realms"**

```svelte
const bottomNavItems: { path: string; label: string; icon: Component }[] = [
  { path: "/workers", label: "Workers", icon: Zap },
  { path: "/webhooks", label: "Webhooks", icon: Webhook },
  { path: "/modules", label: "Modules", icon: Puzzle },      // ❌ "Grimoires"
  { path: "/themes", label: "Themes", icon: Palette },       // ❌ "Realms"
  { path: "/settings", label: "Settings", icon: Settings },
];
```

### Vistas afectadas:

| Archivo | Problema |
|---------|----------|
| `apps/admin/src/views/Modules.svelte` | Muestra "Modules" como título (línea 12) y "Migration in progress" |
| `apps/admin/src/views/themes/ThemesView.svelte` | Es para cambiar colores del panel, no para gestionar Realms |

---

## 2. Errores de Rutas API (404/500)

### Blog Posts - Error 404

**Frontend:** `apps/admin/src/views/content/PostsView.svelte` (línea 20)
```typescript
const data = await api.get<{ docs: Post[] }>("/posts");
```

**Backend:** `apps/api/src/index.ts` (línea 214)
```typescript
// La ruta blogRoutes NUNCA se monta en la aplicación principal!
import { blogRoutes } from "./routes/blog";  // ❌ No importado
// ...
// app.route("/api/blog", blogRoutes);  // ❌ No montado
```

**Problema:** El backend define `blogRoutes` en `apps/api/src/routes/blog.ts` pero **nunca lo monta** en la aplicación principal.

### Datasets - Error 500

**Frontend:** `apps/admin/src/lib/states/datasets.svelte.ts` (línea 66)
```typescript
const response = await fetch(`${API_URL}/api/datasets`);
```

**Backend:** `apps/api/src/index.ts` (línea 215)
```typescript
app.route("/api/data-sets", dataSetsFullRoutes);
```

**Problema:** El frontend usa `/api/datasets` pero el backend expone `/api/data-sets` (con guión).

### Settings General - "Pending migrations"

**Archivo:** `apps/admin/src/views/Settings.svelte` (línea 137-139)
```svelte
{#if activeTab === 'general'}
  <div class="card p-12 text-center">
    <p class="text-gremius-subtle">General settings view - Migration in progress</p>
  </div>
```

---

## 3. Jerarquía Conceptual Actual vs Esperada

### Conceptos del Sistema (según la arquitectura actual):

| Concepto | Definición | Ubicación en Código |
|----------|------------|---------------------|
| **Grimoires** | Bloques de código individuales (antes "modules") | `packages/grimoires/` |
| **Realms** | Ecosistemas de negocio que agrupan grimoires (antes "themes") | `packages/realms/` |
| **Themes** (UI) | Configuración visual del panel (colores, estilos) | `apps/admin/src/lib/theme.svelte.ts` |

### Configuración de Realms:

Los realms se configuran en:
- `packages/realms/realm-esports/realm.json`
- `packages/realms/realm-corporate/realm.json`
- `packages/realms/realm-default/realm.json`

Ejemplo de `realm.json`:
```json
{
  "id": "realm-esports",
  "name": "Gremius Esports",
  "type": "realm",
  "grimoires": ["games", "streamers", "platforms", "tags", "collections"]
}
```

---

## 4. Problemas Específicos por Módulo

### Módulos/Grimoires (`/modules`)
- **Estado:** Vista placeholder con "Migration in progress"
- **Debería:** Mostrar lista de Grimoires disponibles, permitir activar/desactivar
- **API:** `GET /api/modules` existe en `apps/api/src/routes/modules.ts`

### Themes/Realms (`/themes`)
- **Estado Actual:** Selector de tema visual (colores) del panel
- **Problema:** No hay vista para gestionar Realms (colecciones de grimoires)
- **Debería:** 
  - Mover selector de tema visual a Settings
  - Crear nueva vista Realms para gestionar realms

### Blog Posts (`/posts`)
- **Estado:** Error 404
- **Causa:** La ruta `/api/blog` no está montada en el backend
- **Fix:** Agregar `app.route("/api/blog", blogRoutes)` en `apps/api/src/index.ts`

### Datasets (`/datasets`)
- **Estado:** Error 500 (ruta incorrecta)
- **Causa:** Frontend usa `/api/datasets`, backend tiene `/api/data-sets`
- **Fix:** Unificar rutas (recomendado: usar `/api/datasets`)

---

## 5. Recomendaciones de Fix

### Prioridad Alta (Errores 404/500)

1. **Fix Blog Posts:**
   ```typescript
   // apps/api/src/index.ts
   import { blogRoutes } from "./routes/blog";
   // ...
   app.route("/api/blog", blogRoutes);
   ```

2. **Fix Datasets API:**
   ```typescript
   // apps/api/src/index.ts (línea 215)
   app.route("/api/datasets", dataSetsFullRoutes);  // sin guión
   ```

3. **Fix API Client:**
   ```typescript
   // apps/admin/src/lib/api.ts (línea 82)
   getPosts(params?: ...) {
     return this.request<PaginatedResponse<BlogPost>>(`/blog?${q}`);  // /blog no /blog-posts
   }
   ```

### Prioridad Media (Nomenclatura)

4. **Actualizar Sidebar:**
   - "Modules" → "Grimoires"
   - "Themes" → "Realms"

5. **Crear vista de Realms:**
   - Nueva ruta `/realms`
   - Permitir seleccionar realm activo
   - Mostrar grimoires incluidos

6. **Mover Theme UI:**
   - Mover selector de tema visual a Settings → Appearance

### Prioridad Baja (Vistas completas)

7. **Completar Settings General:**
   - Agregar campos reales de configuración
   - Conectar con API `/api/settings`

8. **Completar Grimoires:**
   - Lista de grimoires disponibles
   - Toggle para activar/desactivar
   - Mostrar dependencias

---

## Archivos Clave para Modificar

### Backend (API)
| Archivo | Líneas | Cambio |
|---------|--------|--------|
| `apps/api/src/index.ts` | ~214-215 | Montar blogRoutes, fix datasets path |
| `apps/api/src/routes/blog.ts` | - | Ya existe pero no se usa |

### Frontend (Admin)
| Archivo | Líneas | Cambio |
|---------|--------|--------|
| `apps/admin/src/lib/components/layout/SidebarLayout.svelte` | 35-36 | Renombrar etiquetas |
| `apps/admin/src/lib/api.ts` | 77-89 | Fix endpoint de posts |
| `apps/admin/src/views/Modules.svelte` | 12-22 | Completar vista |
| `apps/admin/src/views/Settings.svelte` | 137-139 | Completar General |
| `apps/admin/src/views/themes/ThemesView.svelte` | - | Mover a Settings/Appearance |

---

## Notas Adicionales

### Grimoire Registry
Los grimoires disponibles están definidos en:
`apps/api/src/services/module-registry.ts` (GRIMOIRE_REGISTRY)

Categorías:
- **Core:** promote, webhooks, connectors, blocks, formulas
- **Optional:** academy, dms, booking, directory, gremius-crm, blog
- **Realm:** games, streamers, platforms, tags, collections (requieren realm-esports)

### Realms Disponibles
```
packages/realms/
├── realm-corporate/
├── realm-default/
└── realm-esports/
```

Cada realm tiene un `realm.json` que declara qué grimoires incluye.
