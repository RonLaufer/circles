-- Circles phase 46: managed gallery limits, one video and safe event cloning

alter table public.event_gallery_photos
  add column if not exists media_type text not null default 'image';

update public.event_gallery_photos
set media_type = 'image'
where media_type is null or media_type not in ('image', 'video');

alter table public.event_gallery_photos
  drop constraint if exists event_gallery_photos_media_type_check;

alter table public.event_gallery_photos
  add constraint event_gallery_photos_media_type_check
  check (media_type in ('image', 'video'));

create or replace function public.enforce_event_gallery_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_count integer;
  target_starts_at timestamptz;
begin
  if not public.can_manage_event(new.event_id) then
    raise exception 'gallery_manager_required';
  end if;

  select ce.starts_at
  into target_starts_at
  from public.community_events ce
  where ce.id = new.event_id;

  if target_starts_at is null then
    raise exception 'event_not_found';
  end if;

  if target_starts_at > now() then
    raise exception 'gallery_not_open_yet';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.event_id::text, 0));

  select count(*)::integer
  into existing_count
  from public.event_gallery_photos egp
  where egp.event_id = new.event_id
    and egp.media_type = new.media_type;

  if new.media_type = 'image' and existing_count >= 20 then
    raise exception 'gallery_image_limit_reached';
  end if;

  if new.media_type = 'video' and existing_count >= 1 then
    raise exception 'gallery_video_limit_reached';
  end if;

  return new;
end;
$$;

drop trigger if exists event_gallery_photos_enforce_limits on public.event_gallery_photos;
create trigger event_gallery_photos_enforce_limits
before insert on public.event_gallery_photos
for each row execute function public.enforce_event_gallery_limits();

drop policy if exists "event_gallery_photos_insert_after_start" on public.event_gallery_photos;
create policy "event_gallery_photos_insert_after_start"
on public.event_gallery_photos
for insert
to authenticated
with check (
  user_id = auth.uid()
  and public.can_manage_event(event_id)
  and exists (
    select 1
    from public.community_events ce
    where ce.id = event_gallery_photos.event_id
      and ce.starts_at <= now()
  )
);

drop policy if exists "event_gallery_photos_delete_self_or_admin" on public.event_gallery_photos;
create policy "event_gallery_photos_delete_self_or_admin"
on public.event_gallery_photos
for delete
to authenticated
using (public.can_manage_event(event_id));

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
  array['image/webp', 'video/mp4', 'video/webm', 'video/quicktime']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

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
    from public.community_events ce
    where ce.id = ((storage.foldername(name))[2])::uuid
      and ce.community_id = ((storage.foldername(name))[1])::uuid
      and ce.starts_at <= now()
      and public.can_manage_event(ce.id)
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

-- Older clients may still call this function. It now copies only the predefined
-- food table and never copies participants or their contributions.
create or replace function public.clone_event_content(
  source_event_id uuid,
  target_event_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_community_id uuid;
  target_community_id uuid;
begin
  select ce.community_id into source_community_id
  from public.community_events ce
  where ce.id = source_event_id;

  select ce.community_id into target_community_id
  from public.community_events ce
  where ce.id = target_event_id;

  if source_community_id is null or target_community_id is null then
    raise exception 'event_not_found';
  end if;

  if source_community_id <> target_community_id then
    raise exception 'events_must_share_circle';
  end if;

  if not public.is_community_admin(target_community_id)
    and not public.is_system_admin() then
    raise exception 'permission_denied';
  end if;

  insert into public.event_bring_needs (
    event_id,
    item_name,
    quantity_needed
  )
  select
    target_event_id,
    source_need.item_name,
    source_need.quantity_needed
  from public.event_bring_needs source_need
  where source_need.event_id = source_event_id
    and not exists (
      select 1
      from public.event_bring_needs target_need
      where target_need.event_id = target_event_id
        and lower(trim(target_need.item_name)) = lower(trim(source_need.item_name))
    );
end;
$$;

revoke all on function public.enforce_event_gallery_limits() from public;
revoke all on function public.clone_event_content(uuid, uuid) from public;
grant execute on function public.clone_event_content(uuid, uuid) to authenticated;
