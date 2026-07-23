-- Circles phase 119: generic event conversation topics and messages
-- Creates two fixed topics for every event: ride requests and ride offers.

create table if not exists public.event_conversation_topics (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.community_events(id) on delete cascade,
  slug text not null check (char_length(trim(slug)) between 2 and 80),
  title text not null check (char_length(trim(title)) between 2 and 120),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (event_id, slug)
);

create index if not exists event_conversation_topics_event_sort_idx
  on public.event_conversation_topics(event_id, sort_order, created_at);

create table if not exists public.event_conversation_messages (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.community_events(id) on delete cascade,
  topic_id uuid not null references public.event_conversation_topics(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 1200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists event_conversation_messages_event_created_idx
  on public.event_conversation_messages(event_id, created_at);

create index if not exists event_conversation_messages_topic_created_idx
  on public.event_conversation_messages(topic_id, created_at);

create or replace function public.ensure_default_event_conversation_topics()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.event_conversation_topics (event_id, slug, title, sort_order)
  values
    (new.id, 'ride_request', 'חיפוש טרמפ', 10),
    (new.id, 'ride_offer', 'הצעת טרמפים', 20)
  on conflict (event_id, slug) do nothing;

  return new;
end;
$$;

drop trigger if exists community_events_create_conversation_topics on public.community_events;
create trigger community_events_create_conversation_topics
after insert on public.community_events
for each row execute function public.ensure_default_event_conversation_topics();

insert into public.event_conversation_topics (event_id, slug, title, sort_order)
select event.id, topic.slug, topic.title, topic.sort_order
from public.community_events event
cross join (
  values
    ('ride_request'::text, 'חיפוש טרמפ'::text, 10),
    ('ride_offer'::text, 'הצעת טרמפים'::text, 20)
) as topic(slug, title, sort_order)
on conflict (event_id, slug) do nothing;

create or replace function public.validate_event_conversation_message()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.event_conversation_topics topic
    where topic.id = new.topic_id
      and topic.event_id = new.event_id
  ) then
    raise exception 'conversation_topic_event_mismatch';
  end if;

  new.body = trim(new.body);
  return new;
end;
$$;

create or replace function public.protect_event_conversation_message_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.event_id = old.event_id;
  new.topic_id = old.topic_id;
  new.user_id = old.user_id;
  new.created_at = old.created_at;
  return new;
end;
$$;

drop trigger if exists event_conversation_messages_validate on public.event_conversation_messages;
create trigger event_conversation_messages_validate
before insert or update on public.event_conversation_messages
for each row execute function public.validate_event_conversation_message();

drop trigger if exists event_conversation_messages_protect_identity on public.event_conversation_messages;
create trigger event_conversation_messages_protect_identity
before update on public.event_conversation_messages
for each row execute function public.protect_event_conversation_message_identity();

drop trigger if exists event_conversation_messages_set_updated_at on public.event_conversation_messages;
create trigger event_conversation_messages_set_updated_at
before update on public.event_conversation_messages
for each row execute function public.set_updated_at();

alter table public.event_conversation_topics enable row level security;
alter table public.event_conversation_messages enable row level security;

drop policy if exists "event_conversation_topics_select_members" on public.event_conversation_topics;
create policy "event_conversation_topics_select_members"
on public.event_conversation_topics
for select
to authenticated
using (
  exists (
    select 1
    from public.community_events event
    where event.id = event_conversation_topics.event_id
      and public.is_community_member(event.community_id)
  )
);

drop policy if exists "event_conversation_topics_manage_admins" on public.event_conversation_topics;
create policy "event_conversation_topics_manage_admins"
on public.event_conversation_topics
for all
to authenticated
using (
  exists (
    select 1
    from public.community_events event
    where event.id = event_conversation_topics.event_id
      and public.is_community_admin(event.community_id)
  )
)
with check (
  exists (
    select 1
    from public.community_events event
    where event.id = event_conversation_topics.event_id
      and public.is_community_admin(event.community_id)
  )
);

drop policy if exists "event_conversation_messages_select_members" on public.event_conversation_messages;
create policy "event_conversation_messages_select_members"
on public.event_conversation_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.community_events event
    where event.id = event_conversation_messages.event_id
      and public.is_community_member(event.community_id)
  )
);

drop policy if exists "event_conversation_messages_insert_members" on public.event_conversation_messages;
create policy "event_conversation_messages_insert_members"
on public.event_conversation_messages
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.community_events event
    where event.id = event_conversation_messages.event_id
      and public.is_community_member(event.community_id)
  )
  and exists (
    select 1
    from public.event_conversation_topics topic
    where topic.id = event_conversation_messages.topic_id
      and topic.event_id = event_conversation_messages.event_id
  )
);

drop policy if exists "event_conversation_messages_update_own" on public.event_conversation_messages;
create policy "event_conversation_messages_update_own"
on public.event_conversation_messages
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "event_conversation_messages_delete_author_or_admin" on public.event_conversation_messages;
create policy "event_conversation_messages_delete_author_or_admin"
on public.event_conversation_messages
for delete
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.community_events event
    where event.id = event_conversation_messages.event_id
      and public.is_community_admin(event.community_id)
  )
);

revoke all on table public.event_conversation_topics from anon;
revoke all on table public.event_conversation_messages from anon;
grant select, insert, update, delete on table public.event_conversation_topics to authenticated;
grant select, insert, update, delete on table public.event_conversation_messages to authenticated;

-- Realtime updates for messages. The guard keeps the script safe to rerun.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'event_conversation_messages'
  ) then
    alter publication supabase_realtime add table public.event_conversation_messages;
  end if;
end
$$;
