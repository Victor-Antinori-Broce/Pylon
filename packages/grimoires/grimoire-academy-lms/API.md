# Academy LMS - API Reference

Complete REST API for the Gremius Academy Learning Management System.

## Overview

- **Base Path**: `/api/academy`
- **Authentication**: Required (Bearer Token via `Authorization` header)
- **Roles**: `administrador`, `supervisor`, `estudiante`

---

## Courses (`/cursos`)

| Method | Endpoint                   | Auth             | Description                                                                           |
| ------ | -------------------------- | ---------------- | ------------------------------------------------------------------------------------- |
| GET    | `/cursos`                  | Any              | List courses with progress (filter: `?estado=no-iniciados\|en-progreso\|completados`) |
| GET    | `/cursos/:id`              | Any              | Get course detail with modules, topics, quizzes                                       |
| POST   | `/cursos`                  | Admin/Supervisor | Create new course                                                                     |
| PUT    | `/cursos/:id`              | Admin/Supervisor | Update course                                                                         |
| DELETE | `/cursos/:id`              | Admin            | Soft delete (deactivate)                                                              |
| GET    | `/cursos/:id/estadisticas` | Admin/Supervisor | Course statistics                                                                     |

---

## Modules (`/modulos`)

| Method | Endpoint             | Auth             | Description                     |
| ------ | -------------------- | ---------------- | ------------------------------- |
| GET    | `/modulos/:id`       | Any              | Get module with topics and quiz |
| POST   | `/modulos`           | Admin/Supervisor | Create module                   |
| PUT    | `/modulos/:id`       | Admin/Supervisor | Update module                   |
| DELETE | `/modulos/:id`       | Admin            | Delete module                   |
| POST   | `/modulos/reordenar` | Admin/Supervisor | Reorder modules                 |

---

## Topics (`/temas`)

| Method | Endpoint               | Auth             | Description                    |
| ------ | ---------------------- | ---------------- | ------------------------------ |
| GET    | `/temas/:id`           | Any              | Get topic detail with progress |
| POST   | `/temas`               | Admin/Supervisor | Create topic                   |
| PUT    | `/temas/:id`           | Admin/Supervisor | Update topic                   |
| DELETE | `/temas/:id`           | Admin            | Delete topic                   |
| POST   | `/temas/:id/completar` | Any              | Mark topic as completed        |
| POST   | `/temas/reordenar`     | Admin/Supervisor | Reorder topics                 |

### Additional Files

| Method | Endpoint              | Auth             | Description       |
| ------ | --------------------- | ---------------- | ----------------- |
| POST   | `/temas/:id/archivos` | Admin/Supervisor | Add attachment    |
| DELETE | `/archivos/:id`       | Admin/Supervisor | Remove attachment |

---

## Quizzes (`/quizzes`)

| Method | Endpoint                 | Auth             | Description             |
| ------ | ------------------------ | ---------------- | ----------------------- |
| GET    | `/quizzes/:id`           | Any              | Get quiz with questions |
| POST   | `/quizzes`               | Admin/Supervisor | Create quiz for module  |
| PUT    | `/quizzes/:id`           | Admin/Supervisor | Update quiz             |
| DELETE | `/quizzes/:id`           | Admin            | Delete quiz             |
| POST   | `/quizzes/:id/responder` | Any              | Submit quiz answers     |

### Questions (`/preguntas`)

| Method | Endpoint                 | Auth             | Description     |
| ------ | ------------------------ | ---------------- | --------------- |
| POST   | `/quizzes/:id/preguntas` | Admin/Supervisor | Add question    |
| PUT    | `/preguntas/:id`         | Admin/Supervisor | Update question |
| DELETE | `/preguntas/:id`         | Admin            | Delete question |

### Options (`/opciones`)

| Method | Endpoint                  | Auth             | Description   |
| ------ | ------------------------- | ---------------- | ------------- |
| POST   | `/preguntas/:id/opciones` | Admin/Supervisor | Add option    |
| PUT    | `/opciones/:id`           | Admin/Supervisor | Update option |
| DELETE | `/opciones/:id`           | Admin            | Delete option |

