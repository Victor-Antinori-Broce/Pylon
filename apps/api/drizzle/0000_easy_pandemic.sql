CREATE TYPE "public"."blog_status" AS ENUM('draft', 'published', 'scheduled');--> statement-breakpoint
CREATE TYPE "public"."content_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."execution_status" AS ENUM('pending', 'running', 'success', 'error', 'timeout', 'killed');--> statement-breakpoint
CREATE TYPE "public"."function_status" AS ENUM('active', 'inactive', 'error');--> statement-breakpoint
CREATE TYPE "public"."function_trigger" AS ENUM('on_entry_created', 'on_entry_updated', 'on_entry_deleted', 'on_post_published', 'cron', 'manual', 'webhook_incoming');--> statement-breakpoint
CREATE TYPE "public"."streamer_platform" AS ENUM('twitch', 'youtube', 'kick');--> statement-breakpoint
CREATE TYPE "public"."tag_category" AS ENUM('genre', 'feature', 'topic', 'series');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'editor', 'user');--> statement-breakpoint
CREATE TYPE "public"."reservation_status" AS ENUM('pending', 'confirmed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."document_status" AS ENUM('DRAFT', 'APPROVED');--> statement-breakpoint
CREATE TYPE "public"."version_status" AS ENUM('active', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."academy_course_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."academy_enrollment_status" AS ENUM('enrolled', 'in_progress', 'completed');--> statement-breakpoint
CREATE TYPE "public"."webhook_event" AS ENUM('on_create', 'on_update', 'on_delete');--> statement-breakpoint
CREATE TYPE "public"."connector_type" AS ENUM('api', 'database');--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"key_hash" text NOT NULL,
	"hint" varchar(20) NOT NULL,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_by_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "auth_users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "auth_verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blog_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(500) NOT NULL,
	"slug" varchar(500) NOT NULL,
	"content" jsonb,
	"excerpt" text,
	"status" "blog_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"author_id" text NOT NULL,
	"featured_image_id" uuid,
	"reading_time" integer,
	"seo_overrides" jsonb,
	"blocks" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blog_posts_to_games" (
	"post_id" uuid NOT NULL,
	"game_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blog_posts_to_tags" (
	"post_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(500) NOT NULL,
	"data_set_id" uuid NOT NULL,
	"owner_id" text,
	"data" jsonb NOT NULL,
	"thumbnail_id" uuid,
	"sort_order" integer DEFAULT 0,
	"status" "content_status" DEFAULT 'published' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"slug" varchar(200) NOT NULL,
	"description" text,
	"game_id" uuid,
	"icon" varchar(10),
	"schema" jsonb NOT NULL,
	"display_config" jsonb,
	"policy_json" jsonb,
	"workflow_json" jsonb,
	"content_config" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "formulas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kpi_name" varchar(200) NOT NULL,
	"formula_type" varchar(50) DEFAULT 'custom' NOT NULL,
	"expression" text NOT NULL,
	"threshold" real DEFAULT 95,
	"description" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "function_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"function_id" uuid NOT NULL,
	"status" "execution_status" DEFAULT 'pending' NOT NULL,
	"trigger_event" varchar(100),
	"trigger_payload" jsonb,
	"logs" text,
	"result" jsonb,
	"error_message" text,
	"duration_ms" integer,
	"memory_used_bytes" integer,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_collection_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"collection_id" uuid NOT NULL,
	"game_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(200) NOT NULL,
	"slug" varchar(200) NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(500) NOT NULL,
	"slug" varchar(500) NOT NULL,
	"subtitle" varchar(500),
	"description" jsonb,
	"excerpt" text,
	"release_date" date,
	"status" "content_status" DEFAULT 'draft' NOT NULL,
	"developer" varchar(200),
	"publisher" varchar(200),
	"metacritic_score" integer,
	"user_rating" real,
	"cover_art_id" uuid,
	"trailer_url" text,
	"external_ids" jsonb,
	"specs" jsonb,
	"screenshots" jsonb,
	"blocks" jsonb DEFAULT '[]'::jsonb,
	"is_featured_on_home" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "games_to_platforms" (
	"game_id" uuid NOT NULL,
	"platform_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "games_to_streamers" (
	"game_id" uuid NOT NULL,
	"streamer_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "games_to_tags" (
	"game_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gremius_functions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"slug" varchar(200) NOT NULL,
	"description" text,
	"code" text NOT NULL,
	"trigger" "function_trigger" NOT NULL,
	"cron_expression" varchar(100),
	"watch_dataset_id" uuid,
	"timeout_ms" integer DEFAULT 5000 NOT NULL,
	"memory_limit_mb" integer DEFAULT 64 NOT NULL,
	"status" "function_status" DEFAULT 'active' NOT NULL,
	"env_vars" jsonb DEFAULT '{}'::jsonb,
	"last_executed_at" timestamp with time zone,
	"last_error" text,
	"execution_count" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"filename" varchar(500) NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"s3_key" varchar(1000) NOT NULL,
	"url" text NOT NULL,
	"alt" varchar(500) DEFAULT '',
	"caption" text,
	"width" integer,
	"height" integer,
	"size" integer,
	"uploaded_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "modules" (
	"key" varchar(100) PRIMARY KEY NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text,
	"icon" varchar(50),
	"category" varchar(100),
	"enabled" boolean DEFAULT false NOT NULL,
	"realm_id" varchar(100),
	"settings" jsonb DEFAULT '{}'::jsonb,
	"sidebar_path" varchar(200),
	"sidebar_icon" varchar(50),
	"sidebar_badge" varchar(50),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platforms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"short_name" varchar(20),
	"manufacturer" varchar(100),
	"icon_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_name" varchar(200) DEFAULT 'GremiusCMS' NOT NULL,
	"site_description" text,
	"site_url" text DEFAULT 'http://localhost:4321' NOT NULL,
	"branding" jsonb,
	"main_nav" jsonb,
	"social" jsonb,
	"analytics" jsonb,
	"active_theme" varchar(100),
	"footer_text" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "streamers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"display_name" varchar(200) NOT NULL,
	"slug" varchar(200) NOT NULL,
	"platform" "streamer_platform" NOT NULL,
	"channel_id" varchar(200) NOT NULL,
	"channel_url" text,
	"is_live" boolean DEFAULT false,
	"current_stream_title" text,
	"viewer_count" integer DEFAULT 0,
	"follower_count" integer DEFAULT 0,
	"avatar_id" uuid,
	"thumbnail_url" text,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"color" varchar(7),
	"category" "tag_category",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" text NOT NULL,
	"display_name" varchar(100) NOT NULL,
	"role" "user_role" DEFAULT 'editor' NOT NULL,
	"avatar_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "ai_memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(1536),
	"metadata" jsonb,
	"memory_type" varchar(50) DEFAULT 'knowledge' NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ai_memory_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"memory_id" uuid NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(1536),
	"chunk_index" integer NOT NULL,
	"total_chunks" integer NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "amenities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"start_time" timestamp with time zone NOT NULL,
	"end_time" timestamp with time zone NOT NULL,
	"status" "reservation_status" DEFAULT 'confirmed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "room_amenities" (
	"room_id" uuid NOT NULL,
	"amenity_id" uuid NOT NULL,
	CONSTRAINT "room_amenities_room_id_amenity_id_pk" PRIMARY KEY("room_id","amenity_id")
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"capacity" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_profile" (
	"user_id" text PRIMARY KEY NOT NULL,
	"departamento" varchar(200),
	"cargo" varchar(200),
	"celular" varchar(30),
	"jefe_directo" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"version_number" varchar(20) NOT NULL,
	"file_url" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"version_status" "version_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(300) NOT NULL,
	"target_department" varchar(200) NOT NULL,
	"status" "document_status" DEFAULT 'DRAFT' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "academy_courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(300) NOT NULL,
	"slug" varchar(300) NOT NULL,
	"description" text,
	"content" jsonb,
	"thumbnail_url" text,
	"status" "academy_course_status" DEFAULT 'draft' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "academy_enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"course_id" uuid NOT NULL,
	"status" "academy_enrollment_status" DEFAULT 'enrolled' NOT NULL,
	"topics_completed" integer DEFAULT 0 NOT NULL,
	"enrolled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "academy_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quiz_id" uuid NOT NULL,
	"question_text" text NOT NULL,
	"options" jsonb NOT NULL,
	"correct_option_index" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "academy_quiz_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"quiz_id" uuid NOT NULL,
	"score" real NOT NULL,
	"passed" boolean NOT NULL,
	"total_questions" integer NOT NULL,
	"correct_answers" integer NOT NULL,
	"answers" jsonb NOT NULL,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "academy_quizzes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"title" varchar(300) NOT NULL,
	"description" text,
	"passing_score" real DEFAULT 70 NOT NULL,
	"max_attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "academy_satisfaction_surveys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"course_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"comments" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "academy_topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"title" varchar(300) NOT NULL,
	"content" jsonb,
	"video_url" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "academy_user_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"topic_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhooks_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"dataset_id" uuid NOT NULL,
	"event" "webhook_event" NOT NULL,
	"target_url" text NOT NULL,
	"secret" varchar(255),
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhooks_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"webhook_id" uuid NOT NULL,
	"event" varchar(50) NOT NULL,
	"payload" jsonb NOT NULL,
	"status_code" integer,
	"response_body" text,
	"success" boolean NOT NULL,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"duration_ms" integer
);
--> statement-breakpoint
CREATE TABLE "content_metadata" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"slug" varchar(500) NOT NULL,
	"published_at" timestamp with time zone,
	"seo_metadata" jsonb,
	"featured_image_id" uuid,
	"author_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_connectors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"type" "connector_type" NOT NULL,
	"config" jsonb NOT NULL,
	"last_synced_at" timestamp with time zone,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_created_by_id_auth_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_accounts" ADD CONSTRAINT "auth_accounts_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_posts" ADD CONSTRAINT "blog_posts_author_id_auth_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."auth_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_posts" ADD CONSTRAINT "blog_posts_featured_image_id_media_id_fk" FOREIGN KEY ("featured_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_posts_to_games" ADD CONSTRAINT "blog_posts_to_games_post_id_blog_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."blog_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_posts_to_games" ADD CONSTRAINT "blog_posts_to_games_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_posts_to_tags" ADD CONSTRAINT "blog_posts_to_tags_post_id_blog_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."blog_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_posts_to_tags" ADD CONSTRAINT "blog_posts_to_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_entries" ADD CONSTRAINT "data_entries_data_set_id_data_sets_id_fk" FOREIGN KEY ("data_set_id") REFERENCES "public"."data_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_entries" ADD CONSTRAINT "data_entries_owner_id_auth_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_entries" ADD CONSTRAINT "data_entries_thumbnail_id_media_id_fk" FOREIGN KEY ("thumbnail_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_sets" ADD CONSTRAINT "data_sets_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "function_executions" ADD CONSTRAINT "function_executions_function_id_gremius_functions_id_fk" FOREIGN KEY ("function_id") REFERENCES "public"."gremius_functions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_collection_entries" ADD CONSTRAINT "game_collection_entries_collection_id_game_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."game_collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_collection_entries" ADD CONSTRAINT "game_collection_entries_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_cover_art_id_media_id_fk" FOREIGN KEY ("cover_art_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games_to_platforms" ADD CONSTRAINT "games_to_platforms_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games_to_platforms" ADD CONSTRAINT "games_to_platforms_platform_id_platforms_id_fk" FOREIGN KEY ("platform_id") REFERENCES "public"."platforms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games_to_streamers" ADD CONSTRAINT "games_to_streamers_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games_to_streamers" ADD CONSTRAINT "games_to_streamers_streamer_id_streamers_id_fk" FOREIGN KEY ("streamer_id") REFERENCES "public"."streamers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games_to_tags" ADD CONSTRAINT "games_to_tags_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games_to_tags" ADD CONSTRAINT "games_to_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gremius_functions" ADD CONSTRAINT "gremius_functions_watch_dataset_id_data_sets_id_fk" FOREIGN KEY ("watch_dataset_id") REFERENCES "public"."data_sets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gremius_functions" ADD CONSTRAINT "gremius_functions_created_by_id_auth_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."auth_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_uploaded_by_id_auth_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."auth_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platforms" ADD CONSTRAINT "platforms_icon_id_media_id_fk" FOREIGN KEY ("icon_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "streamers" ADD CONSTRAINT "streamers_avatar_id_media_id_fk" FOREIGN KEY ("avatar_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_avatar_id_media_id_fk" FOREIGN KEY ("avatar_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_memory_chunks" ADD CONSTRAINT "ai_memory_chunks_memory_id_ai_memories_id_fk" FOREIGN KEY ("memory_id") REFERENCES "public"."ai_memories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_amenities" ADD CONSTRAINT "room_amenities_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_amenities" ADD CONSTRAINT "room_amenities_amenity_id_amenities_id_fk" FOREIGN KEY ("amenity_id") REFERENCES "public"."amenities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_enrollments" ADD CONSTRAINT "academy_enrollments_course_id_academy_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."academy_courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_questions" ADD CONSTRAINT "academy_questions_quiz_id_academy_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."academy_quizzes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_quiz_attempts" ADD CONSTRAINT "academy_quiz_attempts_quiz_id_academy_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."academy_quizzes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_quizzes" ADD CONSTRAINT "academy_quizzes_course_id_academy_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."academy_courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_satisfaction_surveys" ADD CONSTRAINT "academy_satisfaction_surveys_course_id_academy_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."academy_courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_topics" ADD CONSTRAINT "academy_topics_course_id_academy_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."academy_courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_user_progress" ADD CONSTRAINT "academy_user_progress_topic_id_academy_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."academy_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_user_progress" ADD CONSTRAINT "academy_user_progress_course_id_academy_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."academy_courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhooks_config" ADD CONSTRAINT "webhooks_config_dataset_id_data_sets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."data_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhooks_log" ADD CONSTRAINT "webhooks_log_webhook_id_webhooks_config_id_fk" FOREIGN KEY ("webhook_id") REFERENCES "public"."webhooks_config"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_metadata" ADD CONSTRAINT "content_metadata_entry_id_data_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."data_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_metadata" ADD CONSTRAINT "content_metadata_featured_image_id_media_id_fk" FOREIGN KEY ("featured_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_metadata" ADD CONSTRAINT "content_metadata_author_id_auth_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."auth_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "blog_slug_idx" ON "blog_posts" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "blog_status_idx" ON "blog_posts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "blog_published_idx" ON "blog_posts" USING btree ("published_at");--> statement-breakpoint
CREATE UNIQUE INDEX "bg_unique" ON "blog_posts_to_games" USING btree ("post_id","game_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bt_unique" ON "blog_posts_to_tags" USING btree ("post_id","tag_id");--> statement-breakpoint
CREATE INDEX "entries_dataset_idx" ON "data_entries" USING btree ("data_set_id");--> statement-breakpoint
CREATE INDEX "entries_sort_idx" ON "data_entries" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX "entries_owner_idx" ON "data_entries" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "datasets_slug_idx" ON "data_sets" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "fe_function_idx" ON "function_executions" USING btree ("function_id");--> statement-breakpoint
CREATE INDEX "fe_status_idx" ON "function_executions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "fe_created_idx" ON "function_executions" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "gce_unique" ON "game_collection_entries" USING btree ("collection_id","game_id");--> statement-breakpoint
CREATE UNIQUE INDEX "gc_slug_idx" ON "game_collections" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "games_slug_idx" ON "games" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "games_status_idx" ON "games" USING btree ("status");--> statement-breakpoint
CREATE INDEX "games_metacritic_idx" ON "games" USING btree ("metacritic_score");--> statement-breakpoint
CREATE INDEX "games_release_idx" ON "games" USING btree ("release_date");--> statement-breakpoint
CREATE UNIQUE INDEX "gp_unique" ON "games_to_platforms" USING btree ("game_id","platform_id");--> statement-breakpoint
CREATE UNIQUE INDEX "gs_unique" ON "games_to_streamers" USING btree ("game_id","streamer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "gt_unique" ON "games_to_tags" USING btree ("game_id","tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pf_slug_idx" ON "gremius_functions" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "pf_trigger_idx" ON "gremius_functions" USING btree ("trigger");--> statement-breakpoint
CREATE INDEX "pf_status_idx" ON "gremius_functions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "pf_dataset_idx" ON "gremius_functions" USING btree ("watch_dataset_id");--> statement-breakpoint
CREATE UNIQUE INDEX "media_s3key_idx" ON "media" USING btree ("s3_key");--> statement-breakpoint
CREATE UNIQUE INDEX "platforms_slug_idx" ON "platforms" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "streamers_slug_idx" ON "streamers" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "streamers_platform_idx" ON "streamers" USING btree ("platform");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_slug_idx" ON "tags" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "ai_memories_embedding_idx" ON "ai_memories" USING ivfflat ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "ai_memories_type_idx" ON "ai_memories" USING btree ("memory_type");--> statement-breakpoint
CREATE INDEX "ai_memories_created_idx" ON "ai_memories" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ai_chunks_embedding_idx" ON "ai_memory_chunks" USING ivfflat ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "ai_chunks_memory_idx" ON "ai_memory_chunks" USING btree ("memory_id");--> statement-breakpoint
CREATE UNIQUE INDEX "employee_profile_user_id_idx" ON "employee_profile" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "dv_document_idx" ON "document_versions" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "dv_active_idx" ON "document_versions" USING btree ("document_id","is_active");--> statement-breakpoint
CREATE INDEX "docs_status_idx" ON "documents" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "ac_slug_idx" ON "academy_courses" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "ac_status_idx" ON "academy_courses" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "ae_user_course_idx" ON "academy_enrollments" USING btree ("user_id","course_id");--> statement-breakpoint
CREATE INDEX "ae_user_idx" ON "academy_enrollments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "aqq_quiz_idx" ON "academy_questions" USING btree ("quiz_id");--> statement-breakpoint
CREATE INDEX "aqq_sort_idx" ON "academy_questions" USING btree ("quiz_id","sort_order");--> statement-breakpoint
CREATE INDEX "aqa_user_idx" ON "academy_quiz_attempts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "aqa_quiz_idx" ON "academy_quiz_attempts" USING btree ("quiz_id");--> statement-breakpoint
CREATE INDEX "aq_course_idx" ON "academy_quizzes" USING btree ("course_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ass_user_course_idx" ON "academy_satisfaction_surveys" USING btree ("user_id","course_id");--> statement-breakpoint
CREATE INDEX "at_course_idx" ON "academy_topics" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "at_sort_idx" ON "academy_topics" USING btree ("course_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "aup_user_topic_idx" ON "academy_user_progress" USING btree ("user_id","topic_id");--> statement-breakpoint
CREATE INDEX "aup_user_course_idx" ON "academy_user_progress" USING btree ("user_id","course_id");--> statement-breakpoint
CREATE INDEX "wh_config_dataset_idx" ON "webhooks_config" USING btree ("dataset_id");--> statement-breakpoint
CREATE INDEX "wh_config_event_idx" ON "webhooks_config" USING btree ("event");--> statement-breakpoint
CREATE INDEX "wh_log_webhook_idx" ON "webhooks_log" USING btree ("webhook_id");--> statement-breakpoint
CREATE INDEX "wh_log_attempted_idx" ON "webhooks_log" USING btree ("attempted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cm_entry_unique" ON "content_metadata" USING btree ("entry_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cm_slug_unique" ON "content_metadata" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "cm_published_idx" ON "content_metadata" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "connectors_type_idx" ON "data_connectors" USING btree ("type");