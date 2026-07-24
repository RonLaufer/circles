-- circles129: מחיקת מדיה מותרת למעלה הקובץ, למנהלי המעגל ולמנהל המערכת.

begin;

alter table public.event_gallery_photos enable row level security;

drop policy if exists "event_gallery_photos_delete_self_or_admin" on public.event_gallery_photos;
create policy "event_gallery_photos_delete_self_or_admin"
on public.event_gallery_photos
for delete
to authenticated
using (
  user_id = auth.uid()
  or public.can_manage_event(event_id)
);

drop policy if exists "event_gallery_storage_delete_self_or_admin" on storage.objects;
create policy "event_gallery_storage_delete_self_or_admin"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'event-gallery'
  and (
    (storage.foldername(name))[3] = auth.uid()::text
    or public.can_manage_event(((storage.foldername(name))[2])::uuid)
  )
);

commit;
