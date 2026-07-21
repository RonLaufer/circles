/* eslint-disable @next/next/no-img-element */

import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { RichText } from "@/app/components/RichText";
import { createClient } from "@/lib/supabase/server";

type SharedCommunity = {
  id: string;
  name: string;
  description: string;
  logo_url: string | null;
  requires_member_approval: boolean;
  share_token: string;
};

const SITE_ORIGIN = "https://circles-community.vercel.app";

const getSharedCommunity = cache(async (token: string) => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_shared_community", {
    target_share_token: token,
  });

  if (error || !data?.[0]) return null;
  return data[0] as SharedCommunity;
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const community = await getSharedCommunity(token);

  if (!community) {
    return {
      title: "המעגל לא נמצא | מעגלים",
      description: "הקישור למעגל אינו זמין.",
    };
  }

  const description =
    community.description.trim() || `הצטרפו למעגל „${community.name}” במערכת מעגלים.`;
  const url = `${SITE_ORIGIN}/circle/${community.share_token}`;
  const images = community.logo_url
    ? [
        {
          url: community.logo_url,
          alt: `תמונת המעגל ${community.name}`,
        },
      ]
    : undefined;

  return {
    title: `${community.name} | מעגלים`,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      locale: "he_IL",
      siteName: "מעגלים",
      title: community.name,
      description,
      url,
      images,
    },
    twitter: {
      card: community.logo_url ? "summary_large_image" : "summary",
      title: community.name,
      description,
      images: community.logo_url ? [community.logo_url] : undefined,
    },
  };
}

export default async function SharedCirclePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const community = await getSharedCommunity(token);

  if (!community) notFound();

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();

  if (authData.user) {
    const { data: membership } = await supabase
      .from("community_members")
      .select("community_id")
      .eq("community_id", community.id)
      .eq("user_id", authData.user.id)
      .maybeSingle();

    if (membership) {
      redirect(`/?join=${community.share_token}`);
    }
  }

  return (
    <main className="public-circle-page">
      <section className="public-circle-card">
        <header className="public-circle-brand">
          <span className="public-circle-brand-mark" aria-hidden="true">
            ◎
          </span>
          <div>
            <strong>מעגלים</strong>
            <span>Circles</span>
          </div>
        </header>

        {community.logo_url && (
          <a
            className="public-circle-image-link"
            href={community.logo_url}
            target="_blank"
            rel="noreferrer"
            aria-label={`הגדלת תמונת המעגל ${community.name}`}
          >
            <img
              className="public-circle-image"
              src={community.logo_url}
              alt={`תמונת המעגל ${community.name}`}
            />
          </a>
        )}

        <p className="section-kicker">הזמנה למעגל</p>
        <h1>{community.name}</h1>

        {community.description ? (
          <RichText text={community.description} className="public-circle-description" />
        ) : (
          <p className="public-circle-description">הצטרפו למעגל במערכת מעגלים.</p>
        )}

        <p className="public-circle-approval">
          {community.requires_member_approval
            ? "בקשת ההצטרפות תועבר לאישור מנהלי המעגל."
            : "אפשר להצטרף למעגל מיד לאחר הכניסה."}
        </p>

        <Link className="primary-button public-circle-join" href={`/?join=${community.share_token}`}>
          לצפייה ולהצטרפות
        </Link>
      </section>
    </main>
  );
}
