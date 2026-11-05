import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Fraunces } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { TimezoneSync } from "@/components/timezone-sync";
import { SiteThemeDecor } from "@/components/fx/site-theme-decor";
import { getSiteTheme } from "@/lib/site-theme-server";
import { siteTheme } from "@/lib/site-themes";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Display serif for headlines. The SOFT/WONK axes give it the warm,
// playbill feel the "cue" theme leans on; opsz keeps it crisp at every size.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["SOFT", "WONK", "opsz"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
  title: {
    default: "Cue - Social media scheduling for agencies",
    template: "%s · Cue",
  },
  description:
    "Plan, schedule, and publish LinkedIn, Instagram, and YouTube posts for every client from one calendar.",
};

export async function generateViewport(): Promise<Viewport> {
  const { chrome } = siteTheme(await getSiteTheme());
  return {
    themeColor: [
      { media: "(prefers-color-scheme: light)", color: chrome.light },
      { media: "(prefers-color-scheme: dark)", color: chrome.dark },
    ],
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // The site theme from the admin panel; "default" adds no attribute at all.
  const skin = await getSiteTheme();
  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-skin={skin === "default" ? undefined : skin}
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="bg-background text-foreground min-h-full">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <SiteThemeDecor theme={skin} />
          {children}
          <TimezoneSync />
          <Toaster position="bottom-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
