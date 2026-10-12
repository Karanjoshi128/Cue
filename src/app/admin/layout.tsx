import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePlatformAdmin } from "@/lib/admin-guard";
import { getPlatformSettings } from "@/lib/platform-settings";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { AdminNav } from "@/components/admin/admin-nav";
import { Pill } from "@/components/admin/admin-ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Cue admin" },
  robots: { index: false, follow: false },
};

// The platform admin panel. Only platform admins get past requirePlatformAdmin;
// everyone else sees the ordinary 404. Every page and loader re-checks too.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const email = await requirePlatformAdmin();
  const settings = await getPlatformSettings();

  return (
    <div className="bg-canvas min-h-dvh">
      <header className="bg-background/80 supports-backdrop-filter:bg-background/65 sticky top-0 z-30 border-b backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <Link href="/admin" aria-label="Admin overview" className="shrink-0">
            <Logo className="h-6 w-auto" />
          </Link>
          <span className="label-caps">Admin</span>
          {settings.publishingPaused && (
            <Link href="/admin/platform" className="hidden sm:block">
              <Pill tone="bad">Publishing paused</Pill>
            </Link>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            <span className="text-muted-foreground mr-1 hidden max-w-56 truncate text-xs md:block">{email}</span>
            <ThemeToggle />
            <Link
              href="/dashboard"
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm transition-colors"
            >
              <ArrowLeft className="size-3.5" aria-hidden /> <span className="hidden sm:inline">Back to</span> app
            </Link>
          </div>
        </div>
        <AdminNav variant="strip" />
      </header>
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-7 sm:px-6 sm:py-9 lg:grid-cols-[11.5rem_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <AdminNav variant="side" />
        </aside>
        <main className="min-w-0 space-y-6 pb-16">{children}</main>
      </div>
    </div>
  );
}