---

## Groups (`/grupos`)

| Method | Endpoint                                 | Auth             | Description            |
| ------ | ---------------------------------------- | ---------------- | ---------------------- |
| GET    | `/grupos`                                | Any              | List groups            |
| GET    | `/grupos/:id`                            | Any              | Get group with members |
| POST   | `/grupos`                                | Admin            | Create group           |
| PUT    | `/grupos/:id`                            | Admin            | Update group           |
| DELETE | `/grupos/:id`                            | Admin            | Delete group           |
| POST   | `/grupos/:id/miembros`                   | Admin/Supervisor | Add members            |
| DELETE | `/grupos/:id/miembros/:userId`           | Admin/Supervisor | Remove member          |
| POST   | `/grupos/:id/supervisores`               | Admin            | Add supervisor         |
| DELETE | `/grupos/:id/supervisores/:supervisorId` | Admin            | Remove supervisor      |

---

## Assignments (`/asignaciones`)

| Method | Endpoint                 | Auth             | Description                                                    |
| ------ | ------------------------ | ---------------- | -------------------------------------------------------------- |
| GET    | `/asignaciones`          | Admin/Supervisor | List assignments (filter by `?cursoId`, `?userId`, `?grupoId`) |
| GET    | `/asignaciones/:id`      | Admin/Supervisor | Get assignment detail                                          |
| POST   | `/asignaciones`          | Admin/Supervisor | Assign course to user/group                                    |
| PUT    | `/asignaciones/:id`      | Admin/Supervisor | Update assignment                                              |
| DELETE | `/asignaciones/:id`      | Admin            | Delete assignment                                              |
| POST   | `/asignaciones/multiple` | Admin/Supervisor | Bulk assignment                                                |

---

## Learning Paths (`/learning-paths`)

| Method | Endpoint                           | Auth             | Description                                |
| ------ | ---------------------------------- | ---------------- | ------------------------------------------ |
| GET    | `/learning-paths`                  | Any              | List learning paths (filter: `?categoria`) |
| GET    | `/learning-paths/:id`              | Any              | Get path with courses                      |
| GET    | `/learning-paths/mis-paths`        | Any              | Get user's assigned paths                  |
| POST   | `/learning-paths`                  | Admin            | Create learning path                       |
| PUT    | `/learning-paths/:id`              | Admin            | Update learning path                       |
| DELETE | `/learning-paths/:id`              | Admin            | Deactivate learning path                   |
| GET    | `/learning-paths/:id/estadisticas` | Admin/Supervisor | Path statistics                            |
| POST   | `/learning-paths/:id/asignar`      | Admin/Supervisor | Assign path to users                       |

### Path Courses

| Method | Endpoint                              | Auth  | Description             |
| ------ | ------------------------------------- | ----- | ----------------------- |
| POST   | `/learning-paths/:id/cursos`          | Admin | Add course to path      |
| PUT    | `/learning-paths/:id/cursos/:cursoId` | Admin | Update course in path   |
| DELETE | `/learning-paths/:id/cursos/:cursoId` | Admin | Remove course from path |

---

## Surveys (`/encuestas`)

| Method | Endpoint                  | Auth             | Description                       |
| ------ | ------------------------- | ---------------- | --------------------------------- |
| GET    | `/encuestas`              | Admin/Supervisor | List surveys (filter: `?cursoId`) |
| GET    | `/encuestas/:id`          | Admin/Supervisor | Get survey detail                 |
| GET    | `/encuestas/estadisticas` | Admin/Supervisor | Survey statistics                 |
| POST   | `/encuestas`              | Any              | Submit satisfaction survey        |

---

## Feedback (`/feedback`)

| Method | Endpoint    | Auth | Description              |
| ------ | ----------- | ---- | ------------------------ |
| POST   | `/feedback` | Any  | Submit feedback on topic |

