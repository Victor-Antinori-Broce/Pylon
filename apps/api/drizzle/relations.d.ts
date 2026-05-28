export declare const apiKeysRelations: import("drizzle-orm").Relations<"api_keys", {
    authUser: import("drizzle-orm").One<"auth_users", true>;
}>;
export declare const authUsersRelations: import("drizzle-orm").Relations<"auth_users", {
    apiKeys: import("drizzle-orm").Many<"api_keys">;
    authAccounts: import("drizzle-orm").Many<"auth_accounts">;
    authSessions: import("drizzle-orm").Many<"auth_sessions">;
    blogPosts: import("drizzle-orm").Many<"blog_posts">;
    media: import("drizzle-orm").Many<"media">;
    dataEntries: import("drizzle-orm").Many<"data_entries">;
    gremiusFunctions: import("drizzle-orm").Many<"gremius_functions">;
    contentMetadata: import("drizzle-orm").Many<"content_metadata">;
    agentFeedbacks: import("drizzle-orm").Many<"agent_feedback">;
}>;
export declare const authAccountsRelations: import("drizzle-orm").Relations<"auth_accounts", {
    authUser: import("drizzle-orm").One<"auth_users", true>;
}>;
export declare const authSessionsRelations: import("drizzle-orm").Relations<"auth_sessions", {
    authUser: import("drizzle-orm").One<"auth_users", true>;
}>;
export declare const blogPostsRelations: import("drizzle-orm").Relations<"blog_posts", {
    authUser: import("drizzle-orm").One<"auth_users", true>;
    media: import("drizzle-orm").One<"media", false>;
    blogPostsToGames: import("drizzle-orm").Many<"blog_posts_to_games">;
    blogPostsToTags: import("drizzle-orm").Many<"blog_posts_to_tags">;
}>;
export declare const mediaRelations: import("drizzle-orm").Relations<"media", {
    blogPosts: import("drizzle-orm").Many<"blog_posts">;
    authUser: import("drizzle-orm").One<"auth_users", false>;
    games: import("drizzle-orm").Many<"games">;
    dataEntries: import("drizzle-orm").Many<"data_entries">;
    platforms: import("drizzle-orm").Many<"platforms">;
    streamers: import("drizzle-orm").Many<"streamers">;
    users: import("drizzle-orm").Many<"users">;
    contentMetadata: import("drizzle-orm").Many<"content_metadata">;
}>;
export declare const blogPostsToGamesRelations: import("drizzle-orm").Relations<"blog_posts_to_games", {
    blogPost: import("drizzle-orm").One<"blog_posts", true>;
    game: import("drizzle-orm").One<"games", true>;
}>;
export declare const gamesRelations: import("drizzle-orm").Relations<"games", {
    blogPostsToGames: import("drizzle-orm").Many<"blog_posts_to_games">;
    media: import("drizzle-orm").One<"media", false>;
    dataSets: import("drizzle-orm").Many<"data_sets">;
    gameCollectionEntries: import("drizzle-orm").Many<"game_collection_entries">;
    gamesToPlatforms: import("drizzle-orm").Many<"games_to_platforms">;
    gamesToStreamers: import("drizzle-orm").Many<"games_to_streamers">;
    gamesToTags: import("drizzle-orm").Many<"games_to_tags">;
}>;
export declare const blogPostsToTagsRelations: import("drizzle-orm").Relations<"blog_posts_to_tags", {
    blogPost: import("drizzle-orm").One<"blog_posts", true>;
    tag: import("drizzle-orm").One<"tags", true>;
}>;
export declare const tagsRelations: import("drizzle-orm").Relations<"tags", {
    blogPostsToTags: import("drizzle-orm").Many<"blog_posts_to_tags">;
    gamesToTags: import("drizzle-orm").Many<"games_to_tags">;
}>;
export declare const dataSetsRelations: import("drizzle-orm").Relations<"data_sets", {
    game: import("drizzle-orm").One<"games", false>;
    dataEntries: import("drizzle-orm").Many<"data_entries">;
    gremiusFunctions: import("drizzle-orm").Many<"gremius_functions">;
    webhooksConfigs: import("drizzle-orm").Many<"webhooks_config">;
}>;
export declare const dataEntriesRelations: import("drizzle-orm").Relations<"data_entries", {
    dataSet: import("drizzle-orm").One<"data_sets", true>;
    authUser: import("drizzle-orm").One<"auth_users", false>;
    media: import("drizzle-orm").One<"media", false>;
    contentMetadata: import("drizzle-orm").Many<"content_metadata">;
}>;
export declare const gremiusFunctionsRelations: import("drizzle-orm").Relations<"gremius_functions", {
    dataSet: import("drizzle-orm").One<"data_sets", false>;
    authUser: import("drizzle-orm").One<"auth_users", false>;
    functionExecutions: import("drizzle-orm").Many<"function_executions">;
}>;
export declare const functionExecutionsRelations: import("drizzle-orm").Relations<"function_executions", {
    gremiusFunction: import("drizzle-orm").One<"gremius_functions", true>;
}>;
export declare const gameCollectionEntriesRelations: import("drizzle-orm").Relations<"game_collection_entries", {
    gameCollection: import("drizzle-orm").One<"game_collections", true>;
    game: import("drizzle-orm").One<"games", true>;
}>;
export declare const gameCollectionsRelations: import("drizzle-orm").Relations<"game_collections", {
    gameCollectionEntries: import("drizzle-orm").Many<"game_collection_entries">;
}>;
export declare const gamesToPlatformsRelations: import("drizzle-orm").Relations<"games_to_platforms", {
    game: import("drizzle-orm").One<"games", true>;
    platform: import("drizzle-orm").One<"platforms", true>;
}>;
export declare const platformsRelations: import("drizzle-orm").Relations<"platforms", {
    gamesToPlatforms: import("drizzle-orm").Many<"games_to_platforms">;
    media: import("drizzle-orm").One<"media", false>;
}>;
export declare const gamesToStreamersRelations: import("drizzle-orm").Relations<"games_to_streamers", {
    game: import("drizzle-orm").One<"games", true>;
    streamer: import("drizzle-orm").One<"streamers", true>;
}>;
export declare const streamersRelations: import("drizzle-orm").Relations<"streamers", {
    gamesToStreamers: import("drizzle-orm").Many<"games_to_streamers">;
    media: import("drizzle-orm").One<"media", false>;
}>;
export declare const gamesToTagsRelations: import("drizzle-orm").Relations<"games_to_tags", {
    game: import("drizzle-orm").One<"games", true>;
    tag: import("drizzle-orm").One<"tags", true>;
}>;
export declare const usersRelations: import("drizzle-orm").Relations<"users", {
    media: import("drizzle-orm").One<"media", false>;
}>;
export declare const aiMemoryChunksRelations: import("drizzle-orm").Relations<"ai_memory_chunks", {
    aiMemory: import("drizzle-orm").One<"ai_memories", true>;
}>;
export declare const aiMemoriesRelations: import("drizzle-orm").Relations<"ai_memories", {
    aiMemoryChunks: import("drizzle-orm").Many<"ai_memory_chunks">;
}>;
export declare const reservationsRelations: import("drizzle-orm").Relations<"reservations", {
    room: import("drizzle-orm").One<"rooms", true>;
}>;
export declare const roomsRelations: import("drizzle-orm").Relations<"rooms", {
    reservations: import("drizzle-orm").Many<"reservations">;
    roomAmenities: import("drizzle-orm").Many<"room_amenities">;
}>;
export declare const documentVersionsRelations: import("drizzle-orm").Relations<"document_versions", {
    document: import("drizzle-orm").One<"documents", true>;
}>;
export declare const documentsRelations: import("drizzle-orm").Relations<"documents", {
    documentVersions: import("drizzle-orm").Many<"document_versions">;
}>;
export declare const academyEnrollmentsRelations: import("drizzle-orm").Relations<"academy_enrollments", {
    academyCourse: import("drizzle-orm").One<"academy_courses", true>;
}>;
export declare const academyCoursesRelations: import("drizzle-orm").Relations<"academy_courses", {
    academyEnrollments: import("drizzle-orm").Many<"academy_enrollments">;
    academyQuizzes: import("drizzle-orm").Many<"academy_quizzes">;
    academySatisfactionSurveys: import("drizzle-orm").Many<"academy_satisfaction_surveys">;
    academyTopics: import("drizzle-orm").Many<"academy_topics">;
    academyUserProgresses: import("drizzle-orm").Many<"academy_user_progress">;
}>;
export declare const academyQuizzesRelations: import("drizzle-orm").Relations<"academy_quizzes", {
    academyCourse: import("drizzle-orm").One<"academy_courses", true>;
    academyQuestions: import("drizzle-orm").Many<"academy_questions">;
    academyQuizAttempts: import("drizzle-orm").Many<"academy_quiz_attempts">;
}>;
export declare const academyQuestionsRelations: import("drizzle-orm").Relations<"academy_questions", {
    academyQuizz: import("drizzle-orm").One<"academy_quizzes", true>;
}>;
export declare const academyQuizAttemptsRelations: import("drizzle-orm").Relations<"academy_quiz_attempts", {
    academyQuizz: import("drizzle-orm").One<"academy_quizzes", true>;
}>;
export declare const academySatisfactionSurveysRelations: import("drizzle-orm").Relations<"academy_satisfaction_surveys", {
    academyCourse: import("drizzle-orm").One<"academy_courses", true>;
}>;
export declare const academyTopicsRelations: import("drizzle-orm").Relations<"academy_topics", {
    academyCourse: import("drizzle-orm").One<"academy_courses", true>;
    academyUserProgresses: import("drizzle-orm").Many<"academy_user_progress">;
}>;
export declare const academyUserProgressRelations: import("drizzle-orm").Relations<"academy_user_progress", {
    academyTopic: import("drizzle-orm").One<"academy_topics", true>;
    academyCourse: import("drizzle-orm").One<"academy_courses", true>;
}>;
export declare const webhooksConfigRelations: import("drizzle-orm").Relations<"webhooks_config", {
    dataSet: import("drizzle-orm").One<"data_sets", true>;
    webhooksLogs: import("drizzle-orm").Many<"webhooks_log">;
}>;
export declare const webhooksLogRelations: import("drizzle-orm").Relations<"webhooks_log", {
    webhooksConfig: import("drizzle-orm").One<"webhooks_config", true>;
}>;
export declare const contentMetadataRelations: import("drizzle-orm").Relations<"content_metadata", {
    dataEntry: import("drizzle-orm").One<"data_entries", true>;
    media: import("drizzle-orm").One<"media", false>;
    authUser: import("drizzle-orm").One<"auth_users", false>;
}>;
export declare const agentTraceStepsRelations: import("drizzle-orm").Relations<"agent_trace_steps", {
    agentTrace: import("drizzle-orm").One<"agent_traces", true>;
}>;
export declare const agentTracesRelations: import("drizzle-orm").Relations<"agent_traces", {
    agentTraceSteps: import("drizzle-orm").Many<"agent_trace_steps">;
    agentFeedbacks: import("drizzle-orm").Many<"agent_feedback">;
}>;
export declare const agentFeedbackRelations: import("drizzle-orm").Relations<"agent_feedback", {
    agentTrace: import("drizzle-orm").One<"agent_traces", true>;
    authUser: import("drizzle-orm").One<"auth_users", false>;
}>;
export declare const roomAmenitiesRelations: import("drizzle-orm").Relations<"room_amenities", {
    room: import("drizzle-orm").One<"rooms", true>;
    amenity: import("drizzle-orm").One<"amenities", true>;
}>;
export declare const amenitiesRelations: import("drizzle-orm").Relations<"amenities", {
    roomAmenities: import("drizzle-orm").Many<"room_amenities">;
}>;
//# sourceMappingURL=relations.d.ts.map