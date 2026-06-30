import {
  LayoutDashboard,
  PenSquare,
  CalendarDays,
  ListChecks,
  Users,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export const navItems: NavItem[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Create", href: "/composer", icon: PenSquare },
  { label: "Calendar", href: "/calendar", icon: CalendarDays },
  { label: "Queue", href: "/queue", icon: ListChecks },
  { label: "Clients", href: "/clients", icon: Users },
  { label: "Settings", href: "/settings", icon: Settings },
];
