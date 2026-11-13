import {
  Gauge,
  PenLine,
  CalendarDays,
  ListOrdered,
  Inbox,
  Link2,
  MessageCircleReply,
  Users,
  Settings2,
  LifeBuoy,
  type LucideIcon,
} from "lucide-react";
import type { EarlyFeature } from "@/lib/plans";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Single-key shortcut, pressed after "g" (e.g. g then c → Calendar). */
  key: string;
  group: "publish" | "engage" | "manage";
  /** Shown only where this is available: launched, or unlocked early. */
  feature?: EarlyFeature;
}

/** Which early features the workspace in view can use (featuresAvailable in plans.ts). */
export type NavFeatures = Record<EarlyFeature, boolean>;

export const navItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: Gauge, key: "d", group: "publish" },
  { label: "Compose", href: "/composer", icon: PenLine, key: "n", group: "publish" },
  { label: "Calendar", href: "/calendar", icon: CalendarDays, key: "c", group: "publish" },
  { label: "Queue", href: "/queue", icon: ListOrdered, key: "q", group: "publish" },
  // Each hidden until Meta (and Google, for the Reply Desk) approve the
  // permissions it needs, except in workspaces unlocked early: see plans.ts.
  { label: "Reply Desk", href: "/replies", icon: Inbox, key: "r", group: "engage", feature: "reply_desk" },
  { label: "Automations", href: "/automations", icon: MessageCircleReply, key: "a", group: "engage", feature: "ig_automations" },
  // Needs nothing from Meta beyond publishing access, so not behind a flag.
  { label: "Link in bio", href: "/bio", icon: Link2, key: "b", group: "engage" },
  { label: "Clients", href: "/clients", icon: Users, key: "l", group: "manage" },
  { label: "Settings", href: "/settings", icon: Settings2, key: "s", group: "manage" },
  { label: "Help", href: "/guide", icon: LifeBuoy, key: "h", group: "manage" },
];

/** The items this workspace can use. */
export function visibleNavItems(features: NavFeatures): NavItem[] {
  return navItems.filter((i) => !i.feature || features[i.feature]);
}

const GROUPS: { key: NavItem["group"]; label: string }[] = [
  { key: "publish", label: "Publish" },
  { key: "engage", label: "Engage" },
  { key: "manage", label: "Manage" },
];

/** The groups that have something in them. */
export function navGroupsFor(items: NavItem[]) {
  return GROUPS.filter((g) => items.some((i) => i.group === g.key));
}

export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
