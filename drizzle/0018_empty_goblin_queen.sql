CREATE TYPE "public"."contribution_type" AS ENUM('funding', 'social');--> statement-breakpoint
CREATE TABLE "project_contributions" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"contribution_type" "contribution_type" NOT NULL,
	"amount_cents" numeric,
	"message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "cost_breakdown" SET DEFAULT '{"materials":[],"labor":[],"other":[]}'::jsonb;--> statement-breakpoint
ALTER TABLE "project_contributions" ADD CONSTRAINT "project_contributions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contribution_project_idx" ON "project_contributions" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "contribution_user_idx" ON "project_contributions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "contribution_type_idx" ON "project_contributions" USING btree ("contribution_type");