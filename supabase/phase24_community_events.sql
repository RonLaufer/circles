-- Circles phase 24: community events and event images

create table if not exists public.community_events (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 2 and 140),
  description text not null default '',
  location text not null default '',
  starts_at timestamptz not null,
  image_url text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists community_events_community_starts_at_idx
  on public.community_events(community_id, starts_at);

create or replace function public.protect_community_event_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.community_id = old.community_id;
  new.created_by = old.created_by;
  new.created_at = old.created_at;
  return new;
end;
$$;

drop trigger if exists community_events_set_updated_at on public.community_events;
create trigger community_events_set_updated_at
before update on public.community_events
for each row execute function public.set_updated_at();

drop trigger if exists community_events_protect_identity on public.community_events;
create trigger community_events_protect_identity
before update on public.community_events
for each row execute function public.protect_community_event_identity();

alter table public.community_events enable row level security;

drop policy if exists "community_events_select_members" on public.community_events;
create policy "community_events_select_members"
on public.community_events
for select
to authenticated
using (public.is_community_member(community_id));

drop policy if exists "community_events_insert_admins" on public.community_events;
create policy "community_events_insert_admins"
on public.community_events
for insert
to authenticated
with check (
  created_by = auth.uid()
  and public.is_community_admin(community_id)
);

drop policy if exists "community_events_update_admins" on public.community_events;
create policy "community_events_update_admins"
on public.community_events
for update
to authenticated
using (public.is_community_admin(community_id))
with check (public.is_community_admin(community_id));

drop policy if exists "community_events_delete_admins" on public.community_events;
create policy "community_events_delete_admins"
on public.community_events
for delete
to authenticated
using (public.is_community_admin(community_id));

revoke all on table public.community_events from anon;
grant select, insert, update, delete on table public.community_events to authenticated;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'event-images',
  'event-images',
  true,
  3145728,
  array['image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "event_images_select_members" on storage.objects;
create policy "event_images_select_members"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'event-images'
  and public.is_community_member(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "event_images_insert_admins" on storage.objects;
create policy "event_images_insert_admins"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'event-images'
  and public.is_community_admin(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "event_images_update_admins" on storage.objects;
create policy "event_images_update_admins"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'event-images'
  and public.is_community_admin(((storage.foldername(name))[1])::uuid)
)
with check (
  bucket_id = 'event-images'
  and public.is_community_admin(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "event_images_delete_admins" on storage.objects;
create policy "event_images_delete_admins"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'event-images'
  and public.is_community_admin(((storage.foldername(name))[1])::uuid)
);
