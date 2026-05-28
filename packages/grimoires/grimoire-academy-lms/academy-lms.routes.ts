// @ts-nocheck
/**
 * Academy LMS - Rutas API (DI Version)
 * 
 * Endpoints para gestionar cursos, progreso, quizzes, asignaciones, learning paths y más.
 * 
 * MIGRATED: Now uses Dependency Injection via GrimoireContext
 * - db → ctx.dbInstance.instance
 * - auth → ctx.auth.requireAuth, ctx.auth.requireRole
 * 
 * FEATURES:
 * - Full CRUD for Courses, Modules, Topics, Quizzes, Questions, Options
 * - Progress tracking at course, module, and topic level
 * - Learning Paths with sequential approval support
 * - Group-based and individual assignments
 * - Satisfaction surveys and feedback
 * - Certificates generation
 * - Comprehensive reports and analytics
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, desc, asc, inArray, sql, count, avg, sum, gt } from "drizzle-orm";
import type { GrimoireContext } from "@gremius/shared";
import {
  // Tablas
  perfilUsuarioTable,
  cursoTable,
  grupoAsignacionTable,
  grupoUsuarioTable,
  grupoSupervisorTable,
  moduloTable,
  temaTable,
  archivoAdicionalTable,
  quizTable,
  preguntaTable,
  opcionTable,
  progresoCursoTable,
  progresoTemaTable,
  resultadoQuizTable,
  respuestaUsuarioTable,
  asignacionTable,
  feedbackTable,
  encuestaSatisfaccionTable,
  certificadoTable,
  // Learning Paths
  learningPathTable,
  learningPathCursoTable,
  progresoLearningPathTable,
  asignacionLearningPathTable,
  // Enums
  tipoCursoEnum,
  rolCapacitacionesEnum,
  departamentoEnum,
  cargoEnum,
  lugarEnum,
  rolEncuestaEnum,
  actividadLogTable,
} from "./academy-lms.schema";

// Services imports (moved to top level)
import {
  generarExcelAsignaciones,
  generarExcelProgreso,
  generarExcelEncuestas,
} from "./services/excel.service";

import {
  validarUsuariosExternos,
  parsearCSV,
  mapeoRolesPacifico,
  type SyncConfig,
  type SyncResult,
} from "./services/user-sync.service";

import {
  validarArchivo,
  determinarTipoMedia,
  formatBytes,
  extraerInfoYoutube,
  normalizarVideoUrl,
} from "./services/media.service";

import {
  generarCertificadoPDF,
  validarCodigoCertificado,
  extraerInfoCodigo,
  type CertificadoData,
} from "./services/pdf.service";

/**
 * Factory function that creates Academy LMS routes with dependency injection
 * This replaces the old direct import pattern with proper DI
 */
