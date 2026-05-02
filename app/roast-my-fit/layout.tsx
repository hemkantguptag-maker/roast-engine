import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Roast My Fit 👗 | AI Outfit Roaster",
  description:
    "Upload your outfit photo. AI roasts your style brutally for free. Unlock a full celebrity stylist report for $4.99.",
  openGraph: {
    title: "Roast My Fit 👗 | AI Outfit Roaster",
    description:
      "Upload your outfit photo. AI roasts your style brutally for free. Unlock a full celebrity stylist report for $4.99.",
    url: "https://myroastengine.com/roast-my-fit",
    siteName: "Roast Engine",
    type: "website",
    images: [
      { url: "https://myroastengine.com/og-image.png", width: 1200, height: 630 },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Roast My Fit 👗 | AI Outfit Roaster",
    description:
      "Upload your outfit photo. AI roasts your style brutally for free. Unlock a full celebrity stylist report for $4.99.",
    images: ["https://myroastengine.com/og-image.png"],
  },
};

export default function RoastMyFitLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
