"use client";
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { RichText } from "@/app/components/RichText";
import {
  CompressedVideoTooLargeError,
  compressVideo,
  isSupportedVideoFile,
} from "@/lib/video-compression";

type Profile = {
  id: string;
  email: string | null;
  full_name: string;
  about: string;
  city: string;
  phone: string;
  birth_day: number | null;
  birth_month: number | null;
  birth_year: number | null;
  avatar_url: string | null;
  google_avatar_url: string | null;
  legal_accepted_at: string | null;
  legal_version: string | null;
};

type CommunityRole = "owner" | "admin" | "member";

const APP_VERSION = "v1.1.4.0";
const SOFTWARE_ICON_IMAGE = "/circles-logo.png";
const SYSTEM_ADMIN_EMAIL = "laufer.ron@gmail.com";
const LEGAL_VERSION = "2026-07-22";
const PRODUCTION_ORIGIN = "https://circles-community.vercel.app";
const DEFAULT_IMAGE_MAX_BYTES = 1 * 1024 * 1024;
const MAX_IMAGE_EDGE = 1800;
const DEFAULT_GALLERY_IMAGE_LIMIT = 100;
const DEFAULT_GALLERY_IMAGE_MAX_MB = 1;
const DEFAULT_GALLERY_VIDEO_LIMIT = 3;
const DEFAULT_GALLERY_VIDEO_MAX_MB = 20;
const MAX_COMMUNITY_VIDEO_BYTES = 20 * 1024 * 1024;

const MEDIA_LIMITS = {
  imageCountMin: 0,
  imageCountMax: 1000,
  imageMaxMbMin: 0.1,
  imageMaxMbMax: 20,
  videoCountMin: 0,
  videoCountMax: 20,
  videoMaxMbMin: 1,
  videoMaxMbMax: 200,
} as const;

type MediaDefaults = {
  default_gallery_image_limit: number;
  default_gallery_image_max_mb: number;
  default_gallery_video_limit: number;
  default_gallery_video_max_mb: number;
};

const FALLBACK_MEDIA_DEFAULTS: MediaDefaults = {
  default_gallery_image_limit: DEFAULT_GALLERY_IMAGE_LIMIT,
  default_gallery_image_max_mb: DEFAULT_GALLERY_IMAGE_MAX_MB,
  default_gallery_video_limit: DEFAULT_GALLERY_VIDEO_LIMIT,
  default_gallery_video_max_mb: DEFAULT_GALLERY_VIDEO_MAX_MB,
};

type SelectedImage = {
  blob: Blob;
  previewUrl: string;
};

type ProfileCropTarget = "profile" | "admin";

type ProfileCropRequest = {
  target: ProfileCropTarget;
  sourceUrl: string;
  originalBytes: number;
  personName: string;
};

class CompressedImageTooLargeError extends Error {
  beforeBytes: number;
  afterBytes: number;
  maxBytes: number;

  constructor(beforeBytes: number, afterBytes: number, maxBytes: number) {
    super("compressed_image_too_large");
    this.name = "CompressedImageTooLargeError";
    this.beforeBytes = beforeBytes;
    this.afterBytes = afterBytes;
    this.maxBytes = maxBytes;
  }
}

function formatMegabytes(bytes: number) {
  return (bytes / (1024 * 1024)).toFixed(2);
}

function megabytesToBytes(megabytes: number) {
  return Math.round(megabytes * 1024 * 1024);
}

function formatCompressedImageTooLarge(error: CompressedImageTooLargeError) {
  return `גודל התמונה המקורית הוא ${formatMegabytes(error.beforeBytes)} מגה. לאחר כיווץ גודלה ${formatMegabytes(error.afterBytes)} מגה. לא ניתן להעלות תמונה מכווצת שגודלה מעל ${formatMegabytes(error.maxBytes)} מגה.`;
}

function formatCompressedVideoTooLarge(error: CompressedVideoTooLargeError) {
  return `גודל הסרטון המקורי הוא ${formatMegabytes(error.beforeBytes)} מגה. לאחר כיווץ גודלו ${formatMegabytes(error.afterBytes)} מגה. לא ניתן להעלות סרטון מכווץ שגודלו מעל ${formatMegabytes(error.maxBytes)} מגה.`;
}

type SelectedVideo = {
  file: File;
  previewUrl: string;
};

type VideoProcessNotice = {
  text: string;
  progress: number | null;
  tone: "info" | "success" | "error";
};

type Community = {
  id: string;
  name: string;
  description: string;
  logo_url: string | null;
  video_url: string | null;
  requires_member_approval: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  share_token: string;
  role: CommunityRole;
  is_member: boolean;
  manager_names: string[];
};

type SharedCommunity = {
  id: string;
  name: string;
  description: string;
  logo_url: string | null;
  requires_member_approval: boolean;
  share_token: string;
};

type SharedEvent = {
  id: string;
  community_id: string;
  title: string;
  description: string;
  location: string;
  starts_at: string;
  ends_at: string | null;
  image_url: string | null;
  participant_limit: number | null;
  share_token: string;
  status: "active" | "cancelled";
  community_name: string;
  community_description: string;
  community_logo_url: string | null;
  community_requires_member_approval: boolean;
  community_share_token: string;
};

type CommunityMember = {
  user_id: string;
  role: CommunityRole;
  joined_at: string;
  full_name: string;
  email: string | null;
  city: string;
  phone: string;
  avatar_url: string | null;
  google_avatar_url: string | null;
};

type CommunityJoinRequest = {
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  google_avatar_url: string | null;
  requested_at: string;
};

type ActiveCircleMembership = {
  community_id: string;
  community_name: string;
  joined_at: string;
};

type ActiveCircleUser = {
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  google_avatar_url: string | null;
  last_active_at: string;
  memberships: ActiveCircleMembership[];
};

type CommunityEvent = {
  id: string;
  community_id: string;
  title: string;
  description: string;
  location: string;
  starts_at: string;
  ends_at: string | null;
  image_url: string | null;
  participant_limit: number | null;
  bring_mode: EventBringMode;
  gallery_image_limit: number;
  gallery_image_max_mb: number;
  gallery_video_limit: number;
  gallery_video_max_mb: number;
  share_token: string;
  status: "active" | "cancelled";
  cancelled_at: string | null;
  cancelled_by: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

type AttendanceStatus = "going" | "maybe" | "not_going";

type WhatsAppComposerContext = {
  type: "community" | "event";
  title: string;
  details: string | null;
  shareUrl: string;
  imageUrl: string | null;
};

type EventAttendance = {
  event_id: string;
  user_id: string;
  status: AttendanceStatus;
  created_at: string;
  updated_at: string;
  full_name: string;
  email: string | null;
  city: string;
  phone: string;
  community_role: CommunityRole | null;
  avatar_url: string | null;
  google_avatar_url: string | null;
};

type EventBringMode = "planned" | "free";

type EventBringNeed = {
  id: string;
  event_id: string;
  item_name: string;
  quantity_needed: number;
  created_at: string;
};

type EventBringNeedDraft = {
  client_id: string;
  id: string | null;
  item_name: string;
  quantity_needed: number;
};

type EventBringContribution = {
  id: string;
  event_id: string;
  need_id: string | null;
  user_id: string;
  item_name: string;
  quantity: number;
  note: string;
  created_at: string;
  full_name: string;
  avatar_url: string | null;
  google_avatar_url: string | null;
};

type BringDisplayRow =
  | { kind: "need"; sortName: string; need: EventBringNeed }
  | { kind: "free"; sortName: string; contribution: EventBringContribution };


type AppNotification = {
  id: string;
  community_id: string | null;
  event_id: string | null;
  type: string;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
};

type EventGalleryPhoto = {
  id: string;
  event_id: string;
  user_id: string;
  image_url: string;
  media_type: "image" | "video";
  created_at: string;
  full_name: string;
};

type EventMediaCount = {
  imageCount: number;
  videoCount: number;
};

type EventConversationTopic = {
  id: string;
  event_id: string;
  slug: string;
  title: string;
  sort_order: number;
  created_at: string;
};

type EventConversationMessage = {
  id: string;
  event_id: string;
  topic_id: string;
  user_id: string;
  body: string;
  created_at: string;
  updated_at: string;
  full_name: string;
  avatar_url: string | null;
  google_avatar_url: string | null;
};

const CONVERSATION_EMOJIS = ["😀", "😂", "😢", "❤️", "👍", "🙏", "🤗", "🎉", "🚗"];

type PersonalEventRow = {
  event: CommunityEvent;
  community: Community;
  attendance: EventAttendance | null;
};

type SystemUsageLogRow = {
  session_id: string;
  user_id: string;
  full_name: string;
  community_names: string[];
  duration_seconds: number;
  started_at: string;
  ended_at: string;
};

type PendingMemberAction =
  | { type: "remove"; member: CommunityMember }
  | { type: "role"; member: CommunityMember; nextRole: "admin" | "member" }
  | { type: "leave"; community: Community }
  | { type: "attendance"; attendance: EventAttendance }
  | { type: "delete_event"; event: CommunityEvent }
  | { type: "cancel_event"; event: CommunityEvent; cancel: boolean }
  | { type: "delete_circle"; community: Community }
  | { type: "delete_gallery"; photo: EventGalleryPhoto }
  | { type: "delete_conversation_message"; message: EventConversationMessage }
  | { type: "delete_notification"; notification: AppNotification }
  | { type: "delete_all_notifications" };

function GoogleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="google-icon">
      <path
        fill="#4285F4"
        d="M21.35 12.24c0-.74-.07-1.45-.2-2.13H12v4.03h5.23a4.47 4.47 0 0 1-1.94 2.94v2.62h3.14c1.84-1.69 2.92-4.18 2.92-7.46Z"
      />
      <path
        fill="#34A853"
        d="M12 21.72c2.63 0 4.84-.87 6.45-2.36l-3.14-2.62c-.87.58-1.99.93-3.31.93-2.54 0-4.69-1.71-5.46-4.02H3.3v2.7A9.74 9.74 0 0 0 12 21.72Z"
      />
      <path
        fill="#FBBC05"
        d="M6.54 13.65A5.86 5.86 0 0 1 6.23 12c0-.57.11-1.13.31-1.65v-2.7H3.3A9.73 9.73 0 0 0 2.28 12c0 1.57.38 3.05 1.02 4.35l3.24-2.7Z"
      />
      <path
        fill="#EA4335"
        d="M12 6.33c1.43 0 2.71.49 3.72 1.45l2.79-2.79A9.36 9.36 0 0 0 12 2.28 9.74 9.74 0 0 0 3.3 7.65l3.24 2.7C7.31 8.04 9.46 6.33 12 6.33Z"
      />
    </svg>
  );
}

function NavigationIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="navigation-icon">
      <path
        d="M20.4 3.6 3.9 10.4c-.9.4-.8 1.7.2 1.9l6.2 1.4 1.4 6.2c.2 1 1.5 1.1 1.9.2l6.8-16.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CirclesMark() {
  return (
    <img
      src={SOFTWARE_ICON_IMAGE}
      alt="לוגו מעגלים"
      className="brand-logo-image"
    />
  );
}

function ProfileMenuIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="profile-menu-icon">
      <circle cx="12" cy="8" r="4" fill="currentColor" />
      <path d="M4.5 21a7.5 7.5 0 0 1 15 0Z" fill="currentColor" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <img
      src="/logout-icon.png"
      alt=""
      aria-hidden="true"
      className="logout-icon-image"
    />
  );
}

function ConversationComposer({
  topicId,
  topicTitle,
  onSend,
}: {
  topicId: string;
  topicTitle: string;
  onSend: (body: string) => Promise<boolean>;
}) {
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const draft = drafts[topicId] ?? "";

  function setDraft(value: string) {
    setDrafts((current) => ({ ...current, [topicId]: value }));
  }

  function insertEmoji(emoji: string) {
    const input = inputRef.current;
    const start = input?.selectionStart ?? draft.length;
    const end = input?.selectionEnd ?? start;
    const nextValue = `${draft.slice(0, start)}${emoji}${draft.slice(end)}`;
    setDraft(nextValue);
    requestAnimationFrame(() => {
      const nextCursorPosition = start + emoji.length;
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(nextCursorPosition, nextCursorPosition);
    });
  }

  async function submitMessage() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    const sent = await onSend(body);
    if (sent) setDraft("");
    setSending(false);
  }

  return (
    <div className="conversation-composer">
      <div className="conversation-emoji-bar" aria-label="הוספת אמוג׳י">
        {CONVERSATION_EMOJIS.map((emoji) => (
          <button
            type="button"
            onClick={() => insertEmoji(emoji)}
            aria-label={`הוספת ${emoji}`}
            title={`הוספת ${emoji}`}
            key={emoji}
          >
            {emoji}
          </button>
        ))}
      </div>
      <textarea
        ref={inputRef}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        maxLength={1200}
        rows={3}
        placeholder={`כתיבת הודעה בנושא ${topicTitle}`}
      />
      <div className="conversation-composer-actions">
        <span>{draft.length}/1200</span>
        <button
          type="button"
          className="primary-button compact-button"
          onClick={() => void submitMessage()}
          disabled={sending || !draft.trim()}
        >
          שליחת הודעה
        </button>
      </div>
    </div>
  );
}


const BIRTH_MONTHS = [
  "ינואר",
  "פברואר",
  "מרץ",
  "אפריל",
  "מאי",
  "יוני",
  "יולי",
  "אוגוסט",
  "ספטמבר",
  "אוקטובר",
  "נובמבר",
  "דצמבר",
] as const;

function validateBirthday(dayValue: string, monthValue: string, yearValue: string) {
  if (!dayValue && !monthValue && !yearValue) return null;
  if (!dayValue || !monthValue) return "כדי לשמור תאריך לידה יש לבחור יום וחודש. השנה אינה חובה.";

  const day = Number(dayValue);
  const month = Number(monthValue);
  const year = yearValue ? Number(yearValue) : 2000;
  const currentYear = new Date().getFullYear();

  if (!Number.isInteger(day) || day < 1 || day > 31 || !Number.isInteger(month) || month < 1 || month > 12) {
    return "תאריך הלידה אינו תקין.";
  }

  if (yearValue && (!Number.isInteger(year) || year < 1900 || year > currentYear)) {
    return `שנת הלידה צריכה להיות בין 1900 ל־${currentYear}.`;
  }

  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    return "תאריך הלידה אינו תקין.";
  }

  return null;
}

function BirthdayFields({
  day,
  month,
  year,
  onDayChange,
  onMonthChange,
  onYearChange,
  disabled = false,
}: {
  day: string;
  month: string;
  year: string;
  onDayChange: (value: string) => void;
  onMonthChange: (value: string) => void;
  onYearChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="birthday-fieldset">
      <legend>תאריך לידה (לא חובה)</legend>
      <div className="birthday-fields-grid">
        <label>
          <span>יום</span>
          <select value={day} onChange={(event) => onDayChange(event.target.value)} disabled={disabled}>
            <option value="">יום</option>
            {Array.from({ length: 31 }, (_, index) => index + 1).map((value) => (
              <option value={value} key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          <span>חודש</span>
          <select value={month} onChange={(event) => onMonthChange(event.target.value)} disabled={disabled}>
            <option value="">חודש</option>
            {BIRTH_MONTHS.map((monthName, index) => (
              <option value={index + 1} key={monthName}>{monthName}</option>
            ))}
          </select>
        </label>
        <label>
          <span>שנה</span>
          <input
            type="number"
            min="1900"
            max={new Date().getFullYear()}
            value={year}
            onChange={(event) => onYearChange(event.target.value)}
            placeholder="לא חובה"
            inputMode="numeric"
            disabled={disabled}
          />
        </label>
      </div>
      <small>השנה אינה חובה. התאריך ישמש לתזכורות ימי הולדת.</small>
    </fieldset>
  );
}

function LegalScreen({
  checked,
  onCheckedChange,
  onAccept,
  onBack,
  onSignOut,
  signingOut,
  saving,
  acceptanceRequired,
  acceptButtonLabel,
  acceptedAt,
  profileName,
  profileImageUrl,
  city,
  phone,
  birthDay,
  birthMonth,
  birthYear,
  onCityChange,
  onPhoneChange,
  onBirthDayChange,
  onBirthMonthChange,
  onBirthYearChange,
  onProfileImageSelected,
  message,
  messageTone,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  onAccept: () => void;
  onBack?: () => void;
  onSignOut?: () => void;
  signingOut: boolean;
  saving: boolean;
  acceptanceRequired: boolean;
  acceptButtonLabel: string;
  acceptedAt?: string | null;
  profileName: string;
  profileImageUrl: string | null;
  city: string;
  phone: string;
  birthDay: string;
  birthMonth: string;
  birthYear: string;
  onCityChange: (value: string) => void;
  onPhoneChange: (value: string) => void;
  onBirthDayChange: (value: string) => void;
  onBirthMonthChange: (value: string) => void;
  onBirthYearChange: (value: string) => void;
  onProfileImageSelected: (file: File) => void;
  message: string | null;
  messageTone: "success" | "error";
}) {
  const legalProfileImageInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <main className="legal-page">
      <section className="legal-card" aria-live="polite">
        <div className="legal-toolbar">
          <div className="legal-toolbar-actions">
            {onBack && (
              <button type="button" className="back-button" onClick={onBack}>
                חזרה
              </button>
            )}
            {onSignOut && (
              <button
                type="button"
                className="secondary-button compact-button legal-signout-button"
                onClick={onSignOut}
                disabled={signingOut}
              >
                {signingOut ? "מתנתקים..." : "התנתקות"}
              </button>
            )}
          </div>
          <span className="legal-version">גרסת מסמך {LEGAL_VERSION}</span>
        </div>

        <header className="legal-header">
          <CirclesMark />
          <div>
            <p className="section-kicker">מעגלים · Circles</p>
            <h1>תנאי שימוש ומדיניות פרטיות</h1>
          </div>
        </header>

        <div className="legal-document">
          <section className="legal-intro">
            <h2>מה הרעיון של המערכת?</h2>
            <p>
              „מעגלים” היא מערכת קהילתית שנועדה לעזור לקבוצות של אנשים להתארגן,
              להישאר בקשר וליצור פעילות משותפת במקום אחד. במערכת אפשר להקים מעגלים,
              להזמין חברים, לפרסם אירועים, לנהל הרשמה והגעה, לתאם מה כל אחד מביא
              ולשתף תמונות וסרטונים מהפעילות.
            </p>
            <p>
              המערכת מיועדת לשימוש קהילתי מכבד. כל משתמש אחראי למידע ולתוכן שהוא
              מפרסם ולכך שיש לו רשות לשתף אותו עם חברי המעגל הרלוונטי.
            </p>
          </section>

          <section>
            <h2>תנאי שימוש</h2>
            <ol>
              <li>יש להשתמש במערכת באופן חוקי, מכבד ולמטרות הקשורות לפעילות המעגל.</li>
              <li>אין לפרסם תוכן פוגעני, מטעה, מפר זכויות, בלתי חוקי או תוכן של אדם אחר ללא רשות.</li>
              <li>מנהלי מעגל רשאים לנהל חברות במעגל, אירועים ותכנים בהתאם לצורכי הקהילה.</li>
              <li>המשתמש אחראי לנכונות הפרטים שמסר ולשמירה על הגישה לחשבון Google שלו.</li>
              <li>המערכת עשויה להשתנות, להתעדכן או להיות מושבתת זמנית לצורכי תחזוקה.</li>
              <li>מפעיל המערכת רשאי להסיר תוכן או להגביל שימוש במקרה של הפרת תנאים אלה.</li>
            </ol>
          </section>

          <section>
            <h2>איזה מידע נשמר?</h2>
            <p>
              בעת כניסה באמצעות Google מתקבלים מזהה משתמש, כתובת דוא״ל, שם ותמונת
              פרופיל, ככל ש־Google מספקת אותם. בנוסף, המשתמש יכול להוסיף מרצונו עיר,
              מספר טלפון, תאריך לידה, תיאור אישי ותמונת פרופיל אחרת.
            </p>
            <p>
              במהלך השימוש נשמר מידע הקשור למעגלים, חברות במעגל, אירועים, תגובות
              הגעה, שמות אורחים, פריטים שהמשתמש התחייב להביא, הודעות, תמונות וסרטונים
              שהועלו למערכת.
            </p>
          </section>

          <section>
            <h2>כיצד משתמשים במידע?</h2>
            <ul>
              <li>כדי לאפשר כניסה, זיהוי משתמש ותפעול המערכת.</li>
              <li>כדי להציג לחברי המעגל את המידע הדרוש לפעילות המשותפת.</li>
              <li>כדי לשלוח ולהציג עדכונים והתראות בתוך המערכת.</li>
              <li>כדי לאבטח את השירות, לטפל בתקלות ולשפר את פעולתו.</li>
            </ul>
          </section>

          <section>
            <h2>מי יכול לראות את המידע?</h2>
            <p>
              מידע קהילתי מוצג בהתאם להרשאות במערכת. פרטי פרופיל עשויים להיות גלויים
              לחברים המשתייכים לאותו מעגל. מידע על אירוע משותף עשוי להיות מוצג למי
              שקיבל קישור לאירוע או למעגל, בהתאם להגדרות ולתהליך ההצטרפות.
            </p>
            <p>
              אין מכירה של מידע אישי למפרסמים. מידע עשוי להישמר או להיות מעובד אצל
              ספקי התשתית הנדרשים להפעלת המערכת, ובהם Google לצורך התחברות, Supabase
              לצורך מסד נתונים ואחסון, ו־Vercel לצורך אירוח המערכת.
            </p>
          </section>

          <section>
            <h2>שמירה, אבטחה ומחיקה</h2>
            <p>
              נעשים מאמצים סבירים להגן על המידע באמצעות הרשאות גישה ותשתיות מאובטחות,
              אך אין מערכת מקוונת החסינה לחלוטין. מידע נשמר כל עוד הוא נדרש להפעלת
              השירות, לעמידה בחובות חוקיות או לטיפול במחלוקות ובתקלות.
            </p>
            <p>
              ניתן לבקש לעיין במידע אישי, לתקנו או למחוק אותו. מחיקת מידע מסוים עלולה
              להשפיע על היכולת להשתמש במערכת או על תיעוד פעילות שכבר שותפה במעגל.
            </p>
          </section>

          <section>
            <h2>שינויים ויצירת קשר</h2>
            <p>
              תנאים ומדיניות אלה עשויים להתעדכן. כאשר יהיה שינוי מהותי, המערכת עשויה
              לבקש אישור מחדש. לפניות בנושא פרטיות, תנאי שימוש או מחיקת מידע ניתן
              לפנות למנהל המערכת בדוא״ל: <a href={`mailto:${SYSTEM_ADMIN_EMAIL}`}>{SYSTEM_ADMIN_EMAIL}</a>.
            </p>
          </section>
        </div>

        {acceptanceRequired ? (
          <div className="legal-consent-panel">
            <section className="legal-profile-fields" aria-labelledby="legal-profile-fields-title">
              <div className="legal-profile-fields-heading">
                <div>
                  <h2 id="legal-profile-fields-title">השלמת פרטים אישיים</h2>
                  <p>הפרטים אינם חובה וניתן לשנות אותם בכל עת באזור האישי.</p>
                </div>
                <ProfileAvatar imageUrl={profileImageUrl} name={profileName} />
              </div>

              <div className="legal-profile-image-actions">
                <input
                  ref={legalProfileImageInputRef}
                  className="hidden-file-input"
                  type="file"
                  accept="image/*,.heic,.heif"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) onProfileImageSelected(file);
                  }}
                />
                <button
                  type="button"
                  className="secondary-button compact-button"
                  onClick={() => legalProfileImageInputRef.current?.click()}
                  disabled={saving}
                >
                  שינוי תמונת פרופיל
                </button>
              </div>

              <label>
                <span>עיר מגורים (לא חובה)</span>
                <input
                  type="text"
                  value={city}
                  onChange={(event) => onCityChange(event.target.value)}
                  maxLength={100}
                  autoComplete="address-level2"
                  placeholder="לדוגמה: ראש העין"
                  disabled={saving}
                />
              </label>

              <label>
                <span>טלפון (לא חובה)</span>
                <input
                  type="tel"
                  value={phone}
                  onChange={(event) => onPhoneChange(event.target.value)}
                  maxLength={30}
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="לדוגמה: 050-1234567"
                  disabled={saving}
                />
              </label>

              <BirthdayFields
                day={birthDay}
                month={birthMonth}
                year={birthYear}
                onDayChange={onBirthDayChange}
                onMonthChange={onBirthMonthChange}
                onYearChange={onBirthYearChange}
                disabled={saving}
              />
            </section>

            <label className="legal-consent-checkbox">
              <input
                type="checkbox"
                checked={checked}
                onChange={(event) => onCheckedChange(event.target.checked)}
              />
              <span>
                קראתי את תנאי השימוש ומדיניות הפרטיות, הבנתי אותם ואני מאשר/ת אותם.
              </span>
            </label>
            <button
              type="button"
              className="primary-button legal-accept-button"
              onClick={onAccept}
              disabled={!checked || saving}
            >
              {saving ? "שומרים את האישור..." : acceptButtonLabel}
            </button>
          </div>
        ) : (
          <div className="legal-accepted-panel">
            <strong>האישור שלך שמור במערכת.</strong>
            {acceptedAt && <span>תאריך אישור: {formatJoinDateTime(acceptedAt)}</span>}
          </div>
        )}

        {message && <p className={`message-box ${messageTone}`}>{message}</p>}
      </section>
    </main>
  );
}

function getCommunityImageUrl(logoUrl: string | null) {
  return logoUrl ?? "";
}

function getProfileImageUrl(avatarUrl: string | null, googleAvatarUrl: string | null) {
  return avatarUrl || googleAvatarUrl || null;
}

function formatSupabaseError(error: unknown) {
  if (!error || typeof error !== "object") return "שגיאה לא ידועה";

  const candidate = error as {
    code?: string;
    message?: string;
    details?: string;
    hint?: string;
  };

  return [
    candidate.code ? `קוד: ${candidate.code}` : null,
    candidate.message ? `הודעה: ${candidate.message}` : null,
    candidate.details ? `פרטים: ${candidate.details}` : null,
    candidate.hint ? `הנחיה: ${candidate.hint}` : null,
  ]
    .filter(Boolean)
    .join(" | ") || "שגיאה לא ידועה";
}

function getGoogleProfile(user: User) {
  const metadata = user.user_metadata ?? {};
  return {
    fullName:
      (metadata.full_name as string | undefined) ??
      (metadata.name as string | undefined) ??
      user.email?.split("@")[0] ??
      "משתמש",
    avatarUrl:
      (metadata.avatar_url as string | undefined) ??
      (metadata.picture as string | undefined) ??
      null,
  };
}

function getWhatsAppUrl(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";

  const internationalNumber = digits.startsWith("0")
    ? `972${digits.slice(1)}`
    : digits;

  return `https://wa.me/${internationalNumber}`;
}

function getNavigationUrl(location: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
}

function PhoneLink({ phone }: { phone: string }) {
  const whatsappUrl = getWhatsAppUrl(phone);
  if (!whatsappUrl) return null;

  return (
    <a
      className="member-phone-link"
      href={whatsappUrl}
      target="_blank"
      rel="noreferrer"
      title="פתיחת שיחה ב־WhatsApp"
    >
      {phone}
    </a>
  );
}

function VideoProcessStatus({ notice }: { notice: VideoProcessNotice | null }) {
  if (!notice) return null;

  return (
    <div className={`video-process-status ${notice.tone}`} role={notice.tone === "error" ? "alert" : "status"}>
      <div className="video-process-status-row">
        {notice.tone === "info" && <span className="video-process-spinner" aria-hidden="true" />}
        <span>{notice.text}</span>
      </div>
      {notice.progress !== null && (
        <div
          className="video-process-progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={notice.progress}
          aria-label="התקדמות כיווץ הסרטון"
        >
          <span style={{ width: `${Math.max(0, Math.min(100, notice.progress))}%` }} />
        </div>
      )}
    </div>
  );
}

function ProfileAvatar({
  imageUrl,
  name,
  size = "large",
  onOpen,
}: {
  imageUrl: string | null;
  name: string;
  size?: "small" | "large";
  onOpen?: (imageUrl: string, alt: string) => void;
}) {
  if (imageUrl) {
    const image = (
      <img
        className={`profile-avatar profile-avatar-${size}`}
        src={imageUrl}
        alt={`תמונה של ${name}`}
        referrerPolicy="no-referrer"
      />
    );

    if (onOpen) {
      return (
        <button
          type="button"
          className={`image-zoom-button avatar-zoom-button avatar-zoom-${size}`}
          onClick={() => onOpen(imageUrl, `תמונה של ${name}`)}
          aria-label={`הגדלת התמונה של ${name}`}
        >
          {image}
        </button>
      );
    }

    return (
      image
    );
  }

  return (
    <div className={`profile-avatar profile-avatar-${size} avatar-placeholder`}>
      {name.trim().slice(0, 1) || "?"}
    </div>
  );
}

const SUPPORTED_IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif", "heic", "heif"]);
const HEIC_IMAGE_EXTENSIONS = new Set(["heic", "heif"]);
const HEIC_IMAGE_MIME_TYPES = new Set([
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
]);

function getFileExtension(file: File) {
  return file.name.split(".").pop()?.trim().toLowerCase() ?? "";
}

function isHeicImageFile(file: File) {
  return HEIC_IMAGE_EXTENSIONS.has(getFileExtension(file)) || HEIC_IMAGE_MIME_TYPES.has(file.type.toLowerCase());
}

function isSupportedImageFile(file: File) {
  return file.type.startsWith("image/") || SUPPORTED_IMAGE_EXTENSIONS.has(getFileExtension(file));
}

async function convertHeicToJpeg(file: File): Promise<Blob> {
  try {
    const module = await import("heic2any");
    const result = await module.default({
      blob: file,
      toType: "image/jpeg",
      quality: 0.92,
    });
    const converted = Array.isArray(result) ? result[0] : result;
    if (!(converted instanceof Blob) || converted.size === 0) {
      throw new Error("heic_conversion_failed");
    }
    return converted.type === "image/jpeg"
      ? converted
      : new Blob([converted], { type: "image/jpeg" });
  } catch {
    throw new Error("heic_conversion_failed");
  }
}

function loadImage(sourceUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("image_decode_failed"));
    image.src = sourceUrl;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("image_compression_failed"));
      },
      "image/jpeg",
      quality,
    );
  });
}

async function compressImage(file: File, maxOutputBytes = DEFAULT_IMAGE_MAX_BYTES): Promise<SelectedImage> {
  if (!isSupportedImageFile(file)) {
    throw new Error("not_an_image");
  }

  const sourceBlob = isHeicImageFile(file) ? await convertHeicToJpeg(file) : file;
  const sourceUrl = URL.createObjectURL(sourceBlob);
  let lastCompressedSize = sourceBlob.size;

  try {
    const image = await loadImage(sourceUrl);
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;

    if (!sourceWidth || !sourceHeight) {
      throw new Error("image_decode_failed");
    }

    const initialScale = Math.min(1, MAX_IMAGE_EDGE / Math.max(sourceWidth, sourceHeight));
    const baseWidth = Math.max(1, Math.round(sourceWidth * initialScale));
    const baseHeight = Math.max(1, Math.round(sourceHeight * initialScale));
    const dimensionScales = [1, 0.85, 0.7, 0.55, 0.4, 0.3];
    const qualities = [0.82, 0.7, 0.58, 0.46, 0.34, 0.25];
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("image_compression_failed");

    for (const dimensionScale of dimensionScales) {
      canvas.width = Math.max(1, Math.round(baseWidth * dimensionScale));
      canvas.height = Math.max(1, Math.round(baseHeight * dimensionScale));
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      for (const quality of qualities) {
        const compressed = await canvasToBlob(canvas, quality);
        lastCompressedSize = compressed.size;
        if (compressed.size <= maxOutputBytes) {
          return {
            blob: compressed,
            previewUrl: URL.createObjectURL(compressed),
          };
        }
      }
    }

    throw new CompressedImageTooLargeError(file.size, lastCompressedSize, maxOutputBytes);
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}


async function createSelectedImageFromSquareCanvas(
  sourceCanvas: HTMLCanvasElement,
  beforeBytes: number,
  maxOutputBytes = DEFAULT_IMAGE_MAX_BYTES,
): Promise<SelectedImage> {
  const dimensionScales = [1, 0.85, 0.7, 0.55, 0.4];
  const qualities = [0.9, 0.8, 0.7, 0.58, 0.46, 0.34, 0.25];
  let lastCompressedSize = beforeBytes;

  for (const dimensionScale of dimensionScales) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(sourceCanvas.width * dimensionScale));
    canvas.height = canvas.width;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("image_compression_failed");
    context.drawImage(sourceCanvas, 0, 0, canvas.width, canvas.height);

    for (const quality of qualities) {
      const compressed = await canvasToBlob(canvas, quality);
      lastCompressedSize = compressed.size;
      if (compressed.size <= maxOutputBytes) {
        return {
          blob: compressed,
          previewUrl: URL.createObjectURL(compressed),
        };
      }
    }
  }

  throw new CompressedImageTooLargeError(beforeBytes, lastCompressedSize, maxOutputBytes);
}

