-- Drop existing tables and types
DROP TABLE IF EXISTS "trees";
DROP TABLE IF EXISTS "posts";
DROP TYPE IF EXISTS "tree_status";

-- Create the tree_status enum type
CREATE TYPE "tree_status" AS ENUM('draft', 'live', 'archived');

-- Create posts table
CREATE TABLE "posts" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

-- Create trees table
CREATE TABLE "trees" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"status" "tree_status" NOT NULL,
	"_loc_lat" numeric NOT NULL,
	"_loc_lng" numeric NOT NULL,
	"_loc_geohash" text NOT NULL,
	"_meta_created_by" text NOT NULL,
	"_meta_updated_at" timestamp DEFAULT now() NOT NULL,
	"_meta_created_at" timestamp DEFAULT now() NOT NULL
);

-- Create indexes
CREATE INDEX "Post_name_idx" ON "posts" USING btree ("name");
CREATE INDEX "Tree_name_idx" ON "trees" USING btree ("name");
CREATE INDEX "Tree_geohash_idx" ON "trees" USING btree ("_loc_geohash");