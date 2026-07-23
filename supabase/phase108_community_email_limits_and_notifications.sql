-- Circles phase 108:
-- 1. A configurable daily email limit per circle, shared by the circle and all of its events.
-- 2. System-owner-only management of the per-circle limit.
-- 3. In-app notifications for every successfully delivered manual email.
-- 4. Safe preparation and accounting for automatic join-request emails to circle managers.

begin;

alter table public.communities
  add column if not exists daily_email_limit integer not null default 50;

alter table public.communities
  drop constraint if exists communities_daily_email_limit_check;

alter table public.communities
  add constraint communities_daily_email_limit_check
  check (daily_email_limit >= 0);

-- The previous phase limited each event separately and capped each usage row at 50.
-- Consolidate all historical event/circle usage into one circle row per Israel calendar day.
alter table public.email_daily_usage
  drop constraint if exists email_daily_usage_sent_count_check;

alter table public.email_daily_usage
  drop constraint if exists email_daily_usage_sent_count_nonnegative;

alter table public.email_daily_usage
  add constraint email_daily_usage_sent_count_nonnegative
  check (sent_count >= 0);

with consolidated as (
  select
    usage.community_id,
    usage.usage_date,
    sum(usage.sent_count)::integer as sent_count,
    max(usage.updated_at) as updated_at
  from public.email_daily_usage usage
  group by usage.community_id, usage.usage_date
)
insert into public.email_daily_usage (
  scope_type,
  scope_id,
  community_id,
  usage_date,
  sent_count,
  updated_at
)
select
  'community',
  consolidated.community_id,
  consolidated.community_id,
  consolidated.usage_date,
  consolidated.sent_count,
  consolidated.updated_at
from consolidated
on conflict (scope_type, scope_id, usage_date)
do update set
  sent_count = excluded.sent_count,
  updated_at = excluded.updated_at,
  community_id = excluded.community_id;

delete from public.email_daily_usage
where scope_type <> 'community'
   or scope_id <> community_id;

