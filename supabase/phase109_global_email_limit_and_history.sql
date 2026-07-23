-- Circles phase 109
-- מכסת ברירת מחדל כללית, חריגות למעגלים והיסטוריית שליחה ל-14 ימים.

begin;

create table if not exists public.system_email_settings (
  id smallint primary key check (id = 1),
  updated_at timestamptz not null default now()
);

alter table public.system_email_settings
  add column if not exists daily_email_limit integer not null default 50;

alter table public.system_email_settings
  drop constraint if exists system_email_settings_daily_email_limit_check;

alter table public.system_email_settings
  add constraint system_email_settings_daily_email_limit_check
  check (daily_email_limit >= 0);

insert into public.system_email_settings (id, daily_email_limit)
values (1, 50)
on conflict (id) do nothing;

alter table public.communities
  alter column daily_email_limit set default 0;

-- ערך 50 היה ברירת המחדל של phase108. מעכשיו 0 פירושו שימוש בברירת המחדל הכללית.
update public.communities
set daily_email_limit = 0
where daily_email_limit = 50;

create or replace function public.get_system_default_email_daily_limit()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select settings.daily_email_limit
     from public.system_email_settings settings
     where settings.id = 1),
    50
  );
$$;

create or replace function public.get_effective_community_email_daily_limit(
  p_community_id uuid
)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when circle.daily_email_limit > 0 then circle.daily_email_limit
    else public.get_system_default_email_daily_limit()
  end
  from public.communities circle
  where circle.id = p_community_id;
$$;

create or replace function public.protect_community_email_limit_override()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  global_limit integer;
begin
  if tg_op = 'INSERT' then
    new.daily_email_limit := coalesce(new.daily_email_limit, 0);
    if new.daily_email_limit <> 0 and not public.is_system_admin() then
      raise exception 'Only the system owner may set a circle email limit' using errcode = '42501';
    end if;
  elsif new.daily_email_limit is distinct from old.daily_email_limit then
    if not public.is_system_admin() then
      raise exception 'Only the system owner may change the circle email limit' using errcode = '42501';
    end if;
  end if;

  if new.daily_email_limit is null or new.daily_email_limit < 0 then
    raise exception 'The circle email limit must be zero or greater';
  end if;

  global_limit := public.get_system_default_email_daily_limit();
  if new.daily_email_limit = global_limit then
    new.daily_email_limit := 0;
  end if;

  return new;
end;
$$;

drop trigger if exists communities_protect_email_limit_on_insert
on public.communities;

drop trigger if exists communities_protect_email_limit_override
on public.communities;

create trigger communities_protect_email_limit_on_insert
before insert on public.communities
for each row
execute function public.protect_community_email_limit_override();

