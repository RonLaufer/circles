-- Circles phase 82: checkbox-based bring commitments and planned-table notes

begin;

-- Restore the optional note field that is shown only for predefined tables.
alter table public.event_bring_contributions
  add column if not exists note text not null default '';

alter table public.event_bring_contributions
  drop constraint if exists event_bring_contributions_note_length;

alter table public.event_bring_contributions
  add constraint event_bring_contributions_note_length
  check (char_length(note) <= 300);

-- Quantity is no longer exposed in the interface. Existing rows are normalized
-- to the single checked/not-checked meaning used by the application.
update public.event_bring_needs
set quantity_needed = 1
where quantity_needed <> 1;

update public.event_bring_contributions
set quantity = 1
where quantity <> 1;

-- Keep notes when an event and its bring table are cloned.
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
    1,
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
    1,
    '',
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

revoke all on function public.clone_event_content(uuid, uuid) from public;
grant execute on function public.clone_event_content(uuid, uuid) to authenticated;

commit;
