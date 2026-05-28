-- Migration: Agent Identities Persona Enhancement
-- Purpose: Add cognitive fields for Agent Persona configuration
-- Phase: 1 & 2 of Agent Refactoring
-- Created: 2026-03-19

-- ============================================================================
-- ADD COGNITIVE FIELDS TO AGENT_IDENTITIES
-- ============================================================================

-- Type field: clasificación del tipo de agente
ALTER TABLE agent_identities 
ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'custom';

-- Capabilities: array de capacidades del agente (JSONB)
ALTER TABLE agent_identities 
ADD COLUMN IF NOT EXISTS capabilities JSONB DEFAULT '[]';

-- System Prompt: instrucciones base/personalidad del agente
ALTER TABLE agent_identities 
ADD COLUMN IF NOT EXISTS system_prompt TEXT;

-- Allowed Tools: herramientas permitidas para este agente (JSONB)
ALTER TABLE agent_identities 
ADD COLUMN IF NOT EXISTS allowed_tools JSONB DEFAULT '[]';

-- ============================================================================
-- INDEXES FOR NEW FIELDS
-- ============================================================================

-- Index for filtering by agent type
CREATE INDEX IF NOT EXISTS idx_agent_identities_type 
ON agent_identities(type);

-- GIN index for JSONB capabilities (supports @> operator)
CREATE INDEX IF NOT EXISTS idx_agent_identities_capabilities 
ON agent_identities USING GIN (capabilities);

-- GIN index for JSONB allowed_tools
CREATE INDEX IF NOT EXISTS idx_agent_identities_allowed_tools 
ON agent_identities USING GIN (allowed_tools);

-- Composite index for common query patterns
CREATE INDEX IF NOT EXISTS idx_agent_identities_type_active 
ON agent_identities(type, is_active) 
WHERE is_active = true;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON COLUMN agent_identities.type IS 
'Tipo de agente para clasificación: claude-desktop, scraper, worker, webhook, mcp-server, custom';

COMMENT ON COLUMN agent_identities.capabilities IS 
'Capacidades del agente: ["web-search", "code-generation", "data-analysis", "image-processing"]';

COMMENT ON COLUMN agent_identities.system_prompt IS 
'System prompt / instrucciones base que definen la personalidad y comportamiento del agente';

COMMENT ON COLUMN agent_identities.allowed_tools IS 
'Tools/herramientas que el agente puede invocar: ["read_dataset", "write_post", "send_webhook"]';

-- ============================================================================
-- UPDATE EXISTING AGENTS (Optional - Data Migration)
-- ============================================================================

-- Set type based on name patterns (optional, for existing data)
-- UPDATE agent_identities 
-- SET type = CASE 
--     WHEN name ILIKE '%claude%' THEN 'claude-desktop'
--     WHEN name ILIKE '%scraper%' THEN 'scraper'
--     WHEN name ILIKE '%worker%' THEN 'worker'
--     WHEN name ILIKE '%mcp%' THEN 'mcp-server'
--     ELSE 'custom'
-- END
-- WHERE type = 'custom';

-- ============================================================================
-- VALIDATION
-- ============================================================================

-- Verify columns were added
DO $$
BEGIN
    -- Check type column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'agent_identities' AND column_name = 'type'
    ) THEN
        RAISE EXCEPTION 'Column type was not added to agent_identities';
    END IF;

    -- Check capabilities column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'agent_identities' AND column_name = 'capabilities'
    ) THEN
        RAISE EXCEPTION 'Column capabilities was not added to agent_identities';
    END IF;

    -- Check system_prompt column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'agent_identities' AND column_name = 'system_prompt'
    ) THEN
        RAISE EXCEPTION 'Column system_prompt was not added to agent_identities';
    END IF;

    -- Check allowed_tools column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'agent_identities' AND column_name = 'allowed_tools'
    ) THEN
        RAISE EXCEPTION 'Column allowed_tools was not added to agent_identities';
    END IF;

    RAISE NOTICE 'All persona fields successfully added to agent_identities';
END $$;
