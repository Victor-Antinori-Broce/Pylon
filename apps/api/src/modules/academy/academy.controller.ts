/**
 * Gremius Academy — Controller (Hono Router)
 *
 * All routes for the LMS module, mounted under `/academy`.
 *
 * Mount in your main router:
 *   import { academyRoutes } from "./modules/academy";
 *   app.route("/api/custom", academyRoutes);
 *
 * Endpoints:
 *   GET    /academy/courses              — List published courses
 *   GET    /academy/courses/:slug        — Course detail + topics + quiz
 *   POST   /academy/courses              — Create course (admin)
 *   PUT    /academy/courses/:id          — Update course (admin)
 *   POST   /academy/courses/:courseId/topics      — Create topic (admin)
 *   PUT    /academy/topics/:id                    — Update topic (admin)
 *   POST   /academy/courses/:courseId/quiz        — Create quiz (admin)
 *   POST   /academy/quizzes/:quizId/questions     — Add question (admin)
 *   GET    /academy/quizzes/:quizId               — Get quiz (no correct answers)
 *   POST   /academy/courses/:courseId/enroll      — Enroll (authenticated)
 *   GET    /academy/my-courses                    — My enrollments (authenticated)
 *   POST   /academy/quizzes/:quizId/submit        — Submit quiz (authenticated)
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
    academyService,
    NotFoundError,
    ConflictError,
    ForbiddenError,
} from "./academy.service";
import {
    createCourseSchema,
    updateCourseSchema,
    createTopicSchema,
    updateTopicSchema,
    createQuizSchema,
    createQuestionSchema,
    submitQuizSchema,
    submitSurveySchema,
} from "./academy.schema";
import { enqueueAcademyEvent } from "./academy.queue";

// ── Helpers ───────────────────────────────────────────────────

function extractUserId(c: any): string | null {
    const u = c.get?.("user") ?? c.var?.user;
    return u?.id ?? null;
}

function extractUserRole(c: any): string | null {
    const u = c.get?.("user") ?? c.var?.user;
    return (u as any)?.role ?? null;
}

function requireAuth(c: any): string {
    const userId = extractUserId(c);
    if (!userId) throw new ForbiddenError("Authentication required.");
    return userId;
}

function requireAdmin(c: any): string {
    const userId = requireAuth(c);
    const role = extractUserRole(c);
    if (role !== "admin") throw new ForbiddenError("Admin access required.");
    return userId;
}

function handleError(err: unknown, c: any) {
    if (err instanceof ForbiddenError) {
        return c.json({ error: "Forbidden", message: err.message }, 403);
    }
    if (err instanceof NotFoundError) {
        return c.json({ error: "Not Found", message: err.message }, 404);
    }
    if (err instanceof ConflictError) {
        return c.json({ error: "Conflict", message: err.message }, 409);
    }
    if (err instanceof RangeError) {
        return c.json({ error: "Bad Request", message: err.message }, 400);
    }
    console.error("[AcademyController] Unhandled error:", err);
    return c.json(
        { error: "Internal Server Error", message: "An unexpected error occurred." },
        500
    );
}

function validationHook(result: any, c: any) {
    if (!result.success) {
        return c.json(
            { error: "Validation Error", details: result.error.flatten().fieldErrors },
            400
        );
    }
}

// ── Router ────────────────────────────────────────────────────

export const academyRoutes = new Hono();

// ─────────────────────────────────────────────────────────────
// PUBLIC — Course Catalog
// ─────────────────────────────────────────────────────────────

/** GET /academy/courses — List published courses */
academyRoutes.get("/academy/courses", async (c) => {
    try {
        const status = c.req.query("status");
        const filter = status === "all"
            ? undefined
            : { status: (status as any) || "published" };
        const courses = await academyService.getCourses(filter);
        return c.json({ docs: courses, totalDocs: courses.length });
    } catch (err) {
        return handleError(err, c);
    }
});

/** GET /academy/courses/:slug — Course detail with topics and quiz metadata */
academyRoutes.get("/academy/courses/:slug", async (c) => {
    try {
        const slug = c.req.param("slug");
        const course = await academyService.getCourseBySlug(slug);
        return c.json(course);
    } catch (err) {
        return handleError(err, c);
    }
});

// ─────────────────────────────────────────────────────────────
// ADMIN — Content Management
// ─────────────────────────────────────────────────────────────

