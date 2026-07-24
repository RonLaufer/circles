-- Circles phase 146: automatic birthday email reminders for circle managers.
-- Runs at 09:30 Israel time, excludes the birthday member, and deduplicates
-- each manager/birthday-member pair even when they share several circles.

create extension if not exists pgcrypto;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.birthday_email_settings (
  singleton boolean primary key default true check (singleton),
  cron_token uuid not null default gen_random_uuid(),
  endpoint_url text not null,
  updated_at timestamptz not null default now()
);

insert into private.birthday_email_settings (singleton, endpoint_url)
values (true, 'https://circles-community.vercel.app/api/cron/birthdays')
on conflict (singleton) do update
set endpoint_url = excluded.endpoint_url,
    updated_at = now();

create table if not exists public.birthday_email_dispatches (
  id uuid primary key default gen_random_uuid(),
  birthday_date date not null,
  birthday_user_id uuid not null references public.profiles(id) on delete cascade,
  birthday_name text not null,
  recipient_user_id uuid references public.profiles(id) on delete set null,
  recipient_name text not null,
  recipient_email text not null,
  circle_names text[] not null default '{}'::text[],
  status text not null default 'processing'
    check (status in ('processing', 'sent', 'failed')),
  attempt_count integer not null default 1 check (attempt_count >= 1),
  processing_started_at timestamptz not null default now(),
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (birthday_date, birthday_user_id, recipient_email)
);

create index if not exists birthday_email_dispatches_date_status_idx
  on public.birthday_email_dispatches (birthday_date desc, status);

alter table public.birthday_email_dispatches enable row level security;
revoke all on table public.birthday_email_dispatches from anon, authenticated;

create or replace function public.prepare_birthday_email_dispatches(
  p_cron_token text,
  p_birthday_date date
)
returns table (
  dispatch_id uuid,
  birthday_name text,
  recipient_name text,
  recipient_email text,
  circle_names text[]
)
language plpgsql
security definer
set search_path = ''
as $$
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
      lower(trim(coalesce(profile.email, ''))) as birthday_email
    from public.profiles profile
    where profile.birth_day = extract(day from p_birthday_date)::integer
      and profile.birth_month = extract(month from p_birthday_date)::integer
  ),
  circle_managers as (
    select member.community_id, member.user_id
    from public.community_members member
    where member.role in ('owner', 'admin')

    union

    select circle.id, circle.created_by
    from public.communities circle
  ),
  recipient_pairs as (
    select
      birthday.birthday_user_id,
      birthday.birthday_name,
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
    join circle_managers manager
      on manager.community_id = circle.id
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
      lower(trim(manager_profile.email))
  ),
  reserved as (
    insert into public.birthday_email_dispatches as dispatch (
      birthday_date,
      birthday_user_id,
      birthday_name,
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
      dispatch.recipient_name,
      dispatch.recipient_email,
      dispatch.circle_names
  )
  select
    reserved.id,
    reserved.birthday_name,
    reserved.recipient_name,
    reserved.recipient_email,
    reserved.circle_names
  from reserved
  order by reserved.recipient_email, reserved.birthday_name;
end;
$$;

create or replace function public.finish_birthday_email_dispatch(
  p_cron_token text,
  p_dispatch_id uuid,
  p_success boolean,
  p_error_message text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from private.birthday_email_settings settings
    where settings.singleton = true
      and settings.cron_token::text = trim(coalesce(p_cron_token, ''))
  ) then
    raise exception 'invalid_cron_token' using errcode = '42501';
  end if;

  update public.birthday_email_dispatches dispatch
  set
    status = case when p_success then 'sent' else 'failed' end,
    sent_at = case when p_success then now() else null end,
    last_error = case
      when p_success then null
      else left(coalesce(nullif(trim(p_error_message), ''), 'unknown_error'), 1000)
    end,
    updated_at = now()
  where dispatch.id = p_dispatch_id
    and dispatch.status = 'processing';

  return found;
end;
$$;

create or replace function public.invoke_birthday_email_cron()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  settings private.birthday_email_settings%rowtype;
  request_id bigint;
begin
  select *
  into settings
  from private.birthday_email_settings
  where singleton = true;

  if settings.endpoint_url is null or settings.cron_token is null then
    raise exception 'birthday_email_settings_missing';
  end if;

  select net.http_post(
    url := settings.endpoint_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-birthday-cron-token', settings.cron_token::text
    ),
    body := '{}'::jsonb
  )
  into request_id;

  return request_id;
end;
$$;

revoke all on function public.prepare_birthday_email_dispatches(text, date) from public;
revoke all on function public.finish_birthday_email_dispatch(text, uuid, boolean, text) from public;
revoke all on function public.invoke_birthday_email_cron() from public;

grant execute on function public.prepare_birthday_email_dispatches(text, date) to anon;
grant execute on function public.finish_birthday_email_dispatch(text, uuid, boolean, text) to anon;

-- PostgreSQL cron runs in UTC. Israel is UTC+3 in summer and UTC+2 in winter,
-- so both possible UTC times are invoked. The API route sends only during the
-- 09:30 Israel-time window and the dispatch table prevents duplicate emails.
do $$
declare
  existing_job record;
begin
  for existing_job in
    select jobid
    from cron.job
    where jobname in (
      'circles-birthday-emails-israel-summer',
      'circles-birthday-emails-israel-winter'
    )
  loop
    perform cron.unschedule(existing_job.jobid);
  end loop;
end;
$$;

select cron.schedule(
  'circles-birthday-emails-israel-summer',
  '30 6 * * *',
  'select public.invoke_birthday_email_cron();'
);

select cron.schedule(
  'circles-birthday-emails-israel-winter',
  '30 7 * * *',
  'select public.invoke_birthday_email_cron();'
);
