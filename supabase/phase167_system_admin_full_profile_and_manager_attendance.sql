-- Circles phase 167
-- 1. Allow the system administrator to read and update every editable profile field.
-- 2. Allow circle managers to set a participant's registration status on their behalf.

begin;

-- Return the complete editable profile only to the system administrator.
drop function if exists public.get_system_admin_profile_details(uuid);

create function public.get_system_admin_profile_details(target_user_id uuid)
returns table (
  user_id uuid,
  full_name text,
  about text,
  city text,
  phone text,
  birth_day smallint,
  birth_month smallint,
  birth_year smallint,
  avatar_url text,
  google_avatar_url text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_system_admin() then
    raise exception 'System administrator access required';
  end if;

  return query
  select
    profile.id,
    coalesce(profile.full_name, ''),
    coalesce(profile.about, ''),
    coalesce(profile.city, ''),
    coalesce(profile.phone, ''),
    profile.birth_day,
    profile.birth_month,
    profile.birth_year,
    profile.avatar_url,
    profile.google_avatar_url
  from public.profiles profile
  where profile.id = target_user_id;

  if not found then
    raise exception 'Profile not found';
  end if;
end;
$$;

revoke all on function public.get_system_admin_profile_details(uuid) from public;
grant execute on function public.get_system_admin_profile_details(uuid) to authenticated;

-- Replace the older name/avatar-only function with the full profile editor.
drop function if exists public.set_system_admin_profile_details(uuid, text, text);
drop function if exists public.set_system_admin_profile_details(uuid, text, text, text, text, integer, integer, integer, text);

create function public.set_system_admin_profile_details(
  target_user_id uuid,
  new_full_name text,
  new_about text,
  new_city text,
  new_phone text,
  new_birth_day integer,
  new_birth_month integer,
  new_birth_year integer,
  new_avatar_url text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_name text := trim(coalesce(new_full_name, ''));
  clean_about text := trim(coalesce(new_about, ''));
  clean_city text := trim(coalesce(new_city, ''));
  clean_phone text := trim(coalesce(new_phone, ''));
  clean_avatar_url text := nullif(trim(coalesce(new_avatar_url, '')), '');
  validation_year integer := coalesce(new_birth_year, 2000);
begin
  if not public.is_system_admin() then
    raise exception 'System administrator access required';
  end if;

  if target_user_id is null then
    raise exception 'Target user is required';
  end if;

  if clean_name = '' then
    raise exception 'Full name is required';
  end if;

  if char_length(clean_name) > 120 then
    raise exception 'Full name is too long';
  end if;

  if char_length(clean_about) > 1200 then
    raise exception 'About text is too long';
  end if;

  if char_length(clean_city) > 100 then
    raise exception 'City is too long';
  end if;

  if char_length(clean_phone) > 30 then
    raise exception 'Phone is too long';
  end if;

  if (new_birth_day is null) <> (new_birth_month is null) then
    raise exception 'Birth day and month must be supplied together';
  end if;

  if new_birth_day is not null then
    if new_birth_day not between 1 and 31
      or new_birth_month not between 1 and 12 then
      raise exception 'Invalid birth date';
    end if;

    if new_birth_year is not null
      and (new_birth_year < 1900 or new_birth_year > extract(year from current_date)::integer) then
      raise exception 'Invalid birth year';
    end if;

    begin
      perform make_date(validation_year, new_birth_month, new_birth_day);
    exception when others then
      raise exception 'Invalid birth date';
    end;
  elsif new_birth_year is not null then
    raise exception 'Birth year requires a day and month';
  end if;

  update public.profiles profile
  set
    full_name = clean_name,
    about = clean_about,
    city = clean_city,
    phone = clean_phone,
    birth_day = new_birth_day,
    birth_month = new_birth_month,
    birth_year = new_birth_year,
    avatar_url = coalesce(clean_avatar_url, profile.avatar_url)
  where profile.id = target_user_id;

  if not found then
    raise exception 'Profile not found';
  end if;
end;
$$;

revoke all on function public.set_system_admin_profile_details(uuid, text, text, text, text, integer, integer, integer, text) from public;
grant execute on function public.set_system_admin_profile_details(uuid, text, text, text, text, integer, integer, integer, text) to authenticated;

-- Keep the old name/avatar signature working while the new application version is deployed.
create function public.set_system_admin_profile_details(
  target_user_id uuid,
  new_full_name text,
  new_avatar_url text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_profile public.profiles%rowtype;
begin
  select profile.*
  into current_profile
  from public.profiles profile
  where profile.id = target_user_id;

  if not found then
    raise exception 'Profile not found';
  end if;

  perform public.set_system_admin_profile_details(
    target_user_id,
    new_full_name,
    current_profile.about,
    current_profile.city,
    current_profile.phone,
    current_profile.birth_day,
    current_profile.birth_month,
    current_profile.birth_year,
    new_avatar_url
  );
end;
$$;

revoke all on function public.set_system_admin_profile_details(uuid, text, text) from public;
grant execute on function public.set_system_admin_profile_details(uuid, text, text) to authenticated;

-- Set or correct a participant's registration response on their behalf.
drop function if exists public.set_event_attendance_for_member(uuid, uuid, text);

create function public.set_event_attendance_for_member(
  target_event_id uuid,
  target_user_id uuid,
  target_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_community_id uuid;
  event_limit integer;
  other_going_people integer;
begin
  if auth.uid() is null then
    raise exception 'authentication_required';
  end if;

  if target_status not in ('going', 'maybe', 'not_going') then
    raise exception 'invalid_attendance_status';
  end if;

  select event.community_id, event.participant_limit
  into target_community_id, event_limit
  from public.community_events event
  where event.id = target_event_id
  for update;

  if target_community_id is null then
    raise exception 'event_not_found';
  end if;

  if not public.is_community_admin(target_community_id)
    and not public.is_system_admin() then
    raise exception 'permission_denied';
  end if;

  if not exists (
    select 1
    from public.community_members member
    where member.community_id = target_community_id
      and member.user_id = target_user_id
  ) then
    raise exception 'target_user_is_not_a_circle_member';
  end if;

  if target_status = 'going' and event_limit is not null then
    select count(*)::integer
    into other_going_people
    from public.event_attendance attendance
    where attendance.event_id = target_event_id
      and attendance.status = 'going'
      and attendance.user_id <> target_user_id;

    if other_going_people + 1 > event_limit then
      raise exception 'event_capacity_exceeded';
    end if;
  end if;

  insert into public.event_attendance (event_id, user_id, status)
  values (target_event_id, target_user_id, target_status)
  on conflict (event_id, user_id)
  do update set
    status = excluded.status,
    updated_at = now();
end;
$$;

revoke all on function public.set_event_attendance_for_member(uuid, uuid, text) from public;
grant execute on function public.set_event_attendance_for_member(uuid, uuid, text) to authenticated;

commit;