---

## Certificates (`/certificados`)

| Method | Endpoint                          | Auth | Description                     |
| ------ | --------------------------------- | ---- | ------------------------------- |
| GET    | `/certificados/:cursoId`          | Any  | Get/generate certificate (JSON) |
| GET    | `/certificados/:cursoId/pdf`      | Any  | **Download certificate as PDF** |
| GET    | `/certificados/verificar/:codigo` | Any  | Verify certificate authenticity |

### PDF Certificate Features

- ✅ Diseño profesional con bordes decorativos
- ✅ Color personalizable por curso
- ✅ Código único de verificación
- ✅ Información del estudiante y curso
- ✅ Fecha de finalización

---

## Dashboard & Reports

| Method | Endpoint                 | Auth             | Description                                      |
| ------ | ------------------------ | ---------------- | ------------------------------------------------ |
| GET    | `/dashboard`             | Admin/Supervisor | System-wide metrics                              |
| GET    | `/dashboard/mi-progreso` | Any              | Current user's progress                          |
| GET    | `/reportes/cursos`       | Admin/Supervisor | Course reports                                   |
| GET    | `/reportes/usuarios/:id` | Admin/Supervisor | User progress report                             |
| GET    | `/reportes/progreso`     | Admin/Supervisor | Progress report (filter: `?cursoId`, `?grupoId`) |

---

## User Profiles (`/perfiles`)

| Method | Endpoint            | Auth             | Description                    |
| ------ | ------------------- | ---------------- | ------------------------------ |
| GET    | `/perfiles`         | Admin/Supervisor | List profiles (filter: `?rol`) |
| POST   | `/perfiles`         | Admin            | Create/update profile          |
| PUT    | `/perfiles/:id/rol` | Admin            | Change user role               |

---

## 📊 Exports (`/exportar`)

Export data to Excel format.

| Method | Endpoint                 | Auth             | Description                     |
| ------ | ------------------------ | ---------------- | ------------------------------- |
| GET    | `/exportar/asignaciones` | Admin/Supervisor | Export assignments to Excel     |
| GET    | `/exportar/progreso`     | Admin/Supervisor | Export progress report to Excel |
| GET    | `/exportar/encuestas`    | Admin/Supervisor | Export survey results to Excel  |

### Export Features

- ✅ Formato Excel (.xlsx)
- ✅ Colores condicionales (progreso, estados)
- ✅ Filtros automáticos
- ✅ Congelar paneles
- ✅ Formato de fechas
- ✅ Estados con colores:
  - 🟢 Completado: Verde
  - 🟡 En Progreso: Amarillo
  - 🔴 No Iniciado: Rojo

### Query Parameters

- `?cursoId=X` - Filter by course
- `?grupoId=X` - Filter by group
- `?fechaDesde=YYYY-MM-DD` - Start date
- `?fechaHasta=YYYY-MM-DD` - End date

---

## 🔄 User Sync (`/sync`)

Synchronize users from external systems.

| Method | Endpoint             | Auth  | Description                 |
| ------ | -------------------- | ----- | --------------------------- |
| POST   | `/sync/usuarios`     | Admin | Sync users from JSON data   |
| POST   | `/sync/usuarios/csv` | Admin | Sync users from CSV upload  |
| GET    | `/sync/mapeo-roles`  | Admin | Get available role mappings |

### CSV Format

```csv
idExterno,email,nombre,apellido,departamento,cargo,rol
EMP001,juan@empresa.com,Juan,Pérez,ITICO,Analista,Supervisor
EMP002,maria@empresa.com,María,García,RECURSOS_HUMANOS,Asistente,Estudiante
```

### Sync Features

- ✅ Validación de datos
- ✅ Mapeo de roles automático
- ✅ Creación de usuarios nuevos
- ✅ Actualización de existentes
- ✅ Soporte CSV/JSON
- ✅ Reporte de errores detallado

### Role Mappings Supported

