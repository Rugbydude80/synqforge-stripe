-- Migration: Alter sprints add analytics columns (story_points_completed, velocity)
-- Date: 2025-08-10

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

ALTER TABLE sprints
  ADD COLUMN IF NOT EXISTS story_points_completed INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS velocity REAL NOT NULL DEFAULT 0;

-- RLS remains covered by existing project members policy on sprints


