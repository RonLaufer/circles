-- Circles phase 182:
-- Keep the UI and database permissions aligned for the system administrator.
-- The UI already allows the system administrator to manage the ride table even
-- without a personal going/maybe attendance record. These permissive policies
-- provide the matching RLS override in PostgreSQL.

begin;

drop policy if exists "event_ride_requests_system_admin_all"
  on public.event_ride_requests;

create policy "event_ride_requests_system_admin_all"
on public.event_ride_requests
for all
to authenticated
using (public.is_system_admin())
with check (public.is_system_admin());

drop policy if exists "event_ride_offers_system_admin_all"
  on public.event_ride_offers;

create policy "event_ride_offers_system_admin_all"
on public.event_ride_offers
for all
to authenticated
using (public.is_system_admin())
with check (public.is_system_admin());

commit;