create or replace function public.get_community_email_daily_quota(
  p_community_id uuid
)
returns table (
  daily_limit integer,
  sent_today integer,
  remaining integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_usage_date date := (current_timestamp at time zone 'Asia/Jerusalem')::date;
  configured_limit integer;
  current_sent integer := 0;
begin
  if not public.is_community_admin(p_community_id) then
    raise exception 'Only circle managers may use the email module' using errcode = '42501';
  end if;

  select c.daily_email_limit
    into configured_limit
  from public.communities c
  where c.id = p_community_id;

  if configured_limit is null then
    raise exception 'Circle not found';
  end if;

  select usage.sent_count
    into current_sent
  from public.email_daily_usage usage
  where usage.scope_type = 'community'
    and usage.scope_id = p_community_id
    and usage.usage_date = current_usage_date;

  current_sent := coalesce(current_sent, 0);

  return query
  select configured_limit, current_sent, greatest(0, configured_limit - current_sent);
end;
$$;

create or replace function public.reserve_community_email_daily_quota(
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
  configured_limit integer;
  current_sent integer;
begin
  if not public.is_community_admin(p_community_id) then
    raise exception 'Only circle managers may use the email module' using errcode = '42501';
  end if;

  if p_requested_count is null or p_requested_count < 1 then
    raise exception 'The requested email count must be positive';
  end if;

  select c.daily_email_limit
    into configured_limit
  from public.communities c
  where c.id = p_community_id;

  if configured_limit is null then
    raise exception 'Circle not found';
  end if;

  insert into public.email_daily_usage (
    scope_type,
    scope_id,
    community_id,
    usage_date,
    sent_count
  )
  values (
    'community',
    p_community_id,
    p_community_id,
    current_usage_date,
    0
  )
  on conflict (scope_type, scope_id, usage_date) do nothing;

  select usage.sent_count
    into current_sent
  from public.email_daily_usage usage
  where usage.scope_type = 'community'
    and usage.scope_id = p_community_id
    and usage.usage_date = current_usage_date
  for update;

  if current_sent + p_requested_count > configured_limit then
    return query
    select false, configured_limit, current_sent, greatest(0, configured_limit - current_sent), 0;
    return;
  end if;

  update public.email_daily_usage
  set sent_count = current_sent + p_requested_count,
      updated_at = now(),
      community_id = p_community_id
  where scope_type = 'community'
    and scope_id = p_community_id
    and usage_date = current_usage_date;

  return query
  select true, configured_limit, current_sent,
         greatest(0, configured_limit - current_sent), p_requested_count;
end;
$$;

create or replace function public.release_community_email_daily_quota(
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
  if not public.is_community_admin(p_community_id) then
    raise exception 'Only circle managers may use the email module' using errcode = '42501';
  end if;

  if p_release_count is null or p_release_count <= 0 then
    return 0;
  end if;

  update public.email_daily_usage
  set sent_count = greatest(0, sent_count - p_release_count),
      updated_at = now()
  where scope_type = 'community'
    and scope_id = p_community_id
    and usage_date = current_usage_date
  returning sent_count into updated_count;

  return coalesce(updated_count, 0);
end;
$$;

create or replace function public.get_system_circle_email_limits()
returns table (
  community_id uuid,
  community_name text,
  daily_limit integer,
  sent_today integer,
  remaining integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_usage_date date := (current_timestamp at time zone 'Asia/Jerusalem')::date;
begin
  if not public.is_system_admin() then
    raise exception 'Only the system owner may manage circle email limits' using errcode = '42501';
  end if;

  return query
  select
    circle.id,
    circle.name,
    circle.daily_email_limit,
    coalesce(usage.sent_count, 0),
    greatest(0, circle.daily_email_limit - coalesce(usage.sent_count, 0))
  from public.communities circle
  left join public.email_daily_usage usage
    on usage.scope_type = 'community'
   and usage.scope_id = circle.id
   and usage.usage_date = current_usage_date
  order by lower(circle.name), circle.created_at;
end;
$$;

create or replace function public.set_community_daily_email_limit(
  p_community_id uuid,
  p_daily_limit integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_system_admin() then
    raise exception 'Only the system owner may manage circle email limits' using errcode = '42501';
  end if;

  if p_daily_limit is null or p_daily_limit < 0 then
    raise exception 'The daily email limit must be zero or greater';
  end if;

  update public.communities
  set daily_email_limit = p_daily_limit,
      updated_at = now()
  where id = p_community_id;

  if not found then
    raise exception 'Circle not found';
  end if;
end;
$$;

create or replace function public.create_email_delivery_notifications(
  p_community_id uuid,
  p_event_id uuid,
  p_recipient_user_ids uuid[],
  p_title text,
  p_body text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_count integer := 0;
begin
  if not public.is_community_admin(p_community_id) then
    raise exception 'Only circle managers may create email notifications' using errcode = '42501';
  end if;

  if p_event_id is not null and not exists (
    select 1
    from public.community_events event
    where event.id = p_event_id
      and event.community_id = p_community_id
  ) then
    raise exception 'The event does not belong to the circle';
  end if;

  insert into public.notifications (
    user_id,
    community_id,
    event_id,
    type,
    title,
    body
  )
  select distinct
    recipient.user_id,
    p_community_id,
    p_event_id,
    'email_message',
    left(coalesce(nullif(trim(p_title), ''), 'הודעה ממעגלים'), 160),
    left(coalesce(p_body, ''), 5000)
  from unnest(coalesce(p_recipient_user_ids, array[]::uuid[])) as recipient(user_id)
  where exists (
    select 1
    from public.community_members member
    where member.community_id = p_community_id
      and member.user_id = recipient.user_id
  )
  or exists (
    select 1
    from public.profiles profile
    where profile.id = recipient.user_id
      and lower(trim(coalesce(profile.email, ''))) = 'laufer.ron@gmail.com'
  );

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

create table if not exists public.join_request_email_dispatches (
  community_id uuid not null references public.communities(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  requested_at timestamptz not null,
  status text not null check (status in ('processing', 'completed', 'partial', 'failed', 'quota_exceeded', 'no_recipients')),
  recipient_count integer not null default 0 check (recipient_count >= 0),
  sent_count integer not null default 0 check (sent_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (community_id, user_id, requested_at)
);

alter table public.join_request_email_dispatches enable row level security;
revoke all on table public.join_request_email_dispatches from anon, authenticated;

create or replace function public.prepare_join_request_manager_email(
  p_community_id uuid
)
returns table (
  allowed boolean,
  already_processed boolean,
  daily_limit integer,
  sent_before integer,
  remaining_before integer,
  request_time timestamptz,
  community_name text,
  community_share_token uuid,
  requester_name text,
  recipient_user_id uuid,
  recipient_name text,
  recipient_email text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_usage_date date := (current_timestamp at time zone 'Asia/Jerusalem')::date;
  join_requested_at timestamptz;
  circle_name text;
  circle_share_token uuid;
  circle_limit integer;
  joining_user_name text;
  manager_count integer := 0;
  current_sent integer := 0;
  inserted_dispatch_count integer := 0;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select request.requested_at, circle.name, circle.share_token, circle.daily_email_limit, profile.full_name
    into join_requested_at, circle_name, circle_share_token, circle_limit, joining_user_name
  from public.community_join_requests request
  join public.communities circle on circle.id = request.community_id
  join public.profiles profile on profile.id = request.user_id
  where request.community_id = p_community_id
    and request.user_id = current_user_id
    and request.status = 'pending'
    and circle.requires_member_approval = true;

  if join_requested_at is null then
    raise exception 'No pending join request was found' using errcode = '42501';
  end if;

  with manager_ids as (
    select member.user_id
    from public.community_members member
    where member.community_id = p_community_id
      and member.role in ('owner', 'admin')
    union
    select profile.id
    from public.profiles profile
    where lower(trim(coalesce(profile.email, ''))) = 'laufer.ron@gmail.com'
  ), recipients as (
    select distinct on (lower(trim(profile.email)))
      profile.id,
      profile.full_name,
      lower(trim(profile.email)) as email
    from manager_ids
    join public.profiles profile on profile.id = manager_ids.user_id
    where manager_ids.user_id <> current_user_id
      and nullif(trim(coalesce(profile.email, '')), '') is not null
    order by lower(trim(profile.email)), profile.id
  )
  select count(*)::integer into manager_count
  from recipients;

  insert into public.join_request_email_dispatches (
    community_id,
    user_id,
    requested_at,
    status,
    recipient_count
  )
  values (
    p_community_id,
    current_user_id,
    join_requested_at,
    case when manager_count = 0 then 'no_recipients' else 'processing' end,
    manager_count
  )
  on conflict (community_id, user_id, requested_at) do nothing;

  get diagnostics inserted_dispatch_count = row_count;

  if inserted_dispatch_count = 0 then
    return query
    select false, true, circle_limit, 0, circle_limit, join_requested_at,
           circle_name, circle_share_token, joining_user_name, null::uuid, null::text, null::text;
    return;
  end if;

  if manager_count = 0 then
    return query
    select false, false, circle_limit, 0, circle_limit, join_requested_at,
           circle_name, circle_share_token, joining_user_name, null::uuid, null::text, null::text;
    return;
  end if;

  insert into public.email_daily_usage (
    scope_type,
    scope_id,
    community_id,
    usage_date,
    sent_count
  )
  values (
    'community',
    p_community_id,
    p_community_id,
    current_usage_date,
    0
  )
  on conflict (scope_type, scope_id, usage_date) do nothing;

  select usage.sent_count
    into current_sent
  from public.email_daily_usage usage
  where usage.scope_type = 'community'
    and usage.scope_id = p_community_id
    and usage.usage_date = current_usage_date
  for update;

  if current_sent + manager_count > circle_limit then
    update public.join_request_email_dispatches
    set status = 'quota_exceeded',
        updated_at = now()
    where community_id = p_community_id
      and user_id = current_user_id
      and requested_at = join_requested_at;

    return query
    select false, false, circle_limit, current_sent,
           greatest(0, circle_limit - current_sent), join_requested_at,
           circle_name, circle_share_token, joining_user_name, null::uuid, null::text, null::text;
    return;
  end if;

  update public.email_daily_usage
  set sent_count = current_sent + manager_count,
      updated_at = now()
  where scope_type = 'community'
    and scope_id = p_community_id
    and usage_date = current_usage_date;

  return query
  with manager_ids as (
    select member.user_id
    from public.community_members member
    where member.community_id = p_community_id
      and member.role in ('owner', 'admin')
    union
    select profile.id
    from public.profiles profile
    where lower(trim(coalesce(profile.email, ''))) = 'laufer.ron@gmail.com'
  ), recipients as (
    select distinct on (lower(trim(profile.email)))
      profile.id,
      profile.full_name,
      lower(trim(profile.email)) as email
    from manager_ids
    join public.profiles profile on profile.id = manager_ids.user_id
    where manager_ids.user_id <> current_user_id
      and nullif(trim(coalesce(profile.email, '')), '') is not null
    order by lower(trim(profile.email)), profile.id
  )
  select true, false, circle_limit, current_sent,
         greatest(0, circle_limit - current_sent), join_requested_at,
         circle_name, circle_share_token, joining_user_name,
         recipients.id, recipients.full_name, recipients.email
  from recipients;
end;
$$;

create or replace function public.finish_join_request_manager_email(
  p_community_id uuid,
  p_requested_at timestamptz,
  p_sent_count integer,
  p_failed_count integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_usage_date date := (current_timestamp at time zone 'Asia/Jerusalem')::date;
  dispatch_recipient_count integer;
  dispatch_status text;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select dispatch.recipient_count, dispatch.status
    into dispatch_recipient_count, dispatch_status
  from public.join_request_email_dispatches dispatch
  where dispatch.community_id = p_community_id
    and dispatch.user_id = current_user_id
    and dispatch.requested_at = p_requested_at
  for update;

  if dispatch_status is null or dispatch_status <> 'processing' then
    return;
  end if;

  if p_sent_count is null or p_failed_count is null
     or p_sent_count < 0 or p_failed_count < 0
     or p_sent_count + p_failed_count <> dispatch_recipient_count then
    raise exception 'Invalid join-request email result';
  end if;

  if p_failed_count > 0 then
    update public.email_daily_usage
    set sent_count = greatest(0, sent_count - p_failed_count),
        updated_at = now()
    where scope_type = 'community'
      and scope_id = p_community_id
      and usage_date = current_usage_date;
  end if;

  update public.join_request_email_dispatches
  set status = case
        when p_sent_count = dispatch_recipient_count then 'completed'
        when p_sent_count = 0 then 'failed'
        else 'partial'
      end,
      sent_count = p_sent_count,
      failed_count = p_failed_count,
      updated_at = now()
  where community_id = p_community_id
    and user_id = current_user_id
    and requested_at = p_requested_at;
end;
$$;

-- Retire the phase 107 public RPCs so all new clients use the circle-wide quota.
revoke all on function public.get_email_daily_quota(text, uuid, uuid) from authenticated;
revoke all on function public.reserve_email_daily_quota(text, uuid, uuid, integer) from authenticated;
revoke all on function public.release_email_daily_quota(text, uuid, uuid, integer) from authenticated;

revoke all on function public.get_community_email_daily_quota(uuid) from public;
revoke all on function public.reserve_community_email_daily_quota(uuid, integer) from public;
revoke all on function public.release_community_email_daily_quota(uuid, integer) from public;
revoke all on function public.get_system_circle_email_limits() from public;
revoke all on function public.set_community_daily_email_limit(uuid, integer) from public;
revoke all on function public.create_email_delivery_notifications(uuid, uuid, uuid[], text, text) from public;
revoke all on function public.prepare_join_request_manager_email(uuid) from public;
revoke all on function public.finish_join_request_manager_email(uuid, timestamptz, integer, integer) from public;

grant execute on function public.get_community_email_daily_quota(uuid) to authenticated;
grant execute on function public.reserve_community_email_daily_quota(uuid, integer) to authenticated;
grant execute on function public.release_community_email_daily_quota(uuid, integer) to authenticated;
grant execute on function public.get_system_circle_email_limits() to authenticated;
grant execute on function public.set_community_daily_email_limit(uuid, integer) to authenticated;
grant execute on function public.create_email_delivery_notifications(uuid, uuid, uuid[], text, text) to authenticated;
grant execute on function public.prepare_join_request_manager_email(uuid) to authenticated;
grant execute on function public.finish_join_request_manager_email(uuid, timestamptz, integer, integer) to authenticated;

commit;
