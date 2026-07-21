-- Circles phase 31: event end time, participant capacity and event sharing

alter table public.community_events
  add column if not exists ends_at timestamptz,
  add column if not exists participant_limit integer,
  add column if not exists share_token uuid;

update public.community_events
set ends_at = starts_at + interval '1 hour'
where ends_at is null;

update public.community_events
set share_token = gen_random_uuid()
where share_token is null;

alter table public.community_events
  alter column ends_at set not null,
  alter column share_token set default gen_random_uuid(),
  alter column share_token set not null;

alter table public.community_events
  drop constraint if exists community_events_end_after_start;

alter table public.community_events
  add constraint community_events_end_after_start
  check (ends_at > starts_at);

alter table public.community_events
  drop constraint if exists community_events_participant_limit_check;

alter table public.community_events
  add constraint community_events_participant_limit_check
  check (participant_limit is null or participant_limit between 1 and 10000);

create unique index if not exists community_events_share_token_key
  on public.community_events(share_token);

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

  select coalesce(sum(ea.party_size), 0)::integer
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

drop trigger if exists community_events_validate_participant_limit on public.community_events;
create trigger community_events_validate_participant_limit
before insert or update of participant_limit on public.community_events
for each row execute function public.validate_event_participant_limit();

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

  select ce.community_id, ce.participant_limit
  into target_community_id, event_limit
  from public.community_events ce
  where ce.id = target_event_id
  for update;

  if target_community_id is null then
    raise exception 'event_not_found';
  end if;

  if not public.is_community_member(target_community_id) then
    raise exception 'community_membership_required';
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
