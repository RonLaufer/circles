-- Circles phase 77: system owner receives full circle-level access
-- The system owner may view and manage every circle even without a membership row.

create or replace function public.is_system_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) = 'laufer.ron@gmail.com';
$$;

create or replace function public.is_community_member(target_community_id uuid)
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
    );
$$;

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
        and cm.role in ('owner', 'admin')
    );
$$;

create or replace function public.is_community_owner(target_community_id uuid)
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
        and cm.role = 'owner'
    );
$$;

create or replace function public.shares_community_with(other_user_id uuid)
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
      from public.community_members mine
      join public.community_members theirs
        on theirs.community_id = mine.community_id
      where mine.user_id = auth.uid()
        and theirs.user_id = other_user_id
    );
$$;

revoke all on function public.is_system_admin() from public;
revoke all on function public.is_community_member(uuid) from public;
revoke all on function public.is_community_admin(uuid) from public;
revoke all on function public.is_community_owner(uuid) from public;
revoke all on function public.shares_community_with(uuid) from public;

grant execute on function public.is_system_admin() to authenticated;
grant execute on function public.is_community_member(uuid) to authenticated;
grant execute on function public.is_community_admin(uuid) to authenticated;
grant execute on function public.is_community_owner(uuid) to authenticated;
grant execute on function public.shares_community_with(uuid) to authenticated;
