// @ts-nocheck
/**
 * Academy LMS - Admin Configuration
 *
 * Opcional: Si existe, el admin usa estas vistas custom.
 * Si no existe, usa Data Explorer auto-generado.
 */

// @ts-nocheck
// import type { AdminConfig } from "@gremius/admin-sdk";

export const adminConfig: AdminConfig = {
  // Nombre en el sidebar
  name: "Academy",

  // Icono (Lucide icon name)
  icon: "GraduationCap",

  // Vistas principales
  views: [
    {
      id: "dashboard",
      type: "dashboard",
      title: "Dashboard",
      // Widgets del dashboard
      widgets: [
        { type: "stat", table: "cursos", label: "Active Courses" },
        { type: "stat", table: "grupo_usuarios", label: "Students" },
        { type: "chart", table: "progreso_cursos", chartType: "completion" },
      ],
    },
    {
      id: "courses",
      type: "grid",
      title: "Courses",
      table: "cursos",
      // Configuración del grid
      columns: ["titulo", "tipoCurso", "activo", "createdAt"],
      actions: ["edit", "delete", "clone"],
      // Filtros por defecto
      filters: [
        { field: "tipoCurso", type: "select", options: ["INDUCCION", "GESTION", "TECNICO"] },
        { field: "activo", type: "boolean" },
      ],
    },
    {
      id: "course-builder",
      type: "custom",
      title: "Course Builder",
      // Componente Svelte custom (opcional)
      component: "CourseBuilder",
      // Solo aparece en modo edición
      context: "edit",
    },
    {
      id: "groups",
      type: "grid",
      title: "Student Groups",
      table: "grupos_asignacion",
      columns: ["nombre", "supervisorPrincipalId", "miembros.count"],
    },
    {
      id: "learning-paths",
      type: "pipeline", // Vista tipo Kanban
      title: "Learning Paths",
      table: "learning_paths",
      groupBy: "categoria",
      columns: ["nombre", "totalCursos", "activo"],
    },
  ],

  // Configuración de formularios
  forms: {
    cursos: {
      layout: "tabs",
      tabs: [
        { id: "general", label: "General", fields: ["titulo", "descripcion", "tipoCurso"] },
        { id: "media", label: "Media", fields: ["portada", "colorPortada"] },
        { id: "schedule", label: "Schedule", fields: ["fechaInicio", "fechaFin", "duracionHoras"] },
      ],
    },
  },
};

// Exportar componentes custom (opcional)
// export { default as CourseBuilder } from "./admin/CourseBuilder.svelte";
// export { default as QuizEditor } from "./admin/QuizEditor.svelte";
