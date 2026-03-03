# DMS — Gestor de Manuales: Arquitectura

## Descripción General

El módulo DMS implementa tres flujos críticos de negocio:

1. **Versionamiento "Black Box"** — al subir una nueva versión, la anterior se marca como `superseded` y la nueva se convierte en la versión activa. La versión anterior NO se elimina.
2. **Control de acceso por departamento** — solo los usuarios cuyo `department` coincide con `target_department` del documento pueden descargarlo.
3. **Flujo de aprobación** — un Gerente cambia el estado del documento de `DRAFT` → `APPROVED` y el sistema emite un evento a BullMQ.

---

## Diagrama de Secuencia — Flujo de Nueva Versión

```mermaid
sequenceDiagram
    actor Employee as Empleado
    participant API as DMS Controller
    participant SVC as DMS Service
    participant DB as PostgreSQL
    participant Q as BullMQ (email-notifications)

    Employee->>API: POST /docs/:id/new-version<br/>{ file_url, version_number }
    API->>SVC: newVersion(docId, payload, userId)

    SVC->>DB: SELECT * FROM documents WHERE id = :docId
    DB-->>SVC: document row

    SVC->>DB: UPDATE document_versions<br/>SET is_active = false, status = 'superseded'<br/>WHERE document_id = :docId AND is_active = true
    Note over SVC,DB: "Black Box": versión anterior<br/>se oculta pero NO se borra.

    SVC->>DB: INSERT INTO document_versions<br/>{ document_id, version_number, file_url, is_active: true }
    DB-->>SVC: new version row

    SVC-->>API: new version
    API-->>Employee: 201 Created { version }
```

---

## Diagrama de Secuencia — Flujo de Descarga con Control de Acceso

```mermaid
sequenceDiagram
    actor User as Usuario
    participant API as DMS Controller
    participant SVC as DMS Service
    participant DB as PostgreSQL

    User->>API: GET /docs/:id/download<br/>Header: Authorization (sesión BA)
    API->>SVC: getDownloadUrl(docId, { userId, department })

    SVC->>DB: SELECT d.target_department, v.file_url<br/>FROM documents d<br/>JOIN document_versions v ON v.document_id = d.id<br/>WHERE d.id = :docId AND v.is_active = true

    DB-->>SVC: { target_department, file_url }

    alt department === target_department
        SVC-->>API: file_url
        API-->>User: 200 OK { download_url }
    else department !== target_department
        SVC-->>API: throws ForbiddenError
        API-->>User: 403 Forbidden
    end
```

---

## Diagrama de Secuencia — Flujo de Aprobación + BullMQ

```mermaid
sequenceDiagram
    actor Manager as Gerente
    participant API as DMS Controller
    participant SVC as DMS Service
    participant DB as PostgreSQL
    participant Q as BullMQ (email-notifications)

    Manager->>API: POST /docs/:id/approve
    API->>SVC: approveDocument(docId, { userId, role })

    SVC->>DB: SELECT id, title, status, target_department<br/>FROM documents WHERE id = :docId
    DB-->>SVC: document

    alt status !== 'DRAFT'
        SVC-->>API: throws ConflictError
        API-->>Manager: 409 Conflict
    else status === 'DRAFT'
        SVC->>DB: UPDATE documents SET status = 'APPROVED'<br/>WHERE id = :docId
        DB-->>SVC: updated document

        SVC->>Q: queue.add('new-manual-published', {<br/>  type: 'NEW_MANUAL_PUBLISHED',<br/>  documentId, title, targetDepartment<br/>})
        Note over SVC,Q: Fire-and-forget.<br/>Fallo en queue no revierte la aprobación.

        SVC-->>API: { document, queued: true }
        API-->>Manager: 200 OK { document }
    end
```

---

## Decisiones de Diseño

| Decisión | Justificación |
|---|---|
| `is_active` flag en `document_versions` | Permite "Black Box" sin DELETE — historial completo preservado |
| `role` en el contexto de usuario | Solo `manager` y `admin` pueden aprobar |
| Fire-and-forget en BullMQ | La aprobación en DB es la fuente de verdad; un fallo de queue no la revierte |
| Datos de usuario inyectados en el controller | El service es puro y testeable sin dependencia de Hono |
