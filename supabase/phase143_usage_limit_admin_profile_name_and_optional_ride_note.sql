-- Circles phase 143:
-- 1. Keep only the 100 newest completed usage-log rows whenever the admin opens the log.
-- 2. Allow the system administrator to update a member's display name and optionally avatar.
-- 3. Make ride-offer notes optional.

-- Ride offers are created immediately by checking the checkbox. The note is optional.
update public.event_ride_offers
set note = ''
where note is null;

alter table public.event_ride_offers
  alter column note set default '',
  alter column note set not null;

alter table public.event_ride_offers
  drop constraint if exists event_ride_offers_note_check;

alter table public.event_ride_offers
  add constraint event_ride_offers_note_check
  check (char_length(trim(note)) <= 240);

create or replace function public.set_system_admin_profile_details(
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
  clean_name text := trim(coalesce(new_full_name, ''));
  clean_avatar_url text := nullif(trim(coalesce(new_avatar_url, '')), '');
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

  update public.profiles
  set
    full_name = clean_name,
    avatar_url = coalesce(clean_avatar_url, avatar_url)
  where id = target_user_id;

  if not found then
    raise exception 'Profile not found';
  end if;
end;
$$;

revoke all on function public.set_system_admin_profile_details(uuid, text, text) from public;
grant execute on function public.set_system_admin_profile_details(uuid, text, text) to authenticated;

-- Opening the admin log calls this function. It first removes every completed
-- usage row older than the newest 100 rows and then returns those 100 rows.
drop function if exists public.get_system_admin_usage_log();

create function public.get_system_admin_usage_log()
returns table (
  session_id uuid,
  user_id uuid,
  full_name text,
  community_names text[],
  duration_seconds bigint,
  started_at timestamptz,
  ended_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_system_admin() then
    raise exception 'System administrator access required';
  end if;

  -- Remove invalid historical rows that should never be displayed.
  delete from public.user_usage_sessions usage_session
  where coalesce(usage_session.duration_seconds, 0) <= 0
     or usage_session.ended_at is null;

  -- Keep only the 100 newest completed sessions. The exclusions are retained
  -- as an additional safeguard even though phase 137 already prevents them.
  delete from public.user_usage_sessions usage_session
  where usage_session.id in (
    select old_session.id
    from public.user_usage_sessions old_session
    join public.profiles old_profile
      on old_profile.id = old_session.user_id
    where old_session.duration_seconds > 0
      and old_session.ended_at is not null
      and lower(trim(coalesce(old_profile.email, ''))) not in (
        'laufer.ron@gmail.com',
        'support@analysis.co.il',
        'ron@analysis.co.il',
        'business.imc.il@gmail.com',
        'dont.reply@analysis.co.il'
      )
    order by old_session.started_at desc, old_session.id desc
    offset 100
  );

  return query
  select
    usage_session.id as session_id,
    profile.id as user_id,
    coalesce(nullif(trim(profile.full_name), ''), 'משתמש') as full_name,
    coalesce(member_circles.community_names, array[]::text[]) as community_names,
    usage_session.duration_seconds,
    usage_session.started_at,
    usage_session.ended_at
  from public.user_usage_sessions usage_session
  join public.profiles profile
    on profile.id = usage_session.user_id
  left join lateral (
    select array_agg(distinct community.name order by community.name) as community_names
    from public.community_members member
    join public.communities community
      on community.id = member.community_id
    where member.user_id = profile.id
  ) member_circles on true
  where usage_session.duration_seconds > 0
    and usage_session.ended_at is not null
    and lower(trim(coalesce(profile.email, ''))) not in (
      'laufer.ron@gmail.com',
      'support@analysis.co.il',
      'ron@analysis.co.il',
      'business.imc.il@gmail.com',
      'dont.reply@analysis.co.il'
    )
  order by usage_session.started_at desc, usage_session.id desc
  limit 100;
end;
$$;

revoke all on function public.get_system_admin_usage_log() from public;
grant execute on function public.get_system_admin_usage_log() to authenticated;
