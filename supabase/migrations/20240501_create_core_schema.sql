-- Core schema for SynqForge (organisations, user_profiles, projects, project_members, stories)
-- This must run before epics/sprints/retrospectives migrations.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS organisations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  owner_id UUID REFERENCES auth.users(id),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  ai_credits INTEGER DEFAULT 100,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id),
  organisation_id UUID REFERENCES organisations(id) ON DELETE CASCADE,
  role TEXT CHECK (role IN ('owner', 'editor', 'viewer')) NOT NULL DEFAULT 'editor',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organisation_id UUID REFERENCES organisations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS project_members (
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  role TEXT CHECK (role IN ('owner', 'editor', 'viewer')) NOT NULL DEFAULT 'editor',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  PRIMARY KEY (project_id, user_id)
);

CREATE TABLE IF NOT EXISTS stories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT CHECK (status IN ('backlog', 'in_progress', 'review', 'done')) DEFAULT 'backlog',
  assigned_to UUID REFERENCES auth.users(id),
  ai_generated BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- RLS enablement
ALTER TABLE organisations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE stories ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own profile" ON user_profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own profile" ON user_profiles FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Org members can read" ON organisations FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM user_profiles WHERE user_profiles.organisation_id = organisations.id AND user_profiles.user_id = auth.uid()
  )
);
CREATE POLICY "Org owner can update" ON organisations FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM user_profiles WHERE user_profiles.organisation_id = organisations.id AND user_profiles.user_id = auth.uid() AND user_profiles.role = 'owner'
  )
);

CREATE POLICY "Org members can access projects" ON projects FOR ALL USING (
  EXISTS (
    SELECT 1 FROM user_profiles WHERE user_profiles.organisation_id = projects.organisation_id AND user_profiles.user_id = auth.uid()
  )
);

CREATE POLICY "Project access for members" ON project_members FOR ALL USING (
  EXISTS (
    SELECT 1 FROM user_profiles JOIN projects ON projects.organisation_id = user_profiles.organisation_id WHERE user_profiles.user_id = auth.uid() AND project_members.project_id = projects.id
  )
);

CREATE POLICY "Project members can access stories" ON stories FOR ALL USING (
  EXISTS (
    SELECT 1 FROM project_members WHERE project_members.user_id = auth.uid() AND project_members.project_id = stories.project_id
  )
);


