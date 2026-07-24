-- Circles phase 130: optional profile birth date with optional year

alter table public.profiles
  add column if not exists birth_day smallint,
  add column if not exists birth_month smallint,
  add column if not exists birth_year smallint;

alter table public.profiles
  drop constraint if exists profiles_birth_day_range,
  drop constraint if exists profiles_birth_month_range,
  drop constraint if exists profiles_birth_year_range,
  drop constraint if exists profiles_birth_day_month_pair;

alter table public.profiles
  add constraint profiles_birth_day_range
    check (birth_day is null or birth_day between 1 and 31),
  add constraint profiles_birth_month_range
    check (birth_month is null or birth_month between 1 and 12),
  add constraint profiles_birth_year_range
    check (birth_year is null or birth_year between 1900 and 2100),
  add constraint profiles_birth_day_month_pair
    check ((birth_day is null and birth_month is null) or (birth_day is not null and birth_month is not null));

comment on column public.profiles.birth_day is
  'Optional day of birth, used together with birth_month for birthday reminders.';

comment on column public.profiles.birth_month is
  'Optional month of birth, used together with birth_day for birthday reminders.';

comment on column public.profiles.birth_year is
  'Optional year of birth. May remain null when the user shares only day and month.';
