import type { Metadata, Viewport } from "next";
import { Playfair_Display, Jost } from "next/font/google";
import "./globals.css";
import WishlistProvider from "@/components/client/product/WishlistProvider";

// Self-hosted, preloaded, non-render-blocking fonts (replaces the Google Fonts
// <link>). Exposed as CSS variables that globals.css maps onto the "Playfair
// Display"/"Jost" family names the components already use.
const playfair = Playfair_Display({
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-playfair",
});

const jost = Jost({
  subsets: ["latin"],
  display: "swap",
  weight: ["300", "400", "500"],
  variable: "--font-jost-google",
});
import {
  SITE_URL,
  SITE_NAME,
  SITE_TAGLINE,
  SITE_DESCRIPTION,
  absoluteUrl,
} from "@/utils/site";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} - ${SITE_TAGLINE}`,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "ZIEA",
    "Kerala women's wear",
    "kurthi",
    "nightwear",
    "ethnic wear",
    "handcrafted clothing",
    "premium women's fashion",
  ],
  // NOTE: no global `alternates.canonical` here — a root canonical is inherited
  // by every child page, making them all canonicalize to "/". Each page sets its
  // own self-referential canonical instead.
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: `${SITE_NAME} - ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    locale: "en_IN",
    images: [{ url: "/Ziea_Logo.png", width: 1200, height: 630, alt: SITE_NAME }],
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} - ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    images: ["/Ziea_Logo.png"],
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#2C3829",
};

// Organization structured data (sitewide) for rich results.
const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: SITE_NAME,
  url: SITE_URL,
  logo: absoluteUrl("/Ziea_Logo.png"),
  description: SITE_DESCRIPTION,
  email: "contact@ziea.in",
  sameAs: [
    "https://instagram.com/ziea",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`light antialiased ${playfair.variable} ${jost.variable}`}
    >
      <head>
        {/* Warm up the connection to the image-storage origin so the optimizer's
            upstream fetch of the LCP product image starts sooner. */}
        <link rel="preconnect" href="https://igzgiyulxkvkrjymisqy.supabase.co" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://igzgiyulxkvkrjymisqy.supabase.co" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
      </head>
      <body className="flex flex-col min-h-screen">
        <WishlistProvider>{children}</WishlistProvider>
      </body>
    </html>
  );
}
