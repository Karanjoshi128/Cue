import {
  Bell,
  CalendarDays,
  ChevronDown,
  CircleHelp,
  LayoutGrid,
  Link2,
  ListOrdered,
  MessagesSquare,
  PenLine,
  Plus,
  Search,
  Settings,
  Sun,
  Users,
  Zap,
} from "lucide-react";
import type { Platform } from "@prisma/client";
import { PLATFORM_META, PlatformIcon } from "@/components/post-bits";
import { cn } from "@/lib/utils";

/*
 * The calendar band's picture of the app: the week view from the Figma
 * "Screen · App · Calendar" frame, drawn in code so it stays sharp and follows
 * light and dark. It is a fixed 1200x600 design scaled to its box: 1em is one
 * design pixel (the box's font size is its width / 1200), so every size below
 * is in em. Font sizes sit only on text elements.
 */

const CLIENTS = {
  bloom: { name: "Bloom Bakery", color: "#f59e0b" },
  northwind: { name: "Northwind Gym", color: "#10b981" },
  kite: { name: "Kite Studio", color: "#8b5cf6" },
  sage: { name: "Sage Dental", color: "#06b6d4" },
  atlas: { name: "Atlas Realty", color: "#f43f5e" },
} as const;
type ClientKey = keyof typeof CLIENTS;

type Status = "failed" | "approval" | "draft";
const STATUS: Record<Status, { label: string; color: string }> = {
  failed: { label: "Failed", color: "#f25f7a" },
  approval: { label: "Needs approval", color: "#e0a100" },
  draft: { label: "Draft", color: "#8b87a0" },
};

interface Card {
  time: string;
  platform: Platform;
  title: string;
  client: ClientKey;
  status?: Status;
}

const WEEK: { day: string; date: number; today?: boolean; cards: Card[] }[] = [
  {
    day: "Mon",
    date: 24,
    cards: [
      { time: "09:00", platform: "INSTAGRAM", title: "Sourdough drop", client: "bloom" },
      { time: "14:00", platform: "LINKEDIN", title: "New listings", client: "atlas" },
    ],
  },
  {
    day: "Tue",
    date: 25,
    cards: [
      { time: "10:30", platform: "LINKEDIN", title: "Coach Q&A", client: "northwind" },
      { time: "18:00", platform: "YOUTUBE", title: "Brand film BTS", client: "kite", status: "failed" },
    ],
  },
  {
    day: "Wed",
    date: 26,
    cards: [
      { time: "09:00", platform: "INSTAGRAM", title: "Whitening myths", client: "sage" },
      { time: "12:00", platform: "YOUTUBE", title: "Croissant fold", client: "bloom" },
      { time: "16:30", platform: "LINKEDIN", title: "Market update", client: "atlas" },
    ],
  },
  {
    day: "Thu",
    date: 27,
    today: true,
    cards: [
      { time: "09:00", platform: "INSTAGRAM", title: "Weekend menu", client: "bloom" },
      { time: "10:30", platform: "LINKEDIN", title: "Member story", client: "northwind", status: "approval" },
      { time: "12:00", platform: "YOUTUBE", title: "Studio tour", client: "kite" },
      { time: "17:45", platform: "LINKEDIN", title: "Open house", client: "atlas" },
    ],
  },
  {
    day: "Fri",
    date: 28,
    cards: [
      { time: "11:00", platform: "INSTAGRAM", title: "Smile series", client: "sage" },
      { time: "17:45", platform: "INSTAGRAM", title: "Friday WOD", client: "northwind", status: "draft" },
    ],
  },
  {
    day: "Sat",
    date: 29,
    cards: [{ time: "10:00", platform: "INSTAGRAM", title: "Saturday class", client: "northwind" }],
  },
  {
    day: "Sun",
    date: 30,
    cards: [{ time: "19:00", platform: "YOUTUBE", title: "Shorts: crumbs", client: "bloom", status: "draft" }],
  },
];

