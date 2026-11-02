-- ============================================================================
-- RLS NATIVO DE POSTGRESQL - El Muro de Titanio (Fase AI-Ready)
-- ============================================================================
-- 
-- Este archivo contiene las políticas de Row Level Security (RLS) nativas
-- de PostgreSQL. Actúan como "segunda línea de defensa" contra fugas de datos.
--
-- ARQUITECTURA HÍBRIDA:
-- - Nivel 1 (Aplicación): RLS via Drizzle WHERE (rendimiento óptimo)
-- - Nivel 2 (Base de Datos): RLS Nativo PostgreSQL (seguridad absoluta)
--
-- Las políticas usan current_setting('app.current_user_id') inyectado por
-- el middleware de Hono en cada petición.
--
-- NOTA: Ejecutar este archivo después de las migraciones de Drizzle.
--
-- ── «CONTEXTO VACÍO = PERMITIR TODO» TENÍA UN AGUJERO ───────────────────────
--
-- Las políticas fallan ABIERTAS sin contexto (migraciones, seeds y workers
-- corren sin usuario). Pero `current_setting('app.current_user_id', true)`
-- devuelve NULL —no ''— en una conexión donde NADIE lo ha fijado todavía, y
-- `NULL = ''` no es verdadero: es NULL. La política no permitía nada.
--
-- Como las conexiones son de un pool, el resultado dependía de por dónde
-- hubiera pasado antes esa conexión: una recién abierta devolvía cero filas
-- y otra, reutilizada de una petición con contexto, las devolvía todas. El
-- mismo GET anónimo a un dataset público daba una cosa u otra según le
-- tocara. Por eso ahora se comprueba también `IS NULL`, igual que en
-- rls-owned-tables.sql.
--
-- Y cada política se BORRA antes de crearse: el aplicador se traga los
-- «already exists», así que sin el DROP editar este fichero no cambiaba nada
-- en una base que ya lo tuviera aplicado.
-- ============================================================================

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. HABILITAR RLS EN TABLAS CRÍTICAS
-- ═══════════════════════════════════════════════════════════════════════════

-- Tabla: data_entries (Datos de usuarios - Crítica)
ALTER TABLE data_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_entries FORCE ROW LEVEL SECURITY; -- Aplica incluso al table owner

-- Tabla: ai_memories (Datos de IA - Crítica si existe)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ai_memories') THEN
        ALTER TABLE ai_memories ENABLE ROW LEVEL SECURITY;
        ALTER TABLE ai_memories FORCE ROW LEVEL SECURITY;
    END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. POLÍTICAS PARA data_entries
-- ═══════════════════════════════════════════════════════════════════════════

-- Política: Los usuarios solo ven sus propios registros
-- Se aplica cuando owner_id está establecido
DROP POLICY IF EXISTS data_entries_owner_isolation ON data_entries;

CREATE POLICY data_entries_owner_isolation ON data_entries
    FOR ALL
    TO PUBLIC
    USING (
        -- Sin contexto RLS (id Y rol vacíos o sin fijar) es el SISTEMA:
        -- migraciones, cargadores, workers. Solo el id vacío NO basta: el
        -- anónimo de una petición lleva id '' y rol `anonymous`, y antes
        -- atravesaba esta política como si fuera el sistema (2026-10-23).
        (COALESCE(current_setting('app.current_user_id', true), '') = ''
         AND COALESCE(current_setting('app.current_user_role', true), '') = '')
        OR
        -- Si es admin, permitir todo
        current_setting('app.current_user_role', true) = 'admin'
        OR
        -- Si es el dueño del registro, permitir
        owner_id = current_setting('app.current_user_id', true)
        OR
        -- Si el owner_id es NULL (registros legacy), verificar en data JSONB
        (
            owner_id IS NULL 
            AND data->>'ownerId' = current_setting('app.current_user_id', true)
        )
    )
    WITH CHECK (
        -- Solo el dueño puede modificar (o el sistema, ver arriba)
        (COALESCE(current_setting('app.current_user_id', true), '') = ''
         AND COALESCE(current_setting('app.current_user_role', true), '') = '')
        OR
        current_setting('app.current_user_role', true) = 'admin'
        OR
        owner_id = current_setting('app.current_user_id', true)
    );

