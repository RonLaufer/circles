-- Circles phase 112
-- הסרת מסכי שליחת המיילים, המכסות, היתרות והיסטוריית השליחות מה-DB.
-- נשמרת רק שליחת המייל האוטומטית למנהלי מעגל עבור בקשת הצטרפות,
-- כולל מנגנון מניעת שליחה כפולה לאותה בקשה.

begin;

-- הסרת הטריגרים והפונקציות של הגדרות המכסה.
drop trigger if exists communities_protect_email_limit_on_insert on public.communities;
drop trigger if exists communities_protect_email_limit_override on public.communities;

-- פונקציות בקשת ההצטרפות מוגדרות מחדש בהמשך ללא מכסות וספירות.
drop function if exists public.prepare_join_request_manager_email(uuid);
drop function if exists public.finish_join_request_manager_email(uuid, timestamptz, integer, integer);

-- פונקציות המכסות וההיסטוריה מכל הגרסאות הקודמות.
drop function if exists public.validate_email_quota_scope(text, uuid, uuid);
drop function if exists public.get_email_daily_quota(text, uuid, uuid);
drop function if exists public.reserve_email_daily_quota(text, uuid, uuid, integer);
drop function if exists public.release_email_daily_quota(text, uuid, uuid, integer);
drop function if exists public.get_community_email_daily_quota(uuid);
drop function if exists public.reserve_community_email_daily_quota(uuid, integer);
drop function if exists public.release_community_email_daily_quota(uuid, integer);
drop function if exists public.get_system_email_configuration();
drop function if exists public.set_system_email_default_daily_limit(integer);
drop function if exists public.get_system_circle_email_limits();
drop function if exists public.get_system_circle_email_overrides();
drop function if exists public.set_community_daily_email_limit(uuid, integer);
drop function if exists public.get_system_email_history();
drop function if exists public.get_system_email_history_day(date);
drop function if exists public.protect_community_email_limit_override();
drop function if exists public.get_effective_community_email_daily_limit(uuid);
drop function if exists public.get_system_default_email_daily_limit();

-- מחיקת טבלאות המעקב וההגדרות של מודול המכסות.
-- CASCADE מסיר גם טריגרים או תלויות שנשארו מגרסאות קודמות.
drop table if exists public.email_daily_usage cascade;
drop table if exists public.system_email_settings cascade;
drop function if exists public.touch_system_email_settings_updated_at();

-- מחיקת הגדרת המכסה מכל מעגל.
alter table if exists public.communities
  drop constraint if exists communities_daily_email_limit_check;

alter table if exists public.communities
  drop column if exists daily_email_limit;

-- טבלת תפעול מצומצמת נשארת רק כדי למנוע מייל כפול לאותה בקשת הצטרפות.
create table if not exists public.join_request_email_dispatches (
  community_id uuid not null references public.communities(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  requested_at timestamptz not null,
  status text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (community_id, user_id, requested_at)
);

alter table public.join_request_email_dispatches
  drop constraint if exists join_request_email_dispatches_status_check;

update public.join_request_email_dispatches
set status = 'failed'
where status = 'quota_exceeded';

alter table public.join_request_email_dispatches
  drop column if exists recipient_count,
  drop column if exists sent_count,
  drop column if exists failed_count;

alter table public.join_request_email_dispatches
  add constraint join_request_email_dispatches_status_check
  check (status in ('processing', 'completed', 'partial', 'failed', 'no_recipients'));

alter table public.join_request_email_dispatches enable row level security;
revoke all on table public.join_request_email_dispatches from anon, authenticated;

create or replace function public.prepare_join_request_manager_email(
  p_community_id uuid
)
returns table (
  already_processed boolean,
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
  join_requested_at timestamptz;
  circle_name text;
  circle_share_token uuid;
  joining_user_name text;
  manager_count integer := 0;
  inserted_dispatch_count integer := 0;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select request.requested_at, circle.name, circle.share_token, profile.full_name
    into join_requested_at, circle_name, circle_share_token, joining_user_name
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
    status
  ) values (
    p_community_id,
    current_user_id,
    join_requested_at,
    case when manager_count = 0 then 'no_recipients' else 'processing' end
  )
  on conflict (community_id, user_id, requested_at) do nothing;

  get diagnostics inserted_dispatch_count = row_count;

  if inserted_dispatch_count = 0 then
    return query
    select true, join_requested_at, circle_name, circle_share_token, joining_user_name,
           null::uuid, null::text, null::text;
    return;
  end if;

  if manager_count = 0 then
    return query
    select false, join_requested_at, circle_name, circle_share_token, joining_user_name,
           null::uuid, null::text, null::text;
    return;
  end if;

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
  select false, join_requested_at, circle_name, circle_share_token, joining_user_name,
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
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_sent_count is null or p_failed_count is null
     or p_sent_count < 0 or p_failed_count < 0 then
    raise exception 'Invalid join-request email result';
  end if;

  update public.join_request_email_dispatches
  set status = case
        when p_failed_count = 0 and p_sent_count > 0 then 'completed'
        when p_sent_count = 0 then 'failed'
        else 'partial'
      end,
      updated_at = now()
  where community_id = p_community_id
    and user_id = current_user_id
    and requested_at = p_requested_at
    and status = 'processing';
end;
$$;

revoke all on function public.prepare_join_request_manager_email(uuid) from public;
revoke all on function public.finish_join_request_manager_email(uuid, timestamptz, integer, integer) from public;
grant execute on function public.prepare_join_request_manager_email(uuid) to authenticated;
grant execute on function public.finish_join_request_manager_email(uuid, timestamptz, integer, integer) to authenticated;

commit;
