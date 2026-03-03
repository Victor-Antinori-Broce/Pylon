-- GremiusCMS Migration: Add blocks column to games and blog_posts
-- Implements the "Lego" Page Builder architecture
-- Run against gremius_db PostgreSQL instance

-- Add blocks JSONB column to blog_posts
ALTER TABLE blog_posts
  ADD COLUMN IF NOT EXISTS blocks jsonb DEFAULT '[]'::jsonb;

-- Add blocks JSONB column to games
ALTER TABLE games
  ADD COLUMN IF NOT EXISTS blocks jsonb DEFAULT '[]'::jsonb;

-- Create GIN indexes for efficient block-type queries
CREATE INDEX IF NOT EXISTS blog_posts_blocks_idx ON blog_posts USING GIN (blocks);
CREATE INDEX IF NOT EXISTS games_blocks_idx ON games USING GIN (blocks);

-- Example block structure stored in the column:
-- [
--   {
--     "id": "blk_abc123",
--     "type": "hero",
--     "data": { "title": "Welcome", "imageUrl": "https://...", "ctaLabel": "Play Now", "ctaUrl": "/games" },
--     "order": 0
--   },
--   {
--     "id": "blk_def456",
--     "type": "streamer-widget",
--     "data": { "channelName": "ninja", "platform": "twitch", "showChat": true },
--     "order": 1
--   }
-- ]
