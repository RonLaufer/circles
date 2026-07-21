-- Circles phase 21: modern member actions, self-leave and role management

create or replace function public.is_system_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) = 'laufer.ron@gmail.com';
$$;

create or replace function public.set_community_member_role(
  target_community_id uuid,
  target_user_id uuid,
  target_role text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  circle_creator_id uuid;
  existing_role text;
begin
  if current_user_id is null then
    raise exception 'authentication_required';
  end if;

  if target_role not in ('admin', 'member') then
    raise exception 'invalid_role';
  end if;

  select c.created_by
  into circle_creator_id
  from public.communities c
  where c.id = target_community_id;

  if circle_creator_id is null then
    raise exception 'circle_not_found';
  end if;

  if current_user_id <> circle_creator_id and not public.is_system_admin() then
    raise exception 'permission_denied';
  end if;

  select cm.role
  into existing_role
  from public.community_members cm
  where cm.community_id = target_community_id
    and cm.user_id = target_user_id;

  if existing_role is null then
    raise exception 'member_not_found';
  end if;

  if target_user_id = circle_creator_id or existing_role = 'owner' then
    raise exception 'circle_creator_role_cannot_change';
  end if;

  update public.community_members cm
  set role = target_role
  where cm.community_id = target_community_id
    and cm.user_id = target_user_id;

  return found;
end;
$$;

create or replace function public.leave_community(
  target_community_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  circle_creator_id uuid;
  current_role text;
  removed_rows integer := 0;
begin
  if current_user_id is null then
    raise exception 'authentication_required';
  end if;

  select c.created_by
  into circle_creator_id
  from public.communities c
  where c.id = target_community_id;

  if circle_creator_id is null then
    raise exception 'circle_not_found';
  end if;

  select cm.role
  into current_role
  from public.community_members cm
  where cm.community_id = target_community_id
    and cm.user_id = current_user_id;

  if current_role is null then
    raise exception 'member_not_found';
  end if;

  if current_user_id = circle_creator_id or current_role = 'owner' then
    raise exception 'circle_creator_cannot_leave';
  end if;

  delete from public.community_members cm
  where cm.community_id = target_community_id
    and cm.user_id = current_user_id;

  get diagnostics removed_rows = row_count;

  delete from public.community_join_requests request
  where request.community_id = target_community_id
    and request.user_id = current_user_id;

  return removed_rows > 0;
end;
$$;

revoke all on function public.set_community_member_role(uuid, uuid, text) from public;
revoke all on function public.leave_community(uuid) from public;

grant execute on function public.set_community_member_role(uuid, uuid, text) to authenticated;
grant execute on function public.leave_community(uuid) to authenticated;
