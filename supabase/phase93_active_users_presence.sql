-- Circles phase 93: online presence for users who share circles

alter table public.profiles
  add column if not exists last_active_at timestamptz;

create index if not exists profiles_last_active_at_idx
  on public.profiles (last_active_at desc);

create or replace function public.touch_user_presence()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  update public.profiles
  set last_active_at = now()
  where id = auth.uid();
end;
$$;

create or replace function public.get_active_circle_members()
returns table (
  user_id uuid,
  full_name text,
  avatar_url text,
  google_avatar_url text,
  last_active_at timestamptz,
  community_id uuid,
  community_name text,
  joined_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id as user_id,
    p.full_name,
    p.avatar_url,
    p.google_avatar_url,
    p.last_active_at,
    c.id as community_id,
    c.name as community_name,
    theirs.joined_at
  from public.community_members mine
  join public.community_members theirs
    on theirs.community_id = mine.community_id
  join public.profiles p
    on p.id = theirs.user_id
  join public.communities c
    on c.id = theirs.community_id
  where mine.user_id = auth.uid()
    and theirs.user_id <> auth.uid()
    and p.last_active_at >= now() - interval '35 seconds'
  order by p.last_active_at desc, theirs.joined_at desc;
$$;

revoke all on function public.touch_user_presence() from public;
revoke all on function public.get_active_circle_members() from public;

grant execute on function public.touch_user_presence() to authenticated;
grant execute on function public.get_active_circle_members() to authenticated;
