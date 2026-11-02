-- Migration for kon-example
-- Creates the example_items table

CREATE TABLE IF NOT EXISTS example_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(200) NOT NULL,
    description TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS example_items_status_idx ON example_items(status);
CREATE INDEX IF NOT EXISTS example_items_created_at_idx ON example_items(created_at DESC);
