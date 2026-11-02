-- Funciones de AGENTE para la RLS de los kons (núcleo, arreglos de la fase D, 2026-10-25)
-- ============================================================================
-- Idempotente (CREATE OR REPLACE). Lo aplican ANTES de las migraciones de
-- cualquier kon: scripts/migrate.ts y lib/migraciones-kon.ts (activar un kon
-- desde el panel, o al arrancar). Así una migración de kon puede usarlas.
--
-- Un agente llega a Postgres con app.current_user_role = 'agent' y sus scopes
-- en app.agent_scopes (separados por comas, local a la transacción:
-- packages/engine/src/rls-peticion.ts). Las políticas de los kons preguntaban
-- por el ROL humano, y un agente con `admin` veía las listas vacías (dms,
-- members, booking). Estas funciones son la MISMA regla que el motor
-- (packages/engine/src/actor-efectivo.ts y @kitsuden/shared
-- permisos-de-agente.ts); un test compara las dos con la misma tabla:
--
--   kitsuden_agente_abre_kon('crm')     agente con admin, crm:* o kon:crm:*
--                                       (literales; kon:* NO) y sin denegación
--                                       que cubra crm:* o kon:crm:*
--   kitsuden_admin_efectivo('crm')      rol humano admin, o lo anterior
--   kitsuden_staff_efectivo('crm')      rol humano admin/editor, o lo anterior
--   kitsuden_agente_puede('conta:ver')  agente al que sus scopes conceden eso
--                                       (comodines; una denegación gana)
--   kitsuden_agente_puede_en_kon('members', 'member:view')
--                                       lo anterior DENTRO de un kon: además lo
--                                       abre el kon entero y lo cierra
--                                       `!members:*` (aunque no empiece igual)
--
-- kitsuden_patron_cubre, kitsuden_agente_concede y kitsuden_agente_denegado
-- son COPIA LITERAL de las de rls-policies.sql (que se aplica DESPUÉS de las
-- migraciones): un test exige que digan lo mismo.

CREATE OR REPLACE FUNCTION kitsuden_patron_cubre(patron text, requerido text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $FN$
DECLARE
  p text[];
  r text[];
  n int;
  i int;
BEGIN
  IF patron IS NULL OR requerido IS NULL OR patron = '' OR requerido = '' THEN RETURN false; END IF;
  IF patron = requerido THEN RETURN true; END IF;
  p := string_to_array(patron, ':');
  n := array_length(p, 1);
  IF n < 2 THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM unnest(p) AS x WHERE x <> '*') THEN RETURN false; END IF;
  IF p[1] = '*' THEN
    RETURN length(requerido) >= length(patron) - 1
       AND right(requerido, length(patron) - 1) = substr(patron, 2);
  END IF;
  r := string_to_array(requerido, ':');
  IF p[n] = '*' THEN
    IF array_length(r, 1) <= n - 1 THEN RETURN false; END IF;
    n := n - 1;
  ELSIF array_length(r, 1) <> n THEN
    RETURN false;
  END IF;
  FOR i IN 1..n LOOP
    IF p[i] = '*' THEN
      IF coalesce(r[i], '') = '' THEN RETURN false; END IF;
    ELSIF p[i] IS DISTINCT FROM r[i] THEN
      RETURN false;
    END IF;
  END LOOP;
  RETURN true;
END
$FN$;

CREATE OR REPLACE FUNCTION kitsuden_agente_concede(p_requerido text)
RETURNS boolean LANGUAGE plpgsql STABLE AS $FN$
DECLARE
  crudo text := coalesce(current_setting('app.agent_scopes', true), '');
  scopes text[];
  s text;
BEGIN
  IF crudo = '' OR p_requerido IS NULL THEN RETURN false; END IF;
  scopes := string_to_array(crudo, ',');
  FOREACH s IN ARRAY scopes LOOP
    IF left(s, 1) = '!' AND kitsuden_patron_cubre(substr(s, 2), p_requerido) THEN RETURN false; END IF;
  END LOOP;
  FOREACH s IN ARRAY scopes LOOP
    IF left(s, 1) <> '!' AND (s = 'admin' OR s = 'admin:*' OR kitsuden_patron_cubre(s, p_requerido)) THEN
      RETURN true;
    END IF;
  END LOOP;
  RETURN false;
