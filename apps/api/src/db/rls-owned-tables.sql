-- ============================================================================
-- RLS — Tablas de propiedad PERSONAL (expansión del Muro de Titanio)
-- ============================================================================
--
-- POR QUÉ EXISTE ESTE ARCHIVO
--
-- rls-policies.sql cubría 2 tablas de 147. El README prometía "tres muros
-- independientes" y el muro de base de datos cubría el 1,4% del esquema: el
-- aislamiento real descansaba en las políticas de aplicación, que es la capa
-- que ya se ha filtrado cuatro veces (GraphQL, datasets ×2, realtime).
--
-- QUÉ TABLAS ENTRAN — Y CUÁLES NO, QUE ES IGUAL DE IMPORTANTE
--
-- Entran las tablas cuyo user_id/owner_id significa "esta fila ES de esta
-- persona": sesiones, pagos, progreso formativo, reservas. Aislarlas por
-- usuario es semánticamente correcto siempre.
--
-- NO entran las tablas donde la columna significa autoría en una herramienta
-- COLABORATIVA (crm_deals.created_by, agile_issues.created_by…): aislar por
-- creador rompería la visibilidad de equipo que es el punto de esas apps. Su
-- control de acceso pertenece a las policies de aplicación, que saben de
-- equipos y roles. Cada exclusión está decidida, no olvidada — el test
-- tests-unit/rls-coverage.test.ts obliga a clasificar cada tabla nueva.
--
-- PATRÓN DE LAS POLÍTICAS (idéntico a rls-policies.sql)
--
-- Fallan ABIERTAS con contexto vacío: migraciones, seeds, webhooks y workers
-- corren sin usuario y deben seguir funcionando. La protección aplica cuando
-- withTransactionalRLS() inyecta el contexto — es decir, en cada petición
-- HTTP. Y FORCE es obligatorio: sin él, el dueño de la tabla (el rol de la
-- app) queda exento y la política es decorativa.
--
-- Ejecutar tras las migraciones:  psql -f rls-owned-tables.sql
-- Idempotente: DROP POLICY IF EXISTS antes de cada CREATE.
-- ============================================================================

-- ── POR QUÉ `%I::text` Y NO `%I` ───────────────────────────────────────────
--
-- `current_setting()` devuelve SIEMPRE `text`. La columna de dueño, no: en las
-- tablas del núcleo es `text` (los ids de better-auth lo son), pero en las de
-- los kons es `uuid`. Y Postgres no tiene un operador `uuid = text`:
--
--     ERROR:  operator does not exist: uuid = text
--
-- El error no aparece al crear la política —el cuerpo no se analiza hasta que
-- se usa— sino al aplicar el fichero sobre un esquema que YA incluye una tabla
-- de kon con dueño uuid. Es decir: el arranque funcionaba hasta que alguien
-- instalaba un kon, y entonces el contenedor entero dejaba de levantar. El
-- casteo va en la columna, no en `current_setting`, porque un texto que no sea
-- un UUID válido haría fallar la conversión en tiempo de ejecución.

-- ── LA ESCOTILLA ES DEL SISTEMA, NO DEL ANÓNIMO (2026-10-15) ───────────────
--
-- `withTransactionalRLS()` marca a quien no tiene sesión con id '' y rol
-- 'anonymous'. Antes la escotilla miraba SOLO el id vacío, así que un anónimo
-- dentro de una transacción RLS atravesaba todas estas políticas como si fuera
-- el sistema. Ahora la escotilla exige además rol vacío (o sin fijar): la
-- conexión sin contexto (migraciones, workers, better-auth) sigue pasando; el
-- anónimo solo ve filas cuyo dueño sea '' — ninguna.
--
-- Plantilla aplicada a cada tabla:
--   USING:  contexto vacío (sistema) | admin | dueño de la fila
--   CHECK:  igual — nadie escribe filas de otro sin ser admin/sistema.

DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN
    SELECT * FROM (VALUES
      -- ── Núcleo (siempre existen) ─────────────────────────────────────
      ('auth_sessions',                'user_id'),
      ('builder_builds',               'owner_id'),
      -- Un voto dice QUIEN voto: es un rastro personal, como el build
      ('builder_build_votes',          'voter_id'),
      -- kon-collection: lo que alguien tiene y lo que le falta es suyo
      ('collection_marks',             'user_id'),
      ('tier_lists',                   'owner_id'),
      ('cardsim_decks',                'owner_id'),
      ('handlab_decks',                'owner_id'),
      ('auth_accounts',                'user_id'),
      ('agent_feedback',               'user_id'),
      -- ── kon-payments: datos financieros personales ─────────────────
      ('pay_customers',                'user_id'),
      ('pay_subscriptions',            'user_id'),
      ('pay_events',                   'user_id'),
      -- ── kon-newsletter: la fila del miembro es suya ────────────────
      ('nl_members',                   'user_id'),
      -- ── kon-academy-lms: progreso y resultados personales ──────────
      ('perfil_usuario_capacitaciones','user_id'),
      ('progreso_cursos',              'user_id'),
      ('progreso_temas',               'user_id'),
      ('respuestas_usuario',           'user_id'),
      ('resultados_quiz',              'user_id'),
      ('progreso_learning_paths',      'user_id'),
      ('asignaciones_learning_path',   'user_id'),
      ('asignaciones',                 'user_id'),
      ('certificados',                 'user_id'),
      ('encuestas_satisfaccion',       'user_id'),
      ('feedback',                     'user_id'),
      -- ── kon-booking: reservas personales ───────────────────────────
      ('booking_reservations',         'user_id'),
      ('booking_notes',                'user_id'),
      -- ── kon-dms: rastro personal (no los documentos, que se comparten)
      ('dms_document_acknowledgments', 'user_id'),
      ('dms_workflow_notifications',   'user_id')
    ) AS owned(table_name, owner_column)
  LOOP
    -- Solo si la tabla existe Y tiene su columna de propiedad.
    --
    -- Comprobar solo la tabla no basta: hay tablas que existen sin la columna
    -- porque la migración del kon que la añade no está en la cadena. La
    -- política se construye con `format(... %I ...)` sobre esa columna, así
    -- que sin ella Postgres aborta con `column "user_id" does not exist` y se
    -- queda sin aplicar TODO el resto del bucle — incluidas las tablas que sí
    -- estaban bien.
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = t.table_name
        AND column_name = t.owner_column
    ) THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t.table_name);
      -- Sin FORCE, el dueño de la tabla (el rol de la app) queda EXENTO y
      -- la política no filtra nada en la práctica.
      EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t.table_name);

      EXECUTE format('DROP POLICY IF EXISTS %I ON %I',
        t.table_name || '_owner_isolation', t.table_name);

      EXECUTE format($POLICY$
        CREATE POLICY %I ON %I
          FOR ALL
          TO PUBLIC
          USING (
            ((current_setting('app.current_user_id', true) = ''
              OR current_setting('app.current_user_id', true) IS NULL)
             AND COALESCE(current_setting('app.current_user_role', true), '') = '')
            OR current_setting('app.current_user_role', true) = 'admin'
            OR %I::text = current_setting('app.current_user_id', true)
          )
          WITH CHECK (
            ((current_setting('app.current_user_id', true) = ''
              OR current_setting('app.current_user_id', true) IS NULL)
             AND COALESCE(current_setting('app.current_user_role', true), '') = '')
            OR current_setting('app.current_user_role', true) = 'admin'
            OR %I::text = current_setting('app.current_user_id', true)
          )
      $POLICY$, t.table_name || '_owner_isolation', t.table_name,
         t.owner_column, t.owner_column);

      RAISE NOTICE 'RLS: % (aislado por %)', t.table_name, t.owner_column;
    END IF;
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Colecciones del Vault (`vault_*`): «sistema» estricto (auditoría 2026-10-25)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `services/vault.ts` creaba la política con `current_user_id = ''` A SECAS
-- como «sistema». El contexto ANÓNIMO también lleva id vacío (con rol
-- `anonymous`), así que un anónimo que llegara a una colección la veía y la
-- escribía entera. Aquí se rehace con la misma condición estricta que el
-- resto (id Y rol vacíos). Las filas sin dueño (`owner_id IS NULL`) siguen
-- siendo de lectura compartida, como se diseñó, pero ya no para anónimos.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name LIKE 'vault\_%'
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_owner_isolation', t);
    EXECUTE format($POLICY$
      CREATE POLICY %I ON %I
        FOR ALL
        TO PUBLIC
        USING (
          (COALESCE(current_setting('app.current_user_id', true), '') = ''
           AND COALESCE(current_setting('app.current_user_role', true), '') = '')
          OR current_setting('app.current_user_role', true) = 'admin'
          OR owner_id = current_setting('app.current_user_id', true)
          OR (owner_id IS NULL
              AND COALESCE(current_setting('app.current_user_id', true), '') <> '')
        )
        WITH CHECK (
          (COALESCE(current_setting('app.current_user_id', true), '') = ''
           AND COALESCE(current_setting('app.current_user_role', true), '') = '')
          OR current_setting('app.current_user_role', true) = 'admin'
          OR owner_id = current_setting('app.current_user_id', true)
        )
    $POLICY$, t || '_owner_isolation', t);
    RAISE NOTICE 'RLS: % (Vault, sistema estricto)', t;
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Agent memory (brain): owner + signer + optional shared visibility (0051)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Not the one-column template above: a note belongs to a USER or to an
-- AGENT (the agent's id is what `app.current_user_id` carries for an agent,
-- with role 'agent'), the agent's human signer may read it, and a `shared`
-- note is readable by the team and by agents.
--
--   READ  (brain_notes)   system | admin | owner (user or agent) | signer
--                          | visibility = 'shared' AND role IN (admin, editor, agent)
--   WRITE (brain_notes)   system | admin | the owner itself: an agent writes
--                          only rows whose owner_agent_id is itself; a person
--                          only rows with owner_user_id = itself and no agent.
--                          Nobody else's note is changed, shared or not.
--   brain_connections     read: BOTH notes readable (the subqueries run under
--                          brain_notes' own policy); write: system | admin |
--                          its owner, and both notes readable.
--   brain_claims          read: its note readable; write: system | admin |
--                          its owner, and the owner owns the note.
--
-- An agent with the `admin` SCOPE is still role 'agent' here: it sees its
-- own notes and the shared ones, not every private note (only a human admin
-- or the system does). Fails open only for the SYSTEM (id AND role empty),
-- never for the anonymous context.
DO $$
DECLARE
  t RECORD;
  sistema text := $S$((COALESCE(current_setting('app.current_user_id', true), '') = ''
       AND COALESCE(current_setting('app.current_user_role', true), '') = '')
      OR current_setting('app.current_user_role', true) = 'admin')$S$;
  propio text := $S$((current_setting('app.current_user_role', true) = 'agent'
        AND owner_agent_id = current_setting('app.current_user_id', true))
      OR (COALESCE(current_setting('app.current_user_role', true), '') NOT IN ('agent', 'anonymous', '')
        AND owner_agent_id IS NULL
        AND owner_user_id = current_setting('app.current_user_id', true)))$S$;
BEGIN
  FOR t IN
    SELECT * FROM (VALUES
      ('brain_notes',       'owner_user_id'),
      ('brain_connections', 'owner_user_id'),
      ('brain_claims',      'owner_user_id')
    ) AS owned(table_name, owner_column)
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t.table_name AND column_name = 'owner_agent_id'
    ) THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t.table_name);
      EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t.table_name);
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t.table_name || '_read', t.table_name);
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t.table_name || '_insert', t.table_name);
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t.table_name || '_update', t.table_name);
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t.table_name || '_delete', t.table_name);

      IF t.table_name = 'brain_notes' THEN
        EXECUTE format($P$CREATE POLICY brain_notes_read ON brain_notes FOR SELECT TO PUBLIC USING (
          %s OR %s
          OR (owner_agent_id IS NULL AND owner_user_id = current_setting('app.current_user_id', true)
              AND COALESCE(current_setting('app.current_user_role', true), '') NOT IN ('agent', 'anonymous', ''))
          OR (sponsor_user_id = current_setting('app.current_user_id', true)
              AND COALESCE(current_setting('app.current_user_role', true), '') NOT IN ('agent', 'anonymous', ''))
          OR (visibility = 'shared'
              AND current_setting('app.current_user_role', true) IN ('admin', 'editor', 'agent'))
        )$P$, sistema, propio);
        EXECUTE format('CREATE POLICY brain_notes_insert ON brain_notes FOR INSERT TO PUBLIC WITH CHECK (%s OR %s)', sistema, propio);
        EXECUTE format('CREATE POLICY brain_notes_update ON brain_notes FOR UPDATE TO PUBLIC USING (%s OR %s) WITH CHECK (%s OR %s)', sistema, propio, sistema, propio);
        EXECUTE format('CREATE POLICY brain_notes_delete ON brain_notes FOR DELETE TO PUBLIC USING (%s OR %s)', sistema, propio);
      ELSIF t.table_name = 'brain_connections' THEN
        EXECUTE $P$CREATE POLICY brain_connections_read ON brain_connections FOR SELECT TO PUBLIC USING (
          EXISTS (SELECT 1 FROM brain_notes n WHERE n.id = source_note_id)
          AND EXISTS (SELECT 1 FROM brain_notes n WHERE n.id = target_note_id)
        )$P$;
        EXECUTE format($P$CREATE POLICY brain_connections_insert ON brain_connections FOR INSERT TO PUBLIC WITH CHECK (
          %s OR (%s
            AND EXISTS (SELECT 1 FROM brain_notes n WHERE n.id = source_note_id)
            AND EXISTS (SELECT 1 FROM brain_notes n WHERE n.id = target_note_id))
        )$P$, sistema, propio);
        EXECUTE format('CREATE POLICY brain_connections_update ON brain_connections FOR UPDATE TO PUBLIC USING (%s OR %s) WITH CHECK (%s OR %s)', sistema, propio, sistema, propio);
        EXECUTE format('CREATE POLICY brain_connections_delete ON brain_connections FOR DELETE TO PUBLIC USING (%s OR %s)', sistema, propio);
      ELSE
        EXECUTE $P$CREATE POLICY brain_claims_read ON brain_claims FOR SELECT TO PUBLIC USING (
          EXISTS (SELECT 1 FROM brain_notes n WHERE n.id = note_id)
        )$P$;
        EXECUTE format($P$CREATE POLICY brain_claims_insert ON brain_claims FOR INSERT TO PUBLIC WITH CHECK (
          %s OR (%s AND EXISTS (
            SELECT 1 FROM brain_notes n WHERE n.id = note_id
              AND (n.owner_agent_id = current_setting('app.current_user_id', true)
                   OR (n.owner_agent_id IS NULL AND n.owner_user_id = current_setting('app.current_user_id', true)))))
        )$P$, sistema, propio);
        EXECUTE format('CREATE POLICY brain_claims_update ON brain_claims FOR UPDATE TO PUBLIC USING (%s OR %s) WITH CHECK (%s OR %s)', sistema, propio, sistema, propio);
        EXECUTE format('CREATE POLICY brain_claims_delete ON brain_claims FOR DELETE TO PUBLIC USING (%s OR %s)', sistema, propio);
      END IF;
      RAISE NOTICE 'RLS: % (brain: owner/agent/signer/shared)', t.table_name;
    END IF;
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Code promotion (fase I, 0053): code_versions
-- ═══════════════════════════════════════════════════════════════════════════
--
-- The drafts an AGENT submits for an action's code (lib/promocion.ts). The
-- owner column is `agent_id` (the agent's id is what `app.current_user_id`
-- carries for an agent, with role 'agent'); `sponsor_user_id` is only the
-- signer recorded for the audit, it grants nothing.
--
--   READ   system | human admin | the agent itself (role 'agent' AND
--          agent_id = current_user_id). Another agent's drafts do not exist
--          for it; an editor or a plain user sees none.
--   WRITE  system | human admin. An agent never writes this table directly:
--          the pipeline (the API process, with an empty context) does.
--
-- An agent with the `admin` SCOPE is still role 'agent' here: it sees its own
-- drafts only. Fails open only for the SYSTEM (id AND role empty).
DO $$
DECLARE
  t RECORD;
  sistema text := $S$((COALESCE(current_setting('app.current_user_id', true), '') = ''
       AND COALESCE(current_setting('app.current_user_role', true), '') = '')
      OR current_setting('app.current_user_role', true) = 'admin')$S$;
