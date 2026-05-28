-- ═══════════════════════════════════════════════════════════════════════════════
-- MIGRATION: Academy LMS - Índices Únicos
-- ═══════════════════════════════════════════════════════════════════════════════
-- Estos índices se crean fuera de Drizzle ORM debido a limitaciones de sintaxis

-- ============================================
-- GRUPOS Y ASIGNACIONES
-- ============================================

-- Un usuario solo puede estar una vez en un grupo
CREATE UNIQUE INDEX IF NOT EXISTS gu_pk ON grupo_usuarios (grupo_id, user_id);

-- Un supervisor solo puede estar una vez en un grupo
CREATE UNIQUE INDEX IF NOT EXISTS gs_pk ON grupo_supervisores (grupo_id, supervisor_id);

-- ============================================
-- TRACKING DE PROGRESO
-- ============================================

-- Un usuario solo puede tener un progreso por curso
CREATE UNIQUE INDEX IF NOT EXISTS pr_usr_cur ON progreso_cursos (user_id, curso_id);

-- Un módulo solo puede estar una vez en el progreso de un curso
CREATE UNIQUE INDEX IF NOT EXISTS pm_pk ON progreso_modulos (progreso_curso_id, modulo_id);

-- Un usuario solo puede tener un progreso por tema
CREATE UNIQUE INDEX IF NOT EXISTS pr_usr_tem_prog ON progreso_temas (user_id, tema_id);

-- ============================================
-- LEARNING PATHS
-- ============================================

-- Un curso solo puede aparecer una vez en un learning path
CREATE UNIQUE INDEX IF NOT EXISTS lp_cur ON learning_path_cursos (learning_path_id, curso_id);

-- Un usuario solo puede tener un progreso por learning path
CREATE UNIQUE INDEX IF NOT EXISTS lp_usr ON progreso_learning_paths (user_id, learning_path_id);

-- ============================================
-- FEEDBACK
-- ============================================

-- Un usuario solo puede dar un feedback por tema
CREATE UNIQUE INDEX IF NOT EXISTS fb_usr_tem ON feedback (user_id, tema_id);

-- ============================================
-- ÍNDICES ADICIONALES DE PERFORMANCE
-- ============================================

-- Índices para búsquedas comunes
CREATE INDEX IF NOT EXISTS pr_curso_id ON progreso_cursos (curso_id);
CREATE INDEX IF NOT EXISTS pr_modulo_id ON progreso_modulos (modulo_id);
CREATE INDEX IF NOT EXISTS pr_tema_id ON progreso_temas (tema_id);
CREATE INDEX IF NOT EXISTS lp_curso_id ON learning_path_cursos (curso_id);
CREATE INDEX IF NOT EXISTS fb_tema_id ON feedback (tema_id);

-- Índices para ordenamiento por fecha
CREATE INDEX IF NOT EXISTS pr_fecha ON progreso_cursos (created_at DESC);
CREATE INDEX IF NOT EXISTS res_fecha ON resultados_quiz (fecha_realizacion DESC);

-- ═══════════════════════════════════════════════════════════════════════════════
-- NOTA: Estos índices implementan las constraints de unicidad que no se pueden
-- definir directamente en Drizzle ORM debido a limitaciones de la librería.
-- ═══════════════════════════════════════════════════════════════════════════════
