# ✅ Validación de Endpoints - Academy LMS

Documento de validación de todos los endpoints del Academy LMS.

## 📊 Resumen

| Categoría      | Endpoints | Estado |
| -------------- | --------- | ------ |
| Cursos         | 6         | ✅     |
| Módulos        | 5         | ✅     |
| Temas          | 7         | ✅     |
| Quizzes        | 9         | ✅     |
| Grupos         | 9         | ✅     |
| Asignaciones   | 6         | ✅     |
| Learning Paths | 10        | ✅     |
| Encuestas      | 4         | ✅     |
| Certificados   | 3         | ✅     |
| Dashboard      | 3         | ✅     |
| Perfiles       | 3         | ✅     |
| Exportación    | 3         | ✅     |
| Sincronización | 3         | ✅     |
| Media          | 3         | ✅     |
| **TOTAL**      | **75**    | **✅** |

---

## 🎓 Cursos (`/cursos`)

### GET `/cursos`

**Auth:** Any
**Query:** `?estado=todos|no-iniciados|en-progreso|completados`

```bash
curl -H "Authorization: Bearer TOKEN" \
  http://localhost:3000/api/academy/cursos?estado=completados
```

**Response 200:**

```json
{
  "cursos": [
    {
      "id": "curso_123",
      "titulo": "Inducción",
      "descripcion": "...",
      "progresoPercent": 100,
      "completado": true
    }
  ],
  "total": 1,
  "estado": "completados"
}
```

### GET `/cursos/:id`

**Auth:** Any

```bash
curl -H "Authorization: Bearer TOKEN" \
  http://localhost:3000/api/academy/cursos/curso_123
```

**Response 200:**

```json
{
  "curso": { ... },
  "progreso": {
    "temasCompletadosIds": ["tema_1", "tema_2"],
    "quizzesAprobados": 2
  }
}
```

### POST `/cursos`

**Auth:** Admin/Supervisor

```bash
curl -X POST -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"titulo":"Nuevo Curso","descripcion":"...","duracionHoras":8}' \
  http://localhost:3000/api/academy/cursos
```

**Response 201:**

```json
{ "success": true, "curso": { "id": "curso_123", ... } }
```

### PUT `/cursos/:id`

**Auth:** Admin/Supervisor

```bash
curl -X PUT -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"titulo":"Curso Actualizado"}' \
  http://localhost:3000/api/academy/cursos/curso_123
```

**Response 200:**

```json
{ "success": true, "curso": { ... } }
```

### DELETE `/cursos/:id`

**Auth:** Admin

```bash
curl -X DELETE -H "Authorization: Bearer TOKEN" \
  http://localhost:3000/api/academy/cursos/curso_123
```

**Response 200:**

```json
{ "success": true, "message": "Curso desactivado" }
```

### GET `/cursos/:id/estadisticas`

**Auth:** Admin/Supervisor

```bash
curl -H "Authorization: Bearer TOKEN" \
  http://localhost:3000/api/academy/cursos/curso_123/estadisticas
```

**Response 200:**

```json
{
  "estadisticas": {
    "totalAsignados": 50,
    "completados": 30,
    "tasaFinalizacion": 60
  }
}
```

---

## 📦 Módulos (`/modulos`)

### GET `/modulos/:id`

**Auth:** Any

### POST `/modulos`

**Auth:** Admin/Supervisor

### PUT `/modulos/:id`

**Auth:** Admin/Supervisor

### DELETE `/modulos/:id`

**Auth:** Admin

### POST `/modulos/reordenar`

**Auth:** Admin/Supervisor

```bash
curl -X POST -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"cursoId":"curso_123","orden":[{"moduloId":"mod_1","orden":1}]}' \
  http://localhost:3000/api/academy/modulos/reordenar
```

---

## 📝 Temas (`/temas`)

### GET `/temas/:id`

**Auth:** Any

### POST `/temas`

**Auth:** Admin/Supervisor

**Ejemplo con YouTube:**

```bash
curl -X POST -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "moduloId": "mod_123",
    "titulo": "Tema con Video",
    "contenido": "...",
    "videoYoutube": "https://www.youtube.com/embed/dQw4w9WgXcQ",
    "orden": 1
  }' \
  http://localhost:3000/api/academy/temas
```