BEGIN
  FOR t IN
    SELECT * FROM (VALUES
      ('code_versions', 'agent_id')
    ) AS owned(table_name, owner_column)
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t.table_name
    ) THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t.table_name);
      EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t.table_name);
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t.table_name || '_read', t.table_name);
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t.table_name || '_insert', t.table_name);
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t.table_name || '_update', t.table_name);
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t.table_name || '_delete', t.table_name);
      EXECUTE format($P$CREATE POLICY code_versions_read ON code_versions FOR SELECT TO PUBLIC USING (
        %s
        OR (current_setting('app.current_user_role', true) = 'agent'
            AND agent_id = current_setting('app.current_user_id', true))
      )$P$, sistema);
      EXECUTE format('CREATE POLICY code_versions_insert ON code_versions FOR INSERT TO PUBLIC WITH CHECK (%s)', sistema);
      EXECUTE format('CREATE POLICY code_versions_update ON code_versions FOR UPDATE TO PUBLIC USING (%s) WITH CHECK (%s)', sistema, sistema);
      EXECUTE format('CREATE POLICY code_versions_delete ON code_versions FOR DELETE TO PUBLIC USING (%s)', sistema);
      RAISE NOTICE 'RLS: % (code promotion: agent reads its own; system/admin write)', t.table_name;
    END IF;
  END LOOP;
END $$;
