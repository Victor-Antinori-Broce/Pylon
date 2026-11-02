-- 0050 — Imágenes retenidas en una propuesta (fase F, decisión del propietario, 2026-10-26)
-- ============================================================================
-- Idempotente: IF NOT EXISTS en todo.
--
-- Un agente que necesita aprobación ya puede SUBIR IMÁGENES (multipart): la
-- subida se guarda como propuesta y sus ficheros esperan aquí, NO en el almacén
-- público de `/media`, hasta que un humano decide.
--
-- ¿Por qué una tabla y no un prefijo privado del almacén? Porque el almacén del
-- núcleo es PÚBLICO por diseño: en disco local `/media/*` sirve todo lo que hay
-- bajo la raíz, y en S3 el bucket suele estar detrás de `S3_PUBLIC_URL`. Un
-- prefijo «privado» dependería de que nadie configure el bucket como público.
-- Aquí los bytes solo salen por `GET /api/approvals/proposals/:id/files/:fileId`
-- (personal humano), se guardan en la misma transacción que la propuesta y se
-- borran en cuanto se rechaza, caduca o se ejecuta (y en cascada si se borra).
--
-- Solo imágenes verificadas por su firma (JPEG, PNG, GIF, WebP, AVIF; ver
-- packages/core/media/tipo-real.ts) y con el tamaño máximo de la mediateca
-- (`APPROVALS_MAX_UPLOAD_MB`, 10 por defecto): lo comprueba la API antes de
-- insertar. Sin RLS, como agent_proposals (0048): solo la toca la API.

CREATE TABLE IF NOT EXISTS agent_proposal_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES agent_proposals(id) ON DELETE CASCADE,
  -- Orden dentro del formulario (para reconstruirlo igual al ejecutar).
  position integer NOT NULL,
  field text NOT NULL,
  filename text NOT NULL,
  mime_type text NOT NULL,
  size integer NOT NULL,
  sha256 text NOT NULL,
  content bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_proposal_files_proposal_idx ON agent_proposal_files (proposal_id, position);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kitsuden_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON agent_proposal_files TO kitsuden_app;
  END IF;
END $$;