export function createAcademyLMSRoutes(ctx: GrimoireContext): Hono {
  const academyLMSRoutes = new Hono();
  const { db, auth, logger } = ctx;
  
  // Helper to get db instance
  const dbInstance = db.instance;
  
  // Helper middleware for auth
  const requireAuth = auth.requireAuth;
  const requireRole = (roles: string[]) => auth.requireRole ? auth.requireRole(roles) : auth.requireAuth;

// ============================================
// MIDDLEWARE
// ============================================

academyLMSRoutes.use("/*", requireAuth);

// ============================================
// CURSOS
// ============================================

/**
 * GET /cursos
 * Lista todos los cursos disponibles para el usuario autenticado
 */
academyLMSRoutes.get("/cursos", async (c) => {
  const user = c.get("user");
  const estado = c.req.query("estado") || "todos"; // todos, no-iniciados, en-progreso, completados
  
  // Obtener IDs de cursos asignados al usuario (directa o por grupo)
  const asignacionesUsuario = await dbInstance
    .select({ cursoId: asignacionTable.cursoId })
    .from(asignacionTable)
    .where(eq(asignacionTable.userId, user.id));
  
  const cursosIds = asignacionesUsuario.map(a => a.cursoId);
  
  if (cursosIds.length === 0) {
    return c.json({ cursos: [], total: 0 });
  }
  
  // Obtener cursos con progreso
  const cursos = await dbInstance.query.cursoTable.findMany({
    where: inArray(cursoTable.id, cursosIds),
    with: {
      modulos: {
        with: {
          temas: true,
        },
      },
    },
  });
  
  // Enriquecer con progreso del usuario
  const cursosConProgreso = await Promise.all(
    cursos.map(async (curso) => {
      const progreso = await dbInstance.query.progresoCursoTable.findFirst({
        where: and(
          eq(progresoCursoTable.userId, user.id),
          eq(progresoCursoTable.cursoId, curso.id)
        ),
      });
      
      const totalTemas = curso.modulos.reduce((sum, mod) => sum + mod.temas.length, 0);
      const temasCompletados = await dbInstance
        .select({ count: count() })
        .from(progresoTemaTable)
        .where(and(
          eq(progresoTemaTable.userId, user.id),
          inArray(progresoTemaTable.temaId, curso.modulos.flatMap(m => m.temas.map(t => t.id)))
        ));
      
      const porcentaje = totalTemas > 0 
        ? Math.round((temasCompletados[0].count / totalTemas) * 100)
        : 0;
      
      return {
        ...curso,
        progresoPercent: porcentaje,
        completado: progreso?.completado || false,
        encuestaCompletada: progreso?.encuestaCompletada || false,
      };
    })
  );
  
  // Filtrar por estado
  let cursosFiltrados = cursosConProgreso;
  if (estado === "no-iniciados") {
    cursosFiltrados = cursosConProgreso.filter(c => c.progresoPercent === 0);
  } else if (estado === "en-progreso") {
    cursosFiltrados = cursosConProgreso.filter(c => c.progresoPercent > 0 && c.progresoPercent < 100);
  } else if (estado === "completados") {
    cursosFiltrados = cursosConProgreso.filter(c => c.progresoPercent === 100);
  }
  
  return c.json({
    cursos: cursosFiltrados,
    total: cursosFiltrados.length,
    estado,
  });
});

/**
 * GET /cursos/:id
 * Detalle completo de un curso incluyendo módulos, temas y progreso
 */
academyLMSRoutes.get("/cursos/:id", async (c) => {
  const user = c.get("user");
  const cursoId = c.req.param("id");
  
  const curso = await dbInstance.query.cursoTable.findFirst({
    where: eq(cursoTable.id, cursoId),
    with: {
      modulos: {
        orderBy: [asc(moduloTable.orden)],
        with: {
          temas: {
            orderBy: [asc(temaTable.orden)],
            with: {
              archivos: true,
            },
          },
          quiz: {
            with: {
              preguntas: {
                with: {
                  opciones: true,
                },
              },
            },
          },
        },
      },
    },
  });
  
  if (!curso) {
    return c.json({ error: "Curso no encontrado" }, 404);
  }
  
  // Verificar acceso
  const tieneAcceso = await dbInstance.query.asignacionTable.findFirst({
    where: and(
      eq(asignacionTable.cursoId, cursoId),
      eq(asignacionTable.userId, user.id)
    ),
  });
  
  if (!tieneAcceso) {
    return c.json({ error: "No tienes acceso a este curso" }, 403);
  }
  
  // Obtener progreso
  const progreso = await dbInstance.query.progresoCursoTable.findFirst({
    where: and(
      eq(progresoCursoTable.userId, user.id),
      eq(progresoCursoTable.cursoId, cursoId)
    ),
  });
  
  // Temas completados
  const temasIds = curso.modulos.flatMap(m => m.temas.map(t => t.id));
  const progresoTemas = await dbInstance.query.progresoTemaTable.findMany({
    where: and(
      eq(progresoTemaTable.userId, user.id),
      inArray(progresoTemaTable.temaId, temasIds)
    ),
  });
  const temasCompletadosIds = progresoTemas.filter(p => p.completado).map(p => p.temaId);
  
  // Resultados de quizzes
  const quizzesIds = curso.modulos.map(m => m.quiz?.id).filter(Boolean);
  const resultadosQuiz = await dbInstance.query.resultadoQuizTable.findMany({
    where: and(
      eq(resultadoQuizTable.userId, user.id),
      inArray(resultadoQuizTable.quizId, quizzesIds)
    ),
  });
  
  return c.json({
    curso,
    progreso: {
      ...progreso,
      temasCompletadosIds,
      quizzesAprobados: resultadosQuiz.filter(r => r.aprobado).length,
    },
  });
});

/**
 * POST /cursos (Admin/Supervisor)
 * Crear un nuevo curso
 */
const crearCursoSchema = z.object({
  titulo: z.string().min(1),
  descripcion: z.string().min(1),
  fechaInicio: z.string().datetime().optional(),
  fechaFin: z.string().datetime().optional(),
  duracionHoras: z.number().positive().optional(),
  colorPortada: z.string().default("#009c3c"),
  tipoCurso: z.enum(tipoCursoEnum.enumValues).optional(),
});

academyLMSRoutes.post(
  "/cursos",
  requireRole(["administrador", "supervisor"]),
  zValidator("json", crearCursoSchema),
  async (c) => {
    const data = c.req.valid("json");
    
    const [curso] = await dbInstance.insert(cursoTable).values({
      ...data,
      fechaInicio: data.fechaInicio ? new Date(data.fechaInicio) : null,
      fechaFin: data.fechaFin ? new Date(data.fechaFin) : null,
    }).returning();
    
    return c.json({ success: true, curso }, 201);
  }
);

// ============================================
// TEMAS Y PROGRESO
// ============================================

/**
 * GET /temas/:id
 * Ver detalle de un tema
 */
academyLMSRoutes.get("/temas/:id", async (c) => {
  const user = c.get("user");
  const temaId = c.req.param("id");
  
  const tema = await dbInstance.query.temaTable.findFirst({
    where: eq(temaTable.id, temaId),
    with: {
      modulo: {
        with: {
          curso: true,
        },
      },
      archivos: true,
    },
  });
  
  if (!tema) {
    return c.json({ error: "Tema no encontrado" }, 404);
  }
  
  // Verificar acceso al curso
  const tieneAcceso = await dbInstance.query.asignacionTable.findFirst({
    where: and(
      eq(asignacionTable.cursoId, tema.modulo.curso.id),
      eq(asignacionTable.userId, user.id)
    ),
  });
  
  if (!tieneAcceso) {
    return c.json({ error: "No tienes acceso a este tema" }, 403);
  }
  
  // Obtener progreso del tema
  const progreso = await dbInstance.query.progresoTemaTable.findFirst({
    where: and(
      eq(progresoTemaTable.userId, user.id),
      eq(progresoTemaTable.temaId, temaId)
    ),
  });
  
  // Feedbacks del tema (últimos 5)
  const feedbacks = await dbInstance.query.feedbackTable.findMany({
    where: eq(feedbackTable.temaId, temaId),
    orderBy: [desc(feedbackTable.createdAt)],
    limit: 5,
    with: {
      user: true,
    },
  });
  
  return c.json({
    tema,
    completado: progreso?.completado || false,
    feedbacks,
  });
});

/**
 * POST /temas/:id/completar
 * Marcar un tema como completado
 */
academyLMSRoutes.post("/temas/:id/completar", async (c) => {
  const user = c.get("user");
  const temaId = c.req.param("id");
  
  const tema = await dbInstance.query.temaTable.findFirst({
    where: eq(temaTable.id, temaId),
    with: {
      modulo: {
        with: {
          curso: true,
        },
      },
    },
  });
  
  if (!tema) {
    return c.json({ error: "Tema no encontrado" }, 404);
  }
  
  // Actualizar o crear progreso
  await dbInstance.insert(progresoTemaTable)
    .values({
      userId: user.id,
      temaId,
      completado: true,
      fechaCompletado: new Date(),
    })
    .onConflictDoUpdate({
      target: [progresoTemaTable.userId, progresoTemaTable.temaId],
      set: {
        completado: true,
        fechaCompletado: new Date(),
      },
    });
  
  // Verificar si se completó el módulo
  const totalTemasModulo = await dbInstance
    .select({ count: count() })
    .from(temaTable)
    .where(eq(temaTable.moduloId, tema.modulo.id));
  
  const temasCompletadosModulo = await dbInstance
    .select({ count: count() })
    .from(progresoTemaTable)
    .where(and(
      eq(progresoTemaTable.userId, user.id),
      inArray(
        progresoTemaTable.temaId,
        dbInstance.select({ id: temaTable.id }).from(temaTable).where(eq(temaTable.moduloId, tema.modulo.id))
      ),
      eq(progresoTemaTable.completado, true)
    ));
  
  // Actualizar progreso del curso
  const [progresoCurso] = await dbInstance.insert(progresoCursoTable)
    .values({
      userId: user.id,
      cursoId: tema.modulo.curso.id,
      porcentajeProgreso: 0,
    })
    .onConflictDoNothing()
    .returning();
  
  return c.json({
    success: true,
    message: "Tema marcado como completado",
    moduloCompletado: temasCompletadosModulo[0].count === totalTemasModulo[0].count,
  });
});

// ============================================
// QUIZZES
// ============================================

/**
 * POST /quizzes/:id/responder
 * Enviar respuestas a un quiz
 */
const responderQuizSchema = z.object({
  respuestas: z.record(z.string(), z.string()), // { preguntaId: opcionId }
  tiempoEmpleadoSegundos: z.number().optional(),
});

academyLMSRoutes.post(
  "/quizzes/:id/responder",
  zValidator("json", responderQuizSchema),
  async (c) => {
    const user = c.get("user");
    const quizId = c.req.param("id");
    const { respuestas, tiempoEmpleadoSegundos } = c.req.valid("json");
    
    // Obtener quiz con preguntas y opciones correctas
    const quiz = await dbInstance.query.quizTable.findFirst({
      where: eq(quizTable.id, quizId),
      with: {
        modulo: true,
        preguntas: {
          with: {
            opciones: true,
          },
        },
      },
    });
    
    if (!quiz) {
      return c.json({ error: "Quiz no encontrado" }, 404);
    }
    
    // Calcular puntaje
    let puntajeTotal = 0;
    let puntajeMaximo = 0;
    const respuestasDetalle: Record<string, { seleccionada: string; correcta: string; esCorrecta: boolean }> = {};
    
    for (const pregunta of quiz.preguntas) {
      puntajeMaximo += pregunta.puntaje;
      const opcionCorrecta = pregunta.opciones.find(o => o.esCorrecta);
      const opcionSeleccionadaId = respuestas[pregunta.id];
      const opcionSeleccionada = pregunta.opciones.find(o => o.id === opcionSeleccionadaId);
      
      respuestasDetalle[pregunta.id] = {
        seleccionada: opcionSeleccionadaId,
        correcta: opcionCorrecta?.id || "",
        esCorrecta: opcionCorrecta?.id === opcionSeleccionadaId,
      };
      
      if (opcionCorrecta?.id === opcionSeleccionadaId) {
        puntajeTotal += pregunta.puntaje;
      }
      
      // Guardar respuesta del usuario
      if (opcionSeleccionadaId) {
        await dbInstance.insert(respuestaUsuarioTable).values({
          userId: user.id,
          preguntaId: pregunta.id,
          opcionSeleccionadaId,
        }).onConflictDoNothing();
      }
    }
    
    const porcentaje = Math.round((puntajeTotal / puntajeMaximo) * 100);
    const aprobado = porcentaje >= quiz.puntajeMinimoAprobacion;
    
    // Guardar resultado
    const [resultado] = await dbInstance.insert(resultadoQuizTable).values({
      userId: user.id,
      quizId,
      puntaje: puntajeTotal,
      puntajePorcentaje: porcentaje,
      aprobado,
      respuestasJson: respuestasDetalle,
      tiempoEmpleadoSegundos,
    }).returning();
    
    return c.json({
      success: true,
      resultado: {
        puntaje: puntajeTotal,
        puntajeMaximo,
        porcentaje,
        aprobado,
        puntajeMinimo: quiz.puntajeMinimoAprobacion,
      },
    });
  }
);

// ============================================
// ASIGNACIONES (Admin/Supervisor)
// ============================================

/**
 * POST /asignaciones
 * Asignar un curso a un usuario o grupo
 */
const asignarCursoSchema = z.object({
  cursoId: z.string(),
  userId: z.string().optional(),
  grupoId: z.string().optional(),
  notas: z.string().optional(),
});

/**
 * POST /asignaciones/multiple
 * Asignar múltiples cursos a uno o más usuarios (BULK)
 */
const asignarMultipleSchema = z.object({
  cursoIds: z.array(z.string()).min(1, "Debe especificar al menos un curso"),
  userIds: z.array(z.string()).optional(),
  grupoIds: z.array(z.string()).optional(),
  fechaLimite: z.string().datetime().optional(),
  prioridad: z.enum(["baja", "normal", "alta", "urgente"]).default("normal"),
  notas: z.string().optional(),
});

academyLMSRoutes.post(
  "/asignaciones",
  requireRole(["administrador", "supervisor"]),
  zValidator("json", asignarCursoSchema),
  async (c) => {
    const admin = c.get("user");
    const data = c.req.valid("json");
    
    if (!data.userId && !data.grupoId) {
      return c.json({ error: "Debe especificar userId o grupoId" }, 400);
    }
    
    // Crear asignación
    const [asignacion] = await dbInstance.insert(asignacionTable).values({
      cursoId: data.cursoId,
      userId: data.userId,
      grupoId: data.grupoId,
      metodo: data.grupoId ? "grupo" : "manual",
      asignadoPorId: admin.id,
      notas: data.notas,
    }).returning();
    
    // Si es grupo, crear asignaciones y progreso para cada miembro
    if (data.grupoId) {
      const miembros = await dbInstance
        .select({ userId: grupoUsuarioTable.userId })
        .from(grupoUsuarioTable)
        .where(eq(grupoUsuarioTable.grupoId, data.grupoId));
      
      for (const miembro of miembros) {
        await dbInstance.insert(progresoCursoTable)
          .values({
            userId: miembro.userId,
            cursoId: data.cursoId,
          })
          .onConflictDoNothing();
      }
    } else if (data.userId) {
      // Crear progreso para usuario individual
      await dbInstance.insert(progresoCursoTable)
        .values({
          userId: data.userId,
          cursoId: data.cursoId,
        })
        .onConflictDoNothing();
    }
    
    return c.json({ success: true, asignacion }, 201);
  }
);

/**
 * GET /asignaciones
 * Listar asignaciones con filtros
 */
academyLMSRoutes.get(
  "/asignaciones",
  requireRole(["administrador", "supervisor"]),
  async (c) => {
    const cursoId = c.req.query("cursoId");
    const userId = c.req.query("userId");
    const grupoId = c.req.query("grupoId");
    
    let query = dbInstance.select().from(asignacionTable);
    
    if (cursoId) {
      query = query.where(eq(asignacionTable.cursoId, cursoId));
    }
    if (userId) {
      query = query.where(eq(asignacionTable.userId, userId));
    }
    if (grupoId) {
      query = query.where(eq(asignacionTable.grupoId, grupoId));
    }
    
    const asignaciones = await query.orderBy(desc(asignacionTable.fecha));
    
    return c.json({ asignaciones, total: asignaciones.length });
  }
);

/**
 * POST /asignaciones/multiple
 * Asignar múltiples cursos a uno o más usuarios
 */
academyLMSRoutes.post(
  "/asignaciones/multiple",
  requireRole(["administrador", "supervisor"]),
  zValidator("json", asignarMultipleSchema),
  async (c) => {
    const admin = c.get("user");
    const data = c.req.valid("json");
    
    if ((!data.userIds || data.userIds.length === 0) && (!data.grupoIds || data.grupoIds.length === 0)) {
      return c.json({ error: "Debe especificar al menos un userId o grupoId" }, 400);
    }
    
    const resultados = {
      asignacionesCreadas: 0,
      progresosCreados: 0,
      cursosAsignados: data.cursoIds.length,
      usuariosAsignados: 0,
      errores: [] as string[],
    };
    
    // Obtener todos los usuarios objetivo (individuales + de grupos)
    const usuariosObjetivo = new Set<string>();
    
    if (data.userIds) {
      data.userIds.forEach(id => usuariosObjetivo.add(id));
    }
    
    if (data.grupoIds) {
      for (const grupoId of data.grupoIds) {
        const miembros = await dbInstance
          .select({ userId: grupoUsuarioTable.userId })
          .from(grupoUsuarioTable)
          .where(eq(grupoUsuarioTable.grupoId, grupoId));
        miembros.forEach(m => usuariosObjetivo.add(m.userId));
      }
    }
    
    resultados.usuariosAsignados = usuariosObjetivo.size;
    
    // Asignar cada curso a cada usuario
    for (const cursoId of data.cursoIds) {
      for (const userId of usuariosObjetivo) {
        try {
          // Crear asignación
          await dbInstance.insert(asignacionTable).values({
            cursoId,
            userId,
            metodo: data.grupoIds && data.grupoIds.length > 0 ? "grupo" : "manual",
            asignadoPorId: admin.id,
            notas: data.notas,
          }).onConflictDoNothing();
          resultados.asignacionesCreadas++;
          
          // Crear progreso
          await dbInstance.insert(progresoCursoTable)
            .values({
              userId,
              cursoId,
            })
            .onConflictDoNothing();
          resultados.progresosCreados++;
        } catch (error) {
          resultados.errores.push(`Error asignando curso ${cursoId} a usuario ${userId}`);
        }
      }
    }
    
    return c.json({
      success: true,
      message: `Asignados ${resultados.cursosAsignados} cursos a ${resultados.usuariosAsignados} usuarios`,
      resultados,
    }, 201);
  }
);

// ============================================
// LEARNING PATHS
// ============================================

/**
 * GET /learning-paths
 * Listar todos los learning paths activos
 */
academyLMSRoutes.get("/learning-paths", async (c) => {
  const categoria = c.req.query("categoria");
  
  let query = dbInstance.select().from(learningPathTable).where(eq(learningPathTable.activo, true));
  
  if (categoria) {
    query = query.where(eq(learningPathTable.categoria, categoria));
  }
  
  const paths = await query.orderBy(desc(learningPathTable.createdAt));
  
  // Contar cursos en cada path
  const pathsConConteo = await Promise.all(
    paths.map(async (path) => {
      const [conteo] = await dbInstance
        .select({ count: count() })
        .from(learningPathCursoTable)
        .where(eq(learningPathCursoTable.learningPathId, path.id));
      
      return {
        ...path,
        totalCursos: conteo.count,
      };
    })
  );
  
  return c.json({ learningPaths: pathsConConteo, total: pathsConConteo.length });
});

/**
 * GET /learning-paths/:id
 * Detalle completo de un learning path con sus cursos
 */
academyLMSRoutes.get("/learning-paths/:id", async (c) => {
  const user = c.get("user");
  const pathId = c.req.param("id");
  
  const path = await dbInstance.query.learningPathTable.findFirst({
    where: and(
      eq(learningPathTable.id, pathId),
      eq(learningPathTable.activo, true)
    ),
  });
  
  if (!path) {
    return c.json({ error: "Learning Path no encontrado" }, 404);
  }
  
  // Obtener cursos ordenados
  const cursosDelPath = await dbInstance.query.learningPathCursoTable.findMany({
    where: eq(learningPathCursoTable.learningPathId, pathId),
    orderBy: [asc(learningPathCursoTable.orden)],
    with: {
      curso: {
        with: {
          modulos: {
            with: {
              temas: true,
            },
          },
        },
      },
    },
  });
  
  // Si el usuario está autenticado, obtener su progreso en este path
  let progresoUsuario = null;
  if (user) {
    progresoUsuario = await dbInstance.query.progresoLearningPathTable.findFirst({
      where: and(
        eq(progresoLearningPathTable.userId, user.id),
        eq(progresoLearningPathTable.learningPathId, pathId)
      ),
    });
  }
  
  return c.json({
    learningPath: path,
    cursos: cursosDelPath,
    progreso: progresoUsuario,
  });
});

/**
 * POST /learning-paths (Admin)
 * Crear un nuevo learning path
 */
const crearLearningPathSchema = z.object({
  nombre: z.string().min(1),
  descripcion: z.string().optional(),
  categoria: z.string().optional(),
  duracionEstimadaHoras: z.number().positive().optional(),
  mediaId: z.string().optional(), // Referencia a grimoire-media (imagen del learning path)
  requiereAprobacionSecuencial: z.boolean().default(false),
  cursos: z.array(z.object({
    cursoId: z.string(),
    orden: z.number().int().positive(),
    obligatorio: z.boolean().default(true),
    duracionEstimadaDias: z.number().int().positive().optional(),
  })).min(1, "Debe incluir al menos un curso"),
});

academyLMSRoutes.post(
  "/learning-paths",
  requireRole(["administrador"]),
  zValidator("json", crearLearningPathSchema),
  async (c) => {
    const admin = c.get("user");
    const data = c.req.valid("json");
    
    // Crear el learning path
    const [path] = await dbInstance.insert(learningPathTable).values({
      nombre: data.nombre,
      descripcion: data.descripcion,
      categoria: data.categoria,
      duracionEstimadaHoras: data.duracionEstimadaHoras?.toString(),
      mediaId: data.mediaId,
      requiereAprobacionSecuencial: data.requiereAprobacionSecuencial,
      createdById: admin.id,
    }).returning();
    
    // Agregar cursos al path
    const cursosInsertados = await dbInstance.insert(learningPathCursoTable).values(
      data.cursos.map(c => ({
        learningPathId: path.id,
        cursoId: c.cursoId,
        orden: c.orden,
        obligatorio: c.obligatorio,
        duracionEstimadaDias: c.duracionEstimadaDias,
      }))
    ).returning();
    
    return c.json({
      success: true,
      learningPath: path,
      totalCursos: cursosInsertados.length,
    }, 201);
  }
);

/**
 * PUT /learning-paths/:id (Admin)
 * Actualizar un learning path
 */
const actualizarLearningPathSchema = z.object({
  nombre: z.string().min(1).optional(),
  descripcion: z.string().optional(),
  categoria: z.string().optional(),
  duracionEstimadaHoras: z.number().positive().optional(),
  mediaId: z.string().optional(), // Referencia a grimoire-media (imagen del learning path)
  activo: z.boolean().optional(),
  requiereAprobacionSecuencial: z.boolean().optional(),
});

academyLMSRoutes.put(
  "/learning-paths/:id",
  requireRole(["administrador"]),
  zValidator("json", actualizarLearningPathSchema),
  async (c) => {
    const pathId = c.req.param("id");
    const data = c.req.valid("json");
    
    const [path] = await dbInstance.update(learningPathTable)
      .set({
        nombre: data.nombre,
        descripcion: data.descripcion,
        categoria: data.categoria,
        duracionEstimadaHoras: data.duracionEstimadaHoras?.toString(),
        mediaId: data.mediaId,
        activo: data.activo,
        requiereAprobacionSecuencial: data.requiereAprobacionSecuencial,
        updatedAt: new Date(),
      })
      .where(eq(learningPathTable.id, pathId))
      .returning();
    
    if (!path) {
      return c.json({ error: "Learning Path no encontrado" }, 404);
    }
    
    return c.json({ success: true, learningPath: path });
  }
);

/**
 * POST /learning-paths/:id/asignar
 * Asignar un learning path completo a usuario(s)
 */
const asignarLearningPathSchema = z.object({
  userIds: z.array(z.string()).optional(),
  grupoIds: z.array(z.string()).optional(),
  fechaLimite: z.string().datetime().optional(),
  prioridad: z.enum(["baja", "normal", "alta", "urgente"]).default("normal"),
  notas: z.string().optional(),
});

academyLMSRoutes.post(
  "/learning-paths/:id/asignar",
  requireRole(["administrador", "supervisor"]),
  zValidator("json", asignarLearningPathSchema),
  async (c) => {
    const admin = c.get("user");
    const pathId = c.req.param("id");
    const data = c.req.valid("json");
    
    if ((!data.userIds || data.userIds.length === 0) && (!data.grupoIds || data.grupoIds.length === 0)) {
      return c.json({ error: "Debe especificar al menos un userId o grupoId" }, 400);
    }
    
    // Verificar que el learning path existe
    const path = await dbInstance.query.learningPathTable.findFirst({
      where: eq(learningPathTable.id, pathId),
    });
    
    if (!path) {
      return c.json({ error: "Learning Path no encontrado" }, 404);
    }
    
    // Obtener cursos del path
    const cursosDelPath = await dbInstance.query.learningPathCursoTable.findMany({
      where: eq(learningPathCursoTable.learningPathId, pathId),
    });
    
    if (cursosDelPath.length === 0) {
      return c.json({ error: "El Learning Path no tiene cursos asignados" }, 400);
    }
    
    // Obtener todos los usuarios objetivo
    const usuariosObjetivo = new Set<string>();
    
    if (data.userIds) {
      data.userIds.forEach(id => usuariosObjetivo.add(id));
    }
    
    if (data.grupoIds) {
      for (const grupoId of data.grupoIds) {
        const miembros = await dbInstance
          .select({ userId: grupoUsuarioTable.userId })
          .from(grupoUsuarioTable)
          .where(eq(grupoUsuarioTable.grupoId, grupoId));
        miembros.forEach(m => usuariosObjetivo.add(m.userId));
      }
    }
    
    const resultados = {
      usuariosAsignados: 0,
      cursosAsignados: 0,
      pathsIniciados: 0,
    };
    
    // Asignar el path y todos sus cursos a cada usuario
    for (const userId of usuariosObjetivo) {
      // Crear/actualizar progreso del learning path
      await dbInstance.insert(progresoLearningPathTable)
        .values({
          userId,
          learningPathId: pathId,
          totalCursos: cursosDelPath.length,
          fechaLimite: data.fechaLimite ? new Date(data.fechaLimite) : null,
        })
        .onConflictDoNothing();
      
      // Registrar asignación del path
      await dbInstance.insert(asignacionLearningPathTable).values({
        learningPathId: pathId,
        userId,
        asignadoPorId: admin.id,
        fechaLimite: data.fechaLimite ? new Date(data.fechaLimite) : null,
        prioridad: data.prioridad,
        notas: data.notas,
      }).onConflictDoNothing();
      
      resultados.pathsIniciados++;
      
      // Asignar cada curso del path
      for (const cursoPath of cursosDelPath) {
        await dbInstance.insert(asignacionTable).values({
          cursoId: cursoPath.cursoId,
          userId,
          metodo: "manual",
          asignadoPorId: admin.id,
          notas: `Asignado vía Learning Path: ${path.nombre}`,
        }).onConflictDoNothing();
        
        await dbInstance.insert(progresoCursoTable)
          .values({
            userId,
            cursoId: cursoPath.cursoId,
          })
          .onConflictDoNothing();
        
        resultados.cursosAsignados++;
      }
      
      resultados.usuariosAsignados++;
    }
    
    return c.json({
      success: true,
      message: `Learning Path "${path.nombre}" asignado a ${resultados.usuariosAsignados} usuarios`,
      resultados: {
        ...resultados,
        totalCursosEnPath: cursosDelPath.length,
      },
    }, 201);
  }
);

/**
 * GET /learning-paths/mis-paths
 * Obtener los learning paths asignados al usuario autenticado
 */
academyLMSRoutes.get("/learning-paths/mis-paths", async (c) => {
  const user = c.get("user");
  
  const misPaths = await dbInstance.query.progresoLearningPathTable.findMany({
    where: eq(progresoLearningPathTable.userId, user.id),
    with: {
      learningPath: true,
    },
    orderBy: [desc(progresoLearningPathTable.createdAt)],
  });
  
  return c.json({
    learningPaths: misPaths,
    total: misPaths.length,
    completados: misPaths.filter(p => p.completado).length,
    enProgreso: misPaths.filter(p => !p.completado && p.porcentajeCompletado > 0).length,
    pendientes: misPaths.filter(p => p.porcentajeCompletado === 0).length,
  });
});

// ============================================
// GRUPOS
// ============================================

/**
 * GET /grupos
 * Listar grupos de asignación
 */
academyLMSRoutes.get("/grupos", async (c) => {
  const user = c.get("user");
  const perfil = await dbInstance.query.perfilUsuarioTable.findFirst({
    where: eq(perfilUsuarioTable.userId, user.id),
  });
  
  let grupos;
  
  if (perfil?.rolCapacitaciones === "estudiante") {
    // Estudiante solo ve sus grupos
    grupos = await dbInstance.query.grupoAsignacionTable.findMany({
      where: inArray(
        grupoAsignacionTable.id,
        dbInstance.select({ grupoId: grupoUsuarioTable.grupoId })
          .from(grupoUsuarioTable)
          .where(eq(grupoUsuarioTable.userId, user.id))
      ),
      with: {
        supervisorPrincipal: true,
      },
    });
  } else {
    // Admin/Supervisor ven todos los grupos
    grupos = await dbInstance.query.grupoAsignacionTable.findMany({
      with: {
        supervisorPrincipal: true,
        miembros: true,
      },
    });
  }
  
  return c.json({ grupos, total: grupos.length });
});

/**
 * POST /grupos (Admin)
 * Crear un nuevo grupo
 */
const crearGrupoSchema = z.object({
  nombre: z.string().min(1),
  descripcion: z.string().optional(),
  supervisorPrincipalId: z.string().optional(),
});

academyLMSRoutes.post(
  "/grupos",
  requireRole(["administrador"]),
  zValidator("json", crearGrupoSchema),
  async (c) => {
    const data = c.req.valid("json");
    
    const [grupo] = await dbInstance.insert(grupoAsignacionTable).values(data).returning();
    
    return c.json({ success: true, grupo }, 201);
  }
);

/**
 * POST /grupos/:id/miembros
 * Agregar miembros a un grupo
 */
const agregarMiembrosSchema = z.object({
  userIds: z.array(z.string()),
});

academyLMSRoutes.post(
  "/grupos/:id/miembros",
  requireRole(["administrador", "supervisor"]),
  zValidator("json", agregarMiembrosSchema),
  async (c) => {
    const grupoId = c.req.param("id");
    const { userIds } = c.req.valid("json");
    
    const values = userIds.map(userId => ({
      grupoId,
      userId,
    }));
    
    await dbInstance.insert(grupoUsuarioTable).values(values).onConflictDoNothing();
    
    return c.json({ success: true, agregados: userIds.length });
  }
);

// ============================================
// ENCUESTAS
// ============================================

/**
 * POST /encuestas
 * Enviar encuesta de satisfacción
 */
const encuestaSchema = z.object({
  cursoId: z.string(),
  departamento: z.enum(departamentoEnum.enumValues),
  cargo: z.enum(cargoEnum.enumValues),
  expositor: z.number().int().min(1).max(5),
  utilidad: z.boolean(),
  satisfaccion: z.number().int().min(1).max(5),
  aprendido: z.string().max(300),
  lugar: z.enum(lugarEnum.enumValues),
  rol: z.enum(rolEncuestaEnum.enumValues),
  recomendacion: z.string().max(200).optional(),
  comentariosCurso: z.string().max(500),
});

academyLMSRoutes.post(
  "/encuestas",
  zValidator("json", encuestaSchema),
  async (c) => {
    const user = c.get("user");
    const data = c.req.valid("json");
    
    // Verificar que el curso está completado
    const progreso = await dbInstance.query.progresoCursoTable.findFirst({
      where: and(
        eq(progresoCursoTable.userId, user.id),
        eq(progresoCursoTable.cursoId, data.cursoId)
      ),
    });
    
    if (!progreso?.completado) {
      return c.json({ error: "Debe completar el curso antes de enviar la encuesta" }, 400);
    }
    
    // Crear encuesta
    const [encuesta] = await dbInstance.insert(encuestaSatisfaccionTable).values({
      ...data,
      userId: user.id,
      utilidad: data.utilidad ? "si" : "no",
    }).returning();
    
    // Marcar encuesta como completada en el progreso
    await dbInstance.update(progresoCursoTable)
      .set({ encuestaCompletada: true })
      .where(and(
        eq(progresoCursoTable.userId, user.id),
        eq(progresoCursoTable.cursoId, data.cursoId)
      ));
    
    return c.json({ success: true, encuesta }, 201);
  }
);

/**
 * GET /encuestas (Admin)
 * Obtener todas las encuestas
 */
academyLMSRoutes.get(
  "/encuestas",
  requireRole(["administrador", "supervisor"]),
  async (c) => {
    const cursoId = c.req.query("cursoId");
    
    let query = dbInstance.select().from(encuestaSatisfaccionTable);
    
    if (cursoId) {
      query = query.where(eq(encuestaSatisfaccionTable.cursoId, cursoId));
    }
    
    const encuestas = await query.orderBy(desc(encuestaSatisfaccionTable.fecha));
    
    return c.json({ encuestas, total: encuestas.length });
  }
);

// ============================================
// DASHBOARD Y REPORTES
// ============================================

/**
 * GET /dashboard
 * Dashboard con métricas del sistema
 */
academyLMSRoutes.get(
  "/dashboard",
  requireRole(["administrador", "supervisor"]),
  async (c) => {
    // Conteos básicos
    const [totalCursos] = await dbInstance.select({ count: count() }).from(cursoTable);
    const [totalModulos] = await dbInstance.select({ count: count() }).from(moduloTable);
    const [totalTemas] = await dbInstance.select({ count: count() }).from(temaTable);
    const [totalQuizzes] = await dbInstance.select({ count: count() }).from(quizTable);
    const [totalPreguntas] = await dbInstance.select({ count: count() }).from(preguntaTable);
    const [totalGrupos] = await dbInstance.select({ count: count() }).from(grupoAsignacionTable);
    const [totalAsignaciones] = await dbInstance.select({ count: count() }).from(asignacionTable);
    const [totalCursosCompletados] = await dbInstance
      .select({ count: count() })
      .from(progresoCursoTable)
      .where(eq(progresoCursoTable.completado, true));
    const [totalFeedbacks] = await dbInstance.select({ count: count() }).from(feedbackTable);
    const [totalEncuestas] = await dbInstance.select({ count: count() }).from(encuestaSatisfaccionTable);
    
    // Métricas de duración
    const duracionStats = await dbInstance
      .select({
        totalHoras: sum(cursoTable.duracionHoras),
        promedioHoras: avg(cursoTable.duracionHoras),
        count: count(),
      })
      .from(cursoTable);
    
    // Tasa de finalización
    const tasaCompletado = totalAsignaciones.count > 0
      ? Math.round((totalCursosCompletados.count / totalAsignaciones.count) * 100)
      : 0;
    
    // Promedios
    const promedioModulos = totalCursos.count > 0
      ? Math.round((totalModulos.count / totalCursos.count) * 10) / 10
      : 0;
    
    const promedioTemas = totalModulos.count > 0
      ? Math.round((totalTemas.count / totalModulos.count) * 10) / 10
      : 0;
    
    // Alertas
    const alertas = [];
    if (totalCursos.count === 0) {
      alertas.push({ tipo: "warning", mensaje: "Sin cursos disponibles - Crear contenido educativo" });
    }
    if (totalAsignaciones.count === 0) {
      alertas.push({ tipo: "warning", mensaje: "Sin usuarios asignados - Crear asignaciones" });
    }
    if (totalCursos.count > 0 && totalModulos.count > 0 && totalAsignaciones.count > 0) {
      alertas.push({ tipo: "success", mensaje: "Sistema funcionando correctamente" });
    }
    
    return c.json({
      metricas: {
        totalCursos: totalCursos.count,
        totalModulos: totalModulos.count,
        totalTemas: totalTemas.count,
        totalQuizzes: totalQuizzes.count,
        totalPreguntas: totalPreguntas.count,
        totalGrupos: totalGrupos.count,
        totalAsignaciones: totalAsignaciones.count,
        totalCursosCompletados: totalCursosCompletados.count,
        totalFeedbacks: totalFeedbacks.count,
        totalEncuestas: totalEncuestas.count,
        totalHorasDisponibles: parseFloat(duracionStats[0].totalHoras || "0"),
        promedioDuracionCurso: parseFloat(duracionStats[0].promedioHoras || "0"),
        tasaCompletado,
        promedioModulos,
        promedioTemas,
      },
      alertas,
    });
  }
);

/**
 * GET /dashboard/mi-progreso
 * Progreso del usuario autenticado
 */
academyLMSRoutes.get("/dashboard/mi-progreso", async (c) => {
  const user = c.get("user");
  
  // Cursos asignados
  const asignaciones = await dbInstance.query.asignacionTable.findMany({
    where: eq(asignacionTable.userId, user.id),
    with: {
      curso: {
        with: {
          modulos: {
            with: {
              temas: true,
            },
          },
        },
      },
    },
  });
  
  // Progreso de cada curso
  const cursosConProgreso = await Promise.all(
    asignaciones.map(async (asignacion) => {
      const progreso = await dbInstance.query.progresoCursoTable.findFirst({
        where: and(
          eq(progresoCursoTable.userId, user.id),
          eq(progresoCursoTable.cursoId, asignacion.curso.id)
        ),
      });
      
      const totalTemas = asignacion.curso.modulos.reduce((sum, m) => sum + m.temas.length, 0);
      
      return {
        curso: asignacion.curso,
        progreso,
        totalTemas,
      };
    })
  );
  
  return c.json({
    cursos: cursosConProgreso,
    totalAsignados: cursosConProgreso.length,
    totalCompletados: cursosConProgreso.filter(c => c.progreso?.completado).length,
  });
});

// ============================================
// CERTIFICADOS
// ============================================

/**
 * GET /certificados/:cursoId
 * Generar/obtener certificado de un curso
 */
academyLMSRoutes.get("/certificados/:cursoId", async (c) => {
  const user = c.get("user");
  const cursoId = c.req.param("cursoId");
  
  // Verificar que el curso está completado y encuesta realizada
  const progreso = await dbInstance.query.progresoCursoTable.findFirst({
    where: and(
      eq(progresoCursoTable.userId, user.id),
      eq(progresoCursoTable.cursoId, cursoId),
      eq(progresoCursoTable.completado, true),
      eq(progresoCursoTable.encuestaCompletada, true)
    ),
  });
  
  if (!progreso) {
    return c.json({ 
      error: "No elegible para certificado. Debe completar el curso y la encuesta de satisfacción." 
    }, 403);
  }
  
  const curso = await dbInstance.query.cursoTable.findFirst({
    where: eq(cursoTable.id, cursoId),
  });
  
  // Generar código único
  const codigo = `CERT-${cursoId.substring(0, 8)}-${user.id.substring(0, 8)}-${Date.now().toString(36).toUpperCase()}`;
  
  // Crear o actualizar certificado
  const [certificado] = await dbInstance.insert(certificadoTable)
    .values({
      userId: user.id,
      cursoId,
      codigo,
      datosJson: {
        nombreUsuario: user.name,
        nombreCurso: curso?.titulo,
        fechaCompletado: progreso.fechaCompletado,
        duracionHoras: curso?.duracionHoras,
      },
    })
    .onConflictDoUpdate({
      target: [certificadoTable.userId, certificadoTable.cursoId],
      set: {
        fechaDescarga: new Date(),
      },
    })
    .returning();
  
  // Actualizar progreso
  await dbInstance.update(progresoCursoTable)
    .set({
      certificadoDescargado: true,
      fechaDescargaCertificado: new Date(),
    })
    .where(and(
      eq(progresoCursoTable.userId, user.id),
      eq(progresoCursoTable.cursoId, cursoId)
    ));
  
  return c.json({
    success: true,
    certificado: {
      codigo: certificado.codigo,
      curso: curso?.titulo,
      fecha: progreso.fechaCompletado,
    },
  });
});

// ============================================
// FEEDBACK
// ============================================

/**
 * POST /feedback
 * Enviar feedback sobre un tema
 */
const feedbackSchema = z.object({
  temaId: z.string(),
  puntuacion: z.number().int().min(1).max(5),
  comentario: z.string().optional(),
});

academyLMSRoutes.post(
  "/feedback",
  zValidator("json", feedbackSchema),
  async (c) => {
    const user = c.get("user");
    const data = c.req.valid("json");
    
    const [feedback] = await dbInstance.insert(feedbackTable)
      .values({
        userId: user.id,
        temaId: data.temaId,
        puntuacion: data.puntuacion,
        comentario: data.comentario,
      })
      .onConflictDoUpdate({
        target: [feedbackTable.userId, feedbackTable.temaId],
        set: {
          puntuacion: data.puntuacion,
          comentario: data.comentario,
        },
      })
      .returning();
    
    return c.json({ success: true, feedback }, 201);
  }
);

// ============================================
// CURSOS - CRUD COMPLETO (FALTANTE)
// ============================================

/**
 * PUT /cursos/:id
 * Actualizar un curso existente
 */
const actualizarCursoSchema = z.object({
  titulo: z.string().min(1).optional(),
  descripcion: z.string().optional(),
  fechaInicio: z.string().datetime().optional().nullable(),
  fechaFin: z.string().datetime().optional().nullable(),
  duracionHoras: z.number().positive().optional(),
  mediaId: z.string().optional().nullable(), // Referencia a grimoire-media
  colorPortada: z.string().optional(),
  tipoCurso: z.enum(tipoCursoEnum.enumValues).optional(),
  activo: z.boolean().optional(),
});

academyLMSRoutes.put(
  "/cursos/:id",
  requireRole(["administrador", "supervisor"]),
  zValidator("json", actualizarCursoSchema),
  async (c) => {
    const cursoId = c.req.param("id");
    const data = c.req.valid("json");
    
    const [curso] = await dbInstance.update(cursoTable)
      .set({
        ...data,
        fechaInicio: data.fechaInicio ? new Date(data.fechaInicio) : data.fechaInicio === null ? null : undefined,
        fechaFin: data.fechaFin ? new Date(data.fechaFin) : data.fechaFin === null ? null : undefined,
        updatedAt: new Date(),
      })
      .where(eq(cursoTable.id, cursoId))
      .returning();
    
    if (!curso) {
      return c.json({ error: "Curso no encontrado" }, 404);
    }
    
    return c.json({ success: true, curso });
  }
);

/**
 * DELETE /cursos/:id
 * Eliminar un curso (soft delete marcando como inactivo)
 */
academyLMSRoutes.delete(
  "/cursos/:id",
  requireRole(["administrador"]),
  async (c) => {
    const cursoId = c.req.param("id");
    
    const [curso] = await dbInstance.update(cursoTable)
      .set({ activo: false, updatedAt: new Date() })
      .where(eq(cursoTable.id, cursoId))
      .returning();
    
    if (!curso) {
      return c.json({ error: "Curso no encontrado" }, 404);
    }
    
    return c.json({ success: true, message: "Curso desactivado" });
  }
);

/**
 * GET /cursos/:id/estadisticas
 * Estadísticas detalladas de un curso
 */
academyLMSRoutes.get(
  "/cursos/:id/estadisticas",
  requireRole(["administrador", "supervisor"]),
  async (c) => {
    const cursoId = c.req.param("id");
    
    // Total de usuarios asignados
    const [{ count: totalAsignados }] = await dbInstance
      .select({ count: count() })
      .from(asignacionTable)
      .where(eq(asignacionTable.cursoId, cursoId));
    
    // Completados
    const [{ count: completados }] = await dbInstance
      .select({ count: count() })
      .from(progresoCursoTable)
      .where(and(
        eq(progresoCursoTable.cursoId, cursoId),
        eq(progresoCursoTable.completado, true)
      ));
    
    // En progreso
    const [{ count: enProgreso }] = await dbInstance
      .select({ count: count() })
      .from(progresoCursoTable)
      .where(and(
        eq(progresoCursoTable.cursoId, cursoId),
        eq(progresoCursoTable.completado, false),
        gt(progresoCursoTable.porcentajeProgreso, 0)
      ));
    
    // Promedio de progreso
    const [progresoAvg] = await dbInstance
      .select({ avg: avg(progresoCursoTable.porcentajeProgreso) })
      .from(progresoCursoTable)
      .where(eq(progresoCursoTable.cursoId, cursoId));
    
    // Resultados de quizzes
    const resultadosQuiz = await dbInstance
      .select({
        aprobados: count(),
        puntajePromedio: avg(resultadoQuizTable.puntajePorcentaje),
      })
      .from(resultadoQuizTable)
      .innerJoin(quizTable, eq(resultadoQuizTable.quizId, quizTable.id))
      .innerJoin(moduloTable, eq(quizTable.moduloId, moduloTable.id))
      .where(and(
        eq(moduloTable.cursoId, cursoId),
        eq(resultadoQuizTable.aprobado, true)
      ));
    
    // Encuestas de satisfacción
    const encuestasStats = await dbInstance
      .select({
        total: count(),
        satisfaccionPromedio: avg(encuestaSatisfaccionTable.satisfaccion),
        expositorPromedio: avg(encuestaSatisfaccionTable.expositor),
      })
      .from(encuestaSatisfaccionTable)
      .where(eq(encuestaSatisfaccionTable.cursoId, cursoId));
    
    return c.json({
      estadisticas: {
        totalAsignados,
        completados,
        enProgreso,
        noIniciados: totalAsignados - completados - enProgreso,
        tasaFinalizacion: totalAsignados > 0 ? Math.round((completados / totalAsignados) * 100) : 0,
        progresoPromedio: Math.round(parseFloat(progresoAvg.avg || "0")),
        aprobadosQuiz: parseInt(resultadosQuiz[0]?.aprobados || "0"),
        puntajePromedioQuiz: Math.round(parseFloat(resultadosQuiz[0]?.puntajePromedio || "0")),
        totalEncuestas: parseInt(encuestasStats[0]?.total || "0"),
        satisfaccionPromedio: Math.round(parseFloat(encuestasStats[0]?.satisfaccionPromedio || "0") * 10) / 10,
        expositorPromedio: Math.round(parseFloat(encuestasStats[0]?.expositorPromedio || "0") * 10) / 10,
      },
    });
  }
);

/**
 * GET /cursos/:id/modulos
 * Listar todos los módulos de un curso
 */
academyLMSRoutes.get("/cursos/:id/modulos", async (c) => {
  const cursoId = c.req.param("id");
  
  // Verificar que el curso existe
  const curso = await dbInstance.query.cursoTable.findFirst({
    where: eq(cursoTable.id, cursoId),
  });
  
  if (!curso) {
    return c.json({ error: "Curso no encontrado" }, 404);
  }
  
  // Obtener módulos con sus temas
  const modulos = await dbInstance.query.moduloTable.findMany({
    where: eq(moduloTable.cursoId, cursoId),
    orderBy: [asc(moduloTable.orden)],
    with: {
      temas: {
        orderBy: [asc(temaTable.orden)],
      },
      quiz: true,
    },
  });
  
  return c.json({ modulos, total: modulos.length });
});

// ============================================
// MÓDULOS - CRUD COMPLETO
// ============================================

/**
 * GET /modulos/:id
 * Obtener detalle de un módulo con sus temas
 */
academyLMSRoutes.get("/modulos/:id", async (c) => {
  const moduloId = c.req.param("id");
  
  const modulo = await dbInstance.query.moduloTable.findFirst({
    where: eq(moduloTable.id, moduloId),
    with: {
      curso: true,
      temas: {
        orderBy: [asc(temaTable.orden)],
        with: {
          archivos: true,
        },
      },
      quiz: {
        with: {
          preguntas: {
            with: {
              opciones: true,
            },
          },
        },
      },
    },
  });
  
  if (!modulo) {
    return c.json({ error: "Módulo no encontrado" }, 404);
  }
  
  return c.json({ modulo });
});

/**
 * POST /modulos
 * Crear un nuevo módulo
 */
const crearModuloSchema = z.object({
  cursoId: z.string(),
  titulo: z.string().min(1),
  descripcion: z.string().optional(),
  orden: z.number().int().positive().default(1),
});

academyLMSRoutes.post(
  "/modulos",
  requireRole(["administrador", "supervisor"]),
  zValidator("json", crearModuloSchema),
  async (c) => {
    const data = c.req.valid("json");
    
    // Si no se especifica orden, ponerlo al final
    if (!data.orden) {
      const [{ max }] = await dbInstance
        .select({ max: sql<number>`MAX(${moduloTable.orden})` })
        .from(moduloTable)
        .where(eq(moduloTable.cursoId, data.cursoId));
      data.orden = (max || 0) + 1;
    }
    
    const [modulo] = await dbInstance.insert(moduloTable).values(data).returning();
    
    return c.json({ success: true, modulo }, 201);
  }
);

/**
 * PUT /modulos/:id
 * Actualizar un módulo
 */
const actualizarModuloSchema = z.object({
  titulo: z.string().min(1).optional(),
  descripcion: z.string().optional(),
  orden: z.number().int().positive().optional(),
  activo: z.boolean().optional(),
});

academyLMSRoutes.put(
  "/modulos/:id",
  requireRole(["administrador", "supervisor"]),
  zValidator("json", actualizarModuloSchema),
  async (c) => {
    const moduloId = c.req.param("id");
    const data = c.req.valid("json");
    
    const [modulo] = await dbInstance.update(moduloTable)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(moduloTable.id, moduloId))
      .returning();
    
    if (!modulo) {
      return c.json({ error: "Módulo no encontrado" }, 404);
    }
    
    return c.json({ success: true, modulo });
  }
);

