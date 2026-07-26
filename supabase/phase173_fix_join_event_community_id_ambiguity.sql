-- Circles phase 173: fix ambiguous community_id references in join functions.
-- The functions return an output column named community_id, so conflict targets
-- that also referenced community_id were ambiguous to PL/pgSQL.

begin;

create or replace function public.join_community_by_token(target_share_token uuid)
returns table (
  result text,
  community_id uuid,
  requires_approval boolean
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict error
declare
  current_user_id uuid := auth.uid();
  target_community public.communities%rowtype;
begin
  if current_user_id is null then
    raise exception 'authentication_required';
  end if;

  select community.*
  into target_community
  from public.communities community
  where community.share_token = target_share_token;

  if target_community.id is null then
    raise exception 'circle_not_found';
  end if;

  if exists (
    select 1
    from public.community_members member
    where member.community_id = target_community.id
      and member.user_id = current_user_id
  ) then
    return query select 'member'::text, target_community.id, false;
    return;
  end if;

  if target_community.requires_member_approval then
    insert into public.community_join_requests (
      community_id,
      user_id,
      status,
      requested_at,
      reviewed_at,
      reviewed_by,
      requested_event_id,
      requested_event_status,
      requested_event_note
    )
    values (
      target_community.id,
      current_user_id,
      'pending',
      now(),
      null,
      null,
      null,
      null,
      null
    )
    on conflict on constraint community_join_requests_pkey do update
    set
      status = 'pending',
      requested_at = now(),
      reviewed_at = null,
      reviewed_by = null,
      requested_event_id = null,
      requested_event_status = null,
      requested_event_note = null;

    return query select 'pending'::text, target_community.id, true;
    return;
  end if;

  insert into public.community_members (community_id, user_id, role)
  values (target_community.id, current_user_id, 'member')
  on conflict on constraint community_members_pkey do nothing;

  delete from public.community_join_requests request
  where request.community_id = target_community.id
    and request.user_id = current_user_id;

  return query select 'joined'::text, target_community.id, false;
end;
$$;

create or replace function public.join_community_by_token_with_event(
  target_share_token uuid,
  target_event_id uuid,
  target_status text,
  target_note text default null
)
returns table (
  result text,
  community_id uuid,
  requires_approval boolean
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict error
declare
  current_user_id uuid := auth.uid();
  target_community public.communities%rowtype;
  target_event public.community_events%rowtype;
  normalized_note text;
  current_going_count integer;
begin
  if current_user_id is null then
    raise exception 'authentication_required';
  end if;

  if target_status not in ('going', 'maybe', 'not_going') then
    raise exception 'invalid_attendance_status';
  end if;

  normalized_note := nullif(btrim(coalesce(target_note, '')), '');
  if normalized_note is not null and char_length(normalized_note) > 500 then
    raise exception 'attendance_note_too_long';
  end if;

  select community.*
  into target_community
  from public.communities community
  where community.share_token = target_share_token;

  if target_community.id is null then
    raise exception 'circle_not_found';
  end if;

  select event.*
  into target_event
  from public.community_events event
  where event.id = target_event_id
    and event.community_id = target_community.id;

  if target_event.id is null then
    raise exception 'event_not_found';
  end if;

  if target_event.status = 'cancelled' or target_event.starts_at <= now() then
    raise exception 'event_closed';
  end if;

  if target_status = 'going' and target_event.participant_limit is not null then
    select count(*)::integer
    into current_going_count
    from public.event_attendance attendance
    where attendance.event_id = target_event.id
      and attendance.status = 'going'
      and attendance.user_id <> current_user_id;

    if current_going_count + 1 > target_event.participant_limit then
      raise exception 'event_capacity_exceeded';
    end if;
  end if;

  if exists (
    select 1
    from public.community_members member
    where member.community_id = target_community.id
      and member.user_id = current_user_id
  ) then
    insert into public.event_attendance (event_id, user_id, status, note)
    values (target_event.id, current_user_id, target_status, normalized_note)
    on conflict (event_id, user_id) do update
    set
      status = excluded.status,
      note = excluded.note,
      actual_status = null,
      actual_status_at = null,
      actual_status_by = null,
      updated_at = now();

    return query select 'member'::text, target_community.id, false;
    return;
  end if;

  if target_community.requires_member_approval then
    insert into public.community_join_requests (
      community_id,
      user_id,
      status,
      requested_at,
      reviewed_at,
      reviewed_by,
      requested_event_id,
      requested_event_status,
      requested_event_note
    )
    values (
      target_community.id,
      current_user_id,
      'pending',
      now(),
      null,
      null,
      target_event.id,
      target_status,
      normalized_note
    )
    on conflict on constraint community_join_requests_pkey do update
    set
      status = 'pending',
      requested_at = now(),
      reviewed_at = null,
      reviewed_by = null,
      requested_event_id = excluded.requested_event_id,
      requested_event_status = excluded.requested_event_status,
      requested_event_note = excluded.requested_event_note;

    return query select 'pending'::text, target_community.id, true;
    return;
  end if;

  insert into public.community_members (community_id, user_id, role)
  values (target_community.id, current_user_id, 'member')
  on conflict on constraint community_members_pkey do nothing;

  insert into public.event_attendance (event_id, user_id, status, note)
  values (target_event.id, current_user_id, target_status, normalized_note)
  on conflict (event_id, user_id) do update
  set
    status = excluded.status,
    note = excluded.note,
    actual_status = null,
    actual_status_at = null,
    actual_status_by = null,
    updated_at = now();

  delete from public.community_join_requests request
  where request.community_id = target_community.id
    and request.user_id = current_user_id;

  return query select 'joined'::text, target_community.id, false;
end;
$$;

revoke all on function public.join_community_by_token(uuid) from public;
grant execute on function public.join_community_by_token(uuid) to authenticated;

revoke all on function public.join_community_by_token_with_event(uuid, uuid, text, text) from public;
grant execute on function public.join_community_by_token_with_event(uuid, uuid, text, text) to authenticated;

commit;
