import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { HelpHomeBody } from "@/components/help/help-home";

// Behind sign-in like every app page: rendered per request, never prerendered.
export const dynamic = "force-dynamic";

// The in-app copy of the public help centre (/help), inside the app shell.
export const metadata: Metadata = {
  title: "Help",
  alternates: { canonical: "/help" },
  robots: { index: false, follow: false },
};

export default function GuideHomePage() {
  return (
    <div className="mx-auto max-w-6xl space-y-10">
      <PageHeader
        eyebrow="Help"
        title={
          <>
            How <em>Cue</em> works.
          </>
        }
        description="Plain-language guides for everything in Cue, from adding your first client to fixing a failed post."
      />
      <HelpHomeBody base="/guide" />
    </div>
  );
}