const NAV = [
  { section: "Publish" },
  { label: "Dashboard", Icon: LayoutGrid },
  { label: "Compose", Icon: PenLine },
  { label: "Calendar", Icon: CalendarDays, active: true },
  { label: "Queue", Icon: ListOrdered },
  { section: "Engage" },
  { label: "Reply Desk", Icon: MessagesSquare },
  { label: "Automations", Icon: Zap },
  { label: "Link in bio", Icon: Link2 },
  { section: "Manage" },
  { label: "Clients", Icon: Users },
  { label: "Settings", Icon: Settings },
  { label: "Help", Icon: CircleHelp },
] as const;

/** Text at a design size, in em. */
function T({ size, className, children }: { size: number; className?: string; children: React.ReactNode }) {
  return (
    <span className={cn("leading-normal whitespace-nowrap", className)} style={{ fontSize: `${size}em` }}>
      {children}
    </span>
  );
}

function Badge({ platform, pad }: { platform: Platform; pad: number }) {
  return (
    <span
      className="flex shrink-0 rounded-[6.02em]"
      style={{
        padding: `${pad}em`,
        backgroundColor: `color-mix(in oklch, ${PLATFORM_META[platform].color} 13%, transparent)`,
      }}
    >
      <PlatformIcon platform={platform} brand className="size-[13.76em]" />
    </span>
  );
}

function PostCard({ card }: { card: Card }) {
  const client = CLIENTS[card.client];
  const status = card.status && STATUS[card.status];
  return (
    <div
      className="flex w-full flex-col items-start gap-[5.16em] rounded-[8.6em] border-l-[2.58em] py-[8.6em] pr-[8.6em] pl-[10.32em]"
      style={{
        borderColor: client.color,
        backgroundColor: `color-mix(in oklch, ${client.color} 9%, transparent)`,
      }}
    >
      <div className="flex w-full items-center justify-between">
        <T size={9.46} className="text-muted-foreground font-mono">
          {card.time}
        </T>
        <Badge platform={card.platform} pad={2.58} />
      </div>
      <T size={11.18} className="font-bold">
        {card.title}
      </T>
      <T size={9.46} className="text-muted-foreground">
        {client.name}
      </T>
      {status && (
        <span
          className="flex items-center gap-[5.16em] rounded-full px-[9.46em] py-[4.3em]"
          style={{ backgroundColor: `color-mix(in oklch, ${status.color} 12%, transparent)`, color: status.color }}
        >
          <span className="size-[6.02em] rounded-full bg-current" />
          <T size={10.32} className="font-bold">
            {status.label}
          </T>
        </span>
      )}
    </div>
  );
}

function Sidebar() {
  return (
    <div className="bg-card flex w-[213.28em] shrink-0 flex-col gap-[3.44em] self-stretch rounded-[8.6em] border-[0.86em] px-[12.04em] pt-[17.2em] pb-[12.04em]">
      <div className="flex items-center gap-[6.88em] px-[6.88em] pb-[12.04em]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/landing/icons/cue-mark-violet.svg" alt="" className="size-[22.36em]" />
        <T size={20.64} className="font-display font-bold tracking-[-0.03em]">
          cue
        </T>
      </div>
      <div className="bg-primary flex w-full items-center justify-between rounded-[8.6em] py-[9.46em] pr-[10.32em] pl-[12.04em] text-white">
        <span className="flex items-center gap-[6.88em]">
          <Plus className="size-[13.76em]" strokeWidth={2.5} />
          <T size={12.04} className="font-bold">
            New post
          </T>
        </span>
        <span className="rounded-[5.16em] bg-white/22 px-[6.02em] py-[0.86em]">
          <T size={9.46} className="font-mono">
            N
          </T>
        </span>
      </div>
      {NAV.map((item) =>
        "section" in item ? (
          <div key={item.section} className="px-[10.32em] pt-[13.76em] pb-[3.44em]">
            <T size={9.46} className="font-bold tracking-[0.08em] text-[#a19cb4] uppercase">
              {item.section}
            </T>
          </div>
        ) : (
          <div
            key={item.label}
            className={cn(
              "flex w-full items-center gap-[9.46em] rounded-[6.88em] px-[10.32em] py-[7.74em]",
              "active" in item && "bg-secondary text-primary",
            )}
          >
            <item.Icon className="size-[15.48em]" strokeWidth={1.75} />
            <T size={12.04} className={"active" in item ? "font-bold" : "font-medium"}>
              {item.label}
            </T>
          </div>
        ),
      )}
      <div className="h-[20.64em] shrink-0" />
      <div className="bg-background flex w-full flex-col gap-[3.44em] rounded-[10.32em] p-[12.04em]">
        <span className="flex items-center gap-[5.16em]">
          <span className="bg-live size-[6.02em] rounded-full" />
          <T size={9.46} className="text-muted-foreground font-bold tracking-[0.08em] uppercase">
            Next cue
          </T>
        </span>
        <T size={12.04} className="font-bold">
          Bloom Bakery · 9:00
        </T>
        <T size={10.32} className="text-muted-foreground">
          Instagram · in 42 min
        </T>
      </div>
    </div>
  );
}

