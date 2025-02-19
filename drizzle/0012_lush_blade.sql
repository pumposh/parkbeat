CREATE TABLE "project_suggestions" (
	"id" text PRIMARY KEY NOT NULL,
	"fundraiser_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"project_id" text NOT NULL,
	"image_prompt" text NOT NULL,
	"generated_image_url" text,
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
ALTER TABLE "ai_recommendations" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "ai_recommendations" CASCADE;--> statement-breakpoint
ALTER TABLE "project_images" ADD COLUMN "suggestion_id" text;--> statement-breakpoint
ALTER TABLE "project_suggestions" ADD CONSTRAINT "project_suggestions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_suggestions_project_idx" ON "project_suggestions" USING btree ("project_id");--> statement-breakpoint
ALTER TABLE "project_images" ADD CONSTRAINT "project_images_suggestion_id_project_suggestions_id_fk" FOREIGN KEY ("suggestion_id") REFERENCES "public"."project_suggestions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "image_suggestion_idx" ON "project_images" USING btree ("suggestion_id");