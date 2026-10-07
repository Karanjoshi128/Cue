import {
  Gauge,
  PenLine,
  CalendarDays,
  ListOrdered,
  Users,
  Settings2,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Single-key shortcut, pressed after "g" (e.g. g then c → Calendar). */
  key: string;
  group: "publish" | "manage";
}

export const navItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: Gauge, key: "d", group: "publish" },
  { label: "Compose", href: "/composer", icon: PenLine, key: "n", group: "publish" },
  { label: "Calendar", href: "/calendar", icon: CalendarDays, key: "c", group: "publish" },
  { label: "Queue", href: "/queue", icon: ListOrdered, key: "q", group: "publish" },
  { label: "Clients", href: "/clients", icon: Users, key: "l", group: "manage" },
  { label: "Settings", href: "/settings", icon: Settings2, key: "s", group: "manage" },
];

export const navGroups: { key: NavItem["group"]; label: string }[] = [
  { key: "publish", label: "Publish" },
  { key: "manage", label: "Manage" },
];

export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
