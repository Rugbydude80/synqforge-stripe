-- Add provenance link from stories to ingests for Freelancer Mode
alter table if exists public.stories
  add column if not exists ingest_id uuid references public.ingests(id) on delete set null;

create index if not exists stories_ingest_id_idx on public.stories(ingest_id);