-- Política: Registros públicos son visibles por todos
-- (cuando no hay restricción de owner)
DROP POLICY IF EXISTS data_entries_public_read ON data_entries;

CREATE POLICY data_entries_public_read ON data_entries
    FOR SELECT
    TO PUBLIC
    USING (
        -- Registros sin owner específico son públicos
        owner_id IS NULL 
        AND (data->>'isPublic' = 'true' OR data->>'visibility' = 'public')
    );

-- Política: lo que el DATASET declara legible, se lee (2026-10-23)
--
-- La visibilidad de un dataset vive en `data_sets.policy_json` (`readAccess`:
-- public | authenticated | admin), y la aplicación la comprueba con
-- `checkReadAccess()`. La base no la miraba: para un usuario con sesión que
-- no fuera admin, las entradas de un dataset PÚBLICO sin dueño (todas las de
-- los juegos) no casaban con ninguna política y salían CERO filas. Y el
-- anónimo las veía solo porque pasaba por la escotilla del sistema.
--
-- Con esto, la base dice lo mismo que la aplicación: `public` lo lee
-- cualquiera, `authenticated` quien tenga sesión. Solo para datasets SIN
-- `rlsRules`: los que las tienen son por dueño y los filtra
-- `data_entries_owner_isolation` (y `buildDatasetWhere` en la aplicación).
--
-- La subconsulta no depende de la fila: Postgres la evalúa una vez por
-- consulta (hashed subplan), no una vez por entrada.
DROP POLICY IF EXISTS data_entries_lectura_por_dataset ON data_entries;

CREATE POLICY data_entries_lectura_por_dataset ON data_entries
    FOR SELECT
    TO PUBLIC
    USING (
        data_set_id IN (
            SELECT ds.id FROM data_sets ds
            WHERE (
                ds.policy_json->>'readAccess' = 'public'
                OR (
                    ds.policy_json->>'readAccess' = 'authenticated'
                    AND COALESCE(current_setting('app.current_user_id', true), '') <> ''
                )
            )
            AND COALESCE(
                jsonb_array_length(
                    CASE WHEN jsonb_typeof(ds.policy_json->'rlsRules') = 'array'
                         THEN ds.policy_json->'rlsRules' END
                ), 0) = 0
        )
    );

-- Fase E: datasets abiertos por los SCOPES de un agente (`datasets:<slug>:read|write|delete`).
-- La API fija los scopes del agente en app.agent_scopes (separados por comas,
-- local a la transacción: engine/src/rls-peticion.ts). Estas funciones son la
-- MISMA regla que @kitsuden/shared (permisos-de-agente.ts): comodines `x:*`,
-- `*:y`, `a:*:c`, `admin`, y una denegación `!patrón` que gana a todo. Un test
-- (src/tests/permisos-finos-de-agentes.test.ts) compara las dos con una tabla.
-- Sin app.agent_scopes (humanos, anónimos, sistema) no abren nada.
CREATE OR REPLACE FUNCTION kitsuden_patron_cubre(patron text, requerido text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $FN$
DECLARE
  p text[];
  r text[];
  n int;
  i int;
BEGIN
  IF patron IS NULL OR requerido IS NULL OR patron = '' OR requerido = '' THEN RETURN false; END IF;
  IF patron = requerido THEN RETURN true; END IF;
  p := string_to_array(patron, ':');
  n := array_length(p, 1);
  IF n < 2 THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM unnest(p) AS x WHERE x <> '*') THEN RETURN false; END IF;
  IF p[1] = '*' THEN
    RETURN length(requerido) >= length(patron) - 1
       AND right(requerido, length(patron) - 1) = substr(patron, 2);
  END IF;
  r := string_to_array(requerido, ':');
  IF p[n] = '*' THEN
    IF array_length(r, 1) <= n - 1 THEN RETURN false; END IF;
    n := n - 1;
  ELSIF array_length(r, 1) <> n THEN
    RETURN false;
  END IF;
  FOR i IN 1..n LOOP
    IF p[i] = '*' THEN
      IF coalesce(r[i], '') = '' THEN RETURN false; END IF;
    ELSIF p[i] IS DISTINCT FROM r[i] THEN
      RETURN false;
    END IF;
  END LOOP;
  RETURN true;
