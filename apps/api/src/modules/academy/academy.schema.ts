/**
 * Gremius Academy — Schema & Validators
 *
 * Isolated Drizzle ORM table definitions for the LMS module.
 * Import these tables within this module only; do NOT add them
 * to apps/api/src/db/schema.ts.
 *
 * Tables:
 *   academy_courses       — Course catalog
 *   academy_topics        — Ordered learning content per course
 *   academy_quizzes       — One quiz per course (final evaluation)
 *   academy_questions     — Multiple-choice questions (correct answer stored securely)
 *   academy_enrollments   — User ↔ Course enrollment tracking
 *   academy_quiz_attempts — Quiz submission results
 */

import {
    pgTable,
    uuid,
    varchar,
    text,
    integer,
    boolean,
    real,
    timestamp,
    jsonb,
    pgEnum,
    index,
    uniqueIndex,
} from "drizzle-orm/pg-core";
import { z } from "zod";

// ── Enums ─────────────────────────────────────────────────────

export const courseStatusEnum = pgEnum("academy_course_status", [
    "draft",
    "published",
    "archived",
]);

export const enrollmentStatusEnum = pgEnum("academy_enrollment_status", [
    "enrolled",
    "in_progress",
    "completed",
]);

// ── Tables ────────────────────────────────────────────────────

export const academyCourses = pgTable(
    "academy_courses",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        title: varchar("title", { length: 300 }).notNull(),
        slug: varchar("slug", { length: 300 }).notNull(),
        description: text("description"),
        /** Rich text content stored as Lexical/Tiptap JSON */
        content: jsonb("content"),
        thumbnailUrl: text("thumbnail_url"),
        status: courseStatusEnum("status").notNull().default("draft"),
        createdBy: text("created_by"),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [
        uniqueIndex("ac_slug_idx").on(t.slug),
        index("ac_status_idx").on(t.status),
    ]
);

export const academyTopics = pgTable(
    "academy_topics",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        courseId: uuid("course_id")
            .notNull()
            .references(() => academyCourses.id, { onDelete: "cascade" }),
        title: varchar("title", { length: 300 }).notNull(),
        /** Rich text content (HTML or Lexical JSON) */
        content: jsonb("content"),
        /** YouTube URL or MinIO/S3 video URL */
        videoUrl: text("video_url"),
        sortOrder: integer("sort_order").notNull().default(0),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [
        index("at_course_idx").on(t.courseId),
        index("at_sort_idx").on(t.courseId, t.sortOrder),
    ]
);

export const academyQuizzes = pgTable(
    "academy_quizzes",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        courseId: uuid("course_id")
            .notNull()
            .references(() => academyCourses.id, { onDelete: "cascade" }),
        title: varchar("title", { length: 300 }).notNull(),
        description: text("description"),
        /** Minimum percentage to pass (0–100) */
        passingScore: real("passing_score").notNull().default(70),
        /** Maximum number of attempts allowed (0 = unlimited) */
        maxAttempts: integer("max_attempts").notNull().default(0),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [index("aq_course_idx").on(t.courseId)]
);

/**
 * Multiple-choice questions.
 *
 * `options` is a JSON array of strings, e.g. ["Option A", "Option B", "Option C", "Option D"].
 * `correct_option_index` is the zero-based index of the correct answer within `options`.
 *
 * ⚠️  `correct_option_index` is NEVER returned to the client via any endpoint.
 */
export const academyQuestions = pgTable(
    "academy_questions",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        quizId: uuid("quiz_id")
            .notNull()
            .references(() => academyQuizzes.id, { onDelete: "cascade" }),
        questionText: text("question_text").notNull(),
        /** JSON array of option strings */
        options: jsonb("options").notNull().$type<string[]>(),
        /** Zero-based index of the correct option — SERVER ONLY */
        correctOptionIndex: integer("correct_option_index").notNull(),
        sortOrder: integer("sort_order").notNull().default(0),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [
        index("aqq_quiz_idx").on(t.quizId),
        index("aqq_sort_idx").on(t.quizId, t.sortOrder),
    ]
);

export const academyEnrollments = pgTable(
    "academy_enrollments",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        userId: text("user_id").notNull(),
        courseId: uuid("course_id")
            .notNull()
            .references(() => academyCourses.id, { onDelete: "cascade" }),
        status: enrollmentStatusEnum("status").notNull().default("enrolled"),
        /** Number of topics completed */
        topicsCompleted: integer("topics_completed").notNull().default(0),
        enrolledAt: timestamp("enrolled_at", { withTimezone: true }).notNull().defaultNow(),
        completedAt: timestamp("completed_at", { withTimezone: true }),
    },
    (t) => [
        uniqueIndex("ae_user_course_idx").on(t.userId, t.courseId),
        index("ae_user_idx").on(t.userId),
    ]
);

