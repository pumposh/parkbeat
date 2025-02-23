ALTER TABLE "project_images" DROP CONSTRAINT "project_images_suggestion_id_project_suggestions_id_fk";
--> statement-breakpoint
DROP INDEX "image_suggestion_idx";--> statement-breakpoint
ALTER TABLE "project_suggestions" ALTER COLUMN "category" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "project_images" DROP COLUMN "suggestion_id";--> statement-breakpoint
ALTER TABLE "project_images" DROP COLUMN "ai_generated_url";--> statement-breakpoint
ALTER TABLE "project_suggestions" DROP COLUMN "inspiration_images";--> statement-breakpoint
ALTER TABLE "project_suggestions" DROP COLUMN "suggested_location";