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

const APP_VERSION = "v1.0.1.9";
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
    <div className="circles-mark" aria-hidden="true">
      <span className="circle circle-one" />
      <span className="circle circle-two" />
      <span className="circle circle-three" />
    </div>
  );
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

export default function Home() {
  const supabase = useMemo(() => createClient(), []);
  const profileImageInputRef = useRef<HTMLInputElement | null>(null);
  const communityImageInputRef = useRef<HTMLInputElement | null>(null);
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
  const [reviewingUserId, setReviewingUserId] = useState<string | null>(null);
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);
  const [shareCommunity, setShareCommunity] = useState<Community | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [pendingShareToken, setPendingShareToken] = useState<string | null>(null);
  const [autoJoinAfterAuth, setAutoJoinAfterAuth] = useState(false);
  const [invitedCommunity, setInvitedCommunity] = useState<SharedCommunity | null>(null);
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
    const params = new URLSearchParams(window.location.search);
    const joinToken = params.get("join");
    const authError = params.get("auth_error");
    const shouldAutoJoin = params.get("autojoin") === "1";

    if (joinToken) {
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
  }, [loadCommunities, loadProfile, loadSharedInvite, supabase]);

  useEffect(() => {
    const selected = communities.find((community) => community.id === selectedCommunityId);

    if (!selected) {
      setCommunityMembers([]);
      setJoinRequests([]);
      return;
    }

    void loadCommunityPeople(selected.id, selected.role);
  }, [communities, loadCommunityPeople, selectedCommunityId]);

  useEffect(() => {
    if (!user || !communitiesReady || !pendingShareToken || !invitedCommunity) return;

    const existingMembership = communities.find(
      (community) => community.id === invitedCommunity.id,
    );

    if (!existingMembership) return;

    queueMicrotask(() => {
      setSelectedCommunityId(existingMembership.id);
      setInviteDismissed(true);
      window.history.replaceState({}, "", window.location.pathname);
      setPendingShareToken(null);
      setAutoJoinAfterAuth(false);
      autoJoinAttemptedRef.current = false;
    });
  }, [
    communities,
    communitiesReady,
    invitedCommunity,
    pendingShareToken,
    user,
  ]);

  useEffect(() => {
    if (
      !autoJoinAfterAuth ||
      !user ||
      !communitiesReady ||
      !pendingShareToken ||
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
    pendingShareToken,
    user,
  ]);

  async function signInWithGoogle() {
    setAuthBusy(true);
    setMessage(null);

    const nextPath = pendingShareToken
      ? `/?join=${encodeURIComponent(pendingShareToken)}&autojoin=1`
      : "/";
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        queryParams: {
          access_type: "offline",
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

    setAuthBusy(false);
  }

  function openImage(url: string, alt: string) {
    setLightbox({ url, alt });
  }

  function clearJoinFromAddress() {
    window.history.replaceState({}, "", window.location.pathname);
    setPendingShareToken(null);
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
    if (!currentCommunity || !user) return;

    const isSystemAdmin = user.email?.trim().toLowerCase() === SYSTEM_ADMIN_EMAIL;
    const isCircleCreator = currentCommunity.created_by === user.id;

    if (!isSystemAdmin && !isCircleCreator) {
      setMessageTone("error");
      setMessage("אין לך הרשאה להסיר חברים מהמעגל.");
      return;
    }

    if (member.role === "owner" || member.user_id === currentCommunity.created_by) {
      setMessageTone("error");
      setMessage("לא ניתן להסיר את יוצר המעגל.");
      return;
    }

    const confirmed = window.confirm(
      `להסיר את ${member.full_name} מהמעגל? החברות תימחק ממסד הנתונים.`,
    );
    if (!confirmed) return;

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
    } else {
      setMessageTone("success");
      setMessage(`${member.full_name} הוסר מהמעגל.`);
      await loadCommunityPeople(currentCommunity.id, currentCommunity.role);
    }

    setRemovingUserId(null);
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

  async function prepareImage(file: File, target: "profile" | "community") {
    setMessage(null);

    try {
      const compressed = await compressImage(file);

      if (target === "profile") {
        setProfileImage((current) => {
          clearSelectedImage(current);
          return compressed;
        });
      } else {
        setCommunityImage((current) => {
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
          <h1>המקום שבו המעגל נפגש</h1>
          <p className="lead">
            הכירו את האנשים סביבכם, הצטרפו לאירועים וספרו מה אתם מביאים.
          </p>

          {pendingShareToken && (
            <div className="login-invite-card">
              {inviteLoading ? (
                <div className="inline-loading">
                  <span className="spinner spinner-small" />
                  טוענים את המעגל...
                </div>
              ) : invitedCommunity ? (
                <>
                  {invitedCommunity.logo_url && (
                    <a
                      className="image-zoom-button login-invite-image-button"
                      href={invitedCommunity.logo_url}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`הגדלת תמונת המעגל ${invitedCommunity.name}`}
                    >
                      <img
                        className="login-invite-image"
                        src={invitedCommunity.logo_url}
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

          <div className="feature-pills" aria-label="יכולות המערכת">
            <span>פרופילים אישיים</span>
            <span>אירועים משותפים</span>
            <span>חלוקת אוכל וציוד</span>
            <span>תמונות מהאירוע</span>
          </div>

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
  const ownerMember = communityMembers.find((member) => member.role === "owner") ?? null;
  const invitedMembership = invitedCommunity
    ? communities.find((community) => community.id === invitedCommunity.id) ?? null
    : null;
  const isSystemAdmin = user.email?.trim().toLowerCase() === SYSTEM_ADMIN_EMAIL;
  const canRemoveCommunityMembers = Boolean(
    selectedCommunity &&
      (isSystemAdmin || selectedCommunity.created_by === user.id),
  );
  const shareUrl = shareCommunity
    ? getCommunityShareUrl(shareCommunity.share_token)
    : "";
  const shareText = shareCommunity
    ? getCommunityShareText(shareCommunity, shareUrl)
    : "";
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
                <span className="brand-name-en">Circles</span>
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

            {selectedCommunity.logo_url && (
              <button
                type="button"
                className="image-zoom-button community-cover-button"
                onClick={() =>
                  openImage(selectedCommunity.logo_url!, `תמונת המעגל ${selectedCommunity.name}`)
                }
                aria-label={`הגדלת תמונת המעגל ${selectedCommunity.name}`}
              >
                <img
                  className="community-cover-image"
                  src={selectedCommunity.logo_url}
                  alt={`תמונת המעגל ${selectedCommunity.name}`}
                />
              </button>
            )}

            <div className="community-detail-heading">
              {!selectedCommunity.logo_url && !hideCommunityPlaceholder(selectedCommunity) && (
                <div className="community-emblem community-emblem-large" aria-hidden="true">
                  {selectedCommunity.name.trim().slice(0, 1)}
                </div>
              )}
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
                        {member.city && <span className="member-city">{member.city}</span>}
                        {member.phone && <PhoneLink phone={member.phone} />}
                      </div>
                      {canRemoveCommunityMembers &&
                        member.role !== "owner" &&
                        member.user_id !== selectedCommunity.created_by &&
                        member.user_id !== user.id && (
                          <button
                            type="button"
                            className="member-remove-button"
                            onClick={() => void removeCommunityMember(member)}
                            disabled={removingUserId === member.user_id}
                          >
                            {removingUserId === member.user_id ? "מסירים..." : "הסרה"}
                          </button>
                        )}
                    </article>
                  ))}
                </div>
              )}

              {(selectedCommunity.role === "owner" || selectedCommunity.role === "admin") && (
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

            <div className="empty-community-area">
              <span className="module-icon">◷</span>
              <div>
                <h2>האירועים של המעגל</h2>
                <p>כאן יופיעו בהמשך האירועים, המשתתפים ומה כל אחד מביא.</p>
              </div>
              <span className="soon-badge">בקרוב</span>
            </div>

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
                      {community.logo_url ? (
                        <button
                          type="button"
                          className="image-zoom-button community-thumb-button"
                          onClick={(event) => {
                            event.stopPropagation();
                            openImage(community.logo_url!, `תמונת המעגל ${community.name}`);
                          }}
                          aria-label={`הגדלת תמונת המעגל ${community.name}`}
                        >
                          <img
                            className="community-thumb-image"
                            src={community.logo_url}
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

      {pendingShareToken &&
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
            aria-labelledby="invite-circle-title"
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
                טוענים את המעגל...
              </div>
            ) : invitedCommunity ? (
              <>
                {invitedCommunity.logo_url && (
                  <button
                    type="button"
                    className="image-zoom-button invite-circle-image-button"
                    onClick={() =>
                      openImage(
                        invitedCommunity.logo_url!,
                        `תמונת המעגל ${invitedCommunity.name}`,
                      )
                    }
                  >
                    <img
                      className="invite-circle-image"
                      src={invitedCommunity.logo_url}
                      alt={`תמונת המעגל ${invitedCommunity.name}`}
                    />
                  </button>
                )}
                <p className="section-kicker">הזמנה למעגל</p>
                <h2 id="invite-circle-title">{invitedCommunity.name}</h2>
                {invitedCommunity.description && (
                  <RichText
                    text={invitedCommunity.description}
                    className="invite-circle-description"
                  />
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
                    <strong>מצרפים אותך למעגל...</strong>
                  </div>
                ) : (
                  <>
                    <p className="invite-approval-note">
                      {invitedMembership
                        ? "אתם כבר חברים במעגל הזה."
                        : invitedCommunity.requires_member_approval
                          ? "ההצטרפות תישלח לאישור מנהלי המעגל."
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
                          : invitedMembership
                            ? "כניסה למעגל"
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

            {shareCommunity.logo_url && (
              <button
                type="button"
                className="image-zoom-button share-preview-image-button"
                onClick={() =>
                  openImage(shareCommunity.logo_url!, `תמונת המעגל ${shareCommunity.name}`)
                }
              >
                <img
                  className="share-preview-image"
                  src={shareCommunity.logo_url}
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
