export type Organisation = {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  createdAt: string; // ISO
  updatedAt?: string; // ISO
  metadata?: Record<string, unknown>;
};

export type Project = {
  id: string;
  organisationId: string;
  name: string;
  description?: string | null;
  createdAt: string;
  updatedAt?: string;
};

export type Story = {
  id: string;
  projectId: string;
  title: string;
  description?: string | null;
  status: 'backlog' | 'in_progress' | 'review' | 'done';
  assignedTo?: string | null;
  points?: number; // agile story points
  dueDate?: string | null; // ISO date string (YYYY-MM-DD)
  completedAt?: string | null; // ISO timestamp when completed
  sprintId?: string | null;
  createdAt: string;
  updatedAt?: string;
  aiGenerated?: boolean;
};

export type Client = {
  id: string;
  name: string;
  logoUrl?: string | null;
  createdAt: string;
};

export type Ingest = {
  id: string;
  clientId?: string | null;
  sourceType: 'upload' | 'paste' | 'meeting';
  filename?: string | null;
  mimeType?: string | null;
  rawText?: string | null;
  meta?: Record<string, unknown>;
  createdAt: string;
};

export type StoryCandidate = {
  id: string;
  clientId?: string | null;
  ingestId?: string | null;
  title: string;
  description?: string | null;
  acceptanceCriteria: string[];
  points: number;
  priority: 'low' | 'medium' | 'high';
  status: 'proposed' | 'accepted' | 'discarded';
  createdAt: string;
};

// Epics represent high-level features grouping multiple stories/tasks.
export type Epic = {
  id: string;
  projectId: string;
  name: string;
  description?: string | null;
  status: string;
  createdAt: string;
  updatedAt?: string;
};

// Sprints organise work into timeboxed iterations.
export type Sprint = {
  id: string;
  projectId: string;
  name: string;
  goal?: string | null;
  startDate: string; // ISO date
  endDate: string; // ISO date
  status: string;
  capacityPoints?: number; // capacity target for planning
  storyPointsCompleted?: number; // analytics
  velocity?: number; // points per day
  createdAt: string;
  updatedAt?: string;
};

// Retrospectives capture lessons learned after a sprint.
export type Retrospective = {
  id: string;
  sprintId: string;
  summary?: string | null;
  notes?: string | null;
  createdAt: string;
};

export type UserProfile = {
  userId: string;
  organisationId: string;
  role: 'owner' | 'editor' | 'viewer';
  createdAt: string;
};


