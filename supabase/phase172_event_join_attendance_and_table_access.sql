-- Circles phase 172: collect event attendance while joining a circle and
-- restrict ride/bring editing according to the user's event response.

begin;

alter table public.community_join_requests
  add column if not exists requested_event_id uuid references public.community_events(id) on delete set null,
  add column if not exists requested_event_status text,
  add column if not exists requested_event_note text;

alter table public.community_join_requests
  drop constraint if exists community_join_requests_requested_event_status_check;

alter table public.community_join_requests
  add constraint community_join_requests_requested_event_status_check
  check (
    requested_event_status is null
    or requested_event_status in ('going', 'maybe', 'not_going')
  );

alter table public.community_join_requests
  drop constraint if exists community_join_requests_requested_event_note_length_check;

alter table public.community_join_requests
  add constraint community_join_requests_requested_event_note_length_check
  check (
    requested_event_note is null
    or char_length(requested_event_note) <= 500
  );

-- Keep the regular circle-only join function, while clearing any stale event
-- response left by an older pending request.
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
    on conflict (community_id, user_id) do update
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
  on conflict (community_id, user_id) do nothing;

  delete from public.community_join_requests request
  where request.community_id = target_community.id
    and request.user_id = current_user_id;

  return query select 'joined'::text, target_community.id, false;
end;
$$;

-- Join from an event link and save the response at the same time. If approval
-- is required, the response is stored on the pending request and applied when
-- a manager approves it.
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
    on conflict (community_id, user_id) do update
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
  on conflict (community_id, user_id) do nothing;

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

-- Apply the event response when a pending circle membership is approved.
create or replace function public.review_community_join_request(
  target_community_id uuid,
  target_user_id uuid,
  target_decision text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  pending_request public.community_join_requests%rowtype;
begin
  if not public.is_community_admin(target_community_id) then
    raise exception 'permission_denied';
  end if;

  if target_decision not in ('approve', 'reject') then
    raise exception 'invalid_decision';
  end if;

  select request.*
  into pending_request
  from public.community_join_requests request
  where request.community_id = target_community_id
    and request.user_id = target_user_id
    and request.status = 'pending'
  for update;

  if pending_request.community_id is null then
    raise exception 'request_not_found';
  end if;

  if target_decision = 'approve' then
    insert into public.community_members (community_id, user_id, role)
    values (target_community_id, target_user_id, 'member')
    on conflict (community_id, user_id) do nothing;

    if pending_request.requested_event_id is not null
      and pending_request.requested_event_status in ('going', 'maybe', 'not_going')
      and exists (
        select 1
        from public.community_events event
        where event.id = pending_request.requested_event_id
          and event.community_id = target_community_id
          and event.status = 'active'
          and event.starts_at > now()
      ) then
      insert into public.event_attendance (event_id, user_id, status, note)
      values (
        pending_request.requested_event_id,
        target_user_id,
        pending_request.requested_event_status,
        pending_request.requested_event_note
      )
      on conflict (event_id, user_id) do update
      set
        status = excluded.status,
        note = excluded.note,
        actual_status = null,
        actual_status_at = null,
        actual_status_by = null,
        updated_at = now();
    end if;

    update public.community_join_requests request
    set
      status = 'approved',
      reviewed_at = now(),
      reviewed_by = auth.uid()
    where request.community_id = target_community_id
      and request.user_id = target_user_id;

    return 'approved';
  end if;

  update public.community_join_requests request
  set
    status = 'rejected',
    reviewed_at = now(),
    reviewed_by = auth.uid()
  where request.community_id = target_community_id
    and request.user_id = target_user_id;

  return 'rejected';
end;
$$;

revoke all on function public.join_community_by_token_with_event(uuid, uuid, text, text) from public;
grant execute on function public.join_community_by_token_with_event(uuid, uuid, text, text) to authenticated;

-- Bring-table editing is allowed to regular users only when they are marked
-- as going. Existing system-admin policies remain in place.
drop policy if exists "event_bring_contributions_insert_self" on public.event_bring_contributions;
create policy "event_bring_contributions_insert_self"
on public.event_bring_contributions
for insert
to authenticated
with check (
  user_id = auth.uid()
  and (public.event_is_open_for_members(event_id) or public.can_manage_event(event_id))
  and exists (
    select 1
    from public.community_events event
    where event.id = event_bring_contributions.event_id
      and public.is_community_member(event.community_id)
  )
  and exists (
    select 1
    from public.event_attendance attendance
    where attendance.event_id = event_bring_contributions.event_id
      and attendance.user_id = auth.uid()
      and attendance.status = 'going'
  )
  and (
    need_id is null
    or exists (
      select 1
      from public.event_bring_needs need
      where need.id = event_bring_contributions.need_id
        and need.event_id = event_bring_contributions.event_id
    )
  )
);

drop policy if exists "event_bring_contributions_update_self" on public.event_bring_contributions;
create policy "event_bring_contributions_update_self"
on public.event_bring_contributions
for update
to authenticated
using (
  user_id = auth.uid()
  and (public.event_is_open_for_members(event_id) or public.can_manage_event(event_id))
  and exists (
    select 1
    from public.event_attendance attendance
    where attendance.event_id = event_bring_contributions.event_id
      and attendance.user_id = auth.uid()
      and attendance.status = 'going'
  )
)
with check (
  user_id = auth.uid()
  and (public.event_is_open_for_members(event_id) or public.can_manage_event(event_id))
  and exists (
    select 1
    from public.event_attendance attendance
    where attendance.event_id = event_bring_contributions.event_id
      and attendance.user_id = auth.uid()
      and attendance.status = 'going'
  )
);

-- Ride-table editing is allowed when the user answered going or maybe.
drop policy if exists "event_ride_requests_insert_own" on public.event_ride_requests;
create policy "event_ride_requests_insert_own"
on public.event_ride_requests
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.community_events event
    join public.event_attendance attendance
      on attendance.event_id = event.id
     and attendance.user_id = auth.uid()
     and attendance.status in ('going', 'maybe')
    where event.id = event_ride_requests.event_id
      and public.is_community_member(event.community_id)
  )
);