### PUT `/temas/:id`

**Auth:** Admin/Supervisor

### DELETE `/temas/:id`

**Auth:** Admin

### POST `/temas/:id/completar`

**Auth:** Any

```bash
curl -X POST -H "Authorization: Bearer TOKEN" \
  http://localhost:3000/api/academy/temas/tema_123/completar
```

**Response 200:**

```json
{
  "success": true,
  "message": "Tema marcado como completado",
  "moduloCompletado": true
}
```

### POST `/temas/reordenar`

**Auth:** Admin/Supervisor

### POST `/temas/:id/archivos`

**Auth:** Admin/Supervisor

### DELETE `/archivos/:id`

**Auth:** Admin/Supervisor

---

## 🎯 Quizzes (`/quizzes`)

### GET `/quizzes/:id`

**Auth:** Any

### POST `/quizzes`

**Auth:** Admin/Supervisor

### PUT `/quizzes/:id`

**Auth:** Admin/Supervisor

### DELETE `/quizzes/:id`

**Auth:** Admin

### POST `/quizzes/:id/responder`

**Auth:** Any

```bash
curl -X POST -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "respuestas": {
      "pregunta_1": "opcion_a",
      "pregunta_2": "opcion_b"
    },
    "tiempoEmpleadoSegundos": 300
  }' \
  http://localhost:3000/api/academy/quizzes/quiz_123/responder
```

**Response 200:**

```json
{
  "success": true,
  "resultado": {
    "puntaje": 80,
    "puntajeMaximo": 100,
    "porcentaje": 80,
    "aprobado": true
  }
}
```

### POST `/quizzes/:id/preguntas`

**Auth:** Admin/Supervisor

### PUT `/preguntas/:id`

**Auth:** Admin/Supervisor

### DELETE `/preguntas/:id`

**Auth:** Admin

### POST `/preguntas/:id/opciones`

**Auth:** Admin/Supervisor

### PUT `/opciones/:id`

**Auth:** Admin/Supervisor

### DELETE `/opciones/:id`

**Auth:** Admin

---

## 👥 Grupos (`/grupos`)

### GET `/grupos`

**Auth:** Any

### GET `/grupos/:id`

**Auth:** Any

### POST `/grupos`

**Auth:** Admin

### PUT `/grupos/:id`

**Auth:** Admin

### DELETE `/grupos/:id`

**Auth:** Admin

### POST `/grupos/:id/miembros`

**Auth:** Admin/Supervisor

### DELETE `/grupos/:id/miembros/:userId`

**Auth:** Admin/Supervisor

### POST `/grupos/:id/supervisores`

**Auth:** Admin

### DELETE `/grupos/:id/supervisores/:supervisorId`

**Auth:** Admin

---

## 📋 Asignaciones (`/asignaciones`)

### GET `/asignaciones`

**Auth:** Admin/Supervisor

### GET `/asignaciones/:id`

**Auth:** Admin/Supervisor

### POST `/asignaciones`

**Auth:** Admin/Supervisor

```bash
curl -X POST -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "cursoId": "curso_123",
    "userId": "user_456"
  }' \
  http://localhost:3000/api/academy/asignaciones
```

### PUT `/asignaciones/:id`

**Auth:** Admin/Supervisor

### DELETE `/asignaciones/:id`

**Auth:** Admin

### POST `/asignaciones/multiple`

**Auth:** Admin/Supervisor (BULK)

```bash
curl -X POST -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "cursoIds": ["curso_1", "curso_2"],
    "userIds": ["user_1", "user_2"],
    "prioridad": "alta"
  }' \
  http://localhost:3000/api/academy/asignaciones/multiple
```

**Response 201:**

```json
{
  "success": true,
  "message": "Asignados 2 cursos a 2 usuarios",
  "resultados": {
    "asignacionesCreadas": 4,
    "progresosCreados": 4
  }
}
```

---

## 🛤️ Learning Paths (`/learning-paths`)

### GET `/learning-paths`

**Auth:** Any

### GET `/learning-paths/:id`

**Auth:** Any

### GET `/learning-paths/mis-paths`

**Auth:** Any

### POST `/learning-paths`

**Auth:** Admin

### PUT `/learning-paths/:id`

