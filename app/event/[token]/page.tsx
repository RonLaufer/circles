import { cache } from "react";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { EventRedirect } from "./EventRedirect";
import { getEventShareTokenCandidates } from "@/lib/event-share-token";

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
  community_logo_url: string | null;
  community_share_token: string;
};

const SITE_ORIGIN = "https://circles-community.vercel.app";
const DEFAULT_SHARE_IMAGE = "/circles-system-share.png";

const getSharedEvent = cache(async (token: string) => {
  const candidates = getEventShareTokenCandidates(token);
  if (!candidates.length) return null;

  const supabase = await createClient();
  const results = await Promise.all(
    candidates.map((candidate) =>
      supabase.rpc("get_shared_event", {
        target_share_token: candidate,
      }),
    ),
  );

  const match = results.find(({ data, error }) => !error && data?.[0]);
  return match?.data?.[0] ? (match.data[0] as SharedEvent) : null;
});

function formatSharedEventDate(startsAt: string, endsAt: string | null) {
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) return "";

  const dateText = `${start.getDate()}/${start.getMonth() + 1}/${start.getFullYear()}`;
  const timeFormatter = new Intl.DateTimeFormat("he-IL", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const startTime = timeFormatter.format(start);
  if (!endsAt) return `${dateText} משעה ${startTime}`;

  const end = new Date(endsAt);
  if (Number.isNaN(end.getTime())) return `${dateText} משעה ${startTime}`;
  return `${dateText} משעה ${startTime} עד ${timeFormatter.format(end)}`;
}

function formatSharedEventShortDate(startsAt: string) {
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) return "";
  return `${start.getDate()}/${start.getMonth() + 1}/${start.getFullYear()}`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const event = await getSharedEvent(token);

  if (!event) {
    return {
      title: "האירוע לא נמצא | מעגלים",
      description: "הקישור לאירוע אינו זמין.",
    };
  }

  const dateText = formatSharedEventDate(event.starts_at, event.ends_at);
  const description =
    event.description.trim() ||
    [dateText, event.location].filter(Boolean).join(" · ") ||
    `הצטרפו לאירוע „${event.title}” במערכת מעגלים.`;
  const url = `${SITE_ORIGIN}/event/${event.share_token}`;
  const shareImageUrl = event.image_url ?? event.community_logo_url ?? DEFAULT_SHARE_IMAGE;
  const images = [
    {
      url: shareImageUrl,
      alt: event.image_url
        ? `תמונת האירוע ${event.title}`
        : event.community_logo_url
          ? `תמונת המעגל ${event.community_name}`
          : "לוגו מערכת מעגלים",
    },
  ];

  const browserTitle = `${event.title} ב ${formatSharedEventShortDate(event.starts_at)}`;
  const sharedTitle = event.status === "cancelled" ? `${event.title} · מבוטל` : event.title;
  const sharedDescription = event.status === "cancelled"
    ? `האירוע בוטל. ${description}`
    : description;

  return {
    title: browserTitle,
    description: sharedDescription,
    alternates: { canonical: url },
    applicationName: event.community_name,
    appleWebApp: {
      capable: true,
      title: event.community_name,
      statusBarStyle: "default",
    },
    manifest: `/api/manifest?circle=${encodeURIComponent(event.community_share_token)}`,
    openGraph: {
      type: "website",
      locale: "he_IL",
      siteName: "מעגלים",
      title: sharedTitle,
      description: sharedDescription,
      url,
      images,
    },
    twitter: {
      card: "summary_large_image",
      title: sharedTitle,
      description: sharedDescription,
      images: [shareImageUrl],
    },
  };
}

export default async function SharedEventPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Always forward the shared token to the client application.
  // The metadata lookup above may occasionally fail because of a transient
  // database/network error, but that must never turn a valid shared link
  // into a permanent-looking 404 page. The main application performs the
  // authoritative event lookup and can show the appropriate message there.
  return <EventRedirect token={token} />;
}
