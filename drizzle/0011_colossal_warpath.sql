-- First, validate and update any invalid status values
UPDATE "projects"
SET "status" = 'draft'
WHERE "status" NOT IN ('draft', 'active', 'funded', 'completed', 'archived');

-- Now convert the column to use the enum
ALTER TABLE "projects" 
  ALTER COLUMN "status" TYPE project_status 
  USING CASE "status"
    WHEN 'draft' THEN 'draft'::project_status
    WHEN 'active' THEN 'active'::project_status
    WHEN 'funded' THEN 'funded'::project_status
    WHEN 'completed' THEN 'completed'::project_status
    WHEN 'archived' THEN 'archived'::project_status
    ELSE 'draft'::project_status
  END;

-- Restore indexes
CREATE INDEX IF NOT EXISTS "project_status_idx" ON "projects" USING btree ("status");
CREATE INDEX IF NOT EXISTS "project_fundraiser_idx" ON "projects" USING btree ("fundraiser_id"); 