create trigger communities_protect_email_limit_override
before update of daily_email_limit on public.communities
for each row
execute function public.protect_community_email_limit_override();

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

  configured_limit := public.get_effective_community_email_daily_limit(p_community_id);
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

  configured_limit := public.get_effective_community_email_daily_limit(p_community_id);
  if configured_limit is null then
    raise exception 'Circle not found';
  end if;

  insert into public.email_daily_usage (
    scope_type,
    scope_id,
    community_id,
    usage_date,
    sent_count
  ) values (
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
    select false, configured_limit, current_sent,
           greatest(0, configured_limit - current_sent), 0;
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

create or replace function public.get_system_email_configuration()
returns table (
  global_daily_limit integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_system_admin() then
    raise exception 'Only the system owner may manage email settings' using errcode = '42501';
  end if;

  return query select public.get_system_default_email_daily_limit();
end;
$$;

create or replace function public.set_system_email_default_daily_limit(
  p_daily_limit integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_system_admin() then
    raise exception 'Only the system owner may manage email settings' using errcode = '42501';
  end if;

  if p_daily_limit is null or p_daily_limit < 0 then
    raise exception 'The daily email limit must be zero or greater';
  end if;

  insert into public.system_email_settings (id, daily_email_limit, updated_at)
  values (1, p_daily_limit, now())
  on conflict (id) do update
  set daily_email_limit = excluded.daily_email_limit,
      updated_at = now();

  -- חריגה שזהה לברירת המחדל אינה חריגה יותר.
  update public.communities
  set daily_email_limit = 0,
      updated_at = now()
  where daily_email_limit = p_daily_limit;
end;
$$;

-- תאימות לגרסאות קודמות: החזרת המכסה האפקטיבית לכל המעגלים.
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
    public.get_effective_community_email_daily_limit(circle.id),
    coalesce(usage.sent_count, 0),
    greatest(
      0,
      public.get_effective_community_email_daily_limit(circle.id) - coalesce(usage.sent_count, 0)
    )
  from public.communities circle
  left join public.email_daily_usage usage
    on usage.scope_type = 'community'
   and usage.scope_id = circle.id
   and usage.usage_date = current_usage_date
  order by lower(circle.name), circle.created_at;
end;
$$;

create or replace function public.get_system_circle_email_overrides()
returns table (
  community_id uuid,
  community_name text,
  override_limit integer,
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
  global_limit integer := public.get_system_default_email_daily_limit();
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
  where circle.daily_email_limit > 0
    and circle.daily_email_limit <> global_limit
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
declare
  global_limit integer;
  normalized_limit integer;
begin
  if not public.is_system_admin() then
    raise exception 'Only the system owner may manage circle email limits' using errcode = '42501';
  end if;

  if p_daily_limit is null or p_daily_limit < 0 then
    raise exception 'The daily email limit must be zero or greater';
  end if;

  global_limit := public.get_system_default_email_daily_limit();
  normalized_limit := case
    when p_daily_limit = 0 or p_daily_limit = global_limit then 0
    else p_daily_limit
  end;

  update public.communities
  set daily_email_limit = normalized_limit,
      updated_at = now()
  where id = p_community_id;

  if not found then
    raise exception 'Circle not found';
  end if;
end;
$$;

create or replace function public.get_system_email_history()
returns table (
  usage_date date,
  total_sent integer
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
    raise exception 'Only the system owner may view email history' using errcode = '42501';
  end if;

  return query
  select
    day_value::date,
    coalesce(sum(usage.sent_count), 0)::integer
  from generate_series(
    current_usage_date - 13,
    current_usage_date,
    interval '1 day'
  ) as days(day_value)
  left join public.email_daily_usage usage
    on usage.scope_type = 'community'
   and usage.usage_date = day_value::date
  group by day_value
  order by day_value desc;
end;
$$;

create or replace function public.get_system_email_history_day(
  p_usage_date date
)
returns table (
  community_id uuid,
  community_name text,
  sent_count integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_system_admin() then
    raise exception 'Only the system owner may view email history' using errcode = '42501';
  end if;

  return query
  select
    circle.id,
    circle.name,
    usage.sent_count
  from public.email_daily_usage usage
  join public.communities circle on circle.id = usage.community_id
  where usage.scope_type = 'community'
    and usage.usage_date = p_usage_date
    and usage.sent_count > 0
  order by usage.sent_count desc, lower(circle.name);
end;
$$;

-- עדכון מייל אוטומטי למנהלים כך שישתמש במכסה האפקטיבית של המעגל.
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

  select
    request.requested_at,
    circle.name,
    circle.share_token,
    public.get_effective_community_email_daily_limit(circle.id),
    profile.full_name
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
  ) values (
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
           circle_name, circle_share_token, joining_user_name,
           null::uuid, null::text, null::text;
    return;
  end if;

  if manager_count = 0 then
    return query
    select false, false, circle_limit, 0, circle_limit, join_requested_at,
           circle_name, circle_share_token, joining_user_name,
           null::uuid, null::text, null::text;
    return;
  end if;

  insert into public.email_daily_usage (
    scope_type,
    scope_id,
    community_id,
    usage_date,
    sent_count
  ) values (
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
           circle_name, circle_share_token, joining_user_name,
           null::uuid, null::text, null::text;
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

revoke all on function public.get_system_default_email_daily_limit() from public;
revoke all on function public.get_effective_community_email_daily_limit(uuid) from public;
revoke all on function public.get_system_email_configuration() from public;
revoke all on function public.set_system_email_default_daily_limit(integer) from public;
revoke all on function public.get_system_circle_email_limits() from public;
revoke all on function public.get_system_circle_email_overrides() from public;
revoke all on function public.get_system_email_history() from public;
revoke all on function public.get_system_email_history_day(date) from public;

-- הפונקציות הקיימות מוגדרות מחדש ולכן מחזירים להן את הרשאות ההפעלה המתאימות.
revoke all on function public.get_community_email_daily_quota(uuid) from public;
revoke all on function public.reserve_community_email_daily_quota(uuid, integer) from public;
revoke all on function public.set_community_daily_email_limit(uuid, integer) from public;
revoke all on function public.prepare_join_request_manager_email(uuid) from public;

grant execute on function public.get_community_email_daily_quota(uuid) to authenticated;
grant execute on function public.reserve_community_email_daily_quota(uuid, integer) to authenticated;
grant execute on function public.get_system_email_configuration() to authenticated;
grant execute on function public.set_system_email_default_daily_limit(integer) to authenticated;
grant execute on function public.get_system_circle_email_limits() to authenticated;
grant execute on function public.get_system_circle_email_overrides() to authenticated;
grant execute on function public.set_community_daily_email_limit(uuid, integer) to authenticated;
grant execute on function public.get_system_email_history() to authenticated;
grant execute on function public.get_system_email_history_day(date) to authenticated;
grant execute on function public.prepare_join_request_manager_email(uuid) to authenticated;

commit;
