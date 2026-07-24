-- Circles phase 142
-- Resolve an event share UUID when only its first 35 characters reached the browser.

create or replace function public.get_shared_event_by_token_prefix(
  target_share_token_prefix text
)
returns table (
  id uuid,
  community_id uuid,
  title text,
  description text,
  location text,
  starts_at timestamptz,
  ends_at timestamptz,
  image_url text,
  participant_limit integer,
  share_token uuid,
  status text,
  community_name text,
  community_description text,
  community_logo_url text,
  community_requires_member_approval boolean,
  community_share_token uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  with normalized as (
    select lower(trim(target_share_token_prefix)) as token_prefix
  ),
  matches as (
    select
      ce.id,
      ce.community_id,
      ce.title,
      ce.description,
      ce.location,
      ce.starts_at,
      ce.ends_at,
      ce.image_url,
      ce.participant_limit,
      ce.share_token,
      ce.status,
      c.name as community_name,
      c.description as community_description,
      c.logo_url as community_logo_url,
      c.requires_member_approval as community_requires_member_approval,
      c.share_token as community_share_token
    from public.community_events ce
    join public.communities c on c.id = ce.community_id
    cross join normalized n
    where length(n.token_prefix) = 35
      and n.token_prefix ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{11}$'
      and left(ce.share_token::text, 35) = n.token_prefix
  )
  select m.*
  from matches m
  where (select count(*) from matches) = 1
  limit 1;
$$;

revoke all on function public.get_shared_event_by_token_prefix(text) from public;
grant execute on function public.get_shared_event_by_token_prefix(text) to anon, authenticated;
