-- Migration: Create story_watchers table with RLS

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE TABLE IF NOT EXISTS story_watchers (
  story_id UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  PRIMARY KEY (story_id, user_id)
);
ALTER TABLE story_watchers ENABLE ROW LEVEL SECURITY;
-- Only the watcher (auth.uid) can select their own watch rows
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'story_watchers' AND policyname = 'Select own watch rows'
  ) THEN
    CREATE POLICY "Select own watch rows" ON story_watchers
      FOR SELECT
      USING (user_id = auth.uid());
  END IF;
END $$;
-- Project members can insert a watch row for stories in projects they belong to (and only for themselves)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'story_watchers' AND policyname = 'Insert own watch if project member'
  ) THEN
    CREATE POLICY "Insert own watch if project member" ON story_watchers
      FOR INSERT
      WITH CHECK (
        user_id = auth.uid()
        AND EXISTS (
          SELECT 1
          FROM stories
          JOIN project_members ON project_members.project_id = stories.project_id
          WHERE stories.id = story_watchers.story_id
            AND project_members.user_id = auth.uid()
        )
      );
  END IF;
END $$;
-- Project members can delete their own watch rows for stories in projects they belong to
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'story_watchers' AND policyname = 'Delete own watch if project member'
  ) THEN
    CREATE POLICY "Delete own watch if project member" ON story_watchers
      FOR DELETE
      USING (
        user_id = auth.uid()
        AND EXISTS (
          SELECT 1
          FROM stories
          JOIN project_members ON project_members.project_id = stories.project_id
          WHERE stories.id = story_watchers.story_id
            AND project_members.user_id = auth.uid()
        )
      );
  END IF;
END $$;
