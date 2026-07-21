import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EventRedirect } from "./EventRedirect";

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
  community_share_token: string;
};

const SITE_ORIGIN = "https://circles-community.vercel.app";

const getSharedEvent = cache(async (token: string) => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_shared_event", {
    target_share_token: token,
  });

  if (error || !data?.[0]) return null;
  return data[0] as SharedEvent;
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
  const images = event.image_url
    ? [
        {
          url: event.image_url,
          alt: `תמונת האירוע ${event.title}`,
        },
      ]
    : undefined;

  return {
    title: `${event.title} | מעגלים`,
    description,
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
      title: event.title,
      description,
      url,
      images,
    },
    twitter: {
      card: event.image_url ? "summary_large_image" : "summary",
      title: event.title,
      description,
      images: event.image_url ? [event.image_url] : undefined,
    },
  };
}

export default async function SharedEventPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const event = await getSharedEvent(token);

  if (!event) notFound();

  return <EventRedirect token={event.share_token} />;
}
