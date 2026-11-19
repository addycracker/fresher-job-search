import type { Metadata } from "next";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "FresherJobs AI — Your career starts here",
    template: "%s | FresherJobs AI",
  },
  description:
    "Discover real opportunities from company recruitment boards. Explore internships, full-time roles and your next career step with FresherJobs AI.",
  ...(process.env.WEB_SITE_URL
    ? { metadataBase: new URL(process.env.WEB_SITE_URL) }
    : {}),
  openGraph: {
    title: "FresherJobs AI — Your career starts here",
    description:
      "Big potential deserves a better beginning. Explore real opportunities from company hiring boards.",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <a href="#main-content" className="skip-link">
          Skip to content
        </a>
        <Header />
        {children}
        <Footer />
      </body>
    </html>
  );
}
