-- Circles phase 7: public image buckets and upload permissions

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values
  (
    'profile-images',
    'profile-images',
    true,
    3145728,
    array['image/webp']
  ),
  (
    'community-images',
    'community-images',
    true,
    3145728,
    array['image/webp']
  )
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- A user may manage only the image stored in their own profile folder.
drop policy if exists "profile_images_select_self" on storage.objects;
create policy "profile_images_select_self"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'profile-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "profile_images_insert_self" on storage.objects;
create policy "profile_images_insert_self"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'profile-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "profile_images_update_self" on storage.objects;
create policy "profile_images_update_self"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'profile-images'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'profile-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "profile_images_delete_self" on storage.objects;
create policy "profile_images_delete_self"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'profile-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Circle images are stored under the circle id. Owners and admins may manage them.
drop policy if exists "community_images_select_admins" on storage.objects;
create policy "community_images_select_admins"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'community-images'
  and public.is_community_admin(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "community_images_insert_admins" on storage.objects;
create policy "community_images_insert_admins"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'community-images'
  and public.is_community_admin(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "community_images_update_admins" on storage.objects;
create policy "community_images_update_admins"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'community-images'
  and public.is_community_admin(((storage.foldername(name))[1])::uuid)
)
with check (
  bucket_id = 'community-images'
  and public.is_community_admin(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "community_images_delete_admins" on storage.objects;
create policy "community_images_delete_admins"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'community-images'
  and public.is_community_admin(((storage.foldername(name))[1])::uuid)
);
