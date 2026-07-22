-- Circles phase 44: event lifecycle, notifications, cloning, gallery and locked events

alter table public.community_events
  add column if not exists status text not null default 'active',
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references public.profiles(id) on delete set null;

alter table public.community_events
  drop constraint if exists community_events_status_check;

alter table public.community_events
  add constraint community_events_status_check
  check (status in ('active', 'cancelled'));

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  community_id uuid references public.communities(id) on delete cascade,
  event_id uuid references public.community_events(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null default '',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_created_idx
  on public.notifications(user_id, created_at desc);

create index if not exists notifications_user_unread_idx
  on public.notifications(user_id, read_at, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists "notifications_select_self" on public.notifications;
create policy "notifications_select_self"
on public.notifications
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "notifications_update_self" on public.notifications;
create policy "notifications_update_self"
on public.notifications
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

revoke all on table public.notifications from anon;
revoke all on table public.notifications from authenticated;
grant select, update on table public.notifications to authenticated;

create table if not exists public.event_gallery_photos (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.community_events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  image_url text not null,
  created_at timestamptz not null default now()
);

create index if not exists event_gallery_photos_event_created_idx
  on public.event_gallery_photos(event_id, created_at desc);

alter table public.event_gallery_photos enable row level security;

create or replace function public.can_manage_event(target_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.community_events ce
    where ce.id = target_event_id
      and (
        public.is_community_admin(ce.community_id)
        or public.is_system_admin()
      )
  );
$$;

create or replace function public.event_is_open_for_members(target_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.community_events ce
    where ce.id = target_event_id
      and ce.status = 'active'
      and ce.starts_at > now()
  );
$$;

revoke all on function public.can_manage_event(uuid) from public;
revoke all on function public.event_is_open_for_members(uuid) from public;
grant execute on function public.can_manage_event(uuid) to authenticated;
grant execute on function public.event_is_open_for_members(uuid) to authenticated;

drop policy if exists "event_gallery_photos_select_members" on public.event_gallery_photos;
create policy "event_gallery_photos_select_members"
on public.event_gallery_photos
for select
to authenticated
using (
  exists (
    select 1
    from public.community_events ce
    where ce.id = event_gallery_photos.event_id
      and public.is_community_member(ce.community_id)
  )
);

drop policy if exists "event_gallery_photos_insert_after_start" on public.event_gallery_photos;
create policy "event_gallery_photos_insert_after_start"
on public.event_gallery_photos
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.community_events ce
    where ce.id = event_gallery_photos.event_id
      and ce.starts_at <= now()
      and ce.status = 'active'
      and public.is_community_member(ce.community_id)
  )
);

drop policy if exists "event_gallery_photos_delete_self_or_admin" on public.event_gallery_photos;
create policy "event_gallery_photos_delete_self_or_admin"
on public.event_gallery_photos
for delete
to authenticated
using (
  public.can_manage_event(event_id)
  or (
    user_id = auth.uid()
    and exists (
      select 1
      from public.community_events ce
      where ce.id = event_gallery_photos.event_id
        and ce.status = 'active'
        and ce.starts_at <= now()
    )
  )
);

revoke all on table public.event_gallery_photos from anon;
grant select, insert, delete on table public.event_gallery_photos to authenticated;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'event-gallery',
  'event-gallery',
  true,
  3145728,
  array['image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "event_gallery_storage_insert_after_start" on storage.objects;
create policy "event_gallery_storage_insert_after_start"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'event-gallery'
  and (storage.foldername(name))[3] = auth.uid()::text
  and exists (
    select 1
    from public.community_events ce
    where ce.id = ((storage.foldername(name))[2])::uuid
      and ce.community_id = ((storage.foldername(name))[1])::uuid
      and ce.starts_at <= now()
      and ce.status = 'active'
      and public.is_community_member(ce.community_id)
  )
);

