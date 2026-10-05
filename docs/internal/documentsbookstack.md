# Roadmap Backend: Mejoras al Kon DMS inspiradas en BookStack

> **Scope:** Este documento cubre **exclusivamente funciones backend** (API, schema, base de datos, lógica de negocio) para `kon-dms`.  
> El kon es **headless**: cualquier experiencia visual (lectura, editor, tema oscuro, previews) es responsabilidad del frontend (`packages/admin` u otro consumidor de la API).
>
> **Estado:** Pendiente de priorización  
> **Kon objetivo:** `packages/kons/kon-dms`  
> **Stack:** PostgreSQL + Drizzle ORM + Hono

---

## Roadmap Backend

### 1. Exportación Nativa (PDF, HTML, Markdown, ZIP)

**Problema:** El DMS almacena contenido pero no expone endpoints para descargarlo en formatos estándar.

**Tareas backend:**

- [ ] **`GET /api/dms/versions/:id/export/pdf`**
  - Renderizar contenido HTML → PDF vía librería Node (puppeteer/playwright/md-to-pdf) o plantilla predefinida.
  - Cachear resultado en storage (S3/local) para no regenerar en cada request.
  - Response: stream o URL firmada al archivo cacheado.
- [ ] **`GET /api/dms/versions/:id/export/html`**
  - Devolver HTML autocontenido (sanitizado, estilos base inline) listo para email o archivo.
- [ ] **`GET /api/dms/versions/:id/export/md`**
  - Convertir HTML almacenado a Markdown limpio (turndown o similar) o devolver raw si `contentFormat == markdown`.
- [ ] **`GET /api/dms/categories/:id/export/zip`**
  - Generar ZIP con estructura:
    ```
    categoria-slug/
      documento-slug/
        metadata.json
        content.md
        files/
    ```
  - Solo incluir versiones `published`.

**Schema afectado:** Ninguno (endpoints + servicio de archivos/cache).

---

### 2. Endpoint de Renderizado Público (Document Reader API)

**Problema:** No hay una API que entregue una versión publicada lista para ser renderizada por cualquier frontend.

**Tareas backend:**

- [ ] **`GET /api/dms/render/:documentSlug`** y **`GET /api/dms/render/code/:documentCode`**
  - Buscar documento por `slug` o `code`.
  - Resolver a la versión publicada activa (`isLatest = true`, `status = published`).
  - **Sanitizar** `content` HTML (DOMPurify o similar en Node) para evitar XSS.
  - **Generar TOC:** Parsear headers H1-H6 del `content` y devolver array de anclas `{ id, text, level }`.
  - **Inyectar IDs a headers:** Modificar el HTML para que cada H1-H6 tenga `id` generado (slug del texto), permitiendo deep-linking.
  - Respetar ACL (`visibility`, `allowedRoles`, `departmentId`, `allowedUserIds`) antes de servir. Si no tiene acceso → 403.
  - Response:
    ```json
    {
      "document": { "id", "title", "code", "slug", "publishedAt", "versionNumber", "changelog" },
      "category": { "id", "name", "slug", "breadcrumb": [...] },
      "content": "<html sanitizado con ids en headers>",
      "toc": [{ "id": "instalacion", "text": "Instalación", "level": 2 }],
      "navigation": { "prev": {...}, "next": {...} },
      "backlinks": [...]
    }
    ```
- [ ] **Navegación contextual (queries)**
  - `prev` / `next`: documentos adyacentes dentro de la misma categoría ordenados por `sortOrder` o `publishedAt`.
  - `breadcrumb`: array de categorías padre recursivo.

**Schema afectado:** Reutiliza tablas existentes. Agregar índice `slug + isActive` si no existe.

---

### 3. Comentarios y Colaboración Informal

**Problema:** No hay mecanismo de feedback ligero sin activar el workflow formal.

**Tareas backend:**

- [ ] **Nueva tabla: `dms_document_comments`**

  ```sql
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references dms_documents(id) on delete cascade,
  version_id uuid references dms_document_versions(id) on delete cascade, -- nullable: comentario general vs a una versión
  parent_id uuid references dms_document_comments(id) on delete cascade, -- hilos
  user_id uuid not null,
  content text not null,
  resolved_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
  ```

  - Índices: `(document_id, created_at)`, `(user_id)`, `(parent_id)`.

- [ ] **Menciones (`@usuario`)**
  - Parsear `content` al crear/actualizar: extraer `@username` o `@userId`.
  - Validar que los usuarios mencionados existen.
  - Emitir evento de notificación (integrar con sistema de notificaciones de Kitsuden core o guardar en tabla de notificaciones propia).
