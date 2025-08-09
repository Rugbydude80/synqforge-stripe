-- Migration: Add tags to retrospectives for categorised lessons

ALTER TABLE retrospectives
  ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '{}'::jsonb;
-- RLS already allows project members to update retrospectives; no changes needed.;