drop policy if exists "event_gallery_storage_delete_self_or_admin" on storage.objects;
create policy "event_gallery_storage_delete_self_or_admin"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'event-gallery'
  and (
    public.can_manage_event(((storage.foldername(name))[2])::uuid)
    or (
      (storage.foldername(name))[3] = auth.uid()::text
      and exists (
        select 1
        from public.community_events ce
        where ce.id = ((storage.foldername(name))[2])::uuid
          and ce.status = 'active'
          and ce.starts_at <= now()
      )
    )
  )
);

create or replace function public.insert_notification(
  target_user_id uuid,
  target_community_id uuid,
  target_event_id uuid,
  target_type text,
  target_title text,
  target_body text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if target_user_id is null then
    return;
  end if;

  insert into public.notifications (
    user_id,
    community_id,
    event_id,
    type,
    title,
    body
  )
  values (
    target_user_id,
    target_community_id,
    target_event_id,
    target_type,
    target_title,
    coalesce(target_body, '')
  );
end;
$$;

revoke all on function public.insert_notification(uuid, uuid, uuid, text, text, text) from public;

create or replace function public.notify_event_members()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient record;
  notification_title text;
  notification_body text;
  changed_relevant_details boolean := false;
begin
  if tg_op = 'INSERT' then
    notification_title := 'אירוע חדש במעגל';
    notification_body := new.title;

    for recipient in
      select cm.user_id
      from public.community_members cm
      where cm.community_id = new.community_id
        and cm.user_id <> new.created_by
    loop
      perform public.insert_notification(
        recipient.user_id,
        new.community_id,
        new.id,
        'event_created',
        notification_title,
        notification_body
      );
    end loop;

    return new;
  end if;

  changed_relevant_details :=
    old.starts_at is distinct from new.starts_at
    or old.ends_at is distinct from new.ends_at
    or old.location is distinct from new.location
    or old.status is distinct from new.status;

  if not changed_relevant_details then
    return new;
  end if;

  if new.status = 'cancelled' and old.status is distinct from new.status then
    notification_title := 'האירוע בוטל';
    notification_body := new.title;
  else
    notification_title := 'פרטי האירוע השתנו';
    notification_body := new.title;
  end if;

  for recipient in
    select cm.user_id
    from public.community_members cm
    where cm.community_id = new.community_id
      and cm.user_id <> coalesce(auth.uid(), new.created_by)
  loop
    perform public.insert_notification(
      recipient.user_id,
      new.community_id,
      new.id,
      case when new.status = 'cancelled' then 'event_cancelled' else 'event_changed' end,
      notification_title,
      notification_body
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists community_events_notify_members on public.community_events;
create trigger community_events_notify_members
after insert or update on public.community_events
for each row execute function public.notify_event_members();

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
  if current_setting('circles.clone_mode', true) = '1' then
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

  select ce.community_id, ce.title
  into target_community_id, event_title
  from public.community_events ce
  where ce.id = target_event_id;

  select p.full_name
  into member_name
  from public.profiles p
  where p.id = target_user_id;

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
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  for recipient in
    select cm.user_id
    from public.community_members cm
    where cm.community_id = target_community_id
      and cm.role in ('owner', 'admin')
      and cm.user_id <> target_user_id
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

drop trigger if exists event_attendance_notify_managers on public.event_attendance;
create trigger event_attendance_notify_managers
after insert or update or delete on public.event_attendance
for each row execute function public.notify_event_managers_about_attendance();

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

  if tg_op = 'UPDATE' and old.status = 'pending' and old.requested_at = new.requested_at then
    return new;
  end if;

  select c.name into circle_name
  from public.communities c
  where c.id = new.community_id;

  select p.full_name into member_name
  from public.profiles p
  where p.id = new.user_id;

  for recipient in
    select cm.user_id
    from public.community_members cm
    where cm.community_id = new.community_id
      and cm.role in ('owner', 'admin')
      and cm.user_id <> new.user_id
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

drop trigger if exists community_join_requests_notify_managers on public.community_join_requests;
create trigger community_join_requests_notify_managers
after insert or update on public.community_join_requests
for each row execute function public.notify_join_request_managers();

create or replace function public.save_event_attendance(
  target_event_id uuid,
  target_status text,
  target_party_size integer,
  target_guest_names text,
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
begin
  if current_user_id is null then
    raise exception 'authentication_required';
  end if;

  if target_status not in ('going', 'maybe', 'not_going') then
    raise exception 'invalid_attendance_status';
  end if;

  if target_status <> 'not_going'
    and (target_party_size is null or target_party_size < 1 or target_party_size > 20) then
    raise exception 'invalid_party_size';
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
    select coalesce(sum(ea.party_size), 0)::integer
    into other_going_people
    from public.event_attendance ea
    where ea.event_id = target_event_id
      and ea.status = 'going'
      and ea.user_id <> current_user_id;

    if other_going_people + target_party_size > event_limit then
      raise exception 'event_capacity_exceeded'
        using detail = format(
          'The event is limited to %s participants and already has %s reserved places.',
          event_limit,
          other_going_people
        );
    end if;
  end if;

  insert into public.event_attendance (
    event_id,
    user_id,
    status,
    party_size,
    guest_names,
    note
  )
  values (
    target_event_id,
    current_user_id,
    target_status,
    case when target_status = 'not_going' then 1 else target_party_size end,
    case when target_status = 'not_going' then '' else coalesce(trim(target_guest_names), '') end,
    coalesce(trim(target_note), '')
  )
  on conflict (event_id, user_id)
  do update set
    status = excluded.status,
    party_size = excluded.party_size,
    guest_names = excluded.guest_names,
    note = excluded.note,
    updated_at = now();
end;
$$;

revoke all on function public.save_event_attendance(uuid, text, integer, text, text) from public;
grant execute on function public.save_event_attendance(uuid, text, integer, text, text) to authenticated;

create or replace function public.delete_event_attendance(
  target_event_id uuid,
  target_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  target_community_id uuid;
  target_status text;
  target_starts_at timestamptz;
begin
  if current_user_id is null then
    raise exception 'authentication_required';
  end if;

  select ce.community_id, ce.status, ce.starts_at
  into target_community_id, target_status, target_starts_at
  from public.community_events ce
  where ce.id = target_event_id;

  if target_community_id is null then
    raise exception 'event_not_found';
  end if;

  if current_user_id <> target_user_id
    and not public.is_community_admin(target_community_id)
    and not public.is_system_admin() then
    raise exception 'attendance_delete_not_allowed';
  end if;

  if current_user_id = target_user_id
    and not public.can_manage_event(target_event_id)
    and (target_status = 'cancelled' or target_starts_at <= now()) then
    raise exception 'event_closed';
  end if;

  delete from public.event_bring_contributions ebc
  where ebc.event_id = target_event_id
    and ebc.user_id = target_user_id;

  delete from public.event_attendance ea
  where ea.event_id = target_event_id
    and ea.user_id = target_user_id;
end;
$$;

revoke all on function public.delete_event_attendance(uuid, uuid) from public;
grant execute on function public.delete_event_attendance(uuid, uuid) to authenticated;

-- Lock direct member changes when the event is cancelled or already started.
drop policy if exists "event_attendance_insert_self" on public.event_attendance;
create policy "event_attendance_insert_self"
on public.event_attendance
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.community_events ce
    where ce.id = event_attendance.event_id
      and public.is_community_member(ce.community_id)
  )
  and (public.event_is_open_for_members(event_id) or public.can_manage_event(event_id))
);

drop policy if exists "event_attendance_update_self" on public.event_attendance;
create policy "event_attendance_update_self"
on public.event_attendance
for update
to authenticated
using (
  user_id = auth.uid()
  and (public.event_is_open_for_members(event_id) or public.can_manage_event(event_id))
)
with check (
  user_id = auth.uid()
  and (public.event_is_open_for_members(event_id) or public.can_manage_event(event_id))
);

drop policy if exists "event_attendance_delete_self" on public.event_attendance;
create policy "event_attendance_delete_self"
on public.event_attendance
for delete
to authenticated
using (
  user_id = auth.uid()
  and (public.event_is_open_for_members(event_id) or public.can_manage_event(event_id))
);

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
    from public.community_events ce
    where ce.id = event_bring_contributions.event_id
      and public.is_community_member(ce.community_id)
  )
  and (
    need_id is null
    or exists (
      select 1
      from public.event_bring_needs ebn
      where ebn.id = event_bring_contributions.need_id
        and ebn.event_id = event_bring_contributions.event_id
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
)
with check (
  user_id = auth.uid()
  and (public.event_is_open_for_members(event_id) or public.can_manage_event(event_id))
);

drop policy if exists "event_bring_contributions_delete_self" on public.event_bring_contributions;
create policy "event_bring_contributions_delete_self"
on public.event_bring_contributions
for delete
to authenticated
using (
  user_id = auth.uid()
  and (public.event_is_open_for_members(event_id) or public.can_manage_event(event_id))
);

create or replace function public.set_event_cancelled(
  target_event_id uuid,
  target_cancelled boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_manage_event(target_event_id) then
    raise exception 'permission_denied';
  end if;

  update public.community_events ce
  set
    status = case when target_cancelled then 'cancelled' else 'active' end,
    cancelled_at = case when target_cancelled then now() else null end,
    cancelled_by = case when target_cancelled then auth.uid() else null end
  where ce.id = target_event_id;

  if not found then
    raise exception 'event_not_found';
  end if;
end;
$$;

create or replace function public.delete_community_event(target_event_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_manage_event(target_event_id) then
    raise exception 'permission_denied';
  end if;

  delete from public.community_events ce
  where ce.id = target_event_id;

  if not found then
    raise exception 'event_not_found';
  end if;
end;
$$;

create or replace function public.delete_community_circle(target_community_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_community_owner(target_community_id)
    and not public.is_system_admin() then
    raise exception 'permission_denied';
  end if;

  delete from public.communities c
  where c.id = target_community_id;

  if not found then
    raise exception 'circle_not_found';
  end if;
end;
$$;

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
    event_id, user_id, status, party_size, guest_names, note, created_at, updated_at
  )
  select
    target_event_id, ea.user_id, ea.status, ea.party_size, ea.guest_names, ea.note, now(), now()
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
    contribution.quantity,
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
    contribution.quantity,
    contribution.note,
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

revoke all on function public.set_event_cancelled(uuid, boolean) from public;
revoke all on function public.delete_community_event(uuid) from public;
revoke all on function public.delete_community_circle(uuid) from public;
revoke all on function public.clone_event_content(uuid, uuid) from public;

grant execute on function public.set_event_cancelled(uuid, boolean) to authenticated;
grant execute on function public.delete_community_event(uuid) to authenticated;
grant execute on function public.delete_community_circle(uuid) to authenticated;
grant execute on function public.clone_event_content(uuid, uuid) to authenticated;

create or replace function public.get_shared_event(target_share_token uuid)
returns table (
  id uuid,
  community_id uuid,
  title text,
  description text,
  location text,
  starts_at timestamptz,
  ends_at timestamptz,
  image_url text,
  participant_limit integer,
  share_token uuid,
  status text,
  community_name text,
  community_description text,
  community_logo_url text,
  community_requires_member_approval boolean,
  community_share_token uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    ce.id,
    ce.community_id,
    ce.title,
    ce.description,
    ce.location,
    ce.starts_at,
    ce.ends_at,
    ce.image_url,
    ce.participant_limit,
    ce.share_token,
    ce.status,
    c.name as community_name,
    c.description as community_description,
    c.logo_url as community_logo_url,
    c.requires_member_approval as community_requires_member_approval,
    c.share_token as community_share_token
  from public.community_events ce
  join public.communities c on c.id = ce.community_id
  where ce.share_token = target_share_token
  limit 1;
$$;

revoke all on function public.get_shared_event(uuid) from public;
grant execute on function public.get_shared_event(uuid) to anon, authenticated;
