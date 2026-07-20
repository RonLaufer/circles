-- Circles phase 13: optional profile city and phone fields

alter table public.profiles
  add column if not exists city text not null default '',
  add column if not exists phone text not null default '';

comment on column public.profiles.city is
  'Optional city of residence, visible to users who may read the profile.';

comment on column public.profiles.phone is
  'Optional phone number, visible to users who may read the profile and used for WhatsApp links.';
