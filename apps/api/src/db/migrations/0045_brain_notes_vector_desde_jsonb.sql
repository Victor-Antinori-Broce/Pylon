-- ============================================================================
-- 0045 — brain_notes: sincronizar embedding_vector sin castear jsonb a vector
-- ============================================================================
--
-- El trigger de 0024 hacía `NEW.embedding::VECTOR(384)`. En Postgres NO hay
-- cast de jsonb a vector, así que con pgvector instalado (y la columna
-- `embedding_vector` creada) TODO INSERT en brain_notes fallaba con
-- «cannot cast type jsonb to vector». Sin pgvector el trigger no llegaba a
-- esa línea y nadie lo veía.
--
-- Arreglo: pasar por texto (`'[0.1, 0.2]'` es justo el literal que acepta
-- vector) y solo cuando el array tiene 384 números; el valor por defecto
-- `'[]'` o un embedding de otra dimensión dejan la columna a NULL en vez de
-- tumbar la escritura. El JSONB sigue siendo la fuente de verdad.
--
-- Sin pgvector la función no toca nada (ni compila referencias a VECTOR en
-- tiempo de creación: PL/pgSQL resuelve el tipo al ejecutar, y esa rama no se
-- ejecuta). Idempotente: CREATE OR REPLACE de la función; el trigger de 0024
-- ya apunta a ella por nombre, y se recrea por si faltara.

CREATE OR REPLACE FUNCTION sync_brain_notes_embedding_vector()
RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector')
       AND EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_name = 'brain_notes' AND column_name = 'embedding_vector'
       ) THEN
        IF NEW.embedding IS NOT NULL
           AND jsonb_typeof(NEW.embedding) = 'array'
           AND jsonb_array_length(NEW.embedding) = 384 THEN
            NEW.embedding_vector := (NEW.embedding::text)::VECTOR(384);
        ELSE
            NEW.embedding_vector := NULL;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_brain_notes_embedding_vector ON brain_notes;
CREATE TRIGGER trigger_brain_notes_embedding_vector
    BEFORE INSERT OR UPDATE ON brain_notes
    FOR EACH ROW
    EXECUTE FUNCTION sync_brain_notes_embedding_vector();
