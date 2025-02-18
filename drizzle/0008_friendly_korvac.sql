ALTER TABLE "trees" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "trees" CASCADE;--> statement-breakpoint
DROP INDEX "recommendation_fundraiser_idx";--> statement-breakpoint
DROP INDEX "recommendation_category_idx";--> statement-breakpoint
DROP INDEX "recommendation_status_idx";