-- Circles phase 190
-- Removes the one-hour delay from event return summaries.
-- Safe to run after phase 189 and also includes the supporting table setup.

-- Circles phase 189: one return-summary notification per relevant event.
-- A relevant event is one where the current user is registered as going or maybe.
-- Counts are compared with the previous checkpoint; only positive differences are shown.

create table if not exists public.event_return_summary_snapshots (
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_id uuid not null references public.community_events(id) on delete cascade,
  participant_count integer not null default 0 check (participant_count >= 0),
  bring_contribution_count integer not null default 0 check (bring_contribution_count >= 0),
  ride_request_count integer not null default 0 check (ride_request_count >= 0),
  conversation_message_count integer not null default 0 check (conversation_message_count >= 0),
  gallery_image_count integer not null default 0 check (gallery_image_count >= 0),
  gallery_video_count integer not null default 0 check (gallery_video_count >= 0),
  checked_at timestamptz not null default now(),
  primary key (user_id, event_id)
);

create index if not exists event_return_summary_snapshots_user_checked_idx
  on public.event_return_summary_snapshots(user_id, checked_at);

alter table public.event_return_summary_snapshots enable row level security;
revoke all on table public.event_return_summary_snapshots from anon;
revoke all on table public.event_return_summary_snapshots from authenticated;

-- Establish a baseline for existing users so the first future summary compares
-- against the state at deployment time instead of reporting all historical data.
insert into public.event_return_summary_snapshots (
  user_id,
  event_id,
  participant_count,
  bring_contribution_count,
  ride_request_count,
  conversation_message_count,
  gallery_image_count,
  gallery_video_count,
  checked_at
)
select
  own_attendance.user_id,
  own_attendance.event_id,
  (
    select count(*)::integer
    from public.event_attendance participant
    where participant.event_id = own_attendance.event_id
      and participant.status in ('going', 'maybe')
  ),
  (
    select count(*)::integer
    from public.event_bring_contributions contribution
    where contribution.event_id = own_attendance.event_id
  ),
  (
    select count(*)::integer
    from public.event_ride_requests request
    where request.event_id = own_attendance.event_id
  ),
  (
    select count(*)::integer
    from public.event_conversation_messages message
    where message.event_id = own_attendance.event_id
  ),
  (
    select count(*)::integer
    from public.event_gallery_photos photo
    where photo.event_id = own_attendance.event_id
      and photo.media_type = 'image'
  ),
  (
    select count(*)::integer
    from public.event_gallery_photos video
    where video.event_id = own_attendance.event_id
      and video.media_type = 'video'
  ),
  now()
from public.event_attendance own_attendance
join public.community_events baseline_event
  on baseline_event.id = own_attendance.event_id
where own_attendance.status in ('going', 'maybe')
  and baseline_event.status = 'active'
on conflict (user_id, event_id) do nothing;

create or replace function public.prepare_event_return_summaries()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  summary_now timestamptz := now();
  event_row record;
  snapshot_row public.event_return_summary_snapshots%rowtype;
  inserted_rows integer;
  participant_delta integer;
  bring_delta integer;
  ride_delta integer;
  message_delta integer;
  image_delta integer;
  video_delta integer;
  summary_parts text[];
  summary_body text;
  created_notifications integer := 0;
