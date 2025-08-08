-- Migration: Alter stories to add points, due_date (and keep assigned_to)
--
-- Adds agile story point estimation and due dates to the core stories table.
-- Also ensures RLS permits project members to update these fields.

-- Ensure UUID extension exists (harmless if already present)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ========================
-- Alter stories
-- ========================
ALTER TABLE stories
  ADD COLUMN IF NOT EXISTS points INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS due_date DATE NULL;

-- RLS: Make sure updates are allowed for project members (idempotent)
CREATE POLICY IF NOT EXISTS "Project members can update stories (points/due_date)"
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


