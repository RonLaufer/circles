-- Circles phase 30: event attendance and guest details

create table if not exists public.event_attendance (
  event_id uuid not null references public.community_events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null check (status in ('going', 'maybe', 'not_going')),
  party_size integer not null default 1 check (party_size between 1 and 20),
  guest_names text not null default '',
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create index if not exists event_attendance_event_status_idx
  on public.event_attendance(event_id, status);

create or replace function public.protect_event_attendance_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.event_id = old.event_id;
  new.user_id = old.user_id;
  new.created_at = old.created_at;
  return new;
end;
$$;

drop trigger if exists event_attendance_set_updated_at on public.event_attendance;
create trigger event_attendance_set_updated_at
before update on public.event_attendance
for each row execute function public.set_updated_at();

drop trigger if exists event_attendance_protect_identity on public.event_attendance;
create trigger event_attendance_protect_identity
before update on public.event_attendance
for each row execute function public.protect_event_attendance_identity();

alter table public.event_attendance enable row level security;

drop policy if exists "event_attendance_select_circle_members" on public.event_attendance;
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
  )
);

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
);

drop policy if exists "event_attendance_update_self" on public.event_attendance;
create policy "event_attendance_update_self"
on public.event_attendance
for update
to authenticated
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.community_events ce
    where ce.id = event_attendance.event_id
      and public.is_community_member(ce.community_id)
  )
);

drop policy if exists "event_attendance_delete_self" on public.event_attendance;
create policy "event_attendance_delete_self"
on public.event_attendance
for delete
to authenticated
using (user_id = auth.uid());

revoke all on table public.event_attendance from anon;
grant select, insert, update, delete on table public.event_attendance to authenticated;
