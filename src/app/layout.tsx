import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, DM_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { TimezoneSync } from "@/components/timezone-sync";
import { WebAnalytics } from "@/components/web-analytics";
import { getSiteTheme } from "@/lib/site-theme-server";
import { siteTheme } from "@/lib/site-themes";

// The Soft type: Bricolage Grotesque for headlines and big figures, DM Sans
// for text, JetBrains Mono for times and labels (mapped in globals.css).
const display = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  // Optical size: big headlines get the tighter display cut, as in the designs.
  axes: ["opsz"],
});

const text = DM_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
});

const mono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
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
      className={`${display.variable} ${text.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="bg-background text-foreground min-h-full">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <TimezoneSync />
          <Toaster position="bottom-right" />
        </ThemeProvider>
        <WebAnalytics />
      </body>
    </html>
  );
}
