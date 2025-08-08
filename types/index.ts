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
  sprintId?: string | null;
  createdAt: string;
  updatedAt?: string;
  aiGenerated?: boolean;
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


