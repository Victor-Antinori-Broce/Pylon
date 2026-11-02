-- 0056 — La cola de trabajos vive en Postgres (transactional outbox, 2026-10-28)
-- ============================================================================
-- Sustituye a BullMQ (kitsuden2.md, B1). Idempotente: IF NOT EXISTS y
-- CREATE OR REPLACE en todo.
--
-- 1. kitsuden_outbox: un trabajo por fila. `queue.dispatch()` la INSERTA
--    dentro de la transacción de la petición: si la petición acaba en
--    ROLLBACK el trabajo no existe; si confirma, queda listo para el worker.
-- 2. Estados: pending → running → done | dead.
--      · running lleva `locked_until` (un arriendo). Si el worker se cae a
--        mitad, `kitsuden_cola_barrer()` lo devuelve a pending (o a dead si
--        ya gastó sus intentos). `SKIP LOCKED` solo protege mientras dura la
--        transacción del reclamo; el arriendo cubre el resto.
--      · dead es la «dead letter»: se queda con su último error para que el
--        panel la enseñe y alguien la reintente (`kitsuden_cola_reintentar`).
--      · done se borra a los N días (retención del barrido).
-- 3. Sin RLS a propósito, y con permisos propios: el rol de la aplicación
--    solo INSERTA. Leer, reclamar y cerrar trabajos va por funciones
--    SECURITY DEFINER con un contrato estrecho (no hay SELECT libre sobre los
--    payloads, que llevan direcciones de correo). Nadie necesita BYPASSRLS.
-- 4. El actor (user_id / agent_id) se guarda, pero el worker RELEE sus
--    permisos al ejecutar: un trabajo encolado ayer no corre con permisos
--    revocados hoy.
-- 5. Entrega «al menos una vez»: los handlers deben ser idempotentes.

