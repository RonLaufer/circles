-- Circles phase 137: finalize usage-log rows only after a user becomes inactive

create table if not exists public.user_active_usage_sessions (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  started_at timestamptz not null,
  last_heartbeat_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_active_usage_sessions_last_heartbeat_idx
  on public.user_active_usage_sessions (last_heartbeat_at);

alter table public.user_active_usage_sessions enable row level security;
revoke all on table public.user_active_usage_sessions from anon, authenticated;

alter table public.user_usage_sessions
  add column if not exists ended_at timestamptz;

-- Preserve an unfinished recent session in the new active-session table. Older
-- rows are treated as already completed historical sessions.
insert into public.user_active_usage_sessions as active_session (
  user_id,
  started_at,
  last_heartbeat_at,
  created_at,
  updated_at
)
select distinct on (usage_session.user_id)
  usage_session.user_id,
  usage_session.started_at,
  usage_session.last_heartbeat_at,
  usage_session.created_at,
  usage_session.updated_at
from public.user_usage_sessions usage_session
join public.profiles profile
  on profile.id = usage_session.user_id
where usage_session.last_heartbeat_at > clock_timestamp() - interval '45 seconds'
  and lower(trim(coalesce(profile.email, ''))) not in (
    'laufer.ron@gmail.com',
    'support@analysis.co.il',
    'ron@analysis.co.il',
    'business.imc.il@gmail.com',
    'dont.reply@analysis.co.il'
  )
order by usage_session.user_id, usage_session.last_heartbeat_at desc
on conflict (user_id) do update
set
  started_at = excluded.started_at,
  last_heartbeat_at = excluded.last_heartbeat_at,
  updated_at = excluded.updated_at;

-- A recent row is still active, so it must not remain in the completed log.
delete from public.user_usage_sessions usage_session
using public.profiles profile
where profile.id = usage_session.user_id
  and usage_session.last_heartbeat_at > clock_timestamp() - interval '45 seconds';

update public.user_usage_sessions
set
  ended_at = last_heartbeat_at,
  duration_seconds = greatest(
    0::bigint,
    floor(extract(epoch from (last_heartbeat_at - started_at)))::bigint
  )
where ended_at is null;

delete from public.user_usage_sessions usage_session
using public.profiles profile
where profile.id = usage_session.user_id
  and (
    usage_session.duration_seconds <= 0
    or lower(trim(coalesce(profile.email, ''))) in (
      'laufer.ron@gmail.com',
      'support@analysis.co.il',
      'ron@analysis.co.il',
      'business.imc.il@gmail.com',
      'dont.reply@analysis.co.il'
    )
  );

delete from public.user_active_usage_sessions active_session
using public.profiles profile
where profile.id = active_session.user_id
  and lower(trim(coalesce(profile.email, ''))) in (
    'laufer.ron@gmail.com',
    'support@analysis.co.il',
    'ron@analysis.co.il',
    'business.imc.il@gmail.com',
    'dont.reply@analysis.co.il'
  );

delete from public.user_usage_stats usage_stats
using public.profiles profile
where profile.id = usage_stats.user_id
  and lower(trim(coalesce(profile.email, ''))) in (
    'laufer.ron@gmail.com',
    'support@analysis.co.il',
    'ron@analysis.co.il',
    'business.imc.il@gmail.com',
    'dont.reply@analysis.co.il'
  );

create or replace function public.touch_user_presence()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  heartbeat_at timestamptz := clock_timestamp();
  current_email text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  update public.profiles
  set last_active_at = heartbeat_at
  where id = auth.uid()
  returning lower(trim(coalesce(email, ''))) into current_email;

  -- Every 30-second heartbeat claims all sessions that have been silent for at
  -- least 45 seconds and writes them to the completed log exactly once.
  with stale_sessions as (
    delete from public.user_active_usage_sessions active_session
    where active_session.last_heartbeat_at <= heartbeat_at - interval '45 seconds'
    returning
      active_session.user_id,
      active_session.started_at,
      active_session.last_heartbeat_at,
      active_session.created_at
  )
  insert into public.user_usage_sessions (
    user_id,
    started_at,
    last_heartbeat_at,
    ended_at,
    duration_seconds,
    created_at,
    updated_at
  )
  select
    stale_session.user_id,
    stale_session.started_at,
    stale_session.last_heartbeat_at,
    stale_session.last_heartbeat_at,
    floor(extract(epoch from (stale_session.last_heartbeat_at - stale_session.started_at)))::bigint,
    stale_session.created_at,
    heartbeat_at
  from stale_sessions stale_session
  join public.profiles profile
    on profile.id = stale_session.user_id
  where stale_session.last_heartbeat_at > stale_session.started_at
    and lower(trim(coalesce(profile.email, ''))) not in (
      'laufer.ron@gmail.com',
      'support@analysis.co.il',
      'ron@analysis.co.il',
      'business.imc.il@gmail.com',
      'dont.reply@analysis.co.il'
    );

  -- These accounts still update online presence, but are never tracked in the
  -- usage log.
  if current_email in (
    'laufer.ron@gmail.com',
    'support@analysis.co.il',
    'ron@analysis.co.il',
    'business.imc.il@gmail.com',
    'dont.reply@analysis.co.il'
  ) then
    delete from public.user_active_usage_sessions
    where user_id = auth.uid();
    return;
  end if;

  insert into public.user_active_usage_sessions as active_session (
    user_id,
    started_at,
    last_heartbeat_at,
    created_at,
    updated_at
  )
  values (
    auth.uid(),
    heartbeat_at,
    heartbeat_at,
    heartbeat_at,
    heartbeat_at
  )
  on conflict (user_id) do update
  set
    last_heartbeat_at = excluded.last_heartbeat_at,
    updated_at = excluded.updated_at;
end;
$$;

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
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_system_admin() then
    raise exception 'System administrator access required';
  end if;

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
  order by usage_session.started_at desc;
end;
$$;

revoke all on function public.touch_user_presence() from public;
revoke all on function public.get_system_admin_usage_log() from public;

grant execute on function public.touch_user_presence() to authenticated;
grant execute on function public.get_system_admin_usage_log() to authenticated;

comment on table public.user_active_usage_sessions is
  'Temporary live usage sessions. A row moves to user_usage_sessions only after 45 seconds without a heartbeat.';

comment on table public.user_usage_sessions is
  'Completed usage sessions only. Active users are not included in this log.';
