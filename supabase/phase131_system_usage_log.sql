-- Circles phase 131: cumulative system usage log for the system administrator

create table if not exists public.user_usage_stats (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  total_seconds bigint not null default 0 check (total_seconds >= 0),
  last_heartbeat_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_usage_stats_total_seconds_idx
  on public.user_usage_stats (total_seconds desc);

alter table public.user_usage_stats enable row level security;

revoke all on table public.user_usage_stats from anon, authenticated;

create or replace function public.touch_user_presence()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  heartbeat_at timestamptz := clock_timestamp();
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  update public.profiles
  set last_active_at = heartbeat_at
  where id = auth.uid();

  insert into public.user_usage_stats as usage (
    user_id,
    total_seconds,
    last_heartbeat_at,
    created_at,
    updated_at
  )
  values (
    auth.uid(),
    0,
    heartbeat_at,
    heartbeat_at,
    heartbeat_at
  )
  on conflict (user_id) do update
  set
    total_seconds = usage.total_seconds +
      case
        when usage.last_heartbeat_at is not null
          and usage.last_heartbeat_at <= excluded.last_heartbeat_at
          and usage.last_heartbeat_at >= excluded.last_heartbeat_at - interval '45 seconds'
        then greatest(
          0::bigint,
          least(
            30::bigint,
            floor(extract(epoch from (excluded.last_heartbeat_at - usage.last_heartbeat_at)))::bigint
          )
        )
        else 0::bigint
      end,
    last_heartbeat_at = excluded.last_heartbeat_at,
    updated_at = excluded.updated_at;
end;
$$;

create or replace function public.get_system_admin_usage_log()
returns table (
  user_id uuid,
  full_name text,
  email text,
  community_names text[],
  total_seconds bigint,
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
    p.id as user_id,
    coalesce(nullif(trim(p.full_name), ''), nullif(trim(p.email), ''), 'משתמש') as full_name,
    p.email,
    coalesce(
      array_agg(distinct c.name order by c.name) filter (where c.id is not null),
      array[]::text[]
    ) as community_names,
    coalesce(stats.total_seconds, 0::bigint) as total_seconds,
    stats.last_heartbeat_at
  from public.profiles p
  left join public.user_usage_stats stats
    on stats.user_id = p.id
  left join public.community_members member
    on member.user_id = p.id
  left join public.communities c
    on c.id = member.community_id
  group by
    p.id,
    p.full_name,
    p.email,
    stats.total_seconds,
    stats.last_heartbeat_at
  order by
    coalesce(stats.total_seconds, 0::bigint) desc,
    coalesce(nullif(trim(p.full_name), ''), nullif(trim(p.email), ''), 'משתמש');
end;
$$;

revoke all on function public.touch_user_presence() from public;
revoke all on function public.get_system_admin_usage_log() from public;

grant execute on function public.touch_user_presence() to authenticated;
grant execute on function public.get_system_admin_usage_log() to authenticated;

comment on table public.user_usage_stats is
  'Cumulative active usage measured from the existing 30-second presence heartbeat.';

comment on column public.user_usage_stats.total_seconds is
  'Accumulated active seconds. A heartbeat contributes at most 30 seconds and only when adjacent to the previous heartbeat.';