function clampNumber(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function ProfileImageCropper({
  request,
  onCancel,
  onConfirm,
}: {
  request: ProfileCropRequest;
  onCancel: () => void;
  onConfirm: (image: SelectedImage) => void;
}) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [frameSize, setFrameSize] = useState(280);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [processing, setProcessing] = useState(false);
  const [cropError, setCropError] = useState<string | null>(null);

  const getGeometry = useCallback(
    (nextZoom = zoom) => {
      if (!naturalSize.width || !naturalSize.height || !frameSize) {
        return {
          scale: 1,
          displayWidth: frameSize,
          displayHeight: frameSize,
          maxOffsetX: 0,
          maxOffsetY: 0,
        };
      }

      const coverScale = Math.max(
        frameSize / naturalSize.width,
        frameSize / naturalSize.height,
      );
      const scale = coverScale * nextZoom;
      const displayWidth = naturalSize.width * scale;
      const displayHeight = naturalSize.height * scale;
      return {
        scale,
        displayWidth,
        displayHeight,
        maxOffsetX: Math.max(0, (displayWidth - frameSize) / 2),
        maxOffsetY: Math.max(0, (displayHeight - frameSize) / 2),
      };
    },
    [frameSize, naturalSize.height, naturalSize.width, zoom],
  );

  const clampOffset = useCallback(
    (candidate: { x: number; y: number }, nextZoom = zoom) => {
      const geometry = getGeometry(nextZoom);
      return {
        x: clampNumber(candidate.x, -geometry.maxOffsetX, geometry.maxOffsetX),
        y: clampNumber(candidate.y, -geometry.maxOffsetY, geometry.maxOffsetY),
      };
    },
    [getGeometry, zoom],
  );

  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    const updateFrameSize = () => setFrameSize(Math.max(1, frame.clientWidth));
    updateFrameSize();

    const observer = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(updateFrameSize);
    observer?.observe(frame);
    return () => observer?.disconnect();
  }, []);

  useEffect(() => {
    setOffset((current) => clampOffset(current));
  }, [clampOffset, frameSize, naturalSize, zoom]);

  function updateZoom(nextZoom: number) {
    const normalizedZoom = clampNumber(nextZoom, 1, 3);
    setZoom(normalizedZoom);
    setOffset((current) => clampOffset(current, normalizedZoom));
  }

  function beginDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (processing) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: offset.x,
      offsetY: offset.y,
    };
  }

  function moveImage(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setOffset(
      clampOffset({
        x: drag.offsetX + event.clientX - drag.startX,
        y: drag.offsetY + event.clientY - drag.startY,
      }),
    );
  }

  function endDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  async function confirmCrop() {
    const image = imageRef.current;
    if (!image || !naturalSize.width || !naturalSize.height) return;

    setProcessing(true);
    setCropError(null);

    try {
      const geometry = getGeometry();
      const imageLeft = (frameSize - geometry.displayWidth) / 2 + offset.x;
      const imageTop = (frameSize - geometry.displayHeight) / 2 + offset.y;
      const sourceX = clampNumber(-imageLeft / geometry.scale, 0, naturalSize.width);
      const sourceY = clampNumber(-imageTop / geometry.scale, 0, naturalSize.height);
      const sourceSquare = Math.min(
        frameSize / geometry.scale,
        naturalSize.width - sourceX,
        naturalSize.height - sourceY,
      );

      const canvas = document.createElement("canvas");
      canvas.width = 1000;
      canvas.height = 1000;
      const context = canvas.getContext("2d");
      if (!context || sourceSquare <= 0) throw new Error("image_crop_failed");
      context.drawImage(
        image,
        sourceX,
        sourceY,
        sourceSquare,
        sourceSquare,
        0,
        0,
        canvas.width,
        canvas.height,
      );

      const selectedImage = await createSelectedImageFromSquareCanvas(
        canvas,
        request.originalBytes,
      );
      onConfirm(selectedImage);
    } catch (error) {
      setCropError(
        error instanceof CompressedImageTooLargeError
          ? formatCompressedImageTooLarge(error)
          : "לא הצלחנו להכין את התמונה. נסו לבחור תמונה אחרת.",
      );
      setProcessing(false);
    }
  }

  const geometry = getGeometry();

  return (
    <div className="modal-backdrop profile-crop-backdrop" role="presentation">
      <section
        className="modal-card profile-crop-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-crop-title"
      >
        <button
          type="button"
          className="modal-close"
          onClick={onCancel}
          aria-label="סגירה"
          disabled={processing}
        >
          ×
        </button>
        <div className="section-heading-compact profile-crop-heading">
          <p className="section-kicker">תמונת פרופיל</p>
          <h2 id="profile-crop-title">סידור התמונה של {request.personName}</h2>
          <small>גררו את התמונה בתוך הריבוע והשתמשו בזום כדי לבחור את החיתוך.</small>
        </div>

        <div
          ref={frameRef}
          className="profile-crop-frame"
          onPointerDown={beginDrag}
          onPointerMove={moveImage}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <img
            ref={imageRef}
            src={request.sourceUrl}
            alt="תצוגה מקדימה לחיתוך"
            draggable={false}
            onLoad={(event: React.SyntheticEvent<HTMLImageElement>) => {
              setNaturalSize({
                width: event.currentTarget.naturalWidth,
                height: event.currentTarget.naturalHeight,
              });
              setOffset({ x: 0, y: 0 });
              setZoom(1);
            }}
            style={{
              width: `${geometry.displayWidth}px`,
              height: `${geometry.displayHeight}px`,
              transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px)`,
            }}
          />
        </div>

        <div className="profile-crop-zoom-row">
          <button
            type="button"
            className="secondary-button compact-button"
            onClick={() => updateZoom(zoom - 0.15)}
            disabled={processing || zoom <= 1}
            aria-label="הקטנת התמונה"
          >
            −
          </button>
          <label>
            <span>הגדלה והקטנה</span>
            <input
              dir="ltr"
              type="range"
              min="1"
              max="3"
              step="0.05"
              value={zoom}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => updateZoom(Number(event.target.value))}
              disabled={processing}
            />
          </label>
          <button
            type="button"
            className="secondary-button compact-button"
            onClick={() => updateZoom(zoom + 0.15)}
            disabled={processing || zoom >= 3}
            aria-label="הגדלת התמונה"
          >
            +
          </button>
        </div>

        {cropError && <p className="message-box error">{cropError}</p>}

        <div className="profile-crop-actions">
          <button type="button" className="secondary-button" onClick={onCancel} disabled={processing}>
            ביטול
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={() => void confirmCrop()}
            disabled={processing || !naturalSize.width}
          >
            {processing ? "מכינים..." : "אישור החיתוך"}
          </button>
        </div>
      </section>
    </div>
  );
}

function isSystemAdminEmail(email: string | null | undefined) {
  return email?.trim().toLowerCase() === SYSTEM_ADMIN_EMAIL;
}

function canManageCommunity(
  role: CommunityRole | null | undefined,
  email: string | null | undefined,
) {
  return isSystemAdminEmail(email) || role === "owner" || role === "admin";
}

function canOwnCommunity(
  community: Pick<Community, "role" | "created_by"> | null | undefined,
  userId: string | null | undefined,
  email: string | null | undefined,
) {
  return (
    isSystemAdminEmail(email) ||
    community?.role === "owner" ||
    Boolean(community && userId && community.created_by === userId)
  );
}

function communityRoleLabel(role: CommunityRole, email: string | null | undefined) {
  if (isSystemAdminEmail(email)) return "מנהל המערכת";
  return roleLabel(role);
}

function roleLabel(role: CommunityRole) {
  if (role === "owner" || role === "admin") return "מנהל/ת";
  return "חבר/ה";
}

function attendanceStatusLabel(status: AttendanceStatus) {
  if (status === "going") return "מגיע/ה";
  if (status === "maybe") return "אולי";
  return "לא מגיע/ה";
}

function hideCommunityPlaceholder(community: Pick<Community, "logo_url">) {
  return !getCommunityImageUrl(community.logo_url);
}

function getCommunityShareUrl(shareToken: string) {
  if (typeof window === "undefined") {
    return `${PRODUCTION_ORIGIN}/circle/${shareToken}`;
  }

  const isLocalhost = ["localhost", "127.0.0.1"].includes(window.location.hostname);
  const origin = isLocalhost ? PRODUCTION_ORIGIN : window.location.origin;
  return `${origin}/circle/${shareToken}`;
}

function getCommunityShareText(community: Pick<Community, "name" | "description">, url: string) {
  return [
    `הצטרפו למעגל „${community.name}”`,
    community.description.trim(),
    "לצפייה ולהצטרפות:",
    url,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function toDateTimeLocalValue(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}

function toTimeInputValue(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("he-IL", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function formatShortDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const datePart = `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
  const timePart = new Intl.DateTimeFormat("he-IL", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  return `${datePart} בשעה ${timePart}`;
}

function formatShortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
}

function formatJoinDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const timePart = new Intl.DateTimeFormat("he-IL", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()} ${timePart}`;
}

function formatUsageDuration(value: number) {
  const totalSeconds = Math.max(0, Math.floor(Number(value) || 0));
  if (totalSeconds < 60) return totalSeconds === 0 ? "טרם נצבר זמן" : `${totalSeconds} שניות`;

  const totalMinutes = Math.floor(totalSeconds / 60);
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];

  if (days > 0) parts.push(`${days} ${days === 1 ? "יום" : "ימים"}`);
  if (hours > 0) parts.push(`${hours} ${hours === 1 ? "שעה" : "שעות"}`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes} דקות`);

  return parts.join(" ו־");
}