END
$FN$;

CREATE OR REPLACE FUNCTION kitsuden_agente_denegado(p_requerido text)
RETURNS boolean LANGUAGE plpgsql STABLE AS $FN$
DECLARE
  crudo text := coalesce(current_setting('app.agent_scopes', true), '');
  s text;
BEGIN
  IF crudo = '' THEN RETURN false; END IF;
  FOREACH s IN ARRAY string_to_array(crudo, ',') LOOP
    IF left(s, 1) = '!' AND kitsuden_patron_cubre(substr(s, 2), p_requerido) THEN RETURN true; END IF;
  END LOOP;
  RETURN false;
END
$FN$;

CREATE OR REPLACE FUNCTION kitsuden_agente_abre_kon(p_kon text)
RETURNS boolean LANGUAGE plpgsql STABLE AS $FN$
DECLARE
  crudo text := coalesce(current_setting('app.agent_scopes', true), '');
  amplios text[];
  s text;
BEGIN
  IF crudo = '' OR coalesce(p_kon, '') = '' THEN RETURN false; END IF;
  IF coalesce(current_setting('app.current_user_role', true), '') <> 'agent' THEN RETURN false; END IF;
  amplios := ARRAY[p_kon || ':*', 'kon:' || p_kon || ':*'];
  FOREACH s IN ARRAY string_to_array(crudo, ',') LOOP
    IF left(s, 1) = '!' AND (kitsuden_patron_cubre(substr(s, 2), amplios[1])
                             OR kitsuden_patron_cubre(substr(s, 2), amplios[2])) THEN
      RETURN false;
    END IF;
  END LOOP;
  FOREACH s IN ARRAY string_to_array(crudo, ',') LOOP
    IF s = 'admin' OR s = 'admin:*' OR s = ANY (amplios) THEN RETURN true; END IF;
  END LOOP;
  RETURN false;
END
$FN$;

CREATE OR REPLACE FUNCTION kitsuden_admin_efectivo(p_kon text)
RETURNS boolean LANGUAGE sql STABLE AS $FN$
  SELECT coalesce(current_setting('app.current_user_role', true), '') = 'admin'
      OR kitsuden_agente_abre_kon(p_kon)
$FN$;

CREATE OR REPLACE FUNCTION kitsuden_staff_efectivo(p_kon text)
RETURNS boolean LANGUAGE sql STABLE AS $FN$
  SELECT coalesce(current_setting('app.current_user_role', true), '') IN ('admin', 'editor')
      OR kitsuden_agente_abre_kon(p_kon)
$FN$;

CREATE OR REPLACE FUNCTION kitsuden_agente_puede(p_requerido text)
RETURNS boolean LANGUAGE sql STABLE AS $FN$
  SELECT coalesce(current_setting('app.current_user_role', true), '') = 'agent'
     AND kitsuden_agente_concede(p_requerido)
$FN$;

-- Un permiso suelto DENTRO de un kon: el agente puede `p_requerido`
-- (`member:view`, `booking:listAll`…) o abre el kon entero, y ninguna
-- denegación cierra ni la acción ni el kon entero (`!members:*` cierra también
-- `member:view`, que no empieza por `members:`).
CREATE OR REPLACE FUNCTION kitsuden_agente_puede_en_kon(p_kon text, p_requerido text)
RETURNS boolean LANGUAGE sql STABLE AS $FN$
  SELECT coalesce(current_setting('app.current_user_role', true), '') = 'agent'
     AND NOT kitsuden_agente_denegado(p_kon || ':*')
     AND NOT kitsuden_agente_denegado('kon:' || p_kon || ':*')
     AND NOT kitsuden_agente_denegado(p_requerido)
     AND (kitsuden_agente_abre_kon(p_kon) OR kitsuden_agente_concede(p_requerido))
$FN$;