END
$FN$;

CREATE OR REPLACE FUNCTION kitsuden_agente_abre_dataset(p_data_set_id uuid, p_accion text)
RETURNS boolean LANGUAGE plpgsql STABLE AS $FN$
DECLARE
  crudo text := coalesce(current_setting('app.agent_scopes', true), '');
  scopes text[];
  s text;
  req text;
BEGIN
  IF crudo = '' THEN RETURN false; END IF;
  SELECT 'datasets:' || ds.slug || ':' || p_accion INTO req FROM data_sets ds WHERE ds.id = p_data_set_id;
  IF req IS NULL THEN RETURN false; END IF;
  scopes := string_to_array(crudo, ',');
  FOREACH s IN ARRAY scopes LOOP
    IF left(s, 1) = '!' AND kitsuden_patron_cubre(substr(s, 2), req) THEN RETURN false; END IF;
  END LOOP;
  FOREACH s IN ARRAY scopes LOOP
    IF left(s, 1) <> '!' AND (s = 'admin' OR s = 'admin:*' OR kitsuden_patron_cubre(s, req)) THEN
      RETURN true;
    END IF;
  END LOOP;
  RETURN false;
END
$FN$;

-- La lectura incluye escribir y borrar: un INSERT/UPDATE con RETURNING tiene
-- que poder ver la fila que escribe. Qué puede LEER el agente lo decide la
-- aplicación (puedeVerDataset en kon-datasets).
DROP POLICY IF EXISTS data_entries_agente_lectura ON data_entries;
CREATE POLICY data_entries_agente_lectura ON data_entries FOR SELECT
    USING (
        coalesce(current_setting('app.agent_scopes', true), '') <> ''
        AND (kitsuden_agente_abre_dataset(data_set_id, 'read')
             OR kitsuden_agente_abre_dataset(data_set_id, 'write')
             OR kitsuden_agente_abre_dataset(data_set_id, 'delete'))
    );
DROP POLICY IF EXISTS data_entries_agente_alta ON data_entries;
CREATE POLICY data_entries_agente_alta ON data_entries FOR INSERT
    WITH CHECK (coalesce(current_setting('app.agent_scopes', true), '') <> ''
                AND kitsuden_agente_abre_dataset(data_set_id, 'write'));
DROP POLICY IF EXISTS data_entries_agente_edicion ON data_entries;
CREATE POLICY data_entries_agente_edicion ON data_entries FOR UPDATE
    USING (coalesce(current_setting('app.agent_scopes', true), '') <> ''
           AND kitsuden_agente_abre_dataset(data_set_id, 'write'))
    WITH CHECK (coalesce(current_setting('app.agent_scopes', true), '') <> ''
                AND kitsuden_agente_abre_dataset(data_set_id, 'write'));
DROP POLICY IF EXISTS data_entries_agente_borrado ON data_entries;
CREATE POLICY data_entries_agente_borrado ON data_entries FOR DELETE
    USING (coalesce(current_setting('app.agent_scopes', true), '') <> ''
           AND kitsuden_agente_abre_dataset(data_set_id, 'delete'));

-- Fase F en la base (auditoría 2026-10-25): la OTRA vía por la que la
-- aplicación abre un dataset a un agente, sin scope fino. Es la regla de
-- `exigirDataset` (apps/api/src/services/mcp-tools.ts) y de
-- checkReadAccess/checkWriteAccess (@kitsuden/shared rls-builder.ts):
--
--   · la herramienta: `mcp:read` para leer, `mcp:write` para escribir/borrar;
--   · leer: `readAccess` public/authenticated, o el scope `dataset:view`;
--   · escribir: además `writeAccess` authenticated, o `dataset-entry:create`;
--   · borrar: además `writeAccess` authenticated, o `dataset-entry:delete`;
--   · una denegación `!datasets:<slug>:<acción>` (o más amplia) gana siempre.
--
-- Sin esto, las herramientas MCP del núcleo no podían correr dentro de la
-- transacción RLS del agente: Postgres solo conocía los scopes finos y la
-- aplicación también abre por política (con el firmante como dueño).