function TopBar() {
  return (
    <div className="bg-card flex w-full items-center justify-between rounded-[10.32em] border-[0.86em] py-[8.6em] pr-[8.6em] pl-[17.2em]">
      <div className="flex items-center gap-[8.6em]">
        <T size={12.04} className="text-muted-foreground font-medium">
          Karan&apos;s workspace
        </T>
        <T size={12.04} className="text-muted-foreground/50">
          /
        </T>
        <span className="bg-background flex items-center gap-[6.02em] rounded-[8.6em] px-[10.32em] py-[5.16em]">
          <span className="bg-muted-foreground/40 size-[6.88em] rounded-full" />
          <T size={12.04} className="font-bold">
            All clients
          </T>
          <ChevronDown className="text-muted-foreground size-[12.04em]" />
        </span>
        <T size={12.04} className="text-muted-foreground/50">
          /
        </T>
        <T size={12.04} className="font-bold">
          Calendar
        </T>
      </div>
      <div className="flex items-center gap-[6.88em]">
        <span className="bg-background flex items-center gap-[8.6em] rounded-[8.6em] py-[7.74em] pr-[8.6em] pl-[12.04em]">
          <Search className="text-muted-foreground size-[13.76em]" />
          <T size={12.04} className="text-muted-foreground">
            Search or jump to…
          </T>
          <span className="bg-card rounded-[5.16em] border-[0.86em] px-[6.02em] py-[1.72em]">
            <T size={9.46} className="text-muted-foreground font-mono">
              Ctrl K
            </T>
          </span>
        </span>
        <span className="bg-background rounded-full p-[7.74em]">
          <Bell className="size-[15.48em]" strokeWidth={1.75} />
        </span>
        <span className="bg-background rounded-full p-[7.74em]">
          <Sun className="size-[15.48em]" strokeWidth={1.75} />
        </span>
      </div>
    </div>
  );
}