begin
  if current_user_id is null then
    raise exception 'authentication_required';
  end if;

  -- A user who is no longer going/maybe should no longer receive summaries
  -- for that event. If they become eligible again, a fresh baseline is created.
  delete from public.event_return_summary_snapshots snapshot
  where snapshot.user_id = current_user_id
    and not exists (
      select 1
      from public.event_attendance own_attendance
      join public.community_events active_event
        on active_event.id = own_attendance.event_id
      where own_attendance.user_id = current_user_id
        and own_attendance.event_id = snapshot.event_id
        and own_attendance.status in ('going', 'maybe')
        and active_event.status = 'active'
    );

  for event_row in
    select
      event.id as event_id,
      event.community_id,
      event.title,
      (
        select count(*)::integer
        from public.event_attendance participant
        where participant.event_id = event.id
          and participant.status in ('going', 'maybe')
      ) as participant_count,
      (
        select count(*)::integer
        from public.event_bring_contributions contribution
        where contribution.event_id = event.id
      ) as bring_contribution_count,
      (
        select count(*)::integer
        from public.event_ride_requests request
        where request.event_id = event.id
      ) as ride_request_count,
      (
        select count(*)::integer
        from public.event_conversation_messages message
        where message.event_id = event.id
      ) as conversation_message_count,
      (
        select count(*)::integer
        from public.event_gallery_photos photo
        where photo.event_id = event.id
          and photo.media_type = 'image'
      ) as gallery_image_count,
      (
        select count(*)::integer
        from public.event_gallery_photos video
        where video.event_id = event.id
          and video.media_type = 'video'
      ) as gallery_video_count
    from public.event_attendance own_attendance
    join public.community_events event
      on event.id = own_attendance.event_id
    where own_attendance.user_id = current_user_id
      and own_attendance.status in ('going', 'maybe')
      and event.status = 'active'
  loop
    insert into public.event_return_summary_snapshots (
      user_id,
      event_id,
      participant_count,
      bring_contribution_count,
      ride_request_count,
      conversation_message_count,
      gallery_image_count,
      gallery_video_count,
      checked_at
    )
    values (
      current_user_id,
      event_row.event_id,
      event_row.participant_count,
      event_row.bring_contribution_count,
      event_row.ride_request_count,
      event_row.conversation_message_count,
      event_row.gallery_image_count,
      event_row.gallery_video_count,
      summary_now
    )
    on conflict (user_id, event_id) do nothing;

    get diagnostics inserted_rows = row_count;
    if inserted_rows = 1 then
      continue;
    end if;

    select snapshot.*
      into snapshot_row
    from public.event_return_summary_snapshots snapshot
    where snapshot.user_id = current_user_id
      and snapshot.event_id = event_row.event_id
    for update;

    -- Check on every entry or refresh. The snapshot is updated after each check,
    -- so the same additions are not reported twice.

    participant_delta := greatest(event_row.participant_count - snapshot_row.participant_count, 0);
    bring_delta := greatest(event_row.bring_contribution_count - snapshot_row.bring_contribution_count, 0);
    ride_delta := greatest(event_row.ride_request_count - snapshot_row.ride_request_count, 0);
    message_delta := greatest(event_row.conversation_message_count - snapshot_row.conversation_message_count, 0);
    image_delta := greatest(event_row.gallery_image_count - snapshot_row.gallery_image_count, 0);
    video_delta := greatest(event_row.gallery_video_count - snapshot_row.gallery_video_count, 0);

    summary_parts := array[]::text[];

    if participant_delta = 1 then
      summary_parts := array_append(summary_parts, 'נוסף משתתף אחד');
    elsif participant_delta > 1 then
      summary_parts := array_append(summary_parts, 'נוספו ' || participant_delta || ' משתתפים');
    end if;

    if bring_delta = 1 then
      summary_parts := array_append(summary_parts, 'נוסף פריט אחד ב„מה כל אחד מביא”');
    elsif bring_delta > 1 then
      summary_parts := array_append(summary_parts, 'נוספו ' || bring_delta || ' פריטים ב„מה כל אחד מביא”');
    end if;

    if ride_delta = 1 then
      summary_parts := array_append(summary_parts, 'נוספה בקשת טרמפ אחת');
    elsif ride_delta > 1 then
      summary_parts := array_append(summary_parts, 'נוספו ' || ride_delta || ' בקשות לטרמפים');
    end if;

    if message_delta = 1 then
      summary_parts := array_append(summary_parts, 'נכתבה שורה אחת בשיחה');
    elsif message_delta > 1 then
      summary_parts := array_append(summary_parts, 'נכתבו ' || message_delta || ' שורות בשיחה');
    end if;

    if image_delta = 1 then
      summary_parts := array_append(summary_parts, 'נוספה תמונה אחת לגלריה');
    elsif image_delta > 1 then
      summary_parts := array_append(summary_parts, 'נוספו ' || image_delta || ' תמונות לגלריה');
    end if;

    if video_delta = 1 then
      summary_parts := array_append(summary_parts, 'נוסף סרטון אחד לגלריה');
    elsif video_delta > 1 then
      summary_parts := array_append(summary_parts, 'נוספו ' || video_delta || ' סרטונים לגלריה');
    end if;

    if cardinality(summary_parts) > 0 then
      summary_body := 'מאז הכניסה האחרונה: ' || array_to_string(summary_parts, ' · ');

      insert into public.notifications (
        user_id,
        community_id,
        event_id,
        type,
        title,
        body,
        created_at
      )
      values (
        current_user_id,
        event_row.community_id,
        event_row.event_id,
        'event_return_summary',
        'מה חדש באירוע „' || coalesce(event_row.title, 'אירוע') || '”',
        summary_body,
        summary_now
      );

      created_notifications := created_notifications + 1;
    end if;

    update public.event_return_summary_snapshots snapshot
    set participant_count = event_row.participant_count,
        bring_contribution_count = event_row.bring_contribution_count,
        ride_request_count = event_row.ride_request_count,
        conversation_message_count = event_row.conversation_message_count,
        gallery_image_count = event_row.gallery_image_count,
        gallery_video_count = event_row.gallery_video_count,
        checked_at = summary_now
    where snapshot.user_id = current_user_id
      and snapshot.event_id = event_row.event_id;
  end loop;

  return created_notifications;
end;
$$;

revoke all on function public.prepare_event_return_summaries() from public;
grant execute on function public.prepare_event_return_summaries() to authenticated;
