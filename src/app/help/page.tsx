import type { Metadata } from "next";
import { HelpShell } from "@/components/help/help-shell";
import { HelpHomeBody } from "@/components/help/help-home";

export const metadata: Metadata = {
  title: "Help centre",
  description:
    "Step-by-step guides for Cue: add clients, connect LinkedIn, Instagram and YouTube, schedule posts, work as a team, and fix failed posts.",
  alternates: { canonical: "/help" },
  openGraph: {
    title: "Cue Help centre",
    description:
      "Step-by-step guides for scheduling LinkedIn, Instagram and YouTube posts for every client with Cue.",
    url: "/help",
    type: "website",
  },
};

export default function HelpPage() {
  return (
    <HelpShell
      title={
        <>
          How <em>Cue</em> works.
        </>
      }
      description="Plain-language guides for everything in Cue, from adding your first client to fixing a failed post."
    >
      <HelpHomeBody base="/help" />
    </HelpShell>
  );
}
