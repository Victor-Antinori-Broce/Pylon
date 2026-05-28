-- Migration: Rename games enums to use games_ prefix
-- Prevents collision with other grimoires (e.g. blog content_status)
-- Run: cd apps/api && bun run db:migrate

-- Rename enums
ALTER TYPE IF EXISTS content_status RENAME TO games_content_status;
ALTER TYPE IF EXISTS tag_category RENAME TO games_tag_category;
