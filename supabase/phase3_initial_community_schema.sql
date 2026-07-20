-- Circles phase 3: initial multi-community schema

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text not null default '',
  about text not null default '',
  avatar_url text,
  google_avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.communities (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 120),
  description text not null default '',
  logo_url text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.community_members (
  community_id uuid not null references public.communities(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (community_id, user_id)
);

create index if not exists community_members_user_id_idx
  on public.community_members(user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.sync_profile_from_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles as existing_profile (
    id,
    email,
    full_name,
    google_avatar_url
  )
  values (
    new.id,
    new.email,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'משתמש'
    ),
    coalesce(
      nullif(new.raw_user_meta_data ->> 'avatar_url', ''),
      nullif(new.raw_user_meta_data ->> 'picture', '')
    )
  )
  on conflict (id) do update
  set
    email = excluded.email,
    google_avatar_url = coalesce(excluded.google_avatar_url, existing_profile.google_avatar_url),
    updated_at = now();

  return new;
end;
$$;

create or replace function public.add_community_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.community_members (community_id, user_id, role)
  values (new.id, new.created_by, 'owner')
  on conflict (community_id, user_id) do update set role = 'owner';

  return new;
end;
$$;

create or replace function public.is_community_member(target_community_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.community_members
    where community_id = target_community_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.is_community_admin(target_community_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.community_members
    where community_id = target_community_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
  );
$$;

create or replace function public.is_community_owner(target_community_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.community_members
    where community_id = target_community_id
      and user_id = auth.uid()
      and role = 'owner'
  );
$$;

create or replace function public.shares_community_with(other_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.community_members mine
    join public.community_members theirs
      on theirs.community_id = mine.community_id
    where mine.user_id = auth.uid()
      and theirs.user_id = other_user_id
  );
$$;

revoke all on function public.is_community_member(uuid) from public;
revoke all on function public.is_community_admin(uuid) from public;
revoke all on function public.is_community_owner(uuid) from public;
revoke all on function public.shares_community_with(uuid) from public;
grant execute on function public.is_community_member(uuid) to authenticated;
grant execute on function public.is_community_admin(uuid) to authenticated;
grant execute on function public.is_community_owner(uuid) to authenticated;
grant execute on function public.shares_community_with(uuid) to authenticated;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists communities_set_updated_at on public.communities;
create trigger communities_set_updated_at
before update on public.communities
for each row execute function public.set_updated_at();

drop trigger if exists auth_user_sync_profile on auth.users;
create trigger auth_user_sync_profile
after insert or update of email, raw_user_meta_data on auth.users
for each row execute function public.sync_profile_from_auth_user();

drop trigger if exists communities_add_owner on public.communities;
create trigger communities_add_owner
after insert on public.communities
for each row execute function public.add_community_owner();

insert into public.profiles as existing_profile (id, email, full_name, google_avatar_url)
select
  users.id,
  users.email,
  coalesce(
    nullif(users.raw_user_meta_data ->> 'full_name', ''),
    nullif(users.raw_user_meta_data ->> 'name', ''),
    nullif(split_part(coalesce(users.email, ''), '@', 1), ''),
    'משתמש'
  ),
  coalesce(
    nullif(users.raw_user_meta_data ->> 'avatar_url', ''),
    nullif(users.raw_user_meta_data ->> 'picture', '')
  )
from auth.users
on conflict (id) do update
set
  email = excluded.email,
  google_avatar_url = coalesce(excluded.google_avatar_url, existing_profile.google_avatar_url),
  updated_at = now();

alter table public.profiles enable row level security;
alter table public.communities enable row level security;
alter table public.community_members enable row level security;

drop policy if exists "profiles_select_shared_community" on public.profiles;
create policy "profiles_select_shared_community"
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
  or public.shares_community_with(id)
);

drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self"
on public.profiles
for insert
to authenticated
with check (id = auth.uid());

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "communities_select_members" on public.communities;
create policy "communities_select_members"
on public.communities
for select
to authenticated
using (public.is_community_member(id));

drop policy if exists "communities_insert_creator" on public.communities;
create policy "communities_insert_creator"
on public.communities
for insert
to authenticated
with check (created_by = auth.uid());

drop policy if exists "communities_update_admins" on public.communities;
create policy "communities_update_admins"
on public.communities
for update
to authenticated
using (public.is_community_admin(id))
with check (public.is_community_admin(id));

drop policy if exists "communities_delete_owners" on public.communities;
create policy "communities_delete_owners"
on public.communities
for delete
to authenticated
using (public.is_community_owner(id));

drop policy if exists "community_members_select_members" on public.community_members;
create policy "community_members_select_members"
on public.community_members
for select
to authenticated
using (public.is_community_member(community_id));

drop policy if exists "community_members_insert_admins" on public.community_members;
create policy "community_members_insert_admins"
on public.community_members
for insert
to authenticated
with check (public.is_community_admin(community_id));

drop policy if exists "community_members_update_admins" on public.community_members;
create policy "community_members_update_admins"
on public.community_members
for update
to authenticated
using (public.is_community_admin(community_id))
with check (public.is_community_admin(community_id));

drop policy if exists "community_members_delete_admins_or_self" on public.community_members;
create policy "community_members_delete_admins_or_self"
on public.community_members
for delete
to authenticated
using (
  public.is_community_admin(community_id)
  or (user_id = auth.uid() and role <> 'owner')
);

revoke all on table public.profiles from anon;
revoke all on table public.communities from anon;
revoke all on table public.community_members from anon;

grant select, insert, update on table public.profiles to authenticated;
grant select, insert, update, delete on table public.communities to authenticated;
grant select, insert, update, delete on table public.community_members to authenticated;
