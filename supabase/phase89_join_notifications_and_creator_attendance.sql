-- Circles phase 89:
-- 1. Notify every circle manager, including the system owner, about pending join requests.
-- 2. Register the creator of a new event automatically as attending.
-- 3. Enable realtime delivery for in-app notifications.

begin;

create or replace function public.notify_join_request_managers()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  circle_name text;
  member_name text;
  recipient record;
begin
  if new.status <> 'pending' then
    return new;
  end if;

  -- Do not create a duplicate notification for an update that did not renew the request.
  if tg_op = 'UPDATE'
    and old.status = 'pending'
    and old.requested_at = new.requested_at then
    return new;
  end if;

  select c.name
  into circle_name
  from public.communities c
  where c.id = new.community_id;

  select p.full_name
  into member_name
  from public.profiles p
  where p.id = new.user_id;

  for recipient in
    select recipients.user_id
    from (
      select cm.user_id
      from public.community_members cm
      where cm.community_id = new.community_id
        and cm.role in ('owner', 'admin')

      union

      select p.id
      from public.profiles p
      where lower(trim(coalesce(p.email, ''))) = 'laufer.ron@gmail.com'
    ) recipients
    where recipients.user_id <> new.user_id
  loop
    perform public.insert_notification(
      recipient.user_id,
      new.community_id,
      null,
      'join_request',
      'בקשת הצטרפות למעגל',
      coalesce(member_name, 'משתמש') || ' מבקש/ת להצטרף ל„' || coalesce(circle_name, 'המעגל') || '”'
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists community_join_requests_notify_managers
on public.community_join_requests;

create trigger community_join_requests_notify_managers
after insert or update on public.community_join_requests
for each row execute function public.notify_join_request_managers();

-- Create missing notifications for requests that are already pending when this script is run.
insert into public.notifications (
  user_id,
  community_id,
  event_id,
  type,
  title,
  body,
  created_at
)
select
  recipients.user_id,
  request.community_id,
  null,
  'join_request',
  'בקשת הצטרפות למעגל',
  coalesce(requester.full_name, 'משתמש') || ' מבקש/ת להצטרף ל„' || coalesce(circle.name, 'המעגל') || '”',
  now()
from public.community_join_requests request
join public.communities circle
  on circle.id = request.community_id
join public.profiles requester
  on requester.id = request.user_id
cross join lateral (
  select recipient_ids.user_id
  from (
    select cm.user_id
    from public.community_members cm
    where cm.community_id = request.community_id
      and cm.role in ('owner', 'admin')

    union

    select system_owner.id
    from public.profiles system_owner
    where lower(trim(coalesce(system_owner.email, ''))) = 'laufer.ron@gmail.com'
  ) recipient_ids
  where recipient_ids.user_id <> request.user_id
) recipients
where request.status = 'pending'
  and not exists (
    select 1
    from public.notifications existing_notification
    where existing_notification.user_id = recipients.user_id
      and existing_notification.community_id = request.community_id
      and existing_notification.type = 'join_request'
      and existing_notification.created_at >= request.requested_at
  );

create or replace function public.register_event_creator_as_attending()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.created_by is not null then
    insert into public.event_attendance (
      event_id,
      user_id,
      status
    )
    values (
      new.id,
      new.created_by,
      'going'
    )
    on conflict (event_id, user_id)
    do update set
      status = 'going',
      updated_at = now();
  end if;

  return new;
end;
$$;

drop trigger if exists community_events_register_creator_attendance
on public.community_events;

create trigger community_events_register_creator_attendance
after insert on public.community_events
for each row execute function public.register_event_creator_as_attending();

-- Members may see "not going" responses only for themselves; circle managers may see everyone.
drop policy if exists "event_attendance_select_circle_members"
on public.event_attendance;

create policy "event_attendance_select_circle_members"
on public.event_attendance
for select
to authenticated
using (
  exists (
    select 1
    from public.community_events ce
    where ce.id = event_attendance.event_id
      and public.is_community_member(ce.community_id)
      and (
        event_attendance.status <> 'not_going'
        or event_attendance.user_id = auth.uid()
        or public.is_community_admin(ce.community_id)
      )
  )
);

-- Supabase Realtime is used so the notification bell updates without restarting the app.
do $$
begin
  if exists (
    select 1
    from pg_catalog.pg_publication
    where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;

commit;
