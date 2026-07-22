-- Circles phase 33: complete event attendance deletion

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
begin
  if current_user_id is null then
    raise exception 'authentication_required';
  end if;

  select ce.community_id
  into target_community_id
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
