-- Circles phase 120: add the general event conversation as the first topic.
-- Message update/delete permissions already exist from phase119; this script keeps
-- the default topics consistent for existing and future events.

create or replace function public.ensure_default_event_conversation_topics()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.event_conversation_topics (event_id, slug, title, sort_order)
  values
    (new.id, 'general', 'כללי', 0),
    (new.id, 'ride_request', 'חיפוש טרמפ', 10),
    (new.id, 'ride_offer', 'הצעת טרמפים', 20)
  on conflict (event_id, slug) do update
  set title = excluded.title,
      sort_order = excluded.sort_order;

  return new;
end;
$$;

insert into public.event_conversation_topics (event_id, slug, title, sort_order)
select event.id, topic.slug, topic.title, topic.sort_order
from public.community_events event
cross join (
  values
    ('general'::text, 'כללי'::text, 0),
    ('ride_request'::text, 'חיפוש טרמפ'::text, 10),
    ('ride_offer'::text, 'הצעת טרמפים'::text, 20)
) as topic(slug, title, sort_order)
on conflict (event_id, slug) do update
set title = excluded.title,
    sort_order = excluded.sort_order;
