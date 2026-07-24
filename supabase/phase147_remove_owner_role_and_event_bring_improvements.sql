-- Circles phase 147: remove the owner role and keep at least one circle manager

-- Convert every existing owner to a regular manager before tightening the role constraint.
update public.community_members
set role = 'admin'
where role = 'owner';

-- Repair any legacy circle that somehow has no manager.
insert into public.community_members (community_id, user_id, role)
select c.id, c.created_by, 'admin'
from public.communities c
where not exists (
  select 1
  from public.community_members cm
  where cm.community_id = c.id
    and cm.role = 'admin'
)
on conflict (community_id, user_id) do update set role = 'admin';

-- Remove any previous CHECK constraint that still allows the owner role.
do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.community_members'::regclass
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%role%'
  loop
    execute format(
      'alter table public.community_members drop constraint %I',
      constraint_name
    );
  end loop;
end;
$$;

alter table public.community_members
  add constraint community_members_role_check
  check (role in ('admin', 'member'));

-- A newly created circle starts with its creator as a manager, not as an owner.
drop trigger if exists communities_add_owner on public.communities;
drop trigger if exists communities_add_admin on public.communities;
drop function if exists public.add_community_owner();

create or replace function public.add_community_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.community_members (community_id, user_id, role)
  values (new.id, new.created_by, 'admin')
  on conflict (community_id, user_id) do update set role = 'admin';

  return new;
end;
$$;

create trigger communities_add_admin
after insert on public.communities
for each row execute function public.add_community_admin();

revoke all on function public.add_community_admin() from public;

-- All managers have the same permissions.
create or replace function public.is_community_admin(target_community_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_system_admin()
    or exists (
      select 1
      from public.community_members cm
      where cm.community_id = target_community_id
        and cm.user_id = auth.uid()
        and cm.role = 'admin'
    );
$$;

revoke all on function public.is_community_admin(uuid) from public;
grant execute on function public.is_community_admin(uuid) to authenticated;

-- Protect the last manager even from direct table updates or deletes.
create or replace function public.protect_last_community_manager()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  manager_is_being_removed boolean := false;
begin
  -- Allow the foreign-key cascade when the entire circle itself is deleted.
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;

  if old.role = 'admin' then
    if tg_op = 'DELETE' then
      manager_is_being_removed := true;
    else
      manager_is_being_removed :=
        new.role <> 'admin'
        or new.community_id <> old.community_id
        or new.user_id <> old.user_id;
    end if;
  end if;

  if manager_is_being_removed
    and exists (
      select 1
      from public.communities c
      where c.id = old.community_id
    )
    and not exists (
      select 1
      from public.community_members cm
      where cm.community_id = old.community_id
        and cm.role = 'admin'
        and not (
          cm.community_id = old.community_id
          and cm.user_id = old.user_id
        )
    )
  then
    raise exception 'last_manager_required';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

revoke all on function public.protect_last_community_manager() from public;

drop trigger if exists community_members_protect_last_manager on public.community_members;
create trigger community_members_protect_last_manager
before update or delete on public.community_members
for each row execute function public.protect_last_community_manager();

-- Any manager may promote or demote members, including themselves, as long as
-- another manager remains in the circle.
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
  existing_role text;
begin
  if current_user_id is null then
    raise exception 'authentication_required';
  end if;

  if target_role not in ('admin', 'member') then
    raise exception 'invalid_role';
  end if;

  if not exists (
    select 1
    from public.communities c
    where c.id = target_community_id
  ) then
    raise exception 'circle_not_found';
  end if;

  if not public.is_community_admin(target_community_id) then
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

  if existing_role = 'admin'
    and target_role = 'member'
    and not exists (
      select 1
      from public.community_members cm
      where cm.community_id = target_community_id
        and cm.role = 'admin'
        and cm.user_id <> target_user_id
    )
  then
    raise exception 'last_manager_required';
  end if;

  update public.community_members cm
  set role = target_role
  where cm.community_id = target_community_id
    and cm.user_id = target_user_id;

  return found;
end;
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
  target_role text;
  removed_rows integer := 0;
begin
  if current_user_id is null then
    raise exception 'authentication_required';
  end if;

  if not exists (
    select 1
    from public.communities c
    where c.id = target_community_id
  ) then
    raise exception 'circle_not_found';
  end if;

  if not public.is_community_admin(target_community_id) then
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

  if target_role = 'admin'
    and not exists (
      select 1
      from public.community_members cm
      where cm.community_id = target_community_id
        and cm.role = 'admin'
        and cm.user_id <> target_user_id
    )
  then
    raise exception 'last_manager_required';
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

create or replace function public.leave_community(target_community_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_role text;
  removed_rows integer := 0;
begin
  if current_user_id is null then
    raise exception 'authentication_required';
  end if;

  if not exists (
    select 1
    from public.communities c
    where c.id = target_community_id
  ) then
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

  if current_role = 'admin'
    and not exists (
      select 1
      from public.community_members cm
      where cm.community_id = target_community_id
        and cm.role = 'admin'
        and cm.user_id <> current_user_id
    )
  then
    raise exception 'last_manager_required';
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

create or replace function public.system_admin_leave_community(target_community_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_role text;
  removed_rows integer := 0;
begin
  if current_user_id is null then
    raise exception 'authentication_required';
  end if;

  if not public.is_system_admin() then
    raise exception 'permission_denied';
  end if;

  select cm.role
  into current_role
  from public.community_members cm
  where cm.community_id = target_community_id
    and cm.user_id = current_user_id;

  if current_role = 'admin'
    and not exists (
      select 1
      from public.community_members cm
      where cm.community_id = target_community_id
        and cm.role = 'admin'
        and cm.user_id <> current_user_id
    )
  then
    raise exception 'last_manager_required';
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
revoke all on function public.remove_community_member(uuid, uuid) from public;
revoke all on function public.leave_community(uuid) from public;
revoke all on function public.system_admin_leave_community(uuid) from public;

grant execute on function public.set_community_member_role(uuid, uuid, text) to authenticated;
grant execute on function public.remove_community_member(uuid, uuid) to authenticated;
grant execute on function public.leave_community(uuid) to authenticated;
grant execute on function public.system_admin_leave_community(uuid) to authenticated;

-- RLS now treats every manager equally.
drop policy if exists "communities_delete_owners" on public.communities;
drop policy if exists "communities_delete_admins" on public.communities;
create policy "communities_delete_admins"
on public.communities
for delete
to authenticated
using (public.is_community_admin(id));

drop policy if exists "community_members_delete_admins_or_self" on public.community_members;
drop policy if exists "community_members_delete_creator_admin_or_self" on public.community_members;
create policy "community_members_delete_admins_or_self"
on public.community_members
for delete
to authenticated
using (
  user_id = auth.uid()
  or public.is_community_admin(community_id)
);

-- The owner/creator permission helpers are no longer part of the active model.
drop function if exists public.is_community_owner(uuid);
drop function if exists public.is_community_creator(uuid);
