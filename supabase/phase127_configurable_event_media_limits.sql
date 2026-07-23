-- Circles phase 127
-- ברירות מחדל כלליות ומגבלות מדיה נפרדות לכל אירוע.

begin;

create table if not exists public.system_media_settings (
  id smallint primary key default 1 check (id = 1),
  default_gallery_image_limit integer not null default 100,
  default_gallery_image_max_mb numeric(6,2) not null default 1,
  default_gallery_video_limit integer not null default 3,
  default_gallery_video_max_mb numeric(6,2) not null default 20,
  updated_at timestamptz not null default now(),
  constraint system_media_image_limit_range check (default_gallery_image_limit between 0 and 1000),
  constraint system_media_image_size_range check (default_gallery_image_max_mb between 0.1 and 20),
  constraint system_media_video_limit_range check (default_gallery_video_limit between 0 and 20),
  constraint system_media_video_size_range check (default_gallery_video_max_mb between 1 and 200)
);

insert into public.system_media_settings (
  id,
  default_gallery_image_limit,
  default_gallery_image_max_mb,
  default_gallery_video_limit,
  default_gallery_video_max_mb
)
values (1, 100, 1, 3, 20)
on conflict (id) do nothing;

alter table public.system_media_settings enable row level security;

drop policy if exists "authenticated_users_read_media_defaults" on public.system_media_settings;
create policy "authenticated_users_read_media_defaults"
on public.system_media_settings
for select
to authenticated
using (true);

drop policy if exists "system_admin_updates_media_defaults" on public.system_media_settings;
create policy "system_admin_updates_media_defaults"
on public.system_media_settings
for update
to authenticated
using (public.is_system_admin())
with check (public.is_system_admin());

grant select on public.system_media_settings to authenticated;
grant update on public.system_media_settings to authenticated;

alter table public.community_events
  add column if not exists gallery_image_limit integer,
  add column if not exists gallery_image_max_mb numeric(6,2),
  add column if not exists gallery_video_limit integer,
  add column if not exists gallery_video_max_mb numeric(6,2);

update public.community_events
set
  gallery_image_limit = coalesce(gallery_image_limit, 100),
  gallery_image_max_mb = coalesce(gallery_image_max_mb, 1),
  gallery_video_limit = coalesce(gallery_video_limit, 3),
  gallery_video_max_mb = coalesce(gallery_video_max_mb, 20);

alter table public.community_events
  alter column gallery_image_limit set not null,
  alter column gallery_image_max_mb set not null,
  alter column gallery_video_limit set not null,
  alter column gallery_video_max_mb set not null;

alter table public.community_events
  drop constraint if exists community_events_gallery_image_limit_range,
  drop constraint if exists community_events_gallery_image_size_range,
  drop constraint if exists community_events_gallery_video_limit_range,
  drop constraint if exists community_events_gallery_video_size_range;

alter table public.community_events
  add constraint community_events_gallery_image_limit_range check (gallery_image_limit between 0 and 1000),
  add constraint community_events_gallery_image_size_range check (gallery_image_max_mb between 0.1 and 20),
  add constraint community_events_gallery_video_limit_range check (gallery_video_limit between 0 and 20),
  add constraint community_events_gallery_video_size_range check (gallery_video_max_mb between 1 and 200);

create or replace function public.apply_event_media_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  defaults_row public.system_media_settings%rowtype;
begin
  select * into defaults_row
  from public.system_media_settings
  where id = 1;

  new.gallery_image_limit := coalesce(new.gallery_image_limit, defaults_row.default_gallery_image_limit, 100);
  new.gallery_image_max_mb := coalesce(new.gallery_image_max_mb, defaults_row.default_gallery_image_max_mb, 1);
  new.gallery_video_limit := coalesce(new.gallery_video_limit, defaults_row.default_gallery_video_limit, 3);
  new.gallery_video_max_mb := coalesce(new.gallery_video_max_mb, defaults_row.default_gallery_video_max_mb, 20);
  return new;
end;
$$;

drop trigger if exists apply_event_media_defaults_before_insert on public.community_events;
create trigger apply_event_media_defaults_before_insert
before insert on public.community_events
for each row execute function public.apply_event_media_defaults();

create or replace function public.enforce_event_gallery_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_count integer;
  allowed_count integer;
begin
  if not public.can_upload_event_gallery(new.event_id) then
    raise exception 'gallery_upload_not_allowed';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.event_id::text, 0));

  select
    case
      when new.media_type = 'image' then event.gallery_image_limit
      when new.media_type = 'video' then event.gallery_video_limit
      else 0
    end
  into allowed_count
  from public.community_events event
  where event.id = new.event_id;

  select count(*)::integer
  into existing_count
  from public.event_gallery_photos gallery_item
  where gallery_item.event_id = new.event_id
    and gallery_item.media_type = new.media_type;

  if new.media_type = 'image' and existing_count >= allowed_count then
    raise exception 'gallery_image_limit_reached';
  end if;

  if new.media_type = 'video' and existing_count >= allowed_count then
    raise exception 'gallery_video_limit_reached';
  end if;

  return new;
end;
$$;

-- הקבצים עוברים כיווץ בדפדפן לפי מגבלת האירוע. מגבלת ה־bucket היא תקרה טכנית בלבד.
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
  209715200,
  array['image/webp', 'video/mp4']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

commit;