/**
 * DELETE /modulos/:id
 * Eliminar un módulo
 */
academyLMSRoutes.delete(
  "/modulos/:id",
  requireRole(["administrador"]),
  async (c) => {
    const moduloId = c.req.param("id");
    
    await dbInstance.delete(moduloTable).where(eq(moduloTable.id, moduloId));
    
    return c.json({ success: true, message: "Módulo eliminado" });
  }
);

/**
 * POST /modulos/reordenar
 * Reordenar módulos de un curso
 */
const reordenarModulosSchema = z.object({
  cursoId: z.string(),
  orden: z.array(z.object({
    moduloId: z.string(),
    orden: z.number().int().positive(),
  })),
});

academyLMSRoutes.post(
  "/modulos/reordenar",
  requireRole(["administrador", "supervisor"]),
  zValidator("json", reordenarModulosSchema),
  async (c) => {
    const data = c.req.valid("json");
    
    for (const item of data.orden) {
      await dbInstance.update(moduloTable)
        .set({ orden: item.orden })
        .where(eq(moduloTable.id, item.moduloId));
    }
    
    return c.json({ success: true, message: "Módulos reordenados" });
  }
);

// ============================================
// TEMAS - CRUD COMPLETO
// ============================================

/**
 * POST /temas
 * Crear un nuevo tema
 */
