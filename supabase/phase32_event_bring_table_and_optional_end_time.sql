-- Circles phase 32: optional event end time and "what everyone brings" tables

alter table public.community_events
  alter column ends_at drop not null,
  add column if not exists bring_mode text not null default 'free';

alter table public.community_events
  drop constraint if exists community_events_end_after_start;

alter table public.community_events
  add constraint community_events_end_after_start
  check (ends_at is null or ends_at > starts_at);

alter table public.community_events
  drop constraint if exists community_events_bring_mode_check;

alter table public.community_events
  add constraint community_events_bring_mode_check
  check (bring_mode in ('planned', 'free'));

create table if not exists public.event_bring_needs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.community_events(id) on delete cascade,
  item_name text not null check (char_length(trim(item_name)) between 1 and 160),
  quantity_needed integer not null default 1 check (quantity_needed between 1 and 1000),
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists event_bring_needs_event_idx
  on public.event_bring_needs(event_id, created_at);

create table if not exists public.event_bring_contributions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.community_events(id) on delete cascade,
  need_id uuid references public.event_bring_needs(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete cascade,
  item_name text not null check (char_length(trim(item_name)) between 1 and 160),
  quantity integer not null default 1 check (quantity between 1 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists event_bring_contributions_event_idx
  on public.event_bring_contributions(event_id, created_at);

create unique index if not exists event_bring_contributions_need_user_key
  on public.event_bring_contributions(need_id, user_id)
  where need_id is not null;

drop trigger if exists event_bring_needs_set_updated_at on public.event_bring_needs;
create trigger event_bring_needs_set_updated_at
before update on public.event_bring_needs
for each row execute function public.set_updated_at();

drop trigger if exists event_bring_contributions_set_updated_at on public.event_bring_contributions;
create trigger event_bring_contributions_set_updated_at
before update on public.event_bring_contributions
for each row execute function public.set_updated_at();

alter table public.event_bring_needs enable row level security;
alter table public.event_bring_contributions enable row level security;

drop policy if exists "event_bring_needs_select_members" on public.event_bring_needs;
create policy "event_bring_needs_select_members"
on public.event_bring_needs
for select
to authenticated
using (
  exists (
    select 1
    from public.community_events ce
    where ce.id = event_bring_needs.event_id
      and public.is_community_member(ce.community_id)
  )
);

drop policy if exists "event_bring_needs_insert_admins" on public.event_bring_needs;
create policy "event_bring_needs_insert_admins"
on public.event_bring_needs
for insert
to authenticated
with check (
  created_by = auth.uid()
  and exists (
    select 1
    from public.community_events ce
    where ce.id = event_bring_needs.event_id
      and public.is_community_admin(ce.community_id)
  )
);

drop policy if exists "event_bring_needs_update_admins" on public.event_bring_needs;
create policy "event_bring_needs_update_admins"
on public.event_bring_needs
for update
to authenticated
using (
  exists (
    select 1
    from public.community_events ce
    where ce.id = event_bring_needs.event_id
      and public.is_community_admin(ce.community_id)
  )
)
with check (
  exists (
    select 1
    from public.community_events ce
    where ce.id = event_bring_needs.event_id
      and public.is_community_admin(ce.community_id)
  )
);

drop policy if exists "event_bring_needs_delete_admins" on public.event_bring_needs;
create policy "event_bring_needs_delete_admins"
on public.event_bring_needs
for delete
to authenticated
using (
  exists (
    select 1
    from public.community_events ce
    where ce.id = event_bring_needs.event_id
      and public.is_community_admin(ce.community_id)
  )
);

drop policy if exists "event_bring_contributions_select_members" on public.event_bring_contributions;
create policy "event_bring_contributions_select_members"
on public.event_bring_contributions
for select
to authenticated
using (
  exists (
    select 1
    from public.community_events ce
    where ce.id = event_bring_contributions.event_id
      and public.is_community_member(ce.community_id)
  )
);

drop policy if exists "event_bring_contributions_insert_self" on public.event_bring_contributions;
create policy "event_bring_contributions_insert_self"
on public.event_bring_contributions
for insert
to authenticated
with check (
  user_id = auth.uid()
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
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.community_events ce
    where ce.id = event_bring_contributions.event_id
      and public.is_community_member(ce.community_id)
  )
);

drop policy if exists "event_bring_contributions_delete_self" on public.event_bring_contributions;
create policy "event_bring_contributions_delete_self"
on public.event_bring_contributions
for delete
to authenticated
using (user_id = auth.uid());

revoke all on table public.event_bring_needs from anon;
revoke all on table public.event_bring_contributions from anon;
grant select, insert, update, delete on table public.event_bring_needs to authenticated;
grant select, insert, update, delete on table public.event_bring_contributions to authenticated;
