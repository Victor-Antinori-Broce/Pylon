-- GremiusCMS - Database Initialization
-- This runs automatically on first PostgreSQL start

-- Enable useful extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";    -- Fuzzy text search
CREATE EXTENSION IF NOT EXISTS "btree_gin";  -- Better indexing

-- Grant permissions
GRANT ALL PRIVILEGES ON DATABASE gremiuscms TO gremius;
