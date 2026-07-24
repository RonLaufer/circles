-- Circles phase 142: structured ride requests/offers and one general event conversation.

create table if not exists public.event_ride_requests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.community_events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  origin text not null check (char_length(trim(origin)) between 2 and 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, user_id)
);

create index if not exists event_ride_requests_event_created_idx
  on public.event_ride_requests(event_id, created_at);

create table if not exists public.event_ride_offers (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.event_ride_requests(id) on delete cascade,
  event_id uuid not null references public.community_events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  note text not null check (char_length(trim(note)) between 1 and 240),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (request_id, user_id)
);

create index if not exists event_ride_offers_event_created_idx
  on public.event_ride_offers(event_id, created_at);

create index if not exists event_ride_offers_request_created_idx
  on public.event_ride_offers(request_id, created_at);

create or replace function public.normalize_event_ride_request()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.origin = trim(new.origin);
  if tg_op = 'UPDATE' then
    new.event_id = old.event_id;
    new.user_id = old.user_id;
    new.created_at = old.created_at;
  end if;
  return new;
end;
$$;

create or replace function public.validate_event_ride_offer()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  request_event_id uuid;
  request_user_id uuid;
begin
  select request.event_id, request.user_id
    into request_event_id, request_user_id
  from public.event_ride_requests request
  where request.id = new.request_id;

  if request_event_id is null then
    raise exception 'ride_request_not_found';
  end if;

  if new.event_id <> request_event_id then
    raise exception 'ride_offer_event_mismatch';
  end if;

  if new.user_id = request_user_id then
    raise exception 'cannot_offer_own_ride_request';
  end if;

  new.note = trim(new.note);
  if tg_op = 'UPDATE' then
    new.request_id = old.request_id;
    new.event_id = old.event_id;
    new.user_id = old.user_id;
    new.created_at = old.created_at;
  end if;
  return new;
end;
$$;

drop trigger if exists event_ride_requests_normalize on public.event_ride_requests;
create trigger event_ride_requests_normalize
before insert or update on public.event_ride_requests
for each row execute function public.normalize_event_ride_request();

drop trigger if exists event_ride_requests_set_updated_at on public.event_ride_requests;
create trigger event_ride_requests_set_updated_at
before update on public.event_ride_requests
for each row execute function public.set_updated_at();

drop trigger if exists event_ride_offers_validate on public.event_ride_offers;
create trigger event_ride_offers_validate
before insert or update on public.event_ride_offers
for each row execute function public.validate_event_ride_offer();

drop trigger if exists event_ride_offers_set_updated_at on public.event_ride_offers;
create trigger event_ride_offers_set_updated_at
before update on public.event_ride_offers
for each row execute function public.set_updated_at();

alter table public.event_ride_requests enable row level security;
alter table public.event_ride_offers enable row level security;

drop policy if exists "event_ride_requests_select_members" on public.event_ride_requests;
create policy "event_ride_requests_select_members"
on public.event_ride_requests
for select
to authenticated
using (
  exists (
    select 1
    from public.community_events event
    where event.id = event_ride_requests.event_id
      and public.is_community_member(event.community_id)
  )
);

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
    where event.id = event_ride_requests.event_id
      and public.is_community_member(event.community_id)
  )
);

drop policy if exists "event_ride_requests_update_own" on public.event_ride_requests;
create policy "event_ride_requests_update_own"
on public.event_ride_requests
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "event_ride_requests_delete_own" on public.event_ride_requests;
create policy "event_ride_requests_delete_own"
on public.event_ride_requests
for delete
to authenticated
using (user_id = auth.uid());

drop policy if exists "event_ride_offers_select_members" on public.event_ride_offers;
create policy "event_ride_offers_select_members"
on public.event_ride_offers
for select
to authenticated
using (
  exists (
    select 1
    from public.community_events event
    where event.id = event_ride_offers.event_id
      and public.is_community_member(event.community_id)
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
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "event_ride_offers_delete_own" on public.event_ride_offers;
create policy "event_ride_offers_delete_own"
on public.event_ride_offers
for delete
to authenticated
using (user_id = auth.uid());

revoke all on table public.event_ride_requests from anon;
revoke all on table public.event_ride_offers from anon;
grant select, insert, update, delete on table public.event_ride_requests to authenticated;
grant select, insert, update, delete on table public.event_ride_offers to authenticated;

alter table public.event_ride_requests replica identity full;
alter table public.event_ride_offers replica identity full;

-- Keep one conversation only: the general conversation.
create or replace function public.ensure_default_event_conversation_topics()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.event_conversation_topics (event_id, slug, title, sort_order)
  values (new.id, 'general', 'שיחה באירוע', 0)
  on conflict (event_id, slug) do update
  set title = excluded.title,
      sort_order = excluded.sort_order;

  return new;
end;
$$;

insert into public.event_conversation_topics (event_id, slug, title, sort_order)
select event.id, 'general', 'שיחה באירוע', 0
from public.community_events event
on conflict (event_id, slug) do update
set title = excluded.title,
    sort_order = excluded.sort_order;

-- Deleting the obsolete topics also deletes their obsolete messages through cascade.
delete from public.event_conversation_topics
where slug in ('ride_request', 'ride_offer');

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'event_ride_requests'
  ) then
    alter publication supabase_realtime add table public.event_ride_requests;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'event_ride_offers'
  ) then
    alter publication supabase_realtime add table public.event_ride_offers;
  end if;
end
$$;
