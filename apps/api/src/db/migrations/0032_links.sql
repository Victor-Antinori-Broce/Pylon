-- 0032 — Enlaces polimórficos entre entidades de cualquier kon
-- ============================================================================
--
-- POR QUÉ
--
-- Hasta ahora todas las relaciones eran claves foráneas DENTRO de un kon. Un
-- `crm_contacts.id`, un `players.id`, un `members.id` y un lector de `dms` son
-- cuatro filas sin forma de decir "son la misma persona".
--
-- Esta tabla es la arista que faltaba: cualquier kon puede relacionar lo suyo
-- con lo de otro SIN depender de él. Un pedido de la tienda se enlaza a un
-- contacto del CRM si el CRM está instalado, y funciona igual si no lo está.
--
-- QUÉ NO ES
--
-- No es un modelo de grafo que sustituya a las tablas. Las tablas siguen
-- tipadas, con sus claves foráneas y su RLS por columna — que es justo lo que
-- Kitsuden tiene y un modelo genérico no. El grafo se añade ENCIMA.
--
-- ── LOS DOS COSTES, Y CÓMO SE PAGAN ────────────────────────────────────────
--
-- 1. SIN CLAVES FORÁNEAS. No se puede apuntar con FK a un destino polimórfico:
--    Postgres no sabe a qué tabla mira `to_type`. Borrar un contacto deja sus
--    enlaces colgando.
--
--    Estrategia elegida: HUÉRFANOS TOLERADOS Y FILTRADOS AL LEER. Resolver un
--    enlace pasa por la tabla destino; si la fila no está, el enlace no
--    devuelve nada y se puede limpiar en diferido.
--
--    Se descartó poner triggers de borrado en cada tabla: obligaría a los ~60
--    tablas del sistema a saber que existen los enlaces, que es exactamente el
--    acoplamiento que esta tabla viene a evitar. Una arista huérfana es basura;
--    un trigger olvidado en una tabla nueva es una fuga silenciosa.
--
-- 2. RLS NO PUEDE SEGUIR LA ARISTA. Una política aquí no sabe cómo comprobar si
--    puedes ver `to_id` de un `to_type` arbitrario — tendría que consultar una
--    tabla cuyo nombre solo se conoce en tiempo de ejecución.
--
--    Estrategia elegida, en dos capas:
--      · La tabla aísla por `owner_id`, igual que el resto (misma política,
--        mismo fallo-abierto con contexto vacío para migraciones y workers).
--      · Y resolver el destino pasa SIEMPRE por el RLS normal de su tabla. Así
--        ves que hay una arista, pero seguirla no te da nada que no pudieras
--        ver ya.
--
--    El residuo consciente: quien ve una arista aprende que EXISTE una fila de
--    ese tipo relacionada, aunque no pueda leerla. Se acepta porque el lado
--    FROM ya es suyo — no se descubre nada sobre entidades ajenas.

CREATE TABLE IF NOT EXISTS kitsuden_links (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- TEXT y no UUID a propósito: no todas las entidades del sistema usan UUID
  -- (las identidades de agente son texto). TEXT acepta ambos sin castear.
  from_type   TEXT NOT NULL,
  from_id     TEXT NOT NULL,
  to_type     TEXT NOT NULL,
  to_id       TEXT NOT NULL,

  -- Qué significa la arista. `related` sirve para "esto tiene que ver con
  -- esto"; nombres propios (`same_person`, `ordered_by`, `attends`) cuando el
  -- significado importa para leerlo después.
  relation    TEXT NOT NULL DEFAULT 'related',

  metadata    JSONB NOT NULL DEFAULT '{}',

  -- Para la política de aislamiento. Nullable: los enlaces creados por el
  -- sistema (importaciones, webhooks) no tienen dueño.
  owner_id    TEXT,
  created_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Una fila enlazada consigo misma no significa nada y ensucia toda consulta
  -- de vecinos.
  CONSTRAINT kitsuden_links_no_self CHECK (NOT (from_type = to_type AND from_id = to_id))
);

-- La misma arista dos veces no aporta nada y duplica resultados al leer.
CREATE UNIQUE INDEX IF NOT EXISTS kitsuden_links_unique
  ON kitsuden_links (from_type, from_id, to_type, to_id, relation);

-- Los dos sentidos se indexan porque la lectura consulta AMBOS: una relación
-- como `same_person` no tiene dirección, y obligar a los kons a adivinar en qué
-- sentido se guardó sería una fuente inagotable de resultados vacíos.
CREATE INDEX IF NOT EXISTS kitsuden_links_from_idx ON kitsuden_links (from_type, from_id);
CREATE INDEX IF NOT EXISTS kitsuden_links_to_idx   ON kitsuden_links (to_type, to_id);

-- Buscar "todos los pedidos de este contacto" filtra también por relación.
CREATE INDEX IF NOT EXISTS kitsuden_links_relation_idx ON kitsuden_links (relation);

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Nace protegida: es una tabla nueva, así que no hay bases heredadas que
-- romper. FORCE es obligatorio — sin él el rol dueño (el de la app) queda
-- exento y la política es decorativa.

ALTER TABLE kitsuden_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE kitsuden_links FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kitsuden_links_owner_isolation ON kitsuden_links;
CREATE POLICY kitsuden_links_owner_isolation ON kitsuden_links
  FOR ALL
  TO PUBLIC
  USING (
    -- Contexto vacío = proceso del sistema (migraciones, seeds, workers).
    -- Mismo criterio que el resto de políticas del proyecto.
    COALESCE(current_setting('app.current_user_id', true), '') = ''
    OR owner_id IS NULL
    OR owner_id = current_setting('app.current_user_id', true)
  )
  WITH CHECK (
    COALESCE(current_setting('app.current_user_id', true), '') = ''
    OR owner_id IS NULL
    OR owner_id = current_setting('app.current_user_id', true)
  );
