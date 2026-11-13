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
import { automationsEnabled } from "@/lib/automations/config";
import { replyDeskEnabled } from "@/lib/reply-desk/config";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Single-key shortcut, pressed after "g" (e.g. g then c → Calendar). */
  key: string;
  group: "publish" | "engage" | "manage";
}

export const navItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: Gauge, key: "d", group: "publish" },
  { label: "Compose", href: "/composer", icon: PenLine, key: "n", group: "publish" },
  { label: "Calendar", href: "/calendar", icon: CalendarDays, key: "c", group: "publish" },
  { label: "Queue", href: "/queue", icon: ListOrdered, key: "q", group: "publish" },
  // Each hidden until Meta (and Google, for the Reply Desk) approve the
  // permissions it needs: see automations/config.ts and reply-desk/config.ts.
  ...(replyDeskEnabled()
    ? [
        {
          label: "Reply Desk",
          href: "/replies",
          icon: Inbox,
          key: "r",
          group: "engage",
        } satisfies NavItem,
      ]
    : []),
  ...(automationsEnabled()
    ? [
        {
          label: "Automations",
          href: "/automations",
          icon: MessageCircleReply,
          key: "a",
          group: "engage",
        } satisfies NavItem,
      ]
    : []),
  // Needs nothing from Meta beyond publishing access, so not behind a flag.
  { label: "Link in bio", href: "/bio", icon: Link2, key: "b", group: "engage" },
  { label: "Clients", href: "/clients", icon: Users, key: "l", group: "manage" },
  { label: "Settings", href: "/settings", icon: Settings2, key: "s", group: "manage" },
  { label: "Help", href: "/guide", icon: LifeBuoy, key: "h", group: "manage" },
];

export const navGroups: { key: NavItem["group"]; label: string }[] = [
  { key: "publish" as const, label: "Publish" },
  { key: "engage" as const, label: "Engage" },
  { key: "manage" as const, label: "Manage" },
].filter((g) => navItems.some((i) => i.group === g.key));

export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
