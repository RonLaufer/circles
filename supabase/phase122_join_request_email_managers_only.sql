-- circles122
-- תיקון נמעני מייל עבור בקשת הצטרפות למעגל.
-- המייל נשלח רק לבעלים ולמנהלים בפועל של המעגל.
-- מנהל המערכת הכללי אינו נוסף אוטומטית אם תפקידו במעגל הוא member או אם אינו חבר בו.

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

  with recipients as (
    select distinct on (lower(trim(profile.email)))
      profile.id,
      profile.full_name,
      lower(trim(profile.email)) as email
    from public.community_members member
    join public.profiles profile on profile.id = member.user_id
    where member.community_id = p_community_id
      and member.role in ('owner', 'admin')
      and member.user_id <> current_user_id
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
  with recipients as (
    select distinct on (lower(trim(profile.email)))
      profile.id,
      profile.full_name,
      lower(trim(profile.email)) as email
    from public.community_members member
    join public.profiles profile on profile.id = member.user_id
    where member.community_id = p_community_id
      and member.role in ('owner', 'admin')
      and member.user_id <> current_user_id
      and nullif(trim(coalesce(profile.email, '')), '') is not null
    order by lower(trim(profile.email)), profile.id
  )
  select false, join_requested_at, circle_name, circle_share_token, joining_user_name,
         recipients.id, recipients.full_name, recipients.email
  from recipients;
end;
$$;

revoke all on function public.prepare_join_request_manager_email(uuid) from public;
grant execute on function public.prepare_join_request_manager_email(uuid) to authenticated;