/** POST /academy/courses — Create a new course */
academyRoutes.post(
    "/academy/courses",
    zValidator("json", createCourseSchema, validationHook),
    async (c) => {
        try {
            const adminId = requireAdmin(c);
            const body = c.req.valid("json");
            const course = await academyService.createCourse({
                ...body,
                created_by: adminId,
            });
            return c.json({ message: "Course created.", data: course }, 201);
        } catch (err) {
            return handleError(err, c);
        }
    }
);

/** PUT /academy/courses/:id — Update a course */
academyRoutes.put(
    "/academy/courses/:id",
    zValidator("json", updateCourseSchema, validationHook),
    async (c) => {
        try {
            requireAdmin(c);
            const id = c.req.param("id");
            const body = c.req.valid("json");
            const course = await academyService.updateCourse(id, body);
            return c.json({ message: "Course updated.", data: course });
        } catch (err) {
            return handleError(err, c);
        }
    }
);

/** POST /academy/courses/:courseId/topics — Create a topic */
academyRoutes.post(
    "/academy/courses/:courseId/topics",
    zValidator("json", createTopicSchema, validationHook),
    async (c) => {
        try {
            requireAdmin(c);
            const courseId = c.req.param("courseId");
            const body = c.req.valid("json");
            const topic = await academyService.createTopic(courseId, body);
            return c.json({ message: "Topic created.", data: topic }, 201);
        } catch (err) {
            return handleError(err, c);
        }
    }
);

/** PUT /academy/topics/:id — Update a topic */
academyRoutes.put(
    "/academy/topics/:id",
    zValidator("json", updateTopicSchema, validationHook),
    async (c) => {
        try {
            requireAdmin(c);
            const id = c.req.param("id");
            const body = c.req.valid("json");
            const topic = await academyService.updateTopic(id, body);
            return c.json({ message: "Topic updated.", data: topic });
        } catch (err) {
            return handleError(err, c);
        }
    }
);

/** POST /academy/courses/:courseId/quiz — Create quiz for a course */
academyRoutes.post(
    "/academy/courses/:courseId/quiz",
    zValidator("json", createQuizSchema, validationHook),
    async (c) => {
        try {
            requireAdmin(c);
            const courseId = c.req.param("courseId");
            const body = c.req.valid("json");
            const quiz = await academyService.createQuiz(courseId, body);
            return c.json({ message: "Quiz created.", data: quiz }, 201);
        } catch (err) {
            return handleError(err, c);
        }
    }
);

/** POST /academy/quizzes/:quizId/questions — Add question to quiz */
academyRoutes.post(
    "/academy/quizzes/:quizId/questions",
    zValidator("json", createQuestionSchema, validationHook),
    async (c) => {
        try {
            requireAdmin(c);
            const quizId = c.req.param("quizId");
            const body = c.req.valid("json");
            const question = await academyService.addQuestion(quizId, body);
            return c.json({ message: "Question added.", data: question }, 201);
        } catch (err) {
            return handleError(err, c);
        }
    }
);

// ─────────────────────────────────────────────────────────────
// AUTHENTICATED — Quiz & Enrollment
// ─────────────────────────────────────────────────────────────

/** GET /academy/quizzes/:quizId — Get quiz (WITHOUT correct answers) */
academyRoutes.get("/academy/quizzes/:quizId", async (c) => {
    try {
        const quizId = c.req.param("quizId");
        const quiz = await academyService.getQuizForClient(quizId);
        return c.json(quiz);
    } catch (err) {
        return handleError(err, c);
    }
});

/** POST /academy/courses/:courseId/enroll — Enroll in a course */
academyRoutes.post("/academy/courses/:courseId/enroll", async (c) => {
    try {
        const userId = requireAuth(c);
        const courseId = c.req.param("courseId");
        const enrollment = await academyService.enrollUser(userId, courseId);
        return c.json({ message: "Enrolled successfully.", data: enrollment }, 201);
    } catch (err) {
        return handleError(err, c);
    }
});

/** GET /academy/my-courses — List current user's enrollments */
academyRoutes.get("/academy/my-courses", async (c) => {
    try {
        const userId = requireAuth(c);
        const enrollments = await academyService.getUserEnrollments(userId);
        return c.json({ docs: enrollments, totalDocs: enrollments.length });
    } catch (err) {
        return handleError(err, c);
    }
});

