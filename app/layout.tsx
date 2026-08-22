import type { Metadata } from "next";
import { Geist, Geist_Mono, Sora } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

// The wordmark's typeface, reused for headings.
const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  weight: ["200", "400", "600", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://icareearth.onrender.com"),
  title: {
    default: "IcareEarth — Find your biggest lever",
    template: "%s · IcareEarth",
  },
  description:
    "A carbon calculator hands you a number. IcareEarth interviews you, then works out which single change cuts the most for your life — and shows you the decade you'd be choosing.",
  icons: {
    icon: [{ url: "/icareearth-icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icareearth-app-icon.png" }],
  },
  openGraph: {
    title: "IcareEarth — Find your biggest lever",
    description:
      "Carbon trackers report a number. IcareEarth decides something: the single change that cuts the most for your life.",
    images: ["/icareearth-app-icon.png"],
    type: "website",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${sora.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
