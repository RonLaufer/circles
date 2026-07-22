-- Circles phase 39: optional notes for items users bring

alter table public.event_bring_contributions
  add column if not exists note text not null default '';

alter table public.event_bring_contributions
  drop constraint if exists event_bring_contributions_note_length;

alter table public.event_bring_contributions
  add constraint event_bring_contributions_note_length
  check (char_length(note) <= 300);
