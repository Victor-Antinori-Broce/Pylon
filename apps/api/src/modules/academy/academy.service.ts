/**
 * Gremius Academy — Service Layer
 *
 * All business logic for the LMS module. Quiz grading is performed
 * entirely server-side — the correct_option_index is NEVER sent to clients.
 */

import { and, eq, asc, desc, count, sql, inArray } from "drizzle-orm";
import { db } from "../../db";
import {
    academyCourses,
    academyTopics,
    academyQuizzes,
    academyQuestions,
    academyEnrollments,
    academyQuizAttempts,
    academyUserProgress,
    academySatisfactionSurveys,
    type NewAcademyCourse,
    type NewAcademyTopic,
    type NewAcademyQuiz,
    type NewAcademyQuestion,
} from "./academy.schema";

// ── Custom Errors ─────────────────────────────────────────────

export class NotFoundError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "NotFoundError";
    }
}

export class ConflictError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ConflictError";
    }
}

export class ForbiddenError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ForbiddenError";
    }
}

// ── Service ───────────────────────────────────────────────────

export const academyService = {

    // ═══════════════════════════════════════════════
    // COURSES
    // ═══════════════════════════════════════════════

    async getCourses(filter?: { status?: "draft" | "published" | "archived" }) {
        const conditions = [];
        if (filter?.status) {
            conditions.push(eq(academyCourses.status, filter.status));
        }

        const courses = await db
            .select()
            .from(academyCourses)
            .where(conditions.length > 0 ? and(...conditions) : undefined)
            .orderBy(desc(academyCourses.createdAt));

        return courses;
    },

    async getCourseBySlug(slug: string) {
        const [course] = await db
            .select()
            .from(academyCourses)
            .where(eq(academyCourses.slug, slug))
            .limit(1);

        if (!course) throw new NotFoundError(`Course with slug "${slug}" not found.`);

        // Fetch topics ordered by sort_order
        const topics = await db
            .select()
            .from(academyTopics)
            .where(eq(academyTopics.courseId, course.id))
            .orderBy(asc(academyTopics.sortOrder));

        // Fetch quiz (if any)
        const [quiz] = await db
            .select()
            .from(academyQuizzes)
            .where(eq(academyQuizzes.courseId, course.id))
            .limit(1);

        return { ...course, topics, quiz: quiz ?? null };
    },

    async getCourseById(id: string) {
        const [course] = await db
            .select()
            .from(academyCourses)
            .where(eq(academyCourses.id, id))
            .limit(1);

        if (!course) throw new NotFoundError(`Course with id "${id}" not found.`);
        return course;
    },

    async createCourse(input: {
        title: string;
        slug: string;
        description?: string;
        content?: any;
        thumbnail_url?: string;
        status?: "draft" | "published" | "archived";
        created_by?: string;
    }) {
        // Check slug uniqueness
        const [existing] = await db
            .select({ id: academyCourses.id })
            .from(academyCourses)
            .where(eq(academyCourses.slug, input.slug))
            .limit(1);

        if (existing) {
            throw new ConflictError(`A course with slug "${input.slug}" already exists.`);
        }

        const values: NewAcademyCourse = {
            title: input.title,
            slug: input.slug,
            description: input.description ?? null,
            content: input.content ?? null,
            thumbnailUrl: input.thumbnail_url || null,
            status: input.status ?? "draft",
            createdBy: input.created_by ?? null,
        };

        const [created] = await db.insert(academyCourses).values(values).returning();
        return created;
    },

    async updateCourse(id: string, input: {
        title?: string;
        slug?: string;
        description?: string;
        content?: any;
        thumbnail_url?: string;
        status?: "draft" | "published" | "archived";
    }) {
        // Ensure course exists
        await this.getCourseById(id);

        // If slug is changing, check uniqueness
        if (input.slug) {
            const [clash] = await db
                .select({ id: academyCourses.id })
                .from(academyCourses)
                .where(and(
                    eq(academyCourses.slug, input.slug),
                ))
                .limit(1);

            if (clash && clash.id !== id) {
                throw new ConflictError(`A course with slug "${input.slug}" already exists.`);
            }
        }

        const updates: Record<string, any> = { updatedAt: new Date() };
        if (input.title !== undefined) updates.title = input.title;
        if (input.slug !== undefined) updates.slug = input.slug;
        if (input.description !== undefined) updates.description = input.description;
        if (input.content !== undefined) updates.content = input.content;
        if (input.thumbnail_url !== undefined) updates.thumbnailUrl = input.thumbnail_url;
        if (input.status !== undefined) updates.status = input.status;

        const [updated] = await db
            .update(academyCourses)
            .set(updates)
            .where(eq(academyCourses.id, id))
            .returning();

        return updated;
    },

    // ═══════════════════════════════════════════════
    // TOPICS
    // ═══════════════════════════════════════════════

    async createTopic(courseId: string, input: {
        title: string;
        content?: any;
        video_url?: string;
        sort_order?: number;
    }) {
        // Verify course exists
        await this.getCourseById(courseId);

        // Auto-assign sort_order if not provided
        let sortOrder = input.sort_order ?? 0;
        if (input.sort_order === undefined) {
            const [last] = await db
                .select({ sortOrder: academyTopics.sortOrder })
                .from(academyTopics)
                .where(eq(academyTopics.courseId, courseId))
                .orderBy(desc(academyTopics.sortOrder))
                .limit(1);
            sortOrder = (last?.sortOrder ?? -1) + 1;
        }

        const values: NewAcademyTopic = {
            courseId,
            title: input.title,
            content: input.content ?? null,
            videoUrl: input.video_url || null,
            sortOrder,
        };

        const [created] = await db.insert(academyTopics).values(values).returning();
        return created;
    },

    async updateTopic(topicId: string, input: {
        title?: string;
        content?: any;
        video_url?: string;
        sort_order?: number;
    }) {
        const [topic] = await db
            .select()
            .from(academyTopics)
            .where(eq(academyTopics.id, topicId))
            .limit(1);

        if (!topic) throw new NotFoundError(`Topic "${topicId}" not found.`);

        const updates: Record<string, any> = { updatedAt: new Date() };
        if (input.title !== undefined) updates.title = input.title;
        if (input.content !== undefined) updates.content = input.content;
        if (input.video_url !== undefined) updates.videoUrl = input.video_url;
        if (input.sort_order !== undefined) updates.sortOrder = input.sort_order;

        const [updated] = await db
            .update(academyTopics)
            .set(updates)
            .where(eq(academyTopics.id, topicId))
            .returning();

        return updated;
    },

    // ═══════════════════════════════════════════════
    // QUIZZES
    // ═══════════════════════════════════════════════

    async createQuiz(courseId: string, input: {
        title: string;
        description?: string;
        passing_score?: number;
        max_attempts?: number;
    }) {
        // Verify course exists
        await this.getCourseById(courseId);

        // Only one quiz per course
        const [existing] = await db
            .select({ id: academyQuizzes.id })
            .from(academyQuizzes)
            .where(eq(academyQuizzes.courseId, courseId))
            .limit(1);

        if (existing) {
            throw new ConflictError(`Course "${courseId}" already has a quiz.`);
        }

        const values: NewAcademyQuiz = {
            courseId,
            title: input.title,
            description: input.description ?? null,
            passingScore: input.passing_score ?? 70,
            maxAttempts: input.max_attempts ?? 0,
        };

        const [created] = await db.insert(academyQuizzes).values(values).returning();
        return created;
    },

    /**
     * Returns quiz data WITHOUT correct_option_index on questions.
     * Safe to return directly to clients.
     */
    async getQuizForClient(quizId: string) {
        const [quiz] = await db
            .select()
            .from(academyQuizzes)
            .where(eq(academyQuizzes.id, quizId))
            .limit(1);

        if (!quiz) throw new NotFoundError(`Quiz "${quizId}" not found.`);

        const questions = await db
            .select({
                id: academyQuestions.id,
                questionText: academyQuestions.questionText,
                options: academyQuestions.options,
                sortOrder: academyQuestions.sortOrder,
                // NOTE: correct_option_index is intentionally EXCLUDED
            })
            .from(academyQuestions)
            .where(eq(academyQuestions.quizId, quizId))
            .orderBy(asc(academyQuestions.sortOrder));

        return { ...quiz, questions };
    },

    async addQuestion(quizId: string, input: {
        question_text: string;
        options: string[];
        correct_option_index: number;
        sort_order?: number;
    }) {
        // Verify quiz exists
        const [quiz] = await db
            .select({ id: academyQuizzes.id })
            .from(academyQuizzes)
            .where(eq(academyQuizzes.id, quizId))
            .limit(1);

        if (!quiz) throw new NotFoundError(`Quiz "${quizId}" not found.`);

        // Validate correct_option_index is within bounds
        if (input.correct_option_index >= input.options.length) {
            throw new RangeError(
                `correct_option_index (${input.correct_option_index}) is out of bounds for options array (length ${input.options.length}).`
            );
        }

        // Auto-assign sort_order
        let sortOrder = input.sort_order ?? 0;
        if (input.sort_order === undefined) {
            const [last] = await db
                .select({ sortOrder: academyQuestions.sortOrder })
                .from(academyQuestions)
                .where(eq(academyQuestions.quizId, quizId))
                .orderBy(desc(academyQuestions.sortOrder))
                .limit(1);
            sortOrder = (last?.sortOrder ?? -1) + 1;
        }

        const values: NewAcademyQuestion = {
            quizId,
            questionText: input.question_text,
            options: input.options,
            correctOptionIndex: input.correct_option_index,
            sortOrder,
        };

        const [created] = await db.insert(academyQuestions).values(values).returning();

        // Return WITHOUT correct_option_index for safety
        return {
            id: created.id,
            quizId: created.quizId,
            questionText: created.questionText,
            options: created.options,
            sortOrder: created.sortOrder,
            createdAt: created.createdAt,
        };
    },

    // ═══════════════════════════════════════════════
    // ENROLLMENTS
    // ═══════════════════════════════════════════════

    async enrollUser(userId: string, courseId: string) {
        // Verify course exists and is published
        const course = await this.getCourseById(courseId);
        if (course.status !== "published") {
            throw new ForbiddenError("Cannot enroll in an unpublished course.");
        }

        // Check for existing enrollment
        const [existing] = await db
            .select({ id: academyEnrollments.id })
            .from(academyEnrollments)
            .where(and(
                eq(academyEnrollments.userId, userId),
                eq(academyEnrollments.courseId, courseId),
            ))
            .limit(1);

        if (existing) {
            throw new ConflictError("User is already enrolled in this course.");
        }

        const [enrollment] = await db
            .insert(academyEnrollments)
            .values({ userId, courseId })
            .returning();

        return enrollment;
    },

    async getUserEnrollments(userId: string) {
        const enrollments = await db
            .select({
                enrollment: academyEnrollments,
                course: academyCourses,
            })
            .from(academyEnrollments)
            .innerJoin(academyCourses, eq(academyEnrollments.courseId, academyCourses.id))
            .where(eq(academyEnrollments.userId, userId))
            .orderBy(desc(academyEnrollments.enrolledAt));

        return enrollments.map((row) => ({
            ...row.enrollment,
            course: {
                id: row.course.id,
                title: row.course.title,
                slug: row.course.slug,
                description: row.course.description,
                thumbnailUrl: row.course.thumbnailUrl,
                status: row.course.status,
            },
        }));
    },

    // ═══════════════════════════════════════════════
    // QUIZ SUBMISSION (Server-side grading)
    // ═══════════════════════════════════════════════

    /**
     * Grades a quiz submission entirely on the server.
     *
     * PROGRESS GATE: Throws ForbiddenError if the user has not completed
     * 100% of the course topics.
     */
    async submitQuiz(userId: string, quizId: string, answers: Record<string, number>) {
        // 1. Fetch quiz
        const [quiz] = await db
            .select()
            .from(academyQuizzes)
            .where(eq(academyQuizzes.id, quizId))
            .limit(1);

        if (!quiz) throw new NotFoundError(`Quiz "${quizId}" not found.`);

        // 1b. PROGRESS GATE — require 100% topic completion
        await this.assertFullProgress(userId, quiz.courseId);

        // 2. Check max attempts
        if (quiz.maxAttempts > 0) {
            const [attemptCount] = await db
                .select({ value: count() })
                .from(academyQuizAttempts)
                .where(and(
                    eq(academyQuizAttempts.userId, userId),
                    eq(academyQuizAttempts.quizId, quizId),
                ));

            if ((attemptCount?.value ?? 0) >= quiz.maxAttempts) {
                throw new ForbiddenError(
                    `Maximum attempts (${quiz.maxAttempts}) exceeded for this quiz.`
                );
            }
        }

        // 3. Fetch all questions with correct answers (SERVER ONLY)
        const questions = await db
            .select()
            .from(academyQuestions)
            .where(eq(academyQuestions.quizId, quizId))
            .orderBy(asc(academyQuestions.sortOrder));

        if (questions.length === 0) {
            throw new NotFoundError("This quiz has no questions.");
        }

        // 4. Grade
        let correctCount = 0;
        for (const q of questions) {
            const userAnswer = answers[q.id];
            if (userAnswer !== undefined && userAnswer === q.correctOptionIndex) {
                correctCount++;
            }
        }

        const totalQuestions = questions.length;
        const score = Math.round((correctCount / totalQuestions) * 100 * 100) / 100;
        const passed = score >= quiz.passingScore;

        // 5. Store attempt
        const [attempt] = await db
            .insert(academyQuizAttempts)
            .values({
                userId,
                quizId,
                score,
                passed,
                totalQuestions,
                correctAnswers: correctCount,
                answers,
            })
            .returning();

        // 6. If passed, update enrollment status
        if (passed) {
            await db
                .update(academyEnrollments)
                .set({
                    status: "completed",
                    completedAt: new Date(),
                })
                .where(and(
                    eq(academyEnrollments.userId, userId),
                    eq(academyEnrollments.courseId, quiz.courseId),
                ));
        }

        return {
            id: attempt.id,
            score: attempt.score,
            passed: attempt.passed,
            totalQuestions: attempt.totalQuestions,
            correctAnswers: attempt.correctAnswers,
            attemptedAt: attempt.attemptedAt,
        };
    },

    // ═══════════════════════════════════════════════
    // USER PROGRESS (Feature 2)
    // ═══════════════════════════════════════════════

    /**
     * Marks a topic as completed for a user.
     * Updates the enrollment's topicsCompleted count and status.
     */
    async markTopicComplete(userId: string, topicId: string) {
        // 1. Verify topic exists and get courseId
        const [topic] = await db
            .select({ id: academyTopics.id, courseId: academyTopics.courseId })
            .from(academyTopics)
            .where(eq(academyTopics.id, topicId))
            .limit(1);

        if (!topic) throw new NotFoundError(`Topic "${topicId}" not found.`);

        // 2. Verify enrollment
        const [enrollment] = await db
            .select()
            .from(academyEnrollments)
            .where(and(
                eq(academyEnrollments.userId, userId),
                eq(academyEnrollments.courseId, topic.courseId),
            ))
            .limit(1);

        if (!enrollment) {
            throw new ForbiddenError("You must be enrolled in this course.");
        }

        // 3. Check if already completed (idempotent)
        const [existing] = await db
            .select({ id: academyUserProgress.id })
            .from(academyUserProgress)
            .where(and(
                eq(academyUserProgress.userId, userId),
                eq(academyUserProgress.topicId, topicId),
            ))
            .limit(1);

        if (existing) {
            return { alreadyCompleted: true };
        }

        // 4. Insert progress record
        await db.insert(academyUserProgress).values({
            userId,
            topicId,
            courseId: topic.courseId,
        });

        // 5. Count total completed topics for this course
        const [completedCount] = await db
            .select({ value: count() })
            .from(academyUserProgress)
            .where(and(
                eq(academyUserProgress.userId, userId),
                eq(academyUserProgress.courseId, topic.courseId),
            ));

        const topicsCompleted = completedCount?.value ?? 0;

        // 6. Update enrollment progress + status
        await db
            .update(academyEnrollments)
            .set({
                topicsCompleted,
                status: "in_progress",
            })
            .where(and(
                eq(academyEnrollments.userId, userId),
                eq(academyEnrollments.courseId, topic.courseId),
            ));

        return { alreadyCompleted: false, topicsCompleted };
    },

    /**
     * Returns the user's progress for a course:
     * percentage, completed topic IDs, and total topics.
     */
    async getCourseProgress(userId: string, courseId: string) {
        // Total topics in course
        const [totalResult] = await db
            .select({ value: count() })
            .from(academyTopics)
            .where(eq(academyTopics.courseId, courseId));

        const totalTopics = totalResult?.value ?? 0;

        // Completed topics by user
        const completedRows = await db
            .select({ topicId: academyUserProgress.topicId, completedAt: academyUserProgress.completedAt })
            .from(academyUserProgress)
            .where(and(
                eq(academyUserProgress.userId, userId),
                eq(academyUserProgress.courseId, courseId),
            ));

        const completedTopicIds = completedRows.map((r) => r.topicId);
        const percentage = totalTopics === 0 ? 0 : Math.round((completedTopicIds.length / totalTopics) * 100);

        return {
            courseId,
            totalTopics,
            completedTopics: completedTopicIds.length,
            percentage,
            completedTopicIds,
        };
    },

    /**
     * Throws ForbiddenError if the user has NOT completed 100% of topics.
     * Called as a gate before quiz submission.
     */
    async assertFullProgress(userId: string, courseId: string) {
        const progress = await this.getCourseProgress(userId, courseId);
        if (progress.percentage < 100) {
            throw new ForbiddenError(
                `Debes completar el 100% del contenido antes de tomar la evaluación. Progreso actual: ${progress.percentage}%.`
            );
        }
    },

    // ═══════════════════════════════════════════════
    // SATISFACTION SURVEY (Feature 3)
    // ═══════════════════════════════════════════════

    /**
     * Submit a mandatory satisfaction survey.
     * Required before certificate download.
     */
    async submitSurvey(userId: string, courseId: string, data: { rating: number; comments?: string }) {
        // Verify enrollment is completed (passed quiz)
        const [enrollment] = await db
            .select()
            .from(academyEnrollments)
            .where(and(
                eq(academyEnrollments.userId, userId),
                eq(academyEnrollments.courseId, courseId),
            ))
            .limit(1);

        if (!enrollment || enrollment.status !== "completed") {
            throw new ForbiddenError("Debes aprobar la evaluación antes de enviar la encuesta.");
        }

        // Check for existing survey
        const [existing] = await db
            .select({ id: academySatisfactionSurveys.id })
            .from(academySatisfactionSurveys)
            .where(and(
                eq(academySatisfactionSurveys.userId, userId),
                eq(academySatisfactionSurveys.courseId, courseId),
            ))
            .limit(1);

        if (existing) {
            throw new ConflictError("Ya enviaste la encuesta de satisfacción para este curso.");
        }

        const [survey] = await db
            .insert(academySatisfactionSurveys)
            .values({
                userId,
                courseId,
                rating: data.rating,
                comments: data.comments ?? null,
            })
            .returning();

        return survey;
    },

    /**
     * Generate a certificate PDF using pdf-lib.
     * Requires: enrollment completed + survey submitted.
     * Returns a Uint8Array (PDF bytes).
     */
    async generateCertificatePdf(userId: string, courseId: string, userName: string) {
        // Verify enrollment completed
        const [enrollment] = await db
            .select()
            .from(academyEnrollments)
            .where(and(
                eq(academyEnrollments.userId, userId),
                eq(academyEnrollments.courseId, courseId),
            ))
            .limit(1);

        if (!enrollment || enrollment.status !== "completed") {
            throw new ForbiddenError("Debes completar el curso para obtener el certificado.");
        }

        // Verify survey submitted
        const [survey] = await db
            .select({ id: academySatisfactionSurveys.id })
            .from(academySatisfactionSurveys)
            .where(and(
                eq(academySatisfactionSurveys.userId, userId),
                eq(academySatisfactionSurveys.courseId, courseId),
            ))
            .limit(1);

        if (!survey) {
            throw new ForbiddenError("Debes completar la encuesta de satisfacción antes de descargar el certificado.");
        }

        // Get course info
        const course = await this.getCourseById(courseId);

        // Get best passing attempt
        const [attempt] = await db
            .select()
            .from(academyQuizAttempts)
            .innerJoin(academyQuizzes, eq(academyQuizAttempts.quizId, academyQuizzes.id))
            .where(and(
                eq(academyQuizAttempts.userId, userId),
                eq(academyQuizzes.courseId, courseId),
                eq(academyQuizAttempts.passed, true),
            ))
            .orderBy(desc(academyQuizAttempts.score))
            .limit(1);

        const score = attempt?.academy_quiz_attempts?.score ?? 0;
        const completedAt = enrollment.completedAt ?? new Date();

        // Generate PDF with pdf-lib
        const { PDFDocument, rgb, StandardFonts } = await import("pdf-lib");

        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage([842, 595]); // A4 Landscape
        const { width, height } = page.getSize();

        const timesRoman = await pdfDoc.embedFont(StandardFonts.TimesRoman);
        const timesRomanBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
        const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);

        // Background color
        page.drawRectangle({
            x: 0, y: 0, width, height,
            color: rgb(0.06, 0.06, 0.12),
        });

        // Border
        const borderInset = 30;
        page.drawRectangle({
            x: borderInset, y: borderInset,
            width: width - borderInset * 2,
            height: height - borderInset * 2,
            borderColor: rgb(0.39, 0.40, 0.95),
            borderWidth: 2,
        });

        // Inner border
        page.drawRectangle({
            x: borderInset + 8, y: borderInset + 8,
            width: width - (borderInset + 8) * 2,
            height: height - (borderInset + 8) * 2,
            borderColor: rgb(0.39, 0.40, 0.95),
            borderWidth: 0.5,
            opacity: 0.3,
        });

        const centerX = width / 2;

        // "CERTIFICADO DE COMPLETACIÓN"
        const certLabel = "CERTIFICADO DE COMPLETACIÓN";
        const certLabelWidth = helvetica.widthOfTextAtSize(certLabel, 11);
        page.drawText(certLabel, {
            x: centerX - certLabelWidth / 2,
            y: height - 90,
            size: 11,
            font: helvetica,
            color: rgb(0.65, 0.71, 0.98),
        });

        // "Gremius Academy"
        const instText = "Gremius Academy";
        const instWidth = timesRomanBold.widthOfTextAtSize(instText, 36);
        page.drawText(instText, {
            x: centerX - instWidth / 2,
            y: height - 140,
            size: 36,
            font: timesRomanBold,
            color: rgb(0.90, 0.92, 0.98),
        });

        // "Certifica que"
        const affirmText = "Certifica que";
        const affirmWidth = timesRoman.widthOfTextAtSize(affirmText, 14);
        page.drawText(affirmText, {
            x: centerX - affirmWidth / 2,
            y: height - 190,
            size: 14,
            font: timesRoman,
            color: rgb(0.6, 0.6, 0.7),
        });

        // User name
        const nameWidth = timesRomanBold.widthOfTextAtSize(userName, 28);
        page.drawText(userName, {
            x: centerX - nameWidth / 2,
            y: height - 235,
            size: 28,
            font: timesRomanBold,
            color: rgb(0.95, 0.96, 0.99),
        });

        // Line under name
        page.drawLine({
            start: { x: centerX - 150, y: height - 250 },
            end: { x: centerX + 150, y: height - 250 },
            thickness: 0.5,
            color: rgb(0.39, 0.40, 0.95),
            opacity: 0.5,
        });

        // "Ha completado satisfactoriamente el curso"
        const detailText = "Ha completado satisfactoriamente el curso";
        const detailWidth = timesRoman.widthOfTextAtSize(detailText, 13);
        page.drawText(detailText, {
            x: centerX - detailWidth / 2,
            y: height - 290,
            size: 13,
            font: timesRoman,
            color: rgb(0.6, 0.6, 0.7),
        });

        // Course title
        const courseTitle = course.title;
        const courseFontSize = courseTitle.length > 40 ? 18 : 22;
        const courseWidth = timesRomanBold.widthOfTextAtSize(courseTitle, courseFontSize);
        page.drawText(courseTitle, {
            x: centerX - courseWidth / 2,
            y: height - 330,
            size: courseFontSize,
            font: timesRomanBold,
            color: rgb(0.65, 0.71, 0.98),
        });

        // Score
        const scoreText = `Puntaje: ${score}%`;
        const scoreWidth = helvetica.widthOfTextAtSize(scoreText, 12);
        page.drawText(scoreText, {
            x: centerX - scoreWidth / 2,
            y: height - 380,
            size: 12,
            font: helvetica,
            color: rgb(0.65, 0.71, 0.98),
        });

        // Date
        const dateStr = completedAt.toLocaleDateString("es-ES", {
            year: "numeric", month: "long", day: "numeric",
        });
        const dateWidth = helvetica.widthOfTextAtSize(dateStr, 10);
        page.drawText(dateStr, {
            x: centerX - dateWidth / 2,
            y: height - 420,
            size: 10,
            font: helvetica,
            color: rgb(0.5, 0.5, 0.6),
        });

        const pdfBytes = await pdfDoc.save();
        return pdfBytes;
    },

    // ═══════════════════════════════════════════════
    // HR REPORTS (Feature 4)
    // ═══════════════════════════════════════════════

    /**
     * Returns compliance report for a specific course.
     * Groups enrollments by status: completed, in_progress, enrolled.
     */
    async getComplianceReport(courseId: string) {
        const course = await this.getCourseById(courseId);

        const enrollments = await db
            .select()
            .from(academyEnrollments)
            .where(eq(academyEnrollments.courseId, courseId))
            .orderBy(desc(academyEnrollments.enrolledAt));

        const completed = enrollments.filter((e) => e.status === "completed");
        const inProgress = enrollments.filter((e) => e.status === "in_progress");
        const enrolled = enrollments.filter((e) => e.status === "enrolled");

        return {
            course: {
                id: course.id,
                title: course.title,
                slug: course.slug,
            },
            summary: {
                total: enrollments.length,
                completed: completed.length,
                inProgress: inProgress.length,
                enrolled: enrolled.length,
                completionRate: enrollments.length === 0
                    ? 0
                    : Math.round((completed.length / enrollments.length) * 100),
            },
            groups: {
                completed,
                inProgress,
                enrolled,
            },
        };
    },

    /**
     * Returns aggregate report across all published courses.
     */
    async getReportSummary() {
        const courses = await db
            .select()
            .from(academyCourses)
            .where(eq(academyCourses.status, "published"))
            .orderBy(asc(academyCourses.title));

        const results = [];

        for (const course of courses) {
            const [totalEnrolled] = await db
                .select({ value: count() })
                .from(academyEnrollments)
                .where(eq(academyEnrollments.courseId, course.id));

            const [completedCount] = await db
                .select({ value: count() })
                .from(academyEnrollments)
                .where(and(
                    eq(academyEnrollments.courseId, course.id),
                    eq(academyEnrollments.status, "completed"),
                ));

            const total = totalEnrolled?.value ?? 0;
            const completed = completedCount?.value ?? 0;

            results.push({
                courseId: course.id,
                title: course.title,
                slug: course.slug,
                totalEnrolled: total,
                completed,
                completionRate: total === 0 ? 0 : Math.round((completed / total) * 100),
            });
        }

        return results;
    },
};
