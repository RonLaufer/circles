import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://circles-community.vercel.app"),
  title: "מעגלים | Circles",
  description: "אנשים, מעגלים ואירועים במקום אחד.",
  applicationName: "מעגלים",
  appleWebApp: {
    capable: true,
    title: "מעגלים",
    statusBarStyle: "default",
  },
  icons: {
    icon: "/circles-system-icon-512.png",
    shortcut: "/favicon-32x32.png",
    apple: "/apple-icon.png",
  },
  openGraph: {
    type: "website",
    locale: "he_IL",
    siteName: "מעגלים",
    title: "מעגלים | Circles",
    description: "אנשים, מעגלים ואירועים במקום אחד.",
    url: "https://circles-community.vercel.app",
    images: [
      {
        url: "/circles-system-share.png",
        alt: "לוגו מערכת מעגלים",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "מעגלים | Circles",
    description: "אנשים, מעגלים ואירועים במקום אחד.",
    images: ["/circles-system-share.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#FCD34D",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
