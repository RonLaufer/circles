-- Circles phase 12: circle sharing, membership requests and approvals

alter table public.communities
  add column if not exists share_token uuid;

update public.communities
set share_token = gen_random_uuid()
where share_token is null;

alter table public.communities
  alter column share_token set default gen_random_uuid(),
  alter column share_token set not null;

create unique index if not exists communities_share_token_key
  on public.communities(share_token);

create table if not exists public.community_join_requests (
  community_id uuid not null references public.communities(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  primary key (community_id, user_id)
);

create index if not exists community_join_requests_community_status_idx
  on public.community_join_requests(community_id, status, requested_at desc);

alter table public.community_join_requests enable row level security;

drop policy if exists "join_requests_select_self_or_admins" on public.community_join_requests;
create policy "join_requests_select_self_or_admins"
on public.community_join_requests
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_community_admin(community_id)
);

revoke all on table public.community_join_requests from anon;
revoke all on table public.community_join_requests from authenticated;
grant select on table public.community_join_requests to authenticated;

create or replace function public.get_shared_community(target_share_token uuid)
returns table (
  id uuid,
  name text,
  description text,
  logo_url text,
  requires_member_approval boolean,
  share_token uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.id,
    c.name,
    c.description,
    c.logo_url,
    c.requires_member_approval,
    c.share_token
  from public.communities c
  where c.share_token = target_share_token
  limit 1;
$$;

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
    return query select 'member'::text, target_community.id, false;
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
    on conflict (community_id, user_id) do update
    set
      status = 'pending',
      requested_at = now(),
      reviewed_at = null,
      reviewed_by = null;

    return query select 'pending'::text, target_community.id, true;
    return;
  end if;

  insert into public.community_members (community_id, user_id, role)
  values (target_community.id, current_user_id, 'member')
  on conflict (community_id, user_id) do nothing;

  delete from public.community_join_requests
  where community_join_requests.community_id = target_community.id
    and community_join_requests.user_id = current_user_id;

  return query select 'joined'::text, target_community.id, false;
end;
$$;

create or replace function public.get_community_join_requests(target_community_id uuid)
returns table (
  user_id uuid,
  full_name text,
  avatar_url text,
  google_avatar_url text,
  requested_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_community_admin(target_community_id) then
    raise exception 'permission_denied';
  end if;

  return query
  select
    request.user_id,
    profile.full_name,
    profile.avatar_url,
    profile.google_avatar_url,
    request.requested_at
  from public.community_join_requests request
  join public.profiles profile on profile.id = request.user_id
  where request.community_id = target_community_id
    and request.status = 'pending'
  order by request.requested_at asc;
end;
$$;

create or replace function public.review_community_join_request(
  target_community_id uuid,
  target_user_id uuid,
  target_decision text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_community_admin(target_community_id) then
    raise exception 'permission_denied';
  end if;

  if target_decision not in ('approve', 'reject') then
    raise exception 'invalid_decision';
  end if;

  if not exists (
    select 1
    from public.community_join_requests request
    where request.community_id = target_community_id
      and request.user_id = target_user_id
      and request.status = 'pending'
  ) then
    raise exception 'request_not_found';
  end if;

  if target_decision = 'approve' then
    insert into public.community_members (community_id, user_id, role)
    values (target_community_id, target_user_id, 'member')
    on conflict (community_id, user_id) do nothing;

    update public.community_join_requests request
    set
      status = 'approved',
      reviewed_at = now(),
      reviewed_by = auth.uid()
    where request.community_id = target_community_id
      and request.user_id = target_user_id;

    return 'approved';
  end if;

  update public.community_join_requests request
  set
    status = 'rejected',
    reviewed_at = now(),
    reviewed_by = auth.uid()
  where request.community_id = target_community_id
    and request.user_id = target_user_id;

  return 'rejected';
end;
$$;

revoke all on function public.get_shared_community(uuid) from public;
revoke all on function public.join_community_by_token(uuid) from public;
revoke all on function public.get_community_join_requests(uuid) from public;
revoke all on function public.review_community_join_request(uuid, uuid, text) from public;

grant execute on function public.get_shared_community(uuid) to anon, authenticated;
grant execute on function public.join_community_by_token(uuid) to authenticated;
grant execute on function public.get_community_join_requests(uuid) to authenticated;
grant execute on function public.review_community_join_request(uuid, uuid, text) to authenticated;