- [ ] **Endpoints**

  ```
  GET    /api/dms/documents/:id/comments?resolved=true|false
  POST   /api/dms/documents/:id/comments
  PATCH  /api/dms/comments/:id
  DELETE /api/dms/comments/:id
  POST   /api/dms/comments/:id/resolve
  ```

  - `GET` debe soportar paginación y filtro por `resolved`.
  - Incluir datos del autor (nombre, avatar) en el response (join con tabla de users del core).

**Schema nuevo:** `dms_document_comments`.

---

### 4. Wiki-Links y Linking Interno

**Problema:** No hay resolución dinámica de enlaces dentro del campo `content`.

**Tareas backend:**

- [ ] **Resolución de wiki-links en renderizado**
  - Durante el procesamiento del endpoint `/api/dms/render/:slug`, parsear sintaxis `[[CODE]]` o `[[slug]]` dentro del `content`.
  - Reemplazar por datos estructurados en el response (no por HTML hardcodeado, para que el frontend decida cómo renderizar):
    ```json
    "wikiLinks": [
      { "original": "[[MAN-IT-001]]", "documentId": "uuid", "slug": "man-it-001", "title": "Manual IT", "exists": true }
    ]
    ```
  - Si no existe → `exists: false` (para que el frontend pinte enlace rojo).
- [ ] **Anclas en wiki-links**
  - Soportar `[[MAN-IT-001#instalacion]]` → verificar que el header `instalacion` existe en el TOC del documento destino.
- [ ] **Backlinks**
  - Endpoint: `GET /api/dms/documents/:id/backlinks`
  - Query recursiva: buscar en `dms_document_versions.content` todos los documentos que mencionan `[[CODE-DE-ESTE-DOC]]`.
  - O mejor: tabla/cache `dms_document_backlinks` que se actualice al guardar una versión (más performante).
  - Response: lista de documentos que enlazan a este, con versión y contexto.

**Schema opcional:** `dms_document_backlinks` (tabla de caché) o índice full-text para query dinámica.

---

### 5. Diagramas Embebidos (Almacenamiento y Render)

**Problema:** No hay forma de persistir el source editable de un diagrama junto a su imagen renderizada.

**Tareas backend:**

- [ ] **Nueva tabla: `dms_document_diagrams`**
  ```sql
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references dms_document_versions(id) on delete cascade,
  name varchar(255) not null,
  source_xml text,   -- XML de draw.io
  source_json text,  -- JSON de excalidraw
  rendered_svg text, -- SVG string o referencia a file storage
  media_id uuid,     -- referencia opcional a kon-media si se almacena como imagen
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
  ```
- [ ] **Endpoints**
  ```
  GET    /api/dms/versions/:versionId/diagrams
  POST   /api/dms/versions/:versionId/diagrams
  PATCH  /api/dms/diagrams/:id
  DELETE /api/dms/diagrams/:id
  GET    /api/dms/diagrams/:id/render.svg  -- devuelve SVG renderizado
  ```
- [ ] **Integración con `content`**
  - Permitir placeholder en el Markdown/HTML del documento: `<diagram id="uuid" />` o `[[diagram:uuid]]`.
  - El endpoint `/api/dms/render/:slug` reemplaza estos placeholders por la URL del SVG o el SVG inline.

**Nota:** El editor visual (iframe de draw.io, botón de insertar diagrama) es **frontend**. El backend solo almacena, sirve y reemplaza placeholders.

**Schema nuevo:** `dms_document_diagrams`.

---

### 6. URL History y Permalinks Robustos

**Problema:** Al cambiar el `slug` de un documento, los enlaces antiguos se rompen.

**Tareas backend:**

- [ ] **Nueva tabla: `dms_document_slug_history`**

  ```sql
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references dms_documents(id) on delete cascade,
  old_slug varchar(500) not null,
  changed_at timestamp with time zone default now(),
  unique(old_slug)
  ```

  - Índice único en `old_slug` para lookups rápidos.

- [ ] **Redirección en endpoint de render**
  - `GET /api/dms/render/:slug`
  - Si no encuentra `slug` en `dms_documents`, buscar en `dms_document_slug_history`.
  - Si existe → responder con **HTTP 308 Permanent Redirect** al nuevo slug.
  - Si no existe → 404.
- [ ] **Trigger/Cascada**
  - Al hacer `PATCH` de `slug` en `dms_documents`, automáticamente insertar el `old_slug` en `dms_document_slug_history`.
  - Esto puede hacerse en la capa de servicio o con un trigger PostgreSQL.

