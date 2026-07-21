-- Circles phase 17: system admin and circle creator may remove members

create or replace function public.is_system_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) = 'laufer.ron@gmail.com';
$$;

create or replace function public.is_community_creator(target_community_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.communities c
    where c.id = target_community_id
      and c.created_by = auth.uid()
  );
$$;

create or replace function public.remove_community_member(
  target_community_id uuid,
  target_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  circle_creator_id uuid;
  target_role text;
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

  if current_user_id <> circle_creator_id and not public.is_system_admin() then
    raise exception 'permission_denied';
  end if;

  select cm.role
  into target_role
  from public.community_members cm
  where cm.community_id = target_community_id
    and cm.user_id = target_user_id;

  if target_role is null then
    raise exception 'member_not_found';
  end if;

  if target_user_id = circle_creator_id or target_role = 'owner' then
    raise exception 'circle_creator_cannot_be_removed';
  end if;

  delete from public.community_members cm
  where cm.community_id = target_community_id
    and cm.user_id = target_user_id;

  get diagnostics removed_rows = row_count;

  delete from public.community_join_requests request
  where request.community_id = target_community_id
    and request.user_id = target_user_id;

  return removed_rows > 0;
end;
$$;

revoke all on function public.is_system_admin() from public;
revoke all on function public.is_community_creator(uuid) from public;
revoke all on function public.remove_community_member(uuid, uuid) from public;

grant execute on function public.is_system_admin() to authenticated;
grant execute on function public.is_community_creator(uuid) to authenticated;
grant execute on function public.remove_community_member(uuid, uuid) to authenticated;

-- Keep self-removal available for non-owners, but member removal is limited
-- to the system administrator or the original creator of the circle.
drop policy if exists "community_members_delete_admins_or_self" on public.community_members;
drop policy if exists "community_members_delete_creator_admin_or_self" on public.community_members;
create policy "community_members_delete_creator_admin_or_self"
on public.community_members
for delete
to authenticated
using (
  (user_id = auth.uid() and role <> 'owner')
  or (
    role <> 'owner'
    and (
      public.is_system_admin()
      or public.is_community_creator(community_id)
    )
  )
);
