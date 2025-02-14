CREATE TYPE "public"."project_category" AS ENUM('urban_greening', 'park_improvement', 'community_garden', 'playground', 'public_art', 'sustainability', 'accessibility', 'other');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('draft', 'active', 'funded', 'completed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('donor', 'fundraiser', 'both');--> statement-breakpoint
CREATE TABLE "ai_recommendations" (
	"id" text PRIMARY KEY NOT NULL,
	"fundraiser_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"category" "project_category" NOT NULL,
	"estimated_cost" jsonb NOT NULL,
	"confidence" numeric NOT NULL,
	"inspiration_images" jsonb,
	"suggested_location" jsonb,
	"reasoning_context" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "cost_estimates" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"version" numeric DEFAULT '1' NOT NULL,
	"total_estimate" numeric NOT NULL,
	"breakdown" jsonb NOT NULL,
	"assumptions" jsonb NOT NULL,
	"confidence_scores" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "project_images" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"type" text NOT NULL,
	"image_url" text NOT NULL,
	"ai_generated_url" text,
	"ai_analysis" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"category" "project_category" NOT NULL,
	"status" "project_status" DEFAULT 'draft' NOT NULL,
	"fundraiser_id" text NOT NULL,
	"target_amount" numeric NOT NULL,
	"current_amount" numeric DEFAULT '0' NOT NULL,
	"_loc_lat" numeric NOT NULL,
	"_loc_lng" numeric NOT NULL,
	"_loc_geohash" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
ALTER TABLE "cost_estimates" ADD CONSTRAINT "cost_estimates_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_images" ADD CONSTRAINT "project_images_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recommendation_fundraiser_idx" ON "ai_recommendations" USING btree ("fundraiser_id");--> statement-breakpoint
CREATE INDEX "recommendation_category_idx" ON "ai_recommendations" USING btree ("category");--> statement-breakpoint
CREATE INDEX "recommendation_status_idx" ON "ai_recommendations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "estimate_project_idx" ON "cost_estimates" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "estimate_version_idx" ON "cost_estimates" USING btree ("version");--> statement-breakpoint
CREATE INDEX "image_project_idx" ON "project_images" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_fundraiser_idx" ON "projects" USING btree ("fundraiser_id");--> statement-breakpoint
CREATE INDEX "project_status_idx" ON "projects" USING btree ("status");--> statement-breakpoint
CREATE INDEX "project_category_idx" ON "projects" USING btree ("category");--> statement-breakpoint
CREATE INDEX "project_location_idx" ON "projects" USING btree ("_loc_geohash");