/** POST /academy/quizzes/:quizId/submit — Submit quiz answers */
academyRoutes.post(
    "/academy/quizzes/:quizId/submit",
    zValidator("json", submitQuizSchema, validationHook),
    async (c) => {
        try {
            const userId = requireAuth(c);
            const quizId = c.req.param("quizId");
            const { answers } = c.req.valid("json");
            const result = await academyService.submitQuiz(userId, quizId, answers);

            // Fire-and-forget: queue certificate event if passed
            if (result.passed) {
                enqueueAcademyEvent({
                    type: "course_completed",
                    userId,
                    quizId,
                    attemptId: result.id,
                    score: result.score,
                }).catch((err: any) => {
                    console.error("[Academy] Failed to enqueue completion event:", err);
                });
            }

            return c.json({
                message: result.passed ? "Congratulations! You passed." : "Quiz submitted.",
                data: result,
            });
        } catch (err) {
            return handleError(err, c);
        }
    }
);

// ─────────────────────────────────────────────────────────────
// FEATURE 2 — User Progress
// ─────────────────────────────────────────────────────────────

/** POST /academy/topics/:topicId/complete — Mark topic as completed */
academyRoutes.post("/academy/topics/:topicId/complete", async (c) => {
    try {
        const userId = requireAuth(c);
        const topicId = c.req.param("topicId");
        const result = await academyService.markTopicComplete(userId, topicId);
        return c.json({
            message: result.alreadyCompleted ? "Tema ya estaba completado." : "Tema completado.",
            data: result,
        });
    } catch (err) {
        return handleError(err, c);
    }
});

/** GET /academy/courses/:courseId/progress — Get user's progress */
academyRoutes.get("/academy/courses/:courseId/progress", async (c) => {
    try {
        const userId = requireAuth(c);
        const courseId = c.req.param("courseId");
        const progress = await academyService.getCourseProgress(userId, courseId);
        return c.json(progress);
    } catch (err) {
        return handleError(err, c);
    }
});

// ─────────────────────────────────────────────────────────────
// FEATURE 3 — Survey & Certificate
// ─────────────────────────────────────────────────────────────

/** POST /academy/courses/:courseId/survey — Submit satisfaction survey */
academyRoutes.post(
    "/academy/courses/:courseId/survey",
    zValidator("json", submitSurveySchema, validationHook),
    async (c) => {
        try {
            const userId = requireAuth(c);
            const courseId = c.req.param("courseId");
            const body = c.req.valid("json");
            const survey = await academyService.submitSurvey(userId, courseId, body);
            return c.json({ message: "Encuesta enviada.", data: survey }, 201);
        } catch (err) {
            return handleError(err, c);
        }
    }
);

/** GET /academy/courses/:courseId/certificate — Download certificate PDF */
academyRoutes.get("/academy/courses/:courseId/certificate", async (c) => {
    try {
        const userId = requireAuth(c);
        const courseId = c.req.param("courseId");

        // Get user name from context
        const user = (c as any).get?.("user") ?? (c as any).var?.user;
        const userName = (user as any)?.name || (user as any)?.email || "Participante";

        const pdfBytes = await academyService.generateCertificatePdf(userId, courseId, userName);

        return new Response(pdfBytes, {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": `attachment; filename="certificado-${courseId}.pdf"`,
                "Content-Length": pdfBytes.byteLength.toString(),
            },
        });
    } catch (err) {
        return handleError(err, c);
    }
});

// ─────────────────────────────────────────────────────────────
// FEATURE 4 — HR Reports
// ─────────────────────────────────────────────────────────────

/** GET /academy/reports — HR summary across all courses */
academyRoutes.get("/academy/reports", async (c) => {
    try {
        requireAdmin(c);
        const summary = await academyService.getReportSummary();
        return c.json({ docs: summary, totalDocs: summary.length });
    } catch (err) {
        return handleError(err, c);
    }
});

/** GET /academy/reports/:courseId — HR compliance detail for one course */
academyRoutes.get("/academy/reports/:courseId", async (c) => {
    try {
        requireAdmin(c);
        const courseId = c.req.param("courseId");
        const report = await academyService.getComplianceReport(courseId);
        return c.json(report);
    } catch (err) {
        return handleError(err, c);
    }
});
