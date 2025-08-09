-- Migration: Alter stories to add points, due_date (and keep assigned_to)
-- Re-issued with a new version to avoid duplicate schema_migrations key.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
ALTER TABLE stories
  ADD COLUMN IF NOT EXISTS points INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS due_date DATE NULL;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'stories' AND policyname = 'Project members can update stories (points/due_date)'
  ) THEN
    CREATE POLICY "Project members can update stories (points/due_date)"
      ON stories
      FOR UPDATE
      USING (
        EXISTS (
          SELECT 1 FROM project_members
          WHERE project_members.user_id = auth.uid()
            AND project_members.project_id = stories.project_id
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM project_members
          WHERE project_members.user_id = auth.uid()
            AND project_members.project_id = stories.project_id
        )
      );
  END IF;
END $$;
