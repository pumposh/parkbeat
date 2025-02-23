ALTER TABLE "project_suggestions" ALTER COLUMN "estimated_cost" SET DEFAULT 'null'::jsonb;--> statement-breakpoint
ALTER TABLE "project_suggestions" ALTER COLUMN "estimated_cost" DROP NOT NULL;