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
CREATE POLICY data_entries_owner_isolation ON data_entries
    FOR ALL
    TO PUBLIC
    USING (
        -- Si no hay contexto RLS (app.current_user_id vacío), permitir todo
        -- (para compatibilidad con migraciones y scripts admin)
        current_setting('app.current_user_id', true) = ''
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
        -- Solo el dueño puede modificar
        current_setting('app.current_user_id', true) = ''
        OR
        current_setting('app.current_user_role', true) = 'admin'
        OR
        owner_id = current_setting('app.current_user_id', true)
    );

-- Política: Registros públicos son visibles por todos
-- (cuando no hay restricción de owner)
CREATE POLICY data_entries_public_read ON data_entries
    FOR SELECT
    TO PUBLIC
    USING (
        -- Registros sin owner específico son públicos
        owner_id IS NULL 
        AND (data->>'isPublic' = 'true' OR data->>'visibility' = 'public')
    );

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. POLÍTICAS PARA ai_memories (si existe)
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ai_memories') THEN
        -- Política: Usuarios solo ven sus propias memorias
        CREATE POLICY ai_memories_user_isolation ON ai_memories
            FOR ALL
            TO PUBLIC
            USING (
                current_setting('app.current_user_id', true) = ''
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
    RETURN current_setting('app.current_user_id', true) != '';
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
-- 1. Ejecutar: psql -d gremius -f apps/api/src/db/rls-policies.sql
-- 2. Verificar: SELECT * FROM pg_policies WHERE tablename = 'data_entries';
-- 3. Testing: SELECT set_config('app.current_user_id', 'user-123', true);
--              SELECT * FROM data_entries; -- Debe retornar solo registros del usuario
--
-- ============================================================================
