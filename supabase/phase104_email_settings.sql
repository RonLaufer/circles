-- circles104: הגדרת סיסמת SMTP במסד הנתונים

create table if not exists public.system_email_settings (
  id smallint primary key check (id = 1),
  smtp_app_password text,
  updated_at timestamptz not null default now()
);

insert into public.system_email_settings (id, smtp_app_password)
values (1, null)
on conflict (id) do nothing;

alter table public.system_email_settings enable row level security;

-- אין מדיניות קריאה למשתמשי האפליקציה.
-- רק מפתח service_role בצד השרת יכול לקרוא את הסיסמה.
revoke all on table public.system_email_settings from anon, authenticated;

create or replace function public.touch_system_email_settings_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists system_email_settings_set_updated_at
on public.system_email_settings;

create trigger system_email_settings_set_updated_at
before update on public.system_email_settings
for each row
execute function public.touch_system_email_settings_updated_at();

-- לאחר ההרצה יש לעדכן ידנית את השדה smtp_app_password בשורה id = 1.
-- לדוגמה, דרך Table Editor של Supabase.
