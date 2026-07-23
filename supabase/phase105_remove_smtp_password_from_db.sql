-- Circles phase 105
-- מחיקת סיסמת ה-SMTP ממסד הנתונים.
-- מעכשיו הסיסמה נקראת רק ממשתנה הסביבה SMTP_APP_PASSWORD ב-Vercel.

alter table if exists public.system_email_settings
  drop column if exists smtp_app_password;
