-- Circles phase 51: one video per circle, up to 50MB

alter table public.communities
  add column if not exists video_url text;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'community-videos',
  'community-videos',
  true,
  52428800,
  array['video/mp4', 'video/webm', 'video/quicktime']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- The path is <community_id>/intro. Only circle managers and the system admin
-- may create, replace or remove the circle video.
drop policy if exists "community_videos_select_members" on storage.objects;
create policy "community_videos_select_members"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'community-videos'
  and (
    public.is_community_member(((storage.foldername(name))[1])::uuid)
    or public.is_system_admin()
  )
);

drop policy if exists "community_videos_insert_admins" on storage.objects;
create policy "community_videos_insert_admins"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'community-videos'
  and (
    public.is_community_admin(((storage.foldername(name))[1])::uuid)
    or public.is_system_admin()
  )
);

drop policy if exists "community_videos_update_admins" on storage.objects;
create policy "community_videos_update_admins"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'community-videos'
  and (
    public.is_community_admin(((storage.foldername(name))[1])::uuid)
    or public.is_system_admin()
  )
)
with check (
  bucket_id = 'community-videos'
  and (
    public.is_community_admin(((storage.foldername(name))[1])::uuid)
    or public.is_system_admin()
  )
);

drop policy if exists "community_videos_delete_admins" on storage.objects;
create policy "community_videos_delete_admins"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'community-videos'
  and (
    public.is_community_admin(((storage.foldername(name))[1])::uuid)
    or public.is_system_admin()
  )
);