function Toolbar() {
  const box = "bg-card flex items-center rounded-[8.6em] border-[0.86em]";
  return (
    <>
      <div className="flex w-full items-center justify-between">
        <div className="flex items-center gap-[10.32em]">
          <T size={27.52} className="font-display font-bold tracking-[-0.02em]">
            24 Nov to 30 Nov
          </T>
          <div className="flex items-center gap-[5.16em]">
            {["‹", "›"].map((c) => (
              <span key={c} className={cn(box, "px-[10.32em] py-[5.16em]")}>
                <T size={13.76} className="font-bold">
                  {c}
                </T>
              </span>
            ))}
            <span className={cn(box, "px-[13.76em] py-[8.6em]")}>
              <T size={12.9} className="font-bold">
                Today
              </T>
            </span>
          </div>
        </div>
        <div className="flex items-center gap-[8.6em]">
          <div className="bg-muted flex gap-[1.72em] rounded-[8.6em] p-[3.44em]">
            {["Month", "Week", "List"].map((v) => (
              <span
                key={v}
                className={cn(
                  "rounded-[6.88em] border-[0.86em] px-[12.04em] py-[6.02em]",
                  v === "Week" ? "bg-card" : "text-muted-foreground border-transparent",
                )}
              >
                <T size={11.18} className="font-medium">
                  {v}
                </T>
              </span>
            ))}
          </div>
          <span className="bg-secondary text-primary rounded-[8.6em] px-[13.76em] py-[8.6em]">
            <T size={12.9} className="font-bold">
              Unscheduled · 4
            </T>
          </span>
          <span className="bg-primary rounded-[8.6em] px-[13.76em] py-[8.6em] text-white">
            <T size={12.9} className="font-bold whitespace-pre">
              {"+  New post"}
            </T>
          </span>
        </div>
      </div>
      <div className="flex w-full items-center gap-[6.88em]">
        <T size={11.18} className="text-muted-foreground font-medium">
          Showing
        </T>
        {Object.values(CLIENTS).map((c) => (
          <span key={c.name} className="bg-card flex items-center gap-[6.02em] rounded-[6.88em] border-[0.86em] px-[10.32em] py-[5.16em]">
            <span className="size-[7.74em] rounded-full" style={{ backgroundColor: c.color }} />
            <T size={11.18} className="font-medium">
              {c.name}
            </T>
          </span>
        ))}
        <span className="flex-1" />
        {(["LINKEDIN", "INSTAGRAM", "YOUTUBE"] as const).map((p) => (
          <Badge key={p} platform={p} pad={5.16} />
        ))}
      </div>
    </>
  );
}

function WeekGrid() {
  return (
    <div className="bg-card flex h-[550.4em] w-full overflow-hidden rounded-[12.04em] border-[0.86em]">
      {WEEK.map((d, i) => (
        <div
          key={d.day}
          className={cn(
            "flex h-full min-w-0 flex-1 flex-col gap-[8.6em] px-[8.6em] pb-[15.48em]",
            i < WEEK.length - 1 && "border-border/70 border-r-[0.86em]",
            d.today && "bg-[#fbfaff] dark:bg-[#1e1a2c]",
          )}
        >
          <div className="flex w-full items-center justify-between px-[3.44em] pt-[13.76em] pb-[6.88em]">
            <span className="flex items-center gap-[5.16em]">
              <T size={11.18} className="text-muted-foreground font-medium">
                {d.day}
              </T>
              {d.today ? (
                <span className="bg-primary rounded-full px-[6.88em] py-[1.72em] text-white">
                  <T size={11.18} className="font-bold">
                    {d.date}
                  </T>
                </span>
              ) : (
                <T size={11.18} className="font-bold">
                  {d.date}
                </T>
              )}
            </span>
            {d.today && (
              <span className="bg-secondary text-primary rounded-full px-[6.88em] py-[1.72em]">
                <T size={9.46} className="font-bold">
                  Today
                </T>
              </span>
            )}
          </div>
          {d.cards.map((c) => (
            <PostCard key={c.title} card={c} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CalendarScreen({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("@container relative w-full overflow-hidden rounded-t-[1.125rem]", className)}
      style={{ aspectRatio: "2 / 1" }}
    >
      <div
        className="bg-background text-foreground absolute top-0 flex w-[1238.4em] items-start gap-[13.76em] p-[13.76em]"
        style={{ fontSize: "calc(100cqw / 1200)", left: "-10em" }}
      >
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col gap-[17.2em]">
          <TopBar />
          <div className="flex w-full flex-col gap-[15.48em] px-[6.88em] pt-[6.88em]">
            <Toolbar />
            <WeekGrid />
          </div>
        </div>
      </div>
    </div>
  );
}