-- ¿Concede la lista de scopes del agente `p_requerido`? (denegación gana)
CREATE OR REPLACE FUNCTION kitsuden_agente_concede(p_requerido text)
RETURNS boolean LANGUAGE plpgsql STABLE AS $FN$
DECLARE
  crudo text := coalesce(current_setting('app.agent_scopes', true), '');
  scopes text[];
  s text;
BEGIN
  IF crudo = '' OR p_requerido IS NULL THEN RETURN false; END IF;
  scopes := string_to_array(crudo, ',');
  FOREACH s IN ARRAY scopes LOOP
    IF left(s, 1) = '!' AND kitsuden_patron_cubre(substr(s, 2), p_requerido) THEN RETURN false; END IF;
  END LOOP;
  FOREACH s IN ARRAY scopes LOOP
    IF left(s, 1) <> '!' AND (s = 'admin' OR s = 'admin:*' OR kitsuden_patron_cubre(s, p_requerido)) THEN
      RETURN true;
    END IF;
  END LOOP;
  RETURN false;
END
$FN$;

-- ¿Hay una denegación del agente que cubra `p_requerido`?
CREATE OR REPLACE FUNCTION kitsuden_agente_denegado(p_requerido text)
RETURNS boolean LANGUAGE plpgsql STABLE AS $FN$
DECLARE
  crudo text := coalesce(current_setting('app.agent_scopes', true), '');
  s text;
BEGIN
  IF crudo = '' THEN RETURN false; END IF;
  FOREACH s IN ARRAY string_to_array(crudo, ',') LOOP
    IF left(s, 1) = '!' AND kitsuden_patron_cubre(substr(s, 2), p_requerido) THEN RETURN true; END IF;
  END LOOP;
  RETURN false;
END
$FN$;

CREATE OR REPLACE FUNCTION kitsuden_agente_abre_por_politica(p_data_set_id uuid, p_accion text)
RETURNS boolean LANGUAGE plpgsql STABLE AS $FN$
DECLARE
  v_slug text;
  v_politica jsonb;
  v_lee boolean;
BEGIN
  IF coalesce(current_setting('app.agent_scopes', true), '') = '' THEN RETURN false; END IF;
  SELECT ds.slug, ds.policy_json INTO v_slug, v_politica FROM data_sets ds WHERE ds.id = p_data_set_id;
  IF v_slug IS NULL THEN RETURN false; END IF;
  IF kitsuden_agente_denegado('datasets:' || v_slug || ':' || p_accion) THEN RETURN false; END IF;
  IF NOT kitsuden_agente_concede(CASE WHEN p_accion = 'read' THEN 'mcp:read' ELSE 'mcp:write' END) THEN
    RETURN false;
  END IF;
  v_lee := coalesce(v_politica->>'readAccess', '') IN ('public', 'authenticated')
           OR kitsuden_agente_concede('dataset:view');
  IF p_accion = 'read' THEN RETURN v_lee; END IF;
  RETURN v_lee AND (
    coalesce(v_politica->>'writeAccess', '') = 'authenticated'
    OR kitsuden_agente_concede(CASE WHEN p_accion = 'delete' THEN 'dataset-entry:delete' ELSE 'dataset-entry:create' END)
  );
END
$FN$;

DROP POLICY IF EXISTS data_entries_agente_politica_lectura ON data_entries;
CREATE POLICY data_entries_agente_politica_lectura ON data_entries FOR SELECT
    USING (kitsuden_agente_abre_por_politica(data_set_id, 'read')
           OR kitsuden_agente_abre_por_politica(data_set_id, 'write')
           OR kitsuden_agente_abre_por_politica(data_set_id, 'delete'));
DROP POLICY IF EXISTS data_entries_agente_politica_alta ON data_entries;
CREATE POLICY data_entries_agente_politica_alta ON data_entries FOR INSERT
    WITH CHECK (kitsuden_agente_abre_por_politica(data_set_id, 'write'));
