# Gremius DMS - Document Management System

Sistema de gestión documental versionado con categorización jerárquica, workflow de aprobación y auditoría completa. Optimizado para manuales y documentación corporativa.

## Características

### 📁 Categorización Jerárquica
- Árbol de categorías ilimitado (max 5 niveles recomendado)
- Path materializado para consultas eficientes
- Metadatos personalizables por categoría
- ACL por categoría (roles y departamentos)

### 🔄 Versionado Semántico
- Formatos: `major.minor.patch` (ej: 2.1.3)
- Tipos de cambio: Major (incompatible), Minor (nueva funcionalidad), Patch (corrección)
- Versiones inmutables una vez publicadas
- Comparación entre versiones
- Restauración a versiones anteriores

### 📋 Workflow de Aprobación
```
Draft → Review Pending → Approved → Published → Archived
         ↓
    Changes Requested → Draft
```

### 🔐 Control de Acceso
- Niveles: `public`, `restricted`, `private`
- ACL por usuario, rol o departamento
- Reconocimiento de lectura obligatorio (opcional)

### 📊 Auditoría Completa
- Log de todas las acciones
- Tracking de vistas y descargas
- Historial de cambios con diff
- Retención configurable

## Tablas

| Tabla | Descripción |
|-------|-------------|
| `dms_categories` | Categorías jerárquicas |
| `dms_documents` | Metadatos de documentos |
| `dms_document_versions` | Versiones individuales |
| `dms_document_files` | Archivos físicos |
| `dms_document_relations` | Relaciones entre documentos |
| `dms_document_acknowledgments` | Confirmaciones de lectura |
| `dms_access_log` | Auditoría completa |

## API Endpoints

### Categorías
```
GET    /api/dms/categories?parentId=&stats=true
POST   /api/dms/categories
GET    /api/dms/categories/tree
```

### Documentos
```
GET    /api/dms/documents?categoryId=&status=&search=
POST   /api/dms/documents
GET    /api/dms/documents/:id?versions=true&relations=true
PATCH  /api/dms/documents/:id
DELETE /api/dms/documents/:id
```

### Versiones
```
GET    /api/dms/documents/:id/versions
POST   /api/dms/documents/:id/versions
GET    /api/dms/versions/:versionId?files=true
PATCH  /api/dms/versions/:versionId
POST   /api/dms/versions/:versionId/submit
POST   /api/dms/versions/:versionId/review
POST   /api/dms/versions/:versionId/publish
```

### Archivos
```
POST   /api/dms/versions/:versionId/files
GET    /api/dms/files/:fileId/download
```

### Relaciones
```
POST   /api/dms/documents/:id/relations
```

### Acknowledgments
```
POST   /api/dms/documents/:id/acknowledge
GET    /api/dms/documents/:id/acknowledgments
```

### Búsqueda y Stats
```
GET    /api/dms/search?q=
GET    /api/dms/stats
GET    /api/dms/audit-log
```

## Ejemplos de Uso

### Crear un manual
```json
POST /api/dms/documents
{
  "title": "Manual de Usuario - CRM",
  "type": "manual",
  "categoryId": "uuid-categoria",
  "tags": ["crm", "usuario", "v2"],
  "ownerId": "uuid-usuario",
  "requiresAcknowledgment": true,
  "effectiveDate": "2026-01-01",
  "reviewDueDate": "2026-12-31"
}
```

### Crear nueva versión
```json
POST /api/dms/documents/:id/versions
{
  "content": "# Manual de Usuario...",
  "contentFormat": "markdown",
  "changelog": "Agregada sección de reportes avanzados",
  "changeType": "minor"
}
```

### Workflow de publicación
```bash
# 1. Enviar a revisión
POST /api/dms/versions/:versionId/submit

# 2. Aprobar (como revisor)
POST /api/dms/versions/:versionId/review
{ "decision": "approved", "notes": "Todo correcto" }

# 3. Publicar (como administrador)
POST /api/dms/versions/:versionId/publish
```

## Habilitar el Grimoire

Editar `apps/api/gremius.config.ts`:
```typescript
{ id: "grimoire-dms", enabled: true }
```

Reiniciar el servidor para aplicar migraciones automáticas.
