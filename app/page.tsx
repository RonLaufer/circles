"use client";
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
};

type CommunityRole = "owner" | "admin" | "member";

const APP_VERSION = "v1.0.3.2";
const SOFTWARE_ICON_IMAGE = "/circles-logo.png";
const SYSTEM_ADMIN_EMAIL = "laufer.ron@gmail.com";
const PRODUCTION_ORIGIN = "https://circles-community.vercel.app";
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const MAX_IMAGE_EDGE = 1800;

type SelectedImage = {
  blob: Blob;
  previewUrl: string;
};

type Community = {
  id: string;
  name: string;
  description: string;
  logo_url: string | null;
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
  created_at: string;
  full_name: string;
  avatar_url: string | null;
  google_avatar_url: string | null;
};

type PendingMemberAction =
  | { type: "remove"; member: CommunityMember }
  | { type: "role"; member: CommunityMember; nextRole: "admin" | "member" }
  | { type: "leave"; community: Community };

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

function CirclesMark() {
  return (
    <img
      src={SOFTWARE_ICON_IMAGE}
      alt="לוגו מעגלים"
      className="brand-logo-image"
    />
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

function roleLabel(role: CommunityRole) {
  if (role === "owner") return "בעלים";
  if (role === "admin") return "מנהל";
  return "חבר";
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
  const eventImageInputRef = useRef<HTMLInputElement | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [fullName, setFullName] = useState("");
  const [about, setAbout] = useState("");
  const [city, setCity] = useState("");
  const [phone, setPhone] = useState("");
  const [communities, setCommunities] = useState<Community[]>([]);
  const [selectedCommunityId, setSelectedCommunityId] = useState<string | null>(null);
  const [communityFormOpen, setCommunityFormOpen] = useState(false);
  const [editingCommunityId, setEditingCommunityId] = useState<string | null>(null);
  const [communityName, setCommunityName] = useState("");
  const [communityDescription, setCommunityDescription] = useState("");
  const [communityRequiresApproval, setCommunityRequiresApproval] = useState(true);
  const [profileImage, setProfileImage] = useState<SelectedImage | null>(null);
  const [communityImage, setCommunityImage] = useState<SelectedImage | null>(null);
  const [lightbox, setLightbox] = useState<{ url: string; alt: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [communitiesLoading, setCommunitiesLoading] = useState(false);
  const [communitiesReady, setCommunitiesReady] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
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

  const clearSelectedImage = useCallback((image: SelectedImage | null) => {
    if (image?.previewUrl) URL.revokeObjectURL(image.previewUrl);
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
        .select("id,name,description,logo_url,requires_member_approval,created_by,created_at,updated_at,share_token")
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

      setCommunityMembers(
        (membershipRows ?? []).map((membership) => {
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
        }),
      );

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
          "id,community_id,title,description,location,starts_at,ends_at,image_url,participant_limit,bring_mode,share_token,created_by,created_at,updated_at",
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
            .select("id,full_name,avatar_url,google_avatar_url")
            .in("id", userIds)
        : { data: [], error: null };

      if (profilesError) {
        console.error("Loading attendee profiles failed", profilesError);
      }

      const profilesById = new Map(
        (profileRows ?? []).map((attendeeProfile) => [attendeeProfile.id, attendeeProfile]),
      );

      const mappedAttendance = (attendanceRows ?? []).map((attendance) => {
        const attendeeProfile = profilesById.get(attendance.user_id);
        return {
          ...attendance,
          status: attendance.status as AttendanceStatus,
          full_name: attendeeProfile?.full_name || "משתמש",
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
    [supabase, user],
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
        .select("id,event_id,need_id,user_id,item_name,quantity,created_at")
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
      setBringQuantityByNeed(
        Object.fromEntries(
          (needRows ?? []).map((need) => {
            const ownContribution = mappedContributions.find(
              (contribution) => contribution.need_id === need.id && contribution.user_id === user?.id,
            );
            return [need.id, String(ownContribution?.quantity ?? 1)];
          }),
        ),
      );
      setBringLoading(false);
    },
    [supabase, user],
  );

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

  const loadProfile = useCallback(
    async (currentUser: User) => {
      setProfileLoading(true);
      setMessage(null);

      const googleProfile = getGoogleProfile(currentUser);
      const { data, error } = await supabase
        .from("profiles")
        .select("id,email,full_name,about,city,phone,avatar_url,google_avatar_url")
        .eq("id", currentUser.id)
        .maybeSingle<Profile>();

      if (error) {
        setMessageTone("error");
        setMessage(
          error.code === "42P01"
            ? "יש להריץ תחילה את קובץ ה־SQL של circles3 ב־Supabase."
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
          .select("id,email,full_name,about,city,phone,avatar_url,google_avatar_url")
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
          .select("id,email,full_name,about,city,phone,avatar_url,google_avatar_url")
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
    document.title = selected?.name ?? "מעגלים";
  }, [communities, selectedCommunityId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const joinToken = params.get("join");
    const eventToken = params.get("event");
    const authError = params.get("auth_error");
    const shouldAutoJoin = params.get("autojoin") === "1";

    if (eventToken) {
      setPendingEventShareToken(eventToken);
      setAutoJoinAfterAuth(shouldAutoJoin);
      void loadSharedEvent(eventToken);
    } else if (joinToken) {
      setPendingShareToken(joinToken);
      setAutoJoinAfterAuth(shouldAutoJoin);
      void loadSharedInvite(joinToken);
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
      setBringItemName("");
      setBringItemQuantity("1");
      setBringMessage(null);
      return;
    }

    const eventExists = communityEvents.some((event) => event.id === selectedEventId);
    if (eventExists) {
      void Promise.all([
        loadEventAttendance(selectedEventId),
        loadEventBringData(selectedEventId),
      ]);
    }
  }, [communityEvents, loadEventAttendance, loadEventBringData, selectedEventId]);

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
      window.history.replaceState({}, "", window.location.pathname);
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

    setAuthBusy(false);
  }

  function openImage(url: string, alt: string) {
    setLightbox({ url, alt });
  }

  function clearJoinFromAddress() {
    window.history.replaceState({}, "", window.location.pathname);
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
      clearJoinFromAddress();
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
    clearJoinFromAddress();
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

    const isSystemAdmin = user.email?.trim().toLowerCase() === SYSTEM_ADMIN_EMAIL;
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
      .select("id,email,full_name,about,city,phone,avatar_url,google_avatar_url")
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

      const { data, error } = await supabase
        .from("communities")
        .update({
          name: cleanName,
          description: cleanDescription,
          logo_url: logoUrl,
          requires_member_approval: communityRequiresApproval,
        })
        .eq("id", existingCommunity.id)
        .select(
          "id,name,description,logo_url,requires_member_approval,created_by,created_at,updated_at,share_token",
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
    let imageUploadFailed = false;

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

    const { data, error: readError } = await supabase
      .from("communities")
      .select(
        "id,name,description,logo_url,requires_member_approval,created_by,created_at,updated_at,share_token",
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
    setMessageTone(imageUploadFailed ? "error" : "success");
    setMessage(
      imageUploadFailed
        ? `המעגל „${createdCommunity.name}” נוצר, אך העלאת התמונה לא הצליחה.`
        : `המעגל „${createdCommunity.name}” נוצר בהצלחה.`,
    );
    setSelectedCommunityId(createdCommunity.id);
    setSavingCommunity(false);
  }

  function openCreateEvent() {
    setEditingEventId(null);
    setEventTitle("");
    setEventDateTime("");
    setEventEndDateTime("");
    setEventBringMode("free");
    setEventBringNeedDrafts([]);
    setEventBringNeedName("");
    setEventBringNeedQuantity("1");
    setCopyNeedsFromEventId("");
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

  function openEventDetails(event: CommunityEvent) {
    setSelectedEventId(event.id);
    setAttendanceMessage(null);
    setBringMessage(null);
    setMessage(null);
  }

  function closeEventDetails() {
    if (savingAttendance || bringBusyKey) return;
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

  async function saveNeedContribution(need: EventBringNeed) {
    if (!user || !selectedEventId) return;
    const quantity = Number.parseInt(bringQuantityByNeed[need.id] ?? "1", 10);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1000) {
      setBringMessageTone("error");
      setBringMessage("הכמות צריכה להיות בין 1 ל־1,000.");
      return;
    }

    setBringBusyKey(`need-${need.id}`);
    setBringMessage(null);
    const existing = eventBringContributions.find(
      (contribution) => contribution.need_id === need.id && contribution.user_id === user.id,
    );
    const operation = existing
      ? supabase
          .from("event_bring_contributions")
          .update({ quantity, item_name: need.item_name })
          .eq("id", existing.id)
      : supabase.from("event_bring_contributions").insert({
          event_id: selectedEventId,
          need_id: need.id,
          user_id: user.id,
          item_name: need.item_name,
          quantity,
        });
    const { error } = await operation;

    if (error) {
      setBringMessageTone("error");
      setBringMessage(`שמירת הפריט לא הצליחה. ${formatSupabaseError(error)}`);
    } else {
      await loadEventBringData(selectedEventId);
      setBringMessageTone("success");
      setBringMessage("הפריט נשמר ברשימה.");
    }
    setBringBusyKey(null);
  }

  async function removeBringContribution(contribution: EventBringContribution) {
    if (!selectedEventId) return;
    setBringBusyKey(`contribution-${contribution.id}`);
    const { error } = await supabase
      .from("event_bring_contributions")
      .delete()
      .eq("id", contribution.id);
    if (error) {
      setBringMessageTone("error");
      setBringMessage(`הסרת הפריט לא הצליחה. ${formatSupabaseError(error)}`);
    } else {
      await loadEventBringData(selectedEventId);
      setBringMessageTone("success");
      setBringMessage("הפריט הוסר מהרשימה.");
    }
    setBringBusyKey(null);
  }

  async function addFreeBringContribution() {
    if (!user || !selectedEventId) return;
    const itemName = bringItemName.trim();
    const quantity = Number.parseInt(bringItemQuantity, 10);
    if (!itemName || !Number.isInteger(quantity) || quantity < 1 || quantity > 1000) {
      setBringMessageTone("error");
      setBringMessage("יש להזין מה מביאים וכמות בין 1 ל־1,000.");
      return;
    }

    setBringBusyKey("free-add");
    const { error } = await supabase.from("event_bring_contributions").insert({
      event_id: selectedEventId,
      need_id: null,
      user_id: user.id,
      item_name: itemName,
      quantity,
    });
    if (error) {
      setBringMessageTone("error");
      setBringMessage(`הוספת הפריט לא הצליחה. ${formatSupabaseError(error)}`);
    } else {
      setBringItemName("");
      setBringItemQuantity("1");
      await loadEventBringData(selectedEventId);
      setBringMessageTone("success");
      setBringMessage("הפריט נוסף לרשימה.");
    }
    setBringBusyKey(null);
  }

  async function saveAttendance() {
    if (!user || !selectedEventId || !attendanceStatus) {
      setAttendanceMessageTone("error");
      setAttendanceMessage("יש לבחור מגיע/ה, אולי או לא מגיע/ה.");
      return;
    }

    const parsedPartySize = Number.parseInt(attendancePartySize, 10);
    const normalizedPartySize = attendanceStatus === "not_going" ? 1 : parsedPartySize;

    if (
      attendanceStatus !== "not_going" &&
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
      target_status: attendanceStatus,
      target_party_size: normalizedPartySize,
      target_guest_names: attendanceStatus === "not_going" ? "" : attendanceGuestNames.trim(),
      target_note: attendanceNote.trim(),
    });

    if (error) {
      console.error("Saving event attendance failed", error);
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
    setAttendanceMessageTone("success");
    setAttendanceMessage("ההשתתפות שלך נשמרה.");
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

  if (loading) {
    return (
      <main className="centered-page">
        <div className="loading-panel">
          <span className="spinner" />
          <p>טוענים את המעגל שלך...</p>
        </div>
      </main>
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
  const editingEvent = communityEvents.find((event) => event.id === editingEventId) ?? null;
  const selectedEvent = communityEvents.find((event) => event.id === selectedEventId) ?? null;
  const eventFormImageUrl = eventImage?.previewUrl ?? editingEvent?.image_url ?? null;
  const ownEventAttendance = eventAttendance.find((attendance) => attendance.user_id === user.id) ?? null;
  const goingAttendance = eventAttendance.filter((attendance) => attendance.status === "going");
  const maybeAttendance = eventAttendance.filter((attendance) => attendance.status === "maybe");
  const notGoingAttendance = eventAttendance.filter((attendance) => attendance.status === "not_going");
  const totalGoingPeople = goingAttendance.reduce(
    (total, attendance) => total + attendance.party_size,
    0,
  );
  const attendanceFormIsDirty = Boolean(
    attendanceStatus &&
      (attendanceStatus !== ownEventAttendance?.status ||
        (attendanceStatus !== "not_going" &&
          Number.parseInt(attendancePartySize || "0", 10) !== (ownEventAttendance?.party_size ?? 1)) ||
        attendanceGuestNames !== (ownEventAttendance?.guest_names ?? "") ||
        attendanceNote !== (ownEventAttendance?.note ?? "")),
  );
  const freeBringContributions = eventBringContributions.filter(
    (contribution) => contribution.need_id === null,
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
  const ownerMember = communityMembers.find((member) => member.role === "owner") ?? null;
  const invitedMembership = invitedCommunity
    ? communities.find((community) => community.id === invitedCommunity.id) ?? null
    : null;
  const isSystemAdmin = user.email?.trim().toLowerCase() === SYSTEM_ADMIN_EMAIL;
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
      (selectedCommunity.role === "owner" || selectedCommunity.role === "admin"),
  );
  const shareUrl = shareCommunity
    ? getCommunityShareUrl(shareCommunity.share_token)
    : "";
  const shareText = shareCommunity
    ? getCommunityShareText(shareCommunity, shareUrl)
    : "";
  const eventShareUrl = shareEvent ? getEventShareUrl(shareEvent.share_token) : "";
  const eventShareText = shareEvent ? getEventShareText(shareEvent, eventShareUrl) : "";
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
        communityImage),
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
        eventImage,
  );
  const memberActionDialog = pendingMemberAction
    ? pendingMemberAction.type === "remove"
      ? {
          title: "הסרת חבר מהמעגל",
          message: `להסיר את ${pendingMemberAction.member.full_name} מהמעגל? החברות שלו במעגל תימחק ממסד הנתונים.`,
          confirmLabel: "כן, להסיר",
          tone: "danger" as const,
        }
      : pendingMemberAction.type === "role"
        ? {
            title:
              pendingMemberAction.nextRole === "admin"
                ? "הפיכה למנהל מעגל"
                : "החזרה לחבר רגיל",
            message:
              pendingMemberAction.nextRole === "admin"
                ? `${pendingMemberAction.member.full_name} יוכל לערוך את המעגל ולאשר בקשות הצטרפות.`
                : `${pendingMemberAction.member.full_name} לא יוכל עוד לנהל את המעגל.`,
            confirmLabel: "כן, לשנות",
            tone: "standard" as const,
          }
        : {
            title: "עזיבת המעגל",
            message: `לעזוב את המעגל „${pendingMemberAction.community.name}”? החברות שלך במעגל תימחק ממסד הנתונים.`,
            confirmLabel: "כן, לעזוב",
            tone: "danger" as const,
          }
    : null;

  return (
    <main className="app-page">
      <div className="app-container">
        <header className="app-header">
          <button
            type="button"
            className="brand-button"
            onClick={() => setSelectedCommunityId(null)}
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

        {selectedCommunity ? (
          <section className="community-detail-card">
            <div className="community-detail-toolbar">
              <button
                type="button"
                className="back-button"
                onClick={() => setSelectedCommunityId(null)}
              >
                חזרה למעגלים שלי
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
                <p className="section-kicker">המעגל שלי</p>
                <h1>{selectedCommunity.name}</h1>
                <span className={`role-badge role-${selectedCommunity.role}`}>
                  {roleLabel(selectedCommunity.role)}
                </span>
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

            <div className="approval-summary">
              <span aria-hidden="true">✓</span>
              <div>
                <strong>הצטרפות למעגל</strong>
                <p>
                  {selectedCommunity.requires_member_approval
                    ? "כל משתמש חדש יצטרך אישור של מנהל המעגל."
                    : "משתמשים יוכלו להצטרף ללא אישור מוקדם."}
                </p>
              </div>
            </div>

            {ownerMember && (
              <div className="owner-card">
                <ProfileAvatar
                  imageUrl={ownerMember.avatar_url ?? ownerMember.google_avatar_url}
                  name={ownerMember.full_name}
                  size="small"
                  onOpen={openImage}
                />
                <div>
                  <span>בעל המעגל</span>
                  <strong>{ownerMember.full_name}</strong>
                  {ownerMember.city && <span className="member-city">{ownerMember.city}</span>}
                  {ownerMember.phone && <PhoneLink phone={ownerMember.phone} />}
                </div>
              </div>
            )}

            <section className="circle-people-section">
              <div className="circle-people-heading">
                <div>
                  <p className="section-kicker">אנשי המעגל</p>
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
                        <span className="member-joined-at">הצטרף/ה למעגל: {formatShortDateTime(member.joined_at)}</span>
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
                              {member.role === "admin" ? "הפיכה לחבר" : "הפיכה למנהל"}
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

            <section className="circle-events-section">
              <div className="circle-events-heading">
                <div>
                  <p className="section-kicker">נפגשים יחד</p>
                  <h2>האירועים של המעגל</h2>
                </div>
                {canManageEvents && (
                  <button type="button" className="primary-button compact-button" onClick={openCreateEvent}>
                    יצירת אירוע
                  </button>
                )}
              </div>

              {eventsLoading ? (
                <div className="inline-loading events-loading">
                  <span className="spinner spinner-small" />
                  טוענים אירועים...
                </div>
              ) : communityEvents.length === 0 ? (
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
                <div className="events-groups">
                  {upcomingEvents.length > 0 && (
                    <div className="events-group">
                      <h3>אירועים קרובים</h3>
                      <div className="events-list">
                        {upcomingEvents.map((event) => (
                          <article
                            className={`circle-event-card event-card-clickable${event.image_url ? "" : " circle-event-card-no-image"}`}
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
                              <h4>{event.title}</h4>
                              <time dateTime={event.starts_at}>{formatEventDate(event.starts_at, event.ends_at)}</time>
                              {event.location && <span className="event-location">{event.location}</span>}
                              {event.participant_limit !== null && (
                                <span className="event-capacity-label">עד {event.participant_limit} משתתפים</span>
                              )}
                              {event.description && (
                                <RichText text={event.description} className="event-description" />
                              )}
                            </div>
                            {canManageEvents && (
                              <button
                                type="button"
                                className="secondary-button compact-button event-edit-button"
                                onClick={(clickEvent) => {
                                  clickEvent.stopPropagation();
                                  openEditEvent(event);
                                }}
                              >
                                עריכת האירוע
                              </button>
                            )}
                          </article>
                        ))}
                      </div>
                    </div>
                  )}

                  {pastEvents.length > 0 && (
                    <div className="events-group past-events-group">
                      <h3>אירועים שהסתיימו</h3>
                      <div className="events-list">
                        {pastEvents.map((event) => (
                          <article
                            className={`circle-event-card event-card-clickable past-event-card${event.image_url ? "" : " circle-event-card-no-image"}`}
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
                              <h4>{event.title}</h4>
                              <time dateTime={event.starts_at}>{formatEventDate(event.starts_at, event.ends_at)}</time>
                              {event.location && <span className="event-location">{event.location}</span>}
                              {event.participant_limit !== null && (
                                <span className="event-capacity-label">עד {event.participant_limit} משתתפים</span>
                              )}
                              {event.description && (
                                <RichText text={event.description} className="event-description" />
                              )}
                            </div>
                            {canManageEvents && (
                              <button
                                type="button"
                                className="secondary-button compact-button event-edit-button"
                                onClick={(clickEvent) => {
                                  clickEvent.stopPropagation();
                                  openEditEvent(event);
                                }}
                              >
                                עריכת האירוע
                              </button>
                            )}
                          </article>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>

            {message && <p className={`message-box ${messageTone}`}>{message}</p>}
          </section>
        ) : (
          <>
            <section className="communities-card">
              <div className="communities-heading">
                <div>
                  <p className="section-kicker">המעגלים שלי</p>
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
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setMessage(null);
                          setSelectedCommunityId(community.id);
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

            <section className="profile-card">
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
            </section>
          </>
        )}

      </div>

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
                    <p>בעל המעגל או אחד המנהלים יוכלו לאשר אותה.</p>
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
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setShareEvent(null)}
        >
          <section
            className="modal-card share-modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="share-event-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="modal-close"
              onClick={() => setShareEvent(null)}
              aria-label="סגירה"
            >
              ×
            </button>

            {shareEvent.image_url && (
              <button
                type="button"
                className="image-zoom-button share-preview-image-button"
                onClick={() => openImage(shareEvent.image_url!, `תמונת האירוע ${shareEvent.title}`)}
              >
                <img
                  className="share-preview-image"
                  src={shareEvent.image_url}
                  alt={`תמונת האירוע ${shareEvent.title}`}
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

            <p className="share-preview-note">
              בשיתוף הקישור יוצגו שם האירוע, התיאור, הזמן, המיקום ותמונת האירוע.
            </p>
          </section>
        </div>
      )}

      {communityFormOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={closeCommunityForm}>
          <section
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="community-form-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="modal-close"
              onClick={closeCommunityForm}
              disabled={savingCommunity}
              aria-label="סגירה"
            >
              ×
            </button>

            <p className="section-kicker">{editingCommunity ? "עריכת מעגל" : "מעגל חדש"}</p>
            <h2 id="community-form-title">
              {editingCommunity ? "עריכת המעגל" : "יצירת מעגל"}
            </h2>
            <p className="modal-intro">
              {editingCommunity
                ? "אפשר לעדכן את אותם הפרטים שהוגדרו בעת יצירת המעגל."
                : "לאחר השמירה תוגדרו אוטומטית כבעלי המעגל."}
            </p>

            <div className="profile-form modal-form">
              <div className="image-upload-field">
                <span className="field-label">תמונת המעגל</span>
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
                  {communityFormImageUrl ? "החלפת תמונה" : "צירוף תמונה"}
                </button>
                <small>התמונה אינה חייבת להיות ריבועית. עד 3MB.</small>

                {communityFormImageUrl && (
                  <button
                    type="button"
                    className="image-zoom-button selected-community-image-button"
                    onClick={() => openImage(communityFormImageUrl, "תמונת המעגל")}
                    aria-label="הגדלת תמונת המעגל"
                  >
                    <img
                      className="selected-community-image"
                      src={communityFormImageUrl}
                      alt="תמונת המעגל"
                    />
                  </button>
                )}
              </div>

              <label>
                <span>שם המעגל</span>
                <input
                  type="text"
                  value={communityName}
                  onChange={(event) => setCommunityName(event.target.value)}
                  maxLength={120}
                  autoFocus
                  placeholder="לדוגמה: החברים מהשכונה"
                />
              </label>

              <label>
                <span>תיאור קצר</span>
                <textarea
                  value={communityDescription}
                  onChange={(event) => setCommunityDescription(event.target.value)}
                  maxLength={600}
                  rows={4}
                  placeholder="כמה מילים על המעגל..."
                />
                <small>{communityDescription.length} / 600</small>
              </label>

              <div className="approval-setting">
                <span className="field-label">האם כל משתמש חדש צריך אישור?</span>
                <div className="approval-choice-group" role="group" aria-label="אישור משתמשים חדשים">
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
                <small>כאשר נדרש אישור, בעלים ומנהלים יוכלו לאשר או לדחות בקשות הצטרפות.</small>
              </div>
            </div>

            <div className="modal-actions">
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
                onClick={saveCommunity}
                disabled={savingCommunity}
              >
                {savingCommunity
                  ? "שומרים..."
                  : editingCommunity
                    ? "שמירת המעגל"
                    : "יצירת המעגל"}
              </button>
            </div>

            {message && <p className={`message-box ${messageTone}`}>{message}</p>}
          </section>
        </div>
      )}

      {selectedEvent && selectedCommunity && (
        <div className="event-screen-backdrop" role="presentation">
          <section className="event-detail-panel" aria-labelledby="event-detail-title">
            <div className="event-detail-toolbar">
              <button type="button" className="back-button" onClick={closeEventDetails}>
                חזרה לאירועים
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
                  <button
                    type="button"
                    className="primary-button compact-button"
                    onClick={() => openEditEvent(selectedEvent)}
                  >
                    עריכת האירוע
                  </button>
                )}
              </div>
            </div>

            {selectedEvent.image_url && (
              <button
                type="button"
                className="image-zoom-button event-detail-image-button"
                onClick={() => openImage(selectedEvent.image_url!, `תמונת האירוע ${selectedEvent.title}`)}
              >
                <img
                  className="event-detail-image"
                  src={selectedEvent.image_url}
                  alt={`תמונת האירוע ${selectedEvent.title}`}
                />
              </button>
            )}

            <header className="event-detail-heading">
              <p className="section-kicker">אירוע במעגל {selectedCommunity.name}</p>
              <h1 id="event-detail-title">{selectedEvent.title}</h1>
              <time dateTime={selectedEvent.starts_at}>{formatEventDate(selectedEvent.starts_at, selectedEvent.ends_at)}</time>
              {selectedEvent.location && <span className="event-detail-location">{selectedEvent.location}</span>}
              {selectedEvent.participant_limit !== null && (
                <span className="event-detail-capacity">האירוע מוגבל ל־{selectedEvent.participant_limit} משתתפים</span>
              )}
            </header>

            {selectedEvent.description && (
              <RichText text={selectedEvent.description} className="event-detail-description" />
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
                      ? `סה״כ מגיעים מתוך ${selectedEvent.participant_limit}`
                      : "סה״כ אנשים שמגיעים"}
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
                >
                  מגיע/ה
                </button>
                <button
                  type="button"
                  className={`attendance-status-button${attendanceStatus === "maybe" ? " is-selected" : ""}`}
                  onClick={() => setAttendanceStatus("maybe")}
                >
                  אולי
                </button>
                <button
                  type="button"
                  className={`attendance-status-button${attendanceStatus === "not_going" ? " is-selected" : ""}`}
                  onClick={() => setAttendanceStatus("not_going")}
                >
                  לא מגיע/ה
                </button>
              </div>

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
                    />
                    <small>כולל אותך.</small>
                  </label>
                  <label>
                    <span>שמות האורחים</span>
                    <input
                      type="text"
                      value={attendanceGuestNames}
                      onChange={(event) => setAttendanceGuestNames(event.target.value)}
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
                    maxLength={600}
                    rows={3}
                    placeholder="לא חובה"
                  />
                </label>
              )}

              <button
                type="button"
                className={`primary-button attendance-save-button${attendanceFormIsDirty ? " save-button-dirty" : ""}`}
                onClick={() => void saveAttendance()}
                disabled={savingAttendance || !attendanceStatus}
              >
                {savingAttendance ? "שומרים..." : ownEventAttendance ? "עדכון ההשתתפות" : "שמירת ההשתתפות"}
              </button>

              {attendanceMessage && (
                <p className={`message-box ${attendanceMessageTone}`}>{attendanceMessage}</p>
              )}
            </section>

            <section className="event-bring-section">
              <div className="section-heading-compact">
                <p className="section-kicker">מתארגנים יחד</p>
                <h2>מה כל אחד מביא?</h2>
              </div>

              {bringLoading ? (
                <div className="inline-loading bring-loading">
                  <span className="spinner spinner-small" />
                  טוענים את הרשימה...
                </div>
              ) : (
                <>
                  {selectedEvent.bring_mode === "planned" && (
                    <div className="planned-bring-list">
                      {eventBringNeeds.length === 0 ? (
                        <p className="attendance-empty-state">מנהלי האירוע עדיין לא הגדירו מה צריך.</p>
                      ) : (
                        eventBringNeeds.map((need) => {
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
                            <article className="bring-need-card" key={need.id}>
                              <div className="bring-need-heading">
                                <div>
                                  <strong>{need.item_name}</strong>
                                  <span>צריך {need.quantity_needed} · התחייבו ל־{committedQuantity}</span>
                                </div>
                                <span className={committedQuantity >= need.quantity_needed ? "bring-complete" : "bring-missing"}>
                                  {committedQuantity >= need.quantity_needed
                                    ? "מסודר"
                                    : `חסרים ${need.quantity_needed - committedQuantity}`}
                                </span>
                              </div>

                              {needContributions.length > 0 && (
                                <div className="bring-contributors-list">
                                  {needContributions.map((contribution) => (
                                    <span key={contribution.id}>
                                      {contribution.full_name} ({contribution.quantity})
                                    </span>
                                  ))}
                                </div>
                              )}

                              <div className="bring-claim-row">
                                <label>
                                  <span>כמה אני מביא/ה?</span>
                                  <input
                                    type="number"
                                    min="1"
                                    max="1000"
                                    value={bringQuantityByNeed[need.id] ?? "1"}
                                    onChange={(event) =>
                                      setBringQuantityByNeed((current) => ({
                                        ...current,
                                        [need.id]: event.target.value,
                                      }))
                                    }
                                  />
                                </label>
                                <button
                                  type="button"
                                  className="primary-button compact-button"
                                  onClick={() => void saveNeedContribution(need)}
                                  disabled={bringBusyKey === `need-${need.id}`}
                                >
                                  {ownContribution ? "עדכון" : "אני מביא/ה"}
                                </button>
                                {ownContribution && (
                                  <button
                                    type="button"
                                    className="secondary-button compact-button"
                                    onClick={() => void removeBringContribution(ownContribution)}
                                    disabled={bringBusyKey === `contribution-${ownContribution.id}`}
                                  >
                                    ביטול
                                  </button>
                                )}
                              </div>
                            </article>
                          );
                        })
                      )}
                    </div>
                  )}

                  <div className="free-bring-area">
                    <h3>{selectedEvent.bring_mode === "planned" ? "דברים נוספים" : "רשימת מה שמביאים"}</h3>
                    {selectedEvent.bring_mode === "free" && (
                      <p>הרשימה חופשית. כל משתתף יכול להוסיף מה הוא מביא.</p>
                    )}

                    {freeBringContributions.length > 0 && (
                      <div className="free-bring-list">
                        {freeBringContributions.map((contribution) => (
                          <article className="free-bring-row" key={contribution.id}>
                            <ProfileAvatar
                              imageUrl={contribution.avatar_url ?? contribution.google_avatar_url}
                              name={contribution.full_name}
                              size="small"
                              onOpen={openImage}
                            />
                            <div>
                              <strong>{contribution.item_name}</strong>
                              <span>{contribution.full_name} · כמות {contribution.quantity}</span>
                            </div>
                            {contribution.user_id === user.id && (
                              <button
                                type="button"
                                className="member-remove-button"
                                onClick={() => void removeBringContribution(contribution)}
                                disabled={bringBusyKey === `contribution-${contribution.id}`}
                              >
                                הסרה
                              </button>
                            )}
                          </article>
                        ))}
                      </div>
                    )}

                    <div className="free-bring-add-row">
                      <label>
                        <span>מה אני מביא/ה?</span>
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
                        />
                      </label>
                      <button
                        type="button"
                        className="primary-button compact-button"
                        onClick={() => void addFreeBringContribution()}
                        disabled={bringBusyKey === "free-add"}
                      >
                        הוספה
                      </button>
                    </div>
                  </div>
                </>
              )}

              {bringMessage && <p className={`message-box ${bringMessageTone}`}>{bringMessage}</p>}
            </section>

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
                            </article>
                          ))}
                        </div>
                      </div>
                    ) : null,
                  )}
                </div>
              )}
            </section>
          </section>
        </div>
      )}

      {eventFormOpen && selectedCommunity && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => closeEventForm()}>
          <section
            className="modal-card event-modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="event-form-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="modal-close"
              onClick={() => closeEventForm()}
              disabled={savingEvent}
              aria-label="סגירה"
            >
              ×
            </button>

            <p className="section-kicker">{editingEvent ? "עריכת אירוע" : "אירוע חדש"}</p>
            <h2 id="event-form-title">
              {editingEvent ? "עריכת האירוע" : "יצירת אירוע"}
            </h2>

            <div className="profile-form modal-form">
              <div className="image-upload-field">
                <span className="field-label">תמונת האירוע</span>
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
                  {eventFormImageUrl ? "החלפת תמונה" : "צירוף תמונה"}
                </button>
                <small>התמונה אינה חייבת להיות ריבועית. עד 3MB.</small>

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
                  autoFocus
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
                            <option value={event.id} key={event.id}>{event.title}</option>
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
                <span>מיקום</span>
                <input
                  type="text"
                  value={eventLocation}
                  onChange={(event) => setEventLocation(event.target.value)}
                  maxLength={200}
                  placeholder="כתובת או שם המקום"
                />
              </label>

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

            <div className="modal-actions">
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

            {message && <p className={`message-box ${messageTone}`}>{message}</p>}
          </section>
        </div>
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
