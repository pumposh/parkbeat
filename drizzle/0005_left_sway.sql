ALTER TABLE "trees" ADD COLUMN "_meta_updated_by" text;
UPDATE trees SET _meta_updated_by = _meta_created_by;
ALTER TABLE "trees" ALTER COLUMN "_meta_updated_by" SET NOT NULL; 