DROP POLICY IF EXISTS data_entries_agente_politica_edicion ON data_entries;
CREATE POLICY data_entries_agente_politica_edicion ON data_entries FOR UPDATE
    USING (kitsuden_agente_abre_por_politica(data_set_id, 'write'))
    WITH CHECK (kitsuden_agente_abre_por_politica(data_set_id, 'write'));
DROP POLICY IF EXISTS data_entries_agente_politica_borrado ON data_entries;
CREATE POLICY data_entries_agente_politica_borrado ON data_entries FOR DELETE
    USING (kitsuden_agente_abre_por_politica(data_set_id, 'delete'));

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. POLÍTICAS PARA ai_memories (si existe)
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ai_memories') THEN
        -- Política: Usuarios solo ven sus propias memorias
        DROP POLICY IF EXISTS ai_memories_user_isolation ON ai_memories;

        CREATE POLICY ai_memories_user_isolation ON ai_memories
            FOR ALL
            TO PUBLIC
            USING (
                -- Sistema = id Y rol vacíos (el anónimo lleva rol `anonymous`)
                (COALESCE(current_setting('app.current_user_id', true), '') = ''
                 AND COALESCE(current_setting('app.current_user_role', true), '') = '')
                OR
                user_id = current_setting('app.current_user_id', true)
            )
            WITH CHECK (
                user_id = current_setting('app.current_user_id', true)
            );
    END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. FUNCIONES AUXILIARES PARA RLS
-- ═══════════════════════════════════════════════════════════════════════════

-- Función: Verificar si RLS está activo para el usuario actual
CREATE OR REPLACE FUNCTION is_rls_active()
RETURNS boolean AS $$
BEGIN
    RETURN COALESCE(current_setting('app.current_user_id', true), '') != '';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Función: Obtener el user_id del contexto RLS
CREATE OR REPLACE FUNCTION current_rls_user_id()
RETURNS text AS $$
BEGIN
    RETURN current_setting('app.current_user_id', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Función: Establecer contexto RLS (útil para testing y scripts)
CREATE OR REPLACE FUNCTION set_rls_context(user_id text, user_role text DEFAULT 'user')
RETURNS void AS $$
BEGIN
    PERFORM set_config('app.current_user_id', user_id, false);
    PERFORM set_config('app.current_user_role', user_role, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Función: Limpiar contexto RLS
CREATE OR REPLACE FUNCTION clear_rls_context()
RETURNS void AS $$
BEGIN
    PERFORM set_config('app.current_user_id', '', false);
    PERFORM set_config('app.current_user_role', '', false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. ÍNDICES OPTIMIZADOS PARA RLS
-- ═══════════════════════════════════════════════════════════════════════════

-- Índice compuesto para queries frecuentes: dataset + owner
CREATE INDEX IF NOT EXISTS idx_data_entries_dataset_owner 
    ON data_entries(data_set_id, owner_id);

-- Índice para búsqueda por owner en data JSONB (legacy support)
CREATE INDEX IF NOT EXISTS idx_data_entries_data_owner 
    ON data_entries((data->>'ownerId'));

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. COMENTARIOS DOCUMENTACIÓN
-- ═══════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE data_entries IS 'Tabla de entradas de datos con RLS nativo habilitado. El acceso está controlado por owner_id y el contexto app.current_user_id.';

COMMENT ON POLICY data_entries_owner_isolation ON data_entries IS 'Política RLS: Solo el dueño o admin puede acceder a los registros';

-- ============================================================================
-- FIN DEL SCRIPT RLS
-- ============================================================================
-- 
-- INSTRUCCIONES DE USO:
-- 1. Ejecutar: psql -d kitsuden -f apps/api/src/db/rls-policies.sql
-- 2. Verificar: SELECT * FROM pg_policies WHERE tablename = 'data_entries';
-- 3. Testing: SELECT set_config('app.current_user_id', 'user-123', true);
--              SELECT * FROM data_entries; -- Debe retornar solo registros del usuario
--
-- ============================================================================