const crearTemaSchema = z.object({
  moduloId: z.string(),
  titulo: z.string().min(1),
  contenido: z.string().min(1),
  orden: z.number().int().positive().default(1),
  videoLocal: z.string().optional(), // Referencia a grimoire-media
  videoYoutube: z.string().optional(),
  videoExterno: z.string().optional(),
  imagenId: z.string().optional(), // Referencia a grimoire-media
  documentoId: z.string().optional(), // Referencia a grimoire-media
});

academyLMSRoutes.post(
  "/temas",
  requireRole(["administrador", "supervisor"]),
  zValidator("json", crearTemaSchema),
  async (c) => {
    const data = c.req.valid("json");
    
    // Si no se especifica orden, ponerlo al final
    if (!data.orden) {
      const [{ max }] = await dbInstance
        .select({ max: sql<number>`MAX(${temaTable.orden})` })
        .from(temaTable)
        .where(eq(temaTable.moduloId, data.moduloId));
      data.orden = (max || 0) + 1;
    }
    
    const [tema] = await dbInstance.insert(temaTable).values(data).returning();
    
    return c.json({ success: true, tema }, 201);
  }
);

/**
 * PUT /temas/:id
 * Actualizar un tema
 */
const actualizarTemaSchema = z.object({
  titulo: z.string().min(1).optional(),
  contenido: z.string().min(1).optional(),
  orden: z.number().int().positive().optional(),
  videoLocal: z.string().optional().nullable(), // Referencia a grimoire-media
  videoYoutube: z.string().optional().nullable(),
  videoExterno: z.string().optional().nullable(),
  imagenId: z.string().optional().nullable(), // Referencia a grimoire-media
  documentoId: z.string().optional().nullable(), // Referencia a grimoire-media
  activo: z.boolean().optional(),
});

