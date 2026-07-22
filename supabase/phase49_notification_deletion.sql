-- Circles phase 49: allow users to delete their own notifications

alter table public.notifications enable row level security;

drop policy if exists "notifications_delete_self" on public.notifications;
create policy "notifications_delete_self"
on public.notifications
for delete
to authenticated
using (user_id = auth.uid());

grant delete on table public.notifications to authenticated;