drop policy if exists "event_ride_requests_update_own" on public.event_ride_requests;
create policy "event_ride_requests_update_own"
on public.event_ride_requests
for update
to authenticated
using (
  user_id = auth.uid()
  and exists (
    select 1
    from public.event_attendance attendance
    where attendance.event_id = event_ride_requests.event_id
      and attendance.user_id = auth.uid()
      and attendance.status in ('going', 'maybe')
  )
)
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.event_attendance attendance
    where attendance.event_id = event_ride_requests.event_id
      and attendance.user_id = auth.uid()
      and attendance.status in ('going', 'maybe')
  )
);

drop policy if exists "event_ride_offers_insert_own" on public.event_ride_offers;
create policy "event_ride_offers_insert_own"
on public.event_ride_offers
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.event_ride_requests request
    join public.community_events event on event.id = request.event_id
    join public.event_attendance attendance
      on attendance.event_id = event.id
     and attendance.user_id = auth.uid()
     and attendance.status in ('going', 'maybe')
    where request.id = event_ride_offers.request_id
      and request.event_id = event_ride_offers.event_id
      and request.user_id <> auth.uid()
      and public.is_community_member(event.community_id)
  )
);

drop policy if exists "event_ride_offers_update_own" on public.event_ride_offers;
create policy "event_ride_offers_update_own"
on public.event_ride_offers
for update
to authenticated
using (
  user_id = auth.uid()
  and exists (
    select 1
    from public.event_attendance attendance
    where attendance.event_id = event_ride_offers.event_id
      and attendance.user_id = auth.uid()
      and attendance.status in ('going', 'maybe')
  )
)
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.event_attendance attendance
    where attendance.event_id = event_ride_offers.event_id
      and attendance.user_id = auth.uid()
      and attendance.status in ('going', 'maybe')
  )
);

commit;
