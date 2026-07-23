-- Circles phase 107: daily email limits for circles and events
-- Each circle and each event may send at most 50 successful emails per Israel calendar day.
-- A batch is reserved atomically before sending; failed deliveries are released afterward.

create table if not exists public.email_daily_usage (
  scope_type text not null check (scope_type in ('community', 'event')),
  scope_id uuid not null,
  community_id uuid not null references public.communities(id) on delete cascade,
  usage_date date not null,
  sent_count integer not null default 0 check (sent_count >= 0 and sent_count <= 50),
  updated_at timestamptz not null default now(),
  primary key (scope_type, scope_id, usage_date)
);

alter table public.email_daily_usage enable row level security;
revoke all on table public.email_daily_usage from anon, authenticated;

create or replace function public.validate_email_quota_scope(
  p_scope_type text,
  p_scope_id uuid,
  p_community_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_scope_type not in ('community', 'event') then
    raise exception 'Invalid email quota scope type';
  end if;

  if not public.is_community_admin(p_community_id) then
    raise exception 'Only circle managers may use the email module' using errcode = '42501';
  end if;

  if p_scope_type = 'community' then
    if p_scope_id <> p_community_id then
      raise exception 'The circle quota scope is invalid';
    end if;
  elsif not exists (
    select 1
    from public.community_events ce
    where ce.id = p_scope_id
      and ce.community_id = p_community_id
  ) then
    raise exception 'The event quota scope is invalid';
  end if;
end;
$$;

create or replace function public.get_email_daily_quota(
  p_scope_type text,
  p_scope_id uuid,
  p_community_id uuid
)
returns table (
  daily_limit integer,
  sent_today integer,
  remaining integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_usage_date date := (current_timestamp at time zone 'Asia/Jerusalem')::date;
  current_sent integer := 0;
begin
  perform public.validate_email_quota_scope(p_scope_type, p_scope_id, p_community_id);

  select edu.sent_count
    into current_sent
  from public.email_daily_usage edu
  where edu.scope_type = p_scope_type
    and edu.scope_id = p_scope_id
    and edu.usage_date = current_usage_date;

  current_sent := coalesce(current_sent, 0);

  return query
  select 50, current_sent, greatest(0, 50 - current_sent);
end;
$$;

create or replace function public.reserve_email_daily_quota(
  p_scope_type text,
  p_scope_id uuid,
  p_community_id uuid,
  p_requested_count integer
)
returns table (
  allowed boolean,
  daily_limit integer,
  sent_before integer,
  remaining_before integer,
  reserved_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_usage_date date := (current_timestamp at time zone 'Asia/Jerusalem')::date;
  current_sent integer;
begin
  perform public.validate_email_quota_scope(p_scope_type, p_scope_id, p_community_id);

  if p_requested_count is null or p_requested_count < 1 then
    raise exception 'The requested email count must be positive';
  end if;

  insert into public.email_daily_usage (
    scope_type,
    scope_id,
    community_id,
    usage_date,
    sent_count
  )
  values (
    p_scope_type,
    p_scope_id,
    p_community_id,
    current_usage_date,
    0
  )
  on conflict (scope_type, scope_id, usage_date) do nothing;

  select edu.sent_count
    into current_sent
  from public.email_daily_usage edu
  where edu.scope_type = p_scope_type
    and edu.scope_id = p_scope_id
    and edu.usage_date = current_usage_date
  for update;

  if current_sent + p_requested_count > 50 then
    return query
    select false, 50, current_sent, greatest(0, 50 - current_sent), 0;
    return;
  end if;

  update public.email_daily_usage
  set sent_count = current_sent + p_requested_count,
      updated_at = now(),
      community_id = p_community_id
  where scope_type = p_scope_type
    and scope_id = p_scope_id
    and usage_date = current_usage_date;

  return query
  select true, 50, current_sent, 50 - current_sent, p_requested_count;
end;
$$;

create or replace function public.release_email_daily_quota(
  p_scope_type text,
  p_scope_id uuid,
  p_community_id uuid,
  p_release_count integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_usage_date date := (current_timestamp at time zone 'Asia/Jerusalem')::date;
  updated_count integer;
begin
  perform public.validate_email_quota_scope(p_scope_type, p_scope_id, p_community_id);

  if p_release_count is null or p_release_count <= 0 then
    return 0;
  end if;

  update public.email_daily_usage
  set sent_count = greatest(0, sent_count - p_release_count),
      updated_at = now()
  where scope_type = p_scope_type
    and scope_id = p_scope_id
    and usage_date = current_usage_date
  returning sent_count into updated_count;

  return coalesce(updated_count, 0);
end;
$$;

revoke all on function public.validate_email_quota_scope(text, uuid, uuid) from public;
revoke all on function public.get_email_daily_quota(text, uuid, uuid) from public;
revoke all on function public.reserve_email_daily_quota(text, uuid, uuid, integer) from public;
revoke all on function public.release_email_daily_quota(text, uuid, uuid, integer) from public;

grant execute on function public.get_email_daily_quota(text, uuid, uuid) to authenticated;
grant execute on function public.reserve_email_daily_quota(text, uuid, uuid, integer) to authenticated;
grant execute on function public.release_email_daily_quota(text, uuid, uuid, integer) to authenticated;