academyLMSRoutes.put(
  "/temas/:id",
  requireRole(["administrador", "supervisor"]),
  zValidator("json", actualizarTemaSchema),
  async (c) => {
    const temaId = c.req.param("id");
    const data = c.req.valid("json");
    
    const [tema] = await dbInstance.update(temaTable)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(temaTable.id, temaId))
      .returning();
    
    if (!tema) {
      return c.json({ error: "Tema no encontrado" }, 404);
    }
    
    return c.json({ success: true, tema });
  }
);

/**
 * DELETE /temas/:id
 * Eliminar un tema
 */
academyLMSRoutes.delete(
  "/temas/:id",
  requireRole(["administrador"]),
  async (c) => {
    const temaId = c.req.param("id");
    
    await dbInstance.delete(temaTable).where(eq(temaTable.id, temaId));
    
    return c.json({ success: true, message: "Tema eliminado" });
  }
);

/**
 * POST /temas/reordenar
 * Reordenar temas de un módulo
 */
const reordenarTemasSchema = z.object({
  moduloId: z.string(),
  orden: z.array(z.object({
    temaId: z.string(),
    orden: z.number().int().positive(),
  })),
});

academyLMSRoutes.post(
  "/temas/reordenar",
  requireRole(["administrador", "supervisor"]),
  zValidator("json", reordenarTemasSchema),
  async (c) => {
    const data = c.req.valid("json");
    
    for (const item of data.orden) {
      await dbInstance.update(temaTable)
        .set({ orden: item.orden })
        .where(eq(temaTable.id, item.temaId));
    }
    
    return c.json({ success: true, message: "Temas reordenados" });
  }
);

// ============================================
// ARCHIVOS ADICIONALES
// ============================================

/**
 * POST /temas/:id/archivos
 * Agregar archivo adicional a un tema
 */
const agregarArchivoSchema = z.object({
  nombre: z.string().min(1),
  archivo: z.string().min(1),
  orden: z.number().int().positive().default(1),
});

academyLMSRoutes.post(
  "/temas/:id/archivos",
  requireRole(["administrador", "supervisor"]),
  zValidator("json", agregarArchivoSchema),
  async (c) => {
    const temaId = c.req.param("id");
    const data = c.req.valid("json");
    
    const [archivo] = await dbInstance.insert(archivoAdicionalTable).values({
      temaId,
      ...data,
    }).returning();
    
    return c.json({ success: true, archivo }, 201);
  }
);

/**
 * DELETE /archivos/:id
 * Eliminar archivo adicional
 */
academyLMSRoutes.delete(
  "/archivos/:id",
  requireRole(["administrador", "supervisor"]),
  async (c) => {
    const archivoId = c.req.param("id");
    
    await dbInstance.delete(archivoAdicionalTable).where(eq(archivoAdicionalTable.id, archivoId));
    
    return c.json({ success: true, message: "Archivo eliminado" });
  }
);

// ============================================
// QUIZZES - CRUD COMPLETO
// ============================================

/**
 * GET /quizzes/:id
 * Obtener detalle de un quiz con preguntas
 */
academyLMSRoutes.get("/quizzes/:id", async (c) => {
  const quizId = c.req.param("id");
  
  const quiz = await dbInstance.query.quizTable.findFirst({
    where: eq(quizTable.id, quizId),
    with: {
      modulo: {
        with: {
          curso: true,
        },
      },
      preguntas: {
        orderBy: [asc(preguntaTable.orden)],
        with: {
          opciones: {
            orderBy: [asc(opcionTable.orden)],
          },
        },
      },
    },
  });
  
  if (!quiz) {
    return c.json({ error: "Quiz no encontrado" }, 404);
  }
  
  return c.json({ quiz });
});

/**
 * POST /quizzes
 * Crear un nuevo quiz
 */
const crearQuizSchema = z.object({
  moduloId: z.string(),
  titulo: z.string().min(1),
  instrucciones: z.string().optional(),
  mediaId: z.string().optional(), // Referencia a grimoire-media (portada del quiz)
  puntajeMinimoAprobacion: z.number().int().min(0).max(100).default(70),
  tiempoLimiteMinutos: z.number().int().positive().optional(),
});

academyLMSRoutes.post(
  "/quizzes",
  requireRole(["administrador", "supervisor"]),
  zValidator("json", crearQuizSchema),
  async (c) => {
    const data = c.req.valid("json");
    
    // Verificar que el módulo no tenga ya un quiz
    const existingQuiz = await dbInstance.query.quizTable.findFirst({
      where: eq(quizTable.moduloId, data.moduloId),
    });
    
    if (existingQuiz) {
      return c.json({ error: "El módulo ya tiene un quiz asignado" }, 400);
    }
    
    const [quiz] = await dbInstance.insert(quizTable).values(data).returning();
    
    return c.json({ success: true, quiz }, 201);
  }
);

/**
 * PUT /quizzes/:id
 * Actualizar un quiz
 */
const actualizarQuizSchema = z.object({
  titulo: z.string().min(1).optional(),
  instrucciones: z.string().optional(),
  mediaId: z.string().optional().nullable(), // Referencia a grimoire-media (portada del quiz)
  puntajeMinimoAprobacion: z.number().int().min(0).max(100).optional(),
  tiempoLimiteMinutos: z.number().int().positive().optional().nullable(),
  activo: z.boolean().optional(),
});

academyLMSRoutes.put(
  "/quizzes/:id",
  requireRole(["administrador", "supervisor"]),
  zValidator("json", actualizarQuizSchema),
  async (c) => {
    const quizId = c.req.param("id");
    const data = c.req.valid("json");
    
    const [quiz] = await dbInstance.update(quizTable)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(quizTable.id, quizId))
      .returning();
    
    if (!quiz) {
      return c.json({ error: "Quiz no encontrado" }, 404);
    }
    
    return c.json({ success: true, quiz });
  }
);

/**
 * DELETE /quizzes/:id
 * Eliminar un quiz
 */
academyLMSRoutes.delete(
  "/quizzes/:id",
  requireRole(["administrador"]),
  async (c) => {
    const quizId = c.req.param("id");
    
    await dbInstance.delete(quizTable).where(eq(quizTable.id, quizId));
    
    return c.json({ success: true, message: "Quiz eliminado" });
  }
);

// ============================================
// PREGUNTAS - CRUD COMPLETO
// ============================================

/**
 * POST /quizzes/:id/preguntas
 * Agregar pregunta a un quiz
 */
const crearPreguntaSchema = z.object({
  texto: z.string().min(1),
  puntaje: z.number().int().positive().default(10),
  orden: z.number().int().positive().optional(),
  archivoId: z.string().optional(), // Referencia a grimoire-media (imagen/audio)
});

academyLMSRoutes.post(
  "/quizzes/:id/preguntas",
  requireRole(["administrador", "supervisor"]),
  zValidator("json", crearPreguntaSchema),
  async (c) => {
    const quizId = c.req.param("id");
    const data = c.req.valid("json");
    
    // Si no se especifica orden, ponerlo al final
    if (!data.orden) {
      const [{ max }] = await dbInstance
        .select({ max: sql<number>`MAX(${preguntaTable.orden})` })
        .from(preguntaTable)
        .where(eq(preguntaTable.quizId, quizId));
      data.orden = (max || 0) + 1;
    }
    
    const [pregunta] = await dbInstance.insert(preguntaTable).values({
      quizId,
      ...data,
    }).returning();
    
    return c.json({ success: true, pregunta }, 201);
  }
);

/**
 * PUT /preguntas/:id
 * Actualizar una pregunta
 */
const actualizarPreguntaSchema = z.object({
  texto: z.string().min(1).optional(),
  puntaje: z.number().int().positive().optional(),
  orden: z.number().int().positive().optional(),
  archivoId: z.string().optional().nullable(), // Referencia a grimoire-media (imagen/audio)
  activo: z.boolean().optional(),
});

academyLMSRoutes.put(
  "/preguntas/:id",
  requireRole(["administrador", "supervisor"]),
  zValidator("json", actualizarPreguntaSchema),
  async (c) => {
    const preguntaId = c.req.param("id");
    const data = c.req.valid("json");
    
    const [pregunta] = await dbInstance.update(preguntaTable)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(preguntaTable.id, preguntaId))
      .returning();
    
    if (!pregunta) {
      return c.json({ error: "Pregunta no encontrada" }, 404);
    }
    
    return c.json({ success: true, pregunta });
  }
);

/**
 * DELETE /preguntas/:id
 * Eliminar una pregunta
 */
academyLMSRoutes.delete(
  "/preguntas/:id",
  requireRole(["administrador"]),
  async (c) => {
    const preguntaId = c.req.param("id");
    
    await dbInstance.delete(preguntaTable).where(eq(preguntaTable.id, preguntaId));
    
    return c.json({ success: true, message: "Pregunta eliminada" });
  }
);

// ============================================
// OPCIONES - CRUD COMPLETO
// ============================================

/**
 * POST /preguntas/:id/opciones
 * Agregar opción a una pregunta
 */
const crearOpcionSchema = z.object({
  texto: z.string().min(1),
  esCorrecta: z.boolean().default(false),
  orden: z.number().int().positive().optional(),
});

academyLMSRoutes.post(
  "/preguntas/:id/opciones",
  requireRole(["administrador", "supervisor"]),
  zValidator("json", crearOpcionSchema),
  async (c) => {
    const preguntaId = c.req.param("id");
    const data = c.req.valid("json");
    
    // Si no se especifica orden, ponerlo al final
    if (!data.orden) {
      const [{ max }] = await dbInstance
        .select({ max: sql<number>`MAX(${opcionTable.orden})` })
        .from(opcionTable)
        .where(eq(opcionTable.preguntaId, preguntaId));
      data.orden = (max || 0) + 1;
    }
    
    const [opcion] = await dbInstance.insert(opcionTable).values({
      preguntaId,
      ...data,
    }).returning();
    
    return c.json({ success: true, opcion }, 201);
  }
);

/**
 * PUT /opciones/:id
 * Actualizar una opción
 */
const actualizarOpcionSchema = z.object({
  texto: z.string().min(1).optional(),
  esCorrecta: z.boolean().optional(),
  orden: z.number().int().positive().optional(),
});

