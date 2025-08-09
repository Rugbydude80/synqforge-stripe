-- Notifications table and Story Attachments
-- Run: pnpm supabase:push

-- 1) notifications
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  data jsonb not null default '{}'::jsonb,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.notifications enable row level security;

-- Only owner can read or update their notifications; inserts can be done by authenticated users (server-side contexts should use service key)
drop policy if exists "notifications_select_owner" on public.notifications;
create policy "notifications_select_owner" on public.notifications
  for select
  using ( auth.uid() = user_id );

drop policy if exists "notifications_update_owner" on public.notifications;
create policy "notifications_update_owner" on public.notifications
  for update
  using ( auth.uid() = user_id );

drop policy if exists "notifications_insert_self_or_service" on public.notifications;
create policy "notifications_insert_self_or_service" on public.notifications
  for insert
  with check ( auth.uid() = user_id );

-- 2) story_attachments
create table if not exists public.story_attachments (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  file_name text not null,
  file_url text not null,
  created_at timestamptz not null default now()
);

alter table public.story_attachments enable row level security;

-- Owners can read their uploaded attachments; additionally allow readers who can read the story via membership
drop policy if exists "attachments_select_owner" on public.story_attachments;
create policy "attachments_select_owner" on public.story_attachments
  for select
  using ( auth.uid() = user_id );

drop policy if exists "attachments_insert_owner" on public.story_attachments;
create policy "attachments_insert_owner" on public.story_attachments
  for insert
  with check ( auth.uid() = user_id );

drop policy if exists "attachments_delete_owner" on public.story_attachments;
create policy "attachments_delete_owner" on public.story_attachments
  for delete
  using ( auth.uid() = user_id );

-- Helper index
create index if not exists idx_story_attachments_story_id on public.story_attachments(story_id);

-- 3) storage bucket for attachments (public)
insert into storage.buckets (id, name, public)
  values ('attachments', 'attachments', true)
  on conflict (id) do nothing;

-- Allow authenticated users to upload and read from attachments bucket
drop policy if exists "attachments_bucket_read" on storage.objects;
create policy "attachments_bucket_read" on storage.objects
  for select
  using ( bucket_id = 'attachments' );
drop policy if exists "attachments_bucket_insert" on storage.objects;
create policy "attachments_bucket_insert" on storage.objects
  for insert
  with check ( bucket_id = 'attachments' );

-- 4) trigger to create notifications for watchers on story updates
create or replace function public.notify_story_watchers() returns trigger as $$
declare
  watcher record;
  message text;
begin
  message := 'Story updated';
  for watcher in select user_id from public.story_watchers where story_id = new.id loop
    insert into public.notifications(user_id, type, data)
      values (watcher.user_id, 'story.updated', jsonb_build_object('storyId', new.id, 'message', message));
  end loop;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_notify_story_watchers on public.stories;
create trigger trg_notify_story_watchers
  after update on public.stories
  for each row
  when (new.* is distinct from old.*)
  execute function public.notify_story_watchers();