**Schema nuevo:** `dms_document_slug_history`.

---

### 7. Importación/Exportación Masiva (ZIP)

**Problema:** No hay endpoints para migrar documentos en masa.

**Tareas backend:**

- [ ] **Export ZIP**
  - `GET /api/dms/categories/:id/export/zip`
  - Incluir `manifest.json` con versión del formato:
    ```json
    {
      "format": "kitsuden-dms-export",
      "version": "1.0.0",
      "exportedAt": "2026-05-09T00:00:00Z",
      "category": { "id", "name", "slug" }
    }
    ```
  - Cada documento en carpeta propia con `metadata.json`, `content.md`, `content.html` y carpeta `files/`.
- [ ] **Import ZIP**
  - `POST /api/dms/import/zip` (multipart/form-data)
  - Validar `manifest.json`.
  - Crear categorías faltantes (o mapear por slug).
  - Crear documentos en estado `draft` con `createdById` = usuario autenticado.
  - Subir archivos adjuntos a storage y crear registros en `dms_document_files`.
  - Response con reporte: creados, errores, mapeos de IDs.
- [ ] **Formato de intercambio documentado**
  - Especificar el schema del `manifest.json` y la estructura de carpetas para compatibilidad futura.

**Schema afectado:** Ninguno (usa tablas existentes).

---

### 8. Búsqueda Full-Text en Contenido

**Problema:** No está confirmado que el campo `content` de `dms_document_versions` esté indexado para búsqueda.

**Tareas backend:**

- [ ] **Índice GIN de PostgreSQL**

  ```sql
  CREATE INDEX dms_versions_content_fts_idx
  ON dms_document_versions
  USING GIN (to_tsvector('spanish', content));
  ```

  - Considerar un índice por idioma si el DMS soporta multi-idioma.

- [ ] **Endpoint mejorado: `GET /api/dms/search?q=...&filters=...`**
  - Usar `ts_rank` + `ts_headline` para devolver snippets con highlights.
  - Agregar filtros: `categoryId`, `type`, `status`, `authorId`, `dateFrom`, `dateTo`.
  - Response:
    ```json
    {
      "results": [
        {
          "document": { "id", "title", "code", "slug" },
          "version": { "id", "versionNumber" },
          "snippet": "... <mark>instalación</mark> del sistema requiere...",
          "rank": 0.85
        }
      ]
    }
    ```
- [ ] **Búsqueda en archivos adjuntos**
  - Incluir `dms_document_files.extractedText` en la búsqueda global (UNION o índice separado).
  - Devolver resultado tipo "encontrado en archivo adjunto: manual.pdf".

**Schema afectado:** Nuevo índice GIN en `dms_document_versions.content`.

---

### 9. Quick Wins Backend ✅ IMPLEMENTADOS

| #   | Mejora                         | Estado | Detalles                                                                                                                                                                                                                      |
| --- | ------------------------------ | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 9.1 | **Contador de vistas**         | ✅     | Dedup por usuario 5 minutos vía `dms_access_log`. Solo incrementa si no hay log `view` previo del mismo usuario en la ventana.                                                                                                |
| 9.2 | **Flag "Requiere Revisión"**   | ✅     | Campo computado `requiresReview` en responses de `GET /documents` y `GET /documents/:id`. `true` si `reviewDueDate < now()` o `expirationDate < now()`.                                                                       |
| 9.3 | **Clonado desde plantilla**    | ✅     | Endpoint `POST /api/dms/documents/from-template/:templateId`. Clona documento + última versión en `draft`.                                                                                                                    |
| 9.4 | **Notificaciones de workflow** | ✅     | Tabla `dms_workflow_notifications` + endpoints `GET /notifications`, `POST /notifications/:id/read`, `POST /notifications/read-all`. Se crean automáticamente en `submit`, `review` (approved/changes_requested) y `publish`. |
| 9.5 | **Validación de wiki-links**   | ✅     | Al crear/actualizar versión, se parsea `[[CODE]]`/`[[slug]]` y se devuelve `warnings.wikiLinks: [{ target, exists }]` en el response.                                                                                         |

---

## Recordar: Frontend

> Estas funcionalidades **no son responsabilidad del kon DMS** (backend headless), pero deben implementarse en el consumidor de la API (ej. `packages/admin` o un portal de documentación dedicado) para que las mejoras del backend tengan sentido de usuario.

