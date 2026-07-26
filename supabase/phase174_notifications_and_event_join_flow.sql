-- Circles phase 174
-- 1. Do not create attendance-change notifications when a manager adds a circle member to an event.
-- 2. Keep normal notifications for participant self-registration and later status changes.

begin;

create or replace function public.notify_event_managers_about_attendance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_event_id uuid;
  target_user_id uuid;
  target_community_id uuid;
  event_title text;
  member_name text;
  action_text text;
  recipient record;
begin
  if current_setting('circles.clone_mode', true) = '1'
    or current_setting('circles.suppress_attendance_notification', true) = '1' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    target_event_id := old.event_id;
    target_user_id := old.user_id;
  else
    target_event_id := new.event_id;
    target_user_id := new.user_id;
  end if;

  select event.community_id, event.title
  into target_community_id, event_title
  from public.community_events event
  where event.id = target_event_id;

  select profile.full_name
  into member_name
  from public.profiles profile
  where profile.id = target_user_id;

  if tg_op = 'DELETE' then
    action_text := coalesce(member_name, 'משתמש') || ' מחק/ה את ההשתתפות באירוע';
  elsif tg_op = 'INSERT' then
    action_text := case new.status
      when 'going' then coalesce(member_name, 'משתמש') || ' מצטרף/ת לאירוע'
      when 'maybe' then coalesce(member_name, 'משתמש') || ' סימן/ה אולי'
      else coalesce(member_name, 'משתמש') || ' לא מגיע/ה לאירוע'
    end;
  elsif old.status is distinct from new.status then
    action_text := case new.status
      when 'going' then coalesce(member_name, 'משתמש') || ' עדכן/ה שמגיע/ה'
      when 'maybe' then coalesce(member_name, 'משתמש') || ' עדכן/ה לאולי'
      else coalesce(member_name, 'משתמש') || ' עדכן/ה שלא מגיע/ה'
    end;
  else
    return new;
  end if;

  for recipient in
    select member.user_id
    from public.community_members member
    where member.community_id = target_community_id
      and member.role = 'admin'
      and member.user_id <> target_user_id
  loop
    perform public.insert_notification(
      recipient.user_id,
      target_community_id,
      target_event_id,
      'attendance_changed',
      event_title,
      action_text
    );
  end loop;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.set_event_attendance_for_member(
  target_event_id uuid,
  target_user_id uuid,
  target_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_community_id uuid;
  event_limit integer;
  other_going_people integer;
  attendance_already_exists boolean;
begin
  if auth.uid() is null then
    raise exception 'authentication_required';
  end if;

  if target_status not in ('going', 'maybe', 'not_going') then
    raise exception 'invalid_attendance_status';
  end if;

  select event.community_id, event.participant_limit
  into target_community_id, event_limit
  from public.community_events event
  where event.id = target_event_id
  for update;

  if target_community_id is null then
    raise exception 'event_not_found';
  end if;

  if not public.is_community_admin(target_community_id)
    and not public.is_system_admin() then
    raise exception 'permission_denied';
  end if;

  if not exists (
    select 1
    from public.community_members member
    where member.community_id = target_community_id
      and member.user_id = target_user_id
  ) then
    raise exception 'target_user_is_not_a_circle_member';
  end if;

  if target_status = 'going' and event_limit is not null then
    select count(*)::integer
    into other_going_people
    from public.event_attendance attendance
    where attendance.event_id = target_event_id
      and attendance.status = 'going'
      and attendance.user_id <> target_user_id;

    if other_going_people + 1 > event_limit then
      raise exception 'event_capacity_exceeded';
    end if;
  end if;

  select exists (
    select 1
    from public.event_attendance attendance
    where attendance.event_id = target_event_id
      and attendance.user_id = target_user_id
  )
  into attendance_already_exists;

  -- A manager adding a member is an administrative action and should not
  -- create an attendance notification. Later changes still notify normally.
  if not attendance_already_exists then
    perform set_config('circles.suppress_attendance_notification', '1', true);
  end if;

  insert into public.event_attendance (event_id, user_id, status)
  values (target_event_id, target_user_id, target_status)
  on conflict (event_id, user_id)
  do update set
    status = excluded.status,
    updated_at = now();
end;
$$;

revoke all on function public.set_event_attendance_for_member(uuid, uuid, text) from public;
grant execute on function public.set_event_attendance_for_member(uuid, uuid, text) to authenticated;

commit;
