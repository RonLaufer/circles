import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "מעגלים",
    short_name: "מעגלים",
    description: "אנשים, מעגלים ואירועים במקום אחד.",
    start_url: "/",
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
  };
}