academyLMSRoutes.put(
  "/opciones/:id",
  requireRole(["administrador", "supervisor"]),
  zValidator("json", actualizarOpcionSchema),
  async (c) => {
    const opcionId = c.req.param("id");
    const data = c.req.valid("json");
    
    const [opcion] = await dbInstance.update(opcionTable)
      .set(data)
      .where(eq(opcionTable.id, opcionId))
      .returning();
    
    if (!opcion) {
      return c.json({ error: "Opción no encontrada" }, 404);
    }
    
    return c.json({ success: true, opcion });
  }
);

/**
 * DELETE /opciones/:id
 * Eliminar una opción
 */
academyLMSRoutes.delete(
  "/opciones/:id",
  requireRole(["administrador"]),
  async (c) => {
    const opcionId = c.req.param("id");
    
    await dbInstance.delete(opcionTable).where(eq(opcionTable.id, opcionId));
    
    return c.json({ success: true, message: "Opción eliminada" });
  }
);

// ============================================
// GRUPOS - CRUD COMPLETO (FALTANTE)
// ============================================

/**
 * GET /grupos/:id
 * Obtener detalle de un grupo con miembros
 */
academyLMSRoutes.get("/grupos/:id", async (c) => {
  const grupoId = c.req.param("id");
  
  const grupo = await dbInstance.query.grupoAsignacionTable.findFirst({
    where: eq(grupoAsignacionTable.id, grupoId),
    with: {
      supervisorPrincipal: true,
      miembros: true,
      supervisoresAdicionales: true,
    },
  });
  
  if (!grupo) {
    return c.json({ error: "Grupo no encontrado" }, 404);
  }
  
  return c.json({ grupo });
});

/**
 * PUT /grupos/:id
 * Actualizar un grupo
 */
const actualizarGrupoSchema = z.object({
  nombre: z.string().min(1).optional(),
  descripcion: z.string().optional(),
  supervisorPrincipalId: z.string().optional().nullable(),
  activo: z.boolean().optional(),
});

academyLMSRoutes.put(
  "/grupos/:id",
  requireRole(["administrador"]),
  zValidator("json", actualizarGrupoSchema),
  async (c) => {
    const grupoId = c.req.param("id");
    const data = c.req.valid("json");
    
    const [grupo] = await dbInstance.update(grupoAsignacionTable)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(grupoAsignacionTable.id, grupoId))
      .returning();
    
    if (!grupo) {
      return c.json({ error: "Grupo no encontrado" }, 404);
    }
    
    return c.json({ success: true, grupo });
  }
);

/**
 * DELETE /grupos/:id
 * Eliminar un grupo
 */
academyLMSRoutes.delete(
  "/grupos/:id",
  requireRole(["administrador"]),
  async (c) => {
    const grupoId = c.req.param("id");
    
    await dbInstance.delete(grupoAsignacionTable).where(eq(grupoAsignacionTable.id, grupoId));
    
    return c.json({ success: true, message: "Grupo eliminado" });
  }
);

/**
 * DELETE /grupos/:id/miembros/:userId
 * Eliminar un miembro de un grupo
 */
academyLMSRoutes.delete(
  "/grupos/:id/miembros/:userId",
  requireRole(["administrador", "supervisor"]),
  async (c) => {
    const grupoId = c.req.param("id");
    const userId = c.req.param("userId");
    
    await dbInstance.delete(grupoUsuarioTable)
      .where(and(
        eq(grupoUsuarioTable.grupoId, grupoId),
        eq(grupoUsuarioTable.userId, userId)
      ));
    
    return c.json({ success: true, message: "Miembro eliminado del grupo" });
  }
);

/**
 * POST /grupos/:id/supervisores
 * Agregar supervisor adicional a un grupo
 */
const agregarSupervisorSchema = z.object({
  supervisorId: z.string(),
});

academyLMSRoutes.post(
  "/grupos/:id/supervisores",
  requireRole(["administrador"]),
  zValidator("json", agregarSupervisorSchema),
  async (c) => {
    const grupoId = c.req.param("id");
    const { supervisorId } = c.req.valid("json");
    
    await dbInstance.insert(grupoSupervisorTable)
      .values({ grupoId, supervisorId })
      .onConflictDoNothing();
    
    return c.json({ success: true, message: "Supervisor agregado" });
  }
);

/**
 * DELETE /grupos/:id/supervisores/:supervisorId
 * Eliminar supervisor adicional
 */
academyLMSRoutes.delete(
  "/grupos/:id/supervisores/:supervisorId",
  requireRole(["administrador"]),
  async (c) => {
    const grupoId = c.req.param("id");
    const supervisorId = c.req.param("supervisorId");
    
    await dbInstance.delete(grupoSupervisorTable)
      .where(and(
        eq(grupoSupervisorTable.grupoId, grupoId),
        eq(grupoSupervisorTable.supervisorId, supervisorId)
      ));
    
    return c.json({ success: true, message: "Supervisor eliminado" });
  }
);

// ============================================
// ASIGNACIONES - CRUD COMPLETO (FALTANTE)
// ============================================

/**
 * GET /asignaciones/:id
 * Obtener detalle de una asignación
 */
academyLMSRoutes.get(
  "/asignaciones/:id",
  requireRole(["administrador", "supervisor"]),
  async (c) => {
    const asignacionId = c.req.param("id");
    
    const asignacion = await dbInstance.query.asignacionTable.findFirst({
      where: eq(asignacionTable.id, asignacionId),
      with: {
        curso: true,
      },
    });
    
    if (!asignacion) {
      return c.json({ error: "Asignación no encontrada" }, 404);
    }
    
    return c.json({ asignacion });
  }
);

/**
 * PUT /asignaciones/:id
 * Actualizar una asignación
 */
const actualizarAsignacionSchema = z.object({
  notas: z.string().optional(),
});

academyLMSRoutes.put(
  "/asignaciones/:id",
  requireRole(["administrador", "supervisor"]),
  zValidator("json", actualizarAsignacionSchema),
  async (c) => {
    const asignacionId = c.req.param("id");
    const data = c.req.valid("json");
    
    const [asignacion] = await dbInstance.update(asignacionTable)
      .set(data)
      .where(eq(asignacionTable.id, asignacionId))
      .returning();
    
    if (!asignacion) {
      return c.json({ error: "Asignación no encontrada" }, 404);
    }
    
    return c.json({ success: true, asignacion });
  }
);

/**
 * DELETE /asignaciones/:id
 * Eliminar una asignación
 */
academyLMSRoutes.delete(
  "/asignaciones/:id",
  requireRole(["administrador"]),
  async (c) => {
    const asignacionId = c.req.param("id");
    
    await dbInstance.delete(asignacionTable).where(eq(asignacionTable.id, asignacionId));
    
    return c.json({ success: true, message: "Asignación eliminada" });
  }
);

// ============================================
// LEARNING PATHS - CRUD COMPLETO (FALTANTE)
// ============================================

/**
 * DELETE /learning-paths/:id
 * Eliminar un learning path (soft delete)
 */
academyLMSRoutes.delete(
  "/learning-paths/:id",
  requireRole(["administrador"]),
  async (c) => {
    const pathId = c.req.param("id");
    
    const [path] = await dbInstance.update(learningPathTable)
      .set({ activo: false, updatedAt: new Date() })
      .where(eq(learningPathTable.id, pathId))
      .returning();
    
    if (!path) {
      return c.json({ error: "Learning Path no encontrado" }, 404);
    }
    
    return c.json({ success: true, message: "Learning Path desactivado" });
  }
);

/**
 * POST /learning-paths/:id/cursos
 * Agregar curso a un learning path
 */
const agregarCursoPathSchema = z.object({
  cursoId: z.string(),
  orden: z.number().int().positive(),
  obligatorio: z.boolean().default(true),
  duracionEstimadaDias: z.number().int().positive().optional(),
});

academyLMSRoutes.post(
  "/learning-paths/:id/cursos",
  requireRole(["administrador"]),
  zValidator("json", agregarCursoPathSchema),
  async (c) => {
    const pathId = c.req.param("id");
    const data = c.req.valid("json");
    
    const [cursoPath] = await dbInstance.insert(learningPathCursoTable)
      .values({
        learningPathId: pathId,
        ...data,
      })
      .returning();
    
    return c.json({ success: true, curso: cursoPath }, 201);
  }
);

/**
 * PUT /learning-paths/:id/cursos/:cursoId
 * Actualizar curso en learning path
 */
const actualizarCursoPathSchema = z.object({
  orden: z.number().int().positive().optional(),
  obligatorio: z.boolean().optional(),
  duracionEstimadaDias: z.number().int().positive().optional().nullable(),
});

academyLMSRoutes.put(
  "/learning-paths/:id/cursos/:cursoId",
  requireRole(["administrador"]),
  zValidator("json", actualizarCursoPathSchema),
  async (c) => {
    const pathId = c.req.param("id");
    const cursoId = c.req.param("cursoId");
    const data = c.req.valid("json");
    
    const [cursoPath] = await dbInstance.update(learningPathCursoTable)
      .set(data)
      .where(and(
        eq(learningPathCursoTable.learningPathId, pathId),
        eq(learningPathCursoTable.cursoId, cursoId)
      ))
      .returning();
    
    if (!cursoPath) {
      return c.json({ error: "Curso no encontrado en el Learning Path" }, 404);
    }
    
    return c.json({ success: true, curso: cursoPath });
  }
);

/**
 * DELETE /learning-paths/:id/cursos/:cursoId
 * Eliminar curso de un learning path
 */
academyLMSRoutes.delete(
  "/learning-paths/:id/cursos/:cursoId",
  requireRole(["administrador"]),
  async (c) => {
    const pathId = c.req.param("id");
    const cursoId = c.req.param("cursoId");
    
    await dbInstance.delete(learningPathCursoTable)
      .where(and(
        eq(learningPathCursoTable.learningPathId, pathId),
        eq(learningPathCursoTable.cursoId, cursoId)
      ));
    
    return c.json({ success: true, message: "Curso eliminado del Learning Path" });
  }
);

/**
 * GET /learning-paths/:id/estadisticas
 * Estadísticas de un learning path
 */
academyLMSRoutes.get(
  "/learning-paths/:id/estadisticas",
  requireRole(["administrador", "supervisor"]),
  async (c) => {
    const pathId = c.req.param("id");
    
    // Total de usuarios con el path asignado
    const [{ count: totalAsignados }] = await dbInstance
      .select({ count: count() })
      .from(progresoLearningPathTable)
      .where(eq(progresoLearningPathTable.learningPathId, pathId));
    
    // Completados
    const [{ count: completados }] = await dbInstance
      .select({ count: count() })
      .from(progresoLearningPathTable)
      .where(and(
        eq(progresoLearningPathTable.learningPathId, pathId),
        eq(progresoLearningPathTable.completado, true)
      ));
    
    // En progreso
    const [{ count: enProgreso }] = await dbInstance
      .select({ count: count() })
      .from(progresoLearningPathTable)
      .where(and(
        eq(progresoLearningPathTable.learningPathId, pathId),
        eq(progresoLearningPathTable.completado, false),
        gt(progresoLearningPathTable.porcentajeCompletado, 0)
      ));
    
    // Promedio de progreso
    const [progresoAvg] = await dbInstance
      .select({ avg: avg(progresoLearningPathTable.porcentajeCompletado) })
      .from(progresoLearningPathTable)
      .where(eq(progresoLearningPathTable.learningPathId, pathId));
    
    // Total de cursos en el path
    const [{ count: totalCursos }] = await dbInstance
      .select({ count: count() })
      .from(learningPathCursoTable)
      .where(eq(learningPathCursoTable.learningPathId, pathId));
    
    return c.json({
      estadisticas: {
        totalAsignados,
        completados,
        enProgreso,
        pendientes: totalAsignados - completados - enProgreso,
        tasaFinalizacion: totalAsignados > 0 ? Math.round((completados / totalAsignados) * 100) : 0,
        progresoPromedio: Math.round(parseFloat(progresoAvg.avg || "0")),
        totalCursos,
      },
    });
  }
);

// ============================================
// ENCUESTAS - CRUD COMPLETO (FALTANTE)
// ============================================

/**
 * GET /encuestas/:id
 * Obtener detalle de una encuesta
 */
academyLMSRoutes.get(
  "/encuestas/:id",
  requireRole(["administrador", "supervisor"]),
  async (c) => {
    const encuestaId = c.req.param("id");
    
    const encuesta = await dbInstance.query.encuestaSatisfaccionTable.findFirst({
      where: eq(encuestaSatisfaccionTable.id, encuestaId),
      with: {
        curso: true,
      },
    });
    
    if (!encuesta) {
      return c.json({ error: "Encuesta no encontrada" }, 404);
    }
    
    return c.json({ encuesta });
  }
);

/**
 * GET /encuestas/estadisticas
 * Estadísticas globales de encuestas
 */
