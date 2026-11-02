-- 0030 — `formulas` → `dataset_kpis`
-- ============================================================================
-- Idempotente y NO destructiva: es un rename, los datos se conservan.
--
-- POR QUÉ
--
-- La tabla `formulas` del core nunca fueron fórmulas de juego: son KPIs sobre
-- datasets (`kpi_name`, `threshold` al 95%, `enabled`), y el DatasetCreator del
-- admin habla justo de eso — "create KPIs like totals, averages, or custom
-- formulas".
--
-- Con la llegada de `kon-formulas` —evaluador de fórmulas de juego para
-- builders, calculadoras y simuladores— el nombre pasó a designar dos cosas
-- distintas en el mismo proyecto. `dataset_kpis` dice lo que la tabla es y
-- deja `formulas` libre para su único significado.
--
-- OJO: la tabla está HUÉRFANA. Ningún código la lee ni la escribe (verificado
-- en todo `apps/api/src`); solo la declara el schema. Renombrarla la aclara,
-- pero si nunca se va a usar, lo honesto es borrarla — y eso es una decisión
-- de producto, no una de refactor, porque puede haber datos.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'formulas')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables
                     WHERE table_schema = 'public' AND table_name = 'dataset_kpis')
  THEN
    ALTER TABLE formulas RENAME TO dataset_kpis;
  END IF;
END $$;
