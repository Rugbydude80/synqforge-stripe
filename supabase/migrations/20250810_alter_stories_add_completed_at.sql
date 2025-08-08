-- Migration: Alter stories add completed_at and ensure assigned_to FK
-- Date: 2025-08-10

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Add columns if they do not already exist
ALTER TABLE stories
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE NULL,
  ADD COLUMN IF NOT EXISTS assigned_to UUID NULL REFERENCES auth.users(id);

-- RLS: Ensure project members can update stories (including new columns)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'stories' AND policyname = 'Project members can update stories (completed_at/assigned_to)'
  ) THEN
    CREATE POLICY "Project members can update stories (completed_at/assigned_to)"
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


