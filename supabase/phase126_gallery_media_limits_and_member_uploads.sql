-- Circles phase 126
-- גלריית אירוע: עד 100 תמונות, עד 3 סרטונים, והעלאה לכל חברי המעגל.

create or replace function public.can_upload_event_gallery(target_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.community_events event
    where event.id = target_event_id
      and event.starts_at <= now()
      and (
        (
          event.status = 'active'
          and public.is_community_member(event.community_id)
        )
        or public.can_manage_event(event.id)
      )
  );
$$;

revoke all on function public.can_upload_event_gallery(uuid) from public;
grant execute on function public.can_upload_event_gallery(uuid) to authenticated;

create or replace function public.enforce_event_gallery_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_count integer;
begin
  if not public.can_upload_event_gallery(new.event_id) then
    raise exception 'gallery_upload_not_allowed';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.event_id::text, 0));

  select count(*)::integer
  into existing_count
  from public.event_gallery_photos gallery_item
  where gallery_item.event_id = new.event_id
    and gallery_item.media_type = new.media_type;

  if new.media_type = 'image' and existing_count >= 100 then
    raise exception 'gallery_image_limit_reached';
  end if;

  if new.media_type = 'video' and existing_count >= 3 then
    raise exception 'gallery_video_limit_reached';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_event_gallery_limits() from public;
grant execute on function public.enforce_event_gallery_limits() to authenticated;

-- כל חבר במעגל יכול להוסיף קובץ לאחר תחילת האירוע.
drop policy if exists "event_gallery_photos_insert_after_start" on public.event_gallery_photos;
create policy "event_gallery_photos_insert_after_start"
on public.event_gallery_photos
for insert
to authenticated
with check (
  user_id = auth.uid()
  and public.can_upload_event_gallery(event_id)
);

-- מחיקת קבצים נשארת למנהלי האירוע בלבד.
drop policy if exists "event_gallery_photos_delete_self_or_admin" on public.event_gallery_photos;
create policy "event_gallery_photos_delete_self_or_admin"
on public.event_gallery_photos
for delete
to authenticated
using (public.can_manage_event(event_id));

-- כל הקבצים שמגיעים לאחסון כבר מכווצים: תמונה עד 1MB, סרטון עד 20MB.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'event-gallery',
  'event-gallery',
  true,
  20971520,
  array['image/webp', 'video/mp4']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- גם סרטון המעגל מוגבל ל־20MB לאחר הכיווץ.
update storage.buckets
set file_size_limit = 20971520,
    allowed_mime_types = array['video/mp4']
where id = 'community-videos';

drop policy if exists "event_gallery_storage_insert_after_start" on storage.objects;
create policy "event_gallery_storage_insert_after_start"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'event-gallery'
  and (storage.foldername(name))[3] = auth.uid()::text
  and exists (
    select 1
    from public.community_events event
    where event.id = ((storage.foldername(name))[2])::uuid
      and event.community_id = ((storage.foldername(name))[1])::uuid
      and public.can_upload_event_gallery(event.id)
  )
);

drop policy if exists "event_gallery_storage_delete_self_or_admin" on storage.objects;
create policy "event_gallery_storage_delete_self_or_admin"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'event-gallery'
  and public.can_manage_event(((storage.foldername(name))[2])::uuid)
);
