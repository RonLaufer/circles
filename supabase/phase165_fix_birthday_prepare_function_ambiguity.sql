-- Circles phase 165: repair birthday dispatch preparation.
-- The RETURNS TABLE output name recipient_email conflicted with the
-- birthday_email_dispatches.recipient_email column in ON CONFLICT.

create or replace function public.prepare_birthday_email_dispatches(
  p_cron_token text,
  p_birthday_date date
)
returns table (
  dispatch_id uuid,
  birthday_name text,
  birthday_birth_year integer,
  birthday_phone text,
  recipient_name text,
  recipient_email text,
  circle_names text[]
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if p_birthday_date is null then
    raise exception 'birthday_date_required';
  end if;

  if not exists (
    select 1
    from private.birthday_email_settings settings
    where settings.singleton = true
      and settings.cron_token::text = trim(coalesce(p_cron_token, ''))
  ) then
    raise exception 'invalid_cron_token' using errcode = '42501';
  end if;

  return query
  with birthday_members as (
    select
      profile.id as birthday_user_id,
      coalesce(nullif(trim(profile.full_name), ''), 'חבר/ת מעגל') as birthday_name,
      profile.birth_year as birthday_birth_year,
      trim(coalesce(profile.phone, '')) as birthday_phone,
      lower(trim(coalesce(profile.email, ''))) as birthday_email
    from public.profiles profile
    where profile.birth_day = extract(day from p_birthday_date)::integer
      and profile.birth_month = extract(month from p_birthday_date)::integer
  ),
  recipient_pairs as (
    select
      birthday.birthday_user_id,
      birthday.birthday_name,
      birthday.birthday_birth_year,
      birthday.birthday_phone,
      min(manager_profile.id::text)::uuid as recipient_user_id,
      coalesce(
        max(nullif(trim(manager_profile.full_name), '')),
        split_part(lower(trim(manager_profile.email)), '@', 1),
        'מנהל/ת המעגל'
      ) as recipient_name,
      lower(trim(manager_profile.email)) as recipient_email,
      array_agg(distinct circle.name order by circle.name) as circle_names
    from birthday_members birthday
    join public.community_members birthday_membership
      on birthday_membership.user_id = birthday.birthday_user_id
    join public.communities circle
      on circle.id = birthday_membership.community_id
    join public.community_members manager
      on manager.community_id = circle.id
      and manager.role = 'admin'
    join public.profiles manager_profile
      on manager_profile.id = manager.user_id
    where manager.user_id <> birthday.birthday_user_id
      and nullif(trim(coalesce(manager_profile.email, '')), '') is not null
      and (
        birthday.birthday_email = ''
        or lower(trim(manager_profile.email)) <> birthday.birthday_email
      )
    group by
      birthday.birthday_user_id,
      birthday.birthday_name,
      birthday.birthday_birth_year,
      birthday.birthday_phone,
      lower(trim(manager_profile.email))
  ),
  reserved as (
    insert into public.birthday_email_dispatches as dispatch (
      birthday_date,
      birthday_user_id,
      birthday_name,
      birthday_birth_year,
      birthday_phone,
      recipient_user_id,
      recipient_name,
      recipient_email,
      circle_names,
      status,
      attempt_count,
      processing_started_at,
      sent_at,
      last_error,
      updated_at
    )
    select
      p_birthday_date,
      pair.birthday_user_id,
      pair.birthday_name,
      pair.birthday_birth_year,
      pair.birthday_phone,
      pair.recipient_user_id,
      pair.recipient_name,
      pair.recipient_email,
      pair.circle_names,
      'processing',
      1,
      now(),
      null,
      null,
      now()
    from recipient_pairs pair
    on conflict (birthday_date, birthday_user_id, recipient_email) do update
    set
      birthday_name = excluded.birthday_name,
      birthday_birth_year = excluded.birthday_birth_year,
      birthday_phone = excluded.birthday_phone,
      recipient_user_id = excluded.recipient_user_id,
      recipient_name = excluded.recipient_name,
      circle_names = excluded.circle_names,
      status = 'processing',
      attempt_count = dispatch.attempt_count + 1,
      processing_started_at = now(),
      sent_at = null,
      last_error = null,
      updated_at = now()
    where dispatch.status = 'failed'
       or (
         dispatch.status = 'processing'
         and dispatch.processing_started_at < now() - interval '20 minutes'
       )
    returning
      dispatch.id,
      dispatch.birthday_name,
      dispatch.birthday_birth_year,
      dispatch.birthday_phone,
      dispatch.recipient_name,
      dispatch.recipient_email,
      dispatch.circle_names
  )
  select
    reserved.id,
    reserved.birthday_name,
    reserved.birthday_birth_year,
    reserved.birthday_phone,
    reserved.recipient_name,
    reserved.recipient_email,
    reserved.circle_names
  from reserved
  order by reserved.recipient_email, reserved.birthday_name;
end;
$$;

revoke all on function public.prepare_birthday_email_dispatches(text, date) from public;
grant execute on function public.prepare_birthday_email_dispatches(text, date) to anon;

-- Start a new HTTP request immediately after this transaction commits.
select public.invoke_birthday_email_cron() as immediate_request_id;
