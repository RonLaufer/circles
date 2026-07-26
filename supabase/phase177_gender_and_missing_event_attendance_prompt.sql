-- Circles phase 177
-- 1. Add an optional gender field to user profiles.
-- 2. Extend the system administrator profile editor to read and update it.
-- The event-link prompt for existing members without attendance is implemented in the application.

begin;

alter table public.profiles
  add column if not exists gender text;

update public.profiles
set gender = null
where gender is not null
  and gender not in ('male', 'female', 'other');

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_gender_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_gender_check
      check (gender is null or gender in ('male', 'female', 'other'));
  end if;
end;
$$;

-- Return the complete editable profile only to the system administrator.
drop function if exists public.get_system_admin_profile_details(uuid);

create function public.get_system_admin_profile_details(target_user_id uuid)
returns table (
  user_id uuid,
  full_name text,
  about text,
  city text,
  phone text,
  gender text,
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
    profile.gender,
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

-- Replace the full editor with a version that also accepts gender.
drop function if exists public.set_system_admin_profile_details(uuid, text, text);
drop function if exists public.set_system_admin_profile_details(uuid, text, text, text, text, integer, integer, integer, text);
drop function if exists public.set_system_admin_profile_details(uuid, text, text, text, text, integer, integer, integer, text, text);

create function public.set_system_admin_profile_details(
  target_user_id uuid,
  new_full_name text,
  new_about text,
  new_city text,
  new_phone text,
  new_birth_day integer,
  new_birth_month integer,
  new_birth_year integer,
  new_gender text,
  new_avatar_url text
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
  clean_gender text := nullif(trim(coalesce(new_gender, '')), '');
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

  if clean_gender is not null and clean_gender not in ('male', 'female', 'other') then
    raise exception 'Invalid gender';
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
    gender = clean_gender,
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

revoke all on function public.set_system_admin_profile_details(uuid, text, text, text, text, integer, integer, integer, text, text) from public;
grant execute on function public.set_system_admin_profile_details(uuid, text, text, text, text, integer, integer, integer, text, text) to authenticated;

-- Keep the previous full signature working during deployment.
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
  current_gender text;
begin
  select profile.gender
  into current_gender
  from public.profiles profile
  where profile.id = target_user_id;

  if not found then
    raise exception 'Profile not found';
  end if;

  perform public.set_system_admin_profile_details(
    target_user_id,
    new_full_name,
    new_about,
    new_city,
    new_phone,
    new_birth_day,
    new_birth_month,
    new_birth_year,
    current_gender,
    new_avatar_url
  );
end;
$$;

revoke all on function public.set_system_admin_profile_details(uuid, text, text, text, text, integer, integer, integer, text) from public;
grant execute on function public.set_system_admin_profile_details(uuid, text, text, text, text, integer, integer, integer, text) to authenticated;

-- Keep the oldest name/avatar signature working as well.
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
    current_profile.gender,
    new_avatar_url
  );
end;
$$;

revoke all on function public.set_system_admin_profile_details(uuid, text, text) from public;
grant execute on function public.set_system_admin_profile_details(uuid, text, text) to authenticated;

commit;
