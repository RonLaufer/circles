-- Circles phase 86: remove attendance party size, guest names and organizer note

begin;

-- Capacity is now based on one place per attending user.
create or replace function public.validate_event_participant_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  current_going_people integer;
begin
  if new.participant_limit is null then
    return new;
  end if;

  select count(*)::integer
  into current_going_people
  from public.event_attendance ea
  where ea.event_id = new.id
    and ea.status = 'going';

  if current_going_people > new.participant_limit then
    raise exception 'participant_limit_below_current_attendance'
      using detail = format(
        'There are already %s people attending, while the requested limit is %s.',
        current_going_people,
        new.participant_limit
      );
  end if;

  return new;
end;
$$;

-- Remove the old five-argument attendance function before dropping its columns.
drop function if exists public.save_event_attendance(uuid, text, integer, text, text);

create function public.save_event_attendance(
  target_event_id uuid,
  target_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  target_community_id uuid;
  event_limit integer;
  event_status text;
  event_starts_at timestamptz;
  other_going_people integer;
begin
  if current_user_id is null then
    raise exception 'authentication_required';
  end if;

  if target_status not in ('going', 'maybe', 'not_going') then
    raise exception 'invalid_attendance_status';
  end if;

  select ce.community_id, ce.participant_limit, ce.status, ce.starts_at
  into target_community_id, event_limit, event_status, event_starts_at
  from public.community_events ce
  where ce.id = target_event_id
  for update;

  if target_community_id is null then
    raise exception 'event_not_found';
  end if;

  if not public.is_community_member(target_community_id) then
    raise exception 'community_membership_required';
  end if;

  if not public.can_manage_event(target_event_id)
    and (event_status = 'cancelled' or event_starts_at <= now()) then
    raise exception 'event_closed';
  end if;

  if target_status = 'going' and event_limit is not null then
    select count(*)::integer
    into other_going_people
    from public.event_attendance ea
    where ea.event_id = target_event_id
      and ea.status = 'going'
      and ea.user_id <> current_user_id;

    if other_going_people + 1 > event_limit then
      raise exception 'event_capacity_exceeded';
    end if;
  end if;

  insert into public.event_attendance (event_id, user_id, status)
  values (target_event_id, current_user_id, target_status)
  on conflict (event_id, user_id)
  do update set
    status = excluded.status,
    updated_at = now();
end;
$$;

revoke all on function public.save_event_attendance(uuid, text) from public;
grant execute on function public.save_event_attendance(uuid, text) to authenticated;

-- Event cloning now copies attendance status only.
create or replace function public.clone_event_content(
  source_event_id uuid,
  target_event_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_community_id uuid;
  target_community_id uuid;
begin
  select ce.community_id into source_community_id
  from public.community_events ce
  where ce.id = source_event_id;

  select ce.community_id into target_community_id
  from public.community_events ce
  where ce.id = target_event_id;

  if source_community_id is null or target_community_id is null then
    raise exception 'event_not_found';
  end if;

  if source_community_id <> target_community_id then
    raise exception 'events_must_share_circle';
  end if;

  if not public.is_community_admin(target_community_id)
    and not public.is_system_admin() then
    raise exception 'permission_denied';
  end if;

  perform set_config('circles.clone_mode', '1', true);

  insert into public.event_attendance (
    event_id, user_id, status, created_at, updated_at
  )
  select
    target_event_id, ea.user_id, ea.status, now(), now()
  from public.event_attendance ea
  join public.community_members current_member
    on current_member.community_id = target_community_id
   and current_member.user_id = ea.user_id
  where ea.event_id = source_event_id
  on conflict (event_id, user_id) do nothing;

  insert into public.event_bring_contributions (
    event_id, need_id, user_id, item_name, quantity, note, created_at, updated_at
  )
  select
    target_event_id,
    target_need.id,
    contribution.user_id,
    contribution.item_name,
    1,
    contribution.note,
    now(),
    now()
  from public.event_bring_contributions contribution
  join public.community_members current_member
    on current_member.community_id = target_community_id
   and current_member.user_id = contribution.user_id
  join public.event_bring_needs source_need on source_need.id = contribution.need_id
  join lateral (
    select target_need_row.id
    from public.event_bring_needs target_need_row
    where target_need_row.event_id = target_event_id
      and lower(trim(target_need_row.item_name)) = lower(trim(source_need.item_name))
    order by target_need_row.created_at
    limit 1
  ) target_need on true
  where contribution.event_id = source_event_id
    and contribution.need_id is not null;

  insert into public.event_bring_contributions (
    event_id, need_id, user_id, item_name, quantity, note, created_at, updated_at
  )
  select
    target_event_id,
    null,
    contribution.user_id,
    contribution.item_name,
    1,
    '',
    now(),
    now()
  from public.event_bring_contributions contribution
  join public.community_members current_member
    on current_member.community_id = target_community_id
   and current_member.user_id = contribution.user_id
  where contribution.event_id = source_event_id
    and contribution.need_id is null;
end;
$$;

revoke all on function public.clone_event_content(uuid, uuid) from public;
grant execute on function public.clone_event_content(uuid, uuid) to authenticated;

alter table public.event_attendance
  drop column if exists party_size,
  drop column if exists guest_names,
  drop column if exists note;

commit;