function formatUsageSessionRange(startedAt: string, endedAt: string) {
  const start = new Date(startedAt);
  const end = new Date(endedAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "";

  const dateFormatter = new Intl.DateTimeFormat("he-IL", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
  });
  const timeFormatter = new Intl.DateTimeFormat("he-IL", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const startDate = dateFormatter.format(start);
  const endDate = dateFormatter.format(end);

  if (startDate === endDate) {
    return `${startDate} משעה ${timeFormatter.format(start)} עד ${timeFormatter.format(end)}`;
  }

  return `${startDate} משעה ${timeFormatter.format(start)} עד ${endDate} בשעה ${timeFormatter.format(end)}`;
}

function formatEventDate(startsAt: string, endsAt?: string | null) {
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) return "";

  const datePart = `${start.getDate()}/${start.getMonth() + 1}/${start.getFullYear()}`;
  const timeFormatter = new Intl.DateTimeFormat("he-IL", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const startTime = timeFormatter.format(start);

  if (!endsAt) return `${datePart} משעה ${startTime}`;
  const end = new Date(endsAt);
  if (Number.isNaN(end.getTime())) return `${datePart} משעה ${startTime}`;
  return `${datePart} משעה ${startTime} עד ${timeFormatter.format(end)}`;
}

function formatWhatsAppEventDateTime(startsAt: string) {
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) return "";
  const datePart = `${start.getDate()}/${start.getMonth() + 1}/${start.getFullYear()}`;
  const timePart = new Intl.DateTimeFormat("he-IL", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(start);
  return `${datePart} ${timePart}`;
}

function getEventDisplayTitle(event: Pick<CommunityEvent, "title" | "starts_at" | "ends_at">) {
  const dateAndTime = formatEventDate(event.starts_at, event.ends_at);
  return dateAndTime ? `${event.title} ${dateAndTime}` : event.title;
}

function getEventBrowserTitle(event: Pick<CommunityEvent, "title" | "starts_at">) {
  const date = formatShortDate(event.starts_at);
  return date ? `${event.title} ב ${date}` : event.title;
}

function getEventShareUrl(shareToken: string) {
  if (typeof window === "undefined") {
    return `${PRODUCTION_ORIGIN}/event/${shareToken}`;
  }

  const isLocalhost = ["localhost", "127.0.0.1"].includes(window.location.hostname);
  const origin = isLocalhost ? PRODUCTION_ORIGIN : window.location.origin;
  return `${origin}/event/${shareToken}`;
}

function getEventShareText(event: SharedEvent | CommunityEvent, url: string) {
  return [
    `הזמנה לאירוע „${event.title}”`,
    formatEventDate(event.starts_at, event.ends_at),
    event.location,
    event.participant_limit !== null ? `עד ${event.participant_limit} משתתפים` : "",
    event.description.trim(),
    "לצפייה ולהצטרפות:",
    url,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export default function Home() {
  const supabase = useMemo(() => createClient(), []);
  const profileImageInputRef = useRef<HTMLInputElement | null>(null);
  const adminMemberImageInputRef = useRef<HTMLInputElement | null>(null);
  const communityImageInputRef = useRef<HTMLInputElement | null>(null);
  const communityVideoInputRef = useRef<HTMLInputElement | null>(null);
  const eventImageInputRef = useRef<HTMLInputElement | null>(null);
  const galleryImageInputRef = useRef<HTMLInputElement | null>(null);
  const galleryVideoInputRef = useRef<HTMLInputElement | null>(null);
  const conversationMessageListRef = useRef<HTMLDivElement | null>(null);
  const conversationShouldScrollToEndRef = useRef(false);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [fullName, setFullName] = useState("");
  const [about, setAbout] = useState("");
  const [city, setCity] = useState("");
  const [phone, setPhone] = useState("");
  const [birthDay, setBirthDay] = useState("");
  const [birthMonth, setBirthMonth] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [profileScreenOpen, setProfileScreenOpen] = useState(false);
  const [systemUsageScreenOpen, setSystemUsageScreenOpen] = useState(false);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [selectedCommunityId, setSelectedCommunityId] = useState<string | null>(null);
  const [communityFormOpen, setCommunityFormOpen] = useState(false);
  const [editingCommunityId, setEditingCommunityId] = useState<string | null>(null);
  const [communityName, setCommunityName] = useState("");
  const [communityDescription, setCommunityDescription] = useState("");
  const [communityRequiresApproval, setCommunityRequiresApproval] = useState(true);
  const [profileImage, setProfileImage] = useState<SelectedImage | null>(null);
  const [profileCropRequest, setProfileCropRequest] = useState<ProfileCropRequest | null>(null);
  const [communityImage, setCommunityImage] = useState<SelectedImage | null>(null);
  const [communityVideo, setCommunityVideo] = useState<SelectedVideo | null>(null);
  const [communityVideoNotice, setCommunityVideoNotice] = useState<VideoProcessNotice | null>(null);
  const [lightbox, setLightbox] = useState<{ url: string; alt: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [communitiesLoading, setCommunitiesLoading] = useState(false);
  const [communitiesReady, setCommunitiesReady] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [legalScreenOpen, setLegalScreenOpen] = useState(false);
  const [legalConsentChecked, setLegalConsentChecked] = useState(false);
  const [legalConsentSaving, setLegalConsentSaving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingCommunity, setSavingCommunity] = useState(false);
  const [communityMembers, setCommunityMembers] = useState<CommunityMember[]>([]);
  const [joinRequests, setJoinRequests] = useState<CommunityJoinRequest[]>([]);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [communityEvents, setCommunityEvents] = useState<CommunityEvent[]>([]);
  const [eventMediaCounts, setEventMediaCounts] = useState<Record<string, EventMediaCount>>({});
  const [galleryScrollEventId, setGalleryScrollEventId] = useState<string | null>(null);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [eventAttendance, setEventAttendance] = useState<EventAttendance[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceStatus, setAttendanceStatus] = useState<AttendanceStatus | null>(null);
  const [savingAttendance, setSavingAttendance] = useState(false);
  const [attendanceMessage, setAttendanceMessage] = useState<string | null>(null);
  const [attendanceMessageTone, setAttendanceMessageTone] = useState<"error" | "success">("error");
  const [eventBringNeeds, setEventBringNeeds] = useState<EventBringNeed[]>([]);
  const [eventBringContributions, setEventBringContributions] = useState<EventBringContribution[]>([]);
  const [bringLoading, setBringLoading] = useState(false);
  const [bringItemName, setBringItemName] = useState("");
  const [bringNoteByContribution, setBringNoteByContribution] = useState<Record<string, string>>({});
  const [bringBusyKey, setBringBusyKey] = useState<string | null>(null);
  const [bringMessage, setBringMessage] = useState<string | null>(null);
  const [bringMessageTone, setBringMessageTone] = useState<"error" | "success">("error");
  const [eventFormOpen, setEventFormOpen] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [eventTitle, setEventTitle] = useState("");
  const [eventDateTime, setEventDateTime] = useState("");
  const [eventEndDateTime, setEventEndDateTime] = useState("");
  const [eventBringMode, setEventBringMode] = useState<EventBringMode>("free");
  const [eventBringNeedDrafts, setEventBringNeedDrafts] = useState<EventBringNeedDraft[]>([]);
  const [eventBringNeedName, setEventBringNeedName] = useState("");
  const [copyNeedsFromEventId, setCopyNeedsFromEventId] = useState("");
  const [eventHasParticipantLimit, setEventHasParticipantLimit] = useState(false);
  const [eventParticipantLimit, setEventParticipantLimit] = useState("");
  const [eventLocation, setEventLocation] = useState("");
  const [eventDescription, setEventDescription] = useState("");
  const [eventImage, setEventImage] = useState<SelectedImage | null>(null);
  const [savingEvent, setSavingEvent] = useState(false);
  const [reviewingUserId, setReviewingUserId] = useState<string | null>(null);
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);
  const [updatingRoleUserId, setUpdatingRoleUserId] = useState<string | null>(null);
  const [pendingMemberAction, setPendingMemberAction] = useState<PendingMemberAction | null>(null);
  const [memberActionBusy, setMemberActionBusy] = useState(false);
  const [systemAdminJoinBusy, setSystemAdminJoinBusy] = useState(false);
  const [whatsAppComposer, setWhatsAppComposer] = useState<WhatsAppComposerContext | null>(null);
  const [whatsAppMessage, setWhatsAppMessage] = useState("");
  const [shareCommunity, setShareCommunity] = useState<Community | null>(null);
  const [shareEvent, setShareEvent] = useState<CommunityEvent | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [activeCircleUsers, setActiveCircleUsers] = useState<ActiveCircleUser[]>([]);
  const [selectedActiveUser, setSelectedActiveUser] = useState<ActiveCircleUser | null>(null);
  const [galleryPhotos, setGalleryPhotos] = useState<EventGalleryPhoto[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [galleryBusy, setGalleryBusy] = useState(false);
  const [galleryVideoNotice, setGalleryVideoNotice] = useState<VideoProcessNotice | null>(null);
  const [mediaDefaults, setMediaDefaults] = useState<MediaDefaults>(FALLBACK_MEDIA_DEFAULTS);
  const [mediaDefaultsSaving, setMediaDefaultsSaving] = useState(false);
  const [mediaDefaultsMessage, setMediaDefaultsMessage] = useState<string | null>(null);
  const [mediaDefaultsMessageTone, setMediaDefaultsMessageTone] = useState<"error" | "success">("success");
  const [eventGalleryImageLimit, setEventGalleryImageLimit] = useState(String(DEFAULT_GALLERY_IMAGE_LIMIT));
  const [eventGalleryImageMaxMb, setEventGalleryImageMaxMb] = useState(String(DEFAULT_GALLERY_IMAGE_MAX_MB));
  const [eventGalleryVideoLimit, setEventGalleryVideoLimit] = useState(String(DEFAULT_GALLERY_VIDEO_LIMIT));
  const [eventGalleryVideoMaxMb, setEventGalleryVideoMaxMb] = useState(String(DEFAULT_GALLERY_VIDEO_MAX_MB));
  const [conversationTopics, setConversationTopics] = useState<EventConversationTopic[]>([]);
  const [conversationMessages, setConversationMessages] = useState<EventConversationMessage[]>([]);
  const [activeConversationTopicId, setActiveConversationTopicId] = useState<string | null>(null);
  const [conversationLoading, setConversationLoading] = useState(false);
  const [conversationMessage, setConversationMessage] = useState<string | null>(null);
  const [conversationMessageTone, setConversationMessageTone] = useState<"error" | "success">("error");
  const [editingConversationMessageId, setEditingConversationMessageId] = useState<string | null>(null);
  const [editingConversationBody, setEditingConversationBody] = useState("");
  const [conversationBusyMessageId, setConversationBusyMessageId] = useState<string | null>(null);
  const [cloneEventId, setCloneEventId] = useState("");
  const [directCloneEventId, setDirectCloneEventId] = useState<string | null>(null);
  const [personalEvents, setPersonalEvents] = useState<PersonalEventRow[]>([]);
  const [personalCommitments, setPersonalCommitments] = useState<Array<EventBringContribution & { event_title: string; starts_at: string; community_id: string; community_name: string; share_token: string }>>([]);
  const [personalLoading, setPersonalLoading] = useState(false);
  const [systemUsageLog, setSystemUsageLog] = useState<SystemUsageLogRow[]>([]);
  const [systemUsageLoading, setSystemUsageLoading] = useState(false);
  const [systemUsageError, setSystemUsageError] = useState<string | null>(null);
  const [editingMemberImage, setEditingMemberImage] = useState<CommunityMember | null>(null);
  const [adminMemberImage, setAdminMemberImage] = useState<SelectedImage | null>(null);
  const [savingMemberImage, setSavingMemberImage] = useState(false);
  const [memberImageMessage, setMemberImageMessage] = useState<string | null>(null);
  const [pendingShareToken, setPendingShareToken] = useState<string | null>(null);
  const [pendingEventShareToken, setPendingEventShareToken] = useState<string | null>(null);
  const [pendingEventOpenId, setPendingEventOpenId] = useState<string | null>(null);
  const [autoJoinAfterAuth, setAutoJoinAfterAuth] = useState(false);
  const [invitedCommunity, setInvitedCommunity] = useState<SharedCommunity | null>(null);
  const [invitedEvent, setInvitedEvent] = useState<SharedEvent | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [joinBusy, setJoinBusy] = useState(false);
  const [inviteStatus, setInviteStatus] = useState<"idle" | "pending">("idle");
  const [inviteDismissed, setInviteDismissed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"error" | "success">("error");
  const autoJoinAttemptedRef = useRef(false);
  const attendanceAutoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bringAutoSaveTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const freeBringAddBusyRef = useRef(false);
  const initialNavigationTargetRef = useRef<{
    eventToken?: string;
    circleToken?: string;
    profile?: boolean;
  } | null>(null);
  const directNavigationPreparedRef = useRef(false);

  const refreshActiveCircleUsers = useCallback(async () => {
    if (!user) return;

    const { error: heartbeatError } = await supabase.rpc("touch_user_presence");
    if (heartbeatError) {
      console.error("Updating presence failed", heartbeatError);
    }

    const { data, error } = await supabase.rpc("get_active_circle_members");
    if (error) {
      console.error("Loading active circle members failed", error);
      return;
    }

    const grouped = new Map<string, ActiveCircleUser>();
    for (const row of data ?? []) {
      const membership: ActiveCircleMembership = {
        community_id: row.community_id,
        community_name: row.community_name,
        joined_at: row.joined_at,
      };
      const existing = grouped.get(row.user_id);
      if (existing) {
        existing.memberships.push(membership);
      } else {
        grouped.set(row.user_id, {
          user_id: row.user_id,
          full_name: row.full_name || "משתמש",
          avatar_url: row.avatar_url ?? null,
          google_avatar_url: row.google_avatar_url ?? null,
          last_active_at: row.last_active_at,
          memberships: [membership],
        });
      }
    }

    const users = Array.from(grouped.values()).map((activeUser) => ({
      ...activeUser,
      memberships: activeUser.memberships.sort(
        (first, second) => new Date(second.joined_at).getTime() - new Date(first.joined_at).getTime(),
      ),
    }));
    users.sort((first, second) =>
      new Date(second.last_active_at).getTime() - new Date(first.last_active_at).getTime(),
    );
    setActiveCircleUsers(users);
  }, [supabase, user]);

  const clearSelectedImage = useCallback((image: SelectedImage | null) => {
    if (image?.previewUrl) URL.revokeObjectURL(image.previewUrl);
  }, []);

  useEffect(() => {
    return () => {
      if (profileCropRequest?.sourceUrl) URL.revokeObjectURL(profileCropRequest.sourceUrl);
    };
  }, [profileCropRequest]);

  const clearSelectedVideo = useCallback((video: SelectedVideo | null) => {
    if (video?.previewUrl) URL.revokeObjectURL(video.previewUrl);
  }, []);

  const loadCommunities = useCallback(
    async (currentUser: User) => {
      setCommunitiesLoading(true);
      setCommunitiesReady(false);

      const systemAdmin = isSystemAdminEmail(currentUser.email);
      const { data: memberships, error: membershipsError } = await supabase
        .from("community_members")
        .select("community_id,role,joined_at")
        .eq("user_id", currentUser.id)
        .order("joined_at", { ascending: false });

      if (membershipsError) {
        setMessageTone("error");
        setMessage("לא הצלחנו לטעון את המעגלים שלך.");
        setCommunitiesLoading(false);
        setCommunitiesReady(true);
        return;
      }

      if (!systemAdmin && (!memberships || memberships.length === 0)) {
        setCommunities([]);
        setCommunitiesLoading(false);
        setCommunitiesReady(true);
        return;
      }

      const communityIds = (memberships ?? []).map((membership) => membership.community_id);
      const roles = new Map(
        (memberships ?? []).map((membership) => [
          membership.community_id,
          membership.role as CommunityRole,
        ]),
      );

      let communitiesQuery = supabase
        .from("communities")
        .select("id,name,description,logo_url,video_url,requires_member_approval,created_by,created_at,updated_at,share_token");

      if (!systemAdmin) {
        communitiesQuery = communitiesQuery.in("id", communityIds);
      }

      const { data: communityRows, error: communitiesError } = await communitiesQuery
        .order("created_at", { ascending: false });

      if (communitiesError) {
        setMessageTone("error");
        setMessage("לא הצלחנו לטעון את פרטי המעגלים.");
        setCommunitiesLoading(false);
        setCommunitiesReady(true);
        return;
      }

      const loadedCommunityIds = (communityRows ?? []).map((community) => community.id);
      const { data: managerMembershipRows, error: managerMembershipError } = loadedCommunityIds.length
        ? await supabase
            .from("community_members")
            .select("community_id,user_id,role")
            .in("community_id", loadedCommunityIds)
            .in("role", ["owner", "admin"])
        : { data: [], error: null };

      if (managerMembershipError) {
        console.error("Loading circle managers failed", managerMembershipError);
      }

      const managerUserIds = Array.from(
        new Set((managerMembershipRows ?? []).map((membership) => membership.user_id)),
      );
      const { data: managerProfiles, error: managerProfilesError } = managerUserIds.length
        ? await supabase
            .from("profiles")
            .select("id,full_name")
            .in("id", managerUserIds)
        : { data: [], error: null };

      if (managerProfilesError) {
        console.error("Loading circle manager profiles failed", managerProfilesError);
      }

      const managerNamesByUserId = new Map(
        (managerProfiles ?? []).map((managerProfile) => [managerProfile.id, managerProfile.full_name]),
      );
      const managerNamesByCommunityId = new Map<string, string[]>();

      for (const membership of managerMembershipRows ?? []) {
        const managerName = managerNamesByUserId.get(membership.user_id);
        if (!managerName) continue;
        const currentNames = managerNamesByCommunityId.get(membership.community_id) ?? [];
        if (!currentNames.includes(managerName)) currentNames.push(managerName);
        managerNamesByCommunityId.set(membership.community_id, currentNames);
      }

      setCommunities(
        (communityRows ?? []).map((community) => ({
          ...community,
          role: roles.get(community.id) ?? "member",
          is_member: roles.has(community.id),
          manager_names: managerNamesByCommunityId.get(community.id) ?? [],
        })),
      );
      setCommunitiesLoading(false);
      setCommunitiesReady(true);
    },
    [supabase],
  );

  const loadCommunityPeople = useCallback(
    async (communityId: string, role: CommunityRole) => {
      setPeopleLoading(true);

      const { data: membershipRows, error: membershipError } = await supabase
        .from("community_members")
        .select("user_id,role,joined_at")
        .eq("community_id", communityId)
        .order("joined_at", { ascending: true });

      if (membershipError) {
        console.error("Loading circle members failed", membershipError);
        setCommunityMembers([]);
        setJoinRequests([]);
        setPeopleLoading(false);
        return;
      }

      const userIds = (membershipRows ?? []).map((membership) => membership.user_id);
      const { data: profileRows, error: profilesError } = userIds.length
        ? await supabase
            .from("profiles")
            .select("id,full_name,email,city,phone,avatar_url,google_avatar_url")
            .in("id", userIds)
        : { data: [], error: null };

      if (profilesError) {
        console.error("Loading member profiles failed", profilesError);
      }

      const profilesById = new Map(
        (profileRows ?? []).map((memberProfile) => [memberProfile.id, memberProfile]),
      );

      const mappedMembers = (membershipRows ?? []).map((membership) => {
        const memberProfile = profilesById.get(membership.user_id);
        return {
          user_id: membership.user_id,
          role: membership.role as CommunityRole,
          joined_at: membership.joined_at,
          full_name: memberProfile?.full_name || "משתמש",
          email: memberProfile?.email ?? null,
          city: memberProfile?.city ?? "",
          phone: memberProfile?.phone ?? "",
          avatar_url: memberProfile?.avatar_url ?? null,
          google_avatar_url: memberProfile?.google_avatar_url ?? null,
        };
      });

      mappedMembers.sort((first, second) => {
        const firstManager = first.role === "owner" || first.role === "admin" ? 0 : 1;
        const secondManager = second.role === "owner" || second.role === "admin" ? 0 : 1;
        if (firstManager !== secondManager) return firstManager - secondManager;
        return first.full_name.localeCompare(second.full_name, "he", {
          sensitivity: "base",
        });
      });
      setCommunityMembers(mappedMembers);

      if (canManageCommunity(role, user?.email)) {
        const { data: requestRows, error: requestsError } = await supabase.rpc(
          "get_community_join_requests",
          { target_community_id: communityId },
        );

        if (requestsError) {
          console.error("Loading join requests failed", requestsError);
          setJoinRequests([]);
        } else {
          setJoinRequests((requestRows ?? []) as CommunityJoinRequest[]);
        }
      } else {
        setJoinRequests([]);
      }

      setPeopleLoading(false);
    },
    [supabase, user?.email],
  );

  const loadSystemUsageLog = useCallback(async () => {
    if (!user || !isSystemAdminEmail(user.email)) {
      setSystemUsageLog([]);
      setSystemUsageError(null);
      return;
    }

    setSystemUsageLoading(true);
    setSystemUsageError(null);

    const { error: finalizeError } = await supabase.rpc("touch_user_presence");
    if (finalizeError) {
      console.error("Finalizing inactive usage sessions failed", finalizeError);
    }

    const { data, error } = await supabase.rpc("get_system_admin_usage_log");
    if (error) {
      console.error("Loading system usage log failed", error);
      setSystemUsageLog([]);
      setSystemUsageError(
        error.code === "42883" || error.code === "42P01" || error.code === "PGRST202"
          ? "יש להריץ את קובץ ה־SQL של circles137 ב־Supabase."
          : "לא הצלחנו לטעון את לוג השימוש במערכת.",
      );
      setSystemUsageLoading(false);
      return;
    }

    setSystemUsageLog(
      (data ?? []).map((row: {
        session_id: string;
        user_id: string;
        full_name: string | null;
        community_names: string[] | null;
        duration_seconds: number | string | null;
        started_at: string;
        ended_at: string;
      }) => ({
        session_id: row.session_id,
        user_id: row.user_id,
        full_name: row.full_name || "משתמש",
        community_names: Array.isArray(row.community_names) ? row.community_names : [],
        duration_seconds: Number(row.duration_seconds ?? 0),
        started_at: row.started_at,
        ended_at: row.ended_at,
      })),
    );
    setSystemUsageLoading(false);
  }, [supabase, user]);

  const loadMediaDefaults = useCallback(async () => {
    const { data, error } = await supabase
      .from("system_media_settings")
      .select("default_gallery_image_limit,default_gallery_image_max_mb,default_gallery_video_limit,default_gallery_video_max_mb")
      .eq("id", 1)
      .maybeSingle();

    if (error) {
      if (error.code !== "42P01") console.error("Loading media defaults failed", error);
      setMediaDefaults(FALLBACK_MEDIA_DEFAULTS);
      return;
    }

    if (!data) {
      setMediaDefaults(FALLBACK_MEDIA_DEFAULTS);
      return;
    }

    setMediaDefaults({
      default_gallery_image_limit: Number(data.default_gallery_image_limit),
      default_gallery_image_max_mb: Number(data.default_gallery_image_max_mb),
      default_gallery_video_limit: Number(data.default_gallery_video_limit),
      default_gallery_video_max_mb: Number(data.default_gallery_video_max_mb),
    });
  }, [supabase]);

  const loadCommunityEvents = useCallback(
    async (communityId: string) => {
      setEventsLoading(true);

      const { data, error } = await supabase
        .from("community_events")
        .select(
          "id,community_id,title,description,location,starts_at,ends_at,image_url,participant_limit,bring_mode,gallery_image_limit,gallery_image_max_mb,gallery_video_limit,gallery_video_max_mb,share_token,status,cancelled_at,cancelled_by,created_at,updated_at,created_by",
        )
        .eq("community_id", communityId)
        .order("starts_at", { ascending: true });

      if (error) {
        console.error("Loading circle events failed", error);
        setCommunityEvents([]);
        setEventMediaCounts({});
        setMessageTone("error");
        setMessage(
          error.code === "42P01"
            ? "יש להריץ את קובץ ה־SQL של circles24 ב־Supabase."
            : error.code === "42703"
              ? "יש להריץ את קובץ ה־SQL של circles127 ב־Supabase."
              : "לא הצלחנו לטעון את אירועי המעגל.",
        );
      } else {
        const events = (data ?? []) as CommunityEvent[];
        setCommunityEvents(events);

        if (events.length === 0) {
          setEventMediaCounts({});
        } else {
          const { data: mediaRows, error: mediaError } = await supabase
            .from("event_gallery_photos")
            .select("event_id,media_type")
            .in("event_id", events.map((event) => event.id));

          if (mediaError) {
            console.error("Loading event gallery counts failed", mediaError);
            setEventMediaCounts({});
          } else {
            const nextCounts: Record<string, EventMediaCount> = {};
            for (const row of mediaRows ?? []) {
              const current = nextCounts[row.event_id] ?? { imageCount: 0, videoCount: 0 };
              if (row.media_type === "video") current.videoCount += 1;
              else current.imageCount += 1;
              nextCounts[row.event_id] = current;
            }
            setEventMediaCounts(nextCounts);
          }
        }
      }

      setEventsLoading(false);
    },
    [supabase],
  );

  const loadEventAttendance = useCallback(
    async (eventId: string) => {
      setAttendanceLoading(true);
      setAttendanceMessage(null);

      const { data: attendanceRows, error: attendanceError } = await supabase
        .from("event_attendance")
        .select("event_id,user_id,status,created_at,updated_at")
        .eq("event_id", eventId)
        .order("updated_at", { ascending: true });

      if (attendanceError) {
        console.error("Loading event attendance failed", attendanceError);
        setEventAttendance([]);
        setAttendanceMessageTone("error");
        setAttendanceMessage(
          attendanceError.code === "42P01"
            ? "יש להריץ את קובץ ה־SQL של circles30 ב־Supabase."
            : `לא הצלחנו לטעון את ההשתתפות באירוע. ${formatSupabaseError(attendanceError)}`,
        );
        setAttendanceLoading(false);
        return;
      }

      const userIds = (attendanceRows ?? []).map((attendance) => attendance.user_id);
      const { data: profileRows, error: profilesError } = userIds.length
        ? await supabase
            .from("profiles")
            .select("id,full_name,email,city,phone,avatar_url,google_avatar_url")
            .in("id", userIds)
        : { data: [], error: null };

      if (profilesError) {
        console.error("Loading attendee profiles failed", profilesError);
      }

      const profilesById = new Map(
        (profileRows ?? []).map((attendeeProfile) => [attendeeProfile.id, attendeeProfile]),
      );

      const roleByUserId = new Map(
        communityMembers.map((member) => [member.user_id, member.role]),
      );
      const mappedAttendance = (attendanceRows ?? []).map((attendance) => {
        const attendeeProfile = profilesById.get(attendance.user_id);
        return {
          ...attendance,
          status: attendance.status as AttendanceStatus,
          full_name: attendeeProfile?.full_name || "משתמש",
          email: attendeeProfile?.email ?? null,
          city: attendeeProfile?.city ?? "",
          phone: attendeeProfile?.phone ?? "",
          community_role: roleByUserId.get(attendance.user_id) ?? null,
          avatar_url: attendeeProfile?.avatar_url ?? null,
          google_avatar_url: attendeeProfile?.google_avatar_url ?? null,
        };
      }) as EventAttendance[];

      mappedAttendance.sort(
        (first, second) =>
          new Date(first.created_at).getTime() - new Date(second.created_at).getTime(),
      );
      setEventAttendance(mappedAttendance);

      const ownAttendance = user
        ? mappedAttendance.find((attendance) => attendance.user_id === user.id) ?? null
        : null;

      setAttendanceStatus(ownAttendance?.status ?? null);
      setAttendanceLoading(false);
    },
    [communityMembers, supabase, user],
  );

  const loadEventBringData = useCallback(
    async (eventId: string) => {
      setBringLoading(true);
      setBringMessage(null);

      const { data: needRows, error: needsError } = await supabase
        .from("event_bring_needs")
        .select("id,event_id,item_name,quantity_needed,created_at")
        .eq("event_id", eventId)
        .order("created_at", { ascending: true });

      const { data: contributionRows, error: contributionsError } = await supabase
        .from("event_bring_contributions")
        .select("id,event_id,need_id,user_id,item_name,quantity,note,created_at")
        .eq("event_id", eventId)
        .order("created_at", { ascending: true });

      if (needsError || contributionsError) {
        console.error("Loading bring table failed", needsError ?? contributionsError);
        setEventBringNeeds([]);
        setEventBringContributions([]);
        setBringMessageTone("error");
        setBringMessage(
          (needsError?.code ?? contributionsError?.code) === "42P01"
            ? "יש להריץ את קובץ ה־SQL של circles32 ב־Supabase."
            : "לא הצלחנו לטעון את טבלת מה מביאים.",
        );
        setBringLoading(false);
        return;
      }

      const userIds = Array.from(
        new Set((contributionRows ?? []).map((contribution) => contribution.user_id)),
      );
      const { data: profileRows, error: profilesError } = userIds.length
        ? await supabase
            .from("profiles")
            .select("id,full_name,avatar_url,google_avatar_url")
            .in("id", userIds)
        : { data: [], error: null };

      if (profilesError) console.error("Loading bring contributor profiles failed", profilesError);

      const profilesById = new Map(
        (profileRows ?? []).map((contributorProfile) => [contributorProfile.id, contributorProfile]),
      );

      const mappedContributions = (contributionRows ?? []).map((contribution) => {
        const contributorProfile = profilesById.get(contribution.user_id);
        return {
          ...contribution,
          full_name: contributorProfile?.full_name || "משתמש",
          avatar_url: contributorProfile?.avatar_url ?? null,
          google_avatar_url: contributorProfile?.google_avatar_url ?? null,
        };
      }) as EventBringContribution[];

      setEventBringNeeds((needRows ?? []) as EventBringNeed[]);
      setEventBringContributions(mappedContributions);
      setBringNoteByContribution(
        Object.fromEntries(
          mappedContributions
            .filter((contribution) => contribution.user_id === user?.id)
            .map((contribution) => [contribution.id, contribution.note ?? ""]),
        ),
      );
      setBringLoading(false);
    },
    [supabase, user],
  );

  const loadNotifications = useCallback(async () => {
    if (!user) return;
    setNotificationsLoading(true);
    const { data, error } = await supabase
      .from("notifications")
      .select("id,community_id,event_id,type,title,body,read_at,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("Loading notifications failed", error);
      setNotifications([]);
    } else {
      setNotifications((data ?? []) as AppNotification[]);
    }
    setNotificationsLoading(false);
  }, [supabase, user]);

  const loadEventGallery = useCallback(async (eventId: string) => {
    setGalleryLoading(true);
    const { data: photoRows, error } = await supabase
      .from("event_gallery_photos")
      .select("id,event_id,user_id,image_url,media_type,created_at")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Loading event gallery failed", error);
      setGalleryPhotos([]);
      setGalleryLoading(false);
      return;
    }

    const userIds = Array.from(new Set((photoRows ?? []).map((photo) => photo.user_id)));
    const { data: profileRows } = userIds.length
      ? await supabase.from("profiles").select("id,full_name").in("id", userIds)
      : { data: [] };
    const names = new Map((profileRows ?? []).map((row) => [row.id, row.full_name]));
    const mappedGalleryPhotos = (photoRows ?? []).map((photo) => ({
      ...photo,
      full_name: names.get(photo.user_id) || "משתמש",
    })) as EventGalleryPhoto[];
    setGalleryPhotos(mappedGalleryPhotos);
    setEventMediaCounts((current) => ({
      ...current,
      [eventId]: {
        imageCount: mappedGalleryPhotos.filter((photo) => photo.media_type === "image").length,
        videoCount: mappedGalleryPhotos.filter((photo) => photo.media_type === "video").length,
      },
    }));
    setGalleryLoading(false);
  }, [supabase]);

  const loadEventConversations = useCallback(async (
    eventId: string,
    options: { showLoading?: boolean; scrollToEnd?: boolean } = {},
  ) => {
    const showLoading = options.showLoading !== false;
    if (options.scrollToEnd !== false) conversationShouldScrollToEndRef.current = true;
    if (showLoading) {
      setConversationLoading(true);
      setConversationMessage(null);
    }

    const { data: topicRows, error: topicsError } = await supabase
      .from("event_conversation_topics")
      .select("id,event_id,slug,title,sort_order,created_at")
      .eq("event_id", eventId)
      .order("sort_order", { ascending: true });

    if (topicsError) {
      console.error("Loading event conversation topics failed", topicsError);
      setConversationTopics([]);
      setConversationMessages([]);
      setConversationMessageTone("error");
      setConversationMessage(
        topicsError.code === "42P01"
          ? "יש להריץ את קובץ ה־SQL של circles119 ב־Supabase."
          : "לא הצלחנו לטעון את השיחות באירוע.",
      );
      if (showLoading) setConversationLoading(false);
      return;
    }

    const topics = (topicRows ?? []) as EventConversationTopic[];
    setConversationTopics(topics);
    setActiveConversationTopicId((currentTopicId) =>
      topics.some((topic) => topic.id === currentTopicId)
        ? currentTopicId
        : topics[0]?.id ?? null,
    );

    const { data: messageRows, error: messagesError } = await supabase
      .from("event_conversation_messages")
      .select("id,event_id,topic_id,user_id,body,created_at,updated_at")
      .eq("event_id", eventId)
      .order("created_at", { ascending: true });

    if (messagesError) {
      console.error("Loading event conversation messages failed", messagesError);
      setConversationMessages([]);
      setConversationMessageTone("error");
      setConversationMessage("לא הצלחנו לטעון את ההודעות באירוע.");
      if (showLoading) setConversationLoading(false);
      return;
    }

    const userIds = Array.from(new Set((messageRows ?? []).map((row) => row.user_id)));
    const { data: profileRows, error: profilesError } = userIds.length
      ? await supabase
          .from("profiles")
          .select("id,full_name,avatar_url,google_avatar_url")
          .in("id", userIds)
      : { data: [], error: null };

    if (profilesError) {
      console.error("Loading conversation author profiles failed", profilesError);
    }

    const profilesById = new Map(
      (profileRows ?? []).map((row) => [row.id, row]),
    );

    setConversationMessages(
      (messageRows ?? []).map((row) => {
        const authorProfile = profilesById.get(row.user_id);
        return {
          ...row,
          full_name: authorProfile?.full_name || "משתמש",
          avatar_url: authorProfile?.avatar_url ?? null,
          google_avatar_url: authorProfile?.google_avatar_url ?? null,
        };
      }) as EventConversationMessage[],
    );
    if (showLoading) setConversationLoading(false);
  }, [supabase]);

  const loadPersonalDashboard = useCallback(async () => {
    if (!user || communities.length === 0) {
      setPersonalEvents([]);
      setPersonalCommitments([]);
      return;
    }

    setPersonalLoading(true);
    const { data: attendanceRows, error: attendanceError } = await supabase
      .from("event_attendance")
      .select("event_id,user_id,status,created_at,updated_at")
      .eq("user_id", user.id)
      .in("status", ["going", "maybe"]);

    const eventIds = Array.from(new Set((attendanceRows ?? []).map((row) => row.event_id)));
    const { data: eventRows, error: eventsError } = eventIds.length
      ? await supabase
          .from("community_events")
          .select("id,community_id,title,description,location,starts_at,ends_at,image_url,participant_limit,bring_mode,gallery_image_limit,gallery_image_max_mb,gallery_video_limit,gallery_video_max_mb,share_token,status,cancelled_at,cancelled_by,created_at,updated_at,created_by")
          .in("id", eventIds)
      : { data: [], error: null };

    if (attendanceError || eventsError) {
      console.error("Loading personal events failed", attendanceError ?? eventsError);
      setPersonalEvents([]);
    } else {
      const attendanceByEvent = new Map((attendanceRows ?? []).map((row) => [row.event_id, row]));
      const communityById = new Map(communities.map((community) => [community.id, community]));
      const rows = (eventRows ?? [])
        .map((event) => {
          const community = communityById.get(event.community_id);
          if (!community) return null;
          const attendance = attendanceByEvent.get(event.id);
          return {
            event: event as CommunityEvent,
            community,
            attendance: attendance
              ? ({
                  ...attendance,
                  status: attendance.status as AttendanceStatus,
                  full_name: profile?.full_name ?? "",
                  phone: profile?.phone ?? "",
                  community_role: community.role,
                  avatar_url: profile?.avatar_url ?? null,
                  google_avatar_url: profile?.google_avatar_url ?? null,
                } as EventAttendance)
              : null,
          };
        })
        .filter(Boolean) as PersonalEventRow[];
      rows.sort((a, b) => new Date(b.event.starts_at).getTime() - new Date(a.event.starts_at).getTime());
      setPersonalEvents(rows);
    }

    const { data: contributionRows, error: contributionError } = await supabase
      .from("event_bring_contributions")
      .select("id,event_id,need_id,user_id,item_name,quantity,note,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (contributionError) {
      console.error("Loading personal commitments failed", contributionError);
      setPersonalCommitments([]);
    } else {
      const contributionEventIds = Array.from(new Set((contributionRows ?? []).map((row) => row.event_id)));
      const { data: contributionEventRows } = contributionEventIds.length
        ? await supabase
            .from("community_events")
            .select("id,community_id,title,starts_at,share_token")
            .in("id", contributionEventIds)
        : { data: [] };
      const eventById = new Map((contributionEventRows ?? []).map((row) => [row.id, row]));
      const communityById = new Map(communities.map((community) => [community.id, community]));
      setPersonalCommitments(
        (contributionRows ?? [])
          .map((row) => {
            const event = eventById.get(row.event_id);
            if (!event) return null;
            const community = communityById.get(event.community_id);
            return {
              ...row,
              full_name: profile?.full_name ?? "",
              avatar_url: profile?.avatar_url ?? null,
              google_avatar_url: profile?.google_avatar_url ?? null,
              event_title: event.title,
              starts_at: event.starts_at,
              community_id: event.community_id,
              community_name: community?.name ?? "",
              share_token: event.share_token,
            };
          })
          .filter(Boolean) as Array<EventBringContribution & { event_title: string; starts_at: string; community_id: string; community_name: string; share_token: string }>,
      );
    }
    setPersonalLoading(false);
  }, [communities, profile, supabase, user]);

  const loadSharedInvite = useCallback(
    async (shareToken: string) => {
      setInviteLoading(true);
      const { data, error } = await supabase.rpc("get_shared_community", {
        target_share_token: shareToken,
      });

      if (error || !data?.[0]) {
        console.error("Loading shared circle failed", error);
        setInvitedCommunity(null);
        setMessageTone("error");
        setMessage("קישור ההצטרפות אינו תקין או שהמעגל כבר אינו זמין.");
      } else {
        setInvitedCommunity(data[0] as SharedCommunity);
      }

      setInviteLoading(false);
    },
    [supabase],
  );

  const loadSharedEvent = useCallback(
    async (shareToken: string) => {
      setInviteLoading(true);
      const { data, error } = await supabase.rpc("get_shared_event", {
        target_share_token: shareToken,
      });

      if (error || !data?.[0]) {
        console.error("Loading shared event failed", error);
        setInvitedEvent(null);
        setInvitedCommunity(null);
        setMessageTone("error");
        setMessage("קישור האירוע אינו תקין או שהאירוע כבר אינו זמין.");
      } else {
        const sharedEvent = data[0] as SharedEvent;
        setInvitedEvent(sharedEvent);
        setInvitedCommunity({
          id: sharedEvent.community_id,
          name: sharedEvent.community_name,
          description: sharedEvent.community_description,
          logo_url: sharedEvent.community_logo_url,
          requires_member_approval: sharedEvent.community_requires_member_approval,
          share_token: sharedEvent.community_share_token,
        });
      }

      setInviteLoading(false);
    },
    [supabase],
  );

  function setBrowserView(
    view: { circleToken?: string; eventToken?: string; profile?: boolean; usageLog?: boolean },
    mode: "push" | "replace" = "push",
  ) {
    const params = new URLSearchParams();
    if (view.eventToken) params.set("event", view.eventToken);
    else if (view.circleToken) params.set("circle", view.circleToken);
    else if (view.profile) params.set("view", "profile");
    else if (view.usageLog) params.set("view", "usage-log");

    const nextUrl = params.size ? `/?${params.toString()}` : "/";
    const viewName = view.eventToken
      ? "event"
      : view.circleToken
        ? "circle"
        : view.profile
          ? "profile"
          : view.usageLog
            ? "usage-log"
            : "home";
    const state = { circlesApp: true, view: viewName };
    if (mode === "replace") window.history.replaceState(state, "", nextUrl);
    else window.history.pushState(state, "", nextUrl);
  }

  function normalizeInviteAddress() {
    if (pendingEventShareToken) {
      setBrowserView({ eventToken: pendingEventShareToken }, "replace");
    } else if (pendingShareToken) {
      setBrowserView({ circleToken: pendingShareToken }, "replace");
    }
  }

  const loadProfile = useCallback(
    async (currentUser: User) => {
      setProfileLoading(true);
      setMessage(null);

      const googleProfile = getGoogleProfile(currentUser);
      const { data, error } = await supabase
        .from("profiles")
        .select("id,email,full_name,about,city,phone,birth_day,birth_month,birth_year,avatar_url,google_avatar_url,legal_accepted_at,legal_version")
        .eq("id", currentUser.id)
        .maybeSingle<Profile>();

      if (error) {
        setMessageTone("error");
        setMessage(
          error.code === "42P01"
            ? "יש להריץ תחילה את קובץ ה־SQL של circles3 ב־Supabase."
            : error.code === "42703"
              ? "יש להריץ את קובץ ה־SQL של circles130 ב־Supabase."
              : "לא הצלחנו לטעון את הפרופיל. נסו לרענן את הדף.",
        );
        setProfileLoading(false);
        return;
      }

      let loadedProfile = data;

      if (!loadedProfile) {
        const { data: createdProfile, error: insertError } = await supabase
          .from("profiles")
          .insert({
            id: currentUser.id,
            email: currentUser.email ?? null,
            full_name: googleProfile.fullName,
            google_avatar_url: googleProfile.avatarUrl,
          })
          .select("id,email,full_name,about,city,phone,birth_day,birth_month,birth_year,avatar_url,google_avatar_url,legal_accepted_at,legal_version")
          .single<Profile>();

        if (insertError) {
          setMessageTone("error");
          setMessage("לא הצלחנו ליצור את הפרופיל שלך.");
          setProfileLoading(false);
          return;
        }

        loadedProfile = createdProfile;
      } else if (
        loadedProfile.email !== (currentUser.email ?? null) ||
        loadedProfile.google_avatar_url !== googleProfile.avatarUrl
      ) {
        const { data: refreshedProfile } = await supabase
          .from("profiles")
          .update({
            email: currentUser.email ?? null,
            google_avatar_url: googleProfile.avatarUrl,
          })
          .eq("id", currentUser.id)
          .select("id,email,full_name,about,city,phone,birth_day,birth_month,birth_year,avatar_url,google_avatar_url,legal_accepted_at,legal_version")
          .single<Profile>();

        loadedProfile = refreshedProfile ?? loadedProfile;
      }

      setProfile(loadedProfile);
      setFullName(loadedProfile.full_name);
      setAbout(loadedProfile.about);
      setCity(loadedProfile.city);
      setPhone(loadedProfile.phone);
      setBirthDay(loadedProfile.birth_day?.toString() ?? "");
      setBirthMonth(loadedProfile.birth_month?.toString() ?? "");
      setBirthYear(loadedProfile.birth_year?.toString() ?? "");
      setProfileLoading(false);
    },
    [supabase],
  );

  useEffect(() => {
    const isLocalhost = ["localhost", "127.0.0.1"].includes(window.location.hostname);
    const previousScrollRestoration = window.history.scrollRestoration;
    document.documentElement.classList.toggle("is-localhost", isLocalhost);
    window.history.scrollRestoration = "manual";

    return () => {
      document.documentElement.classList.remove("is-localhost");
      window.history.scrollRestoration = previousScrollRestoration;
    };
  }, []);

  useEffect(() => {
    const selected = communities.find((community) => community.id === selectedCommunityId) ?? null;
    const selectedEventForTitle =
      communityEvents.find((event) => event.id === selectedEventId) ?? null;
    const manifestHref = selected
      ? `/api/manifest?circle=${encodeURIComponent(selected.share_token)}`
      : "/manifest.webmanifest";

    let manifestLink = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (!manifestLink) {
      manifestLink = document.createElement("link");
      manifestLink.rel = "manifest";
      document.head.appendChild(manifestLink);
    }
    manifestLink.href = manifestHref;

    let appTitleMeta = document.querySelector<HTMLMetaElement>(
      'meta[name="apple-mobile-web-app-title"]',
    );
    if (!appTitleMeta) {
      appTitleMeta = document.createElement("meta");
      appTitleMeta.name = "apple-mobile-web-app-title";
      document.head.appendChild(appTitleMeta);
    }
    appTitleMeta.content = selected?.name ?? "מעגלים";
    document.title = selectedEventForTitle
      ? getEventBrowserTitle(selectedEventForTitle)
      : selected?.name ?? "מעגלים";
  }, [communities, communityEvents, selectedCommunityId, selectedEventId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const joinToken = params.get("join");
    const circleToken = params.get("circle");
    const eventToken = params.get("event");
    const requestedView = params.get("view");
    const authError = params.get("auth_error");
    const shouldAutoJoin = params.get("autojoin") === "1";

    const existingHistoryState = window.history.state as { circlesApp?: boolean } | null;
    if (!existingHistoryState?.circlesApp) {
      initialNavigationTargetRef.current = eventToken
        ? { eventToken }
        : joinToken || circleToken
          ? { circleToken: joinToken ?? circleToken ?? undefined }
          : requestedView === "profile"
            ? { profile: true }
            : null;

      if (requestedView === "profile" || requestedView === "usage-log") {
        window.history.replaceState({ circlesApp: true, view: "home" }, "", "/");
        window.history.pushState(
          { circlesApp: true, view: requestedView },
          "",
          `/?view=${requestedView}`,
        );
        directNavigationPreparedRef.current = true;
      } else if (!eventToken && !joinToken && !circleToken) {
        window.history.replaceState({ circlesApp: true, view: "home" }, "", "/");
        directNavigationPreparedRef.current = true;
      } else {
        window.history.replaceState(
          { circlesApp: true, view: eventToken ? "event-pending" : "circle-pending" },
          "",
          window.location.href,
        );
      }
    }

    if (requestedView === "profile") setProfileScreenOpen(true);
    if (requestedView === "usage-log") setSystemUsageScreenOpen(true);

    if (eventToken) {
      setPendingEventShareToken(eventToken);
      setAutoJoinAfterAuth(shouldAutoJoin);
      void loadSharedEvent(eventToken);
    } else if (joinToken || circleToken) {
      const targetCircleToken = joinToken ?? circleToken!;
      setPendingShareToken(targetCircleToken);
      setAutoJoinAfterAuth(shouldAutoJoin);
      void loadSharedInvite(targetCircleToken);
    }

    if (authError) {
      params.delete("auth_error");
      const nextUrl = params.size
        ? `${window.location.pathname}?${params.toString()}`
        : window.location.pathname;
      window.history.replaceState({}, "", nextUrl);
      queueMicrotask(() => {
        setMessageTone("error");
        setMessage(authError);
      });
    }

    supabase.auth.getUser().then(({ data, error }) => {
      if (!error) {
        setUser(data.user);
        if (data.user) {
          void Promise.all([loadProfile(data.user), loadCommunities(data.user)]);
        }
      }
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ?? null;
      setUser(nextUser);
      setLoading(false);

      if (nextUser) {
        void Promise.all([loadProfile(nextUser), loadCommunities(nextUser)]);
      } else {
        setProfile(null);
        setFullName("");
        setAbout("");
        setCommunities([]);
        setCommunitiesReady(false);
        setSelectedCommunityId(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [loadCommunities, loadProfile, loadSharedEvent, loadSharedInvite, supabase]);

  useEffect(() => {
    if (!user || !profile) {
      setActiveCircleUsers([]);
      return;
    }

    void refreshActiveCircleUsers();
    const intervalId = window.setInterval(() => {
      void refreshActiveCircleUsers();
    }, 30_000);

    return () => window.clearInterval(intervalId);
  }, [profile, refreshActiveCircleUsers, user]);

  const activePageKey = !user
    ? "login"
    : legalScreenOpen
      ? "legal"
      : eventFormOpen
        ? `event-editor:${editingEventId ?? "new"}`
        : communityFormOpen
          ? `community-editor:${editingCommunityId ?? "new"}`
          : shareEvent
            ? `event-share:${shareEvent.id}`
            : systemUsageScreenOpen
              ? "usage-log"
              : profileScreenOpen
                ? "profile"
                : selectedEventId
                  ? `event:${selectedEventId}`
                  : selectedCommunityId
                  ? `community:${selectedCommunityId}`
                  : "home";

  useLayoutEffect(() => {
    const resetPageViewport = () => {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }

      document.documentElement.scrollLeft = 0;
      document.body.scrollLeft = 0;
      window.scrollTo({ left: 0, top: 0, behavior: "auto" });
    };

    resetPageViewport();
    const frame = window.requestAnimationFrame(resetPageViewport);
    const timer = window.setTimeout(resetPageViewport, 50);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [activePageKey]);

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      return;
    }

    void loadNotifications();
    const timer = window.setInterval(() => void loadNotifications(), 30_000);
    const notificationsChannel = supabase
      .channel(`notifications-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        () => void loadNotifications(),
      )
      .subscribe();

    return () => {
      window.clearInterval(timer);
      void supabase.removeChannel(notificationsChannel);
    };
  }, [loadNotifications, supabase, user]);

  useEffect(() => {
    if (profileScreenOpen) void loadPersonalDashboard();
  }, [loadPersonalDashboard, profileScreenOpen]);

  useEffect(() => {
    if (!systemUsageScreenOpen || !user || !isSystemAdminEmail(user.email)) {
      setSystemUsageLog([]);
      setSystemUsageError(null);
      return;
    }

    void loadSystemUsageLog();
  }, [loadSystemUsageLog, systemUsageScreenOpen, user]);

  useEffect(() => {
    if (!systemUsageScreenOpen || !user || isSystemAdminEmail(user.email)) return;
    setSystemUsageScreenOpen(false);
    window.history.replaceState({ circlesApp: true, view: "home" }, "", "/");
  }, [systemUsageScreenOpen, user]);

  useEffect(() => {
    if (user) void loadMediaDefaults();
  }, [loadMediaDefaults, user]);

  useLayoutEffect(() => {
    const editorOpen = eventFormOpen;
    const root = document.documentElement;
    const body = document.body;

    root.classList.toggle("editor-screen-open", editorOpen);
    body.classList.toggle("editor-screen-open", editorOpen);

    if (!editorOpen) return;

    const resetEditorViewport = () => {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }

      // In an RTL document Chrome can retain a negative horizontal scroll
      // position when the previous screen is replaced by an editor screen.
      root.scrollLeft = 0;
      body.scrollLeft = 0;
      window.scrollTo({ left: 0, top: 0, behavior: "auto" });
    };

    resetEditorViewport();
    const frame = window.requestAnimationFrame(resetEditorViewport);
    const timer = window.setTimeout(resetEditorViewport, 50);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      root.classList.remove("editor-screen-open");
      body.classList.remove("editor-screen-open");
    };
  }, [communityFormOpen, editingCommunityId, eventFormOpen]);

  useEffect(() => {
    const applyAddressState = () => {
      const params = new URLSearchParams(window.location.search);
      const eventToken = params.get("event");
      const circleToken = params.get("circle");
      const joinToken = params.get("join");
      const requestedView = params.get("view");

      setCommunityFormOpen(false);
      setEventFormOpen(false);
      setProfileScreenOpen(requestedView === "profile");
      setSystemUsageScreenOpen(requestedView === "usage-log");

      if (requestedView === "profile" || requestedView === "usage-log") {
        setSelectedEventId(null);
        setSelectedCommunityId(null);
        return;
      }

      if (eventToken) {
        const localEvent = communityEvents.find((event) => event.share_token === eventToken);
        if (localEvent) {
          setSelectedCommunityId(localEvent.community_id);
          setSelectedEventId(localEvent.id);
          return;
        }
        setPendingEventShareToken(eventToken);
        setPendingShareToken(null);
        void loadSharedEvent(eventToken);
        return;
      }

      const targetCircleToken = circleToken ?? joinToken;
      if (targetCircleToken) {
        const localCommunity = communities.find(
          (community) => community.share_token === targetCircleToken,
        );
        if (localCommunity) {
          setSelectedEventId(null);
          setSelectedCommunityId(localCommunity.id);
          return;
        }
        setPendingShareToken(targetCircleToken);
        setPendingEventShareToken(null);
        void loadSharedInvite(targetCircleToken);
        return;
      }

      setSelectedEventId(null);
      setSelectedCommunityId(null);
      setPendingShareToken(null);
      setPendingEventShareToken(null);
    };

    window.addEventListener("popstate", applyAddressState);
    return () => window.removeEventListener("popstate", applyAddressState);
  }, [communities, communityEvents, loadSharedEvent, loadSharedInvite]);

  useEffect(() => {
    return () => {
      Object.values(bringAutoSaveTimeoutsRef.current).forEach(clearTimeout);
      bringAutoSaveTimeoutsRef.current = {};
    };
  }, []);

  useEffect(() => {
    Object.values(bringAutoSaveTimeoutsRef.current).forEach(clearTimeout);
    bringAutoSaveTimeoutsRef.current = {};
    setBringItemName("");
    setSelectedEventId(null);
    setEventAttendance([]);
    setAttendanceMessage(null);
    setConversationTopics([]);
    setConversationMessages([]);
    setActiveConversationTopicId(null);
    setConversationMessage(null);
  }, [selectedCommunityId]);

  useEffect(() => {
    const selected = communities.find((community) => community.id === selectedCommunityId);

    if (!selected) {
      setCommunityMembers([]);
      setJoinRequests([]);
      setCommunityEvents([]);
      setEventMediaCounts({});
      return;
    }

    void Promise.all([
      loadCommunityPeople(selected.id, selected.role),
      loadCommunityEvents(selected.id),
    ]);
  }, [communities, loadCommunityEvents, loadCommunityPeople, selectedCommunityId]);

  useEffect(() => {
    if (!selectedEventId || galleryScrollEventId !== selectedEventId || galleryLoading) return;

    const timer = window.setTimeout(() => {
      document.getElementById("event-gallery")?.scrollIntoView({ behavior: "smooth", block: "start" });
      setGalleryScrollEventId(null);
    }, 100);

    return () => window.clearTimeout(timer);
  }, [galleryLoading, galleryScrollEventId, selectedEventId]);

  useEffect(() => {
    if (!selectedEventId) {
      setEventAttendance([]);
      setAttendanceStatus(null);
      setAttendanceMessage(null);
      setEventBringNeeds([]);
      setEventBringContributions([]);
      setBringNoteByContribution({});
      setBringItemName("");
        setBringMessage(null);
      setGalleryPhotos([]);
      setConversationTopics([]);
      setConversationMessages([]);
      setActiveConversationTopicId(null);
      setConversationMessage(null);
      setEditingConversationMessageId(null);
      setEditingConversationBody("");
      setConversationBusyMessageId(null);
      return;
    }

    const eventExists = communityEvents.some((event) => event.id === selectedEventId);
    if (eventExists) {
      void Promise.all([
        loadEventAttendance(selectedEventId),
        loadEventBringData(selectedEventId),
        loadEventGallery(selectedEventId),
        loadEventConversations(selectedEventId),
      ]);
    }
  }, [communityEvents, loadEventAttendance, loadEventBringData, loadEventConversations, loadEventGallery, selectedEventId]);

  useEffect(() => {
    if (!selectedEventId) return;

    const channel = supabase
      .channel(`event-conversations-${selectedEventId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "event_conversation_messages",
          filter: `event_id=eq.${selectedEventId}`,
        },
        () => {
          void loadEventConversations(selectedEventId, { showLoading: false, scrollToEnd: false });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadEventConversations, selectedEventId, supabase]);

  useLayoutEffect(() => {
    if (!conversationShouldScrollToEndRef.current) return;
    const messageList = conversationMessageListRef.current;
    if (!messageList) return;
    messageList.scrollTop = messageList.scrollHeight;
    conversationShouldScrollToEndRef.current = false;
  }, [activeConversationTopicId, conversationMessages, conversationLoading]);

  useEffect(() => {
    const targetEvent = communityEvents.find((event) => event.id === selectedEventId) ?? null;
    const targetCommunity = communities.find((community) => community.id === targetEvent?.community_id) ?? null;
    const isManager = Boolean(
      targetEvent && targetCommunity &&
      canManageCommunity(targetCommunity.role, user?.email),
    );
    const isLockedForMember = Boolean(
      targetEvent && !isManager &&
      (targetEvent.status === "cancelled" || new Date(targetEvent.starts_at).getTime() <= Date.now()),
    );
    if (!selectedEventId || !attendanceStatus || attendanceLoading || savingAttendance || isLockedForMember) return;

    const currentAttendance = eventAttendance.find(
      (attendance) => attendance.user_id === user?.id,
    );

    const isDirty = attendanceStatus !== currentAttendance?.status;

    if (!isDirty) return;

    if (attendanceAutoSaveTimeoutRef.current) {
      clearTimeout(attendanceAutoSaveTimeoutRef.current);
    }

    const statusChanged = attendanceStatus !== currentAttendance?.status;
    attendanceAutoSaveTimeoutRef.current = setTimeout(
      () => void saveAttendance(attendanceStatus),
      statusChanged ? 0 : 650,
    );

    return () => {
      if (attendanceAutoSaveTimeoutRef.current) {
        clearTimeout(attendanceAutoSaveTimeoutRef.current);
        attendanceAutoSaveTimeoutRef.current = null;
      }
    };
  }, [
    attendanceLoading,
    attendanceStatus,
    communities,
    communityEvents,
    eventAttendance,
    savingAttendance,
    selectedEventId,
    user?.id,
  ]);

  useEffect(() => {
    if (directNavigationPreparedRef.current || !initialNavigationTargetRef.current) return;

    const initialTarget = initialNavigationTargetRef.current;
    if (initialTarget.eventToken && invitedEvent) {
      window.history.replaceState({ circlesApp: true, view: "home" }, "", "/");
      window.history.pushState(
        { circlesApp: true, view: "circle" },
        "",
        `/?circle=${encodeURIComponent(invitedEvent.community_share_token)}`,
      );
      window.history.pushState(
        { circlesApp: true, view: "event" },
        "",
        `/?event=${encodeURIComponent(initialTarget.eventToken)}`,
      );
      directNavigationPreparedRef.current = true;
      return;
    }

    if (initialTarget.circleToken && invitedCommunity) {
      window.history.replaceState({ circlesApp: true, view: "home" }, "", "/");
      window.history.pushState(
        { circlesApp: true, view: "circle" },
        "",
        `/?circle=${encodeURIComponent(initialTarget.circleToken)}`,
      );
      directNavigationPreparedRef.current = true;
    }
  }, [invitedCommunity, invitedEvent]);

  useEffect(() => {
    if (
      !user ||
      !communitiesReady ||
      (!pendingShareToken && !pendingEventShareToken) ||
      !invitedCommunity
    ) {
      return;
    }

    const existingMembership = communities.find(
      (community) => community.id === invitedCommunity.id,
    );

    if (!existingMembership) return;

    queueMicrotask(() => {
      setSelectedCommunityId(existingMembership.id);
      if (invitedEvent) setPendingEventOpenId(invitedEvent.id);
      setInviteDismissed(true);
      normalizeInviteAddress();
      setPendingShareToken(null);
      setPendingEventShareToken(null);
      setAutoJoinAfterAuth(false);
      autoJoinAttemptedRef.current = false;
    });
  }, [
    communities,
    communitiesReady,
    invitedCommunity,
    invitedEvent,
    pendingEventShareToken,
    pendingShareToken,
    user,
  ]);

  useEffect(() => {
    if (
      !autoJoinAfterAuth ||
      !user ||
      !communitiesReady ||
      (!pendingShareToken && !pendingEventShareToken) ||
      !invitedCommunity ||
      autoJoinAttemptedRef.current
    ) {
      return;
    }

    const existingMembership = communities.some(
      (community) => community.id === invitedCommunity.id,
    );

    if (existingMembership) return;

    autoJoinAttemptedRef.current = true;
    void joinInvitedCircle();
  }, [
    autoJoinAfterAuth,
    communities,
    communitiesReady,
    invitedCommunity,
    pendingEventShareToken,
    pendingShareToken,
    user,
  ]);

  useEffect(() => {
    if (!pendingEventOpenId) return;
    const targetEvent = communityEvents.find((event) => event.id === pendingEventOpenId);
    if (!targetEvent) return;

    setSelectedEventId(targetEvent.id);
    setPendingEventOpenId(null);
  }, [communityEvents, pendingEventOpenId]);

  function updateLegalConsentChecked(checked: boolean) {
    setLegalConsentChecked(checked);
  }

  async function signInWithGoogle() {
    setAuthBusy(true);
    setMessage(null);

    const nextPath = pendingEventShareToken
      ? `/?event=${encodeURIComponent(pendingEventShareToken)}&autojoin=1`
      : pendingShareToken
        ? `/?join=${encodeURIComponent(pendingShareToken)}&autojoin=1`
        : "/";
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        queryParams: {
          prompt: "select_account",
        },
      },
    });

    if (error) {
      setMessageTone("error");
      setMessage("לא הצלחנו לפתוח את ההתחברות ל־Google. נסו שוב.");
      setAuthBusy(false);
    }
  }

  async function signOut() {
    setAuthBusy(true);
    setMessage(null);

    const params = new URLSearchParams(window.location.search);
    const currentEventToken = params.get("event");
    const currentCircleToken = params.get("circle") ?? params.get("join");
    if (currentEventToken) {
      setPendingEventShareToken(currentEventToken);
      setPendingShareToken(null);
      void loadSharedEvent(currentEventToken);
    } else if (currentCircleToken) {
      setPendingShareToken(currentCircleToken);
      setPendingEventShareToken(null);
      void loadSharedInvite(currentCircleToken);
    }

    const { error } = await supabase.auth.signOut({ scope: "local" });

    if (error) {
      setMessageTone("error");
      setMessage("ההתנתקות לא הושלמה. נסו שוב.");
    }

    setProfileImage((current) => {
      clearSelectedImage(current);
      return null;
    });
    setCommunityImage((current) => {
      clearSelectedImage(current);
      return null;
    });
    setEventImage((current) => {
      clearSelectedImage(current);
      return null;
    });
    setLegalConsentChecked(false);
    setLegalScreenOpen(false);

    setAuthBusy(false);
  }

  function openImage(url: string, alt: string) {
    setLightbox({ url, alt });
  }

  function clearJoinFromAddress(preserveTarget = false) {
    if (preserveTarget) normalizeInviteAddress();
    else setBrowserView({}, "replace");
    setPendingShareToken(null);
    setPendingEventShareToken(null);
    setAutoJoinAfterAuth(false);
    autoJoinAttemptedRef.current = false;
  }

  function closeInvite() {
    setInviteDismissed(true);
    clearJoinFromAddress();
  }

  async function ensureProfileBeforeJoining(currentUser: User) {
    const { data: existingProfile, error: profileCheckError } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", currentUser.id)
      .maybeSingle<{ id: string }>();

    if (profileCheckError) {
      console.error("Checking profile before joining failed", profileCheckError);
      return formatSupabaseError(profileCheckError);
    }

    if (existingProfile) return null;

    const googleProfile = getGoogleProfile(currentUser);
    const { error: profileInsertError } = await supabase.from("profiles").insert({
      id: currentUser.id,
      email: currentUser.email ?? null,
      full_name: googleProfile.fullName,
      google_avatar_url: googleProfile.avatarUrl,
    });

    if (profileInsertError && profileInsertError.code !== "23505") {
      console.error("Creating profile before joining failed", profileInsertError);
      return formatSupabaseError(profileInsertError);
    }

    return null;
  }

  async function joinInvitedCircle() {
    if (!user || !invitedCommunity) return;

    setMessage(null);

    const existingMembership = communities.find(
      (community) => community.id === invitedCommunity.id,
    );

    if (existingMembership) {
      setSelectedCommunityId(existingMembership.id);
      if (invitedEvent) setPendingEventOpenId(invitedEvent.id);
      setInviteDismissed(true);
      clearJoinFromAddress(true);
      return;
    }

    setJoinBusy(true);

    const profileError = await ensureProfileBeforeJoining(user);
    if (profileError) {
      setMessageTone("error");
      setMessage(`לא הצלחנו להכין את הפרופיל להצטרפות. ${profileError}`);
      setAutoJoinAfterAuth(false);
      setJoinBusy(false);
      return;
    }

    const { data, error } = await supabase.rpc("join_community_by_token", {
      target_share_token: invitedCommunity.share_token,
    });

    if (error || !data?.[0]) {
      console.error("Joining circle failed", error);
      setMessageTone("error");
      setMessage(
        error
          ? `לא הצלחנו להצטרף למעגל. ${formatSupabaseError(error)}`
          : "לא הצלחנו להצטרף למעגל. לא התקבלה תשובה מהשרת.",
      );
      setAutoJoinAfterAuth(false);
      setJoinBusy(false);
      return;
    }

    const result = data[0] as {
      result: "member" | "joined" | "pending";
      community_id: string;
      requires_approval: boolean;
    };

    if (result.result === "pending") {
      setInviteStatus("pending");
      setJoinBusy(false);
      void notifyManagersAboutPendingJoin(result.community_id);
      return;
    }

    await loadCommunities(user);
    setSelectedCommunityId(result.community_id);
    if (invitedEvent) setPendingEventOpenId(invitedEvent.id);
    setInviteDismissed(true);
    clearJoinFromAddress(true);
    setMessageTone("success");
    setMessage(
      result.result === "member"
        ? "אתם כבר חברים במעגל הזה."
        : `הצטרפתם למעגל „${invitedCommunity.name}”.`,
    );
    setJoinBusy(false);
  }

  async function joinSystemAdminToCommunity() {
    const currentCommunity = communities.find(
      (community) => community.id === selectedCommunityId,
    );

    if (
      !user ||
      !currentCommunity ||
      !isSystemAdminEmail(user.email) ||
      currentCommunity.is_member ||
      systemAdminJoinBusy
    ) {
      return;
    }

    setSystemAdminJoinBusy(true);
    setMessage(null);

    const profileError = await ensureProfileBeforeJoining(user);
    if (profileError) {
      setMessageTone("error");
      setMessage(`לא הצלחנו להכין את הפרופיל לצירוף למעגל. ${profileError}`);
      setSystemAdminJoinBusy(false);
      return;
    }

    const { error } = await supabase.from("community_members").insert({
      community_id: currentCommunity.id,
      user_id: user.id,
      role: "member",
    });

    if (error && error.code !== "23505") {
      console.error("Joining system admin to circle failed", error);
      setMessageTone("error");
      setMessage(`לא הצלחנו לצרף את רון לאופר למעגל. ${formatSupabaseError(error)}`);
      setSystemAdminJoinBusy(false);
      return;
    }

    setCommunities((current) =>
      current.map((community) =>
        community.id === currentCommunity.id
          ? { ...community, role: "member", is_member: true }
          : community,
      ),
    );
    await loadCommunityPeople(currentCommunity.id, "member");
    setMessageTone("success");
    setMessage(`רון לאופר צורף כחבר למעגל „${currentCommunity.name}”.`);
    setSystemAdminJoinBusy(false);
  }

  async function reviewJoinRequest(
    request: CommunityJoinRequest,
    decision: "approve" | "reject",
  ) {
    const currentCommunity = communities.find(
      (community) => community.id === selectedCommunityId,
    );
    if (!currentCommunity) return;

    setReviewingUserId(request.user_id);
    const { error } = await supabase.rpc("review_community_join_request", {
      target_community_id: currentCommunity.id,
      target_user_id: request.user_id,
      target_decision: decision,
    });

    if (error) {
      console.error("Reviewing join request failed", error);
      setMessageTone("error");
      setMessage("לא הצלחנו לעדכן את בקשת ההצטרפות.");
    } else {
      setMessageTone("success");
      setMessage(
        decision === "approve"
          ? `${request.full_name} צורף למעגל.`
          : `בקשת ההצטרפות של ${request.full_name} נדחתה.`,
      );
      await loadCommunityPeople(currentCommunity.id, currentCommunity.role);
    }

    setReviewingUserId(null);
  }

  async function removeCommunityMember(member: CommunityMember) {
    const currentCommunity = communities.find(
      (community) => community.id === selectedCommunityId,
    );
    if (!currentCommunity || !user) return false;

    if (!canOwnCommunity(currentCommunity, user.id, user.email)) {
      setMessageTone("error");
      setMessage("אין לך הרשאה להסיר חברים מהמעגל.");
      return false;
    }

    if (member.role === "owner" || member.user_id === currentCommunity.created_by) {
      setMessageTone("error");
      setMessage("לא ניתן להסיר את יוצר המעגל.");
      return false;
    }

    setRemovingUserId(member.user_id);
    setMessage(null);

    const { error } = await supabase.rpc("remove_community_member", {
      target_community_id: currentCommunity.id,
      target_user_id: member.user_id,
    });

    if (error) {
      console.error("Removing circle member failed", error);
      setMessageTone("error");
      setMessage(`לא הצלחנו להסיר את החבר. ${formatSupabaseError(error)}`);
      setRemovingUserId(null);
      return false;
    }

    setMessageTone("success");
    setMessage(`${member.full_name} הוסר מהמעגל.`);
    await loadCommunityPeople(currentCommunity.id, currentCommunity.role);
    setRemovingUserId(null);
    return true;
  }

  async function changeCommunityMemberRole(
    member: CommunityMember,
    nextRole: "admin" | "member",
  ) {
    const currentCommunity = communities.find(
      (community) => community.id === selectedCommunityId,
    );
    if (!currentCommunity || !user) return false;

    setUpdatingRoleUserId(member.user_id);
    setMessage(null);

    const { error } = await supabase.rpc("set_community_member_role", {
      target_community_id: currentCommunity.id,
      target_user_id: member.user_id,
      target_role: nextRole,
    });

    if (error) {
      console.error("Changing circle member role failed", error);
      setMessageTone("error");
      setMessage(`לא הצלחנו לשנות את התפקיד. ${formatSupabaseError(error)}`);
      setUpdatingRoleUserId(null);
      return false;
    }

    setMessageTone("success");
    setMessage(
      nextRole === "admin"
        ? `${member.full_name} הוגדר כמנהל המעגל.`
        : `${member.full_name} הוגדר כחבר רגיל.`,
    );
    await loadCommunityPeople(currentCommunity.id, currentCommunity.role);
    setUpdatingRoleUserId(null);
    return true;
  }

  async function leaveCommunity(community: Community) {
    if (!user) return false;

    setMessage(null);
    const { error } = isSystemAdminEmail(user.email)
      ? await supabase.rpc("system_admin_leave_community", {
          target_community_id: community.id,
        })
      : await supabase.rpc("leave_community", {
          target_community_id: community.id,
        });

    if (error) {
      console.error("Leaving circle failed", error);
      setMessageTone("error");
      setMessage(`לא הצלחנו לעזוב את המעגל. ${formatSupabaseError(error)}`);
      return false;
    }

    setSelectedCommunityId(null);
    setBrowserView({});
    setCommunityMembers([]);
    setJoinRequests([]);
    await loadCommunities(user);
    setMessageTone("success");
    setMessage(`עזבת את המעגל „${community.name}”.`);
    return true;
  }

  async function confirmMemberAction() {
    if (!pendingMemberAction || memberActionBusy) return;

    setMemberActionBusy(true);
    let succeeded = false;

    if (pendingMemberAction.type === "remove") {
      succeeded = await removeCommunityMember(pendingMemberAction.member);
    } else if (pendingMemberAction.type === "role") {
      succeeded = await changeCommunityMemberRole(
        pendingMemberAction.member,
        pendingMemberAction.nextRole,
      );
    } else if (pendingMemberAction.type === "attendance") {
      succeeded = await deleteEventAttendance(pendingMemberAction.attendance);
    } else if (pendingMemberAction.type === "delete_event") {
      succeeded = await deleteCommunityEvent(pendingMemberAction.event);
    } else if (pendingMemberAction.type === "cancel_event") {
      succeeded = await setEventCancellation(
        pendingMemberAction.event,
        pendingMemberAction.cancel,
      );
    } else if (pendingMemberAction.type === "delete_circle") {
      succeeded = await deleteCommunityCircle(pendingMemberAction.community);
    } else if (pendingMemberAction.type === "delete_gallery") {
      succeeded = await deleteGalleryPhoto(pendingMemberAction.photo);
    } else if (pendingMemberAction.type === "delete_conversation_message") {
      succeeded = await deleteConversationMessage(pendingMemberAction.message);
    } else if (pendingMemberAction.type === "delete_notification") {
      succeeded = await deleteNotification(pendingMemberAction.notification);
    } else if (pendingMemberAction.type === "delete_all_notifications") {
      succeeded = await deleteAllNotifications();
    } else {
      succeeded = await leaveCommunity(pendingMemberAction.community);
    }

    setMemberActionBusy(false);
    if (succeeded) setPendingMemberAction(null);
  }

  function openShareScreen(community: Community) {
    setShareCopied(false);
    setShareCommunity(community);
  }

  async function copyShareLink(community: Community) {
    const shareUrl = getCommunityShareUrl(community.share_token);

    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareCopied(true);
    } catch {
      const helper = document.createElement("textarea");
      helper.value = shareUrl;
      helper.style.position = "fixed";
      helper.style.opacity = "0";
      document.body.appendChild(helper);
      helper.select();
      document.execCommand("copy");
      helper.remove();
      setShareCopied(true);
    }
  }

  async function shareWithDevice(community: Community) {
    const shareUrl = getCommunityShareUrl(community.share_token);
    const text = getCommunityShareText(community, shareUrl);

    if (navigator.share) {
      try {
        await navigator.share({
          title: community.name,
          text,
          url: shareUrl,
        });
      } catch {
        // The user may close the operating-system share sheet.
      }
      return;
    }

    await copyShareLink(community);
  }

  function openEventShareScreen(event: CommunityEvent) {
    setShareCopied(false);
    setShareEvent(event);
  }

  async function copyEventShareLink(event: CommunityEvent) {
    const shareUrl = getEventShareUrl(event.share_token);

    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareCopied(true);
    } catch {
      const helper = document.createElement("textarea");
      helper.value = shareUrl;
      helper.style.position = "fixed";
      helper.style.opacity = "0";
      document.body.appendChild(helper);
      helper.select();
      document.execCommand("copy");
      helper.remove();
      setShareCopied(true);
    }
  }

  async function shareEventWithDevice(event: CommunityEvent) {
    const shareUrl = getEventShareUrl(event.share_token);
    const text = getEventShareText(event, shareUrl);

    if (navigator.share) {
      try {
        await navigator.share({
          title: event.title,
          text,
          url: shareUrl,
        });
      } catch {
        // The user may close the operating-system share sheet.
      }
      return;
    }

    await copyEventShareLink(event);
  }

  async function prepareProfileImageForCrop(file: File, target: ProfileCropTarget) {
    if (target === "admin") setMemberImageMessage(null);
    else setMessage(null);

    if (!isSupportedImageFile(file)) {
      const errorMessage = "לא הצלחנו לקרוא את התמונה. נסו לבחור קובץ תמונה אחר.";
      if (target === "admin") setMemberImageMessage(errorMessage);
      else {
        setMessageTone("error");
        setMessage(errorMessage);
      }
      return;
    }

    try {
      const sourceBlob = isHeicImageFile(file) ? await convertHeicToJpeg(file) : file;
      const sourceUrl = URL.createObjectURL(sourceBlob);
      setProfileCropRequest({
        target,
        sourceUrl,
        originalBytes: file.size,
        personName:
          target === "admin"
            ? editingMemberImage?.full_name ?? "המשתמש"
            : profile?.full_name ?? (fullName.trim() || "המשתמש"),
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error && error.message === "heic_conversion_failed"
          ? "לא הצלחנו להמיר את קובץ ה־HEIC/HEIF לתמונה רגילה. נסו לבחור את הקובץ שוב או לבחור תמונה אחרת."
          : "לא הצלחנו לקרוא את התמונה. נסו לבחור קובץ תמונה אחר.";
      if (target === "admin") setMemberImageMessage(errorMessage);
      else {
        setMessageTone("error");
        setMessage(errorMessage);
      }
    }
  }

  function closeProfileImageCropper() {
    setProfileCropRequest(null);
  }

  function acceptProfileImageCrop(image: SelectedImage) {
    if (!profileCropRequest) {
      clearSelectedImage(image);
      return;
    }

    if (profileCropRequest.target === "admin") {
      setAdminMemberImage((current) => {
        clearSelectedImage(current);
        return image;
      });
    } else {
      setProfileImage((current) => {
        clearSelectedImage(current);
        return image;
      });
    }
    setProfileCropRequest(null);
  }

  async function prepareImage(file: File, target: "profile" | "community" | "event") {
    setMessage(null);

    if (target === "profile") {
      await prepareProfileImageForCrop(file, "profile");
      return;
    }

    try {
      const compressed = await compressImage(file);

      if (target === "community") {
        setCommunityImage((current) => {
          clearSelectedImage(current);
          return compressed;
        });
      } else {
        setEventImage((current) => {
          clearSelectedImage(current);
          return compressed;
        });
      }
    } catch (error) {
      setMessageTone("error");
      setMessage(
        error instanceof CompressedImageTooLargeError
          ? formatCompressedImageTooLarge(error)
          : error instanceof Error && error.message === "heic_conversion_failed"
            ? "לא הצלחנו להמיר את קובץ ה־HEIC/HEIF לתמונה רגילה. נסו לבחור את הקובץ שוב או לבחור תמונה אחרת."
            : "לא הצלחנו לקרוא את התמונה. נסו לבחור קובץ תמונה אחר.",
      );
    }
  }

  async function uploadPublicImage(bucket: string, path: string, blob: Blob) {
    if (blob.size > DEFAULT_IMAGE_MAX_BYTES) {
      throw new Error("compressed_image_too_large");
    }

    const { error } = await supabase.storage.from(bucket).upload(path, blob, {
      contentType: blob.type || "image/jpeg",
      cacheControl: "3600",
      upsert: true,
    });

    if (error) throw error;

    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return `${data.publicUrl}?v=${Date.now()}`;
  }


  async function prepareCommunityVideo(file: File) {
    setMessage(null);
    setCommunityVideoNotice({ text: "בודק את הסרטון…", progress: 0, tone: "info" });

    if (!isSupportedVideoFile(file)) {
      setCommunityVideoNotice({
        text: "פורמט הסרטון אינו נתמך. אפשר לבחור MP4, MOV, M4V או WebM.",
        progress: null,
        tone: "error",
      });
      return;
    }

    try {
      const result = await compressVideo(file, MAX_COMMUNITY_VIDEO_BYTES, ({ message, progress }) => {
        setCommunityVideoNotice({ text: message, progress, tone: "info" });
      });

      setCommunityVideo((current) => {
        clearSelectedVideo(current);
        return {
          file: result.file,
          previewUrl: URL.createObjectURL(result.file),
        };
      });
      setCommunityVideoNotice({
        text: `הסרטון מוכן: ${Number((result.afterBytes / (1024 * 1024)).toFixed(2))}MB לאחר הכיווץ.`,
        progress: 100,
        tone: "success",
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "";
      const text = error instanceof CompressedVideoTooLargeError
        ? formatCompressedVideoTooLarge(error)
        : errorMessage === "video_compression_busy"
          ? "כבר מתבצע כיווץ של סרטון אחר. המתינו לסיום ונסו שוב."
          : errorMessage === "video_metadata_failed" || errorMessage === "video_metadata_timeout"
            ? "לא הצלחנו לקרוא את הסרטון. נסו לבחור קובץ אחר."
            : errorMessage === "unsupported_video_type"
              ? "פורמט הסרטון אינו נתמך. אפשר לבחור MP4, MOV, M4V או WebM."
              : "כיווץ הסרטון נכשל. נסו שוב או בחרו סרטון אחר.";
      setCommunityVideoNotice({ text, progress: null, tone: "error" });
      setMessageTone("error");
      setMessage(text);
    }
  }

  async function uploadPublicVideo(bucket: string, path: string, file: File, maxBytes: number) {
    if (file.size > maxBytes) throw new Error("compressed_video_too_large");
    const { error } = await supabase.storage.from(bucket).upload(path, file, {
      contentType: "video/mp4",
      cacheControl: "3600",
      upsert: true,
    });

    if (error) throw error;

    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return `${data.publicUrl}?v=${Date.now()}`;
  }

  function openMemberImageEditor(member: CommunityMember) {
    if (!user || !isSystemAdminEmail(user.email)) return;
    setAdminMemberImage((current) => {
      clearSelectedImage(current);
      return null;
    });
    setMemberImageMessage(null);
    setEditingMemberImage(member);
  }

  function closeMemberImageEditor() {
    if (savingMemberImage) return;
    setAdminMemberImage((current) => {
      clearSelectedImage(current);
      return null;
    });
    setMemberImageMessage(null);
    setEditingMemberImage(null);
  }

  async function prepareAdminMemberImage(file: File) {
    await prepareProfileImageForCrop(file, "admin");
  }

  async function saveAdminMemberImage() {
    if (!user || !isSystemAdminEmail(user.email) || !editingMemberImage || !adminMemberImage) return;

    setSavingMemberImage(true);
    setMemberImageMessage(null);

    try {
      const avatarUrl = await uploadPublicImage(
        "profile-images",
        `${editingMemberImage.user_id}/avatar.jpg`,
        adminMemberImage.blob,
      );

      const { error } = await supabase.rpc("set_system_admin_profile_avatar", {
        target_user_id: editingMemberImage.user_id,
        new_avatar_url: avatarUrl,
      });
      if (error) throw error;

      setCommunityMembers((current) =>
        current.map((member) =>
          member.user_id === editingMemberImage.user_id
            ? { ...member, avatar_url: avatarUrl }
            : member,
        ),
      );
      setAdminMemberImage((current) => {
        clearSelectedImage(current);
        return null;
      });
      setEditingMemberImage(null);
      setMessageTone("success");
      setMessage(`תמונת הפרופיל של ${editingMemberImage.full_name} עודכנה.`);
    } catch (error) {
      console.error("Updating member profile image failed", error);
      const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
      setMemberImageMessage(
        code === "42883" || code === "42501" || code === "PGRST202"
          ? "יש להריץ את קובץ ה־SQL של circles136 ב־Supabase."
          : "העלאת תמונת הפרופיל לא הצליחה. נסו שוב.",
      );
    } finally {
      setSavingMemberImage(false);
    }
  }

  async function saveProfile() {
    if (!user || !profile) return;

    const cleanName = fullName.trim();
    if (!cleanName) {
      setMessageTone("error");
      setMessage("יש למלא שם.");
      return;
    }

    const birthdayError = validateBirthday(birthDay, birthMonth, birthYear);
    if (birthdayError) {
      setMessageTone("error");
      setMessage(birthdayError);
      return;
    }

    setSaving(true);
    setMessage(null);

    let avatarUrl = profile.avatar_url;

    if (profileImage) {
      try {
        avatarUrl = await uploadPublicImage(
          "profile-images",
          `${user.id}/avatar.jpg`,
          profileImage.blob,
        );
      } catch (error) {
        setMessageTone("error");
        setMessage("העלאת תמונת הפרופיל לא הצליחה. נסו שוב.");
        setSaving(false);
        return;
      }
    }

    const { data, error } = await supabase
      .from("profiles")
      .update({
        full_name: cleanName,
        about: about.trim(),
        city: city.trim(),
        phone: phone.trim(),
        birth_day: birthDay ? Number(birthDay) : null,
        birth_month: birthMonth ? Number(birthMonth) : null,
        birth_year: birthYear ? Number(birthYear) : null,
        avatar_url: avatarUrl,
      })
      .eq("id", user.id)
      .select("id,email,full_name,about,city,phone,birth_day,birth_month,birth_year,avatar_url,google_avatar_url,legal_accepted_at,legal_version")
      .single<Profile>();

    if (error) {
      setMessageTone("error");
      setMessage("שמירת הפרופיל לא הצליחה. נסו שוב.");
    } else {
      setProfile(data);
      setFullName(data.full_name);
      setAbout(data.about);
      setCity(data.city);
      setPhone(data.phone);
      setBirthDay(data.birth_day?.toString() ?? "");
      setBirthMonth(data.birth_month?.toString() ?? "");
      setBirthYear(data.birth_year?.toString() ?? "");
      setProfileImage((current) => {
        clearSelectedImage(current);
        return null;
      });
      setMessageTone("success");
      setMessage("הפרופיל נשמר.");
    }

    setSaving(false);
  }

  function openCreateCommunity() {
    setEditingCommunityId(null);
    setCommunityName("");
    setCommunityDescription("");
    setCommunityRequiresApproval(true);
    setCommunityImage((current) => {
      clearSelectedImage(current);
      return null;
    });
    setCommunityVideo((current) => {
      clearSelectedVideo(current);
      return null;
    });
    setCommunityVideoNotice(null);
    setMessage(null);
    setCommunityFormOpen(true);
  }

  function openEditCommunity(community: Community) {
    setEditingCommunityId(community.id);
    setCommunityName(community.name);
    setCommunityDescription(community.description);
    setCommunityRequiresApproval(community.requires_member_approval);
    setCommunityImage((current) => {
      clearSelectedImage(current);
      return null;
    });
    setCommunityVideo((current) => {
      clearSelectedVideo(current);
      return null;
    });
    setCommunityVideoNotice(null);
    setMessage(null);
    setCommunityFormOpen(true);
  }

  function closeCommunityForm() {
    if (!savingCommunity) {
      setCommunityFormOpen(false);
      setEditingCommunityId(null);
      setCommunityImage((current) => {
        clearSelectedImage(current);
        return null;
      });
      setCommunityVideo((current) => {
        clearSelectedVideo(current);
        return null;
      });
      setCommunityVideoNotice(null);
    }
  }

  async function saveCommunity() {
    if (!user) return;

    const cleanName = communityName.trim();
    const cleanDescription = communityDescription.trim();

    if (cleanName.length < 2) {
      setMessageTone("error");
      setMessage("שם המעגל חייב להכיל לפחות שני תווים.");
      return;
    }

    setSavingCommunity(true);
    setMessage(null);

    const existingCommunity = editingCommunityId
      ? communities.find((community) => community.id === editingCommunityId) ?? null
      : null;

    if (existingCommunity) {
      let logoUrl = existingCommunity.logo_url;
      let videoUrl = existingCommunity.video_url;

      if (communityImage) {
        try {
          logoUrl = await uploadPublicImage(
            "community-images",
            `${existingCommunity.id}/cover.jpg`,
            communityImage.blob,
          );
        } catch (error) {
          setMessageTone("error");
          setMessage("העלאת תמונת המעגל לא הצליחה. נסו שוב.");
          setSavingCommunity(false);
          return;
        }
      }


      if (communityVideo) {
        try {
          videoUrl = await uploadPublicVideo(
            "community-videos",
            `${existingCommunity.id}/intro`,
            communityVideo.file,
            MAX_COMMUNITY_VIDEO_BYTES,
          );
        } catch (error) {
          const text = "העלאת סרטון המעגל לא הצליחה. הסרטון נשאר מוכן ותוכלו לנסות לשמור שוב.";
          setCommunityVideoNotice({ text, progress: null, tone: "error" });
          setMessageTone("error");
          setMessage(text);
          setSavingCommunity(false);
          return;
        }
      }

      const communityUpdate: {
        name: string;
        description: string;
        logo_url: string | null;
        video_url: string | null;
        requires_member_approval: boolean;
      } = {
        name: cleanName,
        description: cleanDescription,
        logo_url: logoUrl,
        video_url: videoUrl,
        requires_member_approval: communityRequiresApproval,
      };
      const { data, error } = await supabase
        .from("communities")
        .update(communityUpdate)
        .eq("id", existingCommunity.id)
        .select(
          "id,name,description,logo_url,video_url,requires_member_approval,created_by,created_at,updated_at,share_token",
        )
        .single();

      if (error) {
        console.error("Update circle failed", error);
        setMessageTone("error");
        setMessage("שמירת המעגל לא הצליחה. נסו שוב.");
        setSavingCommunity(false);
        return;
      }

      const updatedCommunity: Community = {
        ...data,
        role: existingCommunity.role,
        is_member: existingCommunity.is_member,
        manager_names: existingCommunity.manager_names,
      };
      setCommunities((current) =>
        current.map((community) =>
          community.id === updatedCommunity.id ? updatedCommunity : community,
        ),
      );
      setCommunityFormOpen(false);
      setEditingCommunityId(null);
      setCommunityImage((current) => {
        clearSelectedImage(current);
        return null;
      });
      setCommunityVideo((current) => {
        clearSelectedVideo(current);
        return null;
      });
      setMessageTone("success");
      setMessage(`המעגל „${updatedCommunity.name}” נשמר.`);
      setSavingCommunity(false);
      return;
    }

    const communityId = crypto.randomUUID();
    const shareToken = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    const { error: insertError } = await supabase.from("communities").insert({
      id: communityId,
      name: cleanName,
      description: cleanDescription,
      requires_member_approval: communityRequiresApproval,
      share_token: shareToken,
      created_by: user.id,
    });

    if (insertError) {
      console.error("Create circle failed", insertError);
      setMessageTone("error");
      setMessage("יצירת המעגל לא הצליחה. נסו שוב.");
      setSavingCommunity(false);
      return;
    }

    let uploadedLogoUrl: string | null = null;
    let uploadedVideoUrl: string | null = null;
    let imageUploadFailed = false;
    let videoUploadFailed = false;

    if (communityImage) {
      try {
        uploadedLogoUrl = await uploadPublicImage(
          "community-images",
          `${communityId}/cover.jpg`,
          communityImage.blob,
        );

        const { error: logoUpdateError } = await supabase
          .from("communities")
          .update({ logo_url: uploadedLogoUrl })
          .eq("id", communityId);

        if (logoUpdateError) throw logoUpdateError;
      } catch (error) {
        imageUploadFailed = true;
        uploadedLogoUrl = null;
      }
    }


    if (communityVideo) {
      try {
        uploadedVideoUrl = await uploadPublicVideo(
          "community-videos",
          `${communityId}/intro`,
          communityVideo.file,
          MAX_COMMUNITY_VIDEO_BYTES,
        );

        const { error: videoUpdateError } = await supabase
          .from("communities")
          .update({ video_url: uploadedVideoUrl })
          .eq("id", communityId);

        if (videoUpdateError) throw videoUpdateError;
      } catch (error) {
        setCommunityVideoNotice({
          text: "העלאת סרטון המעגל לא הצליחה. נסו לשמור שוב.",
          progress: null,
          tone: "error",
        });
        videoUploadFailed = true;
        uploadedVideoUrl = null;
      }
    }

    const { data, error: readError } = await supabase
      .from("communities")
      .select(
        "id,name,description,logo_url,video_url,requires_member_approval,created_by,created_at,updated_at,share_token",
      )
      .eq("id", communityId)
      .single();

    if (readError) {
      console.error("Reading the newly created circle failed", readError);
    }

    const createdCommunity: Community = data
      ? { ...data, role: "owner", is_member: true, manager_names: [profile?.full_name || user.email || ""] }
      : {
          id: communityId,
          name: cleanName,
          description: cleanDescription,
          logo_url: uploadedLogoUrl,
          video_url: uploadedVideoUrl,
          requires_member_approval: communityRequiresApproval,
          created_by: user.id,
          created_at: createdAt,
          updated_at: createdAt,
          share_token: shareToken,
          role: "owner",
          is_member: true,
          manager_names: [profile?.full_name || user.email || ""],
        };

    setCommunities((current) => [createdCommunity, ...current]);
    setCommunityFormOpen(false);
    setEditingCommunityId(null);
    setCommunityName("");
    setCommunityDescription("");
    setCommunityRequiresApproval(true);
    setCommunityImage((current) => {
      clearSelectedImage(current);
      return null;
    });
    setCommunityVideo((current) => {
      clearSelectedVideo(current);
      return null;
    });
    const mediaUploadFailed = imageUploadFailed || videoUploadFailed;
    setMessageTone(mediaUploadFailed ? "error" : "success");
    setMessage(
      mediaUploadFailed
        ? `המעגל „${createdCommunity.name}” נוצר, אך העלאת חלק מהמדיה לא הצליחה.`
        : `המעגל „${createdCommunity.name}” נוצר בהצלחה.`,
    );
    setSelectedCommunityId(createdCommunity.id);
    setBrowserView({ circleToken: createdCommunity.share_token });
    setSavingCommunity(false);
  }

  function openCreateEvent() {
    setEditingEventId(null);
    setDirectCloneEventId(null);
    setEventTitle("");
    setEventDateTime("");
    setEventEndDateTime("");
    setEventBringMode("free");
    setEventBringNeedDrafts([]);
    setEventBringNeedName("");
    setCopyNeedsFromEventId("");
    setCloneEventId("");
    setEventHasParticipantLimit(false);
    setEventParticipantLimit("");
    setEventGalleryImageLimit(String(mediaDefaults.default_gallery_image_limit));
    setEventGalleryImageMaxMb(String(mediaDefaults.default_gallery_image_max_mb));
    setEventGalleryVideoLimit(String(mediaDefaults.default_gallery_video_limit));
    setEventGalleryVideoMaxMb(String(mediaDefaults.default_gallery_video_max_mb));
    setEventLocation("");
    setEventDescription("");
    setEventImage((current) => {
      clearSelectedImage(current);
      return null;
    });
    setMessage(null);
    setEventFormOpen(true);
  }

  async function applyEventClone(sourceEventId: string) {
    setCloneEventId(sourceEventId);
    if (!sourceEventId) {
      openCreateEvent();
      return;
    }

    const source = communityEvents.find((event) => event.id === sourceEventId);
    if (!source) return;

    setEventTitle(source.title);
    setEventDateTime(toDateTimeLocalValue(source.starts_at));
    setEventEndDateTime(toTimeInputValue(source.ends_at));
    setEventBringMode(source.bring_mode ?? "free");
    setEventHasParticipantLimit(source.participant_limit !== null);
    setEventParticipantLimit(source.participant_limit?.toString() ?? "");
    setEventGalleryImageLimit(String(source.gallery_image_limit ?? mediaDefaults.default_gallery_image_limit));
    setEventGalleryImageMaxMb(String(source.gallery_image_max_mb ?? mediaDefaults.default_gallery_image_max_mb));
    setEventGalleryVideoLimit(String(source.gallery_video_limit ?? mediaDefaults.default_gallery_video_limit));
    setEventGalleryVideoMaxMb(String(source.gallery_video_max_mb ?? mediaDefaults.default_gallery_video_max_mb));
    setEventLocation(source.location);
    setEventDescription(source.description);
    setEventImage((current) => {
      clearSelectedImage(current);
      return null;
    });

    const { data, error } = await supabase
      .from("event_bring_needs")
      .select("item_name,quantity_needed")
      .eq("event_id", source.id)
      .order("created_at", { ascending: true });

    if (error) {
      setMessageTone("error");
      setMessage(`טעינת האירוע לשכפול נכשלה. ${formatSupabaseError(error)}`);
      return;
    }

    setEventBringNeedDrafts(
      (data ?? []).map((need) => ({
        client_id: crypto.randomUUID(),
        id: null,
        item_name: need.item_name,
        quantity_needed: 1,
      })),
    );
    setMessage(null);
  }

  async function openDirectEventClone(event: CommunityEvent) {
    openCreateEvent();
    setDirectCloneEventId(event.id);
    await applyEventClone(event.id);
  }

  function openEventDetails(event: CommunityEvent) {
    setBrowserView({ eventToken: event.share_token });
    setSelectedEventId(event.id);
    setAttendanceMessage(null);
    setBringMessage(null);
    setGalleryVideoNotice(null);
    setMessage(null);
  }

  function openEventGallery(event: CommunityEvent) {
    setGalleryScrollEventId(event.id);
    openEventDetails(event);
  }

  function closeEventDetails() {
    if (savingAttendance || bringBusyKey) return;
    const currentState = window.history.state as { circlesApp?: boolean; view?: string } | null;
    if (currentState?.circlesApp && currentState.view === "event") {
      window.history.back();
      return;
    }

    const currentCommunity = communities.find(
      (community) => community.id === selectedCommunityId,
    );
    if (currentCommunity) setBrowserView({ circleToken: currentCommunity.share_token }, "replace");
    else setBrowserView({}, "replace");
    setSelectedEventId(null);
    setAttendanceMessage(null);
    setBringMessage(null);
  }

  async function openEditEvent(event: CommunityEvent) {
    setEditingEventId(event.id);
    setEventTitle(event.title);
    setEventDateTime(toDateTimeLocalValue(event.starts_at));
    setEventEndDateTime(toTimeInputValue(event.ends_at));
    setEventBringMode(event.bring_mode ?? "free");
    setEventBringNeedName("");
    setCopyNeedsFromEventId("");
    setCloneEventId("");
    setEventHasParticipantLimit(event.participant_limit !== null);
    setEventParticipantLimit(event.participant_limit?.toString() ?? "");
    setEventGalleryImageLimit(String(event.gallery_image_limit ?? mediaDefaults.default_gallery_image_limit));
    setEventGalleryImageMaxMb(String(event.gallery_image_max_mb ?? mediaDefaults.default_gallery_image_max_mb));
    setEventGalleryVideoLimit(String(event.gallery_video_limit ?? mediaDefaults.default_gallery_video_limit));
    setEventGalleryVideoMaxMb(String(event.gallery_video_max_mb ?? mediaDefaults.default_gallery_video_max_mb));
    setEventLocation(event.location);
    setEventDescription(event.description);
    setEventImage((current) => {
      clearSelectedImage(current);
      return null;
    });
    setMessage(null);
    setEventFormOpen(true);

    const { data, error } = await supabase
      .from("event_bring_needs")
      .select("id,item_name,quantity_needed")
      .eq("event_id", event.id)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Loading event bring needs for editing failed", error);
      setEventBringNeedDrafts([]);
      return;
    }

    setEventBringNeedDrafts(
      (data ?? []).map((need) => ({
        client_id: need.id,
        id: need.id,
        item_name: need.item_name,
        quantity_needed: 1,
      })),
    );
  }

  function closeEventForm(force = false) {
    if (savingEvent && !force) return;

    setEventFormOpen(false);
    setEditingEventId(null);
    setCloneEventId("");
    setDirectCloneEventId(null);
    setEventBringNeedDrafts([]);
    setEventImage((current) => {
      clearSelectedImage(current);
      return null;
    });
  }

  function addEventBringNeedDraft() {
    const itemName = eventBringNeedName.trim();
    if (!itemName) {
      setMessageTone("error");
      setMessage("יש להזין את שם הפריט.");
      return;
    }

    setEventBringNeedDrafts((current) => [
      ...current,
      {
        client_id: crypto.randomUUID(),
        id: null,
        item_name: itemName,
        quantity_needed: 1,
      },
    ]);
    setEventBringNeedName("");
    setMessage(null);
  }

  async function copyEventBringNeeds() {
    if (!copyNeedsFromEventId) return;
    const { data, error } = await supabase
      .from("event_bring_needs")
      .select("item_name,quantity_needed")
      .eq("event_id", copyNeedsFromEventId)
      .order("created_at", { ascending: true });

    if (error) {
      setMessageTone("error");
      setMessage(`העתקת הטבלה לא הצליחה. ${formatSupabaseError(error)}`);
      return;
    }

    setEventBringNeedDrafts(
      (data ?? []).map((need) => ({
        client_id: crypto.randomUUID(),
        id: null,
        item_name: need.item_name,
        quantity_needed: 1,
      })),
    );
    setMessageTone("success");
    setMessage("הטבלה הועתקה. היא תישמר יחד עם האירוע.");
  }

  async function syncEventBringNeeds(eventId: string) {
    if (!user || eventBringMode !== "planned") return null;

    const { data: currentRows, error: currentError } = await supabase
      .from("event_bring_needs")
      .select("id")
      .eq("event_id", eventId);
    if (currentError) return currentError;

    const retainedIds = eventBringNeedDrafts
      .map((draft) => draft.id)
      .filter((id): id is string => Boolean(id));
    const idsToDelete = (currentRows ?? [])
      .map((row) => row.id)
      .filter((id) => !retainedIds.includes(id));

    if (idsToDelete.length) {
      const { error } = await supabase.from("event_bring_needs").delete().in("id", idsToDelete);
      if (error) return error;
    }

    for (const draft of eventBringNeedDrafts) {
      if (draft.id) {
        const { error } = await supabase
          .from("event_bring_needs")
          .update({ item_name: draft.item_name, quantity_needed: 1 })
          .eq("id", draft.id);
        if (error) return error;
      } else {
        const { error } = await supabase.from("event_bring_needs").insert({
          event_id: eventId,
          item_name: draft.item_name,
          quantity_needed: 1,
          created_by: user.id,
        });
        if (error) return error;
      }
    }

    return null;
  }

  async function toggleNeedContribution(need: EventBringNeed, checked: boolean) {
    if (!user || !selectedEventId) return;
    const existing = eventBringContributions.find(
      (contribution) => contribution.need_id === need.id && contribution.user_id === user.id,
    );

    setBringBusyKey(`need-${need.id}`);
    setBringMessage(null);

    if (!checked) {
      if (!existing) {
        setBringBusyKey(null);
        return;
      }

      const { error } = await supabase
        .from("event_bring_contributions")
        .delete()
        .eq("id", existing.id);

      if (error) {
        setBringMessageTone("error");
        setBringMessage(`ביטול הפריט לא הצליח. ${formatSupabaseError(error)}`);
      } else {
        setEventBringContributions((current) =>
          current.filter((contribution) => contribution.id !== existing.id),
        );
        setBringNoteByContribution((current) => {
          const next = { ...current };
          delete next[existing.id];
          return next;
        });
      }
      setBringBusyKey(null);
      return;
    }

    if (existing) {
      setBringBusyKey(null);
      return;
    }

    const { data: inserted, error } = await supabase
      .from("event_bring_contributions")
      .insert({
        event_id: selectedEventId,
        need_id: need.id,
        user_id: user.id,
        item_name: need.item_name,
        quantity: 1,
        note: "",
      })
      .select("id,event_id,need_id,user_id,item_name,quantity,note,created_at")
      .single();

    if (error || !inserted) {
      setBringMessageTone("error");
      setBringMessage(`שמירת הפריט לא הצליחה. ${formatSupabaseError(error)}`);
    } else {
      const googleProfile = getGoogleProfile(user);
      const insertedContribution: EventBringContribution = {
        ...inserted,
        full_name: profile?.full_name || googleProfile.fullName,
        avatar_url: profile?.avatar_url ?? null,
        google_avatar_url: profile?.google_avatar_url ?? googleProfile.avatarUrl,
      };
      setEventBringContributions((current) => [...current, insertedContribution]);
      setBringNoteByContribution((current) => ({ ...current, [inserted.id]: "" }));
    }
    setBringBusyKey(null);
  }

  function scheduleContributionNoteSave(
    contribution: EventBringContribution,
    value: string,
  ) {
    setBringNoteByContribution((current) => ({ ...current, [contribution.id]: value }));
    const timeoutKey = `note-${contribution.id}`;
    const currentTimeout = bringAutoSaveTimeoutsRef.current[timeoutKey];
    if (currentTimeout) clearTimeout(currentTimeout);
    if (value.length > 300) return;

    bringAutoSaveTimeoutsRef.current[timeoutKey] = setTimeout(async () => {
      delete bringAutoSaveTimeoutsRef.current[timeoutKey];
      setBringBusyKey(timeoutKey);
      const { error } = await supabase
        .from("event_bring_contributions")
        .update({ note: value })
        .eq("id", contribution.id);

      if (error) {
        setBringMessageTone("error");
        setBringMessage(`שמירת ההערה לא הצליחה. ${formatSupabaseError(error)}`);
        setBringNoteByContribution((current) => ({
          ...current,
          [contribution.id]: contribution.note,
        }));
      } else {
        setEventBringContributions((current) =>
          current.map((item) =>
            item.id === contribution.id ? { ...item, note: value } : item,
          ),
        );
      }
      setBringBusyKey(null);
    }, 550);
  }

  async function removeBringContribution(contribution: EventBringContribution) {
    if (!selectedEventId) return false;
    setBringBusyKey(`contribution-${contribution.id}`);
    setBringMessage(null);
    const { error } = await supabase
      .from("event_bring_contributions")
      .delete()
      .eq("id", contribution.id);
    if (error) {
      setBringMessageTone("error");
      setBringMessage(`הסרת הפריט לא הצליחה. ${formatSupabaseError(error)}`);
      setBringBusyKey(null);
      return false;
    }

    setEventBringContributions((current) =>
      current.filter((item) => item.id !== contribution.id),
    );
    setBringNoteByContribution((current) => {
      const next = { ...current };
      delete next[contribution.id];
      return next;
    });
    setBringMessage(null);
    setBringBusyKey(null);
    return true;
  }

  async function addFreeBringContribution(itemNameOverride?: string) {
    if (!user || !selectedEventId || freeBringAddBusyRef.current) return;
    const itemName = (itemNameOverride ?? bringItemName).trim();
    if (!itemName) return;

    freeBringAddBusyRef.current = true;
    setBringBusyKey("free-add");
    setBringMessage(null);
    const { data: inserted, error } = await supabase
      .from("event_bring_contributions")
      .insert({
        event_id: selectedEventId,
        need_id: null,
        user_id: user.id,
        item_name: itemName,
        quantity: 1,
        note: "",
      })
      .select("id,event_id,need_id,user_id,item_name,quantity,note,created_at")
      .single();
    if (error || !inserted) {
      setBringMessageTone("error");
      setBringMessage(`הוספת הפריט לא הצליחה. ${formatSupabaseError(error)}`);
    } else {
      const googleProfile = getGoogleProfile(user);
      const insertedContribution: EventBringContribution = {
        ...inserted,
        full_name: profile?.full_name || googleProfile.fullName,
        avatar_url: profile?.avatar_url ?? null,
        google_avatar_url: profile?.google_avatar_url ?? googleProfile.avatarUrl,
      };
      setEventBringContributions((current) => [...current, insertedContribution]);
      setBringItemName("");
      setBringMessage(null);
    }
    setBringBusyKey(null);
    freeBringAddBusyRef.current = false;
  }

  function tryAddFreeBringItem() {
    const itemName = bringItemName.trim();
    if (itemName) void addFreeBringContribution(itemName);
  }

  async function toggleManualContribution(
    contribution: EventBringContribution,
    checked: boolean,
  ) {
    if (checked || contribution.user_id !== user?.id || eventLockedForCurrentUser) return;
    await removeBringContribution(contribution);
  }

  async function saveAttendance(statusOverride?: AttendanceStatus) {
    const statusToSave = statusOverride ?? attendanceStatus;
    if (!user || !selectedEventId || !statusToSave || savingAttendance) return;

    setSavingAttendance(true);
    setAttendanceMessage(null);

    const { error } = await supabase.rpc("save_event_attendance", {
      target_event_id: selectedEventId,
      target_status: statusToSave,
    });

    if (error) {
      console.error("Saving event attendance failed", error);
      const previousAttendance = eventAttendance.find(
        (attendance) => attendance.user_id === user.id,
      );
      setAttendanceStatus(previousAttendance?.status ?? null);
      setAttendanceMessageTone("error");
      setAttendanceMessage(
        error.message.includes("event_capacity_exceeded")
          ? "האירוע מלא ולא ניתן להצטרף כרגע."
          : `שמירת ההשתתפות לא הצליחה. ${formatSupabaseError(error)}`,
      );
      setSavingAttendance(false);
      return;
    }

    await loadEventAttendance(selectedEventId);
    setSavingAttendance(false);
    setAttendanceMessage(null);
  }

  async function deleteEventAttendance(attendance: EventAttendance) {
    if (!selectedEventId || !user) return false;

    setMemberActionBusy(true);
    setAttendanceMessage(null);

    const { error } = await supabase.rpc("delete_event_attendance", {
      target_event_id: selectedEventId,
      target_user_id: attendance.user_id,
    });

    if (error) {
      console.error("Deleting event attendance failed", error);
      setAttendanceMessageTone("error");
      setAttendanceMessage(`מחיקת ההשתתפות לא הצליחה. ${formatSupabaseError(error)}`);
      setMemberActionBusy(false);
      return false;
    }

    await Promise.all([
      loadEventAttendance(selectedEventId),
      loadEventBringData(selectedEventId),
    ]);

    setAttendanceMessage(null);
    setMemberActionBusy(false);
    return true;
  }

  async function setEventCancellation(event: CommunityEvent, cancel: boolean) {
    const { error } = await supabase.rpc("set_event_cancelled", {
      target_event_id: event.id,
      target_cancelled: cancel,
    });
    if (error) {
      setMessageTone("error");
      setMessage(`עדכון מצב האירוע נכשל. ${formatSupabaseError(error)}`);
      return false;
    }
    if (selectedCommunity) await loadCommunityEvents(selectedCommunity.id);
    closeEventForm(true);
    return true;
  }

  async function deleteCommunityEvent(event: CommunityEvent) {
    const { error } = await supabase.rpc("delete_community_event", {
      target_event_id: event.id,
    });
    if (error) {
      setMessageTone("error");
      setMessage(`מחיקת האירוע נכשלה. ${formatSupabaseError(error)}`);
      return false;
    }
    closeEventForm(true);
    setSelectedEventId(null);
    if (selectedCommunity) {
      setBrowserView({ circleToken: selectedCommunity.share_token }, "replace");
      await loadCommunityEvents(selectedCommunity.id);
    }
    return true;
  }

  async function deleteCommunityCircle(community: Community) {
    const { error } = await supabase.rpc("delete_community_circle", {
      target_community_id: community.id,
    });
    if (error) {
      setMessageTone("error");
      setMessage(`מחיקת המעגל נכשלה. ${formatSupabaseError(error)}`);
      return false;
    }
    setCommunityFormOpen(false);
    setEditingCommunityId(null);
    setSelectedCommunityId(null);
    setBrowserView({}, "replace");
    if (user) await loadCommunities(user);
    return true;
  }

  type GalleryUploadResult = {
    uploaded: boolean;
    errorText: string | null;
  };

  async function uploadGalleryMedia(
    file: File,
    mediaType: "image" | "video",
    reloadAfterUpload = true,
  ): Promise<GalleryUploadResult> {
    if (!selectedEvent || !selectedCommunity || !user) {
      return { uploaded: false, errorText: "לא ניתן להעלות את הקובץ כרגע." };
    }

    const imageCount = galleryPhotos.filter((item) => item.media_type === "image").length;
    const videoCount = galleryPhotos.filter((item) => item.media_type === "video").length;

    if (mediaType === "image" && imageCount >= galleryImageLimit) {
      const text = `אפשר להעלות עד ${galleryImageLimit} תמונות לגלריה.`;
      setMessageTone("error");
      setMessage(text);
      setGalleryVideoNotice({ text, progress: null, tone: "error" });
      return { uploaded: false, errorText: text };
    }

    if (mediaType === "video" && videoCount >= galleryVideoLimit) {
      const text = `אפשר להעלות עד ${galleryVideoLimit} סרטונים לגלריה.`;
      setMessageTone("error");
      setMessage(text);
      setGalleryVideoNotice({ text, progress: null, tone: "error" });
      return { uploaded: false, errorText: text };
    }

    setGalleryBusy(true);
    setMessage(null);
    if (mediaType === "video") {
      setGalleryVideoNotice({ text: "בודק את הסרטון…", progress: 0, tone: "info" });
    }
    let objectPath = "";

    try {
      const mediaId = crypto.randomUUID();
      let mediaBlob: Blob = file;
      let extension = "jpg";
      let contentType = "image/jpeg";

      if (mediaType === "image") {
        const compressed = await compressImage(file, galleryImageMaxBytes);
        mediaBlob = compressed.blob;
        contentType = compressed.blob.type || "image/jpeg";
        extension = contentType === "image/png" ? "png" : "jpg";
        URL.revokeObjectURL(compressed.previewUrl);
      } else {
        if (!isSupportedVideoFile(file)) {
          throw new Error("unsupported_video_type");
        }
        const compressed = await compressVideo(file, galleryVideoMaxBytes, ({ message, progress }) => {
          setGalleryVideoNotice({ text: message, progress, tone: "info" });
        });
        mediaBlob = compressed.file;
        contentType = "video/mp4";
        extension = "mp4";
        setGalleryVideoNotice({
          text: `הכיווץ הסתיים. מעלה סרטון בגודל ${formatMegabytes(compressed.afterBytes)} מגה…`,
          progress: 100,
          tone: "info",
        });
      }

      if (mediaType === "image" && mediaBlob.size > galleryImageMaxBytes) {
        throw new CompressedImageTooLargeError(file.size, mediaBlob.size, galleryImageMaxBytes);
      }
      if (mediaType === "video" && mediaBlob.size > galleryVideoMaxBytes) {
        throw new CompressedVideoTooLargeError(file.size, mediaBlob.size, galleryVideoMaxBytes);
      }

      objectPath = `${selectedCommunity.id}/${selectedEvent.id}/${user.id}/${mediaId}.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from("event-gallery")
        .upload(objectPath, mediaBlob, {
          contentType,
          cacheControl: "3600",
          upsert: false,
        });
      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from("event-gallery")
        .getPublicUrl(objectPath);
      const mediaUrl = `${publicUrlData.publicUrl}?v=${Date.now()}`;

      const { error } = await supabase.from("event_gallery_photos").insert({
        id: mediaId,
        event_id: selectedEvent.id,
        user_id: user.id,
        image_url: mediaUrl,
        media_type: mediaType,
      });
      if (error) throw error;

      if (reloadAfterUpload) await loadEventGallery(selectedEvent.id);
      if (mediaType === "video") {
        setGalleryVideoNotice({ text: "הסרטון כווץ והועלה בהצלחה.", progress: 100, tone: "success" });
      }
      setGalleryBusy(false);
      return { uploaded: true, errorText: null };
    } catch (error) {
      if (objectPath) {
        await supabase.storage.from("event-gallery").remove([objectPath]);
      }
      setMessageTone("error");
      const formatted = formatSupabaseError(error);
      let text: string;
      if (error instanceof CompressedImageTooLargeError) {
        text = formatCompressedImageTooLarge(error);
      } else if (error instanceof CompressedVideoTooLargeError) {
        text = formatCompressedVideoTooLarge(error);
      } else if (error instanceof Error && error.message === "unsupported_video_type") {
        text = "פורמט הסרטון אינו נתמך. אפשר להעלות MP4, MOV, M4V או WebM.";
      } else if (error instanceof Error && error.message === "video_compression_busy") {
        text = "כבר מתבצע כיווץ של סרטון אחר. המתינו לסיום ונסו שוב.";
      } else if (error instanceof Error && (error.message === "video_metadata_failed" || error.message === "video_metadata_timeout")) {
        text = "לא הצלחנו לקרוא את הסרטון. נסו לבחור קובץ אחר.";
      } else if (formatted.includes("gallery_image_limit_reached")) {
        text = `אפשר להעלות עד ${galleryImageLimit} תמונות לגלריה.`;
      } else if (formatted.includes("gallery_video_limit_reached")) {
        text = `אפשר להעלות עד ${galleryVideoLimit} סרטונים לגלריה.`;
      } else if (mediaType === "image" && error instanceof Error && error.message === "heic_conversion_failed") {
        text = "לא הצלחנו להמיר את קובץ ה־HEIC/HEIF לתמונה רגילה. נסו לבחור את הקובץ שוב או לבחור תמונה אחרת.";
      } else if (mediaType === "image" && error instanceof Error && error.message === "image_decode_failed") {
        text = "לא הצלחנו לקרוא את התמונה. נסו לבחור קובץ תמונה אחר.";
      } else {
        text = `העלאת הקובץ לגלריה נכשלה. ${formatted}`;
      }
      setMessage(text);
      setGalleryVideoNotice({ text, progress: null, tone: "error" });
      setGalleryBusy(false);
      return { uploaded: false, errorText: text };
    }
  }

  async function uploadGalleryImages(files: File[]) {
    if (files.length === 0 || !selectedEvent) return;

    const availableSlots = Math.max(0, galleryImageLimit - galleryImageCount);
    if (availableSlots === 0) {
      const text = `אפשר להעלות עד ${galleryImageLimit} תמונות לגלריה.`;
      setMessageTone("error");
      setMessage(text);
      setGalleryVideoNotice({ text, progress: null, tone: "error" });
      return;
    }

    const filesToUpload = files.slice(0, availableSlots);
    let uploadedCount = 0;
    const errors: string[] = [];

    for (let index = 0; index < filesToUpload.length; index += 1) {
      setGalleryVideoNotice({
        text: `מעבד ומעלה תמונה ${index + 1} מתוך ${filesToUpload.length}…`,
        progress: Math.round((index / filesToUpload.length) * 100),
        tone: "info",
      });
      const result = await uploadGalleryMedia(filesToUpload[index], "image", false);
      if (result.uploaded) uploadedCount += 1;
      else if (result.errorText) errors.push(result.errorText);
    }

    if (uploadedCount > 0) await loadEventGallery(selectedEvent.id);
    const skippedCount = files.length - filesToUpload.length;
    if (errors.length > 0 || skippedCount > 0) {
      const firstError = errors[0] ?? "";
      const extraErrors = errors.length > 1 ? ` בנוסף, ${errors.length - 1} תמונות נוספות לא הועלו.` : "";
      const skippedText = skippedCount > 0
        ? ` ${skippedCount} תמונות לא הועלו משום שהגלריה מוגבלת ל־${galleryImageLimit} תמונות.`
        : "";
      const text = `${firstError}${extraErrors}${skippedText}`.trim();
      setMessageTone("error");
      setMessage(text);
      setGalleryVideoNotice({ text, progress: null, tone: "error" });
    } else {
      setGalleryVideoNotice({
        text: `${uploadedCount} תמונות הועלו בהצלחה.`,
        progress: 100,
        tone: "success",
      });
    }
  }

  async function uploadGalleryVideos(files: File[]) {
    if (files.length === 0 || !selectedEvent) return;

    const availableSlots = Math.max(0, galleryVideoLimit - galleryVideoCount);
    if (availableSlots === 0) {
      const text = `אפשר להעלות עד ${galleryVideoLimit} סרטונים לגלריה.`;
      setMessageTone("error");
      setMessage(text);
      setGalleryVideoNotice({ text, progress: null, tone: "error" });
      return;
    }

    const filesToUpload = files.slice(0, availableSlots);
    let uploadedCount = 0;
    const errors: string[] = [];

    for (let index = 0; index < filesToUpload.length; index += 1) {
      setGalleryVideoNotice({
        text: `מעבד סרטון ${index + 1} מתוך ${filesToUpload.length}…`,
        progress: 0,
        tone: "info",
      });
      const result = await uploadGalleryMedia(filesToUpload[index], "video", false);
      if (result.uploaded) uploadedCount += 1;
      else if (result.errorText) errors.push(result.errorText);
    }

    if (uploadedCount > 0) await loadEventGallery(selectedEvent.id);
    const skippedCount = files.length - filesToUpload.length;
    if (errors.length > 0 || skippedCount > 0) {
      const firstError = errors[0] ?? "";
      const extraErrors = errors.length > 1 ? ` בנוסף, ${errors.length - 1} סרטונים נוספים לא הועלו.` : "";
      const skippedText = skippedCount > 0
        ? ` ${skippedCount} סרטונים לא הועלו משום שהגלריה מוגבלת ל־${galleryVideoLimit} סרטונים.`
        : "";
      const text = `${firstError}${extraErrors}${skippedText}`.trim();
      setMessageTone("error");
      setMessage(text);
      setGalleryVideoNotice({ text, progress: null, tone: "error" });
    } else {
      setGalleryVideoNotice({
        text: `${uploadedCount} סרטונים הועלו בהצלחה.`,
        progress: 100,
        tone: "success",
      });
    }
  }

  async function deleteGalleryPhoto(photo: EventGalleryPhoto) {
    const publicPathMarker = "/storage/v1/object/public/event-gallery/";
    const markerIndex = photo.image_url.indexOf(publicPathMarker);
    if (markerIndex >= 0) {
      const objectPath = decodeURIComponent(
        photo.image_url.slice(markerIndex + publicPathMarker.length).split("?")[0],
      );
      const { error: storageError } = await supabase.storage
        .from("event-gallery")
        .remove([objectPath]);
      if (storageError) {
        setMessageTone("error");
        setMessage(`מחיקת הקובץ נכשלה. ${formatSupabaseError(storageError)}`);
        return false;
      }
    }

    const { error } = await supabase
      .from("event_gallery_photos")
      .delete()
      .eq("id", photo.id);
    if (error) {
      setMessageTone("error");
      setMessage(`מחיקת הקובץ מהגלריה נכשלה. ${formatSupabaseError(error)}`);
      return false;
    }
    if (selectedEventId) await loadEventGallery(selectedEventId);
    return true;
  }

  async function openPersonalEventRow(row: PersonalEventRow) {
    setProfileScreenOpen(false);
    setSelectedCommunityId(row.community.id);
    await loadCommunityEvents(row.community.id);
    setPendingEventOpenId(row.event.id);
    setBrowserView({ eventToken: row.event.share_token });
  }

  async function deleteNotification(notification: AppNotification) {
    const { error } = await supabase
      .from("notifications")
      .delete()
      .eq("id", notification.id);

    if (error) {
      console.error("Deleting notification failed", error);
      setMessageTone("error");
      setMessage(`לא הצלחנו למחוק את ההתראה. ${formatSupabaseError(error)}`);
      return false;
    }

    setNotifications((current) => current.filter((item) => item.id !== notification.id));
    return true;
  }

  async function deleteAllNotifications() {
    if (!user) return false;

    const { error } = await supabase
      .from("notifications")
      .delete()
      .eq("user_id", user.id);

    if (error) {
      console.error("Deleting all notifications failed", error);
      setMessageTone("error");
      setMessage(`לא הצלחנו למחוק את ההתראות. ${formatSupabaseError(error)}`);
      return false;
    }

    setNotifications([]);
    return true;
  }

  async function openNotification(notification: AppNotification) {
    if (!notification.read_at) {
      await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", notification.id);
    }
    setNotificationsOpen(false);
    await loadNotifications();

    if (notification.event_id) {
      const localEvent = communityEvents.find((event) => event.id === notification.event_id);
      if (localEvent) {
        setSelectedCommunityId(localEvent.community_id);
        setSelectedEventId(localEvent.id);
        setBrowserView({ eventToken: localEvent.share_token });
        return;
      }
      const { data } = await supabase
        .from("community_events")
        .select("id,community_id,share_token")
        .eq("id", notification.event_id)
        .maybeSingle();
      if (data) {
        const community = communities.find((item) => item.id === data.community_id);
        if (community) {
          setSelectedCommunityId(community.id);
          await loadCommunityEvents(community.id);
          setPendingEventOpenId(data.id);
          setBrowserView({ eventToken: data.share_token });
        }
      }
      return;
    }

    if (notification.community_id) {
      const community = communities.find((item) => item.id === notification.community_id);
      if (community) {
        setSelectedCommunityId(community.id);
        setBrowserView({ circleToken: community.share_token });
      }
    }
  }

  async function saveMediaDefaults() {
    if (!user || !isSystemAdminEmail(user.email)) return;

    const values = mediaDefaults;
    const valid =
      Number.isInteger(values.default_gallery_image_limit) &&
      values.default_gallery_image_limit >= MEDIA_LIMITS.imageCountMin &&
      values.default_gallery_image_limit <= MEDIA_LIMITS.imageCountMax &&
      Number.isFinite(values.default_gallery_image_max_mb) &&
      values.default_gallery_image_max_mb >= MEDIA_LIMITS.imageMaxMbMin &&
      values.default_gallery_image_max_mb <= MEDIA_LIMITS.imageMaxMbMax &&
      Number.isInteger(values.default_gallery_video_limit) &&
      values.default_gallery_video_limit >= MEDIA_LIMITS.videoCountMin &&
      values.default_gallery_video_limit <= MEDIA_LIMITS.videoCountMax &&
      Number.isFinite(values.default_gallery_video_max_mb) &&
      values.default_gallery_video_max_mb >= MEDIA_LIMITS.videoMaxMbMin &&
      values.default_gallery_video_max_mb <= MEDIA_LIMITS.videoMaxMbMax;

    if (!valid) {
      setMediaDefaultsMessageTone("error");
      setMediaDefaultsMessage("אחת מהגדרות המדיה אינה בטווח המותר.");
      return;
    }

    setMediaDefaultsSaving(true);
    setMediaDefaultsMessage(null);
    const { error } = await supabase
      .from("system_media_settings")
      .update({
        ...values,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);

    if (error) {
      setMediaDefaultsMessageTone("error");
      setMediaDefaultsMessage(`שמירת ברירות המחדל נכשלה. ${formatSupabaseError(error)}`);
    } else {
      setMediaDefaultsMessageTone("success");
      setMediaDefaultsMessage("ברירות המחדל לאירועים חדשים נשמרו.");
    }
    setMediaDefaultsSaving(false);
  }

  async function saveEvent() {
    if (!user || !selectedCommunity) return;

    const cleanTitle = eventTitle.trim();
    const cleanLocation = eventLocation.trim();
    const cleanDescription = eventDescription.trim();
    const startsAtDate = new Date(eventDateTime);
    const parsedParticipantLimit = Number.parseInt(eventParticipantLimit, 10);
    const parsedGalleryImageLimit = Number.parseInt(eventGalleryImageLimit, 10);
    const parsedGalleryImageMaxMb = Number.parseFloat(eventGalleryImageMaxMb);
    const parsedGalleryVideoLimit = Number.parseInt(eventGalleryVideoLimit, 10);
    const parsedGalleryVideoMaxMb = Number.parseFloat(eventGalleryVideoMaxMb);
    let endsAtDate: Date | null = null;

    if (cleanTitle.length < 2) {
      setMessageTone("error");
      setMessage("שם האירוע חייב להכיל לפחות שני תווים.");
      return;
    }

    if (!eventDateTime || Number.isNaN(startsAtDate.getTime())) {
      setMessageTone("error");
      setMessage("יש לבחור תאריך ושעת התחלה לאירוע.");
      return;
    }

    if (eventEndDateTime) {
      const startDatePart = eventDateTime.slice(0, 10);
      endsAtDate = new Date(`${startDatePart}T${eventEndDateTime}`);
      if (Number.isNaN(endsAtDate.getTime())) {
        setMessageTone("error");
        setMessage("שעת הסיום אינה תקינה.");
        return;
      }
      if (endsAtDate.getTime() <= startsAtDate.getTime()) {
        setMessageTone("error");
        setMessage("שעת הסיום חייבת להיות מאוחרת משעת ההתחלה.");
        return;
      }
    }

    if (
      eventHasParticipantLimit &&
      (!Number.isInteger(parsedParticipantLimit) ||
        parsedParticipantLimit < 1 ||
        parsedParticipantLimit > 10000)
    ) {
      setMessageTone("error");
      setMessage("מגבלת המשתתפים צריכה להיות מספר בין 1 ל־10,000.");
      return;
    }

    if (
      !Number.isInteger(parsedGalleryImageLimit) ||
      parsedGalleryImageLimit < MEDIA_LIMITS.imageCountMin ||
      parsedGalleryImageLimit > MEDIA_LIMITS.imageCountMax
    ) {
      setMessageTone("error");
      setMessage(`מספר התמונות צריך להיות בין ${MEDIA_LIMITS.imageCountMin} ל־${MEDIA_LIMITS.imageCountMax}.`);
      return;
    }

    if (
      !Number.isFinite(parsedGalleryImageMaxMb) ||
      parsedGalleryImageMaxMb < MEDIA_LIMITS.imageMaxMbMin ||
      parsedGalleryImageMaxMb > MEDIA_LIMITS.imageMaxMbMax
    ) {
      setMessageTone("error");
      setMessage(`גודל תמונה מכווצת צריך להיות בין ${MEDIA_LIMITS.imageMaxMbMin} ל־${MEDIA_LIMITS.imageMaxMbMax} מגה.`);
      return;
    }

    if (
      !Number.isInteger(parsedGalleryVideoLimit) ||
      parsedGalleryVideoLimit < MEDIA_LIMITS.videoCountMin ||
      parsedGalleryVideoLimit > MEDIA_LIMITS.videoCountMax
    ) {
      setMessageTone("error");
      setMessage(`מספר הסרטונים צריך להיות בין ${MEDIA_LIMITS.videoCountMin} ל־${MEDIA_LIMITS.videoCountMax}.`);
      return;
    }

    if (
      !Number.isFinite(parsedGalleryVideoMaxMb) ||
      parsedGalleryVideoMaxMb < MEDIA_LIMITS.videoMaxMbMin ||
      parsedGalleryVideoMaxMb > MEDIA_LIMITS.videoMaxMbMax
    ) {
      setMessageTone("error");
      setMessage(`גודל סרטון מכווץ צריך להיות בין ${MEDIA_LIMITS.videoMaxMbMin} ל־${MEDIA_LIMITS.videoMaxMbMax} מגה.`);
      return;
    }

    if (eventBringMode === "planned" && eventBringNeedDrafts.length === 0) {
      setMessageTone("error");
      setMessage("בטבלה מוגדרת מראש יש להוסיף לפחות פריט אחד.");
      return;
    }

    setSavingEvent(true);
    setMessage(null);

    const startsAt = startsAtDate.toISOString();
    const endsAt = endsAtDate?.toISOString() ?? null;
    const participantLimit = eventHasParticipantLimit ? parsedParticipantLimit : null;
    const existingEvent = editingEventId
      ? communityEvents.find((event) => event.id === editingEventId) ?? null
      : null;
    const cloneSourceEvent = cloneEventId
      ? communityEvents.find((event) => event.id === cloneEventId) ?? null
      : null;

    if (existingEvent) {
      let imageUrl = existingEvent.image_url;

      if (eventImage) {
        try {
          imageUrl = await uploadPublicImage(
            "event-images",
            `${selectedCommunity.id}/${existingEvent.id}/cover.jpg`,
            eventImage.blob,
          );
        } catch (error) {
          setMessageTone("error");
          setMessage("העלאת תמונת האירוע לא הצליחה. נסו שוב.");
          setSavingEvent(false);
          return;
        }
      }

      const { error } = await supabase
        .from("community_events")
        .update({
          title: cleanTitle,
          description: cleanDescription,
          location: cleanLocation,
          starts_at: startsAt,
          ends_at: endsAt,
          participant_limit: participantLimit,
          bring_mode: eventBringMode,
          gallery_image_limit: parsedGalleryImageLimit,
          gallery_image_max_mb: parsedGalleryImageMaxMb,
          gallery_video_limit: parsedGalleryVideoLimit,
          gallery_video_max_mb: parsedGalleryVideoMaxMb,
          image_url: imageUrl,
        })
        .eq("id", existingEvent.id);

      if (error) {
        console.error("Updating event failed", error);
        setMessageTone("error");
        setMessage(
          error.message.includes("participant_limit_below_current_attendance")
            ? "אי אפשר להגדיר מגבלה נמוכה ממספר האנשים שכבר אישרו הגעה."
            : `שמירת האירוע לא הצליחה. ${formatSupabaseError(error)}`,
        );
        setSavingEvent(false);
        return;
      }

      const needsError = await syncEventBringNeeds(existingEvent.id);
      if (needsError) {
        console.error("Saving event bring table failed", needsError);
        setMessageTone("error");
        setMessage(
          needsError.code === "23503"
            ? "אי אפשר להסיר שורה שכבר נבחרה על ידי משתתף. אפשר לשנות את שמה."
            : `האירוע נשמר, אך שמירת טבלת מה מביאים לא הצליחה. ${formatSupabaseError(needsError)}`,
        );
        setSavingEvent(false);
        return;
      }

      await loadCommunityEvents(selectedCommunity.id);
      if (selectedEventId === existingEvent.id) await loadEventBringData(existingEvent.id);
      setSavingEvent(false);
      closeEventForm(true);
      setMessageTone("success");
      setMessage(`האירוע „${cleanTitle}” נשמר.`);
      return;
    }

    const eventId = crypto.randomUUID();
    const { error: insertError } = await supabase.from("community_events").insert({
      id: eventId,
      community_id: selectedCommunity.id,
      title: cleanTitle,
      description: cleanDescription,
      location: cleanLocation,
      starts_at: startsAt,
      ends_at: endsAt,
      participant_limit: participantLimit,
      bring_mode: eventBringMode,
      gallery_image_limit: parsedGalleryImageLimit,
      gallery_image_max_mb: parsedGalleryImageMaxMb,
      gallery_video_limit: parsedGalleryVideoLimit,
      gallery_video_max_mb: parsedGalleryVideoMaxMb,
      image_url: cloneSourceEvent?.image_url ?? null,
      status: "active",
      created_by: user.id,
    });

    if (insertError) {
      console.error("Creating event failed", insertError);
      setMessageTone("error");
      setMessage(`יצירת האירוע לא הצליחה. ${formatSupabaseError(insertError)}`);
      setSavingEvent(false);
      return;
    }

    const needsError = await syncEventBringNeeds(eventId);
    if (needsError) {
      console.error("Creating event bring table failed", needsError);
      setMessageTone("error");
      setMessage(`האירוע נוצר, אך טבלת מה מביאים לא נשמרה. ${formatSupabaseError(needsError)}`);
      setSavingEvent(false);
      return;
    }

    let imageUploadFailed = false;
    if (eventImage) {
      try {
        const imageUrl = await uploadPublicImage(
          "event-images",
          `${selectedCommunity.id}/${eventId}/cover.jpg`,
          eventImage.blob,
        );

        const { error: imageUpdateError } = await supabase
          .from("community_events")
          .update({ image_url: imageUrl })
          .eq("id", eventId);

        if (imageUpdateError) throw imageUpdateError;
      } catch (error) {
        imageUploadFailed = true;
      }
    }

    await loadCommunityEvents(selectedCommunity.id);
    setSavingEvent(false);
    closeEventForm(true);
    setMessageTone(imageUploadFailed ? "error" : "success");
    setMessage(
      imageUploadFailed
        ? `האירוע „${cleanTitle}” נוצר, אך העלאת התמונה לא הצליחה.`
        : `האירוע „${cleanTitle}” נוצר בהצלחה.`,
    );
  }

  async function acceptLegalConsent() {
    if (!user || !profile || !legalConsentChecked) return;

    const birthdayError = validateBirthday(birthDay, birthMonth, birthYear);
    if (birthdayError) {
      setMessageTone("error");
      setMessage(birthdayError);
      return;
    }

    setLegalConsentSaving(true);
    setMessage(null);
    const acceptedAt = new Date().toISOString();
    let avatarUrl = profile.avatar_url;

    if (profileImage) {
      try {
        avatarUrl = await uploadPublicImage(
          "profile-images",
          `${user.id}/avatar.jpg`,
          profileImage.blob,
        );
      } catch (error) {
        console.error("Uploading profile image during legal acceptance failed", error);
        setMessageTone("error");
        setMessage("העלאת תמונת הפרופיל לא הצליחה. נסו שוב.");
        setLegalConsentSaving(false);
        return;
      }
    }

    const { data, error } = await supabase
      .from("profiles")
      .update({
        city: city.trim(),
        phone: phone.trim(),
        birth_day: birthDay ? Number(birthDay) : null,
        birth_month: birthMonth ? Number(birthMonth) : null,
        birth_year: birthYear ? Number(birthYear) : null,
        avatar_url: avatarUrl,
        legal_accepted_at: acceptedAt,
        legal_version: LEGAL_VERSION,
      })
      .eq("id", user.id)
      .select("id,email,full_name,about,city,phone,birth_day,birth_month,birth_year,avatar_url,google_avatar_url,legal_accepted_at,legal_version")
      .single<Profile>();

    if (error) {
      console.error("Saving legal acceptance failed", error);
      setMessageTone("error");
      setMessage(
        error.code === "42703"
          ? "יש להריץ את קובץ ה־SQL של circles130 ב־Supabase."
          : "לא הצלחנו לשמור את האישור. נסו שוב.",
      );
    } else {
      setProfile(data);
      setCity(data.city);
      setPhone(data.phone);
      setBirthDay(data.birth_day?.toString() ?? "");
      setBirthMonth(data.birth_month?.toString() ?? "");
      setBirthYear(data.birth_year?.toString() ?? "");
      setProfileImage((current) => {
        clearSelectedImage(current);
        return null;
      });
      setLegalConsentChecked(false);
      setLegalScreenOpen(false);
      setMessageTone("success");
      setMessage("האישור והפרטים נשמרו.");
    }

    setLegalConsentSaving(false);
  }

  async function notifyManagersAboutPendingJoin(communityId: string) {
    try {
      const response = await fetch("/api/email/join-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ communityId }),
      });

      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as { message?: string } | null;
        console.error("Sending pending join request email failed", result?.message ?? response.statusText);
      }
    } catch (error) {
      console.error("Sending pending join request email failed", error);
    }
  }

  function openCommunityWhatsAppComposer() {
    if (!selectedCommunity) return;

    setWhatsAppComposer({
      type: "community",
      title: selectedCommunity.name,
      details: null,
      shareUrl: getCommunityShareUrl(selectedCommunity.share_token),
      imageUrl: getCommunityImageUrl(selectedCommunity.logo_url),
    });
    setWhatsAppMessage("");
  }

  function openEventWhatsAppComposer() {
    if (!selectedEvent || !selectedCommunity) return;

    setWhatsAppComposer({
      type: "event",
      title: selectedEvent.title,
      details: formatWhatsAppEventDateTime(selectedEvent.starts_at),
      shareUrl: getEventShareUrl(selectedEvent.share_token),
      imageUrl: selectedEvent.image_url ?? getCommunityImageUrl(selectedCommunity.logo_url),
    });
    setWhatsAppMessage("");
  }

  function closeWhatsAppComposer() {
    setWhatsAppComposer(null);
    setWhatsAppMessage("");
  }

  function getWhatsAppComposerUrl() {
    if (!whatsAppComposer) return "https://wa.me/";

    const messageText = whatsAppMessage.trim().replaceAll("*", "");
    const headerText = [whatsAppComposer.title, whatsAppComposer.details]
      .filter(Boolean)
      .join(" ")
      .replaceAll("*", "");
    const fullText = [
      headerText ? `*${headerText}*` : "",
      messageText ? `*${messageText}*` : "",
      whatsAppComposer.shareUrl,
    ]
      .filter(Boolean)
      .join("\n\n");

    return `https://wa.me/?text=${encodeURIComponent(fullText)}`;
  }

  const legalConsentAccepted = Boolean(
    profile?.legal_accepted_at && profile.legal_version === LEGAL_VERSION,
  );

  if (loading || (user && profileLoading && !profile)) {
    return (
      <main className="centered-page">
        <div className="loading-panel">
          <span className="spinner" />
          <p>טוענים את המעגל שלך...</p>
        </div>
      </main>
    );
  }

  if (legalScreenOpen || Boolean(user && profile && !legalConsentAccepted)) {
    const acceptanceRequired = !user || !legalConsentAccepted;
    const canCloseLegalScreen = !user || legalConsentAccepted;

    return (
      <>
        <LegalScreen
        checked={legalConsentChecked}
        onCheckedChange={updateLegalConsentChecked}
        onAccept={acceptLegalConsent}
        onBack={canCloseLegalScreen ? () => setLegalScreenOpen(false) : undefined}
        onSignOut={user ? () => void signOut() : undefined}
        signingOut={authBusy}
        saving={legalConsentSaving}
        acceptanceRequired={acceptanceRequired}
        acceptButtonLabel={user ? "אישור והמשך" : "אישור וחזרה לכניסה"}
        acceptedAt={profile?.legal_accepted_at}
        profileName={profile?.full_name ?? (user ? getGoogleProfile(user).fullName : "משתמש")}
        profileImageUrl={
          profileImage?.previewUrl ??
          getProfileImageUrl(profile?.avatar_url ?? null, profile?.google_avatar_url ?? null)
        }
        city={city}
        phone={phone}
        birthDay={birthDay}
        birthMonth={birthMonth}
        birthYear={birthYear}
        onCityChange={setCity}
        onPhoneChange={setPhone}
        onBirthDayChange={setBirthDay}
        onBirthMonthChange={setBirthMonth}
        onBirthYearChange={setBirthYear}
        onProfileImageSelected={(file) => void prepareImage(file, "profile")}
        message={message}
        messageTone={messageTone}
        />
        {profileCropRequest && (
          <ProfileImageCropper
            request={profileCropRequest}
            onCancel={closeProfileImageCropper}
            onConfirm={acceptProfileImageCrop}
          />
        )}
      </>
    );
  }

  if (!user) {
    return (
      <main className="login-page">
        <section className="login-card" aria-live="polite">
          <header className="brand-lockup">
            <CirclesMark />
            <div>
              <p className="brand-name">מעגלים</p>
              <p className="brand-name-en">Circles</p>
              <p className="app-version">{APP_VERSION}</p>
            </div>
          </header>

          <p className="eyebrow">אנשים · מעגלים · אירועים</p>
          <h1 className="login-main-title">המקום שבו המעגל נפגש</h1>
          {(pendingShareToken || pendingEventShareToken) && (
            <div className="login-invite-card">
              {inviteLoading ? (
                <div className="inline-loading">
                  <span className="spinner spinner-small" />
                  טוענים את ההזמנה...
                </div>
              ) : invitedEvent ? (
                <>
                  {invitedEvent.image_url && (
                    <a
                      className="image-zoom-button login-invite-image-button"
                      href={invitedEvent.image_url}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`הגדלת תמונת האירוע ${invitedEvent.title}`}
                    >
                      <img
                        className="login-invite-image"
                        src={invitedEvent.image_url}
                        alt={`תמונת האירוע ${invitedEvent.title}`}
                      />
                    </a>
                  )}
                  <span>הוזמנתם לאירוע</span>
                  <strong>{invitedEvent.title}</strong>
                  <small>{formatEventDate(invitedEvent.starts_at, invitedEvent.ends_at)}</small>
                  {invitedEvent.location && <small>{invitedEvent.location}</small>}
                  {invitedEvent.participant_limit !== null && (
                    <small>עד {invitedEvent.participant_limit} משתתפים</small>
                  )}
                  {invitedEvent.description && (
                    <RichText
                      text={invitedEvent.description}
                      className="login-invite-description"
                    />
                  )}
                </>
              ) : invitedCommunity ? (
                <>
                  {(getCommunityImageUrl(invitedCommunity.logo_url)) && (
                    <a
                      className="image-zoom-button login-invite-image-button"
                      href={getCommunityImageUrl(invitedCommunity.logo_url)}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`הגדלת תמונת המעגל ${invitedCommunity.name}`}
                    >
                      <img
                        className="login-invite-image"
                        src={getCommunityImageUrl(invitedCommunity.logo_url)}
                        alt={`תמונת המעגל ${invitedCommunity.name}`}
                      />
                    </a>
                  )}
                  <span>הוזמנתם להצטרף למעגל</span>
                  <strong>{invitedCommunity.name}</strong>
                  {invitedCommunity.description && (
                    <RichText
                      text={invitedCommunity.description}
                      className="login-invite-description"
                    />
                  )}
                </>
              ) : null}
            </div>
          )}

          <button
            type="button"
            className="primary-button google-button"
            onClick={signInWithGoogle}
            disabled={authBusy}
          >
            {authBusy ? <span className="spinner spinner-small" /> : <GoogleIcon />}
            <span>{authBusy ? "פותחים את Google..." : "כניסה באמצעות Google"}</span>
          </button>

          {message && <p className={`message-box ${messageTone}`}>{message}</p>}
        </section>
      </main>
    );
  }

  const googleProfile = getGoogleProfile(user);
  const displayName = profile?.full_name || googleProfile.fullName;
  const displayAvatar =
    profileImage?.previewUrl ??
    profile?.avatar_url ??
    profile?.google_avatar_url ??
    googleProfile.avatarUrl;
  const selectedCommunity =
    communities.find((community) => community.id === selectedCommunityId) ?? null;
  const editingCommunity =
    communities.find((community) => community.id === editingCommunityId) ?? null;
  const communityFormImageUrl = communityImage?.previewUrl ?? editingCommunity?.logo_url ?? null;
  const communityFormVideoUrl = communityVideo?.previewUrl ?? editingCommunity?.video_url ?? null;
  const editingEvent = communityEvents.find((event) => event.id === editingEventId) ?? null;
  async function sendConversationMessage(body: string) {
    if (!user || !selectedEventId || !activeConversationTopicId) return false;

    setConversationMessage(null);
    const { error } = await supabase.from("event_conversation_messages").insert({
      event_id: selectedEventId,
      topic_id: activeConversationTopicId,
      user_id: user.id,
      body,
    });

    if (error) {
      console.error("Sending event conversation message failed", error);
      setConversationMessageTone("error");
      setConversationMessage(
        error.code === "42501"
          ? "רק חברי המעגל יכולים להשתתף בשיחה."
          : "לא הצלחנו לשלוח את ההודעה.",
      );
      return false;
    }

    conversationShouldScrollToEndRef.current = true;
    await loadEventConversations(selectedEventId, { showLoading: false, scrollToEnd: true });
    return true;
  }

  function startEditingConversationMessage(message: EventConversationMessage) {
    setEditingConversationMessageId(message.id);
    setEditingConversationBody(message.body);
    setConversationMessage(null);
  }

  function cancelEditingConversationMessage() {
    setEditingConversationMessageId(null);
    setEditingConversationBody("");
  }

  async function saveConversationMessageEdit(message: EventConversationMessage) {
    if (!user || message.user_id !== user.id || conversationBusyMessageId) return;
    const body = editingConversationBody.trim();
    if (!body) return;

    setConversationBusyMessageId(message.id);
    setConversationMessage(null);
    const { error } = await supabase
      .from("event_conversation_messages")
      .update({ body })
      .eq("id", message.id)
      .eq("user_id", user.id);

    if (error) {
      console.error("Updating event conversation message failed", error);
      setConversationMessageTone("error");
      setConversationMessage("לא הצלחנו לעדכן את ההודעה.");
      setConversationBusyMessageId(null);
      return;
    }

    cancelEditingConversationMessage();
    if (selectedEventId) await loadEventConversations(selectedEventId, { showLoading: false, scrollToEnd: false });
    setConversationBusyMessageId(null);
  }

  async function deleteConversationMessage(message: EventConversationMessage) {
    if (!selectedEventId || conversationBusyMessageId) return false;

    setConversationBusyMessageId(message.id);
    const { error } = await supabase
      .from("event_conversation_messages")
      .delete()
      .eq("id", message.id);

    if (error) {
      console.error("Deleting event conversation message failed", error);
      setConversationMessageTone("error");
      setConversationMessage("לא הצלחנו למחוק את ההודעה.");
      setConversationBusyMessageId(null);
      return false;
    }

    if (editingConversationMessageId === message.id) cancelEditingConversationMessage();
    await loadEventConversations(selectedEventId, { showLoading: false, scrollToEnd: false });
    setConversationBusyMessageId(null);
    return true;
  }

  const selectedEvent = communityEvents.find((event) => event.id === selectedEventId) ?? null;
  const selectedEventDisplayImageUrl =
    selectedEvent?.image_url ?? selectedCommunity?.logo_url ?? null;
  const activeConversationTopic =
    conversationTopics.find((topic) => topic.id === activeConversationTopicId) ?? null;
  const activeConversationMessages = activeConversationTopic
    ? conversationMessages.filter((message) => message.topic_id === activeConversationTopic.id)
    : [];

  const cloneSourceEvent = cloneEventId
    ? communityEvents.find((event) => event.id === cloneEventId) ?? null
    : null;
  const directCloneSourceEvent = directCloneEventId
    ? communityEvents.find((event) => event.id === directCloneEventId) ?? null
    : null;
  const eventFormImageUrl =
    eventImage?.previewUrl ?? editingEvent?.image_url ?? cloneSourceEvent?.image_url ?? null;
  const ownEventAttendance = eventAttendance.find((attendance) => attendance.user_id === user.id) ?? null;
  const goingAttendance = eventAttendance.filter((attendance) => attendance.status === "going");
  const maybeAttendance = eventAttendance.filter((attendance) => attendance.status === "maybe");
  const notGoingAttendance = eventAttendance.filter((attendance) => attendance.status === "not_going");
  const totalGoingPeople = goingAttendance.length;
  const freeBringContributions = eventBringContributions.filter(
    (contribution) => contribution.need_id === null,
  );
  const bringDisplayRows: BringDisplayRow[] = [
    ...(selectedEvent?.bring_mode === "planned"
      ? eventBringNeeds.map((need) => ({
          kind: "need" as const,
          sortName: need.item_name,
          need,
        }))
      : []),
    ...freeBringContributions.map((contribution) => ({
      kind: "free" as const,
      sortName: contribution.item_name,
      contribution,
    })),
  ].sort((first, second) =>
    first.sortName.localeCompare(second.sortName, "he", { sensitivity: "base" }),
  );
  const copyableEvents = communityEvents.filter(
    (event) => event.id !== editingEventId && event.bring_mode === "planned",
  );
  const now = Date.now();
  const upcomingEvents = communityEvents.filter(
    (event) => new Date(event.ends_at ?? event.starts_at).getTime() >= now,
  );
  const pastEvents = communityEvents
    .filter((event) => new Date(event.ends_at ?? event.starts_at).getTime() < now)
    .sort(
      (first, second) =>
        new Date(second.starts_at).getTime() - new Date(first.starts_at).getTime(),
    );
  const eventManagers = communityMembers.filter(
    (member) => member.role === "owner" || member.role === "admin",
  );
  const invitedMembership = invitedCommunity
    ? communities.find((community) => community.id === invitedCommunity.id) ?? null
    : null;
  const canManageCommunityMembers = canOwnCommunity(
    selectedCommunity,
    user.id,
    user.email,
  );
  const canRemoveCommunityMembers = canManageCommunityMembers;
  const currentUserCommunityMembership = communityMembers.find(
    (member) => member.user_id === user.id,
  ) ?? null;
  const canLeaveSelectedCommunity = Boolean(
    selectedCommunity &&
      (selectedCommunity.is_member || currentUserCommunityMembership) &&
      (isSystemAdminEmail(user.email) ||
        (selectedCommunity.role !== "owner" && selectedCommunity.created_by !== user.id)),
  );
  const canManageEvents = Boolean(
    selectedCommunity && canManageCommunity(selectedCommunity.role, user.email),
  );
  const visibleAttendanceGroups: Array<[string, EventAttendance[]]> = [
    ["מגיעים", goingAttendance],
    ["אולי", maybeAttendance],
  ];
  if (canManageEvents) visibleAttendanceGroups.push(["לא מגיעים", notGoingAttendance]);
  const hasVisibleAttendance = visibleAttendanceGroups.some(([, rows]) => rows.length > 0);
  const canDeleteAnyEventAttendance = Boolean(selectedEvent && canManageEvents);
  const selectedEventIsCancelled = selectedEvent?.status === "cancelled";
  const selectedEventIsPast = Boolean(
    selectedEvent && new Date(selectedEvent.starts_at).getTime() <= Date.now(),
  );
  const eventLockedForCurrentUser = Boolean(
    selectedEvent && !canDeleteAnyEventAttendance &&
      (selectedEventIsCancelled || selectedEventIsPast),
  );
  const selectedEventIsFull = Boolean(
    selectedEvent?.participant_limit !== null &&
      totalGoingPeople >= (selectedEvent?.participant_limit ?? Number.POSITIVE_INFINITY) &&
      ownEventAttendance?.status !== "going",
  );
  const galleryCanUpload = Boolean(
    selectedEvent &&
      selectedCommunity &&
      (selectedCommunity.is_member || currentUserCommunityMembership || isSystemAdminEmail(user.email)) &&
      new Date(selectedEvent.starts_at).getTime() <= Date.now() &&
      (!selectedEventIsCancelled || canManageEvents),
  );
  const galleryImageLimit = selectedEvent?.gallery_image_limit ?? mediaDefaults.default_gallery_image_limit;
  const galleryImageMaxMb = selectedEvent?.gallery_image_max_mb ?? mediaDefaults.default_gallery_image_max_mb;
  const galleryVideoLimit = selectedEvent?.gallery_video_limit ?? mediaDefaults.default_gallery_video_limit;
  const galleryVideoMaxMb = selectedEvent?.gallery_video_max_mb ?? mediaDefaults.default_gallery_video_max_mb;
  const galleryImageMaxBytes = megabytesToBytes(galleryImageMaxMb);
  const galleryVideoMaxBytes = megabytesToBytes(galleryVideoMaxMb);
  const galleryImageCount = galleryPhotos.filter((item) => item.media_type === "image").length;
  const galleryVideoCount = galleryPhotos.filter((item) => item.media_type === "video").length;
  const cloneableWholeEvents = [...communityEvents].sort(
    (first, second) => new Date(second.starts_at).getTime() - new Date(first.starts_at).getTime(),
  );
  const unreadNotificationCount = notifications.filter((item) => !item.read_at).length;
  const shareUrl = shareCommunity
    ? getCommunityShareUrl(shareCommunity.share_token)
    : "";
  const shareText = shareCommunity
    ? getCommunityShareText(shareCommunity, shareUrl)
    : "";
  const eventShareUrl = shareEvent ? getEventShareUrl(shareEvent.share_token) : "";
  const eventShareText = shareEvent ? getEventShareText(shareEvent, eventShareUrl) : "";
  const eventShareImageUrl = shareEvent?.image_url ?? selectedCommunity?.logo_url ?? null;
  const profileIsDirty = Boolean(
    profile &&
      (fullName !== profile.full_name ||
        about !== profile.about ||
        city !== profile.city ||
        phone !== profile.phone ||
        birthDay !== (profile.birth_day?.toString() ?? "") ||
        birthMonth !== (profile.birth_month?.toString() ?? "") ||
        birthYear !== (profile.birth_year?.toString() ?? "") ||
        profileImage),
  );
  const communityFormIsDirty = Boolean(
    editingCommunity &&
      (communityName !== editingCommunity.name ||
        communityDescription !== editingCommunity.description ||
        communityRequiresApproval !== editingCommunity.requires_member_approval ||
        communityImage ||
        communityVideo),
  );
  const eventFormIsDirty = Boolean(
    editingEvent
      ? eventTitle !== editingEvent.title ||
          eventDateTime !== toDateTimeLocalValue(editingEvent.starts_at) ||
          eventEndDateTime !== toTimeInputValue(editingEvent.ends_at) ||
          eventBringMode !== (editingEvent.bring_mode ?? "free") ||
          eventBringNeedDrafts.some((draft) => !draft.id) ||
          eventHasParticipantLimit !== (editingEvent.participant_limit !== null) ||
          eventParticipantLimit !== (editingEvent.participant_limit?.toString() ?? "") ||
          eventGalleryImageLimit !== String(editingEvent.gallery_image_limit ?? mediaDefaults.default_gallery_image_limit) ||
          eventGalleryImageMaxMb !== String(editingEvent.gallery_image_max_mb ?? mediaDefaults.default_gallery_image_max_mb) ||
          eventGalleryVideoLimit !== String(editingEvent.gallery_video_limit ?? mediaDefaults.default_gallery_video_limit) ||
          eventGalleryVideoMaxMb !== String(editingEvent.gallery_video_max_mb ?? mediaDefaults.default_gallery_video_max_mb) ||
          eventLocation !== editingEvent.location ||
          eventDescription !== editingEvent.description ||
          eventImage
      : eventTitle ||
        eventDateTime ||
        eventEndDateTime ||
        eventBringMode === "planned" ||
        eventBringNeedDrafts.length > 0 ||
        eventHasParticipantLimit ||
        eventParticipantLimit ||
        eventGalleryImageLimit !== String(mediaDefaults.default_gallery_image_limit) ||
        eventGalleryImageMaxMb !== String(mediaDefaults.default_gallery_image_max_mb) ||
        eventGalleryVideoLimit !== String(mediaDefaults.default_gallery_video_limit) ||
        eventGalleryVideoMaxMb !== String(mediaDefaults.default_gallery_video_max_mb) ||
        eventLocation ||
        eventDescription ||
        eventImage ||
        cloneEventId,
  );
  const memberActionDialog = (() => {
    if (!pendingMemberAction) return null;
    switch (pendingMemberAction.type) {
      case "remove":
        return {
          title: "הסרת חבר מהמעגל",
          message: `להסיר את ${pendingMemberAction.member.full_name} מהמעגל? החברות שלו במעגל תימחק ממסד הנתונים.`,
          confirmLabel: "כן, להסיר",
          tone: "danger" as const,
        };
      case "role":
        return {
          title: pendingMemberAction.nextRole === "admin" ? "הפיכה למנהל/ת מעגל" : "החזרה לחבר/ה רגיל/ה",
          message:
            pendingMemberAction.nextRole === "admin"
              ? `${pendingMemberAction.member.full_name} יוכל/תוכל לנהל את המעגל ולאשר בקשות הצטרפות.`
              : `${pendingMemberAction.member.full_name} לא יוכל/תוכל עוד לנהל את המעגל.`,
          confirmLabel: "כן, לשנות",
          tone: "standard" as const,
        };
      case "attendance":
        return {
          title: "מחיקת השתתפות באירוע",
          message:
            pendingMemberAction.attendance.user_id === user.id
              ? "למחוק לגמרי את ההשתתפות שלך באירוע? גם הפריטים שהתחייבת להביא באירוע יימחקו."
              : `למחוק לגמרי את ההשתתפות של ${pendingMemberAction.attendance.full_name}? גם הפריטים שהמשתתף התחייב להביא יימחקו.`,
          confirmLabel: "כן, למחוק",
          tone: "danger" as const,
        };
      case "delete_event":
        return {
          title: "מחיקת האירוע",
          message: `למחוק לצמיתות את האירוע „${pendingMemberAction.event.title}”? כל ההרשמות, הפריטים והתמונות שלו יימחקו.`,
          confirmLabel: "כן, למחוק",
          tone: "danger" as const,
        };
      case "cancel_event":
        return {
          title: pendingMemberAction.cancel ? "ביטול האירוע" : "פתיחת האירוע מחדש",
          message: pendingMemberAction.cancel
            ? `לסמן את „${pendingMemberAction.event.title}” כאירוע שבוטל? המשתתפים לא יוכלו לבצע שינויים.`
            : `לפתוח מחדש את „${pendingMemberAction.event.title}”?`,
          confirmLabel: pendingMemberAction.cancel ? "כן, לבטל את האירוע" : "כן, לפתוח מחדש",
          tone: pendingMemberAction.cancel ? "danger" as const : "standard" as const,
        };
      case "delete_circle":
        return {
          title: "מחיקת המעגל",
          message: `למחוק לצמיתות את המעגל „${pendingMemberAction.community.name}”? כל האירועים, החברים והמידע שבו יימחקו.`,
          confirmLabel: "כן, למחוק את המעגל",
          tone: "danger" as const,
        };
      case "delete_gallery":
        return {
          title: pendingMemberAction.photo.media_type === "video" ? "מחיקת סרטון" : "מחיקת תמונה",
          message: pendingMemberAction.photo.media_type === "video"
            ? "למחוק את הסרטון מהגלריה?"
            : "למחוק את התמונה מהגלריה?",
          confirmLabel: "כן, למחוק",
          tone: "danger" as const,
        };
      case "delete_conversation_message":
        return {
          title: "מחיקת הודעה",
          message: "למחוק את ההודעה מהשיחה?",
          confirmLabel: "כן, למחוק",
          tone: "danger" as const,
        };
      case "delete_notification":
        return {
          title: "מחיקת התראה",
          message: `למחוק את ההתראה „${pendingMemberAction.notification.title}”?`,
          confirmLabel: "כן, למחוק",
          tone: "danger" as const,
        };
      case "delete_all_notifications":
        return {
          title: "מחיקת כל ההתראות",
          message: "למחוק את כל ההתראות שלך? לא ניתן לבטל פעולה זו.",
          confirmLabel: "כן, למחוק הכל",
          tone: "danger" as const,
        };
      default:
        return {
          title: "עזיבת המעגל",
          message: `לעזוב את המעגל „${pendingMemberAction.community.name}”? החברות שלך במעגל תימחק ממסד הנתונים.`,
          confirmLabel: "כן, לעזוב",
          tone: "danger" as const,
        };
    }
  })();

  return (
    <main className="app-page">
      <div className="app-container">
        <header className="app-header">
          <div className="header-brand-and-presence">
            <button
              type="button"
              className="brand-button"
              onClick={() => {
                setProfileScreenOpen(false);
                setSystemUsageScreenOpen(false);
                setCommunityFormOpen(false);
                setEventFormOpen(false);
                setSelectedEventId(null);
                setSelectedCommunityId(null);
                setBrowserView({});
              }}
              aria-label="מעבר למסך הראשי"
            >
              <span className="brand-lockup brand-lockup-small">
                <CirclesMark />
                <span>
                  <span className="brand-name">מעגלים</span>
                  <span className="app-version">{APP_VERSION}</span>
                </span>
              </span>
            </button>
            {activeCircleUsers.length > 0 && (
              <div
                className="active-circle-users active-circle-users-desktop"
                aria-label="חברים פעילים במעגלים שלי"
              >
                {activeCircleUsers.map((activeUser) => {
                  const imageUrl = getProfileImageUrl(activeUser.avatar_url, activeUser.google_avatar_url);
                  return (
                    <button
                      type="button"
                      className="active-circle-user-button"
                      key={activeUser.user_id}
                      onClick={() => setSelectedActiveUser(activeUser)}
                      title={activeUser.full_name}
                      aria-label={`פרטים על ${activeUser.full_name}`}
                    >
                      {imageUrl ? (
                        <img src={imageUrl} alt={activeUser.full_name} />
                      ) : (
                        <span>{activeUser.full_name.trim().charAt(0) || "?"}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="header-user">
            <div className="notifications-menu-wrap">
              <button
                type="button"
                className={`icon-button notification-bell-button${notificationsOpen ? " is-active" : ""}`}
                onClick={() => setNotificationsOpen((current) => !current)}
                aria-label="התראות"
                title="התראות"
              >
                <span aria-hidden="true">🔔</span>
                {unreadNotificationCount > 0 && (
                  <span className="notification-count">{unreadNotificationCount}</span>
                )}
              </button>
              {notificationsOpen && (
                <div className="notifications-panel">
                  <div className="notifications-panel-heading">
                    <strong>התראות</strong>
                    <div className="notifications-panel-actions">
                      {notifications.length > 0 && (
                        <button
                          type="button"
                          className="notifications-delete-all"
                          onClick={() => setPendingMemberAction({ type: "delete_all_notifications" })}
                        >
                          מחיקת הכל
                        </button>
                      )}
                      <button
                        type="button"
                        className="notifications-close-button"
                        onClick={() => setNotificationsOpen(false)}
                        aria-label="סגירת ההתראות"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                  {notificationsLoading ? (
                    <div className="inline-loading"><span className="spinner spinner-small" />טוענים...</div>
                  ) : notifications.length === 0 ? (
                    <p className="notifications-empty">אין התראות חדשות.</p>
                  ) : (
                    <div className="notifications-list">
                      {notifications.map((notification) => (
                        <div className="notification-row" key={notification.id}>
                          <button
                            type="button"
                            className={`notification-item${notification.read_at ? " is-read" : ""}`}
                            onClick={() => void openNotification(notification)}
                          >
                            <strong>{notification.title}</strong>
                            {notification.body && <span>{notification.body}</span>}
                            <small>{formatShortDateTime(notification.created_at)}</small>
                          </button>
                          <button
                            type="button"
                            className="notification-delete-button"
                            onClick={() =>
                              setPendingMemberAction({ type: "delete_notification", notification })
                            }
                            aria-label={`מחיקת ההתראה ${notification.title}`}
                            title="מחיקת ההתראה"
                          >
                            מחיקה
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <button
              type="button"
              className={`icon-button profile-menu-button${profileScreenOpen ? " is-active" : ""}`}
              onClick={() => {
                setCommunityFormOpen(false);
                setEventFormOpen(false);
                setSelectedEventId(null);
                setSelectedCommunityId(null);
                setSystemUsageScreenOpen(false);
                setProfileScreenOpen(true);
                setMessage(null);
                setBrowserView({ profile: true });
              }}
              aria-label="האזור האישי"
              title="האזור האישי"
            >
              <ProfileMenuIcon />
            </button>
            <ProfileAvatar
              imageUrl={displayAvatar}
              name={displayName}
              size="small"
              onOpen={openImage}
            />
            <button
              type="button"
              className="icon-button logout-button"
              onClick={signOut}
              disabled={authBusy}
              aria-label="התנתקות"
              title="התנתקות"
            >
              <LogoutIcon />
            </button>
          </div>

          {activeCircleUsers.length > 0 && (
            <div
              className="active-circle-users active-circle-users-mobile"
              aria-label="חברים פעילים במעגלים שלי"
            >
              {activeCircleUsers.map((activeUser) => {
                const imageUrl = getProfileImageUrl(activeUser.avatar_url, activeUser.google_avatar_url);
                return (
                  <button
                    type="button"
                    className="active-circle-user-button"
                    key={activeUser.user_id}
                    onClick={() => setSelectedActiveUser(activeUser)}
                    title={activeUser.full_name}
                    aria-label={`פרטים על ${activeUser.full_name}`}
                  >
                    {imageUrl ? (
                      <img src={imageUrl} alt={activeUser.full_name} />
                    ) : (
                      <span>{activeUser.full_name.trim().charAt(0) || "?"}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </header>

        {profileScreenOpen || systemUsageScreenOpen || communityFormOpen || eventFormOpen || selectedEvent || shareEvent ? null : selectedCommunity ? (
          <section className="community-detail-card">
            <div className="community-detail-toolbar">
              <button
                type="button"
                className="back-button"
                onClick={() => {
                  setSelectedCommunityId(null);
                  setBrowserView({});
                }}
              >
                מעבר למעגלים שלי
              </button>
              <div className="community-toolbar-actions">
                <a
                  className="secondary-button compact-button"
                  href={`https://wa.me/?text=${encodeURIComponent(
                    getCommunityShareText(
                      selectedCommunity,
                      getCommunityShareUrl(selectedCommunity.share_token),
                    ),
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  שיתוף
                </a>
                {canManageCommunity(selectedCommunity.role, user.email) && (
                  <>
                    <button
                      type="button"
                      className="primary-button compact-button"
                      onClick={() => openEditCommunity(selectedCommunity)}
                    >
                      עריכת המעגל
                    </button>
                  </>
                )}
              </div>
            </div>

            {(getCommunityImageUrl(selectedCommunity.logo_url)) && (
              <button
                type="button"
                className="image-zoom-button community-cover-button"
                onClick={() =>
                  openImage(getCommunityImageUrl(selectedCommunity.logo_url), `תמונת המעגל ${selectedCommunity.name}`)
                }
                aria-label={`הגדלת תמונת המעגל ${selectedCommunity.name}`}
              >
                <img
                  className="community-cover-image"
                  src={getCommunityImageUrl(selectedCommunity.logo_url)}
                  alt={`תמונת המעגל ${selectedCommunity.name}`}
                />
              </button>
            )}
            <div className="community-detail-heading">
              <div>
                <h1>{selectedCommunity.name}</h1>
              </div>
            </div>

            {selectedCommunity.description && (
              <RichText
                text={selectedCommunity.description}
                className="community-detail-description"
              />
            )}


            {selectedCommunity.video_url && (
              <video
                className="community-video-player"
                src={selectedCommunity.video_url}
                controls
                preload="metadata"
                playsInline
              />
            )}

            <section className="circle-events-section circle-upcoming-events-section">
              {canManageEvents && (
                <div className="circle-create-event-row">
                  <button type="button" className="primary-button compact-button" onClick={openCreateEvent}>
                    יצירת אירוע חדש
                  </button>
                </div>
              )}
              <div className="circle-events-heading">
                <h2>אירועים קרובים</h2>
              </div>

              {eventsLoading ? (
                <div className="inline-loading events-loading">
                  <span className="spinner spinner-small" />
                  טוענים אירועים...
                </div>
              ) : upcomingEvents.length === 0 ? (
                communityEvents.length === 0 ? (
                  <div className="events-empty-state">
                    <strong>עדיין אין אירועים במעגל</strong>
                    <p>
                      {canManageEvents
                        ? "אפשר ליצור עכשיו את האירוע הראשון."
                        : "כאשר מנהלי המעגל ייצרו אירוע, הוא יופיע כאן."}
                    </p>
                    {canManageEvents && (
                      <button type="button" className="primary-button" onClick={openCreateEvent}>
                        יצירת האירוע הראשון
                      </button>
                    )}
                  </div>
                ) : (
                  <p className="no-requests">אין כרגע אירועים קרובים.</p>
                )
              ) : (
                <div className="events-list events-list-upcoming">
                  {upcomingEvents.map((event) => (
                    <article
                      className={`circle-event-card event-card-clickable${event.image_url ? "" : " circle-event-card-no-image"}${event.status === "cancelled" ? " event-card-cancelled" : ""}`}
                      key={event.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => openEventDetails(event)}
                      onKeyDown={(keyEvent) => {
                        if (keyEvent.key === "Enter" || keyEvent.key === " ") {
                          keyEvent.preventDefault();
                          openEventDetails(event);
                        }
                      }}
                    >
                      {event.image_url && (
                        <button
                          type="button"
                          className="image-zoom-button event-card-image-button"
                          onClick={(clickEvent) => {
                            clickEvent.stopPropagation();
                            openImage(event.image_url!, `תמונת האירוע ${event.title}`);
                          }}
                          aria-label={`הגדלת תמונת האירוע ${event.title}`}
                        >
                          <img
                            className="event-card-image"
                            src={event.image_url}
                            alt={`תמונת האירוע ${event.title}`}
                          />
                        </button>
                      )}
                      <div className="event-card-copy">
                        <h4 className="event-card-title-line">{event.title} {formatEventDate(event.starts_at, event.ends_at)}</h4>
                        {event.status === "cancelled" && <span className="event-card-cancelled-badge">מבוטל</span>}
                        {event.location && <span className="event-location">{event.location}</span>}
                        {event.participant_limit !== null && (
                          <span className="event-capacity-label">עד {event.participant_limit} משתתפים</span>
                        )}
                        {((eventMediaCounts[event.id]?.imageCount ?? 0) + (eventMediaCounts[event.id]?.videoCount ?? 0) > 0) && (
                          <button
                            type="button"
                            className="secondary-button compact-button event-card-gallery-button"
                            onClick={(clickEvent) => {
                              clickEvent.stopPropagation();
                              openEventGallery(event);
                            }}
                          >
                            כניסה לגלריה
                          </button>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="circle-people-section">
              <div className="circle-people-heading">
                <div>
                  <h2>חברי המעגל</h2>
                </div>
                <span className="people-count">{communityMembers.length}</span>
              </div>

              {peopleLoading ? (
                <div className="inline-loading people-loading">
                  <span className="spinner spinner-small" />
                  טוענים חברים...
                </div>
              ) : (
                <div className="members-grid">
                  {communityMembers.map((member) => (
                    <article className="member-card" key={member.user_id}>
                      {isSystemAdminEmail(user.email) ? (
                        <button
                          type="button"
                          className="member-avatar-edit-button"
                          onClick={() => openMemberImageEditor(member)}
                          aria-label={`החלפת תמונת הפרופיל של ${member.full_name}`}
                          title="החלפת תמונת פרופיל"
                        >
                          <ProfileAvatar
                            imageUrl={member.avatar_url ?? member.google_avatar_url}
                            name={member.full_name}
                            size="small"
                          />
                        </button>
                      ) : (
                        <ProfileAvatar
                          imageUrl={member.avatar_url ?? member.google_avatar_url}
                          name={member.full_name}
                          size="small"
                          onOpen={openImage}
                        />
                      )}
                      <div>
                        <strong>{member.full_name}</strong>
                        <span>{roleLabel(member.role)}</span>
                        <span className="member-joined-at">הצטרפות למעגל ב {formatJoinDateTime(member.joined_at)}</span>
                        {member.city && <span className="member-city">{member.city}</span>}
                        {member.phone && <PhoneLink phone={member.phone} />}
                      </div>
                      {canManageCommunityMembers &&
                        member.role !== "owner" &&
                        member.user_id !== selectedCommunity.created_by &&
                        member.user_id !== user.id && (
                          <div className="member-management-actions">
                            <button
                              type="button"
                              className="member-role-button"
                              onClick={() =>
                                setPendingMemberAction({
                                  type: "role",
                                  member,
                                  nextRole: member.role === "admin" ? "member" : "admin",
                                })
                              }
                              disabled={updatingRoleUserId === member.user_id}
                            >
                              {member.role === "admin" ? "הפיכה לחבר/ה רגיל/ה" : "הפיכה למנהל/ת"}
                            </button>
                            {canRemoveCommunityMembers && (
                              <button
                                type="button"
                                className="member-remove-button"
                                onClick={() => setPendingMemberAction({ type: "remove", member })}
                                disabled={removingUserId === member.user_id}
                              >
                                {removingUserId === member.user_id ? "מסירים..." : "הסרה"}
                              </button>
                            )}
                          </div>
                        )}
                      {isSystemAdminEmail(user.email) &&
                        (member.user_id === user.id || isSystemAdminEmail(member.email)) &&
                        canLeaveSelectedCommunity && (
                          <div className="member-management-actions">
                            <button
                              type="button"
                              className="member-remove-button"
                              onClick={() =>
                                setPendingMemberAction({ type: "leave", community: selectedCommunity })
                              }
                            >
                              הסרה
                            </button>
                          </div>
                        )}
                    </article>
                  ))}
                </div>
              )}

              {selectedCommunity.requires_member_approval &&
                canManageCommunity(selectedCommunity.role, user.email) && (
                <div className="join-requests-area">
                  <div className="join-requests-heading">
                    <h3>בקשות הצטרפות</h3>
                    <span>{joinRequests.length}</span>
                  </div>

                  {joinRequests.length === 0 ? (
                    <p className="no-requests">אין כרגע בקשות שממתינות לאישור.</p>
                  ) : (
                    <div className="join-requests-list">
                      {joinRequests.map((request) => (
                        <article className="join-request-card" key={request.user_id}>
                          <ProfileAvatar
                            imageUrl={request.avatar_url ?? request.google_avatar_url}
                            name={request.full_name}
                            size="small"
                            onOpen={openImage}
                          />
                          <strong>{request.full_name}</strong>
                          <div className="join-request-actions">
                            <button
                              type="button"
                              className="secondary-button request-reject-button"
                              onClick={() => void reviewJoinRequest(request, "reject")}
                              disabled={reviewingUserId === request.user_id}
                            >
                              דחייה
                            </button>
                            <button
                              type="button"
                              className="primary-button"
                              onClick={() => void reviewJoinRequest(request, "approve")}
                              disabled={reviewingUserId === request.user_id}
                            >
                              {reviewingUserId === request.user_id ? "מעדכנים..." : "אישור"}
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </section>

            {pastEvents.length > 0 && (
              <section className="circle-events-section past-events-section">
                <div className="circle-events-heading">
                  <h2>אירועים שהסתיימו</h2>
                </div>
                <div className="events-list">
                  {pastEvents.map((event) => (
                    <article
                      className={`circle-event-card event-card-clickable past-event-card${event.image_url ? "" : " circle-event-card-no-image"}${event.status === "cancelled" ? " event-card-cancelled" : ""}`}
                      key={event.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => openEventDetails(event)}
                      onKeyDown={(keyEvent) => {
                        if (keyEvent.key === "Enter" || keyEvent.key === " ") {
                          keyEvent.preventDefault();
                          openEventDetails(event);
                        }
                      }}
                    >
                      {event.image_url && (
                        <button
                          type="button"
                          className="image-zoom-button event-card-image-button"
                          onClick={(clickEvent) => {
                            clickEvent.stopPropagation();
                            openImage(event.image_url!, `תמונת האירוע ${event.title}`);
                          }}
                          aria-label={`הגדלת תמונת האירוע ${event.title}`}
                        >
                          <img
                            className="event-card-image"
                            src={event.image_url}
                            alt={`תמונת האירוע ${event.title}`}
                          />
                        </button>
                      )}
                      <div className="event-card-copy">
                        <h4 className="event-card-title-line">{event.title} {formatEventDate(event.starts_at, event.ends_at)}</h4>
                        {event.status === "cancelled" && <span className="event-card-cancelled-badge">מבוטל</span>}
                        {event.location && <span className="event-location">{event.location}</span>}
                        {event.participant_limit !== null && (
                          <span className="event-capacity-label">עד {event.participant_limit} משתתפים</span>
                        )}
                        {((eventMediaCounts[event.id]?.imageCount ?? 0) + (eventMediaCounts[event.id]?.videoCount ?? 0) > 0) && (
                          <button
                            type="button"
                            className="secondary-button compact-button event-card-gallery-button"
                            onClick={(clickEvent) => {
                              clickEvent.stopPropagation();
                              openEventGallery(event);
                            }}
                          >
                            כניסה לגלריה
                          </button>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}

            {message && <p className={`message-box ${messageTone}`}>{message}</p>}

            {canManageCommunity(selectedCommunity.role, user.email) && (
              <div className="email-page-footer-actions" aria-label="שליחת הודעה לחברי המעגל">
                <button
                  type="button"
                  className="secondary-button email-page-trigger whatsapp-page-trigger"
                  onClick={openCommunityWhatsAppComposer}
                >
                  שליחת הודעת WhatsApp
                </button>
              </div>
            )}

            {isSystemAdminEmail(user.email) && !selectedCommunity.is_member && (
              <div className="event-management-actions" aria-label="צירוף למעגל">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => void joinSystemAdminToCommunity()}
                  disabled={systemAdminJoinBusy}
                >
                  {systemAdminJoinBusy
                    ? "מצרף את רון לאופר..."
                    : "צירוף רון לאופר למעגל"}
                </button>
              </div>
            )}
          </section>
        ) : (
          <>
            <section className="communities-card">
              <div className="communities-heading">
                <div>
                  <h2>המעגלים שאליהם אני שייך</h2>
                  <p>צרו מעגל חדש או היכנסו למעגל שכבר יצרתם.</p>
                </div>
                <button type="button" className="primary-button" onClick={openCreateCommunity}>
                  יצירת מעגל חדש
                </button>
              </div>

              {communitiesLoading ? (
                <div className="inline-loading communities-loading">
                  <span className="spinner spinner-small" />
                  טוענים מעגלים...
                </div>
              ) : communities.length === 0 ? (
                <div className="empty-state">
                  <div className="community-emblem" aria-hidden="true">◎</div>
                  <h3>עדיין אין לך מעגל</h3>
                  <p>יצירת המעגל הראשון אורכת פחות מדקה.</p>
                  <button type="button" className="primary-button" onClick={openCreateCommunity}>
                    יצירת המעגל הראשון
                  </button>
                </div>
              ) : (
                <div className="communities-grid">
                  {communities.map((community) => (
                    <div
                      className={`community-card${hideCommunityPlaceholder(community) ? " community-card-no-image" : ""}`}
                      key={community.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        setMessage(null);
                        setSelectedCommunityId(community.id);
                        setBrowserView({ circleToken: community.share_token });
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setMessage(null);
                          setSelectedCommunityId(community.id);
                          setBrowserView({ circleToken: community.share_token });
                        }
                      }}
                    >
                      {getCommunityImageUrl(community.logo_url) ? (
                        <button
                          type="button"
                          className="image-zoom-button community-thumb-button"
                          onClick={(event) => {
                            event.stopPropagation();
                            openImage(getCommunityImageUrl(community.logo_url), `תמונת המעגל ${community.name}`);
                          }}
                          aria-label={`הגדלת תמונת המעגל ${community.name}`}
                        >
                          <img
                            className="community-thumb-image"
                            src={getCommunityImageUrl(community.logo_url)}
                            alt={`תמונת המעגל ${community.name}`}
                          />
                        </button>
                      ) : null}
                      <span className="community-card-copy">
                        <strong>{community.name}</strong>
                        {community.description && <span>{community.description}</span>}
                        <span className="community-managers-line">
                          ניהול ע"י {community.manager_names.length > 0 ? community.manager_names.join(", ") : "לא הוגדרו"}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {message && <p className={`message-box ${messageTone}`}>{message}</p>}
            </section>


          </>
        )}

      {profileScreenOpen && (
        <div className="edit-screen-shell">
            <section className="profile-card profile-screen-card">
              <div className="editor-screen-toolbar">
                <button
                  type="button"
                  className="back-button"
                  onClick={() => {
                    setProfileScreenOpen(false);
                    setBrowserView({});
                  }}
                >
                  חזרה למסך הראשי
                </button>
                <button
                  type="button"
                  className="back-button legal-toolbar-button"
                  onClick={() => {
                    setMessage(null);
                    setLegalScreenOpen(true);
                  }}
                >
                  תנאי שימוש ופרטיות
                </button>
              </div>
              <div className="section-heading">
                <div>
                  <p className="section-kicker">הפרופיל שלי</p>
                  <h2>קצת עליי</h2>
                  <p>
                    המידע הזה יוצג לחברי המעגלים שלך. כל עוד לא בחרתם תמונה משלכם,
                    תוצג תמונת Google.
                  </p>
                </div>
                <ProfileAvatar
                  imageUrl={displayAvatar}
                  name={displayName}
                  onOpen={openImage}
                />
              </div>

              {profileLoading ? (
                <div className="inline-loading">
                  <span className="spinner spinner-small" />
                  טוענים את הפרופיל...
                </div>
              ) : profile ? (
                <div className="profile-form">
                  <div className="image-upload-field">
                    <span className="field-label">תמונת פרופיל</span>
                    <input
                      ref={profileImageInputRef}
                      className="hidden-file-input"
                      type="file"
                      accept="image/*,.heic,.heif"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = "";
                        if (file) void prepareImage(file, "profile");
                      }}
                    />
                    <div className="image-upload-actions">
                      <button
                        type="button"
                        className="primary-button upload-image-button"
                        onClick={() => profileImageInputRef.current?.click()}
                      >
                        {profile.avatar_url || profileImage ? "החלפת תמונה" : "צירוף תמונה"}
                      </button>
                      <small>התמונה תכווץ לפני ההעלאה. הקובץ לאחר הכיווץ לא יעלה על 1MB.</small>
                    </div>
                  </div>

                  <label>
                    <span>שם</span>
                    <input
                      type="text"
                      value={fullName}
                      onChange={(event) => setFullName(event.target.value)}
                      maxLength={120}
                      autoComplete="name"
                    />
                  </label>

                  <label>
                    <span>עיר מגורים (לא חובה)</span>
                    <input
                      type="text"
                      value={city}
                      onChange={(event) => setCity(event.target.value)}
                      maxLength={100}
                      autoComplete="address-level2"
                      placeholder="לדוגמה: ראש העין"
                    />
                  </label>

                  <label>
                    <span>טלפון (לא חובה)</span>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(event) => setPhone(event.target.value)}
                      maxLength={30}
                      inputMode="tel"
                      autoComplete="tel"
                      placeholder="לדוגמה: 050-1234567"
                    />
                    <small>
                      אם תוסיפו טלפון, הוא יוצג לחברי המעגלים שלכם ולחיצה עליו תפתח WhatsApp.
                    </small>
                  </label>

                  <BirthdayFields
                    day={birthDay}
                    month={birthMonth}
                    year={birthYear}
                    onDayChange={setBirthDay}
                    onMonthChange={setBirthMonth}
                    onYearChange={setBirthYear}
                  />

                  <label>
                    <span>ספרו על עצמכם</span>
                    <textarea
                      value={about}
                      onChange={(event) => setAbout(event.target.value)}
                      maxLength={1200}
                      rows={6}
                      placeholder="כמה מילים שיעזרו לחברי המעגל להכיר אתכם..."
                    />
                    <small>{about.length} / 1200</small>
                  </label>

                  <div className="form-actions">
                    <button
                      type="button"
                      className={`primary-button${profileIsDirty ? " save-button-dirty" : ""}`}
                      onClick={saveProfile}
                      disabled={saving}
                    >
                      {saving ? "שומרים..." : "שמירת הפרופיל"}
                    </button>
                  </div>
                </div>
              ) : null}

              {isSystemAdminEmail(user.email) && (
                <section className="event-media-settings-panel profile-media-settings-panel">
                  <div className="section-heading-compact">
                    <h3>ברירות מחדל למדיה באירועים חדשים</h3>
                    <small>הערכים יועתקו לכל אירוע חדש. מנהל האירוע יוכל לשנות אותם בעריכת האירוע.</small>
                  </div>
                  <div className="event-media-settings-grid">
                    <label>
                      <span>מספר תמונות שניתן להעלות</span>
                      <input
                        type="number"
                        min={MEDIA_LIMITS.imageCountMin}
                        max={MEDIA_LIMITS.imageCountMax}
                        value={mediaDefaults.default_gallery_image_limit}
                        onChange={(event) => setMediaDefaults((current) => ({ ...current, default_gallery_image_limit: Number(event.target.value) }))}
                      />
                    </label>
                    <label>
                      <span>גודל תמונה מכווצת מקסימלי במגה</span>
                      <input
                        type="number"
                        min={MEDIA_LIMITS.imageMaxMbMin}
                        max={MEDIA_LIMITS.imageMaxMbMax}
                        step="0.1"
                        value={mediaDefaults.default_gallery_image_max_mb}
                        onChange={(event) => setMediaDefaults((current) => ({ ...current, default_gallery_image_max_mb: Number(event.target.value) }))}
                      />
                    </label>
                    <label>
                      <span>מספר סרטונים שניתן להעלות</span>
                      <input
                        type="number"
                        min={MEDIA_LIMITS.videoCountMin}
                        max={MEDIA_LIMITS.videoCountMax}
                        value={mediaDefaults.default_gallery_video_limit}
                        onChange={(event) => setMediaDefaults((current) => ({ ...current, default_gallery_video_limit: Number(event.target.value) }))}
                      />
                    </label>
                    <label>
                      <span>גודל סרטון מכווץ מקסימלי במגה</span>
                      <input
                        type="number"
                        min={MEDIA_LIMITS.videoMaxMbMin}
                        max={MEDIA_LIMITS.videoMaxMbMax}
                        step="0.5"
                        value={mediaDefaults.default_gallery_video_max_mb}
                        onChange={(event) => setMediaDefaults((current) => ({ ...current, default_gallery_video_max_mb: Number(event.target.value) }))}
                      />
                    </label>
                  </div>
                  <div className="form-actions">
                    <button type="button" className="primary-button" onClick={() => void saveMediaDefaults()} disabled={mediaDefaultsSaving}>
                      {mediaDefaultsSaving ? "שומרים..." : "שמירת ברירות המחדל"}
                    </button>
                  </div>
                  {mediaDefaultsMessage && <p className={`message-box ${mediaDefaultsMessageTone}`}>{mediaDefaultsMessage}</p>}
                </section>
              )}

              {isSystemAdminEmail(user.email) && (
                <div className="profile-system-log-button-row">
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => {
                      setProfileScreenOpen(false);
                      setSystemUsageScreenOpen(true);
                      setSystemUsageError(null);
                      setBrowserView({ usageLog: true });
                    }}
                  >
                    לוג שימוש במערכת
                  </button>
                </div>
              )}

              <section className="personal-dashboard-section">
                <div className="section-heading-compact">
                  <p className="section-kicker">הפעילות שלי</p>
                  <h2>האירועים וההתחייבויות שלי</h2>
                </div>
                {personalLoading ? (
                  <div className="inline-loading"><span className="spinner spinner-small" />טוענים...</div>
                ) : (
                  <div className="personal-dashboard-grid">
                    <div className="personal-dashboard-block">
                      <h3>האירועים שלי</h3>
                      {personalEvents.length === 0 ? (
                        <p>עדיין לא נרשמת לאירועים.</p>
                      ) : (
                        <div className="personal-list">
                          {personalEvents.map((row) => (
                            <button
                              type="button"
                              className="personal-list-item"
                              key={row.event.id}
                              onClick={() => void openPersonalEventRow(row)}
                            >
                              <strong>{row.event.title}</strong>
                              <span>{row.community.name} · {formatShortDate(row.event.starts_at)}</span>
                              {row.attendance && <small>{attendanceStatusLabel(row.attendance.status)}</small>}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="personal-dashboard-block personal-commitments-block">
                      <h3>דברים שהתחייבתי להביא</h3>
                      {personalCommitments.length === 0 ? (
                        <p>אין כרגע התחייבויות.</p>
                      ) : (
                        <div className="personal-list">
                          {[...personalCommitments]
                            .sort((first, second) => new Date(second.starts_at).getTime() - new Date(first.starts_at).getTime())
                            .map((commitment) => (
                              <button
                                type="button"
                                className="personal-list-item"
                                key={commitment.id}
                                onClick={() => {
                                  const community = communities.find((item) => item.id === commitment.community_id);
                                  if (!community) return;
                                  setProfileScreenOpen(false);
                                  setSelectedCommunityId(community.id);
                                  setPendingEventOpenId(commitment.event_id);
                                  setBrowserView({ eventToken: commitment.share_token });
                                }}
                              >
                                <strong>{commitment.item_name}</strong>
                                <span>{commitment.event_title} {formatShortDate(commitment.starts_at)}</span>
                              </button>
                            ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </section>
            </section>
        </div>
      )}

      {systemUsageScreenOpen && isSystemAdminEmail(user.email) && (
        <div className="edit-screen-shell">
          <section className="profile-card profile-screen-card system-usage-screen-card">
            <div className="editor-screen-toolbar">
              <button
                type="button"
                className="back-button"
                onClick={() => {
                  setSystemUsageScreenOpen(false);
                  setProfileScreenOpen(true);
                  setBrowserView({ profile: true }, "replace");
                }}
              >
                חזרה לאזור האישי
              </button>
            </div>

            <div className="section-heading-compact system-usage-screen-heading">
              <p className="section-kicker">ניהול מערכת</p>
              <h2>לוג שימוש במערכת</h2>
              <small>כל שורה נוצרת רק לאחר שהמשתמש סיים רצף שימוש במערכת.</small>
            </div>

            {systemUsageError ? (
              <p className="message-box error">{systemUsageError}</p>
            ) : systemUsageLoading && systemUsageLog.length === 0 ? (
              <div className="inline-loading"><span className="spinner spinner-small" />טוענים את לוג השימוש...</div>
            ) : systemUsageLog.length === 0 ? (
              <p className="system-usage-empty">עדיין לא נאספו מקטעי שימוש.</p>
            ) : (
              <div className="system-usage-table-wrap">
                <table className="system-usage-table">
                  <thead>
                    <tr>
                      <th scope="col">משתמש</th>
                      <th scope="col">משך</th>
                    </tr>
                  </thead>
                  <tbody>
                    {systemUsageLog.map((row) => (
                      <tr key={row.session_id}>
                        <td>
                          <strong>{row.full_name}</strong>
                          <small>
                            {row.community_names.length > 0
                              ? `מעגלים: ${row.community_names.join(", ")}`
                              : "ללא מעגלים"}
                          </small>
                          <small className="system-usage-session-range">
                            {formatUsageSessionRange(row.started_at, row.ended_at)}
                          </small>
                        </td>
                        <td className="system-usage-duration">{formatUsageDuration(row.duration_seconds)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {(pendingShareToken || pendingEventShareToken) &&
        !inviteDismissed &&
        communitiesReady &&
        Boolean(invitedCommunity) &&
        !invitedMembership &&
        (inviteLoading || invitedCommunity) && (
        <div className="modal-backdrop" role="presentation" onMouseDown={closeInvite}>
          <section
            className="modal-card invite-modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="invite-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="modal-close"
              onClick={closeInvite}
              aria-label="סגירה"
            >
              ×
            </button>

            {inviteLoading ? (
              <div className="inline-loading invite-loading">
                <span className="spinner spinner-small" />
                טוענים את ההזמנה...
              </div>
            ) : invitedCommunity ? (
              <>
                {invitedEvent ? (
                  <>
                    {invitedEvent.image_url && (
                      <button
                        type="button"
                        className="image-zoom-button invite-circle-image-button"
                        onClick={() =>
                          openImage(invitedEvent.image_url!, `תמונת האירוע ${invitedEvent.title}`)
                        }
                      >
                        <img
                          className="invite-circle-image"
                          src={invitedEvent.image_url}
                          alt={`תמונת האירוע ${invitedEvent.title}`}
                        />
                      </button>
                    )}
                    <p className="section-kicker">הזמנה לאירוע</p>
                    <h2 id="invite-title">{invitedEvent.title}</h2>
                    <p className="invite-event-date">
                      {formatEventDate(invitedEvent.starts_at, invitedEvent.ends_at)}
                    </p>
                    {invitedEvent.location && (
                      <p className="invite-event-location">{invitedEvent.location}</p>
                    )}
                    {invitedEvent.participant_limit !== null && (
                      <p className="invite-event-location">
                        עד {invitedEvent.participant_limit} משתתפים
                      </p>
                    )}
                    {invitedEvent.description && (
                      <RichText
                        text={invitedEvent.description}
                        className="invite-circle-description"
                      />
                    )}
                  </>
                ) : (
                  <>
                    {(getCommunityImageUrl(invitedCommunity.logo_url)) && (
                      <button
                        type="button"
                        className="image-zoom-button invite-circle-image-button"
                        onClick={() =>
                          openImage(
                            getCommunityImageUrl(invitedCommunity.logo_url),
                            `תמונת המעגל ${invitedCommunity.name}`,
                          )
                        }
                      >
                        <img
                          className="invite-circle-image"
                          src={getCommunityImageUrl(invitedCommunity.logo_url)}
                          alt={`תמונת המעגל ${invitedCommunity.name}`}
                        />
                      </button>
                    )}
                    <p className="section-kicker">הזמנה למעגל</p>
                    <h2 id="invite-title">{invitedCommunity.name}</h2>
                    {invitedCommunity.description && (
                      <RichText
                        text={invitedCommunity.description}
                        className="invite-circle-description"
                      />
                    )}
                  </>
                )}

                {inviteStatus === "pending" ? (
                  <div className="invite-result">
                    <strong>בקשת ההצטרפות נשלחה</strong>
                    <p>מנהלי המעגל יוכלו לאשר אותה.</p>
                    <button type="button" className="primary-button" onClick={closeInvite}>
                      סיום
                    </button>
                  </div>
                ) : autoJoinAfterAuth ? (
                  <div className="invite-result" aria-live="polite">
                    <span className="spinner spinner-small" />
                    <strong>{invitedEvent ? "מצרפים אותך ופותחים את האירוע..." : "מצרפים אותך למעגל..."}</strong>
                  </div>
                ) : (
                  <>
                    <p className="invite-approval-note">
                      {invitedCommunity.requires_member_approval
                        ? "ההצטרפות תישלח לאישור מנהלי המעגל."
                        : invitedEvent
                          ? "ההצטרפות למעגל תתבצע מיד ולאחר מכן האירוע ייפתח."
                          : "ההצטרפות למעגל תתבצע מיד."}
                    </p>
                    <div className="modal-actions invite-actions">
                      <button type="button" className="secondary-button" onClick={closeInvite}>
                        לא עכשיו
                      </button>
                      <button
                        type="button"
                        className="primary-button"
                        onClick={() => void joinInvitedCircle()}
                        disabled={joinBusy}
                      >
                        {joinBusy
                          ? "מצטרפים..."
                          : invitedEvent
                            ? "הצטרפות וכניסה לאירוע"
                            : "הצטרפות למעגל"}
                      </button>
                    </div>
                  </>
                )}
              </>
            ) : null}
          </section>
        </div>
      )}

      {pendingMemberAction && memberActionDialog && (
        <div
          className="modal-backdrop confirmation-backdrop"
          role="presentation"
          onMouseDown={() => {
            if (!memberActionBusy) setPendingMemberAction(null);
          }}
        >
          <section
            className="confirmation-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="member-action-title"
            aria-describedby="member-action-message"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div
              className={`confirmation-symbol confirmation-symbol-${memberActionDialog.tone}`}
              aria-hidden="true"
            >
              {memberActionDialog.tone === "danger" ? "!" : "✓"}
            </div>
            <h2 id="member-action-title">{memberActionDialog.title}</h2>
            <p id="member-action-message">{memberActionDialog.message}</p>
            <div className="confirmation-actions">
              <button
                type="button"
                className="confirmation-no-button"
                onClick={() => setPendingMemberAction(null)}
                disabled={memberActionBusy}
              >
                לא
              </button>
              <button
                type="button"
                className={
                  memberActionDialog.tone === "danger"
                    ? "confirmation-yes-button confirmation-danger-button"
                    : "confirmation-yes-button"
                }
                onClick={() => void confirmMemberAction()}
                disabled={memberActionBusy}
              >
                {memberActionBusy ? "מעדכנים..." : memberActionDialog.confirmLabel}
              </button>
            </div>
          </section>
        </div>
      )}


      {shareCommunity && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setShareCommunity(null)}
        >
          <section
            className="modal-card share-modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="share-circle-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="modal-close"
              onClick={() => setShareCommunity(null)}
              aria-label="סגירה"
            >
              ×
            </button>

            {(getCommunityImageUrl(shareCommunity.logo_url)) && (
              <button
                type="button"
                className="image-zoom-button share-preview-image-button"
                onClick={() =>
                  openImage(getCommunityImageUrl(shareCommunity.logo_url), `תמונת המעגל ${shareCommunity.name}`)
                }
              >
                <img
                  className="share-preview-image"
                  src={getCommunityImageUrl(shareCommunity.logo_url)}
                  alt={`תמונת המעגל ${shareCommunity.name}`}
                />
              </button>
            )}

            <p className="section-kicker">שיתוף המעגל</p>
            <h2 id="share-circle-title">{shareCommunity.name}</h2>
            {shareCommunity.description && (
              <RichText text={shareCommunity.description} className="share-preview-description" />
            )}

            <div className="share-options-grid">
              <a
                className="share-option share-whatsapp"
                href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
                target="_blank"
                rel="noreferrer"
              >
                <span aria-hidden="true">◉</span>
                <strong>WhatsApp</strong>
              </a>
              <a
                className="share-option"
                href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`}
                target="_blank"
                rel="noreferrer"
              >
                <span aria-hidden="true">f</span>
                <strong>Facebook</strong>
              </a>
              <a
                className="share-option"
                href={`mailto:?subject=${encodeURIComponent(`הזמנה למעגל ${shareCommunity.name}`)}&body=${encodeURIComponent(shareText)}`}
              >
                <span aria-hidden="true">✉</span>
                <strong>דוא״ל</strong>
              </a>
              <button
                type="button"
                className="share-option"
                onClick={() => void copyShareLink(shareCommunity)}
              >
                <span aria-hidden="true">⧉</span>
                <strong>{shareCopied ? "הקישור הועתק" : "העתקת קישור"}</strong>
              </button>
              <button
                type="button"
                className="share-option"
                onClick={() => void shareWithDevice(shareCommunity)}
              >
                <span aria-hidden="true">↗</span>
                <strong>אפשרויות נוספות</strong>
              </button>
            </div>

            <p className="share-preview-note">
              בשיתוף הקישור יוצגו שם המעגל, התיאור ותמונת המעגל.
            </p>
          </section>
        </div>
      )}

      {shareEvent && (
        <div className="edit-screen-shell">
          <section className="editor-page-card share-screen-card" aria-labelledby="share-event-title">
            <div className="editor-screen-toolbar">
              <button
                type="button"
                className="back-button"
                onClick={() => setShareEvent(null)}
              >
                חזרה לאירוע
              </button>
            </div>

            {eventShareImageUrl && (
              <button
                type="button"
                className="image-zoom-button share-preview-image-button"
                onClick={() =>
                  openImage(
                    eventShareImageUrl,
                    shareEvent.image_url
                      ? `תמונת האירוע ${shareEvent.title}`
                      : `תמונת המעגל ${selectedCommunity?.name ?? shareEvent.title}`,
                  )
                }
              >
                <img
                  className="share-preview-image"
                  src={eventShareImageUrl}
                  alt={
                    shareEvent.image_url
                      ? `תמונת האירוע ${shareEvent.title}`
                      : `תמונת המעגל ${selectedCommunity?.name ?? shareEvent.title}`
                  }
                />
              </button>
            )}

            <p className="section-kicker">שיתוף האירוע</p>
            <h2 id="share-event-title">{shareEvent.title}</h2>
            <p className="share-event-date">
              {formatEventDate(shareEvent.starts_at, shareEvent.ends_at)}
            </p>
            {shareEvent.location && <p className="share-event-location">{shareEvent.location}</p>}
            {shareEvent.participant_limit !== null && (
              <p className="share-event-location">עד {shareEvent.participant_limit} משתתפים</p>
            )}
            {shareEvent.description && (
              <RichText text={shareEvent.description} className="share-preview-description" />
            )}

            <div className="share-options-grid">
              <a
                className="share-option share-whatsapp"
                href={`https://wa.me/?text=${encodeURIComponent(eventShareText)}`}
                target="_blank"
                rel="noreferrer"
              >
                <span aria-hidden="true">◉</span>
                <strong>WhatsApp</strong>
              </a>
              <a
                className="share-option"
                href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(eventShareUrl)}`}
                target="_blank"
                rel="noreferrer"
              >
                <span aria-hidden="true">f</span>
                <strong>Facebook</strong>
              </a>
              <a
                className="share-option"
                href={`mailto:?subject=${encodeURIComponent(`הזמנה לאירוע ${shareEvent.title}`)}&body=${encodeURIComponent(eventShareText)}`}
              >
                <span aria-hidden="true">✉</span>
                <strong>דוא״ל</strong>
              </a>
              <button
                type="button"
                className="share-option"
                onClick={() => void copyEventShareLink(shareEvent)}
              >
                <span aria-hidden="true">⧉</span>
                <strong>{shareCopied ? "הקישור הועתק" : "העתקת קישור"}</strong>
              </button>
              <button
                type="button"
                className="share-option"
                onClick={() => void shareEventWithDevice(shareEvent)}
              >
                <span aria-hidden="true">↗</span>
                <strong>אפשרויות נוספות</strong>
              </button>
            </div>
          </section>
        </div>
      )}

      {communityFormOpen && (
        <div className="circle-editor-screen">
          <section className="circle-editor-card" aria-labelledby="community-form-title">
            <div className="clean-editor-toolbar">
              <button
                type="button"
                className="back-button"
                onClick={closeCommunityForm}
                disabled={savingCommunity || communityVideoNotice?.tone === "info"}
              >
                חזרה
              </button>
            </div>

            <h2 id="community-form-title" className="visually-hidden">
              {editingCommunity ? "עריכת המעגל" : "יצירת מעגל חדש"}
            </h2>

            <div className="clean-editor-form circle-editor-form">
              <div className="image-upload-field">
                <label>
                  <span>תמונת המעגל</span>
                </label>
                <input
                  ref={communityImageInputRef}
                  className="hidden-file-input"
                  type="file"
                  accept="image/*,.heic,.heif"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) void prepareImage(file, "community");
                  }}
                />
                <button
                  type="button"
                  className="primary-button upload-image-button"
                  onClick={() => communityImageInputRef.current?.click()}
                >
                  {communityFormImageUrl ? "החלפת תמונה" : "העלאת תמונה"}
                </button>
                <small>התמונה תכווץ לפני ההעלאה. הקובץ לאחר הכיווץ לא יעלה על 1MB.</small>

                {communityFormImageUrl && (
                  <button
                    type="button"
                    className="image-zoom-button selected-community-image-button"
                    onClick={() => openImage(communityFormImageUrl, "תמונת המעגל")}
                    aria-label="הגדלת תמונת המעגל"
                  >
                    <img className="selected-community-image" src={communityFormImageUrl} alt="תמונת המעגל" />
                  </button>
                )}
              </div>

              <div className="video-upload-field">
                <label>
                  <span>סרטון המעגל</span>
                </label>
                <input
                  ref={communityVideoInputRef}
                  className="hidden-file-input"
                  type="file"
                  accept="video/mp4,video/webm,video/quicktime,video/x-m4v,video/*"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) void prepareCommunityVideo(file);
                  }}
                />
                <button
                  type="button"
                  className="primary-button upload-image-button"
                  onClick={() => communityVideoInputRef.current?.click()}
                  disabled={communityVideoNotice?.tone === "info"}
                >
                  {communityFormVideoUrl ? "החלפת סרטון" : "העלאת סרטון"}
                </button>
                <small>הסרטון יכווץ לפני ההעלאה. הקובץ לאחר הכיווץ לא יעלה על 20MB.</small>
                <VideoProcessStatus notice={communityVideoNotice} />

                {communityFormVideoUrl && (
                  <video className="selected-community-video" src={communityFormVideoUrl} controls preload="metadata" />
                )}
              </div>

              <label>
                <span>שם המעגל</span>
                <input
                  type="text"
                  value={communityName}
                  onChange={(event) => setCommunityName(event.target.value)}
                  maxLength={140}
                  placeholder="לדוגמה: מעגל קהילתי שכונתי"
                />
              </label>

              <label>
                <span>תיאור קצר</span>
                <textarea
                  value={communityDescription}
                  onChange={(event) => setCommunityDescription(event.target.value)}
                  maxLength={2000}
                  rows={7}
                  placeholder="ספרו בקצרה על המעגל, המפגשים והאווירה..."
                />
                <small>{communityDescription.length} / 2000</small>
              </label>

              <div className="approval-setting">
                <span className="field-label">האם כל משתמש חדש צריך אישור?</span>
                <div className="approval-choice-group" role="group" aria-label="אישור משתמשים חדשים למעגל">
                  <button
                    type="button"
                    className={communityRequiresApproval ? "approval-choice selected" : "approval-choice"}
                    onClick={() => setCommunityRequiresApproval(true)}
                  >
                    כן, נדרש אישור
                  </button>
                  <button
                    type="button"
                    className={!communityRequiresApproval ? "approval-choice selected" : "approval-choice"}
                    onClick={() => setCommunityRequiresApproval(false)}
                  >
                    לא, אפשר להצטרף
                  </button>
                </div>
              </div>
            </div>

            <div className="clean-editor-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={closeCommunityForm}
                disabled={savingCommunity || communityVideoNotice?.tone === "info"}
              >
                סגירה ללא שמירה
              </button>
              <button
                type="button"
                className={`primary-button${communityFormIsDirty ? " save-button-dirty" : ""}`}
                onClick={() => void saveCommunity()}
                disabled={savingCommunity || communityVideoNotice?.tone === "info"}
              >
                {savingCommunity
                  ? "שומרים..."
                  : editingCommunity
                    ? "שמירת המעגל"
                    : "יצירת המעגל"}
              </button>
            </div>

            {editingCommunity && canOwnCommunity(editingCommunity, user.id, user.email) && (
              <div className="event-management-actions" aria-label="ניהול המעגל">
                <button
                  type="button"
                  className="danger-button"
                  onClick={() => setPendingMemberAction({ type: "delete_circle", community: editingCommunity })}
                  disabled={savingCommunity || communityVideoNotice?.tone === "info"}
                >
                  מחיקת המעגל
                </button>
              </div>
            )}

            {message && <p className={`message-box ${messageTone}`}>{message}</p>}
          </section>
        </div>
      )}

      {!profileScreenOpen && !systemUsageScreenOpen && !communityFormOpen && !eventFormOpen && !shareEvent && selectedEvent && selectedCommunity && (
        <div className="event-screen-backdrop">
          <section className={`event-detail-panel${selectedEventIsCancelled ? " event-is-cancelled" : ""}`} aria-labelledby="event-detail-title">
            <div className="event-detail-toolbar">
              <button type="button" className="back-button" onClick={closeEventDetails}>
                מעבר למעגל
              </button>
              <div className="event-detail-actions">
                <a
                  className="secondary-button compact-button"
                  href={`https://wa.me/?text=${encodeURIComponent(
                    getEventShareText(
                      selectedEvent,
                      getEventShareUrl(selectedEvent.share_token),
                    ),
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  שיתוף
                </a>
                {canManageEvents && (
                  <>
                    <button
                      type="button"
                      className="secondary-button compact-button"
                      onClick={() => void openDirectEventClone(selectedEvent)}
                    >
                      שכפול האירוע
                    </button>
                    <button
                      type="button"
                      className="primary-button compact-button"
                      onClick={() => openEditEvent(selectedEvent)}
                    >
                      עריכת האירוע
                    </button>
                  </>
                )}
              </div>
            </div>

            {selectedEventDisplayImageUrl && (
              <button
                type="button"
                className="image-zoom-button event-detail-image-button"
                onClick={() =>
                  openImage(
                    selectedEventDisplayImageUrl,
                    selectedEvent.image_url
                      ? `תמונת האירוע ${selectedEvent.title}`
                      : `תמונת המעגל ${selectedCommunity.name}`,
                  )
                }
              >
                <img
                  className="event-detail-image"
                  src={selectedEventDisplayImageUrl}
                  alt={
                    selectedEvent.image_url
                      ? `תמונת האירוע ${selectedEvent.title}`
                      : `תמונת המעגל ${selectedCommunity.name}`
                  }
                />
              </button>
            )}

            <header className="event-detail-heading">
              <p className="section-kicker">אירוע במעגל {selectedCommunity.name}</p>
              <h1 id="event-detail-title">{getEventDisplayTitle(selectedEvent)}</h1>
              {selectedEventIsCancelled && (
                <div className="event-cancelled-banner">האירוע בוטל</div>
              )}
              {!selectedEventIsCancelled && selectedEventIsPast && (
                <div className="event-closed-banner">האירוע הסתיים והוא סגור לשינויים</div>
              )}
              {selectedEvent.location && (
                <div className="event-location-row">
                  <span className="event-detail-location">{selectedEvent.location}</span>
                  <a
                    className="event-navigation-link"
                    href={getNavigationUrl(selectedEvent.location)}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`ניווט אל ${selectedEvent.location}`}
                    title="ניווט לכתובת"
                  >
                    <NavigationIcon />
                  </a>
                </div>
              )}
              {selectedEvent.participant_limit !== null && (
                <span className="event-detail-capacity">האירוע מוגבל ל־{selectedEvent.participant_limit} משתתפים</span>
              )}
            </header>

            {selectedEvent.description && (
              <RichText
                text={selectedEvent.description}
                className={`event-detail-description${selectedEventIsCancelled ? " event-cancelled-description" : ""}`}
              />
            )}


            {selectedCommunity.video_url && (
              <video
                className="community-video-player event-community-video-player"
                src={selectedCommunity.video_url}
                controls
                preload="metadata"
                playsInline
              />
            )}

            {eventManagers.length > 0 && (
              <section className="event-managers-section">
                <div className="section-heading-compact">
                  <h2>מנהלי/ות האירוע</h2>
                </div>
                <div className="event-managers-list">
                  {eventManagers.map((manager) => (
                    <article className="event-manager-card" key={manager.user_id}>
                      <ProfileAvatar
                        imageUrl={manager.avatar_url ?? manager.google_avatar_url}
                        name={manager.full_name}
                        size="small"
                        onOpen={openImage}
                      />
                      <div>
                        <strong>{manager.full_name}</strong>
                        {manager.phone && <PhoneLink phone={manager.phone} />}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}

            <section className="attendance-summary-section">
              <div className="section-heading-compact">
                <h2>סיכום השתתפות</h2>
              </div>
              <div className="attendance-summary-grid">
                <div className="attendance-summary-card attendance-summary-total">
                  <strong>{totalGoingPeople}</strong>
                  <span>
                    {selectedEvent.participant_limit !== null
                      ? `סה"כ מגיעים מתוך ${selectedEvent.participant_limit}`
                      : 'סה"כ מגיעים'}
                  </span>
                </div>
                <div className="attendance-summary-card">
                  <strong>{maybeAttendance.length}</strong>
                  <span>אולי</span>
                </div>
              </div>
            </section>

            <section className="my-attendance-section">
              <div className="section-heading-compact">
                <h2>ההשתתפות שלי</h2>
              </div>

              <div className="attendance-status-buttons" role="group" aria-label="בחירת מצב השתתפות">
                <button
                  type="button"
                  className={`attendance-status-button${attendanceStatus === "going" ? " is-selected" : ""}`}
                  onClick={() => setAttendanceStatus("going")}
                  disabled={savingAttendance || eventLockedForCurrentUser || selectedEventIsFull}
                >
                  מגיע/ה
                </button>
                <button
                  type="button"
                  className={`attendance-status-button${attendanceStatus === "maybe" ? " is-selected" : ""}`}
                  onClick={() => setAttendanceStatus("maybe")}
                  disabled={savingAttendance || eventLockedForCurrentUser}
                >
                  אולי
                </button>
                <button
                  type="button"
                  className={`attendance-status-button${attendanceStatus === "not_going" ? " is-selected" : ""}`}
                  onClick={() => setAttendanceStatus("not_going")}
                  disabled={savingAttendance || eventLockedForCurrentUser}
                >
                  לא מגיע/ה
                </button>
              </div>
              {selectedEventIsFull && (
                <p className="event-full-message">האירוע מלא ולא ניתן להצטרף כרגע.</p>
              )}
              {eventLockedForCurrentUser && (
                <p className="event-locked-message">האירוע סגור לשינויים.</p>
              )}

              <div className="attendance-form-actions">
                {ownEventAttendance && (!eventLockedForCurrentUser || canDeleteAnyEventAttendance) && (
                  <button
                    type="button"
                    className="member-remove-button attendance-delete-button"
                    onClick={() =>
                      setPendingMemberAction({ type: "attendance", attendance: ownEventAttendance })
                    }
                  >
                    מחיקת ההשתתפות
                  </button>
                )}
              </div>

              {attendanceMessage && (
                <p className={`message-box ${attendanceMessageTone}`}>{attendanceMessage}</p>
              )}
            </section>

            {ownEventAttendance?.status === "going" && (
              <section className="event-bring-section">
                <div className="section-heading-compact">
                  <h2>מה כל אחד מביא?</h2>
                </div>

                {bringLoading ? (
                  <div className="inline-loading bring-loading">
                    <span className="spinner spinner-small" />
                    טוענים את הרשימה...
                  </div>
                ) : (
                  <>
                    {bringDisplayRows.length > 0 ? (
                      <div className="bring-table-scroll">
                        <div
                          className={`bring-table ${selectedEvent.bring_mode === "planned" ? "bring-table-planned" : "bring-table-free"}`}
                          role="table"
                          aria-label="מה מביאים לאירוע"
                        >
                          <div className="bring-table-header" role="row">
                            <span role="columnheader">פריט</span>
                            <span role="columnheader">מי מביא</span>
                            <span role="columnheader">אני מביא/ה</span>
                            {selectedEvent.bring_mode === "planned" && (
                              <span role="columnheader">הערות</span>
                            )}
                          </div>

                          {bringDisplayRows.map((row) => {
                            if (row.kind === "need") {
                              const need = row.need;
                              const needContributions = eventBringContributions.filter(
                                (contribution) => contribution.need_id === need.id,
                              );
                              const ownContribution = needContributions.find(
                                (contribution) => contribution.user_id === user.id,
                              );

                              return (
                                <div className="bring-table-row" role="row" key={`need-${need.id}`}>
                                  <div className="bring-table-item" role="cell">
                                    <strong>{need.item_name}</strong>
                                  </div>

                                  <div className="bring-table-people" role="cell">
                                    {needContributions.length > 0 ? (
                                      needContributions.map((contribution) => (
                                        <span className="bring-person-line bring-table-subrow" key={contribution.id}>
                                          <strong>{contribution.full_name}</strong>
                                        </span>
                                      ))
                                    ) : (
                                      <span className="bring-empty-cell" aria-hidden="true" />
                                    )}
                                  </div>

                                  <div className="bring-table-check" role="cell">
                                    <label className="bring-checkbox-control">
                                      <input
                                        type="checkbox"
                                        checked={Boolean(ownContribution)}
                                        onChange={(event) =>
                                          void toggleNeedContribution(need, event.target.checked)
                                        }
                                        disabled={
                                          eventLockedForCurrentUser || bringBusyKey === `need-${need.id}`
                                        }
                                        aria-label={`אני מביא/ה ${need.item_name}`}
                                      />
                                    </label>
                                  </div>

                                  <div className="bring-table-notes" role="cell">
                                    {needContributions.length > 0 ? (
                                      needContributions.map((contribution) =>
                                        contribution.user_id === user.id ? (
                                          <div className="bring-table-subrow" key={contribution.id}>
                                            <input
                                              type="text"
                                              value={bringNoteByContribution[contribution.id] ?? contribution.note}
                                              onChange={(event) =>
                                                scheduleContributionNoteSave(contribution, event.target.value)
                                              }
                                              maxLength={300}
                                              placeholder="הערה..."
                                              disabled={eventLockedForCurrentUser}
                                              aria-label={`הערה עבור ${need.item_name}`}
                                            />
                                          </div>
                                        ) : (
                                          <span className="bring-table-subrow bring-note-readonly" key={contribution.id}>
                                            {contribution.note || ""}
                                          </span>
                                        ),
                                      )
                                    ) : (
                                      <span className="bring-empty-cell" aria-hidden="true" />
                                    )}
                                  </div>
                                </div>
                              );
                            }

                            const contribution = row.contribution;
                            const plannedMode = selectedEvent.bring_mode === "planned";
                            const isOwnManualContribution = contribution.user_id === user.id;
                            return (
                              <div className="bring-table-row" role="row" key={`free-${contribution.id}`}>
                                <div className="bring-table-item" role="cell">
                                  <strong>{contribution.item_name}</strong>
                                </div>
                                <div className="bring-table-people" role="cell">
                                  <span className="bring-person-line">
                                    <strong>{contribution.full_name}</strong>
                                  </span>
                                </div>
                                <div className="bring-table-check" role="cell">
                                  <label className="bring-checkbox-control">
                                    <input
                                      type="checkbox"
                                      checked
                                      onChange={(event) =>
                                        void toggleManualContribution(contribution, event.target.checked)
                                      }
                                      disabled={
                                        !isOwnManualContribution ||
                                        eventLockedForCurrentUser ||
                                        bringBusyKey === `contribution-${contribution.id}`
                                      }
                                      aria-label={`אני מביא/ה ${contribution.item_name}`}
                                    />
                                  </label>
                                </div>
                                {plannedMode && <div className="bring-table-notes" role="cell" />}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <p className="attendance-empty-state">עדיין לא נוספו פריטים לרשימה.</p>
                    )}

                    {!eventLockedForCurrentUser && (
                      <div className="free-bring-add-row free-bring-autosave-add bring-table-add-row">
                        <label>
                          <span>
                            {selectedEvent.bring_mode === "planned"
                              ? "אני אביא משהו שלא קיים בטבלה"
                              : "מה אני מביא/ה?"}
                          </span>
                          <input
                            type="text"
                            value={bringItemName}
                            onChange={(event) => setBringItemName(event.target.value)}
                            maxLength={160}
                            placeholder="לדוגמה: 2 גלידות בן & ג'ריס"
                          />
                        </label>
                        <button
                          type="button"
                          className="primary-button compact-button free-bring-add-button"
                          onClick={tryAddFreeBringItem}
                          disabled={bringBusyKey === "free-add" || !bringItemName.trim()}
                        >
                          הוספה לטבלה
                        </button>
                      </div>
                    )}
                  </>
                )}

                {bringMessage && <p className={`message-box ${bringMessageTone}`}>{bringMessage}</p>}
              </section>
            )}

            <section className="event-conversations-section" aria-labelledby="event-conversations-title">
              <div className="section-heading-compact">
                <div>
                  <h2 id="event-conversations-title">שיחות באירוע</h2>
                </div>
              </div>

              {conversationLoading ? (
                <div className="inline-loading">
                  <span className="spinner spinner-small" />
                  טוענים את השיחות...
                </div>
              ) : conversationTopics.length === 0 ? (
                <p className="attendance-empty-state">השיחות עדיין אינן זמינות.</p>
              ) : (
                <>
                  <div className="conversation-topic-tabs" role="tablist" aria-label="נושאי שיחה">
                    {conversationTopics.map((topic) => {
                      const messageCount = conversationMessages.filter(
                        (message) => message.topic_id === topic.id,
                      ).length;
                      return (
                        <button
                          type="button"
                          role="tab"
                          aria-selected={topic.id === activeConversationTopicId}
                          className={`conversation-topic-tab${
                            topic.id === activeConversationTopicId ? " is-active" : ""
                          }`}
                          onClick={() => {
                            conversationShouldScrollToEndRef.current = true;
                            setActiveConversationTopicId(topic.id);
                            setConversationMessage(null);
                          }}
                          key={topic.id}
                        >
                          <span>{topic.title}</span>
                          <small>{messageCount}</small>
                        </button>
                      );
                    })}
                  </div>

                  <div className="conversation-thread" role="tabpanel">
                    {activeConversationMessages.length === 0 ? (
                      <p className="conversation-empty-state">עדיין אין הודעות בנושא הזה.</p>
                    ) : (
                      <div
                        ref={conversationMessageListRef}
                        className="conversation-message-list"
                      >
                        {activeConversationMessages.map((conversationEntry) => {
                          const isOwnMessage = conversationEntry.user_id === user.id;
                          const canDeleteMessage =
                            isOwnMessage || canManageCommunity(selectedCommunity.role, user.email);
                          const isEditingMessage =
                            editingConversationMessageId === conversationEntry.id;
                          const messageBusy =
                            conversationBusyMessageId === conversationEntry.id;

                          return (
                            <article
                              className={`conversation-message-card${isOwnMessage ? " is-own" : ""}`}
                              key={conversationEntry.id}
                            >
                              <ProfileAvatar
                                imageUrl={
                                  conversationEntry.avatar_url ?? conversationEntry.google_avatar_url
                                }
                                name={conversationEntry.full_name}
                                size="small"
                                onOpen={openImage}
                              />
                              <div className="conversation-message-content">
                                <div className="conversation-message-meta">
                                  <strong>{conversationEntry.full_name}</strong>
                                  <time dateTime={conversationEntry.created_at}>
                                    {formatShortDateTime(conversationEntry.created_at)}
                                    {conversationEntry.updated_at !== conversationEntry.created_at
                                      ? " · נערכה"
                                      : ""}
                                  </time>
                                </div>

                                {isEditingMessage ? (
                                  <div className="conversation-message-editor">
                                    <textarea
                                      value={editingConversationBody}
                                      onChange={(event) => setEditingConversationBody(event.target.value)}
                                      maxLength={1200}
                                      rows={3}
                                      autoFocus
                                    />
                                    <div className="conversation-message-editor-actions">
                                      <button
                                        type="button"
                                        className="secondary-button compact-button"
                                        onClick={cancelEditingConversationMessage}
                                        disabled={messageBusy}
                                      >
                                        ביטול
                                      </button>
                                      <button
                                        type="button"
                                        className="primary-button compact-button"
                                        onClick={() => void saveConversationMessageEdit(conversationEntry)}
                                        disabled={messageBusy || !editingConversationBody.trim()}
                                      >
                                        {messageBusy ? "שומרים..." : "שמירה"}
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <p>{conversationEntry.body}</p>
                                )}

                                {!isEditingMessage && (isOwnMessage || canDeleteMessage) && (
                                  <div className="conversation-message-actions">
                                    {isOwnMessage && (
                                      <button
                                        type="button"
                                        onClick={() => startEditingConversationMessage(conversationEntry)}
                                        disabled={Boolean(conversationBusyMessageId)}
                                      >
                                        עריכה
                                      </button>
                                    )}
                                    {canDeleteMessage && (
                                      <button
                                        type="button"
                                        className="is-danger"
                                        onClick={() =>
                                          setPendingMemberAction({
                                            type: "delete_conversation_message",
                                            message: conversationEntry,
                                          })
                                        }
                                        disabled={Boolean(conversationBusyMessageId)}
                                      >
                                        מחיקה
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    )}

                    {activeConversationTopic && (
                      <ConversationComposer
                        topicId={activeConversationTopic.id}
                        topicTitle={activeConversationTopic.title}
                        onSend={sendConversationMessage}
                      />
                    )}
                  </div>
                </>
              )}

              {conversationMessage && (
                <p className={`message-box ${conversationMessageTone}`}>{conversationMessage}</p>
              )}
            </section>

            <section className="event-attendees-section">
              {attendanceLoading ? (
                <div className="inline-loading">
                  <span className="spinner spinner-small" />
                  טוענים משתתפים...
                </div>
              ) : !hasVisibleAttendance ? (
                <p className="attendance-empty-state">עדיין אין תשובות לאירוע.</p>
              ) : (
                <div className="attendance-groups">
                  {visibleAttendanceGroups.map(([title, rows]) =>
                    rows.length > 0 ? (
                      <div className="attendance-group" key={title}>
                        <h3>{title}</h3>
                        <div className="attendance-people-list">
                          {rows.map((attendance) => (
                            <article className="attendance-person-card" key={attendance.user_id}>
                              <ProfileAvatar
                                imageUrl={attendance.avatar_url ?? attendance.google_avatar_url}
                                name={attendance.full_name}
                                size="small"
                                onOpen={openImage}
                              />
                              <div className="attendance-person-copy">
                                <strong>{attendance.full_name}</strong>
                                {(attendance.community_role === "owner" || attendance.community_role === "admin") && (
                                  <span className="manager-badge">מנהל/ת</span>
                                )}
                                {attendance.city && <span className="attendance-city">{attendance.city}</span>}
                                {attendance.phone && <PhoneLink phone={attendance.phone} />}
                                <span>{attendanceStatusLabel(attendance.status)}</span>
                                <span className="attendance-registered-at">נרשם/ה: {formatShortDateTime(attendance.created_at)}</span>
                              </div>
                              {canDeleteAnyEventAttendance && attendance.user_id !== user.id && (
                                <button
                                  type="button"
                                  className="member-remove-button attendance-row-delete-button"
                                  onClick={() =>
                                    setPendingMemberAction({ type: "attendance", attendance })
                                  }
                                >
                                  מחיקה
                                </button>
                              )}
                            </article>
                          ))}
                        </div>
                      </div>
                    ) : null,
                  )}
                </div>
              )}
            </section>

            <section className="event-gallery-section" id="event-gallery">
              <div className="section-heading-compact gallery-heading">
                <div>
                  <h2>גלריית האירוע</h2>
                  <small>{galleryImageCount}/{galleryImageLimit} תמונות · {galleryVideoCount}/{galleryVideoLimit} סרטונים</small>
                </div>
                {galleryCanUpload && (
                  <div className="gallery-upload-actions">
                    <input
                      ref={galleryImageInputRef}
                      className="hidden-file-input"
                      type="file"
                      accept="image/*,.heic,.heif"
                      multiple
                      onChange={(event) => {
                        const files = Array.from(event.target.files ?? []) as File[];
                        event.target.value = "";
                        if (files.length > 0) void uploadGalleryImages(files);
                      }}
                    />
                    <input
                      ref={galleryVideoInputRef}
                      className="hidden-file-input"
                      type="file"
                      accept="video/mp4,video/webm,video/quicktime,video/x-m4v,video/*,.heic,.heif,image/heic,image/heif"
                      multiple
                      onChange={(event) => {
                        const files = Array.from(event.target.files ?? []) as File[];
                        event.target.value = "";
                        if (files.length > 0) {
                          const imageFiles = files.filter((file) => isSupportedImageFile(file));
                          const videoFiles = files.filter((file) => !isSupportedImageFile(file));
                          void (async () => {
                            if (imageFiles.length > 0) await uploadGalleryImages(imageFiles);
                            if (videoFiles.length > 0) await uploadGalleryVideos(videoFiles);
                          })();
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="primary-button compact-button"
                      disabled={galleryBusy || galleryImageCount >= galleryImageLimit}
                      onClick={() => galleryImageInputRef.current?.click()}
                    >
                      הוספת תמונות
                    </button>
                    <button
                      type="button"
                      className="secondary-button compact-button gallery-video-button"
                      disabled={galleryBusy || galleryVideoCount >= galleryVideoLimit}
                      title={galleryVideoCount >= galleryVideoLimit ? `כבר קיימים ${galleryVideoLimit} סרטונים בגלריה` : "הוספת סרטונים; קובץ HEIC/HEIF יתווסף כתמונה"}
                      onClick={() => galleryVideoInputRef.current?.click()}
                    >
                      הוספת סרטונים
                    </button>
                  </div>
                )}
              </div>
              <VideoProcessStatus notice={galleryVideoNotice} />
              {!galleryCanUpload && (
                <p className="gallery-locked-note">
                  כל חברי/ות המעגל יכולים להוסיף תמונות וסרטונים לאחר שהאירוע התחיל.
                </p>
              )}
              {galleryLoading ? (
                <div className="inline-loading"><span className="spinner spinner-small" />טוענים את הגלריה...</div>
              ) : galleryPhotos.length === 0 ? (
                <p className="attendance-empty-state">עדיין אין קבצים בגלריה.</p>
              ) : (
                <div className="event-gallery-grid">
                  {galleryPhotos.map((photo) => (
                    <article className={`gallery-photo-card${photo.media_type === "video" ? " gallery-video-card" : ""}`} key={photo.id}>
                      {photo.media_type === "video" ? (
                        <video
                          className="gallery-video"
                          src={photo.image_url}
                          controls
                          preload="metadata"
                        />
                      ) : (
                        <button
                          type="button"
                          className="image-zoom-button gallery-photo-button"
                          onClick={() => openImage(photo.image_url, `תמונה שהעלה/תה ${photo.full_name}`)}
                        >
                          <img src={photo.image_url} alt={`תמונה שהעלה/תה ${photo.full_name}`} />
                        </button>
                      )}
                      <div className="gallery-photo-meta">
                        <div className="gallery-photo-credit">
                          <span>הועלה על ידי {photo.full_name}</span>
                          <time dateTime={photo.created_at}>{formatShortDateTime(photo.created_at)}</time>
                        </div>
                        {(photo.user_id === user.id || canManageEvents) && (
                          <button
                            type="button"
                            className="member-remove-button"
                            onClick={() => setPendingMemberAction({ type: "delete_gallery", photo })}
                          >
                            מחיקה
                          </button>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            {canManageEvents && (
              <div className="email-page-footer-actions event-whatsapp-footer-actions" aria-label="שליחת הודעה על האירוע">
                <button
                  type="button"
                  className="secondary-button email-page-trigger whatsapp-page-trigger"
                  onClick={openEventWhatsAppComposer}
                >
                  שליחת הודעת WhatsApp
                </button>
              </div>
            )}

            {isSystemAdminEmail(user.email) && !selectedCommunity.is_member && (
              <div className="event-management-actions" aria-label="צירוף למעגל">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => void joinSystemAdminToCommunity()}
                  disabled={systemAdminJoinBusy}
                >
                  {systemAdminJoinBusy
                    ? "מצרף את רון לאופר..."
                    : "צירוף רון לאופר למעגל"}
                </button>
              </div>
            )}
          </section>
        </div>
      )}

      {eventFormOpen && selectedCommunity && (
        <div className="event-editor-screen">
          <section className="event-editor-card-clean" aria-labelledby="event-form-title">
            <div className="clean-editor-toolbar">
              <button
                type="button"
                className="back-button"
                onClick={() => closeEventForm()}
                disabled={savingEvent}
              >
                חזרה
              </button>
            </div>

            <h2 id="event-form-title" className="visually-hidden">
              {editingEvent ? "עריכת האירוע" : "יצירת אירוע"}
            </h2>

            <div className="clean-editor-form event-editor-form">
              {!editingEvent && directCloneSourceEvent ? (
                <div className="direct-clone-notice">
                  האירוע יועתק מהאירוע <strong>{directCloneSourceEvent.title}</strong> שהתקיים ב {formatShortDate(directCloneSourceEvent.starts_at)}
                </div>
              ) : !editingEvent && cloneableWholeEvents.length > 0 ? (
                <label className="clone-event-field">
                  <span className="clone-event-select-shell">
                    <select
                      aria-label="שכפול מאירוע קיים"
                      value={cloneEventId}
                      onChange={(event) => void applyEventClone(event.target.value)}
                    >
                      <option value="">אירוע חדש ללא שכפול</option>
                      {cloneableWholeEvents.map((event) => (
                        <option value={event.id} key={event.id}>
                          {event.title} {formatShortDate(event.starts_at)}
                        </option>
                      ))}
                    </select>
                  </span>
                  <small>השכפול כולל את פרטי האירוע ואת טבלת האוכל שהוגדרה מראש בלבד.</small>
                </label>
              ) : null}

              <div className="image-upload-field event-image-upload-field">
                <input
                  ref={eventImageInputRef}
                  className="hidden-file-input"
                  type="file"
                  accept="image/*,.heic,.heif"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) void prepareImage(file, "event");
                  }}
                />
                <button
                  type="button"
                  className="primary-button upload-image-button"
                  onClick={() => eventImageInputRef.current?.click()}
                >
                  צירוף תמונה
                </button>

                {eventFormImageUrl && (
                  <button
                    type="button"
                    className="image-zoom-button selected-event-image-button"
                    onClick={() => openImage(eventFormImageUrl, "תמונת האירוע")}
                    aria-label="הגדלת תמונת האירוע"
                  >
                    <img className="selected-event-image" src={eventFormImageUrl} alt="תמונת האירוע" />
                  </button>
                )}
              </div>

              <label>
                <span>שם האירוע</span>
                <input
                  type="text"
                  value={eventTitle}
                  onChange={(event) => setEventTitle(event.target.value)}
                  maxLength={140}
                  placeholder="לדוגמה: ערב קיץ משותף"
                />
              </label>

              <div className="event-time-grid">
                <label>
                  <span>תאריך ומשעה</span>
                  <input
                    type="datetime-local"
                    value={eventDateTime}
                    onChange={(event) => setEventDateTime(event.target.value)}
                  />
                </label>
                <label>
                  <span>עד שעה <small>(לא חובה)</small></span>
                  <input
                    type="time"
                    value={eventEndDateTime}
                    onChange={(event) => setEventEndDateTime(event.target.value)}
                  />
                </label>
              </div>

              <label>
                <span>מיקום</span>
                <input
                  type="text"
                  value={eventLocation}
                  onChange={(event) => setEventLocation(event.target.value)}
                  maxLength={200}
                  placeholder="כתובת או שם המקום"
                />
              </label>

              <div className="approval-setting event-capacity-setting">
                <span className="field-label">האם האירוע מוגבל במספר המשתתפים?</span>
                <div className="approval-choice-group" role="group" aria-label="הגבלת מספר המשתתפים">
                  <button
                    type="button"
                    className={eventHasParticipantLimit ? "approval-choice selected" : "approval-choice"}
                    onClick={() => setEventHasParticipantLimit(true)}
                  >
                    כן
                  </button>
                  <button
                    type="button"
                    className={!eventHasParticipantLimit ? "approval-choice selected" : "approval-choice"}
                    onClick={() => {
                      setEventHasParticipantLimit(false);
                      setEventParticipantLimit("");
                    }}
                  >
                    לא
                  </button>
                </div>
                {eventHasParticipantLimit && (
                  <label className="participant-limit-field">
                    <span>עד כמה משתתפים?</span>
                    <input
                      type="number"
                      min="1"
                      max="10000"
                      value={eventParticipantLimit}
                      onChange={(event) => setEventParticipantLimit(event.target.value)}
                      placeholder="לדוגמה: 50"
                    />
                  </label>
                )}
              </div>

              <div className="event-media-settings-panel">
                <div className="section-heading-compact">
                  <h3>מגבלות גלריית האירוע</h3>
                  <small>ההגבלות נבדקות רק לאחר כיווץ הקובץ.</small>
                </div>
                <div className="event-media-settings-grid">
                  <label>
                    <span>מספר תמונות שניתן להעלות</span>
                    <input
                      type="number"
                      min={MEDIA_LIMITS.imageCountMin}
                      max={MEDIA_LIMITS.imageCountMax}
                      value={eventGalleryImageLimit}
                      onChange={(event) => setEventGalleryImageLimit(event.target.value)}
                    />
                  </label>
                  <label>
                    <span>גודל תמונה מכווצת מקסימלי במגה</span>
                    <input
                      type="number"
                      min={MEDIA_LIMITS.imageMaxMbMin}
                      max={MEDIA_LIMITS.imageMaxMbMax}
                      step="0.1"
                      value={eventGalleryImageMaxMb}
                      onChange={(event) => setEventGalleryImageMaxMb(event.target.value)}
                    />
                  </label>
                  <label>
                    <span>מספר סרטונים שניתן להעלות</span>
                    <input
                      type="number"
                      min={MEDIA_LIMITS.videoCountMin}
                      max={MEDIA_LIMITS.videoCountMax}
                      value={eventGalleryVideoLimit}
                      onChange={(event) => setEventGalleryVideoLimit(event.target.value)}
                    />
                  </label>
                  <label>
                    <span>גודל סרטון מכווץ מקסימלי במגה</span>
                    <input
                      type="number"
                      min={MEDIA_LIMITS.videoMaxMbMin}
                      max={MEDIA_LIMITS.videoMaxMbMax}
                      step="0.5"
                      value={eventGalleryVideoMaxMb}
                      onChange={(event) => setEventGalleryVideoMaxMb(event.target.value)}
                    />
                  </label>
                </div>
              </div>

              <div className="bring-setting-panel">
                <span className="field-label">טבלת מה כל אחד מביא</span>
                <div className="approval-choice-group" role="group" aria-label="סוג טבלת מה מביאים">
                  <button
                    type="button"
                    className={eventBringMode === "planned" ? "approval-choice selected" : "approval-choice"}
                    onClick={() => setEventBringMode("planned")}
                  >
                    טבלה מוגדרת מראש
                  </button>
                  <button
                    type="button"
                    className={eventBringMode === "free" ? "approval-choice selected" : "approval-choice"}
                    onClick={() => setEventBringMode("free")}
                  >
                    טבלה חופשית
                  </button>
                </div>
                <small>
                  בטבלה מוגדרת מראש מנהלי האירוע מציינים מה צריך. בכל מצב המשתתפים יכולים להוסיף גם פריטים משלהם.
                </small>

                {eventBringMode === "planned" && (
                  <div className="bring-needs-editor">
                    {copyableEvents.length > 0 && (
                      <div className="copy-bring-table-row">
                        <select
                          value={copyNeedsFromEventId}
                          onChange={(event) => setCopyNeedsFromEventId(event.target.value)}
                        >
                          <option value="">העתקה מאירוע אחר...</option>
                          {copyableEvents.map((event) => (
                            <option value={event.id} key={event.id}>{event.title} {formatShortDate(event.starts_at)}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="secondary-button compact-button"
                          onClick={() => void copyEventBringNeeds()}
                          disabled={!copyNeedsFromEventId}
                        >
                          העתקת הטבלה
                        </button>
                      </div>
                    )}

                    <div className="bring-need-add-row">
                      <label>
                        <span>מה צריך?</span>
                        <input
                          type="text"
                          value={eventBringNeedName}
                          onChange={(event) => setEventBringNeedName(event.target.value)}
                          maxLength={160}
                          placeholder="לדוגמה: פסטה או משקאות"
                        />
                      </label>
                      <button type="button" className="primary-button compact-button" onClick={addEventBringNeedDraft}>
                        הוספה לטבלה
                      </button>
                    </div>

                    {eventBringNeedDrafts.length > 0 && (
                      <div className="bring-needs-draft-list">
                        {eventBringNeedDrafts.map((draft) => (
                          <div className="bring-need-draft-row" key={draft.client_id}>
                            <span><strong>{draft.item_name}</strong></span>
                            <button
                              type="button"
                              className="member-remove-button"
                              onClick={() =>
                                setEventBringNeedDrafts((current) =>
                                  current.filter((item) => item.client_id !== draft.client_id),
                                )
                              }
                            >
                              הסרה
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <label>
                <span>תיאור</span>
                <textarea
                  value={eventDescription}
                  onChange={(event) => setEventDescription(event.target.value)}
                  maxLength={2000}
                  rows={6}
                  placeholder="פרטים חשובים על האירוע..."
                />
                <small>{eventDescription.length} / 2000</small>
              </label>
            </div>

            <div className="clean-editor-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => closeEventForm()}
                disabled={savingEvent}
              >
                סגירה ללא שמירה
              </button>
              <button
                type="button"
                className={`primary-button${eventFormIsDirty ? " save-button-dirty" : ""}`}
                onClick={() => void saveEvent()}
                disabled={savingEvent}
              >
                {savingEvent
                  ? "שומרים..."
                  : editingEvent
                    ? "שמירת האירוע"
                    : "יצירת האירוע"}
              </button>
            </div>

            {editingEvent && canManageEvents && (
              <div className="event-management-actions" aria-label="ניהול האירוע">
                <button
                  type="button"
                  className={editingEvent.cancelled_at ? "secondary-button" : "danger-button"}
                  onClick={() =>
                    setPendingMemberAction({
                      type: "cancel_event",
                      event: editingEvent,
                      cancel: !editingEvent.cancelled_at,
                    })
                  }
                  disabled={savingEvent}
                >
                  {editingEvent.cancelled_at ? "פתיחת האירוע מחדש" : "ביטול האירוע"}
                </button>
                <button
                  type="button"
                  className="danger-button"
                  onClick={() => setPendingMemberAction({ type: "delete_event", event: editingEvent })}
                  disabled={savingEvent}
                >
                  מחיקת האירוע
                </button>
              </div>
            )}

            {message && <p className={`message-box ${messageTone}`}>{message}</p>}
          </section>
        </div>
      )}

      </div>

      {whatsAppComposer && (
        <div className="modal-backdrop email-composer-backdrop" role="presentation" onMouseDown={() => closeWhatsAppComposer()}>
          <section
            className="email-composer-dialog whatsapp-composer-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="whatsapp-composer-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="email-composer-heading whatsapp-composer-heading">
              <div>
                <span className="email-composer-context whatsapp-composer-context">הודעת WhatsApp</span>
                <h2 id="whatsapp-composer-title">{whatsAppComposer.title}</h2>
                <p>
                  כתבו הודעה חופשית. שם {whatsAppComposer.type === "event" ? "האירוע, התאריך והשעה" : "המעגל"} והקישור יצורפו להודעה.
                </p>
              </div>
              <button
                type="button"
                className="dialog-close-button email-dialog-close"
                onClick={() => closeWhatsAppComposer()}
                aria-label="סגירה"
              >
                ×
              </button>
            </div>

            <div className="email-composer-form whatsapp-composer-form">
              {whatsAppComposer.imageUrl && (
                <img
                  className="whatsapp-share-preview-image"
                  src={whatsAppComposer.imageUrl}
                  alt={`תמונת התצוגה של ${whatsAppComposer.title}`}
                />
              )}
              <label className="email-field">
                <span className="email-field-label">טקסט חופשי</span>
                <textarea
                  value={whatsAppMessage}
                  onChange={(event) => setWhatsAppMessage(event.target.value)}
                  rows={6}
                  maxLength={1500}
                  placeholder="לדוגמה: חברים, בבקשה למלא מה אתם מביאים"
                  />
                <small className="email-character-count">{whatsAppMessage.length} מתוך 1500</small>
              </label>

              <div className="email-composer-note whatsapp-composer-note">
                <span aria-hidden="true">ⓘ</span>
                <p>
                  לאחר הלחיצה ייפתח WhatsApp לבחירת אדם או קבוצה. תישלח הודעה אחת בלבד. {whatsAppComposer.type === "event"
                    ? "תמונת האירוע תוצג מתוך הקישור; אם לאירוע אין תמונה, תוצג תמונת המעגל."
                    : "תמונת המעגל תוצג מתוך הקישור."}
                </p>
              </div>

              <div className="whatsapp-share-link-preview" dir="ltr">{whatsAppComposer.shareUrl}</div>
            </div>

            <div className="email-composer-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => closeWhatsAppComposer()}
              >
                סגירה ללא שליחה
              </button>
              <a
                className="primary-button whatsapp-send-button"
                href={getWhatsAppComposerUrl()}
                target="_blank"
                rel="noopener noreferrer"
              >
                שיתוף
              </a>
            </div>
          </section>
        </div>
      )}

      {selectedActiveUser && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setSelectedActiveUser(null)}>
          <section
            className="active-user-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={`פרטי ${selectedActiveUser.full_name}`}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="dialog-close-button"
              onClick={() => setSelectedActiveUser(null)}
              aria-label="סגירה"
            >
              ×
            </button>
            <ProfileAvatar
              imageUrl={getProfileImageUrl(selectedActiveUser.avatar_url, selectedActiveUser.google_avatar_url)}
              name={selectedActiveUser.full_name}
              size="large"
              onOpen={openImage}
            />
            <h2>{selectedActiveUser.full_name}</h2>
            <p className="active-user-dialog-label">מעגלים משותפים:</p>
            <div className="active-user-community-list">
              {selectedActiveUser.memberships.map((membership) => (
                <div key={membership.community_id}>
                  <strong>{membership.community_name}</strong>
                  <span>הצטרפות: {formatShortDateTime(membership.joined_at)}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {editingMemberImage && isSystemAdminEmail(user.email) && (
        <div className="modal-backdrop" role="presentation" onMouseDown={closeMemberImageEditor}>
          <section
            className="modal-card member-image-editor-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="member-image-editor-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="modal-close"
              onClick={closeMemberImageEditor}
              aria-label="סגירה"
              disabled={savingMemberImage}
            >
              ×
            </button>
            <div className="section-heading-compact member-image-editor-heading">
              <p className="section-kicker">חברי המעגל</p>
              <h2 id="member-image-editor-title">החלפת תמונה עבור {editingMemberImage.full_name}</h2>
            </div>

            <div className="member-image-editor-preview">
              <ProfileAvatar
                imageUrl={adminMemberImage?.previewUrl ?? editingMemberImage.avatar_url ?? editingMemberImage.google_avatar_url}
                name={editingMemberImage.full_name}
                size="large"
              />
            </div>

            <input
              ref={adminMemberImageInputRef}
              className="hidden-file-input"
              type="file"
              accept="image/*,.heic,.heif"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void prepareAdminMemberImage(file);
                event.currentTarget.value = "";
              }}
            />

            <button
              type="button"
              className="secondary-button member-image-select-button"
              onClick={() => adminMemberImageInputRef.current?.click()}
              disabled={savingMemberImage}
            >
              בחירת תמונה חדשה
            </button>

            {memberImageMessage && <p className="message-box error">{memberImageMessage}</p>}

            <div className="member-image-editor-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={closeMemberImageEditor}
                disabled={savingMemberImage}
              >
                ביטול
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={() => void saveAdminMemberImage()}
                disabled={savingMemberImage || !adminMemberImage}
              >
                {savingMemberImage ? "שומרים..." : "שמירת התמונה"}
              </button>
            </div>
          </section>
        </div>
      )}

      {profileCropRequest && (
        <ProfileImageCropper
          request={profileCropRequest}
          onCancel={closeProfileImageCropper}
          onConfirm={acceptProfileImageCrop}
        />
      )}

      {lightbox && (
        <div
          className="image-lightbox-backdrop"
          role="presentation"
          onMouseDown={() => setLightbox(null)}
        >
          <section
            className="image-lightbox"
            role="dialog"
            aria-modal="true"
            aria-label={lightbox.alt}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="image-lightbox-close"
              onClick={() => setLightbox(null)}
              aria-label="סגירת התמונה"
            >
              ×
            </button>
            <img src={lightbox.url} alt={lightbox.alt} referrerPolicy="no-referrer" />
          </section>
        </div>
      )}
    </main>
  );
}
