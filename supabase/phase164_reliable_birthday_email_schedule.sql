-- Circles phase 164: make birthday emails reliable and retry during the morning window.
-- Deploy circles164 before running this script so the endpoint accepts primary SMTP alone.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- Keep the production endpoint current.
update private.birthday_email_settings
set endpoint_url = 'https://circles-community.vercel.app/api/cron/birthdays',
    updated_at = now()
where singleton = true;

-- Remove every previous Circles birthday schedule so only the reliable retry job remains.
do $$
declare
  existing_job record;
begin
  for existing_job in
    select jobid
    from cron.job
    where jobname in (
      'circles-birthday-emails-israel-summer',
      'circles-birthday-emails-israel-winter',
      'circles-birthday-emails-israel-retry'
    )
  loop
    perform cron.unschedule(existing_job.jobid);
  end loop;
end;
$$;

-- pg_cron runs in UTC. Calling every five minutes from 06:00 through 08:59 UTC
-- covers 09:00-11:59 in Israeli summer and 08:00-10:59 in Israeli winter.
-- The API itself accepts only 09:20-10:45 Israel time, and dispatch deduplication
-- prevents duplicate emails. This provides automatic retries after transient failures.
select cron.schedule(
  'circles-birthday-emails-israel-retry',
  '*/5 6-8 * * *',
  'select public.invoke_birthday_email_cron();'
);

-- Try immediately as well. If the script is run inside the Israel send window,
-- today's birthday reminder is processed without waiting for the next five-minute tick.
select public.invoke_birthday_email_cron() as immediate_request_id;

-- Verification: the birthday retry job should appear active below.
select jobid, jobname, schedule, active
from cron.job
where jobname = 'circles-birthday-emails-israel-retry';
