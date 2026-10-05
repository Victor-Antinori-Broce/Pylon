-- Migration: Agent Memory System
-- Purpose: Create AgentMemory table for cognitive state persistence
-- Phase: 4 of Agent Refactoring (Memory & Context)
-- Created: 2026-03-19

-- ============================================================================
-- EXTENSIONES
-- ============================================================================
-- La tabla de abajo declara `embedding VECTOR(1536)`, pero `CREATE EXTENSION
-- vector` vivía en la 0022 — es decir, DESPUÉS de su primer uso. Sobre una
-- base creada desde cero la cadena moría aquí con `type "vector" does not
-- exist`, y no se detectó nunca porque nadie la ejecutaba entera.
--
-- Se crea aquí, en la primera migración que la necesita: una migración no
-- puede depender de otra posterior.
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================
-- AGENT MEMORY TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_memory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Relación con el agente propietario
    agent_id TEXT NOT NULL REFERENCES agent_identities(id) ON DELETE CASCADE,
    
    -- ============================================================================
    -- CLASIFICACIÓN DE MEMORIA
    -- ============================================================================
    
    -- Tipo de memoria: corto plazo (sesión) vs largo plazo (persistente)
    memory_type TEXT NOT NULL DEFAULT 'short_term',
    -- Valores válidos: 'short_term', 'long_term', 'episodic', 'semantic'
    
    -- Categoría/contexto de la memoria para organización
    category TEXT NOT NULL DEFAULT 'general',
    -- Ejemplos: 'conversation', 'task', 'insight', 'preference', 'context'
    
    -- ============================================================================
    -- CONTENIDO
    -- ============================================================================
    
    -- Clave identificadora de la memoria (para búsquedas)
    key TEXT,
    
    -- Contenido principal (payload JSON)
    content JSONB NOT NULL DEFAULT '{}',
    -- Estructura flexible: { text, metadata, embeddings, etc. }
    
    -- Resumen/versión corta para listados rápidos
    summary TEXT,
    
    -- ============================================================================
    -- METADATA COGNITIVA
    -- ============================================================================
    
    -- Importancia/prioridad (0-100, para garbage collection de memoria)
    importance INTEGER DEFAULT 50 CHECK (importance >= 0 AND importance <= 100),
    
    -- Confianza en la información (0-100)
    confidence INTEGER DEFAULT 80 CHECK (confidence >= 0 AND confidence <= 100),
    
    -- Fuente de la memoria
    source TEXT DEFAULT 'agent',
    -- Valores: 'agent', 'user', 'system', 'inference', 'external'
    
    -- IDs de memoria relacionadas (para grafos de conocimiento)
    related_memory_ids JSONB DEFAULT '[]',
    
    -- Tags para clasificación flexible
    tags JSONB DEFAULT '[]',
    
    -- ============================================================================
    -- VECTORES (para búsqueda semántica - requiere pgvector)
    -- ============================================================================
    
    -- Embedding vector para búsqueda por similitud (opcional)
    embedding VECTOR(1536),  -- Dimensiones para OpenAI embeddings (text-embedding-3-small)
    
    -- ============================================================================
    -- TEMPORALIDAD
    -- ============================================================================
    
    -- Contexto temporal de la memoria
    valid_from TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    valid_until TIMESTAMP WITH TIME ZONE,  -- NULL = no expira
    
    -- Tracking de uso (para LRU - Least Recently Used)
    access_count INTEGER DEFAULT 0,
    last_accessed_at TIMESTAMP WITH TIME ZONE,
    
    -- Timestamps de creación y actualización
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- ÍNDICES
-- ============================================================================

-- Búsqueda por agente + tipo (más común)
CREATE INDEX idx_agent_memory_agent_type 
ON agent_memory(agent_id, memory_type);

-- Búsqueda por categoría
CREATE INDEX idx_agent_memory_category 
ON agent_memory(category);

-- Búsqueda por clave (para recuperación específica)
CREATE INDEX idx_agent_memory_key 
ON agent_memory(agent_id, key) 
WHERE key IS NOT NULL;

-- Búsqueda temporal (memorias activas/válidas)
--
-- El predicado era `WHERE valid_until IS NULL OR valid_until > NOW()`, y
-- Postgres lo rechaza: `functions in index predicate must be marked IMMUTABLE`.
-- No es una pega formal — un índice parcial se evalúa AL INSERTAR, así que
-- `> NOW()` congelaría el instante de la escritura y el índice iría dejando
-- fuera filas que siguen vigentes, en silencio.
--
-- El índice cubre las dos columnas; el filtro temporal lo pone la consulta,
-- que es donde `NOW()` significa algo.
CREATE INDEX IF NOT EXISTS idx_agent_memory_valid
ON agent_memory(valid_from, valid_until);

