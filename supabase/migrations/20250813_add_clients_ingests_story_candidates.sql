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

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'clients' AND policyname = 'clients_owner_select'
  ) THEN
    CREATE POLICY "clients_owner_select"
      ON public.clients FOR SELECT
      USING (created_by = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'clients' AND policyname = 'clients_owner_cud'
  ) THEN
    CREATE POLICY "clients_owner_cud"
      ON public.clients FOR ALL TO authenticated
      USING (created_by = auth.uid())
      WITH CHECK (created_by = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ingests' AND policyname = 'ingests_owner_select'
  ) THEN
    CREATE POLICY "ingests_owner_select"
      ON public.ingests FOR SELECT
      USING (
        created_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.created_by = auth.uid()
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ingests' AND policyname = 'ingests_owner_cud'
  ) THEN
    CREATE POLICY "ingests_owner_cud"
      ON public.ingests FOR ALL TO authenticated
      USING (created_by = auth.uid())
      WITH CHECK (created_by = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'story_candidates' AND policyname = 'candidates_owner_select'
  ) THEN
    CREATE POLICY "candidates_owner_select"
      ON public.story_candidates FOR SELECT
      USING (
        created_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.created_by = auth.uid()
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'story_candidates' AND policyname = 'candidates_owner_cud'
  ) THEN
    CREATE POLICY "candidates_owner_cud"
      ON public.story_candidates FOR ALL TO authenticated
      USING (created_by = auth.uid())
      WITH CHECK (created_by = auth.uid());
  END IF;
END $$;

-- Storage policies for private bucket 'ingest'
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'ingest_read_own'
  ) THEN
    CREATE POLICY "ingest_read_own"
      ON storage.objects FOR SELECT TO authenticated
      USING (
        bucket_id = 'ingest' AND (
          owner = auth.uid() OR (storage.foldername(name))[1] = auth.uid()::text
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'ingest_write_own'
  ) THEN
    CREATE POLICY "ingest_write_own"
      ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'ingest' AND (
          owner = auth.uid() OR (storage.foldername(name))[1] = auth.uid()::text
        )
      );
  END IF;
END $$;


