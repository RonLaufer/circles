-- Circles phase 149: birthday age/contact details, gallery pinning,
-- and actual attendance marking after an event starts.

-- ---------------------------------------------------------------------------
-- Birthday reminder details
-- ---------------------------------------------------------------------------

alter table public.birthday_email_dispatches
  add column if not exists birthday_birth_year integer,
  add column if not exists birthday_phone text not null default '';

drop function if exists public.prepare_birthday_email_dispatches(text, date);

create function public.prepare_birthday_email_dispatches(
  p_cron_token text,
  p_birthday_date date
)
returns table (
  dispatch_id uuid,
  birthday_name text,
  birthday_birth_year integer,
  birthday_phone text,
  recipient_name text,
  recipient_email text,
  circle_names text[]
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_birthday_date is null then
    raise exception 'birthday_date_required';
  end if;

  if not exists (
    select 1
    from private.birthday_email_settings settings
    where settings.singleton = true
      and settings.cron_token::text = trim(coalesce(p_cron_token, ''))
  ) then
    raise exception 'invalid_cron_token' using errcode = '42501';
  end if;

  return query
  with birthday_members as (
    select
      profile.id as birthday_user_id,
      coalesce(nullif(trim(profile.full_name), ''), 'חבר/ת מעגל') as birthday_name,
      profile.birth_year as birthday_birth_year,
      trim(coalesce(profile.phone, '')) as birthday_phone,
      lower(trim(coalesce(profile.email, ''))) as birthday_email
    from public.profiles profile
    where profile.birth_day = extract(day from p_birthday_date)::integer
      and profile.birth_month = extract(month from p_birthday_date)::integer
  ),
  recipient_pairs as (
    select
      birthday.birthday_user_id,
      birthday.birthday_name,
      birthday.birthday_birth_year,
      birthday.birthday_phone,
      min(manager_profile.id::text)::uuid as recipient_user_id,
      coalesce(
        max(nullif(trim(manager_profile.full_name), '')),
        split_part(lower(trim(manager_profile.email)), '@', 1),
        'מנהל/ת המעגל'
      ) as recipient_name,
      lower(trim(manager_profile.email)) as recipient_email,
      array_agg(distinct circle.name order by circle.name) as circle_names
    from birthday_members birthday
    join public.community_members birthday_membership
      on birthday_membership.user_id = birthday.birthday_user_id
    join public.communities circle
      on circle.id = birthday_membership.community_id
    join public.community_members manager
      on manager.community_id = circle.id
      and manager.role = 'admin'
    join public.profiles manager_profile
      on manager_profile.id = manager.user_id
    where manager.user_id <> birthday.birthday_user_id
      and nullif(trim(coalesce(manager_profile.email, '')), '') is not null
      and (
        birthday.birthday_email = ''
        or lower(trim(manager_profile.email)) <> birthday.birthday_email
      )
    group by
      birthday.birthday_user_id,
      birthday.birthday_name,
      birthday.birthday_birth_year,
      birthday.birthday_phone,
      lower(trim(manager_profile.email))
  ),
  reserved as (
    insert into public.birthday_email_dispatches as dispatch (
      birthday_date,
      birthday_user_id,
      birthday_name,
      birthday_birth_year,
      birthday_phone,
      recipient_user_id,
      recipient_name,
      recipient_email,
      circle_names,
      status,
      attempt_count,
      processing_started_at,
      sent_at,
      last_error,
      updated_at
    )
    select
      p_birthday_date,
      pair.birthday_user_id,
      pair.birthday_name,
      pair.birthday_birth_year,
      pair.birthday_phone,
      pair.recipient_user_id,
      pair.recipient_name,
      pair.recipient_email,
      pair.circle_names,
      'processing',
      1,
      now(),
      null,
      null,
      now()
    from recipient_pairs pair
    on conflict (birthday_date, birthday_user_id, recipient_email) do update
    set
      birthday_name = excluded.birthday_name,
      birthday_birth_year = excluded.birthday_birth_year,
      birthday_phone = excluded.birthday_phone,
      recipient_user_id = excluded.recipient_user_id,
      recipient_name = excluded.recipient_name,
      circle_names = excluded.circle_names,
      status = 'processing',
      attempt_count = dispatch.attempt_count + 1,
      processing_started_at = now(),
      sent_at = null,
      last_error = null,
      updated_at = now()
    where dispatch.status = 'failed'
       or (
         dispatch.status = 'processing'
         and dispatch.processing_started_at < now() - interval '20 minutes'
       )
    returning
      dispatch.id,
      dispatch.birthday_name,
      dispatch.birthday_birth_year,
      dispatch.birthday_phone,
      dispatch.recipient_name,
      dispatch.recipient_email,
      dispatch.circle_names
  )
  select
    reserved.id,
    reserved.birthday_name,
    reserved.birthday_birth_year,
    reserved.birthday_phone,
    reserved.recipient_name,
    reserved.recipient_email,
    reserved.circle_names
  from reserved
  order by reserved.recipient_email, reserved.birthday_name;
end;
$$;

revoke all on function public.prepare_birthday_email_dispatches(text, date) from public;
grant execute on function public.prepare_birthday_email_dispatches(text, date) to anon;

-- ---------------------------------------------------------------------------
-- Gallery pinning
-- ---------------------------------------------------------------------------

alter table public.event_gallery_photos
  add column if not exists is_pinned boolean not null default false,
  add column if not exists pinned_at timestamptz,
  add column if not exists pinned_by uuid references public.profiles(id) on delete set null;

create index if not exists event_gallery_photos_pinned_order_idx
  on public.event_gallery_photos(event_id, is_pinned desc, pinned_at desc, created_at desc);

create or replace function public.set_event_gallery_pin(
  target_photo_id uuid,
  target_is_pinned boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_community_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication_required';
  end if;

  select event.community_id
  into target_community_id
  from public.event_gallery_photos photo
  join public.community_events event on event.id = photo.event_id
  where photo.id = target_photo_id;

  if target_community_id is null then
    raise exception 'gallery_item_not_found';
  end if;

  if not public.is_community_admin(target_community_id)
    and not public.is_system_admin() then
    raise exception 'permission_denied';
  end if;

  update public.event_gallery_photos photo
  set
    is_pinned = coalesce(target_is_pinned, false),
    pinned_at = case when coalesce(target_is_pinned, false) then now() else null end,
    pinned_by = case when coalesce(target_is_pinned, false) then auth.uid() else null end
  where photo.id = target_photo_id;

  return found;
end;
$$;

revoke all on function public.set_event_gallery_pin(uuid, boolean) from public;
grant execute on function public.set_event_gallery_pin(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Actual attendance after event start
-- ---------------------------------------------------------------------------

alter table public.event_attendance
  add column if not exists actual_status text,
  add column if not exists actual_status_at timestamptz,
  add column if not exists actual_status_by uuid references public.profiles(id) on delete set null;

alter table public.event_attendance
  drop constraint if exists event_attendance_actual_status_check;

alter table public.event_attendance
  add constraint event_attendance_actual_status_check
  check (actual_status is null or actual_status in ('arrived', 'not_arrived'));

create index if not exists event_attendance_event_actual_status_idx
  on public.event_attendance(event_id, actual_status);

create or replace function public.protect_event_actual_attendance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_community_id uuid;
  event_start timestamptz;
begin
  if tg_op = 'INSERT' then
    if new.actual_status is not null
      or new.actual_status_at is not null
      or new.actual_status_by is not null then
      raise exception 'actual_attendance_manager_only';
    end if;
    return new;
  end if;

  if new.actual_status is distinct from old.actual_status
    or new.actual_status_at is distinct from old.actual_status_at
    or new.actual_status_by is distinct from old.actual_status_by then

    select event.community_id, event.starts_at
    into target_community_id, event_start
    from public.community_events event
    where event.id = old.event_id;

    if target_community_id is null then
      raise exception 'event_not_found';
    end if;

    if not public.is_community_admin(target_community_id)
      and not public.is_system_admin() then
      raise exception 'actual_attendance_manager_only';
    end if;

    if event_start > now() then
      raise exception 'actual_attendance_before_event_start';
    end if;

    if new.actual_status is null then
      new.actual_status_at := null;
      new.actual_status_by := null;
    else
      new.actual_status_at := now();
      new.actual_status_by := auth.uid();
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.protect_event_actual_attendance() from public;

drop trigger if exists event_attendance_protect_actual_status on public.event_attendance;
create trigger event_attendance_protect_actual_status
before insert or update on public.event_attendance
for each row execute function public.protect_event_actual_attendance();

create or replace function public.set_event_actual_attendance(
  target_event_id uuid,
  target_user_id uuid,
  target_actual_status text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_community_id uuid;
  event_start timestamptz;
begin
  if auth.uid() is null then
    raise exception 'authentication_required';
  end if;

  if target_actual_status is not null
    and target_actual_status not in ('arrived', 'not_arrived') then
    raise exception 'invalid_actual_attendance_status';
  end if;

  select event.community_id, event.starts_at
  into target_community_id, event_start
  from public.community_events event
  where event.id = target_event_id;

  if target_community_id is null then
    raise exception 'event_not_found';
  end if;

  if not public.is_community_admin(target_community_id)
    and not public.is_system_admin() then
    raise exception 'permission_denied';
  end if;

  if event_start > now() then
    raise exception 'actual_attendance_before_event_start';
  end if;

  update public.event_attendance attendance
  set actual_status = target_actual_status
  where attendance.event_id = target_event_id
    and attendance.user_id = target_user_id;

  return found;
end;
$$;

revoke all on function public.set_event_actual_attendance(uuid, uuid, text) from public;
grant execute on function public.set_event_actual_attendance(uuid, uuid, text) to authenticated;
