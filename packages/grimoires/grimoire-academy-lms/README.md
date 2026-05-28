# 🎓 Grimoire Academy LMS

Learning Management System completo para Gremius BaaS/CMS.

## 📋 Características

### Core LMS
- ✅ Gestión de cursos, módulos y temas
- ✅ Sistema de quizzes y evaluaciones
- ✅ Tracking de progreso granular
- ✅ Grupos de asignación con supervisores
- ✅ Learning Paths secuenciales

### Nuevas Funcionalidades (v1.1.0)
- ✅ **Certificados PDF** - Generación con diseño profesional
- ✅ **Exportación Excel** - Asignaciones, progreso y encuestas
- ✅ **Sincronización de usuarios** - Importación CSV/JSON
- ✅ **Integración Media Library** - Gestión de archivos
- ✅ **Verificación de certificados** - Códigos únicos

## 🚀 Instalación

### 1. Instalar dependencias

```bash
npm install pdfkit exceljs
# o
pnpm add pdfkit exceljs
```

### 2. Configurar variables de entorno

```env
# Media Library (S3/MinIO)
S3_ENDPOINT=
S3_BUCKET=
S3_ACCESS_KEY=
S3_SECRET_KEY=

# Opcional: Para certificados con plantillas
CERTIFICATE_TEMPLATE_URL=
CERTIFICATE_PRIMARY_COLOR=#009c3c
```

## 📁 Estructura

```
grimoire-academy-lms/
├── academy-lms.schema.ts      # Esquema de base de datos
├── academy-lms.routes.ts      # 75+ endpoints API
├── academy-lms.admin.ts       # Configuración de admin
├── API.md                     # Documentación API completa
├── services/
│   ├── pdf.service.ts         # Generación de certificados PDF
│   ├── excel.service.ts       # Exportación a Excel
│   ├── media.service.ts       # Integración Media Library
│   └── user-sync.service.ts   # Sincronización de usuarios
├── grimoire.json              # Configuración del grimoire
└── gremius.json               # Metadatos del módulo
```

## 🌐 API Endpoints

### Certificados PDF
```http
GET /api/academy/certificados/:cursoId/pdf
# Descarga certificado en PDF

GET /api/academy/certificados/verificar/:codigo
# Verifica autenticidad
```

### Exportación Excel
```http
GET /api/academy/exportar/asignaciones?cursoId=X&grupoId=Y
GET /api/academy/exportar/progreso?cursoId=X
GET /api/academy/exportar/encuestas?cursoId=X
```

### Sincronización de Usuarios
```http
POST /api/academy/sync/usuarios
Content-Type: application/json

{
  "usuarios": [
    { "idExterno": "1", "email": "user@emp.com", "nombre": "Juan" }
  ],
  "config": { "crearUsuariosNuevos": true }
}

POST /api/academy/sync/usuarios/csv
Content-Type: text/csv

idExterno,email,nombre,departamento
EMP001,user@emp.com,Juan,ITICO
```

### Media
```http
POST /api/academy/media/youtube-info
{ "url": "https://www.youtube.com/watch?v=..." }

POST /api/academy/media/normalizar-video
{ "url": "https://vimeo.com/123456" }
```

## 📊 Modelos de Datos

### Tablas Principales (15+)
- `cursos`, `modulos`, `temas`
- `quizzes`, `preguntas`, `opciones`
- `progreso_cursos`, `progreso_temas`
- `grupos_asignacion`, `grupo_usuarios`
- `learning_paths`, `progreso_learning_paths`
- `certificados`, `encuestas_satisfaccion`

### Enums
- `rol_capacitaciones`: administrador | supervisor | estudiante
- `tipo_curso`: INDUCCION | GESTION | TECNICO | HERRAMIENTAS | DESARROLLO
- `departamento`: 13 departamentos
- `cargo`: 7 niveles

## 🎨 Servicios

### PDF Service
```typescript
import { generarCertificadoPDF } from "@gremius/grimoire-academy-lms";

const pdf = await generarCertificadoPDF({
  nombreUsuario: "Juan Pérez",
  nombreCurso: "Introducción a la Plataforma",
  fechaCompletado: new Date(),
  duracionHoras: 8,
  codigo: "CERT-ABC123-XYZ789"
}, {
  primaryColor: "#009c3c",
  textoPrincipal: "Se certifica que"
});
```

### Excel Service
```typescript
import { generarExcelAsignaciones } from "@gremius/grimoire-academy-lms";

const excel = await generarExcelAsignaciones([
  { fecha: new Date(), curso: "Curso 1", usuario: "Juan", progreso: 100, estado: "Completado" }
], "Reporte de Asignaciones");
```

### User Sync Service
```typescript
import { parsearCSV, validarUsuariosExternos } from "@gremius/grimoire-academy-lms";

const usuarios = parsearCSV(csvContent);
const { validos, invalidos } = validarUsuariosExternos(usuarios);
```

## 🔐 Permisos

| Rol | Permisos |
|-----|----------|
| **administrador** | Acceso total |
| **supervisor** | Gestionar grupos, ver reportes, asignar cursos |
| **estudiante** | Ver cursos asignados, completar contenido |

## 📈 Funcionalidades vs Módulo Django

| Funcionalidad | Django | Grimoire |
|--------------|--------|----------|
| Cursos/Módulos/Temas | ✅ | ✅ |
| Quizzes | ✅ | ✅ |
| Progreso | ✅ | ✅ |
| Grupos | ✅ | ✅ |
| Asignaciones | ✅ | ✅ |
| Encuestas | ✅ | ✅ |
| Certificados | ✅ | ✅ + **PDF** |
| Learning Paths | ❌ | ✅ **Nuevo** |
| Exportar Excel | ❌ | ✅ **Nuevo** |
| Sync Usuarios | ❌ | ✅ **Nuevo** |
| Media Library | ❌ | ✅ **Nuevo** |

## 🧪 Testing

```bash
# Ejecutar tests
pnpm test packages/grimoires/grimoire-academy-lms

# Ver cobertura
pnpm test:coverage
```

## 📝 Changelog

### v1.1.0
- Agregado servicio de PDF para certificados
- Agregado servicio de Excel para exportaciones
- Agregado servicio de sincronización de usuarios
- Agregado servicio de integración con Media Library
- Soporte completo para videos de YouTube
- Test suite completo con 50+ pruebas
- 75+ endpoints API REST

### v1.0.0
- Lanzamiento inicial
- Core LMS completo
- Learning Paths

## 🧪 Testing

### Ejecutar Pruebas

```bash
# Ejecutar todas las pruebas
bun test

# Ejecutar con script
bash tests/run-tests.sh

# Ejecutar validación manual
bun tests/manual-test.ts
```

### Tipos de Pruebas

| Tipo | Archivo | Cobertura |
|------|---------|-----------|
| Unit Tests | `tests/academy-lms.test.ts` | Servicios completos |
| Manual Tests | `tests/manual-test.ts` | Generación de archivos |
| Endpoint Validation | `tests/endpoints-validation.md` | 75+ endpoints |
| YouTube Examples | `tests/youtube-examples.md` | Videos de YouTube |

### Pruebas de YouTube

```bash
# Test de URLs de YouTube
curl -X POST http://localhost:3000/api/academy/media/youtube-info \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'
```

Formatos soportados:
- ✅ `https://www.youtube.com/watch?v=VIDEO_ID`
- ✅ `https://youtu.be/VIDEO_ID`
- ✅ `https://www.youtube.com/embed/VIDEO_ID`
- ✅ URLs con parámetros (`&t=30s`, `&list=...`)

## 📄 Licencia

MIT - Gremius Team
