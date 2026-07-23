# Circles

מערכת רב־מעגלית לניהול מעגלים, אירועים ופרופילים אישיים.

## עבודה מקומית

```bash
npm install
npm run dev
```

האתר המקומי זמין ב־`http://localhost:3000`.

## Supabase

לפני שימוש במסך הפרופיל יש להריץ ב־Supabase SQL Editor את:

`supabase/phase3_initial_community_schema.sql`

הקובץ יוצר את טבלאות הפרופילים, המעגלים והחברים בהם, כולל RLS והרשאות בסיסיות.


גרסת ממשק נוכחית: `v1.1.1.9`.


להפעלת העלאת תמונות יש להריץ גם את:

`supabase/phase7_image_storage.sql`


להפעלת הגדרת אישור משתמשים בכל מעגל יש להריץ גם את:

`supabase/phase8_circle_approval_setting.sql`


להוספת עיר מגורים וטלפון אופציונליים לפרופיל יש להריץ גם את:

`supabase/phase13_profile_contact_fields.sql`


## שליחת מיילים

מודול המיילים שולח דרך Gmail SMTP מהכתובת הקבועה `dont.reply@analysis.co.il`.

ב־Vercel יש להגדיר את משתנה השרת `SMTP_APP_PASSWORD` עם סיסמת האפליקציה של `dont.reply@analysis.co.il`.

יש להריץ את `supabase/phase105_remove_smtp_password_from_db.sql` כדי למחוק את שדה הסיסמה ממסד הנתונים.


## שיחות באירועים

להפעלת נושאי השיחה „חיפוש טרמפ” ו„הצעת טרמפ” יש להריץ את `supabase/phase119_event_conversations.sql`.
