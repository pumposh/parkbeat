ALTER TABLE "projects" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "projects" CASCADE;--> statement-breakpoint

--> statement-breakpoint
ALTER TABLE "project_images" DROP CONSTRAINT "project_images_project_id_trees_id_fk";
--> statement-breakpoint
DROP INDEX "recommendation_fundraiser_idx";--> statement-breakpoint
DROP INDEX "recommendation_category_idx";--> statement-breakpoint
DROP INDEX "recommendation_status_idx";--> statement-breakpoint
DROP INDEX "estimate_version_idx";--> statement-breakpoint
ALTER TABLE "cost_estimates" ADD CONSTRAINT "cost_estimates_project_id_trees_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."trees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_images" ADD CONSTRAINT "project_images_project_id_trees_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."trees"("id") ON DELETE cascade ON UPDATE no action;