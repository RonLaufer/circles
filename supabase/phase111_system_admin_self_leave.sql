-- Circles 111: allow the system administrator to remove their own circle membership

create or replace function public.system_admin_leave_community(
  target_community_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  removed_rows integer := 0;
begin
  if current_user_id is null then
    raise exception 'authentication_required';
  end if;

  if not public.is_system_admin() then
    raise exception 'permission_denied';
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

revoke all on function public.system_admin_leave_community(uuid) from public;
grant execute on function public.system_admin_leave_community(uuid) to authenticated;
