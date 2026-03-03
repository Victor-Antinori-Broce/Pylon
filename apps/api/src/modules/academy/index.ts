/**
 * Gremius Academy — Public API (Barrel Export)
 *
 * ─────────────────────────────────────────────────────────────
 * HOW TO MOUNT:
 *
 *   import { academyRoutes } from "./modules/academy";
 *   app.route("/api/custom", academyRoutes);
 *
 * Exposed endpoints:
 *   GET    /api/custom/academy/courses
 *   GET    /api/custom/academy/courses/:slug
 *   POST   /api/custom/academy/courses
 *   PUT    /api/custom/academy/courses/:id
 *   POST   /api/custom/academy/courses/:courseId/topics
 *   PUT    /api/custom/academy/topics/:id
 *   POST   /api/custom/academy/courses/:courseId/quiz
 *   POST   /api/custom/academy/quizzes/:quizId/questions
 *   GET    /api/custom/academy/quizzes/:quizId
 *   POST   /api/custom/academy/courses/:courseId/enroll
 *   GET    /api/custom/academy/my-courses
 *   POST   /api/custom/academy/quizzes/:quizId/submit
 *   POST   /api/custom/academy/topics/:topicId/complete
 *   GET    /api/custom/academy/courses/:courseId/progress
 *   POST   /api/custom/academy/courses/:courseId/survey
 *   GET    /api/custom/academy/courses/:courseId/certificate
 *   GET    /api/custom/academy/reports
 *   GET    /api/custom/academy/reports/:courseId
 * ─────────────────────────────────────────────────────────────────
 */

export { academyRoutes } from "./academy.controller";
export { academyService, NotFoundError, ForbiddenError, ConflictError } from "./academy.service";
export { enqueueAcademyEvent, closeAcademyQueue } from "./academy.queue";
export type {
    AcademyCourse,
    AcademyTopic,
    AcademyQuiz,
    AcademyQuestion,
    AcademyEnrollment,
    AcademyQuizAttempt,
    AcademyUserProgress,
    AcademySatisfactionSurvey,
} from "./academy.schema";
export type { AcademyEventPayload, AcademyEventType } from "./academy.queue";
