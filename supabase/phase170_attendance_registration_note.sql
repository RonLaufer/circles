-- Circles phase 170: optional attendance registration note

begin;

alter table public.event_attendance
  add column if not exists note text;

alter table public.event_attendance
  drop constraint if exists event_attendance_note_length_check;

alter table public.event_attendance
  add constraint event_attendance_note_length_check
  check (note is null or char_length(note) <= 500);

-- Keep the existing two-argument function for compatibility with clients
-- that may still be open while the new version is deployed.
create or replace function public.save_event_attendance(
  target_event_id uuid,
  target_status text,
  target_note text
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
  normalized_note text;
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

  select event.community_id, event.participant_limit, event.status, event.starts_at
  into target_community_id, event_limit, event_status, event_starts_at
  from public.community_events event
  where event.id = target_event_id
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
    from public.event_attendance attendance
    where attendance.event_id = target_event_id
      and attendance.status = 'going'
      and attendance.user_id <> current_user_id;

    if other_going_people + 1 > event_limit then
      raise exception 'event_capacity_exceeded';
    end if;
  end if;

  insert into public.event_attendance (event_id, user_id, status, note)
  values (target_event_id, current_user_id, target_status, normalized_note)
  on conflict (event_id, user_id)
  do update set
    status = excluded.status,
    note = excluded.note,
    updated_at = now();
end;
$$;

revoke all on function public.save_event_attendance(uuid, text, text) from public;
grant execute on function public.save_event_attendance(uuid, text, text) to authenticated;

commit;
