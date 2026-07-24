-- Circles phase 136: allow only the system administrator to replace a member profile image

-- The profile image bucket remains public for display. These policies add write access
-- for the system administrator to another user's profile-image folder.
drop policy if exists "profile_images_select_system_admin" on storage.objects;
create policy "profile_images_select_system_admin"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'profile-images'
  and public.is_system_admin()
);

drop policy if exists "profile_images_insert_system_admin" on storage.objects;
create policy "profile_images_insert_system_admin"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'profile-images'
  and public.is_system_admin()
);

drop policy if exists "profile_images_update_system_admin" on storage.objects;
create policy "profile_images_update_system_admin"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'profile-images'
  and public.is_system_admin()
)
with check (
  bucket_id = 'profile-images'
  and public.is_system_admin()
);

drop policy if exists "profile_images_delete_system_admin" on storage.objects;
create policy "profile_images_delete_system_admin"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'profile-images'
  and public.is_system_admin()
);

create or replace function public.set_system_admin_profile_avatar(
  target_user_id uuid,
  new_avatar_url text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_system_admin() then
    raise exception 'System administrator access required';
  end if;

  if target_user_id is null then
    raise exception 'Target user is required';
  end if;

  if nullif(trim(new_avatar_url), '') is null then
    raise exception 'Avatar URL is required';
  end if;

  update public.profiles
  set avatar_url = trim(new_avatar_url)
  where id = target_user_id;

  if not found then
    raise exception 'Profile not found';
  end if;
end;
$$;

revoke all on function public.set_system_admin_profile_avatar(uuid, text) from public;
grant execute on function public.set_system_admin_profile_avatar(uuid, text) to authenticated;
