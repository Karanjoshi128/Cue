import type { LucideIcon } from "lucide-react";

/*
 * Help guides are plain data. The same data feeds the public help centre
 * (/help), the in-app copy (/guide), the command palette's search and the
 * screenshot script (scripts/help-screenshots.ts).
 *
 * Text may use a little inline markup, rendered by <RichText>:
 *   **Button label**   on-screen words, spelled exactly as in the app
 *   [words](/help/slug) a link; /help links follow whichever copy is open
 *   `code`              URLs, keys, file names
 */

export type HelpGroupKey =
  | "start"
  | "clients"
  | "posting"
  | "planning"
  | "team"
  | "settings"
  | "troubleshooting";

/** Playwright locators as data, for the screenshot script. */
export type HelpTarget = (
  | { role: string; name?: string; exact?: boolean }
  | { label: string; exact?: boolean }
  | { text: string; exact?: boolean }
  | { placeholder: string }
  | { css: string }
) & {
  /** Which match to use when several do (0 = first, -1 = last). */
  nth?: number;
};

export type HelpAction =
  | { click: HelpTarget }
  | { fill: HelpTarget; value: string }
  | { hover: HelpTarget }
  | { press: string }
  | { waitFor: HelpTarget }
  /** Milliseconds; only for animations with nothing to wait on. */
  | { wait: number };

/** A picture for a step, taken by scripts/help-screenshots.ts from demo data. */
export interface HelpShot {
  /** Stable, unique, kebab-case. Saved as public/help/<id>.png. */
  id: string;
  /** App path to open, e.g. "/clients". */
  path: string;
  /** What the picture shows, for screen readers. */
  alt: string;
  actions?: HelpAction[];
  /** Numbered boxes drawn on the picture: 1, 2, 3… Steps refer to them as (1), (2). */
  highlight?: HelpTarget[];
  /** Crop to this element (plus a margin) instead of the whole window. */
  crop?: HelpTarget;
  device?: "desktop" | "mobile";
}

export interface HelpStep {
  text: string;
  shot?: HelpShot;
}

export interface HelpSection {
  /** Anchor id, kebab-case, unique within the guide. */
  id: string;
  title: string;
  intro?: string;
  /** A picture for the whole section, shown under the intro. */
  shot?: HelpShot;
  steps?: HelpStep[];
  /** Unnumbered points, for things that aren't a sequence. */
  points?: string[];
  table?: { head: string[]; rows: string[][] };
  /** A literal block (commands, JSON), shown as-is with a copy button. */
  code?: { label: string; text: string };
  /** "Good to know" notes. */
  tips?: string[];
  /** "Watch out" notes: things that surprise people or can't be undone. */
  warnings?: string[];
  /** Problem → fix pairs, usually quoting the exact message the app shows. */
  faq?: { q: string; a: string }[];
}

export interface HelpGuide {
  slug: string;
  group: HelpGroupKey;
  icon: LucideIcon;
  /** Shows the network's logo instead of `icon` on cards and headers. */
  platform?: "LINKEDIN" | "INSTAGRAM" | "YOUTUBE";
  title: string;
  /** One or two sentences: what this guide gets you. Used on cards and as the meta description. */
  summary: string;
  /** Extra words people might search for. */
  keywords: string[];
  sections: HelpSection[];
  related?: string[];
  /** The screens this guide describes, so a UI change can find the guides it affects. */
  screens: string[];
}

export interface HelpGroup {
  key: HelpGroupKey;
  title: string;
  description: string;
  icon: LucideIcon;
}
