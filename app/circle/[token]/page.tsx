import { cache } from "react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CircleRedirect } from "./CircleRedirect";

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
    applicationName: community.name,
    appleWebApp: {
      capable: true,
      title: community.name,
      statusBarStyle: "default",
    },
    manifest: `/api/manifest?circle=${encodeURIComponent(community.share_token)}`,
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

  return <CircleRedirect token={community.share_token} />;
}
