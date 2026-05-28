-- Migration: Rename esports tables to use esports_ prefix
-- Prevents collision with other grimoires (e.g. CRM, sports, etc.)
-- Run: cd apps/api && bun run db:migrate

-- Rename tables
ALTER TABLE IF EXISTS players RENAME TO esports_players;
ALTER TABLE IF EXISTS teams RENAME TO esports_teams;
ALTER TABLE IF EXISTS players_to_teams RENAME TO esports_players_to_teams;
ALTER TABLE IF EXISTS tournaments RENAME TO esports_tournaments;
ALTER TABLE IF EXISTS tournament_participants RENAME TO esports_tournament_participants;
ALTER TABLE IF EXISTS matches RENAME TO esports_matches;

-- Rename enums
ALTER TYPE IF EXISTS tournament_format RENAME TO esports_tournament_format;
ALTER TYPE IF EXISTS tournament_status RENAME TO esports_tournament_status;
ALTER TYPE IF EXISTS participant_status RENAME TO esports_participant_status;
ALTER TYPE IF EXISTS match_status RENAME TO esports_match_status;