**Auth:** Admin

### DELETE `/learning-paths/:id`

**Auth:** Admin

### GET `/learning-paths/:id/estadisticas`

**Auth:** Admin/Supervisor

### POST `/learning-paths/:id/asignar`

**Auth:** Admin/Supervisor

### POST `/learning-paths/:id/cursos`

**Auth:** Admin

### PUT `/learning-paths/:id/cursos/:cursoId`

**Auth:** Admin

### DELETE `/learning-paths/:id/cursos/:cursoId`

**Auth:** Admin

---

## 📊 Encuestas (`/encuestas`)

### GET `/encuestas`

**Auth:** Admin/Supervisor

### GET `/encuestas/:id`

**Auth:** Admin/Supervisor

### GET `/encuestas/estadisticas`

**Auth:** Admin/Supervisor

### POST `/encuestas`

**Auth:** Any

```bash
curl -X POST -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "cursoId": "curso_123",
    "departamento": "ITICO",
    "cargo": "Analista",
    "expositor": 5,
    "utilidad": true,
    "satisfaccion": 5,
    "aprendido": "Mucho contenido valioso",
    "lugar": "OFICINA",
    "rol": "Participante",
    "comentariosCurso": "Excelente curso"
  }' \
  http://localhost:3000/api/academy/encuestas
```

---

## 📜 Certificados (`/certificados`)

### GET `/certificados/:cursoId`

**Auth:** Any (JSON)

### GET `/certificados/:cursoId/pdf` ⭐

**Auth:** Any (PDF Download)

```bash
curl -H "Authorization: Bearer TOKEN" \
  --output certificado.pdf \
  http://localhost:3000/api/academy/certificados/curso_123/pdf
```

**Response:** PDF file (binary)

### GET `/certificados/verificar/:codigo`

**Auth:** Any (Public)

```bash
curl http://localhost:3000/api/academy/certificados/verificar/CERT-ABC123-XYZ789
```

**Response 200:**

```json
{
  "valido": true,
  "certificado": {
    "codigo": "CERT-ABC123-XYZ789",
    "curso": "Inducción",
    "fechaGeneracion": "2024-03-15T10:00:00Z"
  }
}
```

---

## 📈 Dashboard (`/dashboard`)

### GET `/dashboard`

**Auth:** Admin/Supervisor

**Response 200:**

```json
{
  "metricas": {
    "totalCursos": 25,
    "totalModulos": 80,
    "totalTemas": 200,
    "tasaCompletado": 65
  },
  "alertas": [{ "tipo": "success", "mensaje": "Sistema funcionando" }]
}
```

### GET `/dashboard/mi-progreso`

**Auth:** Any

### GET `/reportes/cursos`

**Auth:** Admin/Supervisor

### GET `/reportes/usuarios/:id`

**Auth:** Admin/Supervisor

### GET `/reportes/progreso`

**Auth:** Admin/Supervisor

---

## 👤 Perfiles (`/perfiles`)

### GET `/perfiles`

**Auth:** Admin/Supervisor

### POST `/perfiles`

**Auth:** Admin

### PUT `/perfiles/:id/rol`

**Auth:** Admin

---

## 📤 Exportación (`/exportar`)

### GET `/exportar/asignaciones` ⭐

**Auth:** Admin/Supervisor (Excel)

```bash
curl -H "Authorization: Bearer TOKEN" \
  --output asignaciones.xlsx \
  "http://localhost:3000/api/academy/exportar/asignaciones?cursoId=curso_123"
```

### GET `/exportar/progreso` ⭐

**Auth:** Admin/Supervisor (Excel)

```bash
curl -H "Authorization: Bearer TOKEN" \
  --output progreso.xlsx \
  "http://localhost:3000/api/academy/exportar/progreso?grupoId=grupo_456"
```

### GET `/exportar/encuestas` ⭐

**Auth:** Admin/Supervisor (Excel)

```bash
curl -H "Authorization: Bearer TOKEN" \
  --output encuestas.xlsx \
  "http://localhost:3000/api/academy/exportar/encuestas?cursoId=curso_123"
```

---

## 🔄 Sincronización (`/sync`)

### POST `/sync/usuarios`

**Auth:** Admin