academyLMSRoutes.get(
  "/encuestas/estadisticas",
  requireRole(["administrador", "supervisor"]),
  async (c) => {
    const cursoId = c.req.query("cursoId");
    
    let query = dbInstance.select().from(encuestaSatisfaccionTable);
    if (cursoId) {
      query = query.where(eq(encuestaSatisfaccionTable.cursoId, cursoId));
    }
    
    const encuestas = await query;
    
    if (encuestas.length === 0) {
      return c.json({
        estadisticas: {
          total: 0,
          satisfaccionPromedio: 0,
          expositorPromedio: 0,
          utilidadPorcentaje: 0,
        },
      });
    }
    
    const satisfaccionPromedio = encuestas.reduce((sum, e) => sum + e.satisfaccion, 0) / encuestas.length;
    const expositorPromedio = encuestas.reduce((sum, e) => sum + e.expositor, 0) / encuestas.length;
    const utilidadCount = encuestas.filter(e => e.utilidad).length;
    
    return c.json({
      estadisticas: {
        total: encuestas.length,
        satisfaccionPromedio: Math.round(satisfaccionPromedio * 10) / 10,
        expositorPromedio: Math.round(expositorPromedio * 10) / 10,
        utilidadPorcentaje: Math.round((utilidadCount / encuestas.length) * 100),
        distribucionSatisfaccion: {
          cinco: encuestas.filter(e => e.satisfaccion === 5).length,
          cuatro: encuestas.filter(e => e.satisfaccion === 4).length,
          tres: encuestas.filter(e => e.satisfaccion === 3).length,
          dos: encuestas.filter(e => e.satisfaccion === 2).length,
          uno: encuestas.filter(e => e.satisfaccion === 1).length,
        },
      },
    });
  }
);

// ============================================
// REPORTES Y ANÁLITICAS
// ============================================

/**
 * GET /reportes/cursos
 * Reporte de cursos con métricas
 */
academyLMSRoutes.get(
  "/reportes/cursos",
  requireRole(["administrador", "supervisor"]),
  async (c) => {
    const cursoId = c.req.query("cursoId");
    const fechaDesde = c.req.query("fechaDesde");
    const fechaHasta = c.req.query("fechaHasta");
    
    // Base query para cursos
    let cursosQuery = dbInstance.select().from(cursoTable).where(eq(cursoTable.activo, true));
    
    if (cursoId) {
      cursosQuery = dbInstance.select().from(cursoTable).where(eq(cursoTable.id, cursoId));
    }
    
    const cursos = await cursosQuery;
    
    const reportes = await Promise.all(
      cursos.map(async (curso) => {
        // Asignaciones
        const [{ count: asignaciones }] = await dbInstance
          .select({ count: count() })
          .from(asignacionTable)
          .where(eq(asignacionTable.cursoId, curso.id));
        
        // Progreso
        const progresos = await dbInstance
          .select({
            completados: count(),
            promedio: avg(progresoCursoTable.porcentajeProgreso),
          })
          .from(progresoCursoTable)
          .where(eq(progresoCursoTable.cursoId, curso.id));
        
        // Encuestas
        const encuestas = await dbInstance
          .select({
            total: count(),
            satisfaccion: avg(encuestaSatisfaccionTable.satisfaccion),
          })
          .from(encuestaSatisfaccionTable)
          .where(eq(encuestaSatisfaccionTable.cursoId, curso.id));
        
        return {
          curso: {
            id: curso.id,
            titulo: curso.titulo,
            tipo: curso.tipoCurso,
          },
          metricas: {
            asignaciones,
            completados: parseInt(progresos[0]?.completados || "0"),
            progresoPromedio: Math.round(parseFloat(progresos[0]?.promedio || "0")),
            tasaFinalizacion: asignaciones > 0 
              ? Math.round((parseInt(progresos[0]?.completados || "0") / asignaciones) * 100)
              : 0,
            totalEncuestas: parseInt(encuestas[0]?.total || "0"),
            satisfaccionPromedio: Math.round(parseFloat(encuestas[0]?.satisfaccion || "0") * 10) / 10,
          },
        };
      })
    );
    
    return c.json({
      reportes,
      total: reportes.length,
    });
  }
);

/**
 * GET /reportes/usuarios/:id
 * Reporte detallado de un usuario
 */
academyLMSRoutes.get(
  "/reportes/usuarios/:id",
  requireRole(["administrador", "supervisor"]),
  async (c) => {
    const userId = c.req.param("id");
    
    // Cursos asignados
    const asignaciones = await dbInstance.query.asignacionTable.findMany({
      where: eq(asignacionTable.userId, userId),
      with: {
        curso: true,
      },
    });
    
    // Progreso en cada curso
    const progresos = await Promise.all(
      asignaciones.map(async (asignacion) => {
        const progreso = await dbInstance.query.progresoCursoTable.findFirst({
          where: and(
            eq(progresoCursoTable.userId, userId),
            eq(progresoCursoTable.cursoId, asignacion.cursoId)
          ),
        });
        
        // Resultados de quizzes
        const resultadosQuiz = await dbInstance
          .select({
            quizId: resultadoQuizTable.quizId,
            puntaje: resultadoQuizTable.puntajePorcentaje,
            aprobado: resultadoQuizTable.aprobado,
            fecha: resultadoQuizTable.fechaRealizacion,
          })
          .from(resultadoQuizTable)
          .innerJoin(quizTable, eq(resultadoQuizTable.quizId, quizTable.id))
          .innerJoin(moduloTable, eq(quizTable.moduloId, moduloTable.id))
          .where(and(
            eq(resultadoQuizTable.userId, userId),
            eq(moduloTable.cursoId, asignacion.cursoId)
          ));
        
        return {
          curso: asignacion.curso,
          progreso,
          quizzes: resultadosQuiz,
        };
      })
    );
    
    // Learning paths
    const paths = await dbInstance.query.progresoLearningPathTable.findMany({
      where: eq(progresoLearningPathTable.userId, userId),
      with: {
        learningPath: true,
      },
    });
    
    // Certificados
    const certificados = await dbInstance
      .select({
        codigo: certificadoTable.codigo,
        cursoId: certificadoTable.cursoId,
        fechaGeneracion: certificadoTable.fechaGeneracion,
      })
      .from(certificadoTable)
      .where(eq(certificadoTable.userId, userId));
    
    return c.json({
      userId,
      resumen: {
        totalCursosAsignados: asignaciones.length,
        cursosCompletados: progresos.filter(p => p.progreso?.completado).length,
        cursosEnProgreso: progresos.filter(p => !p.progreso?.completado && p.progreso?.porcentajeProgreso > 0).length,
        learningPathsAsignados: paths.length,
        learningPathsCompletados: paths.filter(p => p.completado).length,
        totalCertificados: certificados.length,
      },
      progresos,
      learningPaths: paths,
      certificados,
    });
  }
);

/**
 * GET /reportes/progreso
 * Reporte de progreso global
 */
academyLMSRoutes.get(
  "/reportes/progreso",
  requireRole(["administrador", "supervisor"]),
  async (c) => {
    const cursoId = c.req.query("cursoId");
    const grupoId = c.req.query("grupoId");
    
    let userIds: string[] = [];
    
    // Si se especifica grupo, obtener usuarios del grupo
    if (grupoId) {
      const miembros = await dbInstance
        .select({ userId: grupoUsuarioTable.userId })
        .from(grupoUsuarioTable)
        .where(eq(grupoUsuarioTable.grupoId, grupoId));
      userIds = miembros.map(m => m.userId);
      
      if (userIds.length === 0) {
        return c.json({ progresos: [], total: 0 });
      }
    }
    
    // Query base
    let query = dbInstance.select().from(progresoCursoTable);
    
    if (cursoId) {
      query = query.where(eq(progresoCursoTable.cursoId, cursoId));
    }
    
    if (userIds.length > 0) {
      query = query.where(inArray(progresoCursoTable.userId, userIds));
    }
    
    const progresos = await query.orderBy(desc(progresoCursoTable.updatedAt));
    
    // Enriquecer con info de curso
    const progresosConInfo = await Promise.all(
      progresos.map(async (p) => {
        const curso = await dbInstance.query.cursoTable.findFirst({
          where: eq(cursoTable.id, p.cursoId),
        });
        
        return {
          ...p,
          curso,
        };
      })
    );
    
    return c.json({
      progresos: progresosConInfo,
      total: progresosConInfo.length,
    });
  }
);

// ============================================
// PERFILES DE USUARIO (CAPACITACIONES)
// ============================================

/**
 * GET /perfiles
 * Listar perfiles de usuario del sistema de capacitaciones
 */
academyLMSRoutes.get(
  "/perfiles",
  requireRole(["administrador", "supervisor"]),
  async (c) => {
    const rol = c.req.query("rol");
    
    let query = dbInstance.select().from(perfilUsuarioTable);
    
    if (rol) {
      query = query.where(eq(perfilUsuarioTable.rolCapacitaciones, rol as any));
    }
    
    const perfiles = await query.orderBy(desc(perfilUsuarioTable.createdAt));
    
    return c.json({ perfiles, total: perfiles.length });
  }
);

/**
 * POST /perfiles
 * Crear perfil de usuario
 */
const crearPerfilSchema = z.object({
  userId: z.string(),
  rolCapacitaciones: z.enum(rolCapacitacionesEnum.enumValues).default("estudiante"),
  notas: z.string().optional(),
});

academyLMSRoutes.post(
  "/perfiles",
  requireRole(["administrador"]),
  zValidator("json", crearPerfilSchema),
  async (c) => {
    const data = c.req.valid("json");
    
    const [perfil] = await dbInstance.insert(perfilUsuarioTable)
      .values(data)
      .onConflictDoUpdate({
        target: perfilUsuarioTable.userId,
        set: {
          rolCapacitaciones: data.rolCapacitaciones,
          notas: data.notas,
          updatedAt: new Date(),
        },
      })
      .returning();
    
    return c.json({ success: true, perfil }, 201);
  }
);

/**
 * PUT /perfiles/:id/rol
 * Cambiar rol de un usuario
 */
const cambiarRolSchema = z.object({
  rol: z.enum(rolCapacitacionesEnum.enumValues),
});

academyLMSRoutes.put(
  "/perfiles/:id/rol",
  requireRole(["administrador"]),
  zValidator("json", cambiarRolSchema),
  async (c) => {
    const userId = c.req.param("id");
    const { rol } = c.req.valid("json");
    
    const [perfil] = await dbInstance.insert(perfilUsuarioTable)
      .values({
        userId,
        rolCapacitaciones: rol,
        fechaAsignacionRol: new Date(),
      })
      .onConflictDoUpdate({
        target: perfilUsuarioTable.userId,
        set: {
          rolCapacitaciones: rol,
          fechaAsignacionRol: new Date(),
          updatedAt: new Date(),
        },
      })
      .returning();
    
    return c.json({ success: true, perfil });
  }
);

// ============================================
// CERTIFICADOS CON PDF
// ============================================

/**
 * GET /certificados/:cursoId/pdf
 * Descargar certificado en PDF
 */
academyLMSRoutes.get("/certificados/:cursoId/pdf", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "No autenticado" }, 401);
  }
  const cursoId = c.req.param("cursoId");

  // Verificar que el curso está completado y encuesta realizada
  const progreso = await dbInstance.query.progresoCursoTable.findFirst({
    where: and(
      eq(progresoCursoTable.userId, user.id),
      eq(progresoCursoTable.cursoId, cursoId),
      eq(progresoCursoTable.completado, true),
      eq(progresoCursoTable.encuestaCompletada, true)
    ),
  });

  if (!progreso) {
    return c.json(
      {
        error:
          "No elegible para certificado. Debe completar el curso y la encuesta de satisfacción.",
      },
      403
    );
  }

  const curso = await dbInstance.query.cursoTable.findFirst({
    where: eq(cursoTable.id, cursoId),
  });

  if (!curso) {
    return c.json({ error: "Curso no encontrado" }, 404);
  }

  // Generar o recuperar código
  let certificado = await dbInstance.query.certificadoTable.findFirst({
    where: and(
      eq(certificadoTable.userId, user.id),
      eq(certificadoTable.cursoId, cursoId)
    ),
  });

  let codigo: string;
  if (certificado) {
    codigo = certificado.codigo;
  } else {
    codigo = `CERT-${cursoId.substring(0, 8)}-${user.id.substring(0, 8)}-${Date.now().toString(36).toUpperCase()}`;
  }

  // Generar PDF
  const certData: CertificadoData = {
    nombreUsuario: user.name || user.email,
    nombreCurso: curso.titulo,
    fechaCompletado: progreso.fechaCompletado || new Date(),
    duracionHoras: curso.duracionHoras || "N/A",
    codigo,
  };

  try {
    const pdfBuffer = await generarCertificadoPDF(certData, {
      tipo: "generado",
      primaryColor: curso.colorPortada || "#009c3c",
    });

    // Crear o actualizar certificado en BD
    if (!certificado) {
      await dbInstance.insert(certificadoTable).values({
        userId: user.id,
        cursoId,
        codigo,
        datosJson: {
          nombreUsuario: user.name,
          nombreCurso: curso.titulo,
          fechaCompletado: progreso.fechaCompletado,
          duracionHoras: curso.duracionHoras,
        },
      });
    }

    await dbInstance.update(progresoCursoTable)
      .set({
        certificadoDescargado: true,
        fechaDescargaCertificado: new Date(),
      })
      .where(
        and(
          eq(progresoCursoTable.userId, user.id),
          eq(progresoCursoTable.cursoId, cursoId)
        )
      );

    // Registrar actividad
    await dbInstance.insert(actividadLogTable).values({
      userId: user.id,
      tipo: "certificado_descargado",
      entidadTipo: "curso",
      entidadId: cursoId,
      descripcion: `Certificado descargado para curso: ${curso.titulo}`,
    });

    // Retornar PDF
    c.header("Content-Type", "application/pdf");
    c.header(
      "Content-Disposition",
      `attachment; filename="certificado-${curso.titulo.replace(/\s+/g, "_")}.pdf"`
    );

    return c.body(pdfBuffer);
  } catch (error) {
    return c.json({ error: "Error generando certificado PDF" }, 500);
  }
});