CREATE TABLE IF NOT EXISTS kitsuden_outbox (
  id uuid PRIMARY KEY,
  queue text NOT NULL,
  name text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  user_id text,
  user_role text,
  agent_id text,
  request_id text,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  run_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  locked_by text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

-- Lo que el worker busca en cada vuelta: pendientes de una cola, por turno.
CREATE INDEX IF NOT EXISTS kitsuden_outbox_pendientes_idx
  ON kitsuden_outbox (queue, run_at) WHERE status = 'pending';
-- Lo que mira el barrido: arriendos vencidos.
CREATE INDEX IF NOT EXISTS kitsuden_outbox_en_curso_idx
  ON kitsuden_outbox (locked_until) WHERE status = 'running';
-- Retención y panel.
CREATE INDEX IF NOT EXISTS kitsuden_outbox_estado_idx
  ON kitsuden_outbox (status, finished_at);

-- ── Reclamar: hasta `p_cuantos` trabajos listos de esas colas ──────────────
CREATE OR REPLACE FUNCTION kitsuden_cola_reclamar(
  p_colas text[], p_cuantos integer, p_arriendo_s integer, p_worker text
) RETURNS SETOF kitsuden_outbox
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  RETURN QUERY
  WITH elegidos AS (
    SELECT o.id FROM kitsuden_outbox o
    WHERE o.status = 'pending' AND o.queue = ANY (p_colas) AND o.run_at <= now()
    ORDER BY o.run_at
    LIMIT GREATEST(p_cuantos, 0)
    FOR UPDATE SKIP LOCKED
  )
  UPDATE kitsuden_outbox o
     SET status = 'running',
         attempts = o.attempts + 1,
         locked_until = now() + make_interval(secs => GREATEST(p_arriendo_s, 1)),
         locked_by = p_worker
    FROM elegidos
   WHERE o.id = elegidos.id
  RETURNING o.*;
END;
$$;

-- ── Completar: solo quien lo tiene reclamado ───────────────────────────────
CREATE OR REPLACE FUNCTION kitsuden_cola_completar(p_id uuid, p_worker text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  UPDATE kitsuden_outbox
     SET status = 'done', finished_at = now(), locked_until = NULL, last_error = NULL
   WHERE id = p_id AND status = 'running' AND locked_by = p_worker;
  RETURN FOUND;
END;
$$;

-- ── Fallar: reintento con espera, o dead si se acabaron los intentos ───────
CREATE OR REPLACE FUNCTION kitsuden_cola_fallar(
  p_id uuid, p_worker text, p_error text, p_reintentar_en_s integer, p_definitivo boolean
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_estado text;
BEGIN
  UPDATE kitsuden_outbox
     SET status = CASE WHEN p_definitivo OR attempts >= max_attempts THEN 'dead' ELSE 'pending' END,
         run_at = now() + make_interval(secs => GREATEST(p_reintentar_en_s, 0)),
         finished_at = CASE WHEN p_definitivo OR attempts >= max_attempts THEN now() ELSE NULL END,
         locked_until = NULL,
         last_error = left(p_error, 2000)
   WHERE id = p_id AND status = 'running' AND locked_by = p_worker
  RETURNING status INTO v_estado;
  RETURN v_estado;
END;
$$;

-- ── Barrer: arriendos vencidos y retención de los terminados ───────────────
-- Devuelve cuántos trabajos huérfanos recuperó (pending) o enterró (dead).
CREATE OR REPLACE FUNCTION kitsuden_cola_barrer(p_retencion_dias integer)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_huerfanos integer;
BEGIN
  WITH vencidos AS (
    SELECT id FROM kitsuden_outbox
     WHERE status = 'running' AND locked_until < now()
     FOR UPDATE SKIP LOCKED
  )
  UPDATE kitsuden_outbox o
     SET status = CASE WHEN o.attempts >= o.max_attempts THEN 'dead' ELSE 'pending' END,
         finished_at = CASE WHEN o.attempts >= o.max_attempts THEN now() ELSE NULL END,
         run_at = now(),
         locked_until = NULL,
         last_error = 'lease_expired: el worker no cerró el trabajo a tiempo'
    FROM vencidos
   WHERE o.id = vencidos.id;
  GET DIAGNOSTICS v_huerfanos = ROW_COUNT;

  DELETE FROM kitsuden_outbox
   WHERE status = 'done' AND finished_at < now() - make_interval(days => GREATEST(p_retencion_dias, 0));

  RETURN v_huerfanos;
END;
$$;

-- ── Panel: recuento por cola y estado ─────────────────────────────────────
CREATE OR REPLACE FUNCTION kitsuden_cola_estado()
RETURNS TABLE (queue text, status text, total bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  RETURN QUERY
  SELECT o.queue, o.status, count(*) FROM kitsuden_outbox o GROUP BY o.queue, o.status;
END;
$$;

-- ── Panel: la «dead letter», sin payload (puede llevar datos personales) ───
CREATE OR REPLACE FUNCTION kitsuden_cola_muertos(p_limite integer)
RETURNS TABLE (
  id uuid, queue text, name text, attempts integer, max_attempts integer,
  last_error text, user_id text, agent_id text, created_at timestamptz, finished_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  RETURN QUERY
  SELECT o.id, o.queue, o.name, o.attempts, o.max_attempts, o.last_error,
         o.user_id, o.agent_id, o.created_at, o.finished_at
    FROM kitsuden_outbox o
   WHERE o.status = 'dead'
   ORDER BY o.finished_at DESC NULLS LAST
   LIMIT LEAST(GREATEST(p_limite, 1), 500);
END;
$$;

-- ── Panel: reintentar un trabajo muerto (intentos a cero) ─────────────────
CREATE OR REPLACE FUNCTION kitsuden_cola_reintentar(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  UPDATE kitsuden_outbox
     SET status = 'pending', attempts = 0, run_at = now(), finished_at = NULL, last_error = NULL
   WHERE id = p_id AND status = 'dead';
  RETURN FOUND;
END;
$$;

-- ── Panel: descartar un trabajo muerto ────────────────────────────────────
CREATE OR REPLACE FUNCTION kitsuden_cola_descartar(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  DELETE FROM kitsuden_outbox WHERE id = p_id AND status = 'dead';
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION kitsuden_cola_reclamar(text[], integer, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION kitsuden_cola_completar(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION kitsuden_cola_fallar(uuid, text, text, integer, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION kitsuden_cola_barrer(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION kitsuden_cola_estado() FROM PUBLIC;
REVOKE ALL ON FUNCTION kitsuden_cola_muertos(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION kitsuden_cola_reintentar(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION kitsuden_cola_descartar(uuid) FROM PUBLIC;

-- Permisos del rol de aplicación: INSERT sobre la tabla y nada más; el resto,
-- por las funciones. (Mismo patrón que 0046/0047/0048.)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kitsuden_app') THEN
    REVOKE ALL ON kitsuden_outbox FROM kitsuden_app;
    GRANT INSERT ON kitsuden_outbox TO kitsuden_app;
    GRANT EXECUTE ON FUNCTION kitsuden_cola_reclamar(text[], integer, integer, text) TO kitsuden_app;
    GRANT EXECUTE ON FUNCTION kitsuden_cola_completar(uuid, text) TO kitsuden_app;
    GRANT EXECUTE ON FUNCTION kitsuden_cola_fallar(uuid, text, text, integer, boolean) TO kitsuden_app;
    GRANT EXECUTE ON FUNCTION kitsuden_cola_barrer(integer) TO kitsuden_app;
    GRANT EXECUTE ON FUNCTION kitsuden_cola_estado() TO kitsuden_app;
    GRANT EXECUTE ON FUNCTION kitsuden_cola_muertos(integer) TO kitsuden_app;
    GRANT EXECUTE ON FUNCTION kitsuden_cola_reintentar(uuid) TO kitsuden_app;
    GRANT EXECUTE ON FUNCTION kitsuden_cola_descartar(uuid) TO kitsuden_app;
  END IF;
END $$;
