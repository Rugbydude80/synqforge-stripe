export type Story = {
  id: string;
  title: string;
  content: string;
  authorId: string;
  createdAt: string; // ISO
  updatedAt?: string; // ISO
  organisationId?: string;
  metadata?: Record<string, unknown>;
};

export type Organisation = {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  createdAt: string; // ISO
  updatedAt?: string; // ISO
  metadata?: Record<string, unknown>;
};