export const academyQuizAttempts = pgTable(
    "academy_quiz_attempts",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        userId: text("user_id").notNull(),
        quizId: uuid("quiz_id")
            .notNull()
            .references(() => academyQuizzes.id, { onDelete: "cascade" }),
        /** Score as percentage (0–100) */
        score: real("score").notNull(),
        passed: boolean("passed").notNull(),
        totalQuestions: integer("total_questions").notNull(),
        correctAnswers: integer("correct_answers").notNull(),
        /** User's submitted answers (index per question id) */
        answers: jsonb("answers").notNull().$type<Record<string, number>>(),
        attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [
        index("aqa_user_idx").on(t.userId),
        index("aqa_quiz_idx").on(t.quizId),
    ]
);

/**
 * Per-topic progress tracking.
 * Records when a user marks a topic as "completed".
 */
export const academyUserProgress = pgTable(
    "academy_user_progress",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        userId: text("user_id").notNull(),
        topicId: uuid("topic_id")
            .notNull()
            .references(() => academyTopics.id, { onDelete: "cascade" }),
        courseId: uuid("course_id")
            .notNull()
            .references(() => academyCourses.id, { onDelete: "cascade" }),
        completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [
        uniqueIndex("aup_user_topic_idx").on(t.userId, t.topicId),
        index("aup_user_course_idx").on(t.userId, t.courseId),
    ]
);

/**
 * Mandatory satisfaction survey after passing the quiz.
 * Must be completed before the user can download their certificate.
 */
export const academySatisfactionSurveys = pgTable(
    "academy_satisfaction_surveys",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        userId: text("user_id").notNull(),
        courseId: uuid("course_id")
            .notNull()
            .references(() => academyCourses.id, { onDelete: "cascade" }),
        /** Rating from 1 to 5 */
        rating: integer("rating").notNull(),
        comments: text("comments"),
        submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [
        uniqueIndex("ass_user_course_idx").on(t.userId, t.courseId),
    ]
);

// ── TypeScript Types ──────────────────────────────────────────

export type AcademyCourse = typeof academyCourses.$inferSelect;
export type NewAcademyCourse = typeof academyCourses.$inferInsert;
export type AcademyTopic = typeof academyTopics.$inferSelect;
export type NewAcademyTopic = typeof academyTopics.$inferInsert;
export type AcademyQuiz = typeof academyQuizzes.$inferSelect;
export type NewAcademyQuiz = typeof academyQuizzes.$inferInsert;
export type AcademyQuestion = typeof academyQuestions.$inferSelect;
export type NewAcademyQuestion = typeof academyQuestions.$inferInsert;
export type AcademyEnrollment = typeof academyEnrollments.$inferSelect;
export type AcademyQuizAttempt = typeof academyQuizAttempts.$inferSelect;
export type AcademyUserProgress = typeof academyUserProgress.$inferSelect;
export type AcademySatisfactionSurvey = typeof academySatisfactionSurveys.$inferSelect;

// ── Zod Validators ────────────────────────────────────────────

export const createCourseSchema = z.object({
    title: z.string().min(1, "title is required").max(300),
    slug: z.string().min(1, "slug is required").max(300)
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must be lowercase with hyphens"),
    description: z.string().optional(),
    content: z.any().optional(),
    thumbnail_url: z.string().url().optional().or(z.literal("")),
    status: z.enum(["draft", "published", "archived"]).optional(),
});

export const updateCourseSchema = z.object({
    title: z.string().min(1).max(300).optional(),
    slug: z.string().min(1).max(300)
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
    description: z.string().optional(),
    content: z.any().optional(),
    thumbnail_url: z.string().url().optional().or(z.literal("")),
    status: z.enum(["draft", "published", "archived"]).optional(),
});

export const createTopicSchema = z.object({
    title: z.string().min(1, "title is required").max(300),
    content: z.any().optional(),
    video_url: z.string().url("video_url must be a valid URL").optional().or(z.literal("")),
    sort_order: z.number().int().min(0).optional(),
});

export const updateTopicSchema = z.object({
    title: z.string().min(1).max(300).optional(),
    content: z.any().optional(),
    video_url: z.string().url().optional().or(z.literal("")),
    sort_order: z.number().int().min(0).optional(),
});

export const createQuizSchema = z.object({
    title: z.string().min(1, "title is required").max(300),
    description: z.string().optional(),
    passing_score: z.number().min(0).max(100).optional(),
    max_attempts: z.number().int().min(0).optional(),
});

export const createQuestionSchema = z.object({
    question_text: z.string().min(1, "question_text is required"),
    options: z.array(z.string().min(1)).min(2, "At least 2 options are required"),
    correct_option_index: z.number().int().min(0, "correct_option_index must be >= 0"),
    sort_order: z.number().int().min(0).optional(),
});

export const submitQuizSchema = z.object({
    /** Map of question_id → selected option index */
    answers: z.record(z.string().uuid(), z.number().int().min(0)),
});

export const submitSurveySchema = z.object({
    rating: z.number().int().min(1, "rating must be 1-5").max(5, "rating must be 1-5"),
    comments: z.string().max(2000).optional(),
});
