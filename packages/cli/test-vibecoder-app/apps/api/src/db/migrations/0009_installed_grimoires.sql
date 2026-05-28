-- Migration: Add installed_grimoires table for plugin management
-- Created: 2026-03-17

-- Create enum for grimoire source
DO $$ BEGIN CREATE TYPE grimoire_source AS ENUM ('local', 'npm', 'github', 'marketplace', 'legacy'); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Create installed_grimoires table
CREATE TABLE installed_grimoires (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    grimoire_id VARCHAR(200) NOT NULL,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    version VARCHAR(50) NOT NULL,
    source grimoire_source NOT NULL DEFAULT 'local',
    source_url TEXT, -- npm package name, git url, etc.
    path TEXT NOT NULL, -- Filesystem path
    manifest JSONB, -- Full grimoire.json content
    config JSONB DEFAULT '{}', -- Plugin-specific config
    enabled BOOLEAN NOT NULL DEFAULT true,
    installed_by_id TEXT REFERENCES auth_users(id) ON DELETE SET NULL,
    installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ
);

-- Create indexes
CREATE UNIQUE INDEX installed_grimoire_id_idx ON installed_grimoires(grimoire_id);
CREATE INDEX installed_grimoire_source_idx ON installed_grimoires(source);
CREATE INDEX installed_grimoire_enabled_idx ON installed_grimoires(enabled);

-- Add trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_installed_grimoires_updated_at
    BEFORE UPDATE ON installed_grimoires
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add comment
COMMENT ON TABLE installed_grimoires IS 'Registry of installed grimoire plugins from npm/marketplace';
