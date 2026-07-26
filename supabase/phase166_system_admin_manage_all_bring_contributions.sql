-- Circles phase 166: allow the system administrator to manage every existing bring contribution.

-- PostgreSQL RLS policies are permissive by default, so these policies are added
-- alongside the existing self-service policies without changing member behavior.

drop policy if exists "event_bring_contributions_update_system_admin"
  on public.event_bring_contributions;
create policy "event_bring_contributions_update_system_admin"
on public.event_bring_contributions
for update
to authenticated
using (public.is_system_admin())
with check (public.is_system_admin());

drop policy if exists "event_bring_contributions_delete_system_admin"
  on public.event_bring_contributions;
create policy "event_bring_contributions_delete_system_admin"
on public.event_bring_contributions
for delete
to authenticated
using (public.is_system_admin());
