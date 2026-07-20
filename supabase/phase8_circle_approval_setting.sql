-- Circles phase 8: per-circle approval preference

alter table public.communities
  add column if not exists requires_member_approval boolean not null default true;

comment on column public.communities.requires_member_approval is
  'Whether new users will require approval before joining this circle. The approval workflow is not implemented yet.';
