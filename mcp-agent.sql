-- Insertar DevBot en agent_identities
INSERT INTO agent_identities (
  id, name, description, type, capabilities, system_prompt, 
  allowed_tools, scopes, rate_limit, created_at, updated_at
) VALUES (
  'agent_6ec4cd84e65f800f',
  'DevBot',
  'Agente de desarrollo para pruebas MCP con Claude Desktop',
  'claude-desktop',
  '["mcp-connect", "tool-execution", "context-management"]',
  'Eres DevBot, un agente de desarrollo conectado a Gremius CMS.',
  '["read_dataset", "write_intake", "search_memories"]',
  '["read:issues", "write:intake"]',
  120,
  NOW(),
  NOW()
) ON CONFLICT (id) DO UPDATE SET 
  scopes = '["read:issues", "write:intake"]',
  updated_at = NOW();

-- Insertar API Key en agent_api_keys
INSERT INTO agent_api_keys (
  id, agent_id, key_hash, key_prefix, created_at, expires_at
) VALUES (
  gen_random_uuid(),
  'agent_6ec4cd84e65f800f',
  '0976d057a81fab7ecbc29983f635b66051e878bb47631ac72d11069173ab24e6',
  'grm_agent_claude-desktop_****nDsAdLxw',
  NOW(),
  NULL
);
