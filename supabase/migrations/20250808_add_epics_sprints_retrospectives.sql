-- Migration: Add epics, sprints and retrospectives tables and extend stories
--
-- This migration introduces support for epics, sprints and retrospective
-- documents within SynqForge.  Epics represent higher‑level
-- functionality and group multiple tasks (stories).  Sprints organise
-- work into timeboxed iterations, and retrospectives capture a
-- summary and lessons learned after a sprint concludes.  Tasks
-- (stories) are extended with references to their parent epic and
-- sprint.

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ========================
-- Table: epics
-- ========================
CREATE TABLE IF NOT EXISTS epics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on epics
ALTER TABLE epics ENABLE ROW LEVEL SECURITY;

-- Policy: project members can access epics
CREATE POLICY "Project members can access epics"
  ON epics
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM project_members
      WHERE project_members.user_id = auth.uid()
        AND project_members.project_id = epics.project_id
    )
  );

-- ========================
-- Table: sprints
-- ========================
CREATE TABLE IF NOT EXISTS sprints (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  goal TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'planning',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on sprints
ALTER TABLE sprints ENABLE ROW LEVEL SECURITY;

-- Policy: project members can access sprints
CREATE POLICY "Project members can access sprints"
  ON sprints
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM project_members
      WHERE project_members.user_id = auth.uid()
        AND project_members.project_id = sprints.project_id
    )
  );

-- ========================
-- Table: retrospectives
-- ========================
CREATE TABLE IF NOT EXISTS retrospectives (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sprint_id UUID NOT NULL REFERENCES sprints(id) ON DELETE CASCADE,
  summary TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on retrospectives
ALTER TABLE retrospectives ENABLE ROW LEVEL SECURITY;

-- Policy: project members can access retrospectives via sprints
CREATE POLICY "Project members can access retrospectives"
  ON retrospectives
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM sprints
        JOIN project_members ON project_members.project_id = sprints.project_id
      WHERE sprints.id = retrospectives.sprint_id
        AND project_members.user_id = auth.uid()
    )
  );

-- ========================
-- Extend stories table
-- ========================
ALTER TABLE stories
  ADD COLUMN IF NOT EXISTS epic_id UUID REFERENCES epics(id),
  ADD COLUMN IF NOT EXISTS sprint_id UUID REFERENCES sprints(id);

-- RLS policy update: ensure project members can update stories
-- This complements the existing access policy for stories.
CREATE POLICY IF NOT EXISTS "Project members can update stories"
  ON stories
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM project_members
      WHERE project_members.user_id = auth.uid()
        AND project_members.project_id = stories.project_id
    )
  );