-- Índice GIN para búsquedas en contenido JSONB
CREATE INDEX idx_agent_memory_content_gin 
ON agent_memory USING GIN (content jsonb_path_ops);

-- Índice GIN para tags
CREATE INDEX idx_agent_memory_tags_gin 
ON agent_memory USING GIN (tags);

-- Índice para ordenamiento por importancia (prioridad)
CREATE INDEX idx_agent_memory_importance 
ON agent_memory(agent_id, memory_type, importance DESC);

-- Índice para LRU (último acceso)
CREATE INDEX idx_agent_memory_last_accessed 
ON agent_memory(agent_id, last_accessed_at);

-- Índice HNSW para búsqueda vectorial (si pgvector está disponible)
-- Nota: Requiere extensión pgvector
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_extension WHERE extname = 'vector'
    ) THEN
        -- Crear índice HNSW para búsqueda por similitud eficiente
        CREATE INDEX IF NOT EXISTS idx_agent_memory_embedding_hnsw 
        ON agent_memory USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64);
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Could not create vector index - pgvector may not be available';
END $$;

-- ============================================================================
-- FUNCIONES DE UTILIDAD
-- ============================================================================

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_agent_memory_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para updated_at
CREATE TRIGGER trigger_agent_memory_updated
    BEFORE UPDATE ON agent_memory
    FOR EACH ROW
    EXECUTE FUNCTION update_agent_memory_timestamp();

-- Función para actualizar last_accessed_at y access_count
CREATE OR REPLACE FUNCTION touch_agent_memory(memory_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE agent_memory
    SET 
        access_count = access_count + 1,
        last_accessed_at = NOW()
    WHERE id = memory_id;
END;
$$ LANGUAGE plpgsql;

-- Función para garbage collection de memoria de corto plazo
CREATE OR REPLACE FUNCTION cleanup_short_term_memory(
    p_agent_id TEXT,
    max_age_hours INTEGER DEFAULT 24,
    min_importance INTEGER DEFAULT 10
)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM agent_memory
    WHERE 
        agent_id = p_agent_id
        AND memory_type = 'short_term'
        AND importance <= min_importance
        AND created_at < NOW() - INTERVAL '1 hour' * max_age_hours
        AND (valid_until IS NULL OR valid_until < NOW());
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- COMENTARIOS DE DOCUMENTACIÓN
-- ============================================================================

COMMENT ON TABLE agent_memory IS 
'Sistema de memoria cognitiva para agentes de IA. Almacena contexto a corto y largo plazo.';

COMMENT ON COLUMN agent_memory.memory_type IS 
'Tipo de memoria: short_term (sesión/contexto temporal), long_term (persistente), episodic (eventos), semantic (conocimiento)';

COMMENT ON COLUMN agent_memory.category IS 
'Categoría de la memoria: conversation, task, insight, preference, context, etc.';

COMMENT ON COLUMN agent_memory.content IS 
'Contenido principal en formato JSON. Estructura flexible según el tipo de memoria.';

COMMENT ON COLUMN agent_memory.importance IS 
'Puntuación de importancia (0-100). Usada para garbage collection y priorización.';

COMMENT ON COLUMN agent_memory.confidence IS 
'Confianza en la veracidad de la información (0-100). Para filtrado de información incierta.';

COMMENT ON COLUMN agent_memory.embedding IS 
'Vector de embedding para búsqueda semántica. Requiere extensión pgvector.';

COMMENT ON COLUMN agent_memory.valid_until IS 
'Fecha de expiración de la memoria. NULL significa que no expira.';

-- ============================================================================
-- VALIDACIÓN
-- ============================================================================

DO $$
BEGIN
    -- Verificar que la tabla fue creada
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'agent_memory'
    ) THEN
        RAISE EXCEPTION 'Table agent_memory was not created';
    END IF;

    -- Verificar columnas críticas
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'agent_memory' AND column_name = 'agent_id'
    ) THEN
        RAISE EXCEPTION 'Column agent_id was not added to agent_memory';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'agent_memory' AND column_name = 'memory_type'
    ) THEN
        RAISE EXCEPTION 'Column memory_type was not added to agent_memory';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'agent_memory' AND column_name = 'content'
    ) THEN
        RAISE EXCEPTION 'Column content was not added to agent_memory';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'agent_memory' AND column_name = 'embedding'
    ) THEN
        RAISE EXCEPTION 'Column embedding was not added to agent_memory';
    END IF;

    RAISE NOTICE 'AgentMemory table created successfully';
END $$;
