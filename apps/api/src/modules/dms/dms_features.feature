# language: es
# DMS — Gestor de Manuales: Especificaciones BDD
# Sintaxis: Gherkin (Cucumber compatible)
#
# Contexto del sistema:
#   - El contexto de usuario incluye: user_id, role (employee | manager | admin),
#     department (obtenido de employee_profile).
#   - El documento tiene un campo target_department que define quién puede acceder.
#   - Las versiones tienen un flag is_active; solo una versión puede estar activa.

Feature: Gestor de Manuales (DMS)

  # ─────────────────────────────────────────────────────────────────────────────
  # Escenario 1: Control de acceso por departamento (403 Forbidden)
  # ─────────────────────────────────────────────────────────────────────────────

  Scenario: Un empleado intenta descargar un manual de un departamento distinto al suyo
    Given que existe un documento con id "doc-001"
      And el documento tiene target_department "TI"
      And la versión activa del documento tiene file_url "https://s3.example.com/manual-v1.pdf"
    And el usuario autenticado tiene department "RRHH" y role "employee"

    When el usuario hace GET /api/custom/docs/doc-001/download

    Then el sistema responde con status 403
      And el cuerpo de la respuesta contiene { "error": "Forbidden" }
      And el archivo NO es descargado

  # ─────────────────────────────────────────────────────────────────────────────
  # Escenario 2: Versionamiento "Black Box" (nueva versión + versión anterior intacta)
  # ─────────────────────────────────────────────────────────────────────────────

  Scenario: Se sube una nueva actualización de un documento existente
    Given que existe un documento con id "doc-002" y status "APPROVED"
      And existe una versión activa con version_number "v1.1" e is_active true

    When un usuario con role "manager" hace POST /api/custom/docs/doc-002/new-version
      And el body contiene { "version_number": "v1.2", "file_url": "https://s3.example.com/manual-v1.2.pdf" }

    Then el sistema responde con status 201
      And se crea una nueva fila en document_versions con version_number "v1.2" e is_active true
      And la fila anterior con version_number "v1.1" tiene is_active false y status "superseded"
      And la fila con version_number "v1.1" todavía existe en la base de datos (no fue eliminada)

  # ─────────────────────────────────────────────────────────────────────────────
  # Escenario 3: Aprobación de documento DRAFT → APPROVED + evento BullMQ
  # ─────────────────────────────────────────────────────────────────────────────

  Scenario: Un Gerente aprueba un documento en estado DRAFT
    Given que existe un documento con id "doc-003", status "DRAFT"
      And el documento tiene title "Manual de Onboarding" y target_department "RRHH"
    And el usuario autenticado tiene role "manager"

    When el usuario hace POST /api/custom/docs/doc-003/approve

    Then el sistema actualiza el documento con status "APPROVED"
      And el sistema responde con status 200
      And se encola un job en BullMQ en la cola "email-notifications" con payload:
        """
        {
          "type":             "NEW_MANUAL_PUBLISHED",
          "documentId":       "doc-003",
          "title":            "Manual de Onboarding",
          "targetDepartment": "RRHH"
        }
        """

  # ─────────────────────────────────────────────────────────────────────────────
  # Escenario 4: Aprobar un documento que NO está en DRAFT (regla de negocio)
  # ─────────────────────────────────────────────────────────────────────────────

  Scenario: Intentar aprobar un documento que ya está APPROVED
    Given que existe un documento con id "doc-004" y status "APPROVED"
    And el usuario autenticado tiene role "manager"

    When el usuario hace POST /api/custom/docs/doc-004/approve

    Then el sistema responde con status 409
      And el cuerpo de la respuesta contiene { "error": "Conflict" }
      And NO se emite ningún job a BullMQ

  # ─────────────────────────────────────────────────────────────────────────────
  # Escenario 5: Empleado sin rol de Gerente intenta aprobar (autorización)
  # ─────────────────────────────────────────────────────────────────────────────

  Scenario: Un empleado sin permisos intenta aprobar un documento
    Given que existe un documento con id "doc-005" y status "DRAFT"
    And el usuario autenticado tiene role "employee"

    When el usuario hace POST /api/custom/docs/doc-005/approve

    Then el sistema responde con status 403
      And el cuerpo de la respuesta contiene { "error": "Forbidden" }
      And el documento sigue con status "DRAFT"
