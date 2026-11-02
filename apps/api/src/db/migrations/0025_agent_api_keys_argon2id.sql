-- Migración: soporte para Argon2id en agent_api_keys
-- Añade key_id para lookup de keys con hashing lento (Argon2id)
-- y algoritmo para distinguir keys legacy SHA-256 de nuevas.

ALTER TABLE agent_api_keys
  ADD COLUMN IF NOT EXISTS key_id TEXT,
  ADD COLUMN IF NOT EXISTS algorithm TEXT NOT NULL DEFAULT 'sha256';

-- Index único para búsqueda rápida por key_id
CREATE UNIQUE INDEX IF NOT EXISTS agent_api_keys_key_id_idx
  ON agent_api_keys (key_id)
  WHERE key_id IS NOT NULL;

-- Backfill: para keys legacy sin key_id, mantener algorithm='sha256'
UPDATE agent_api_keys
SET algorithm = 'sha256'
WHERE key_id IS NULL;

-- Las nuevas keys usarán 'argon2id' y key_id no nulo
