"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/admin/mailer", label: "Campaigns", match: ["/admin/mailer", "/admin/mailer/campaigns"] },
  { href: "/admin/mailer/templates", label: "Templates" },
  { href: "/admin/mailer/contacts", label: "Contacts" },
  { href: "/admin/mailer/sending", label: "Sending" },
  { href: "/admin/mailer/do-not-email", label: "Do-not-email" },
];

/** The mailer's own tabs, under the admin header. */
export function MailerTabs() {
  const pathname = usePathname();
  const active = (t: (typeof TABS)[number]) =>
    t.match
      ? t.match.some((m) => (m === "/admin/mailer" ? pathname === m : pathname.startsWith(m)))
      : pathname.startsWith(t.href);
  return (
    <nav aria-label="Mailer" className="-mx-1 overflow-x-auto">
      <ul className="flex w-max gap-1 border-b px-1">
        {TABS.map((t) => (
          <li key={t.href}>
            <Link
              href={t.href}
              prefetch={false}
              aria-current={active(t) ? "page" : undefined}
              className={cn(
                "-mb-px inline-flex h-10 items-center border-b-2 px-3 text-sm whitespace-nowrap transition-colors",
                active(t)
                  ? "border-primary text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground border-transparent",
              )}
            >
              {t.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
