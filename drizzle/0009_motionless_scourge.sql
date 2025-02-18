ALTER TABLE "projects" RENAME COLUMN "metadata" TO "_meta_created_by";--> statement-breakpoint
ALTER TABLE "projects" RENAME COLUMN "fundraiser_id" TO "_meta_updated_by";--> statement-breakpoint
ALTER TABLE "projects" RENAME COLUMN "updated_at" TO "_meta_updated_at";--> statement-breakpoint
DROP INDEX "project_fundraiser_idx";--> statement-breakpoint
DROP INDEX "project_status_idx";--> statement-breakpoint
DROP INDEX "project_category_idx";--> statement-breakpoint
DROP INDEX "project_location_idx";--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "description" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "name" text NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "_meta_created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "_view_heading" numeric;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "_view_pitch" numeric;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "_view_zoom" numeric;--> statement-breakpoint
CREATE INDEX "project_geohash_idx" ON "projects" USING btree ("_loc_geohash");--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "title";--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "category";--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "target_amount";--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "current_amount";--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "created_at";