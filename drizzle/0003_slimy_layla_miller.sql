CREATE TABLE "trees" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"status" text NOT NULL,
	"_loc_lat" numeric NOT NULL,
	"_loc_lng" numeric NOT NULL,
	"_meta_created_by" text NOT NULL,
	"_meta_updated_at" timestamp DEFAULT now() NOT NULL,
	"_meta_created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "Tree_name_idx" ON "trees" USING btree ("name");