-- Circles phase 134: separate continuous usage sessions for the system administrator log

create table if not exists public.user_usage_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  started_at timestamptz not null default now(),
  last_heartbeat_at timestamptz not null default now(),
  duration_seconds bigint not null default 0 check (duration_seconds >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_usage_sessions_user_last_heartbeat_idx
  on public.user_usage_sessions (user_id, last_heartbeat_at desc);

create index if not exists user_usage_sessions_started_at_idx
  on public.user_usage_sessions (started_at desc);

alter table public.user_usage_sessions enable row level security;

revoke all on table public.user_usage_sessions from anon, authenticated;

create or replace function public.touch_user_presence()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  heartbeat_at timestamptz := clock_timestamp();
  latest_session_id uuid;
  previous_heartbeat_at timestamptz;
  elapsed_seconds bigint := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  update public.profiles
  set last_active_at = heartbeat_at
  where id = auth.uid();

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(auth.uid()::text, 134)
  );

  select usage_session.id, usage_session.last_heartbeat_at
  into latest_session_id, previous_heartbeat_at
  from public.user_usage_sessions usage_session
  where usage_session.user_id = auth.uid()
  order by usage_session.last_heartbeat_at desc
  limit 1
  for update;

  if latest_session_id is not null
    and previous_heartbeat_at <= heartbeat_at
    and previous_heartbeat_at >= heartbeat_at - interval '45 seconds'
  then
    elapsed_seconds := greatest(
      0::bigint,
      least(
        30::bigint,
        floor(extract(epoch from (heartbeat_at - previous_heartbeat_at)))::bigint
      )
    );

    update public.user_usage_sessions
    set
      duration_seconds = duration_seconds + elapsed_seconds,
      last_heartbeat_at = heartbeat_at,
      updated_at = heartbeat_at
    where id = latest_session_id;
  else
    insert into public.user_usage_sessions (
      user_id,
      started_at,
      last_heartbeat_at,
      duration_seconds,
      created_at,
      updated_at
    )
    values (
      auth.uid(),
      heartbeat_at,
      heartbeat_at,
      0,
      heartbeat_at,
      heartbeat_at
    );
  end if;
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
  last_heartbeat_at timestamptz
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
    usage_session.last_heartbeat_at
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
  order by usage_session.started_at desc;
end;
$$;

revoke all on function public.touch_user_presence() from public;
revoke all on function public.get_system_admin_usage_log() from public;

grant execute on function public.touch_user_presence() to authenticated;
grant execute on function public.get_system_admin_usage_log() to authenticated;

comment on table public.user_usage_sessions is
  'Continuous usage sessions measured from the existing 30-second presence heartbeat.';

comment on column public.user_usage_sessions.duration_seconds is
  'Active seconds accumulated only from adjacent heartbeats. A gap longer than 45 seconds starts a new session.';
