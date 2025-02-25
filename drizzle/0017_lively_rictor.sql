DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'project_status') THEN
        CREATE TYPE "project_status" AS ENUM ('draft', 'active', 'funded', 'completed', 'archived');
    END IF;
END $$;
--> statement-breakpoint
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'project_category') THEN
        CREATE TYPE "project_category" AS ENUM ('urban_greening', 'park_improvement', 'community_garden', 'playground', 'public_art', 'sustainability', 'accessibility', 'other');
    END IF;
END $$;
--> statement-breakpoint
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE "user_role" AS ENUM ('donor', 'fundraiser', 'both');
    END IF;
END $$;
--> statement-breakpoint
CREATE TABLE "project_cost_items" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"quantity" numeric,
	"unit" text,
	"unit_cost" numeric,
	"total_cost" numeric NOT NULL,
	"is_required" boolean DEFAULT true,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "project_cost_revisions" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"revision_number" numeric NOT NULL,
	"previous_total" numeric,
	"new_total" numeric NOT NULL,
	"change_reason" text,
	"changed_items" jsonb,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
ALTER TABLE "project_suggestions" DROP CONSTRAINT "project_suggestions_project_id_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "project_suggestions" ALTER COLUMN "project_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "project_suggestions" ALTER COLUMN "images" SET DEFAULT '{"generated":[],"source":{},"upscaled":{},"status":{"isUpscaling":false,"isGenerating":false,"lastError":null}}'::jsonb;--> statement-breakpoint
ALTER TABLE "project_suggestions" ALTER COLUMN "category" TYPE project_category USING CASE 
    WHEN category = 'urban_greening' THEN 'urban_greening'::project_category
    WHEN category = 'park_improvement' THEN 'park_improvement'::project_category
    WHEN category = 'community_garden' THEN 'community_garden'::project_category
    WHEN category = 'playground' THEN 'playground'::project_category
    WHEN category = 'public_art' THEN 'public_art'::project_category
    WHEN category = 'sustainability' THEN 'sustainability'::project_category
    WHEN category = 'accessibility' THEN 'accessibility'::project_category
    ELSE 'other'::project_category
END;--> statement-breakpoint
ALTER TABLE "project_suggestions" ALTER COLUMN "reasoning_context" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "project_suggestions" ALTER COLUMN "reasoning_context" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "project_suggestions" ALTER COLUMN "summary" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "category" project_category NOT NULL DEFAULT 'other'::project_category;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "summary" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "space_assessment" jsonb DEFAULT '{"size":null,"access":null,"complexity":null,"constraints":[]}'::jsonb;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "total_cost" numeric;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "cost_breakdown" jsonb DEFAULT '{"materials":[],"labor":{"rate":null,"hours":null,"skill_level":null},"other":[]}'::jsonb;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "skill_requirements" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "timeline_estimate" jsonb DEFAULT '{"start_date":null,"duration_days":null,"key_milestones":[]}'::jsonb;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "source_suggestion_id" text;--> statement-breakpoint
ALTER TABLE "project_cost_items" ADD CONSTRAINT "project_cost_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_cost_revisions" ADD CONSTRAINT "project_cost_revisions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cost_item_project_idx" ON "project_cost_items" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "cost_item_type_idx" ON "project_cost_items" USING btree ("type");--> statement-breakpoint
CREATE INDEX "cost_revision_project_idx" ON "project_cost_revisions" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "cost_revision_number_idx" ON "project_cost_revisions" USING btree ("revision_number");--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_source_suggestion_id_project_suggestions_id_fk" FOREIGN KEY ("source_suggestion_id") REFERENCES "public"."project_suggestions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_category_idx" ON "projects" USING btree ("category");