- `pacifico`: Mapeo para sistema Pacifico
- Custom mappings via configuración

---

## 📁 Media (`/media`)

Media handling and validation.

| Method | Endpoint                  | Auth | Description                 |
| ------ | ------------------------- | ---- | --------------------------- |
| POST   | `/media/validar`          | Any  | Validate file before upload |
| POST   | `/media/youtube-info`     | Any  | Extract YouTube video info  |
| POST   | `/media/normalizar-video` | Any  | Normalize video URL         |

### YouTube Integration

```json
POST /media/youtube-info
{
  "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
}

Response:
{
  "valido": true,
  "videoId": "dQw4w9WgXcQ",
  "embedUrl": "https://www.youtube.com/embed/dQw4w9WgXcQ",
  "thumbnailUrl": "https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg"
}
```

### Video URL Normalization

Supported platforms:

- YouTube (auto-convert to embed)
- Vimeo (auto-convert to player)
- Direct URLs
- iframe embeds

---

## Schema Tables

| Table                           | Description                  |
| ------------------------------- | ---------------------------- |
| `perfil_usuario_capacitaciones` | User profiles with LMS roles |
| `cursos`                        | Courses                      |
| `grupos_asignacion`             | Assignment groups            |
| `grupo_usuarios`                | Group members                |
| `grupo_supervisores`            | Group supervisors            |
| `modulos`                       | Course modules               |
| `temas`                         | Module topics                |
| `archivos_adicionales`          | Topic attachments            |
| `quizzes`                       | Module quizzes               |
| `preguntas`                     | Quiz questions               |
| `opciones`                      | Question options             |
| `progreso_cursos`               | Course progress              |
| `progreso_modulos`              | Module progress              |
| `progreso_temas`                | Topic progress               |
| `respuestas_usuario`            | User quiz answers            |
| `resultados_quiz`               | Quiz results                 |
| `learning_paths`                | Learning paths               |
| `learning_path_cursos`          | Path courses                 |
| `progreso_learning_paths`       | Path progress                |
| `asignaciones_learning_path`    | Path assignments             |
| `asignaciones`                  | Course assignments           |
| `feedback`                      | Topic feedback               |
| `encuestas_satisfaccion`        | Satisfaction surveys         |
| `certificados`                  | Certificates                 |
| `actividad_log`                 | Activity log                 |

---

## Enums

### Course Types (`tipo_curso`)

- `INDUCCION` - Onboarding
- `GESTION` - Management
- `TECNICO` - Technical
- `HERRAMIENTAS` - Tools
- `DESARROLLO` - Development

### Roles (`rol_capacitaciones`)

- `administrador` - Full access
- `supervisor` - Can manage groups and view reports
- `estudiante` - Can view assigned content

### Departments (`departamento`)

- `CONTABILIDAD`, `COBROS`, `COMPUTO`, `EXPERIENCIA_AL_CLIENTE`, `FINANZAS`, `GERENCIA`, `ITICO`, `LEGAL`, `NEGOCIOS`, `PROCESOS`, `RECURSOS_HUMANOS`, `SERVICIOS_GENERALES`, `TRAMITE`

### Positions (`cargo`)

- `Asistente`, `Analista`, `Oficial_Profesional`, `Coordinador`, `Encargada_Supervisor`, `Jefe`, `Gerente`

### Survey Roles (`rol_encuesta`)

- `Participante`, `Expositor`, `Organizador`, `Otro`

---

## Dependencies

### Required Packages

```json
{
  "pdfkit": "^0.14.0",
  "exceljs": "^4.4.0"
}
```

### Media Library Integration

The Academy LMS integrates with `@gremius/core-media-library` for file uploads and storage.

---

## Total Endpoints: 75+

**Completed**: Full CRUD API for Academy LMS with:

- ✅ Comprehensive progress tracking
- ✅ Learning paths
- ✅ PDF certificate generation
- ✅ Excel exports
- ✅ User synchronization
- ✅ Media handling
- ✅ Reporting and analytics
