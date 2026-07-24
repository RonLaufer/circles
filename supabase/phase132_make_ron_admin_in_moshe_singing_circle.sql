-- Circles phase 132: make Ron Laufer an administrator of
-- "מפגשי שירה בציבור אצל משה"

DO $$
DECLARE
  target_email constant text := 'laufer.ron@gmail.com';
  target_circle_name constant text := 'מפגשי שירה בציבור אצל משה';
  target_user_id uuid;
  target_community_id uuid;
  matching_users integer;
  matching_communities integer;
BEGIN
  select count(*)
  into matching_users
  from public.profiles p
  where lower(trim(coalesce(p.email, ''))) = target_email;

  if matching_users = 0 then
    raise exception 'לא נמצא פרופיל עבור %', target_email;
  end if;

  if matching_users > 1 then
    raise exception 'נמצאו כמה פרופילים עבור %. לא בוצע שינוי.', target_email;
  end if;

  select p.id
  into target_user_id
  from public.profiles p
  where lower(trim(coalesce(p.email, ''))) = target_email
  limit 1;

  select count(*)
  into matching_communities
  from public.communities c
  where trim(c.name) = target_circle_name;

  if matching_communities = 0 then
    raise exception 'לא נמצא מעגל בשם "%"', target_circle_name;
  end if;

  if matching_communities > 1 then
    raise exception 'נמצאו כמה מעגלים בשם "%". לא בוצע שינוי.', target_circle_name;
  end if;

  select c.id
  into target_community_id
  from public.communities c
  where trim(c.name) = target_circle_name
  limit 1;

  insert into public.community_members as existing_member (
    community_id,
    user_id,
    role
  )
  values (
    target_community_id,
    target_user_id,
    'admin'
  )
  on conflict (community_id, user_id) do update
  set role = case
    when existing_member.role = 'owner' then 'owner'
    else 'admin'
  end;

  delete from public.community_join_requests request
  where request.community_id = target_community_id
    and request.user_id = target_user_id;
END;
$$;

-- Confirmation result
select
  p.full_name as user_name,
  p.email,
  c.name as circle_name,
  cm.role
from public.community_members cm
join public.profiles p on p.id = cm.user_id
join public.communities c on c.id = cm.community_id
where lower(trim(coalesce(p.email, ''))) = 'laufer.ron@gmail.com'
  and trim(c.name) = 'מפגשי שירה בציבור אצל משה';
