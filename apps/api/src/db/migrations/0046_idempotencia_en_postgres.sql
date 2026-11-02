-- 0046 — Tabla de reserva de la idempotencia (2026-10-23)
-- ============================================================================
-- Idempotente: IF NOT EXISTS en todo.
--
-- El middleware de `Idempotency-Key` (lib/idempotencia.ts) guarda sus
-- registros en Valkey y, si Valkey no está, en esta tabla. El código sabe
-- crearla él mismo al primer uso (`DDL_IDEMPOTENCIA`), pero en producción la
-- API se conecta como `kitsuden_app`, que NO tiene CREATE sobre el esquema
-- —y no debe—: sin esta migración, el primer reintento con Valkey caído
-- acababa en «permission denied for schema public».
--
-- Mismo DDL que `DDL_IDEMPOTENCIA`; si uno cambia, cambia el otro.
--
-- Sin RLS a propósito: la clave ya incluye al actor (hash de actor + ruta +
-- cuerpo) y la tabla solo la toca el middleware, por su propia conexión.

CREATE TABLE IF NOT EXISTS kitsuden_idempotencia (
  clave text PRIMARY KEY,
  registro jsonb NOT NULL,
  expira_en timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS kitsuden_idempotencia_expira_idx
  ON kitsuden_idempotencia (expira_en);

-- Permisos del rol de aplicación. `start-with-check.sh` concede lo mismo a
-- todas las tablas en cada arranque; esto cubre el caso de migrar con el
-- runner a mano sin pasar por ese script.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kitsuden_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON kitsuden_idempotencia TO kitsuden_app;
  END IF;
END $$;
