-- Circles phase 171: collect significant user actions and show them as free text
-- in the same completed usage-session row.

create table if not exists public.user_usage_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  action_text text not null check (char_length(trim(action_text)) between 1 and 1000),
  occurred_at timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists user_usage_actions_user_occurred_idx
  on public.user_usage_actions (user_id, occurred_at);

alter table public.user_usage_actions enable row level security;
revoke all on table public.user_usage_actions from anon, authenticated;

create or replace function public.usage_action_status_label(target_status text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case target_status
    when 'going' then 'מגיע/ה'
    when 'maybe' then 'אולי'
    when 'not_going' then 'לא מגיע/ה'
    when 'arrived' then 'הגיע/ה בפועל'
    when 'not_arrived' then 'לא הגיע/ה בפועל'
    else coalesce(nullif(trim(target_status), ''), 'ללא סטטוס')
  end;
$$;

create or replace function public.usage_action_profile_name(target_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(nullif(trim(profile.full_name), ''), 'משתמש')
  from public.profiles profile
  where profile.id = target_user_id;
$$;

create or replace function public.usage_action_community_name(target_community_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(nullif(trim(community.name), ''), 'מעגל')
  from public.communities community
  where community.id = target_community_id;
$$;

create or replace function public.usage_action_event_title(target_event_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(nullif(trim(event.title), ''), 'אירוע')
  from public.community_events event
  where event.id = target_event_id;
$$;

-- Internal helper. It is intentionally not granted to authenticated users, so
-- users cannot forge their own log text. Only the security-definer audit trigger
-- calls it after a successful database change.
create or replace function public.append_usage_action_internal(
  target_user_id uuid,
  target_action_text text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  action_at timestamptz := clock_timestamp();
  clean_action text := left(trim(coalesce(target_action_text, '')), 1000);
  normalized_email text;
begin
  if target_user_id is null or clean_action = '' then
    return;
  end if;

  select lower(trim(coalesce(profile.email, '')))
    into normalized_email
  from public.profiles profile
  where profile.id = target_user_id;

  if normalized_email is null or normalized_email in (
    'laufer.ron@gmail.com',
    'support@analysis.co.il',
    'ron@analysis.co.il',
    'business.imc.il@gmail.com',
    'dont.reply@analysis.co.il'
  ) then
    return;
  end if;

  -- Make sure this action belongs to the current active usage segment. This
  -- also finalizes other users whose heartbeat has been silent for 45 seconds.
  perform public.touch_user_presence();

  update public.user_active_usage_sessions active_session
  set
    last_heartbeat_at = action_at,
    updated_at = action_at
  where active_session.user_id = target_user_id;

  -- Prevent accidental duplicate audit triggers from repeating identical text.
  if exists (
    select 1
    from public.user_usage_actions recent_action
    where recent_action.user_id = target_user_id
      and recent_action.action_text = clean_action
      and recent_action.occurred_at >= action_at - interval '3 seconds'
  ) then
    return;
  end if;

  insert into public.user_usage_actions (user_id, action_text, occurred_at, created_at)
  values (target_user_id, clean_action, action_at, action_at);
end;
$$;

create or replace function public.audit_significant_user_action()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  old_row jsonb := '{}'::jsonb;
  new_row jsonb := '{}'::jsonb;
  action_text text := '';
  parts text[] := array[]::text[];
  event_id uuid;
  community_id uuid;
  target_user_id uuid;
  event_title text;
  community_name text;
  target_name text;
  item_name text;
  request_owner_id uuid;
  request_owner_name text;
  media_label text;
begin
  if tg_op <> 'INSERT' then
    old_row := to_jsonb(old);
  end if;
  if tg_op <> 'DELETE' then
    new_row := to_jsonb(new);
  end if;

  if actor_id is null then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  case tg_table_name
    when 'profiles' then
      if (old_row ->> 'full_name') is distinct from (new_row ->> 'full_name')
        or (old_row ->> 'about') is distinct from (new_row ->> 'about')
        or (old_row ->> 'city') is distinct from (new_row ->> 'city')
        or (old_row ->> 'phone') is distinct from (new_row ->> 'phone')
        or (old_row ->> 'birth_day') is distinct from (new_row ->> 'birth_day')
        or (old_row ->> 'birth_month') is distinct from (new_row ->> 'birth_month')
        or (old_row ->> 'birth_year') is distinct from (new_row ->> 'birth_year')
        or (old_row ->> 'avatar_url') is distinct from (new_row ->> 'avatar_url')
      then
        target_user_id := (new_row ->> 'id')::uuid;
        target_name := coalesce(public.usage_action_profile_name(target_user_id), 'משתמש');
        if target_user_id = actor_id then
          action_text := 'עדכן את הפרטים באזור האישי';
        else
          action_text := format('עדכן את הפרטים האישיים של %s', target_name);
        end if;
      end if;

    when 'communities' then
      if tg_op = 'INSERT' then
        action_text := format('יצר את המעגל "%s"', coalesce(new_row ->> 'name', 'מעגל'));
      elsif tg_op = 'DELETE' then
        action_text := format('מחק את המעגל "%s"', coalesce(old_row ->> 'name', 'מעגל'));
      else
        community_name := coalesce(new_row ->> 'name', old_row ->> 'name', 'מעגל');
        if (old_row ->> 'name') is distinct from (new_row ->> 'name') then
          parts := array_append(parts, format('שינה את שם המעגל ל־"%s"', new_row ->> 'name'));
        end if;
        if (old_row ->> 'description') is distinct from (new_row ->> 'description') then
          parts := array_append(parts, format('שינה את תיאור המעגל "%s"', community_name));
        end if;
        if (old_row ->> 'logo_url') is distinct from (new_row ->> 'logo_url') then
          parts := array_append(parts, format('שינה את תמונת המעגל "%s"', community_name));
        end if;
        if (old_row ->> 'video_url') is distinct from (new_row ->> 'video_url') then
          parts := array_append(parts, format('שינה את סרטון המעגל "%s"', community_name));
        end if;
        if (old_row ->> 'requires_member_approval') is distinct from (new_row ->> 'requires_member_approval') then
          parts := array_append(parts, format('שינה את הגדרת אישור ההצטרפות למעגל "%s"', community_name));
        end if;
        if array_length(parts, 1) is null and old_row is distinct from new_row then
          parts := array_append(parts, format('עדכן את הגדרות המעגל "%s"', community_name));
        end if;
        action_text := array_to_string(parts, '; ');
      end if;

    when 'community_members' then
      community_id := coalesce((new_row ->> 'community_id')::uuid, (old_row ->> 'community_id')::uuid);
      target_user_id := coalesce((new_row ->> 'user_id')::uuid, (old_row ->> 'user_id')::uuid);
      community_name := coalesce(public.usage_action_community_name(community_id), 'מעגל');
      target_name := coalesce(public.usage_action_profile_name(target_user_id), 'משתמש');
      if tg_op = 'INSERT' then
        if target_user_id = actor_id then
          action_text := format('הצטרף למעגל "%s"', community_name);
        else
          action_text := format('הוסיף את %s למעגל "%s"', target_name, community_name);
        end if;
      elsif tg_op = 'DELETE' then
        if target_user_id = actor_id then
          action_text := format('עזב את המעגל "%s"', community_name);
        else
          action_text := format('הסיר את %s מהמעגל "%s"', target_name, community_name);
        end if;
      elsif (old_row ->> 'role') is distinct from (new_row ->> 'role') then
        action_text := format(
          'שינה את התפקיד של %s במעגל "%s" ל־%s',
          target_name,
          community_name,
          case new_row ->> 'role' when 'admin' then 'מנהל/ת' else 'חבר/ה' end
        );
      end if;

    when 'community_join_requests' then
      community_id := coalesce((new_row ->> 'community_id')::uuid, (old_row ->> 'community_id')::uuid);
      target_user_id := coalesce((new_row ->> 'user_id')::uuid, (old_row ->> 'user_id')::uuid);
      community_name := coalesce(public.usage_action_community_name(community_id), 'מעגל');
      target_name := coalesce(public.usage_action_profile_name(target_user_id), 'משתמש');
      if tg_op = 'INSERT' then
        action_text := format('שלח בקשת הצטרפות למעגל "%s"', community_name);
      elsif tg_op = 'UPDATE' and (old_row ->> 'status') is distinct from (new_row ->> 'status') then
        action_text := format(
          '%s את בקשת ההצטרפות של %s למעגל "%s"',
          case new_row ->> 'status' when 'approved' then 'אישר' when 'rejected' then 'דחה' else 'עדכן' end,
          target_name,
          community_name
        );
      elsif tg_op = 'DELETE' and target_user_id = actor_id then
        action_text := format('ביטל בקשת הצטרפות למעגל "%s"', community_name);
      end if;

    when 'community_events' then
      event_title := coalesce(new_row ->> 'title', old_row ->> 'title', 'אירוע');
      if tg_op = 'INSERT' then
        action_text := format('יצר את האירוע "%s"', event_title);
      elsif tg_op = 'DELETE' then
        action_text := format('מחק את האירוע "%s"', event_title);
      else
        if (old_row ->> 'title') is distinct from (new_row ->> 'title') then
          parts := array_append(parts, format('שינה את שם האירוע ל־"%s"', new_row ->> 'title'));
        end if;
        if (old_row ->> 'description') is distinct from (new_row ->> 'description') then
          parts := array_append(parts, format('שינה את תיאור האירוע "%s"', event_title));
        end if;
        if (old_row ->> 'location') is distinct from (new_row ->> 'location') then
          parts := array_append(parts, format('שינה את מיקום האירוע "%s"', event_title));
        end if;
        if (old_row ->> 'starts_at') is distinct from (new_row ->> 'starts_at')
          or (old_row ->> 'ends_at') is distinct from (new_row ->> 'ends_at')
        then
          parts := array_append(parts, format('שינה את מועד האירוע "%s"', event_title));
        end if;
        if (old_row ->> 'image_url') is distinct from (new_row ->> 'image_url') then
          parts := array_append(parts, format('שינה את תמונת האירוע "%s"', event_title));
        end if;
        if (old_row ->> 'participant_limit') is distinct from (new_row ->> 'participant_limit') then
          parts := array_append(parts, format('שינה את מגבלת המשתתפים באירוע "%s"', event_title));
        end if;
        if (old_row ->> 'bring_mode') is distinct from (new_row ->> 'bring_mode') then
          parts := array_append(parts, format('שינה את הגדרות "מה כל אחד מביא" באירוע "%s"', event_title));
        end if;
        if (old_row ->> 'status') is distinct from (new_row ->> 'status') then
          parts := array_append(parts, format(
            '%s את האירוע "%s"',
            case new_row ->> 'status' when 'cancelled' then 'ביטל' else 'פתח מחדש' end,
            event_title
          ));
        end if;
        if array_length(parts, 1) is null and old_row is distinct from new_row then
          parts := array_append(parts, format('עדכן את האירוע "%s"', event_title));
        end if;
        action_text := array_to_string(parts, '; ');
      end if;

    when 'event_attendance' then
      event_id := coalesce((new_row ->> 'event_id')::uuid, (old_row ->> 'event_id')::uuid);
      target_user_id := coalesce((new_row ->> 'user_id')::uuid, (old_row ->> 'user_id')::uuid);
      event_title := coalesce(public.usage_action_event_title(event_id), 'אירוע');
      target_name := coalesce(public.usage_action_profile_name(target_user_id), 'משתמש');
      if tg_op = 'INSERT' then
        if target_user_id = actor_id then
          action_text := format(
            'נרשם לאירוע "%s" כ־%s',
            event_title,
            public.usage_action_status_label(new_row ->> 'status')
          );
        else
          action_text := format(
            'רשם את %s לאירוע "%s" כ־%s',
            target_name,
            event_title,
            public.usage_action_status_label(new_row ->> 'status')
          );
        end if;
      elsif tg_op = 'DELETE' then
        if target_user_id = actor_id then
          action_text := format('מחק את הרשמתו לאירוע "%s"', event_title);
        else
          action_text := format('מחק את ההרשמה של %s לאירוע "%s"', target_name, event_title);
        end if;
      else
        if (old_row ->> 'status') is distinct from (new_row ->> 'status') then
          if target_user_id = actor_id then
            parts := array_append(parts, format(
              'שינה את הרשמתו לאירוע "%s" ל־%s',
              event_title,
              public.usage_action_status_label(new_row ->> 'status')
            ));
          else
            parts := array_append(parts, format(
              'שינה את הרשמת %s לאירוע "%s" ל־%s',
              target_name,
              event_title,
              public.usage_action_status_label(new_row ->> 'status')
            ));
          end if;
        end if;
        if (old_row ->> 'note') is distinct from (new_row ->> 'note') then
          parts := array_append(parts, format('עדכן הערת הרשמה לאירוע "%s"', event_title));
        end if;
        if (old_row ->> 'actual_status') is distinct from (new_row ->> 'actual_status') then
          if nullif(new_row ->> 'actual_status', '') is null then
            parts := array_append(parts, format('איפס את סימון הנוכחות בפועל של %s באירוע "%s"', target_name, event_title));
          else
            parts := array_append(parts, format(
              'סימן את %s כ־%s באירוע "%s"',
              target_name,
              public.usage_action_status_label(new_row ->> 'actual_status'),
              event_title
            ));
          end if;
        end if;
        action_text := array_to_string(parts, '; ');
      end if;

    when 'event_bring_needs' then
      event_id := coalesce((new_row ->> 'event_id')::uuid, (old_row ->> 'event_id')::uuid);
      event_title := coalesce(public.usage_action_event_title(event_id), 'אירוע');
      item_name := coalesce(new_row ->> 'item_name', old_row ->> 'item_name', 'פריט');
      action_text := case tg_op
        when 'INSERT' then format('הוסיף את הפריט המוכן מראש "%s" לאירוע "%s"', item_name, event_title)
        when 'UPDATE' then format('עדכן את הפריט המוכן מראש "%s" באירוע "%s"', item_name, event_title)
        else format('מחק את הפריט המוכן מראש "%s" מהאירוע "%s"', item_name, event_title)
      end;

    when 'event_bring_contributions' then
      event_id := coalesce((new_row ->> 'event_id')::uuid, (old_row ->> 'event_id')::uuid);
      target_user_id := coalesce((new_row ->> 'user_id')::uuid, (old_row ->> 'user_id')::uuid);
      event_title := coalesce(public.usage_action_event_title(event_id), 'אירוע');
      target_name := coalesce(public.usage_action_profile_name(target_user_id), 'משתמש');
      item_name := coalesce(new_row ->> 'item_name', old_row ->> 'item_name');
      if item_name is null and coalesce(new_row ->> 'need_id', old_row ->> 'need_id') is not null then
        select coalesce(nullif(trim(need.item_name), ''), 'פריט')
          into item_name
        from public.event_bring_needs need
        where need.id = coalesce((new_row ->> 'need_id')::uuid, (old_row ->> 'need_id')::uuid);
      end if;
      item_name := coalesce(item_name, 'פריט');
      if tg_op = 'INSERT' then
        action_text := case when target_user_id = actor_id
          then format('סימן שהוא מביא "%s" לאירוע "%s"', item_name, event_title)
          else format('סימן ש־%s מביא "%s" לאירוע "%s"', target_name, item_name, event_title)
        end;
      elsif tg_op = 'UPDATE' then
        action_text := case when target_user_id = actor_id
          then format('עדכן את הפריט "%s" שהוא מביא לאירוע "%s"', item_name, event_title)
          else format('עדכן את הפריט "%s" ש־%s מביא לאירוע "%s"', item_name, target_name, event_title)
        end;
      else
        action_text := case when target_user_id = actor_id
          then format('ביטל הבאת "%s" לאירוע "%s"', item_name, event_title)
          else format('ביטל את הבאת "%s" על ידי %s לאירוע "%s"', item_name, target_name, event_title)
        end;
      end if;

    when 'event_gallery_photos' then
      event_id := coalesce((new_row ->> 'event_id')::uuid, (old_row ->> 'event_id')::uuid);
      event_title := coalesce(public.usage_action_event_title(event_id), 'אירוע');
      media_label := case coalesce(new_row ->> 'media_type', old_row ->> 'media_type')
        when 'video' then 'סרטון'
        else 'תמונה'
      end;
      if tg_op = 'INSERT' then
        action_text := format('העלה %s לגלריה של האירוע "%s"', media_label, event_title);
      elsif tg_op = 'DELETE' then
        action_text := format('מחק %s מהגלריה של האירוע "%s"', media_label, event_title);
      elsif (old_row ->> 'is_pinned') is distinct from (new_row ->> 'is_pinned') then
        action_text := format(
          '%s %s בגלריה של האירוע "%s"',
          case new_row ->> 'is_pinned' when 'true' then 'הצמיד' else 'ביטל הצמדה של' end,
          media_label,
          event_title
        );
      end if;

    when 'event_ride_requests' then
      event_id := coalesce((new_row ->> 'event_id')::uuid, (old_row ->> 'event_id')::uuid);
      event_title := coalesce(public.usage_action_event_title(event_id), 'אירוע');
      if tg_op = 'INSERT' then
        action_text := format('ביקש טרמפ לאירוע "%s" מאזור %s', event_title, new_row ->> 'origin');
      elsif tg_op = 'UPDATE' then
        action_text := format('עדכן בקשת טרמפ לאירוע "%s" לאזור %s', event_title, new_row ->> 'origin');
      else
        action_text := format('מחק בקשת טרמפ לאירוע "%s"', event_title);
      end if;

    when 'event_ride_offers' then
      event_id := coalesce((new_row ->> 'event_id')::uuid, (old_row ->> 'event_id')::uuid);
      event_title := coalesce(public.usage_action_event_title(event_id), 'אירוע');
      select request.user_id
        into request_owner_id
      from public.event_ride_requests request
      where request.id = coalesce((new_row ->> 'request_id')::uuid, (old_row ->> 'request_id')::uuid);
      request_owner_name := coalesce(public.usage_action_profile_name(request_owner_id), 'מבקש הטרמפ');
      action_text := case tg_op
        when 'INSERT' then format('הציע טרמפ ל־%s באירוע "%s"', request_owner_name, event_title)
        when 'UPDATE' then format('עדכן הצעת טרמפ ל־%s באירוע "%s"', request_owner_name, event_title)
        else format('ביטל הצעת טרמפ ל־%s באירוע "%s"', request_owner_name, event_title)
      end;

    when 'event_conversation_messages' then
      event_id := coalesce((new_row ->> 'event_id')::uuid, (old_row ->> 'event_id')::uuid);
      event_title := coalesce(public.usage_action_event_title(event_id), 'אירוע');
      action_text := case tg_op
        when 'INSERT' then format('כתב הודעה בשיחת האירוע "%s"', event_title)
        when 'UPDATE' then format('ערך הודעה בשיחת האירוע "%s"', event_title)
        else format('מחק הודעה משיחת האירוע "%s"', event_title)
      end;
  end case;

  if trim(coalesce(action_text, '')) <> '' then
    perform public.append_usage_action_internal(actor_id, action_text);
  end if;

  if tg_op = 'DELETE' then return old; else return new; end if;
exception
  when others then
    -- The audit log must never block the user's real action.
    raise warning 'Circles usage action audit failed for %.%: %', tg_table_schema, tg_table_name, sqlerrm;
    if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

-- Significant user actions. Existing triggers are replaced idempotently.
drop trigger if exists profiles_usage_action_audit on public.profiles;
create trigger profiles_usage_action_audit
after update on public.profiles
for each row execute function public.audit_significant_user_action();

drop trigger if exists communities_usage_action_audit on public.communities;
create trigger communities_usage_action_audit
after insert or update or delete on public.communities
for each row execute function public.audit_significant_user_action();

drop trigger if exists community_members_usage_action_audit on public.community_members;
create trigger community_members_usage_action_audit
after insert or update or delete on public.community_members
for each row execute function public.audit_significant_user_action();

drop trigger if exists community_join_requests_usage_action_audit on public.community_join_requests;
create trigger community_join_requests_usage_action_audit
after insert or update or delete on public.community_join_requests
for each row execute function public.audit_significant_user_action();

drop trigger if exists community_events_usage_action_audit on public.community_events;
create trigger community_events_usage_action_audit
after insert or update or delete on public.community_events
for each row execute function public.audit_significant_user_action();

drop trigger if exists event_attendance_usage_action_audit on public.event_attendance;
create trigger event_attendance_usage_action_audit
after insert or update or delete on public.event_attendance
for each row execute function public.audit_significant_user_action();

drop trigger if exists event_bring_needs_usage_action_audit on public.event_bring_needs;
create trigger event_bring_needs_usage_action_audit
after insert or update or delete on public.event_bring_needs
for each row execute function public.audit_significant_user_action();

drop trigger if exists event_bring_contributions_usage_action_audit on public.event_bring_contributions;
create trigger event_bring_contributions_usage_action_audit
after insert or update or delete on public.event_bring_contributions
for each row execute function public.audit_significant_user_action();

drop trigger if exists event_gallery_photos_usage_action_audit on public.event_gallery_photos;
create trigger event_gallery_photos_usage_action_audit
after insert or update or delete on public.event_gallery_photos
for each row execute function public.audit_significant_user_action();

drop trigger if exists event_ride_requests_usage_action_audit on public.event_ride_requests;
create trigger event_ride_requests_usage_action_audit
after insert or update or delete on public.event_ride_requests
for each row execute function public.audit_significant_user_action();

drop trigger if exists event_ride_offers_usage_action_audit on public.event_ride_offers;
create trigger event_ride_offers_usage_action_audit
after insert or update or delete on public.event_ride_offers
for each row execute function public.audit_significant_user_action();

drop trigger if exists event_conversation_messages_usage_action_audit on public.event_conversation_messages;
create trigger event_conversation_messages_usage_action_audit
after insert or update or delete on public.event_conversation_messages
for each row execute function public.audit_significant_user_action();

-- Keep only the newest 100 completed usage rows and return a single free-text
-- action summary for every completed usage segment.
drop function if exists public.get_system_admin_usage_log();

create function public.get_system_admin_usage_log()
returns table (
  session_id uuid,
  user_id uuid,
  full_name text,
  community_names text[],
  duration_seconds bigint,
  started_at timestamptz,
  ended_at timestamptz,
  activity_text text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_system_admin() then
    raise exception 'System administrator access required';
  end if;

  delete from public.user_usage_sessions usage_session
  where coalesce(usage_session.duration_seconds, 0) <= 0
     or usage_session.ended_at is null;

  delete from public.user_usage_sessions usage_session
  where usage_session.id in (
    select old_session.id
    from public.user_usage_sessions old_session
    join public.profiles old_profile
      on old_profile.id = old_session.user_id
    where old_session.duration_seconds > 0
      and old_session.ended_at is not null
      and lower(trim(coalesce(old_profile.email, ''))) not in (
        'laufer.ron@gmail.com',
        'support@analysis.co.il',
        'ron@analysis.co.il',
        'business.imc.il@gmail.com',
        'dont.reply@analysis.co.il'
      )
    order by old_session.started_at desc, old_session.id desc
    offset 100
  );

  -- Remove action rows that no longer belong to one of the retained completed
  -- sessions or to a currently active segment.
  delete from public.user_usage_actions action
  where not exists (
      select 1
      from public.user_usage_sessions usage_session
      where usage_session.user_id = action.user_id
        and action.occurred_at >= usage_session.started_at
        and action.occurred_at <= usage_session.ended_at + interval '1 second'
    )
    and not exists (
      select 1
      from public.user_active_usage_sessions active_session
      where active_session.user_id = action.user_id
        and action.occurred_at >= active_session.started_at
    );

  return query
  select
    usage_session.id as session_id,
    profile.id as user_id,
    coalesce(nullif(trim(profile.full_name), ''), 'משתמש') as full_name,
    coalesce(member_circles.community_names, array[]::text[]) as community_names,
    usage_session.duration_seconds,
    usage_session.started_at,
    usage_session.ended_at,
    coalesce(session_actions.activity_text, '') as activity_text
  from public.user_usage_sessions usage_session
  join public.profiles profile
    on profile.id = usage_session.user_id
  left join lateral (
    select array_agg(distinct community.name order by community.name) as community_names
    from public.community_members member
    join public.communities community
      on community.id = member.community_id
    where member.user_id = profile.id
  ) member_circles on true
  left join lateral (
    select string_agg(action.action_text, ' · ' order by action.occurred_at, action.id) as activity_text
    from public.user_usage_actions action
    where action.user_id = usage_session.user_id
      and action.occurred_at >= usage_session.started_at
      and action.occurred_at <= usage_session.ended_at + interval '1 second'
  ) session_actions on true
  where usage_session.duration_seconds > 0
    and usage_session.ended_at is not null
    and lower(trim(coalesce(profile.email, ''))) not in (
      'laufer.ron@gmail.com',
      'support@analysis.co.il',
      'ron@analysis.co.il',
      'business.imc.il@gmail.com',
      'dont.reply@analysis.co.il'
    )
  order by usage_session.started_at desc, usage_session.id desc
  limit 100;
end;
$$;

revoke all on function public.usage_action_status_label(text) from public;
revoke all on function public.usage_action_profile_name(uuid) from public;
revoke all on function public.usage_action_community_name(uuid) from public;
revoke all on function public.usage_action_event_title(uuid) from public;
revoke all on function public.append_usage_action_internal(uuid, text) from public;
revoke all on function public.audit_significant_user_action() from public;
revoke all on function public.get_system_admin_usage_log() from public;

grant execute on function public.get_system_admin_usage_log() to authenticated;

comment on table public.user_usage_actions is
  'Significant actions performed during user usage segments. Actions are aggregated into free text in the system-admin usage log.';