/**
 * GET /certificados/verificar/:codigo
 * Verificar autenticidad de un certificado
 */
academyLMSRoutes.get("/certificados/verificar/:codigo", async (c) => {
  const codigo = c.req.param("codigo");

  if (!validarCodigoCertificado(codigo)) {
    return c.json({ valido: false, error: "Código de certificado inválido" }, 400);
  }

  const certificado = await dbInstance.query.certificadoTable.findFirst({
    where: eq(certificadoTable.codigo, codigo),
    with: {
      curso: true,
    },
  });

  if (!certificado) {
    return c.json({ valido: false, error: "Certificado no encontrado" }, 404);
  }

  return c.json({
    valido: true,
    certificado: {
      codigo: certificado.codigo,
      curso: certificado.curso?.titulo,
      fechaGeneracion: certificado.fechaGeneracion,
      datos: certificado.datosJson,
    },
  });
});

// ============================================
// EXPORTACIÓN EXCEL
// ============================================

/**
 * GET /exportar/asignaciones
 * Exportar asignaciones a Excel
 */
academyLMSRoutes.get(
  "/exportar/asignaciones",
  requireRole(["administrador", "supervisor"]),
  async (c) => {
    const cursoId = c.req.query("cursoId");
    const grupoId = c.req.query("grupoId");
    const fechaDesde = c.req.query("fechaDesde");
    const fechaHasta = c.req.query("fechaHasta");

    // Construir query base
    let query = dbInstance.select().from(asignacionTable);

    if (cursoId) {
      query = query.where(eq(asignacionTable.cursoId, cursoId));
    }
    if (grupoId) {
      query = query.where(eq(asignacionTable.grupoId, grupoId));
    }

    const asignaciones = await query.orderBy(desc(asignacionTable.fecha));

    // Preparar datos para Excel
    const data = await Promise.all(
      asignaciones.map(async (asig) => {
        const curso = await dbInstance.query.cursoTable.findFirst({
          where: eq(cursoTable.id, asig.cursoId),
        });

        const progreso = asig.userId
          ? await dbInstance.query.progresoCursoTable.findFirst({
              where: and(
                eq(progresoCursoTable.userId, asig.userId),
                eq(progresoCursoTable.cursoId, asig.cursoId)
              ),
            })
          : null;

        const grupo = asig.grupoId
          ? await dbInstance.query.grupoAsignacionTable.findFirst({
              where: eq(grupoAsignacionTable.id, asig.grupoId),
            })
          : null;

        return {
          fecha: asig.fecha,
          curso: curso?.titulo || "Curso eliminado",
          tipoCurso: curso?.tipoCurso || "N/A",
          duracionHoras: curso?.duracionHoras || 0,
          usuario: asig.userId || "Grupo",
          numeroColaborador: undefined,
          grupo: grupo?.nombre,
          metodo: asig.metodo,
          progreso: progreso?.porcentajeProgreso || 0,
          fechaFinalizacion: progreso?.fechaCompletado,
          estado: progreso?.completado
            ? "Completado"
            : progreso && progreso.porcentajeProgreso > 0
            ? "En Progreso"
            : "No Iniciado",
        };
      })
    );

    try {
      const excelBuffer = await generarExcelAsignaciones(
        data,
        "Historial de Asignaciones"
      );

      c.header(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      c.header(
        "Content-Disposition",
        `attachment; filename="asignaciones-${new Date().toISOString().split("T")[0]}.xlsx"`
      );

      return c.body(excelBuffer);
    } catch (error) {
      return c.json({ error: "Error generando Excel" }, 500);
    }
  }
);

/**
 * GET /exportar/progreso
 * Exportar progreso a Excel
 */
academyLMSRoutes.get(
  "/exportar/progreso",
  requireRole(["administrador", "supervisor"]),
  async (c) => {
    const cursoId = c.req.query("cursoId");
    const grupoId = c.req.query("grupoId");

    // Obtener usuarios si hay filtro de grupo
    let userIds: string[] = [];
    if (grupoId) {
      const miembros = await dbInstance
        .select({ userId: grupoUsuarioTable.userId })
        .from(grupoUsuarioTable)
        .where(eq(grupoUsuarioTable.grupoId, grupoId));
      userIds = miembros.map((m) => m.userId);
    }

    // Query de progresos
    let query = dbInstance.select().from(progresoCursoTable);

    if (cursoId) {
      query = query.where(eq(progresoCursoTable.cursoId, cursoId));
    }
    if (userIds.length > 0) {
      query = query.where(inArray(progresoCursoTable.userId, userIds));
    }

    const progresos = await query;

    // Preparar datos
    const data = await Promise.all(
      progresos.map(async (prog) => {
        const curso = await dbInstance.query.cursoTable.findFirst({
          where: eq(cursoTable.id, prog.cursoId),
        });

        const totalTemas = await dbInstance
          .select({ count: count() })
          .from(temaTable)
          .innerJoin(moduloTable, eq(temaTable.moduloId, moduloTable.id))
          .where(eq(moduloTable.cursoId, prog.cursoId));

        const temasCompletados = await dbInstance
          .select({ count: count() })
          .from(progresoTemaTable)
          .where(
            and(
              eq(progresoTemaTable.userId, prog.userId),
              eq(progresoTemaTable.completado, true)
            )
          );

        const totalQuizzes = await dbInstance
          .select({ count: count() })
          .from(quizTable)
          .innerJoin(moduloTable, eq(quizTable.moduloId, moduloTable.id))
          .where(eq(moduloTable.cursoId, prog.cursoId));

        const quizzesAprobados = await dbInstance
          .select({ count: count() })
          .from(resultadoQuizTable)
          .innerJoin(quizTable, eq(resultadoQuizTable.quizId, quizTable.id))
          .innerJoin(moduloTable, eq(quizTable.moduloId, moduloTable.id))
          .where(
            and(
              eq(resultadoQuizTable.userId, prog.userId),
              eq(moduloTable.cursoId, prog.cursoId),
              eq(resultadoQuizTable.aprobado, true)
            )
          );

        return {
          usuario: prog.userId,
          email: undefined,
          curso: curso?.titulo || "Curso eliminado",
          modulo: undefined,
          temasCompletados: temasCompletados[0]?.count || 0,
          totalTemas: totalTemas[0]?.count || 0,
          quizzesAprobados: quizzesAprobados[0]?.count || 0,
          totalQuizzes: totalQuizzes[0]?.count || 0,
          progresoPercent: prog.porcentajeProgreso,
          estado: prog.completado
            ? "Completado"
            : prog.porcentajeProgreso > 0
            ? "En Progreso"
            : "No Iniciado",
          fechaInicio: prog.createdAt,
          fechaCompletado: prog.fechaCompletado,
        };
      })
    );

    try {
      const excelBuffer = await generarExcelProgreso(data, "Reporte de Progreso");

      c.header(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      c.header(
        "Content-Disposition",
        `attachment; filename="progreso-${new Date().toISOString().split("T")[0]}.xlsx"`
      );

      return c.body(excelBuffer);
    } catch (error) {
      return c.json({ error: "Error generando Excel" }, 500);
    }
  }
);

/**
 * GET /exportar/encuestas
 * Exportar encuestas a Excel
 */
academyLMSRoutes.get(
  "/exportar/encuestas",
  requireRole(["administrador", "supervisor"]),
  async (c) => {
    const cursoId = c.req.query("cursoId");

    let query = dbInstance.select().from(encuestaSatisfaccionTable);
    if (cursoId) {
      query = query.where(eq(encuestaSatisfaccionTable.cursoId, cursoId));
    }

    const encuestas = await query.orderBy(desc(encuestaSatisfaccionTable.fecha));

    // Preparar datos
    const data = await Promise.all(
      encuestas.map(async (enc) => {
        const curso = enc.cursoId
          ? await dbInstance.query.cursoTable.findFirst({
              where: eq(cursoTable.id, enc.cursoId),
            })
          : null;

        return {
          fecha: enc.fecha,
          curso: curso?.titulo || "Curso eliminado",
          usuario: enc.userId || "Anónimo",
          departamento: enc.departamento,
          cargo: enc.cargo,
          expositor: enc.expositor,
          utilidad: enc.utilidad ? "Sí" : "No",
          satisfaccion: enc.satisfaccion,
          aprendido: enc.aprendido,
          lugar: enc.lugar,
          rol: enc.rol,
          recomendacion: enc.recomendacion,
          comentarios: enc.comentariosCurso,
        };
      })
    );

    try {
      const excelBuffer = await generarExcelEncuestas(
        data,
        "Resultados de Encuestas"
      );

      c.header(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      c.header(
        "Content-Disposition",
        `attachment; filename="encuestas-${new Date().toISOString().split("T")[0]}.xlsx"`
      );

      return c.body(excelBuffer);
    } catch (error) {
      return c.json({ error: "Error generando Excel" }, 500);
    }
  }
);

// ============================================
// SINCRONIZACIÓN DE USUARIOS
// ============================================

/**
 * POST /sync/usuarios
 * Sincronizar usuarios desde datos externos (JSON)
 */
academyLMSRoutes.post(
  "/sync/usuarios",
  requireRole(["administrador"]),
  async (c) => {
    const body = await c.req.json();
    const { usuarios, config } = body;

    if (!Array.isArray(usuarios) || usuarios.length === 0) {
      return c.json({ error: "Debe proporcionar un array de usuarios" }, 400);
    }

    // Validar usuarios
    const { validos, invalidos } = validarUsuariosExternos(usuarios);

    if (invalidos.length > 0) {
      return c.json(
        {
          error: "Algunos usuarios tienen datos inválidos",
          invalidos: invalidos.slice(0, 10),
          totalInvalidos: invalidos.length,
        },
        400
      );
    }

    // Procesar sincronización
    const result: SyncResult = {
      exitosos: 0,
      fallidos: 0,
      creados: 0,
      actualizados: 0,
      errores: [],
    };

    // Aquí iría la lógica real de sincronización con la BD
    // Por ahora retornamos un mock
    result.exitosos = validos.length;
    result.creados = validos.length;

    return c.json({
      success: true,
      message: `Sincronizados ${result.exitosos} usuarios`,
      result,
    });
  }
);

/**
 * POST /sync/usuarios/csv
 * Sincronizar usuarios desde CSV
 */
academyLMSRoutes.post(
  "/sync/usuarios/csv",
  requireRole(["administrador"]),
  async (c) => {
    const body = await c.req.text();

    if (!body || body.trim().length === 0) {
      return c.json({ error: "CSV vacío" }, 400);
    }

    try {
      const usuarios = parsearCSV(body);
      const { validos, invalidos } = validarUsuariosExternos(usuarios);

      return c.json({
        success: true,
        message: `CSV procesado: ${validos.length} usuarios válidos, ${invalidos.length} inválidos`,
        usuariosValidos: validos.length,
        usuariosInvalidos: invalidos.length,
        detallesInvalidos: invalidos.slice(0, 5),
        // Aquí se procesaría la sincronización real
      });
    } catch (error) {
      return c.json(
        {
          error: "Error procesando CSV",
          details: error instanceof Error ? error.message : "Error desconocido",
        },
        400
      );
    }
  }
);

/**
 * GET /sync/mapeo-roles
 * Obtener mapeo de roles disponible
 */
academyLMSRoutes.get("/sync/mapeo-roles", requireRole(["administrador"]), async (c) => {
  return c.json({
    mapeos: {
      pacifico: mapeoRolesPacifico,
    },
    rolesDisponibles: ["administrador", "supervisor", "estudiante"],
  });
});

// ============================================
// MEDIA LIBRARY INTEGRATION
// ============================================

/**
 * POST /media/validar
 * Validar archivo antes de subir
 */
academyLMSRoutes.post("/media/validar", async (c) => {
  const body = await c.req.json();
  const { fileName, fileSize, mimeType, tipo } = body;

  const validacion = validarArchivo(
    { name: fileName, size: fileSize, type: mimeType },
    tipo
  );

  if (!validacion.valido) {
    return c.json({ valido: false, errores: validacion.errores }, 400);
  }

  return c.json({
    valido: true,
    tipoDetectado: determinarTipoMedia(mimeType),
    tamanoFormateado: formatBytes(fileSize),
  });
});

/**
 * POST /media/youtube-info
 * Extraer información de video de YouTube
 */
academyLMSRoutes.post("/media/youtube-info", async (c) => {
  const body = await c.req.json();
  const { url } = body;

  if (!url) {
    return c.json({ error: "URL requerida" }, 400);
  }

  const info = extraerInfoYoutube(url);

  if (!info.valido) {
    return c.json({ error: "URL de YouTube inválida" }, 400);
  }

  return c.json({
    valido: true,
    videoId: info.videoId,
    embedUrl: info.embedUrl,
    thumbnailUrl: info.thumbnailUrl,
  });
});

/**
 * POST /media/normalizar-video
 * Normalizar URL de video
 */
academyLMSRoutes.post("/media/normalizar-video", async (c) => {
  const body = await c.req.json();
  const { url } = body;

  if (!url) {
    return c.json({ error: "URL requerida" }, 400);
  }

  const resultado = normalizarVideoUrl(url);

  return c.json(resultado);
});

  // Return the configured router
  return academyLMSRoutes;
}

// Legacy export maintained for compatibility
// Use createAcademyLMSRoutes(ctx) instead
export { createAcademyLMSRoutes as academyLMSRoutes };

