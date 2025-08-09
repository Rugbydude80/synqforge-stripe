-- Clients a freelancer works for
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  logo_url text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now()
);

-- Raw note uploads / pasted notes / meetings, normalised to text
create table if not exists public.ingests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete cascade,
  source_type text not null check (source_type in ('upload','paste','meeting')),
  filename text,
  mime_type text,
  raw_text text,
  meta jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now()
);

-- AI-extracted story candidates awaiting acceptance
create table if not exists public.story_candidates (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete cascade,
  ingest_id uuid references public.ingests(id) on delete cascade,
  title text not null,
  description text,
  acceptance_criteria jsonb not null default '[]'::jsonb,
  points integer not null default 0,
  priority text not null default 'medium' check (priority in ('low','medium','high')),
  status text not null default 'proposed' check (status in ('proposed','accepted','discarded')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now()
);

-- Ensure stories has points & completed_at for velocity
alter table if exists public.stories
  add column if not exists points integer default 0,
  add column if not exists completed_at timestamptz;

-- Storage bucket for ingests (private)
insert into storage.buckets (id, name, public)
values ('ingest','ingest', false)
on conflict (id) do nothing;

-- RLS
alter table public.clients enable row level security;
alter table public.ingests enable row level security;
alter table public.story_candidates enable row level security;

-- Policies (owner = created_by)
create policy "clients_owner_select"
on public.clients for select
using (created_by = auth.uid());

create policy "clients_owner_cud"
on public.clients for all
to authenticated
using (created_by = auth.uid())
with check (created_by = auth.uid());

create policy "ingests_owner_select"
on public.ingests for select
using (
  created_by = auth.uid()
  or exists (select 1 from public.clients c where c.id = client_id and c.created_by = auth.uid())
);

create policy "ingests_owner_cud"
on public.ingests for all
to authenticated
using (created_by = auth.uid())
with check (created_by = auth.uid());

create policy "candidates_owner_select"
on public.story_candidates for select
using (
  created_by = auth.uid()
  or exists (select 1 from public.clients c where c.id = client_id and c.created_by = auth.uid())
);

create policy "candidates_owner_cud"
on public.story_candidates for all
to authenticated
using (created_by = auth.uid())
with check (created_by = auth.uid());

-- Storage policies for private bucket 'ingest'
create policy "ingest_read_own"
on storage.objects for select to authenticated
using (bucket_id = 'ingest' and (owner = auth.uid() or (storage.foldername(name))[1] = auth.uid()::text));

create policy "ingest_write_own"
on storage.objects for insert to authenticated
with check (bucket_id = 'ingest' and (owner = auth.uid() or (storage.foldername(name))[1] = auth.uid()::text));


