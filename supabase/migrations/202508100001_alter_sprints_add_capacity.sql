-- Migration: Alter sprints add capacity_points
-- Date: 2025-08-10

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

ALTER TABLE sprints
  ADD COLUMN IF NOT EXISTS capacity_points INTEGER NOT NULL DEFAULT 0;


