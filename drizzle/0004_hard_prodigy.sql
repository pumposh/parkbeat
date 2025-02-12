DROP INDEX "Tree_name_idx";--> statement-breakpoint
ALTER TABLE "trees" ADD COLUMN "_loc_geohash" text NOT NULL;--> statement-breakpoint
CREATE INDEX "Tree_geohash_idx" ON "trees" USING btree ("_loc_geohash");