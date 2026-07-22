"use client";
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { RichText } from "@/app/components/RichText";

type Profile = {
  id: string;
  email: string | null;
  full_name: string;
  about: string;
  city: string;
  phone: string;
  avatar_url: string | null;
  google_avatar_url: string | null;
  legal_accepted_at: string | null;
  legal_version: string | null;
};

type CommunityRole = "owner" | "admin" | "member";

const APP_VERSION = "v1.0.7.6";
const SOFTWARE_ICON_IMAGE = "/circles-logo.png";
const SYSTEM_ADMIN_EMAIL = "laufer.ron@gmail.com";
const LEGAL_VERSION = "2026-07-22";
const PRODUCTION_ORIGIN = "https://circles-community.vercel.app";
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const MAX_IMAGE_EDGE = 1800;
const MAX_GALLERY_IMAGES = 20;
const MAX_GALLERY_VIDEO_BYTES = 20 * 1024 * 1024;
const MAX_COMMUNITY_VIDEO_BYTES = 50 * 1024 * 1024;

type SelectedImage = {
  blob: Blob;
  previewUrl: string;
};

type SelectedVideo = {
  file: File;
  previewUrl: string;
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
  share_token: string;
  status: "active" | "cancelled";
  cancelled_at: string | null;
  cancelled_by: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

type AttendanceStatus = "going" | "maybe" | "not_going";

type EventAttendance = {
  event_id: string;
  user_id: string;
  status: AttendanceStatus;
  party_size: number;
  guest_names: string;
  note: string;
  created_at: string;
  updated_at: string;
  full_name: string;
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

type PersonalEventRow = {
  event: CommunityEvent;
  community: Community;
  attendance: EventAttendance | null;
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

function LegalScreen({
  checked,
  onCheckedChange,
  onAccept,
  onBack,
  saving,
  acceptanceRequired,
  acceptButtonLabel,
  acceptedAt,
  message,
  messageTone,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  onAccept: () => void;
  onBack?: () => void;
  saving: boolean;
  acceptanceRequired: boolean;
  acceptButtonLabel: string;
  acceptedAt?: string | null;
  message: string | null;
  messageTone: "success" | "error";
}) {
  return (
    <main className="legal-page">
      <section className="legal-card" aria-live="polite">
        <div className="legal-toolbar">
          {onBack ? (
            <button type="button" className="back-button" onClick={onBack}>
              חזרה
            </button>
          ) : (
            <span />
          )}
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
              מספר טלפון, תיאור אישי ותמונת פרופיל אחרת.
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
      "image/webp",
      quality,
    );
  });
}

async function compressImage(file: File): Promise<SelectedImage> {
  if (!file.type.startsWith("image/")) {
    throw new Error("not_an_image");
  }

  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("image_too_large");
  }

  const sourceUrl = URL.createObjectURL(file);

  try {
    const image = await loadImage(sourceUrl);
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;

    if (!sourceWidth || !sourceHeight) {
      throw new Error("image_decode_failed");
    }

    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(sourceWidth, sourceHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(sourceWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceHeight * scale));

    const context = canvas.getContext("2d");
    if (!context) throw new Error("image_compression_failed");

    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    let compressed = await canvasToBlob(canvas, 0.82);
    if (compressed.size > MAX_IMAGE_BYTES) {
      compressed = await canvasToBlob(canvas, 0.66);
    }
    if (compressed.size > MAX_IMAGE_BYTES) {
      compressed = await canvasToBlob(canvas, 0.5);
    }

    if (compressed.size > MAX_IMAGE_BYTES) {
      throw new Error("compressed_image_too_large");
    }

    return {
      blob: compressed,
      previewUrl: URL.createObjectURL(compressed),
    };
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

function isSystemAdminEmail(email: string | null | undefined) {
  return email?.trim().toLowerCase() === SYSTEM_ADMIN_EMAIL;
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

function hideCommunityPlaceholder(community: Pick<Community, "name" | "logo_url">) {
  return !community.logo_url && community.name.trim() === "בדיקה";
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
  const communityImageInputRef = useRef<HTMLInputElement | null>(null);
  const communityVideoInputRef = useRef<HTMLInputElement | null>(null);
  const eventImageInputRef = useRef<HTMLInputElement | null>(null);
  const galleryImageInputRef = useRef<HTMLInputElement | null>(null);
  const galleryVideoInputRef = useRef<HTMLInputElement | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [fullName, setFullName] = useState("");
  const [about, setAbout] = useState("");
  const [city, setCity] = useState("");
  const [phone, setPhone] = useState("");
  const [profileScreenOpen, setProfileScreenOpen] = useState(false);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [selectedCommunityId, setSelectedCommunityId] = useState<string | null>(null);
  const [communityFormOpen, setCommunityFormOpen] = useState(false);
  const [editingCommunityId, setEditingCommunityId] = useState<string | null>(null);
  const [communityName, setCommunityName] = useState("");
  const [communityDescription, setCommunityDescription] = useState("");
  const [communityRequiresApproval, setCommunityRequiresApproval] = useState(true);
  const [profileImage, setProfileImage] = useState<SelectedImage | null>(null);
  const [communityImage, setCommunityImage] = useState<SelectedImage | null>(null);
  const [communityVideo, setCommunityVideo] = useState<SelectedVideo | null>(null);
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
  const [eventsLoading, setEventsLoading] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [eventAttendance, setEventAttendance] = useState<EventAttendance[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceStatus, setAttendanceStatus] = useState<AttendanceStatus | null>(null);
  const [attendancePartySize, setAttendancePartySize] = useState("1");
  const [attendanceGuestNames, setAttendanceGuestNames] = useState("");
  const [attendanceNote, setAttendanceNote] = useState("");
  const [savingAttendance, setSavingAttendance] = useState(false);
  const [attendanceMessage, setAttendanceMessage] = useState<string | null>(null);
  const [attendanceMessageTone, setAttendanceMessageTone] = useState<"error" | "success">("error");
  const [eventBringNeeds, setEventBringNeeds] = useState<EventBringNeed[]>([]);
  const [eventBringContributions, setEventBringContributions] = useState<EventBringContribution[]>([]);
  const [bringLoading, setBringLoading] = useState(false);
  const [bringItemName, setBringItemName] = useState("");
  const [bringItemQuantity, setBringItemQuantity] = useState("1");
  const [bringQuantityByNeed, setBringQuantityByNeed] = useState<Record<string, string>>({});
  const [bringNoteByContribution, setBringNoteByContribution] = useState<Record<string, string>>({});
  const [freeBringQuantityByContribution, setFreeBringQuantityByContribution] = useState<Record<string, string>>({});
  const [bringBusyKey, setBringBusyKey] = useState<string | null>(null);
  const [pendingBringDeletion, setPendingBringDeletion] = useState<EventBringContribution | null>(null);
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
  const [eventBringNeedQuantity, setEventBringNeedQuantity] = useState("1");
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
  const [shareCommunity, setShareCommunity] = useState<Community | null>(null);
  const [shareEvent, setShareEvent] = useState<CommunityEvent | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [galleryPhotos, setGalleryPhotos] = useState<EventGalleryPhoto[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [galleryBusy, setGalleryBusy] = useState(false);
  const [cloneEventId, setCloneEventId] = useState("");
  const [directCloneEventId, setDirectCloneEventId] = useState<string | null>(null);
  const [personalEvents, setPersonalEvents] = useState<PersonalEventRow[]>([]);
  const [personalCommitments, setPersonalCommitments] = useState<Array<EventBringContribution & { event_title: string; starts_at: string; community_id: string; community_name: string; share_token: string }>>([]);
  const [personalLoading, setPersonalLoading] = useState(false);
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

  const clearSelectedImage = useCallback((image: SelectedImage | null) => {
    if (image?.previewUrl) URL.revokeObjectURL(image.previewUrl);
  }, []);

  const clearSelectedVideo = useCallback((video: SelectedVideo | null) => {
    if (video?.previewUrl) URL.revokeObjectURL(video.previewUrl);
  }, []);

  const loadCommunities = useCallback(
    async (currentUser: User) => {
      setCommunitiesLoading(true);
      setCommunitiesReady(false);

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

      if (!memberships || memberships.length === 0) {
        setCommunities([]);
        setCommunitiesLoading(false);
        setCommunitiesReady(true);
        return;
      }

      const communityIds = memberships.map((membership) => membership.community_id);
      const roles = new Map(
        memberships.map((membership) => [
          membership.community_id,
          membership.role as CommunityRole,
        ]),
      );

      const { data: communityRows, error: communitiesError } = await supabase
        .from("communities")
        .select("id,name,description,logo_url,video_url,requires_member_approval,created_by,created_at,updated_at,share_token")
        .in("id", communityIds)
        .order("created_at", { ascending: false });

      if (communitiesError) {
        setMessageTone("error");
        setMessage("לא הצלחנו לטעון את פרטי המעגלים.");
        setCommunitiesLoading(false);
        setCommunitiesReady(true);
        return;
      }

      setCommunities(
        (communityRows ?? []).map((community) => ({
          ...community,
          role: roles.get(community.id) ?? "member",
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
            .select("id,full_name,city,phone,avatar_url,google_avatar_url")
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
        return new Date(first.joined_at).getTime() - new Date(second.joined_at).getTime();
      });
      setCommunityMembers(mappedMembers);

      if (role === "owner" || role === "admin") {
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
    [supabase],
  );

  const loadCommunityEvents = useCallback(
    async (communityId: string) => {
      setEventsLoading(true);

      const { data, error } = await supabase
        .from("community_events")
        .select(
          "id,community_id,title,description,location,starts_at,ends_at,image_url,participant_limit,bring_mode,share_token,status,cancelled_at,cancelled_by,created_by,created_at,updated_at",
        )
        .eq("community_id", communityId)
        .order("starts_at", { ascending: true });

      if (error) {
        console.error("Loading circle events failed", error);
        setCommunityEvents([]);
        setMessageTone("error");
        setMessage(
          error.code === "42P01"
            ? "יש להריץ את קובץ ה־SQL של circles24 ב־Supabase."
            : "לא הצלחנו לטעון את אירועי המעגל.",
        );
      } else {
        setCommunityEvents((data ?? []) as CommunityEvent[]);
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
        .select("event_id,user_id,status,party_size,guest_names,note,created_at,updated_at")
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
            .select("id,full_name,city,phone,avatar_url,google_avatar_url")
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
      setAttendancePartySize(String(ownAttendance?.party_size ?? 1));
      setAttendanceGuestNames(ownAttendance?.guest_names ?? "");
      setAttendanceNote(ownAttendance?.note ?? "");
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
          note: contribution.note ?? "",
          full_name: contributorProfile?.full_name || "משתמש",
          avatar_url: contributorProfile?.avatar_url ?? null,
          google_avatar_url: contributorProfile?.google_avatar_url ?? null,
        };
      }) as EventBringContribution[];

      setEventBringNeeds((needRows ?? []) as EventBringNeed[]);
      setEventBringContributions(mappedContributions);
      setBringQuantityByNeed(
        Object.fromEntries(
          (needRows ?? []).map((need) => {
            const ownContribution = mappedContributions.find(
              (contribution) => contribution.need_id === need.id && contribution.user_id === user?.id,
            );
            return [need.id, String(ownContribution?.quantity ?? 0)];
          }),
        ),
      );
      setFreeBringQuantityByContribution(
        Object.fromEntries(
          mappedContributions
            .filter(
              (contribution) => contribution.need_id === null && contribution.user_id === user?.id,
            )
            .map((contribution) => [contribution.id, String(contribution.quantity)]),
        ),
      );
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
    setGalleryPhotos(
      (photoRows ?? []).map((photo) => ({
        ...photo,
        full_name: names.get(photo.user_id) || "משתמש",
      })) as EventGalleryPhoto[],
    );
    setGalleryLoading(false);
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
      .select("event_id,user_id,status,party_size,guest_names,note,created_at,updated_at")
      .eq("user_id", user.id);

    const eventIds = Array.from(new Set((attendanceRows ?? []).map((row) => row.event_id)));
    const { data: eventRows, error: eventsError } = eventIds.length
      ? await supabase
          .from("community_events")
          .select("id,community_id,title,description,location,starts_at,ends_at,image_url,participant_limit,bring_mode,share_token,status,cancelled_at,cancelled_by,created_by,created_at,updated_at")
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
    view: { circleToken?: string; eventToken?: string; profile?: boolean },
    mode: "push" | "replace" = "push",
  ) {
    const params = new URLSearchParams();
    if (view.eventToken) params.set("event", view.eventToken);
    else if (view.circleToken) params.set("circle", view.circleToken);
    else if (view.profile) params.set("view", "profile");

    const nextUrl = params.size ? `/?${params.toString()}` : "/";
    const viewName = view.eventToken
      ? "event"
      : view.circleToken
        ? "circle"
        : view.profile
          ? "profile"
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
        .select("id,email,full_name,about,city,phone,avatar_url,google_avatar_url,legal_accepted_at,legal_version")
        .eq("id", currentUser.id)
        .maybeSingle<Profile>();

      if (error) {
        setMessageTone("error");
        setMessage(
          error.code === "42P01"
            ? "יש להריץ תחילה את קובץ ה־SQL של circles3 ב־Supabase."
            : error.code === "42703"
              ? "יש להריץ את קובץ ה־SQL של circles74 ב־Supabase."
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
          .select("id,email,full_name,about,city,phone,avatar_url,google_avatar_url,legal_accepted_at,legal_version")
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
          .select("id,email,full_name,about,city,phone,avatar_url,google_avatar_url,legal_accepted_at,legal_version")
          .single<Profile>();

        loadedProfile = refreshedProfile ?? loadedProfile;
      }

      setProfile(loadedProfile);
      setFullName(loadedProfile.full_name);
      setAbout(loadedProfile.about);
      setCity(loadedProfile.city);
      setPhone(loadedProfile.phone);
      setProfileLoading(false);
    },
    [supabase],
  );

  useEffect(() => {
    const isLocalhost = ["localhost", "127.0.0.1"].includes(window.location.hostname);
    document.documentElement.classList.toggle("is-localhost", isLocalhost);

    return () => document.documentElement.classList.remove("is-localhost");
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

      if (requestedView === "profile") {
        window.history.replaceState({ circlesApp: true, view: "home" }, "", "/");
        window.history.pushState({ circlesApp: true, view: "profile" }, "", "/?view=profile");
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
    if (!user) {
      setNotifications([]);
      return;
    }

    void loadNotifications();
    const timer = window.setInterval(() => void loadNotifications(), 30_000);
    return () => window.clearInterval(timer);
  }, [loadNotifications, user]);

  useEffect(() => {
    if (profileScreenOpen) void loadPersonalDashboard();
  }, [loadPersonalDashboard, profileScreenOpen]);

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

      if (requestedView === "profile") {
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
    setPendingBringDeletion(null);
    setBringItemName("");
    setBringItemQuantity("1");
    setSelectedEventId(null);
    setEventAttendance([]);
    setAttendanceMessage(null);
  }, [selectedCommunityId]);

  useEffect(() => {
    const selected = communities.find((community) => community.id === selectedCommunityId);

    if (!selected) {
      setCommunityMembers([]);
      setJoinRequests([]);
      setCommunityEvents([]);
      return;
    }

    void Promise.all([
      loadCommunityPeople(selected.id, selected.role),
      loadCommunityEvents(selected.id),
    ]);
  }, [communities, loadCommunityEvents, loadCommunityPeople, selectedCommunityId]);

  useEffect(() => {
    if (!selectedEventId) {
      setEventAttendance([]);
      setAttendanceStatus(null);
      setAttendancePartySize("1");
      setAttendanceGuestNames("");
      setAttendanceNote("");
      setAttendanceMessage(null);
      setEventBringNeeds([]);
      setEventBringContributions([]);
      setBringQuantityByNeed({});
      setFreeBringQuantityByContribution({});
      setBringItemName("");
      setBringItemQuantity("1");
      setBringMessage(null);
      setGalleryPhotos([]);
      return;
    }

    const eventExists = communityEvents.some((event) => event.id === selectedEventId);
    if (eventExists) {
      void Promise.all([
        loadEventAttendance(selectedEventId),
        loadEventBringData(selectedEventId),
        loadEventGallery(selectedEventId),
      ]);
    }
  }, [communityEvents, loadEventAttendance, loadEventBringData, loadEventGallery, selectedEventId]);

  useEffect(() => {
    const targetEvent = communityEvents.find((event) => event.id === selectedEventId) ?? null;
    const targetCommunity = communities.find((community) => community.id === targetEvent?.community_id) ?? null;
    const isManager = Boolean(
      targetEvent && targetCommunity &&
      (isSystemAdminEmail(user?.email) || targetCommunity.role === "owner" || targetCommunity.role === "admin"),
    );
    const isLockedForMember = Boolean(
      targetEvent && !isManager &&
      (targetEvent.status === "cancelled" || new Date(targetEvent.starts_at).getTime() <= Date.now()),
    );
    if (!selectedEventId || !attendanceStatus || attendanceLoading || savingAttendance || isLockedForMember) return;

    const currentAttendance = eventAttendance.find(
      (attendance) => attendance.user_id === user?.id,
    );
    const parsedPartySize = Number.parseInt(attendancePartySize, 10);
    const normalizedPartySize = attendanceStatus === "not_going" ? 1 : parsedPartySize;
    const isValidPartySize =
      attendanceStatus === "not_going" ||
      (Number.isInteger(normalizedPartySize) && normalizedPartySize >= 1 && normalizedPartySize <= 20);

    if (!isValidPartySize) return;

    const isDirty =
      attendanceStatus !== currentAttendance?.status ||
      normalizedPartySize !== (currentAttendance?.party_size ?? 1) ||
      (attendanceStatus === "not_going" ? "" : attendanceGuestNames.trim()) !==
        (currentAttendance?.guest_names ?? "") ||
      attendanceNote.trim() !== (currentAttendance?.note ?? "");

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
    attendanceGuestNames,
    attendanceLoading,
    attendanceNote,
    attendancePartySize,
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
    const currentCircleToken = params.get("circle");
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

    const isSystemAdmin = isSystemAdminEmail(user.email);
    const isCircleCreator = currentCommunity.created_by === user.id;

    if (!isSystemAdmin && !isCircleCreator) {
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
    const { error } = await supabase.rpc("leave_community", {
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

  async function prepareImage(file: File, target: "profile" | "community" | "event") {
    setMessage(null);

    try {
      const compressed = await compressImage(file);

      if (target === "profile") {
        setProfileImage((current) => {
          clearSelectedImage(current);
          return compressed;
        });
      } else if (target === "community") {
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
      console.error("Image preparation failed", error);
      setMessageTone("error");
      setMessage(
        error instanceof Error && error.message === "image_too_large"
          ? "אפשר לצרף תמונה בגודל של עד 3MB."
          : "לא הצלחנו לקרוא את התמונה. נסו לבחור קובץ תמונה אחר.",
      );
    }
  }

  async function uploadPublicImage(bucket: string, path: string, blob: Blob) {
    const { error } = await supabase.storage.from(bucket).upload(path, blob, {
      contentType: "image/webp",
      cacheControl: "3600",
      upsert: true,
    });

    if (error) throw error;

    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return `${data.publicUrl}?v=${Date.now()}`;
  }


  function prepareCommunityVideo(file: File) {
    const allowedTypes = ["video/mp4", "video/webm", "video/quicktime"];

    if (!allowedTypes.includes(file.type)) {
      setMessageTone("error");
      setMessage("אפשר לצרף סרטון מסוג MP4, MOV או WebM.");
      return;
    }

    if (file.size > MAX_COMMUNITY_VIDEO_BYTES) {
      setMessageTone("error");
      setMessage("אפשר לצרף סרטון בגודל של עד 50MB.");
      return;
    }

    setMessage(null);
    setCommunityVideo((current) => {
      clearSelectedVideo(current);
      return {
        file,
        previewUrl: URL.createObjectURL(file),
      };
    });
  }

  async function uploadPublicVideo(bucket: string, path: string, file: File) {
    const { error } = await supabase.storage.from(bucket).upload(path, file, {
      contentType: file.type,
      cacheControl: "3600",
      upsert: true,
    });

    if (error) throw error;

    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return `${data.publicUrl}?v=${Date.now()}`;
  }

  async function saveProfile() {
    if (!user || !profile) return;

    const cleanName = fullName.trim();
    if (!cleanName) {
      setMessageTone("error");
      setMessage("יש למלא שם.");
      return;
    }

    setSaving(true);
    setMessage(null);

    let avatarUrl = profile.avatar_url;

    if (profileImage) {
      try {
        avatarUrl = await uploadPublicImage(
          "profile-images",
          `${user.id}/avatar.webp`,
          profileImage.blob,
        );
      } catch (error) {
        console.error("Profile image upload failed", error);
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
        avatar_url: avatarUrl,
      })
      .eq("id", user.id)
      .select("id,email,full_name,about,city,phone,avatar_url,google_avatar_url,legal_accepted_at,legal_version")
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
            `${existingCommunity.id}/cover.webp`,
            communityImage.blob,
          );
        } catch (error) {
          console.error("Circle image upload failed", error);
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
          );
        } catch (error) {
          console.error("Circle video upload failed", error);
          setMessageTone("error");
          setMessage("העלאת סרטון המעגל לא הצליחה. נסו שוב.");
          setSavingCommunity(false);
          return;
        }
      }

      const { data, error } = await supabase
        .from("communities")
        .update({
          name: cleanName,
          description: cleanDescription,
          logo_url: logoUrl,
          video_url: videoUrl,
          requires_member_approval: communityRequiresApproval,
        })
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

      const updatedCommunity: Community = { ...data, role: existingCommunity.role };
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
          `${communityId}/cover.webp`,
          communityImage.blob,
        );

        const { error: logoUpdateError } = await supabase
          .from("communities")
          .update({ logo_url: uploadedLogoUrl })
          .eq("id", communityId);

        if (logoUpdateError) throw logoUpdateError;
      } catch (error) {
        console.error("Circle image upload failed", error);
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
        );

        const { error: videoUpdateError } = await supabase
          .from("communities")
          .update({ video_url: uploadedVideoUrl })
          .eq("id", communityId);

        if (videoUpdateError) throw videoUpdateError;
      } catch (error) {
        console.error("Circle video upload failed", error);
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
      ? { ...data, role: "owner" }
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
    setEventBringNeedQuantity("1");
    setCopyNeedsFromEventId("");
    setCloneEventId("");
    setEventHasParticipantLimit(false);
    setEventParticipantLimit("");
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
        quantity_needed: need.quantity_needed,
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
    setMessage(null);
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
    setEventBringNeedQuantity("1");
    setCopyNeedsFromEventId("");
    setCloneEventId("");
    setEventHasParticipantLimit(event.participant_limit !== null);
    setEventParticipantLimit(event.participant_limit?.toString() ?? "");
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
        quantity_needed: need.quantity_needed,
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
    const quantity = Number.parseInt(eventBringNeedQuantity, 10);
    if (!itemName || !Number.isInteger(quantity) || quantity < 1 || quantity > 1000) {
      setMessageTone("error");
      setMessage("יש להזין פריט וכמות בין 1 ל־1,000.");
      return;
    }

    setEventBringNeedDrafts((current) => [
      ...current,
      {
        client_id: crypto.randomUUID(),
        id: null,
        item_name: itemName,
        quantity_needed: quantity,
      },
    ]);
    setEventBringNeedName("");
    setEventBringNeedQuantity("1");
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
        quantity_needed: need.quantity_needed,
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
          .update({ item_name: draft.item_name, quantity_needed: draft.quantity_needed })
          .eq("id", draft.id);
        if (error) return error;
      } else {
        const { error } = await supabase.from("event_bring_needs").insert({
          event_id: eventId,
          item_name: draft.item_name,
          quantity_needed: draft.quantity_needed,
          created_by: user.id,
        });
        if (error) return error;
      }
    }

    return null;
  }

  async function saveNeedContribution(need: EventBringNeed, quantityOverride?: number) {
    if (!user || !selectedEventId) return;
    const quantity =
      quantityOverride ?? Number.parseInt(bringQuantityByNeed[need.id] ?? "0", 10);
    const existing = eventBringContributions.find(
      (contribution) => contribution.need_id === need.id && contribution.user_id === user.id,
    );

    if (!Number.isInteger(quantity) || quantity < 0 || quantity > 1000) {
      setBringMessageTone("error");
      setBringMessage("הכמות צריכה להיות בין 0 ל־1,000.");
      return;
    }

    setBringBusyKey(`need-${need.id}`);
    setBringMessage(null);

    if (quantity === 0) {
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
        setBringQuantityByNeed((current) => ({
          ...current,
          [need.id]: String(existing.quantity),
        }));
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
      const { error } = await supabase
        .from("event_bring_contributions")
        .update({ quantity, item_name: need.item_name })
        .eq("id", existing.id);

      if (error) {
        setBringMessageTone("error");
        setBringMessage(`שמירת הפריט לא הצליחה. ${formatSupabaseError(error)}`);
        setBringQuantityByNeed((current) => ({
          ...current,
          [need.id]: String(existing.quantity),
        }));
      } else {
        setEventBringContributions((current) =>
          current.map((contribution) =>
            contribution.id === existing.id
              ? { ...contribution, quantity, item_name: need.item_name }
              : contribution,
          ),
        );
      }
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
        quantity,
      })
      .select("id,event_id,need_id,user_id,item_name,quantity,note,created_at")
      .single();

    if (error || !inserted) {
      setBringMessageTone("error");
      setBringMessage(`שמירת הפריט לא הצליחה. ${formatSupabaseError(error)}`);
      setBringQuantityByNeed((current) => ({ ...current, [need.id]: "0" }));
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

  async function saveContributionNote(contribution: EventBringContribution, note: string) {
    if (!selectedEventId || contribution.user_id !== user?.id) return;
    const normalizedNote = note.slice(0, 300);
    setBringBusyKey(`note-${contribution.id}`);
    setBringMessage(null);

    const { error } = await supabase
      .from("event_bring_contributions")
      .update({ note: normalizedNote })
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
          item.id === contribution.id ? { ...item, note: normalizedNote } : item,
        ),
      );
    }
    setBringBusyKey(null);
  }

  function scheduleContributionNoteSave(
    contribution: EventBringContribution,
    value: string,
  ) {
    const normalizedValue = value.slice(0, 300);
    setBringNoteByContribution((current) => ({
      ...current,
      [contribution.id]: normalizedValue,
    }));

    const timeoutKey = `note-${contribution.id}`;
    const currentTimeout = bringAutoSaveTimeoutsRef.current[timeoutKey];
    if (currentTimeout) clearTimeout(currentTimeout);

    bringAutoSaveTimeoutsRef.current[timeoutKey] = setTimeout(() => {
      delete bringAutoSaveTimeoutsRef.current[timeoutKey];
      void saveContributionNote(contribution, normalizedValue);
    }, 550);
  }

  function scheduleNeedContributionSave(need: EventBringNeed, value: string) {
    setBringQuantityByNeed((current) => ({ ...current, [need.id]: value }));
    const timeoutKey = `need-${need.id}`;
    const currentTimeout = bringAutoSaveTimeoutsRef.current[timeoutKey];
    if (currentTimeout) clearTimeout(currentTimeout);

    if (value.trim() === "") return;
    const quantity = Number.parseInt(value, 10);
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > 1000) return;

    bringAutoSaveTimeoutsRef.current[timeoutKey] = setTimeout(() => {
      delete bringAutoSaveTimeoutsRef.current[timeoutKey];
      void saveNeedContribution(need, quantity);
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
    setFreeBringQuantityByContribution((current) => {
      const next = { ...current };
      delete next[contribution.id];
      return next;
    });
    setBringNoteByContribution((current) => {
      const next = { ...current };
      delete next[contribution.id];
      return next;
    });
    setBringMessage(null);
    setBringBusyKey(null);
    return true;
  }

  async function saveFreeContributionQuantity(
    contribution: EventBringContribution,
    quantity: number,
  ) {
    if (!selectedEventId || quantity < 1 || quantity > 1000) return;

    setBringBusyKey(`contribution-${contribution.id}`);
    setBringMessage(null);
    const { error } = await supabase
      .from("event_bring_contributions")
      .update({ quantity })
      .eq("id", contribution.id);

    if (error) {
      setBringMessageTone("error");
      setBringMessage(`עדכון הכמות לא הצליח. ${formatSupabaseError(error)}`);
      setFreeBringQuantityByContribution((current) => ({
        ...current,
        [contribution.id]: String(contribution.quantity),
      }));
    } else {
      setEventBringContributions((current) =>
        current.map((item) =>
          item.id === contribution.id ? { ...item, quantity } : item,
        ),
      );
      setBringMessage(null);
    }
    setBringBusyKey(null);
  }

  function scheduleFreeContributionSave(
    contribution: EventBringContribution,
    value: string,
  ) {
    setFreeBringQuantityByContribution((current) => ({
      ...current,
      [contribution.id]: value,
    }));

    const timeoutKey = `contribution-${contribution.id}`;
    const currentTimeout = bringAutoSaveTimeoutsRef.current[timeoutKey];
    if (currentTimeout) clearTimeout(currentTimeout);

    if (value.trim() === "") return;
    const quantity = Number.parseInt(value, 10);
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > 1000) return;

    if (quantity === 0) {
      setPendingBringDeletion(contribution);
      return;
    }

    bringAutoSaveTimeoutsRef.current[timeoutKey] = setTimeout(() => {
      delete bringAutoSaveTimeoutsRef.current[timeoutKey];
      void saveFreeContributionQuantity(contribution, quantity);
    }, 550);
  }

  async function addFreeBringContribution(itemNameOverride?: string, quantityOverride?: number) {
    if (!user || !selectedEventId || freeBringAddBusyRef.current) return;
    const itemName = (itemNameOverride ?? bringItemName).trim();
    const quantity = quantityOverride ?? Number.parseInt(bringItemQuantity, 10);
    if (!itemName || !Number.isInteger(quantity) || quantity < 1 || quantity > 1000) return;

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
        quantity,
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
      setFreeBringQuantityByContribution((current) => ({
        ...current,
        [inserted.id]: String(quantity),
      }));
      setBringNoteByContribution((current) => ({ ...current, [inserted.id]: "" }));
      setBringItemName("");
      setBringItemQuantity("1");
      setBringMessage(null);
    }
    setBringBusyKey(null);
    freeBringAddBusyRef.current = false;
  }

  function tryAddFreeBringItem() {
    const itemName = bringItemName.trim();
    const quantity = Number.parseInt(bringItemQuantity, 10);
    if (itemName && Number.isInteger(quantity) && quantity >= 1 && quantity <= 1000) {
      void addFreeBringContribution(itemName, quantity);
    }
  }

  async function confirmBringDeletion() {
    if (!pendingBringDeletion) return;
    const contribution = pendingBringDeletion;
    const removed = await removeBringContribution(contribution);
    if (removed) {
      setPendingBringDeletion(null);
    }
  }

  function cancelBringDeletion() {
    if (!pendingBringDeletion) return;
    setFreeBringQuantityByContribution((current) => ({
      ...current,
      [pendingBringDeletion.id]: String(pendingBringDeletion.quantity),
    }));
    setPendingBringDeletion(null);
  }

  async function saveAttendance(statusOverride?: AttendanceStatus) {
    const statusToSave = statusOverride ?? attendanceStatus;
    if (!user || !selectedEventId || !statusToSave || savingAttendance) return;

    const parsedPartySize = Number.parseInt(attendancePartySize, 10);
    const normalizedPartySize = statusToSave === "not_going" ? 1 : parsedPartySize;

    if (
      statusToSave !== "not_going" &&
      (!Number.isInteger(normalizedPartySize) || normalizedPartySize < 1 || normalizedPartySize > 20)
    ) {
      setAttendanceMessageTone("error");
      setAttendanceMessage("מספר המשתתפים צריך להיות בין 1 ל־20.");
      return;
    }

    setSavingAttendance(true);
    setAttendanceMessage(null);

    const { error } = await supabase.rpc("save_event_attendance", {
      target_event_id: selectedEventId,
      target_status: statusToSave,
      target_party_size: normalizedPartySize,
      target_guest_names: statusToSave === "not_going" ? "" : attendanceGuestNames.trim(),
      target_note: attendanceNote.trim(),
    });

    if (error) {
      console.error("Saving event attendance failed", error);
      const previousAttendance = eventAttendance.find(
        (attendance) => attendance.user_id === user.id,
      );
      setAttendanceStatus(previousAttendance?.status ?? null);
      setAttendancePartySize(String(previousAttendance?.party_size ?? 1));
      setAttendanceGuestNames(previousAttendance?.guest_names ?? "");
      setAttendanceNote(previousAttendance?.note ?? "");
      setAttendanceMessageTone("error");
      setAttendanceMessage(
        error.message.includes("event_capacity_exceeded")
          ? "אין מספיק מקומות פנויים באירוע עבור מספר האנשים שבחרת."
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

  async function uploadGalleryMedia(file: File, mediaType: "image" | "video") {
    if (!selectedEvent || !selectedCommunity || !user) return;

    const imageCount = galleryPhotos.filter((item) => item.media_type === "image").length;
    const videoCount = galleryPhotos.filter((item) => item.media_type === "video").length;

    if (mediaType === "image" && imageCount >= MAX_GALLERY_IMAGES) {
      setMessageTone("error");
      setMessage(`אפשר להעלות עד ${MAX_GALLERY_IMAGES} תמונות לגלריה.`);
      return;
    }

    if (mediaType === "video" && videoCount >= 1) {
      setMessageTone("error");
      setMessage("אפשר להעלות סרטון אחד בלבד לגלריה.");
      return;
    }

    if (mediaType === "video" && file.size > MAX_GALLERY_VIDEO_BYTES) {
      setMessageTone("error");
      setMessage("אפשר להעלות סרטון בגודל של עד 20MB.");
      return;
    }

    setGalleryBusy(true);
    setMessage(null);
    let objectPath = "";

    try {
      const mediaId = crypto.randomUUID();
      let mediaBlob: Blob = file;
      let extension = "webp";
      let contentType = "image/webp";

      if (mediaType === "image") {
        const compressed = await compressImage(file);
        mediaBlob = compressed.blob;
        URL.revokeObjectURL(compressed.previewUrl);
      } else {
        const allowedVideoTypes = ["video/mp4", "video/webm", "video/quicktime"];
        if (!allowedVideoTypes.includes(file.type)) {
          throw new Error("unsupported_video_type");
        }
        contentType = file.type;
        extension = file.type === "video/webm" ? "webm" : file.type === "video/quicktime" ? "mov" : "mp4";
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

      await loadEventGallery(selectedEvent.id);
    } catch (error) {
      if (objectPath) {
        await supabase.storage.from("event-gallery").remove([objectPath]);
      }
      console.error("Uploading gallery media failed", error);
      setMessageTone("error");
      const formatted = formatSupabaseError(error);
      if (error instanceof Error && error.message === "unsupported_video_type") {
        setMessage("פורמט הסרטון אינו נתמך. אפשר להעלות MP4, MOV או WebM.");
      } else if (formatted.includes("gallery_image_limit_reached")) {
        setMessage(`אפשר להעלות עד ${MAX_GALLERY_IMAGES} תמונות לגלריה.`);
      } else if (formatted.includes("gallery_video_limit_reached")) {
        setMessage("אפשר להעלות סרטון אחד בלבד לגלריה.");
      } else {
        setMessage(`העלאת הקובץ לגלריה נכשלה. ${formatted}`);
      }
    }
    setGalleryBusy(false);
  }

  async function deleteGalleryPhoto(photo: EventGalleryPhoto) {
    const publicPathMarker = "/storage/v1/object/public/event-gallery/";
    const markerIndex = photo.image_url.indexOf(publicPathMarker);
    if (markerIndex >= 0) {
      const objectPath = decodeURIComponent(
        photo.image_url.slice(markerIndex + publicPathMarker.length),
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

  async function saveEvent() {
    if (!user || !selectedCommunity) return;

    const cleanTitle = eventTitle.trim();
    const cleanLocation = eventLocation.trim();
    const cleanDescription = eventDescription.trim();
    const startsAtDate = new Date(eventDateTime);
    const parsedParticipantLimit = Number.parseInt(eventParticipantLimit, 10);
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
            `${selectedCommunity.id}/${existingEvent.id}/cover.webp`,
            eventImage.blob,
          );
        } catch (error) {
          console.error("Event image upload failed", error);
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
            ? "אי אפשר להסיר שורה שכבר נבחרה על ידי משתתף. אפשר לשנות את שמה או את הכמות."
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
          `${selectedCommunity.id}/${eventId}/cover.webp`,
          eventImage.blob,
        );

        const { error: imageUpdateError } = await supabase
          .from("community_events")
          .update({ image_url: imageUrl })
          .eq("id", eventId);

        if (imageUpdateError) throw imageUpdateError;
      } catch (error) {
        console.error("Event image upload failed", error);
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
    if (!user || !legalConsentChecked) return;

    setLegalConsentSaving(true);
    setMessage(null);
    const acceptedAt = new Date().toISOString();
    const { data, error } = await supabase
      .from("profiles")
      .update({
        legal_accepted_at: acceptedAt,
        legal_version: LEGAL_VERSION,
      })
      .eq("id", user.id)
      .select("id,email,full_name,about,city,phone,avatar_url,google_avatar_url,legal_accepted_at,legal_version")
      .single<Profile>();

    if (error) {
      console.error("Saving legal acceptance failed", error);
      setMessageTone("error");
      setMessage(
        error.code === "42703"
          ? "יש להריץ את קובץ ה־SQL של circles74 ב־Supabase."
          : "לא הצלחנו לשמור את האישור. נסו שוב.",
      );
    } else {
      setProfile(data);
      setLegalConsentChecked(false);
      setLegalScreenOpen(false);
      setMessageTone("success");
      setMessage("האישור נשמר.");
    }

    setLegalConsentSaving(false);
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
      <LegalScreen
        checked={legalConsentChecked}
        onCheckedChange={updateLegalConsentChecked}
        onAccept={acceptLegalConsent}
        onBack={canCloseLegalScreen ? () => setLegalScreenOpen(false) : undefined}
        saving={legalConsentSaving}
        acceptanceRequired={acceptanceRequired}
        acceptButtonLabel={user ? "אישור והמשך" : "אישור וחזרה לכניסה"}
        acceptedAt={profile?.legal_accepted_at}
        message={message}
        messageTone={messageTone}
      />
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
  const selectedEvent = communityEvents.find((event) => event.id === selectedEventId) ?? null;
  const selectedEventDisplayImageUrl =
    selectedEvent?.image_url ?? selectedCommunity?.logo_url ?? null;
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
  const totalGoingPeople = goingAttendance.reduce(
    (total, attendance) => total + attendance.party_size,
    0,
  );
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
  const isSystemAdmin = isSystemAdminEmail(user.email);
  const canManageCommunityMembers = Boolean(
    selectedCommunity &&
      (isSystemAdmin || selectedCommunity.created_by === user.id),
  );
  const canRemoveCommunityMembers = canManageCommunityMembers;
  const canLeaveSelectedCommunity = Boolean(
    selectedCommunity &&
      selectedCommunity.role !== "owner" &&
      selectedCommunity.created_by !== user.id,
  );
  const canManageEvents = Boolean(
    selectedCommunity &&
      (isSystemAdmin || selectedCommunity.role === "owner" || selectedCommunity.role === "admin"),
  );
  const canDeleteAnyEventAttendance = Boolean(
    selectedEvent && (isSystemAdmin || canManageEvents),
  );
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
      canManageEvents &&
      new Date(selectedEvent.starts_at).getTime() <= Date.now() &&
      (!selectedEventIsCancelled || canDeleteAnyEventAttendance),
  );
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
          <button
            type="button"
            className="brand-button"
            onClick={() => {
              setProfileScreenOpen(false);
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
              className="icon-button"
              onClick={signOut}
              disabled={authBusy}
              aria-label="התנתקות"
              title="התנתקות"
            >
              ↪
            </button>
          </div>
        </header>

        {profileScreenOpen || communityFormOpen || eventFormOpen || selectedEvent || shareEvent ? null : selectedCommunity ? (
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
                <button
                  type="button"
                  className="secondary-button compact-button"
                  onClick={() => openShareScreen(selectedCommunity)}
                >
                  שיתוף
                </button>
                {canLeaveSelectedCommunity && (
                  <button
                    type="button"
                    className="leave-circle-button compact-button"
                    onClick={() =>
                      setPendingMemberAction({ type: "leave", community: selectedCommunity })
                    }
                  >
                    עזיבת המעגל
                  </button>
                )}
                {selectedCommunity.role !== "member" && (
                  <button
                    type="button"
                    className="primary-button compact-button"
                    onClick={() => openEditCommunity(selectedCommunity)}
                  >
                    עריכת המעגל
                  </button>
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

            {selectedCommunity.description ? (
              <RichText
                text={selectedCommunity.description}
                className="community-detail-description"
              />
            ) : (
              <p className="community-detail-description">
                עדיין לא נוסף תיאור למעגל.
              </p>
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
                      <ProfileAvatar
                        imageUrl={member.avatar_url ?? member.google_avatar_url}
                        name={member.full_name}
                        size="small"
                        onOpen={openImage}
                      />
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
                              {member.role === "admin" ? "הפיכה לחבר/ה" : "הפיכה למנהל/ת"}
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
                    </article>
                  ))}
                </div>
              )}

              {selectedCommunity.requires_member_approval &&
                (selectedCommunity.role === "owner" || selectedCommunity.role === "admin") && (
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
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}

            {message && <p className={`message-box ${messageTone}`}>{message}</p>}
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
                      ) : !hideCommunityPlaceholder(community) ? (
                        <span className="community-emblem" aria-hidden="true">
                          {community.name.trim().slice(0, 1)}
                        </span>
                      ) : null}
                      <span className="community-card-copy">
                        <strong>{community.name}</strong>
                        <span>
                          {community.description || "אין עדיין תיאור למעגל"}
                        </span>
                      </span>
                      <span className={`role-badge role-${community.role}`}>
                        {roleLabel(community.role)}
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
                      accept="image/*"
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
                      <small>קובץ תמונה עד 3MB. התמונה תכווץ לפני ההעלאה.</small>
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

              <section className="personal-dashboard-section">
                <div className="section-heading-compact">
                  <p className="section-kicker">הפעילות שלי</p>
                  <h2>המעגלים והאירועים שלי</h2>
                </div>
                {personalLoading ? (
                  <div className="inline-loading"><span className="spinner spinner-small" />טוענים...</div>
                ) : (
                  <div className="personal-dashboard-grid">
                    <div className="personal-dashboard-block">
                      <h3>המעגלים שלי</h3>
                      {communities.length === 0 ? (
                        <p>עדיין אין מעגלים.</p>
                      ) : (
                        <div className="personal-list">
                          {communities.map((community) => (
                            <button
                              type="button"
                              className="personal-list-item"
                              key={community.id}
                              onClick={() => {
                                setProfileScreenOpen(false);
                                setSelectedCommunityId(community.id);
                                setBrowserView({ circleToken: community.share_token });
                              }}
                            >
                              <strong>{community.name}</strong>
                              <span>{roleLabel(community.role)}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

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
                                <strong>{commitment.item_name} · {commitment.quantity}</strong>
                                <span>{commitment.event_title} {formatShortDate(commitment.starts_at)}</span>
                                {commitment.note && <small>{commitment.note}</small>}
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

      {pendingBringDeletion && (
        <div
          className="modal-backdrop confirmation-backdrop"
          role="presentation"
          onMouseDown={() => {
            if (!bringBusyKey) cancelBringDeletion();
          }}
        >
          <section
            className="confirmation-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="bring-deletion-title"
            aria-describedby="bring-deletion-message"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="confirmation-symbol confirmation-symbol-danger" aria-hidden="true">
              !
            </div>
            <h2 id="bring-deletion-title">מחיקת פריט</h2>
            <p id="bring-deletion-message">
              למחוק את „{pendingBringDeletion.item_name}” מרשימת מה שמביאים?
            </p>
            <div className="confirmation-actions">
              <button
                type="button"
                className="confirmation-no-button"
                onClick={cancelBringDeletion}
                disabled={Boolean(bringBusyKey)}
              >
                לא
              </button>
              <button
                type="button"
                className="confirmation-yes-button confirmation-danger-button"
                onClick={() => void confirmBringDeletion()}
                disabled={Boolean(bringBusyKey)}
              >
                {bringBusyKey ? "מוחקים..." : "כן, למחוק"}
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
                disabled={savingCommunity}
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
                  accept="image/*"
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
                <small>התמונה תכווץ לפני ההעלאה. גודל מקסימלי 3MB.</small>

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
                  accept="video/mp4,video/webm,video/quicktime,video/*"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) prepareCommunityVideo(file);
                  }}
                />
                <button
                  type="button"
                  className="primary-button upload-image-button"
                  onClick={() => communityVideoInputRef.current?.click()}
                >
                  {communityFormVideoUrl ? "החלפת סרטון" : "העלאת סרטון"}
                </button>
                <small>סרטון אחד בלבד. עד 50MB ובפורמט MP4 / MOV / WebM.</small>

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
                disabled={savingCommunity}
              >
                ביטול
              </button>
              <button
                type="button"
                className={`primary-button${communityFormIsDirty ? " save-button-dirty" : ""}`}
                onClick={() => void saveCommunity()}
                disabled={savingCommunity}
              >
                {savingCommunity
                  ? "שומרים..."
                  : editingCommunity
                    ? "שמירת המעגל"
                    : "יצירת המעגל"}
              </button>
            </div>

            {editingCommunity && (isSystemAdmin || editingCommunity.created_by === user.id) && (
              <div className="event-management-actions" aria-label="ניהול המעגל">
                <button
                  type="button"
                  className="danger-button"
                  onClick={() => setPendingMemberAction({ type: "delete_circle", community: editingCommunity })}
                  disabled={savingCommunity}
                >
                  מחיקת המעגל
                </button>
              </div>
            )}

            {message && <p className={`message-box ${messageTone}`}>{message}</p>}
          </section>
        </div>
      )}

      {!profileScreenOpen && !communityFormOpen && !eventFormOpen && !shareEvent && selectedEvent && selectedCommunity && (
        <div className="event-screen-backdrop">
          <section className={`event-detail-panel${selectedEventIsCancelled ? " event-is-cancelled" : ""}`} aria-labelledby="event-detail-title">
            <div className="event-detail-toolbar">
              <button type="button" className="back-button" onClick={closeEventDetails}>
                מעבר למעגל
              </button>
              <div className="event-detail-actions">
                <button
                  type="button"
                  className="secondary-button compact-button"
                  onClick={() => openEventShareScreen(selectedEvent)}
                >
                  שיתוף
                </button>
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
                <p className="section-kicker">תמונת מצב לכולם</p>
                <h2>סיכום השתתפות</h2>
              </div>
              <div className="attendance-summary-grid">
                <div className="attendance-summary-card">
                  <strong>{goingAttendance.length}</strong>
                  <span>אישרו הגעה</span>
                </div>
                <div className="attendance-summary-card">
                  <strong>{maybeAttendance.length}</strong>
                  <span>אולי</span>
                </div>
                <div className="attendance-summary-card">
                  <strong>{notGoingAttendance.length}</strong>
                  <span>לא מגיעים</span>
                </div>
                <div className="attendance-summary-card attendance-summary-total">
                  <strong>{totalGoingPeople}</strong>
                  <span>
                    {selectedEvent.participant_limit !== null
                      ? `סה"כ מגיעים מתוך ${selectedEvent.participant_limit}`
                      : 'סה"כ מגיעים'}
                  </span>
                </div>
              </div>
            </section>

            <section className="my-attendance-section">
              <div className="section-heading-compact">
                <p className="section-kicker">עדכון אישי</p>
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

              {attendanceStatus && attendanceStatus !== "not_going" && (
                <div className="attendance-form-grid">
                  <label>
                    <span>כמה אנשים מגיעים יחד איתך?</span>
                    <input
                      type="number"
                      min="1"
                      max="20"
                      value={attendancePartySize}
                      onChange={(event) => setAttendancePartySize(event.target.value)}
                      disabled={savingAttendance || eventLockedForCurrentUser}
                    />
                    <small>כולל אותך.</small>
                  </label>
                  <label>
                    <span>שמות האורחים</span>
                    <input
                      type="text"
                      value={attendanceGuestNames}
                      onChange={(event) => setAttendanceGuestNames(event.target.value)}
                      disabled={savingAttendance || eventLockedForCurrentUser}
                      maxLength={300}
                      placeholder="לא חובה"
                    />
                  </label>
                </div>
              )}

              {attendanceStatus && (
                <label className="attendance-note-field">
                  <span>הערה למארגנים</span>
                  <textarea
                    value={attendanceNote}
                    onChange={(event) => setAttendanceNote(event.target.value)}
                    disabled={savingAttendance || eventLockedForCurrentUser}
                    maxLength={600}
                    rows={3}
                    placeholder="לא חובה"
                  />
                </label>
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
                      <div className="bring-table" role="table" aria-label="מה מביאים לאירוע">
                        <div className="bring-table-header" role="row">
                          <span role="columnheader">פריט</span>
                          <span role="columnheader">מי מביא</span>
                          <span role="columnheader">כמות</span>
                          <span role="columnheader">הערה</span>
                        </div>

                        {bringDisplayRows.map((row) => {
                          if (row.kind === "need") {
                            const need = row.need;
                            const needContributions = eventBringContributions.filter(
                              (contribution) => contribution.need_id === need.id,
                            );
                            const committedQuantity = needContributions.reduce(
                              (total, contribution) => total + contribution.quantity,
                              0,
                            );
                            const ownContribution = needContributions.find(
                              (contribution) => contribution.user_id === user.id,
                            );

                            return (
                              <div className="bring-table-row" role="row" key={`need-${need.id}`}>
                                <div className="bring-table-item" role="cell">
                                  <span className="bring-mobile-label">פריט</span>
                                  <strong>{need.item_name}</strong>
                                  <small>
                                    צריך {need.quantity_needed} · התחייבו ל־{committedQuantity} · {committedQuantity >= need.quantity_needed
                                      ? "מסודר"
                                      : `חסרים ${need.quantity_needed - committedQuantity}`}
                                  </small>
                                </div>

                                <div className="bring-table-people" role="cell">
                                  <span className="bring-mobile-label">מי מביא</span>
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

                                <div className="bring-table-quantity" role="cell">
                                  <span className="bring-mobile-label">כמות</span>
                                  {needContributions.map((contribution) =>
                                    contribution.user_id === user.id ? (
                                      <input
                                        key={contribution.id}
                                        type="number"
                                        min="0"
                                        max="1000"
                                        value={bringQuantityByNeed[need.id] ?? String(contribution.quantity)}
                                        onChange={(event) =>
                                          scheduleNeedContributionSave(need, event.target.value)
                                        }
                                        disabled={eventLockedForCurrentUser}
                                        aria-label={`כמה ${need.item_name} אני מביא`}
                                      />
                                    ) : (
                                      <span className="bring-table-subrow bring-quantity-value" key={contribution.id}>
                                        {contribution.quantity}
                                      </span>
                                    ),
                                  )}
                                  {!ownContribution && (
                                    <input
                                      type="number"
                                      min="0"
                                      max="1000"
                                      value={bringQuantityByNeed[need.id] ?? "0"}
                                      onChange={(event) =>
                                        scheduleNeedContributionSave(need, event.target.value)
                                      }
                                      disabled={eventLockedForCurrentUser}
                                      aria-label={`כמה ${need.item_name} אני מביא`}
                                    />
                                  )}
                                </div>

                                <div className="bring-table-note" role="cell">
                                  <span className="bring-mobile-label">הערה</span>
                                  {needContributions.map((contribution) =>
                                    contribution.user_id === user.id ? (
                                      <input
                                        key={contribution.id}
                                        type="text"
                                        maxLength={300}
                                        value={
                                          bringNoteByContribution[contribution.id] ??
                                          contribution.note
                                        }
                                        onChange={(event) =>
                                          scheduleContributionNoteSave(
                                            contribution,
                                            event.target.value,
                                          )
                                        }
                                        disabled={eventLockedForCurrentUser}
                                        placeholder={`לדוגמה: ${need.item_name} פטריות בשמנת`}
                                      />
                                    ) : (
                                      <span className="bring-table-subrow bring-empty-cell" key={contribution.id}>
                                        {contribution.note || ""}
                                      </span>
                                    ),
                                  )}
                                </div>
                              </div>
                            );
                          }

                          const contribution = row.contribution;
                          return (
                            <div className="bring-table-row" role="row" key={`free-${contribution.id}`}>
                              <div className="bring-table-item" role="cell">
                                <span className="bring-mobile-label">פריט</span>
                                <strong>{contribution.item_name}</strong>
                                {selectedEvent.bring_mode === "planned" && <small>פריט שנוסף על ידי משתתף</small>}
                              </div>
                              <div className="bring-table-people" role="cell">
                                <span className="bring-mobile-label">מי מביא</span>
                                <span className="bring-person-line">
                                  <strong>{contribution.full_name}</strong>
                                  {contribution.note && <small>{contribution.note}</small>}
                                </span>
                              </div>
                              <div className="bring-table-quantity" role="cell">
                                <span className="bring-mobile-label">כמות</span>
                                {contribution.user_id === user.id ? (
                                  <input
                                    type="number"
                                    min="0"
                                    max="1000"
                                    value={
                                      freeBringQuantityByContribution[contribution.id] ??
                                      String(contribution.quantity)
                                    }
                                    onChange={(event) =>
                                      scheduleFreeContributionSave(contribution, event.target.value)
                                    }
                                    disabled={eventLockedForCurrentUser}
                                    aria-label={`כמות ${contribution.item_name}`}
                                  />
                                ) : (
                                  <strong>{contribution.quantity}</strong>
                                )}
                              </div>
                              <div className="bring-table-note" role="cell">
                                <span className="bring-mobile-label">הערה</span>
                                <span className="bring-empty-cell">{contribution.note || ""}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="attendance-empty-state">עדיין לא נוספו פריטים לרשימה.</p>
                    )}

                    {selectedEvent.bring_mode === "free" && (
                      <p className="bring-free-intro">הרשימה חופשית. כל משתתף יכול להוסיף מה הוא מביא.</p>
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
                          placeholder="לדוגמה: קינוח"
                        />
                      </label>
                      <label>
                        <span>כמות</span>
                        <input
                          type="number"
                          min="1"
                          max="1000"
                          value={bringItemQuantity}
                          onChange={(event) => setBringItemQuantity(event.target.value)}
                          placeholder="1"
                        />
                      </label>
                      <button
                        type="button"
                        className="primary-button compact-button free-bring-add-button"
                        onClick={tryAddFreeBringItem}
                        disabled={
                          bringBusyKey === "free-add" ||
                          !bringItemName.trim() ||
                          !Number.isInteger(Number.parseInt(bringItemQuantity, 10)) ||
                          Number.parseInt(bringItemQuantity, 10) < 1 ||
                          Number.parseInt(bringItemQuantity, 10) > 1000
                        }
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

            <section className="event-attendees-section">
              <div className="section-heading-compact">
                <p className="section-kicker">האנשים באירוע</p>
                <h2>מי משתתף?</h2>
              </div>

              {attendanceLoading ? (
                <div className="inline-loading">
                  <span className="spinner spinner-small" />
                  טוענים משתתפים...
                </div>
              ) : eventAttendance.length === 0 ? (
                <p className="attendance-empty-state">עדיין אין תשובות לאירוע.</p>
              ) : (
                <div className="attendance-groups">
                  {([
                    ["מגיעים", goingAttendance],
                    ["אולי", maybeAttendance],
                    ["לא מגיעים", notGoingAttendance],
                  ] as const).map(([title, rows]) =>
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
                                {attendance.status !== "not_going" && attendance.party_size > 1 && (
                                  <span>מגיעים {attendance.party_size} אנשים</span>
                                )}
                                {attendance.guest_names && (
                                  <p><b>פרטי האורחים:</b> {attendance.guest_names}</p>
                                )}
                                {attendance.note && (
                                  <p><b>הערה:</b> {attendance.note}</p>
                                )}
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

            <section className="event-gallery-section">
              <div className="section-heading-compact gallery-heading">
                <div>
                  <p className="section-kicker">זיכרונות מהאירוע</p>
                  <h2>גלריית האירוע</h2>
                  <small>{galleryImageCount}/{MAX_GALLERY_IMAGES} תמונות · {galleryVideoCount}/1 סרטון</small>
                </div>
                {galleryCanUpload && (
                  <div className="gallery-upload-actions">
                    <input
                      ref={galleryImageInputRef}
                      className="hidden-file-input"
                      type="file"
                      accept="image/*"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = "";
                        if (file) void uploadGalleryMedia(file, "image");
                      }}
                    />
                    <input
                      ref={galleryVideoInputRef}
                      className="hidden-file-input"
                      type="file"
                      accept="video/mp4,video/webm,video/quicktime"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = "";
                        if (file) void uploadGalleryMedia(file, "video");
                      }}
                    />
                    <button
                      type="button"
                      className="primary-button compact-button"
                      disabled={galleryBusy || galleryImageCount >= MAX_GALLERY_IMAGES}
                      onClick={() => galleryImageInputRef.current?.click()}
                    >
                      הוספת תמונה
                    </button>
                    <button
                      type="button"
                      className="secondary-button compact-button gallery-video-button"
                      disabled={galleryBusy || galleryVideoCount >= 1}
                      title={galleryVideoCount >= 1 ? "כבר קיים סרטון אחד בגלריה" : "הוספת סרטון"}
                      onClick={() => galleryVideoInputRef.current?.click()}
                    >
                      הוספת סרטון
                    </button>
                  </div>
                )}
              </div>
              {!galleryCanUpload && (
                <p className="gallery-locked-note">
                  רק מנהלי/ות המעגל יכולים להוסיף תמונות וסרטון לאחר שהאירוע התחיל.
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
                        <span>{photo.full_name}</span>
                        {canDeleteAnyEventAttendance && (
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
                  accept="image/*"
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
                          placeholder="לדוגמה: פסטה או שלישיית משקאות"
                        />
                      </label>
                      <label>
                        <span>כמה?</span>
                        <input
                          type="number"
                          min="1"
                          max="1000"
                          value={eventBringNeedQuantity}
                          onChange={(event) => setEventBringNeedQuantity(event.target.value)}
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
                            <span><strong>{draft.item_name}</strong> · כמות {draft.quantity_needed}</span>
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
                ביטול
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
