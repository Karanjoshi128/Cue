import {
  CalendarRange,
  LifeBuoy,
  PenLine,
  Rocket,
  Settings2,
  Users,
  UsersRound,
} from "lucide-react";
import type { HelpGroup, HelpGroupKey, HelpGuide } from "./types";
import { startGuides } from "./guides/start";
import { clientGuides } from "./guides/clients";
import { postingGuides } from "./guides/posting";
import { planningGuides } from "./guides/planning";
import { teamGuides } from "./guides/team";
import { settingsGuides } from "./guides/settings";
import { troubleshootingGuides } from "./guides/troubleshooting";

export type { HelpGuide, HelpGroup, HelpSection, HelpStep, HelpShot } from "./types";

export const HELP_GROUPS: HelpGroup[] = [
  {
    key: "start",
    title: "Getting started",
    description: "What Cue is, signing in, and finding your way around.",
    icon: Rocket,
  },
  {
    key: "clients",
    title: "Clients and accounts",
    description: "Add clients and connect their LinkedIn, Instagram and YouTube.",
    icon: Users,
  },
  {
    key: "posting",
    title: "Writing and scheduling",
    description: "Write posts, add media, and choose when they go out.",
    icon: PenLine,
  },
  {
    key: "planning",
    title: "Planning and tracking",
    description: "The calendar, the queue and the dashboard.",
    icon: CalendarRange,
  },
  {
    key: "team",
    title: "Working as a team",
    description: "Invites, roles, approvals and workspaces.",
    icon: UsersRound,
  },
  {
    key: "settings",
    title: "Settings",
    description: "Plan, media storage, API keys and appearance.",
    icon: Settings2,
  },
  {
    key: "troubleshooting",
    title: "Troubleshooting",
    description: "Failed posts, connection errors and how to reach us.",
    icon: LifeBuoy,
  },
];

/** Every guide, in reading order (group by group). */
export const HELP_GUIDES: HelpGuide[] = [
  ...startGuides,
  ...clientGuides,
  ...postingGuides,
  ...planningGuides,
  ...teamGuides,
  ...settingsGuides,
  ...troubleshootingGuides,
];

const BY_SLUG = new Map(HELP_GUIDES.map((g) => [g.slug, g]));

export function getGuide(slug: string): HelpGuide | undefined {
  return BY_SLUG.get(slug);
}

export function guidesIn(group: HelpGroupKey): HelpGuide[] {
  return HELP_GUIDES.filter((g) => g.group === group);
}

export function groupOf(key: HelpGroupKey): HelpGroup {
  return HELP_GROUPS.find((g) => g.key === key)!;
}

/** Previous and next guide within the same group. */
export function neighbours(slug: string): { prev?: HelpGuide; next?: HelpGuide } {
  const guide = BY_SLUG.get(slug);
  if (!guide) return {};
  const list = guidesIn(guide.group);
  const i = list.findIndex((g) => g.slug === slug);
  return { prev: list[i - 1], next: list[i + 1] };
}

/** The three guides on the "Start here" path, matching the dashboard checklist. */
export const START_HERE = ["add-a-client", "connect-linkedin", "write-a-post"] as const;

/** Strips the inline markup (**bold**, [text](href), `code`) for plain-text uses. */
export function plain(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\[(.+?)\]\((.+?)\)/g, "$1")
    .replace(/`(.+?)`/g, "$1");
}

/** A small, serialisable index for client-side search (help home and the command palette). */
export interface HelpSearchEntry {
  slug: string;
  title: string;
  summary: string;
  group: string;
  /** Lowercased haystack: title, summary, keywords, section titles and step text. */
  text: string;
}

export function searchIndex(): HelpSearchEntry[] {
  return HELP_GUIDES.map((g) => ({
    slug: g.slug,
    title: g.title,
    summary: g.summary,
    group: groupOf(g.group).title,
    text: [
      g.title,
      g.summary,
      ...g.keywords,
      ...g.sections.flatMap((s) => [
        s.title,
        s.intro ?? "",
        ...(s.steps ?? []).map((st) => st.text),
        ...(s.points ?? []),
        ...(s.faq ?? []).flatMap((f) => [f.q, f.a]),
      ]),
    ]
      .map(plain)
      .join(" ")
      .toLowerCase(),
  }));
}