| #    | Función Frontend                               | Qué necesita del backend                                                                                                              |
| ---- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| F.1  | **Vista de lectura / Document Reader**         | Consume `GET /api/dms/render/:slug`, muestra `content`, `toc`, `navigation`, `breadcrumb`.                                            |
| F.2  | **Modo claro/oscuro**                          | Puramente CSS del frontend. El backend puede devolver `theme: null` (no aplica).                                                      |
| F.3  | **Previsualización de Markdown en Admin**      | Preview del `content` antes de guardar. Puede hacerse 100% en cliente con librería JS.                                                |
| F.4  | **Editor WYSIWYG / Rich Text**                 | El frontend envía HTML/Markdown al backend vía `POST/PATCH`. El kon solo recibe y almacena strings.                                   |
| F.5  | **Editor de diagramas (Draw.io / Excalidraw)** | Iframe/componente que persiste `source_xml/json` vía endpoints de diagramas y deja un placeholder `[[diagram:uuid]]` en el `content`. |
| F.6  | **Exportación a PDF (botón)**                  | Llama a `GET /api/dms/versions/:id/export/pdf` y descarga el archivo/stream.                                                          |
| F.7  | **UI de comentarios**                          | Consume endpoints de comentarios. Renderiza hilos, botón de resolver, input con @mentions (autocomplete de usuarios).                 |
| F.8  | **Wiki-links: autocompletado**                 | Al escribir `[[` en el editor, llamar a `GET /api/dms/documents?search=` para sugerir documentos.                                     |
| F.9  | **Badge "Requiere Revisión"**                  | Lee el campo `requiresReview` del endpoint de documento.                                                                              |
| F.10 | **Importación drag-and-drop ZIP**              | Input file que sube ZIP a `POST /api/dms/import/zip`. Muestra reporte de resultado.                                                   |

---

## Priorización Sugerida (Solo Backend)

### Fase 0: Quick Wins ✅ COMPLETADA

- Contador de vistas deduplicado, `requiresReview`, clonado desde template, notificaciones de workflow, validación de wiki-links.

### Fase 1: Fundamentos de API Pública ✅ COMPLETADA

1. ✅ **Endpoint `/api/dms/render/:slug`** — HTML con TOC generado, IDs inyectados en headers, navegación prev/next, breadcrumb, ACL (public/restricted/private).
2. ✅ **Endpoint `/api/dms/render/code/:code`** — Redirección 307 al render por slug.
3. ✅ **Búsqueda full-text** — Índice GIN `dms_versions_content_fts_idx` + endpoint `/search` con `ts_rank`/`ts_headline` y fallback a LIKE.
4. ✅ **URL history** — Tabla `dms_document_slug_history` + redirección 308 en render + guardado automático en `PATCH /documents/:id`.

### Fase 2: Colaboración y Enriquecimiento ✅ COMPLETADA

5. ✅ **Comentarios** — Tabla `dms_document_comments` + endpoints CRUD (`GET/POST /documents/:id/comments`, `PATCH/DELETE /comments/:id`, `POST /comments/:id/resolve`) con hilos (replies).
6. ✅ **Wiki-links** — Validación en guardado de versiones + resolución en render (`/render/:slug` devuelve `wikiLinks: [{target, exists}]`) + endpoint `/documents/:id/backlinks`.
7. ✅ **Exportación** — `/versions/:id/export/html` (standalone), `/versions/:id/export/md`, `/categories/:id/export/zip` (estructura JSON lista para empaquetar en frontend).

### Fase 3: Contenido Avanzado ✅ COMPLETADA

8. ✅ **Diagramas** — Tabla `dms_document_diagrams` + endpoints CRUD + reemplazo de placeholders `[[diagram:uuid]]` en el render endpoint.
9. ✅ **Import** — Endpoint `POST /api/dms/import` que acepta el formato de export JSON y crea documentos/versiones en `draft`.

---

## Notas Técnicas

- **Aditivo:** Todo el schema es aditivo. No se modifican tablas existentes, solo se añaden nuevas.
- **Cache:** El renderizado de PDF y el endpoint `/render/:slug` deben cachearse (Redis/CDN) para no regenerar en cada request.
- **Seguridad:** El render público debe respetar estrictamente el ACL del documento (`visibility`, `allowedRoles`, `departmentId`, `allowedUserIds`).
- **Headless:** El kon nunca debe asumir cómo se ve el frontend. Devuelve datos estructurados y deja la presentación al consumidor.

---

_Documento generado para planificación de backend. Última actualización: 2026-05-09_
