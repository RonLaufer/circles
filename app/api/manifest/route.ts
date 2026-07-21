import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const circleToken = request.nextUrl.searchParams.get("circle");
  let circleName = "מעגלים";

  if (circleToken) {
    const supabase = await createClient();
    const { data } = await supabase.rpc("get_shared_community", {
      target_share_token: circleToken,
    });

    if (data?.[0]?.name) circleName = String(data[0].name);
  }

  return NextResponse.json(
    {
      name: circleName,
      short_name: circleName,
      description: "מעגל קהילתי במערכת מעגלים.",
      start_url: circleToken ? `/?join=${encodeURIComponent(circleToken)}` : "/",
      scope: "/",
      display: "standalone",
      background_color: "#f6f8fb",
      theme_color: "#FCD34D",
      lang: "he",
      dir: "rtl",
      icons: [
        {
          src: "/circles-icon-192.png",
          sizes: "192x192",
          type: "image/png",
        },
        {
          src: "/circles-icon-512.png",
          sizes: "512x512",
          type: "image/png",
        },
      ],
    },
    {
      headers: {
        "Content-Type": "application/manifest+json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    },
  );
}
