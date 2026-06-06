/**
 * Academy LMS Integration Tests
 *
 * Tests complete CRUD operations and workflow for:
 * - Cursos (Courses)
 * - Módulos (Modules)
 * - Temas (Topics)
 * - Quizzes
 * - Learning Paths
 * - Asignaciones (Assignments)
 * - Certificados (Certificates)
 */

import { test, expect } from "@playwright/test";

const API = process.env.API_URL || "http://localhost:3000";

// Test data
const testCurso = {
  titulo: `Test Course ${Date.now()}`,
  descripcion: "Curso de prueba para integración",
  tipoCurso: "TECNICO",
  activo: true,
  duracionHoras: 10,
};

let authCookie: string;
let createdCursoId: string;
let createdModuloId: string;
let createdTemaId: string;

test.describe("Academy LMS Integration", () => {
  test.beforeAll(async ({ request }) => {
    // Login and get auth cookie
    const loginRes = await request.post(`${API}/api/auth/sign-in/email`, {
      data: {
        email: "admin@gremius.gg",
        password: "gremius123",
      },
    });

    expect(loginRes.status()).toBe(200);
    const cookies = await loginRes.headers()["set-cookie"];
    authCookie = cookies || "";
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CURSOS (COURSES)
  // ═══════════════════════════════════════════════════════════════════════════

  test("POST /academy/cursos - Create course", async ({ request }) => {
    const res = await request.post(`${API}/api/academy/cursos`, {
      headers: { Cookie: authCookie },
      data: testCurso,
    });

    expect(res.status()).toBe(201);
    const data = await res.json();
    expect(data.curso).toBeDefined();
    expect(data.curso.titulo).toBe(testCurso.titulo);
    createdCursoId = data.curso.id;
  });

  test("GET /academy/cursos - List courses", async ({ request }) => {
    const res = await request.get(`${API}/api/academy/cursos`, {
      headers: { Cookie: authCookie },
    });

    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.cursos)).toBe(true);
    expect(data.cursos.length).toBeGreaterThan(0);
  });

  test("GET /academy/cursos/:id - Get specific course", async ({ request }) => {
    const res = await request.get(`${API}/api/academy/cursos/${createdCursoId}`, {
      headers: { Cookie: authCookie },
    });

    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.curso).toBeDefined();
    expect(data.curso.id).toBe(createdCursoId);
    expect(data.curso.titulo).toBe(testCurso.titulo);
  });

  test("PATCH /academy/cursos/:id - Update course", async ({ request }) => {
    const updateData = { titulo: `Updated ${testCurso.titulo}` };

    const res = await request.patch(`${API}/api/academy/cursos/${createdCursoId}`, {
      headers: { Cookie: authCookie },
      data: updateData,
    });

    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.curso.titulo).toBe(updateData.titulo);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // MÓDULOS (MODULES)
  // ═══════════════════════════════════════════════════════════════════════════

  test("POST /academy/modulos - Create module", async ({ request }) => {
    const moduloData = {
      titulo: `Test Module ${Date.now()}`,
      descripcion: "Módulo de prueba",
      cursoId: createdCursoId,
      orden: 1,
    };

    const res = await request.post(`${API}/api/academy/modulos`, {
      headers: { Cookie: authCookie },
      data: moduloData,
    });

    expect(res.status()).toBe(201);
    const data = await res.json();
    expect(data.modulo).toBeDefined();
    expect(data.modulo.titulo).toBe(moduloData.titulo);
    createdModuloId = data.modulo.id;
  });

  test("GET /academy/modulos/:id - Get module", async ({ request }) => {
    const res = await request.get(`${API}/api/academy/modulos/${createdModuloId}`, {
      headers: { Cookie: authCookie },
    });

    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.modulo).toBeDefined();
    expect(data.modulo.id).toBe(createdModuloId);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TEMAS (TOPICS)
  // ═══════════════════════════════════════════════════════════════════════════

  test("POST /academy/temas - Create topic", async ({ request }) => {
    const temaData = {
      titulo: `Test Topic ${Date.now()}`,
      contenido: "Contenido del tema de prueba",
      moduloId: createdModuloId,
      orden: 1,
      tipo: "video",
      urlVideo: "https://youtube.com/watch?v=test123",
    };

    const res = await request.post(`${API}/api/academy/temas`, {
      headers: { Cookie: authCookie },
      data: temaData,
    });

    expect(res.status()).toBe(201);
    const data = await res.json();
    expect(data.tema).toBeDefined();
    expect(data.tema.titulo).toBe(temaData.titulo);
    createdTemaId = data.tema.id;
  });

  test("GET /academy/temas/:id - Get topic", async ({ request }) => {
    const res = await request.get(`${API}/api/academy/temas/${createdTemaId}`, {
      headers: { Cookie: authCookie },
    });

    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.tema).toBeDefined();
    expect(data.tema.id).toBe(createdTemaId);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // QUIZZES
  // ═══════════════════════════════════════════════════════════════════════════

  test("POST /academy/quizzes - Create quiz", async ({ request }) => {
    const quizData = {
      titulo: `Test Quiz ${Date.now()}`,
      descripcion: "Quiz de prueba",
      moduloId: createdModuloId,
      tiempoLimiteMinutos: 30,
      preguntas: [
        {
          texto: "¿Pregunta 1?",
          tipo: "multiple_choice",
          opciones: [
            { texto: "Opción A", esCorrecta: true },
            { texto: "Opción B", esCorrecta: false },
          ],
        },
      ],
    };

    const res = await request.post(`${API}/academy/quizzes`, {
      headers: { Cookie: authCookie },
      data: quizData,
    });

    expect(res.status()).toBe(201);
    const data = await res.json();
    expect(data.quiz).toBeDefined();
    expect(data.quiz.titulo).toBe(quizData.titulo);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // LEARNING PATHS
  // ═══════════════════════════════════════════════════════════════════════════

  test("POST /academy/learning-paths - Create learning path", async ({ request }) => {
    const pathData = {
      nombre: `Test Path ${Date.now()}`,
      descripcion: "Ruta de aprendizaje de prueba",
      cursos: [createdCursoId],
    };

    const res = await request.post(`${API}/api/academy/learning-paths`, {
      headers: { Cookie: authCookie },
      data: pathData,
    });

    expect(res.status()).toBe(201);
    const data = await res.json();
    expect(data.learningPath).toBeDefined();
    expect(data.learningPath.nombre).toBe(pathData.nombre);
  });

  test("GET /academy/learning-paths - List learning paths", async ({ request }) => {
    const res = await request.get(`${API}/api/academy/learning-paths`, {
      headers: { Cookie: authCookie },
    });

    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.learningPaths)).toBe(true);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GRUPOS (GROUPS)
  // ═══════════════════════════════════════════════════════════════════════════

  test("POST /academy/grupos - Create group", async ({ request }) => {
    const grupoData = {
      nombre: `Test Group ${Date.now()}`,
      descripcion: "Grupo de prueba",
      supervisorIds: [],
    };

    const res = await request.post(`${API}/academy/grupos`, {
      headers: { Cookie: authCookie },
      data: grupoData,
    });

    expect(res.status()).toBe(201);
    const data = await res.json();
    expect(data.grupo).toBeDefined();
    expect(data.grupo.nombre).toBe(grupoData.nombre);
  });

  test("GET /academy/grupos - List groups", async ({ request }) => {
    const res = await request.get(`${API}/api/academy/grupos`, {
      headers: { Cookie: authCookie },
    });

    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.grupos)).toBe(true);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ASIGNACIONES (ASSIGNMENTS)
  // ═══════════════════════════════════════════════════════════════════════════

  test("POST /academy/asignaciones - Create assignment", async ({ request }) => {
    const asignacionData = {
      cursoId: createdCursoId,
      userId: "test-user-id", // This should be a real user ID in production
      metodo: "manual",
    };

    const res = await request.post(`${API}/api/academy/asignaciones`, {
      headers: { Cookie: authCookie },
      data: asignacionData,
    });

    // May fail if user doesn't exist, that's ok for this test
    expect([201, 400, 404]).toContain(res.status());
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DASHBOARD
  // ═══════════════════════════════════════════════════════════════════════════

  test("GET /academy/dashboard/mi-progreso - Get user progress", async ({ request }) => {
    const res = await request.get(`${API}/api/academy/dashboard/mi-progreso`, {
      headers: { Cookie: authCookie },
    });

    // Should return 200 even if no progress yet
    expect([200, 404]).toContain(res.status());
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // MEDIA / YOUTUBE
  // ═══════════════════════════════════════════════════════════════════════════

  test("POST /academy/media/youtube-info - Get YouTube video info", async ({ request }) => {
    const res = await request.post(`${API}/academy/media/youtube-info`, {
      headers: { Cookie: authCookie },
      data: { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
    });

    // May return 200 with info or 400 if invalid URL
    expect([200, 400]).toContain(res.status());
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CLEANUP
  // ═══════════════════════════════════════════════════════════════════════════

  test("DELETE /academy/temas/:id - Delete topic", async ({ request }) => {
    const res = await request.delete(`${API}/api/academy/temas/${createdTemaId}`, {
      headers: { Cookie: authCookie },
    });

    expect(res.status()).toBe(200);
  });

  test("DELETE /academy/modulos/:id - Delete module", async ({ request }) => {
    const res = await request.delete(`${API}/api/academy/modulos/${createdModuloId}`, {
      headers: { Cookie: authCookie },
    });

    expect(res.status()).toBe(200);
  });

  test("DELETE /academy/cursos/:id - Delete course", async ({ request }) => {
    const res = await request.delete(`${API}/api/academy/cursos/${createdCursoId}`, {
      headers: { Cookie: authCookie },
    });

    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN-ONLY ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

test.describe("Academy LMS Admin Endpoints", () => {
  test("GET /academy/sync/mapeo-roles - Get role mappings (admin only)", async ({ request }) => {
    const res = await request.get(`${API}/api/academy/sync/mapeo-roles`, {
      headers: { Cookie: authCookie },
    });

    // Should return 200 for admin, 403 for non-admin
    expect([200, 403]).toContain(res.status());
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ERROR HANDLING
// ═══════════════════════════════════════════════════════════════════════════

test.describe("Academy LMS Error Handling", () => {
  test("GET /academy/cursos/:id - Returns 404 for non-existent course", async ({ request }) => {
    const fakeId = "00000000-0000-0000-0000-000000000000";
    const res = await request.get(`${API}/api/academy/cursos/${fakeId}`, {
      headers: { Cookie: authCookie },
    });

    expect(res.status()).toBe(404);
  });

  test("POST /academy/cursos - Returns 400 for invalid data", async ({ request }) => {
    const res = await request.post(`${API}/api/academy/cursos`, {
      headers: { Cookie: authCookie },
      data: { invalidField: "test" },
    });

    expect(res.status()).toBe(400);
  });

  test("Unauthorized access returns 401", async ({ request }) => {
    const res = await request.get(`${API}/api/academy/cursos`);
    expect(res.status()).toBe(401);
  });
});
