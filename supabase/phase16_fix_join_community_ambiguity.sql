-- Phase 16: fix ambiguous community_id references in join_community_by_token

create or replace function public.join_community_by_token(target_share_token uuid)
returns table (
  result text,
  community_id uuid,
  requires_approval boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  target_community public.communities%rowtype;
begin
  if current_user_id is null then
    raise exception 'authentication_required';
  end if;

  select c.*
  into target_community
  from public.communities c
  where c.share_token = target_share_token;

  if target_community.id is null then
    raise exception 'circle_not_found';
  end if;

  if exists (
    select 1
    from public.community_members cm
    where cm.community_id = target_community.id
      and cm.user_id = current_user_id
  ) then
    return query
    select 'member'::text, target_community.id, false;
    return;
  end if;

  if target_community.requires_member_approval then
    insert into public.community_join_requests (
      community_id,
      user_id,
      status,
      requested_at,
      reviewed_at,
      reviewed_by
    )
    values (
      target_community.id,
      current_user_id,
      'pending',
      now(),
      null,
      null
    )
    on conflict on constraint community_join_requests_pkey do update
    set
      status = 'pending',
      requested_at = now(),
      reviewed_at = null,
      reviewed_by = null;

    return query
    select 'pending'::text, target_community.id, true;
    return;
  end if;

  insert into public.community_members (
    community_id,
    user_id,
    role
  )
  values (
    target_community.id,
    current_user_id,
    'member'
  )
  on conflict on constraint community_members_pkey do nothing;

  delete from public.community_join_requests request
  where request.community_id = target_community.id
    and request.user_id = current_user_id;

  return query
  select 'joined'::text, target_community.id, false;
end;
$$;

revoke all on function public.join_community_by_token(uuid) from public;
grant execute on function public.join_community_by_token(uuid) to authenticated;
