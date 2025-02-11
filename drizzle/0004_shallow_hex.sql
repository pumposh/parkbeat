CREATE TYPE "public"."tree_status" AS ENUM('draft', 'live', 'archived');--> statement-breakpoint
ALTER TABLE "trees" ALTER COLUMN "status" SET DATA TYPE tree_status;