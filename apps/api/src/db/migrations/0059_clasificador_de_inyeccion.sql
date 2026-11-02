-- 0059 — Segunda opinión sobre una propuesta: ¿parece una inyección de instrucciones? (kitsuden2.md D5)
-- ============================================================================
-- Con INJECTION_CLASSIFIER_URL configurada, cada propuesta nueva se manda (por
-- la cola, en segundo plano) a un clasificador y el resultado se guarda aquí:
-- `{ "label", "score", "checkedAt" }`. El panel lo enseña a quien revisa.
--
-- Es una SEGUNDA capa, nunca la primera: no aprueba ni rechaza nada por sí
-- sola (un clasificador da falsos negativos). La decisión sigue siendo humana.

ALTER TABLE agent_proposals ADD COLUMN IF NOT EXISTS injection_check jsonb;
