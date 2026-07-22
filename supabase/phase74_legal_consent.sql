-- Circles phase 74: user acceptance of terms of use and privacy policy

alter table public.profiles
  add column if not exists legal_accepted_at timestamptz,
  add column if not exists legal_version text;

comment on column public.profiles.legal_accepted_at is
  'The date and time when the user accepted the terms of use and privacy policy.';

comment on column public.profiles.legal_version is
  'The accepted version of the terms of use and privacy policy.';