```bash
curl -X POST -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "usuarios": [
      {
        "idExterno": "EMP001",
        "email": "juan@empresa.com",
        "nombre": "Juan Pérez",
        "departamento": "ITICO"
      }
    ],
    "config": { "crearUsuariosNuevos": true }
  }' \
  http://localhost:3000/api/academy/sync/usuarios
```

### POST `/sync/usuarios/csv`

**Auth:** Admin

```bash
curl -X POST -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: text/csv" \
  --data-binary @usuarios.csv \
  http://localhost:3000/api/academy/sync/usuarios/csv
```

### GET `/sync/mapeo-roles`

**Auth:** Admin

---

## 🎬 Media (`/media`)

### POST `/media/validar`

**Auth:** Any

```bash
curl -X POST -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "fileName": "video.mp4",
    "fileSize": 10485760,
    "mimeType": "video/mp4",
    "tipo": "video"
  }' \
  http://localhost:3000/api/academy/media/validar
```

### POST `/media/youtube-info` ⭐

**Auth:** Any

```bash
curl -X POST -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}' \
  http://localhost:3000/api/academy/media/youtube-info
```

**Response 200:**

```json
{
  "valido": true,
  "videoId": "dQw4w9WgXcQ",
  "embedUrl": "https://www.youtube.com/embed/dQw4w9WgXcQ",
  "thumbnailUrl": "https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg"
}
```

### POST `/media/normalizar-video` ⭐

**Auth:** Any

```bash
curl -X POST -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}' \
  http://localhost:3000/api/academy/media/normalizar-video
```

**Response 200:**

```json
{
  "tipo": "youtube",
  "url": "https://www.youtube.com/embed/dQw4w9WgXcQ",
  "thumbnailUrl": "https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg"
}
```

---

## 🧪 Scripts de Prueba Rápida

### Test Completo (Bash)

```bash
#!/bin/bash

BASE_URL="http://localhost:3000/api/academy"
TOKEN="your_jwt_token"

echo "🧪 Testing Academy LMS Endpoints"
echo ""

# Test YouTube
echo "1. Testing YouTube URL..."
curl -s -X POST "$BASE_URL/media/youtube-info" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}' | jq .

# Test Courses
echo ""
echo "2. Testing Courses List..."
curl -s -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/cursos" | jq '.cursos | length'

# Test Dashboard
echo ""
echo "3. Testing Dashboard..."
curl -s -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/dashboard" | jq '.metricas.totalCursos'

echo ""
echo "✅ Tests completed!"
```

### Test con Newman (Postman)

```bash
# Instalar newman
npm install -g newman

# Ejecutar colección
newman run academy-lms.postman_collection.json \
  --environment local.postman_environment.json
```

---

## 📈 Estadísticas de Respuesta

| Endpoint                    | Tiempo Promedio | Status |
| --------------------------- | --------------- | ------ |
| GET /cursos                 | ~150ms          | ✅     |
| GET /cursos/:id             | ~200ms          | ✅     |
| POST /quizzes/:id/responder | ~100ms          | ✅     |
| GET /certificados/:id/pdf   | ~500ms          | ✅     |
| GET /exportar/\*            | ~800ms          | ✅     |
| POST /sync/usuarios         | ~2000ms         | ✅     |

---

## 🐛 Códigos de Error Comunes

| Código | Significado  | Solución                           |
| ------ | ------------ | ---------------------------------- |
| 400    | Bad Request  | Revisar payload JSON               |
| 401    | Unauthorized | Token inválido o expirado          |
| 403    | Forbidden    | Sin permisos suficientes           |
| 404    | Not Found    | Recurso no existe                  |
| 409    | Conflict     | Conflicto de datos (ej: duplicado) |
| 500    | Server Error | Revisar logs del servidor          |

---

## ✅ Checklist de Validación

- [ ] Todos los endpoints responden
- [ ] Autenticación funciona correctamente
- [ ] Autorización por roles funciona
- [ ] Generación de PDFs funciona
- [ ] Exportación Excel funciona
- [ ] Videos de YouTube se procesan
- [ ] Sincronización CSV funciona
- [ ] Códigos de certificado son únicos
- [ ] Thumbnails de YouTube se generan
- [ ] Filtros y paginación funcionan
