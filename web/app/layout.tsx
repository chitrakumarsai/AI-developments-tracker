import type { Metadata } from "next";
import { Inter, Fraunces } from "next/font/google";
import "./globals.css";
import { siteUrl, SITE_NAME, SITE_TAGLINE, SITE_DESCRIPTION } from "@/lib/seo/site";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  // Resolves all relative metadata URLs (OG images, canonical) against the
  // canonical origin — never a request Host header.
  metadataBase: new URL(siteUrl()),
  title: {
    default: `${SITE_NAME} — ${SITE_TAGLINE}`,
    // Inner pages set just their name; the brand is appended automatically.
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
  },
};

type RootLayoutProps = Readonly<{
  children: React.ReactNode;
}>;

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable} h-full`}>
      <body className="min-h-full flex flex-col bg-paper text-ink">
        {children}
      </body>
    </html>
  );
}
