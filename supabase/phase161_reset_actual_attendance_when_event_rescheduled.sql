-- Circles phase 161
-- Reset stale actual-attendance marks when an event is moved back to the future.

create or replace function public.protect_event_actual_attendance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_community_id uuid;
  event_start timestamptz;
begin
  if tg_op = 'INSERT' then
    if new.actual_status is not null
      or new.actual_status_at is not null
      or new.actual_status_by is not null then
      raise exception 'actual_attendance_manager_only';
    end if;
    return new;
  end if;

  if new.actual_status is distinct from old.actual_status
    or new.actual_status_at is distinct from old.actual_status_at
    or new.actual_status_by is distinct from old.actual_status_by then

    select event.community_id, event.starts_at
    into target_community_id, event_start
    from public.community_events event
    where event.id = old.event_id;

    if target_community_id is null then
      raise exception 'event_not_found';
    end if;

    if not public.is_community_admin(target_community_id)
      and not public.is_system_admin() then
      raise exception 'actual_attendance_manager_only';
    end if;

    -- Marking arrival is allowed only after the event starts.
    -- Clearing an old mark is allowed when an event is rescheduled to the future.
    if new.actual_status is not null and event_start > now() then
      raise exception 'actual_attendance_before_event_start';
    end if;

    if new.actual_status is null then
      new.actual_status_at := null;
      new.actual_status_by := null;
    else
      new.actual_status_at := now();
      new.actual_status_by := auth.uid();
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.protect_event_actual_attendance() from public;

create or replace function public.set_event_actual_attendance(
  target_event_id uuid,
  target_user_id uuid,
  target_actual_status text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_community_id uuid;
  event_start timestamptz;
begin
  if auth.uid() is null then
    raise exception 'authentication_required';
  end if;

  if target_actual_status is not null
    and target_actual_status not in ('arrived', 'not_arrived') then
    raise exception 'invalid_actual_attendance_status';
  end if;

  select event.community_id, event.starts_at
  into target_community_id, event_start
  from public.community_events event
  where event.id = target_event_id;

  if target_community_id is null then
    raise exception 'event_not_found';
  end if;

  if not public.is_community_admin(target_community_id)
    and not public.is_system_admin() then
    raise exception 'permission_denied';
  end if;

  if target_actual_status is not null and event_start > now() then
    raise exception 'actual_attendance_before_event_start';
  end if;

  update public.event_attendance attendance
  set actual_status = target_actual_status
  where attendance.event_id = target_event_id
    and attendance.user_id = target_user_id;

  return found;
end;
$$;

revoke all on function public.set_event_actual_attendance(uuid, uuid, text) from public;
grant execute on function public.set_event_actual_attendance(uuid, uuid, text) to authenticated;

create or replace function public.reset_actual_attendance_when_event_rescheduled()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.starts_at is distinct from old.starts_at
    and new.starts_at > now() then
    update public.event_attendance attendance
    set actual_status = null,
        actual_status_at = null,
        actual_status_by = null
    where attendance.event_id = new.id
      and (
        attendance.actual_status is not null
        or attendance.actual_status_at is not null
        or attendance.actual_status_by is not null
      );
  end if;

  return new;
end;
$$;

revoke all on function public.reset_actual_attendance_when_event_rescheduled() from public;

drop trigger if exists community_events_reset_actual_attendance_on_reschedule
  on public.community_events;

create trigger community_events_reset_actual_attendance_on_reschedule
after update of starts_at on public.community_events
for each row
execute function public.reset_actual_attendance_when_event_rescheduled();
