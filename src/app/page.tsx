import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { ArrowRight, Check, MoveHorizontal, UserRound, Zap } from "lucide-react";
import { InstagramIcon } from "@/components/platform-icons";
import { PhotoBand, PlateLabel, PlateLabelText } from "@/components/landing/photo-band";
import {
  InstagramDmScreen,
  InstagramScreen,
  LinkedInScreen,
  YouTubeLandscapeScreen,
  YouTubeScreen,
} from "@/components/landing/device-screens";
import { AccountCta, NavAccount } from "@/components/landing/landing-account";
import { SeeItWorking } from "@/components/landing/see-it-working";
import { CalendarScreen } from "@/components/landing/calendar-screen";
import { FooterWordmark } from "@/components/landing/footer-wordmark";
import { CONTACT_EMAIL } from "@/components/marketing/site-chrome";
import { PLANS } from "@/lib/plans";
import { cn } from "@/lib/utils";

// Public marketing home, from the Figma "Landing · Poster (full)" design.
// Kept outside the (app) group so it renders for signed-out visitors; the app
// itself lives under /dashboard. It's static and served from the CDN; the
// links that depend on being signed in decide that in the browser.

export const metadata: Metadata = {
  title: "Cue - social media scheduling for agencies",
  description:
    "Cue is a social media scheduling tool for agencies. Plan, schedule, and publish posts to your clients' LinkedIn, Instagram, and YouTube accounts from one calendar.",
};

const SALES_EMAIL = "hello@trycue.space";

const NAV = [
  { href: "#how", label: "How it works" },
  { href: "#demo", label: "Clients" },
  { href: "#pricing", label: "Pricing" },
  { href: "/help", label: "Help centre" },
];

const DISPLAY = "font-display font-extrabold";

/** A small icon from public/landing/icons, at its design size. */
function Icon({ name, size, className }: { name: string; size: number; className?: string }) {
  return <Image src={`/landing/icons/${name}.svg`} alt="" width={size} height={size} unoptimized className={cn("shrink-0", className)} />;
}

function CheckDot({ className, iconClassName }: { className?: string; iconClassName?: string }) {
  return (
    <span className={cn("grid size-[22px] shrink-0 place-items-center rounded-full", className)}>
      <Check className={cn("size-[13px]", iconClassName)} strokeWidth={3} />
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Hero                                                                */
/* ------------------------------------------------------------------ */

function Nav() {
  return (
    <header className="absolute inset-x-0 top-0 z-20">
      <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-6 px-5 py-[22px] sm:px-8 xl:px-0">
        <Link href="/" aria-label="Cue home" className="flex items-center gap-2">
          <Icon name="cue-mark" size={26} />
          <span className="font-display text-2xl leading-none font-bold tracking-[-0.03em] text-white">cue</span>
        </Link>
        <nav aria-label="Site" className="hidden items-center gap-[30px] md:flex">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="text-[15px] font-medium text-white/85 transition-colors hover:text-white">
              {n.label}
            </Link>
          ))}
        </nav>
        <NavAccount />
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative isolate flex min-h-svh flex-col overflow-hidden bg-[#160f12] text-white">
      {/* The desk photo, composed for the screen's shape: the portrait one on
          upright phones and tablets, the wide one on landscape screens and
          from xl (pinned to its bottom edge, where it carries on below). */}
      <picture>
        <source media="(min-width: 1280px), (min-aspect-ratio: 5/4)" srcSet="/landing/hero.webp" />
        <img
          src="/landing/hero-portrait.webp"
          alt=""
          fetchPriority="high"
          className="pointer-events-none absolute inset-0 -z-10 size-full object-cover object-bottom select-none"
        />
      </picture>
      {/* The same shade as the photo bands below, so they meet without a step:
          even on phones and tablets, darker on the left from xl. Plus a fade
          under the nav. */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[rgb(18_13_26/0.55)] xl:bg-transparent xl:bg-linear-to-r xl:from-[rgb(18_13_26/0.9)] xl:via-[rgb(18_13_26/0.55)] xl:to-[rgb(18_13_26/0.25)]"
      />
      <div aria-hidden className="absolute inset-x-0 top-0 -z-10 h-[180px] bg-linear-to-b from-[rgb(18_13_26/0.55)] to-transparent" />
      <Nav />

      {/* Fills the screen. On tall screens the copy sits a little below
          centre, as in the design (top 248 of 880), with room for the cards. */}
      <div className="relative mx-auto flex w-full max-w-[1200px] flex-1 flex-col items-center justify-center gap-6 px-5 pt-32 pb-20 text-center sm:px-8 xl:px-0 xl:pt-28 xl:pb-16 tall:pt-[200px] tall:pb-[166px]">
        <p className="flex items-center gap-2 rounded-full border border-white/22 bg-white/12 px-3.5 py-[7px] text-sm font-medium">
          <span className="size-2 rounded-full bg-[#3ccb9a]" />
          Made for agencies with 2 to 50 clients
        </p>
        <h1 className={cn(DISPLAY, "text-[clamp(2.75rem,9vw,5.75rem)] leading-[0.96] tracking-[-0.035em] text-balance")}>
          <span className="sr-only">Cue, social media scheduling for agencies: </span>
          Your clients&apos; social, <br className="hidden sm:block" />
          finally in one <span className="text-[#a397ff]">happy place.</span>
        </h1>
        <p className="max-w-[700px] text-lg leading-[1.55] text-white/90 sm:text-xl">
          Connect each client&apos;s LinkedIn, Instagram and YouTube once. Then plan the week, get approvals and let
          Cue post everything right on time, with no more logging in and out.
        </p>
        <div className="flex flex-wrap justify-center gap-3 pt-2">
          <AccountCta
            label="Get started, it's free"
            className="rounded-[10px] bg-[#6d5bff] px-4 py-2.5 text-[15px] font-bold text-white transition-colors hover:bg-[#5b4bdb]"
          />
          <Link
            href="#how"
            className="rounded-[10px] border border-white/50 px-4 py-2.5 text-[15px] font-bold text-white transition-colors hover:bg-white/10"
          >
            See how it works
          </Link>
        </div>
      </div>

      {/* Wide screens: a post waiting to go out, and its first comment,
          held to the bottom of the screen (only where there's height for them). */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 mx-auto hidden h-[168px] max-w-[1200px] tall:block">
        <div className="absolute bottom-[44px] left-0 flex w-[340px] flex-col items-start gap-3 rounded-2xl bg-white p-3.5 drop-shadow-[0_20px_25px_rgb(20_15_36/0.35)]">
          <div className="flex w-full items-center gap-3">
            <Image src="/landing/sourdough.webp" alt="" width={52} height={52} unoptimized className="size-[52px] rounded-[10px] object-cover" />
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-bold text-[#1f1b2d]">Bloom Bakery</span>
              <span className="text-xs text-[#6b6680]">Instagram and YouTube · Fri 7:00</span>
            </div>
          </div>
          <span className="flex items-center gap-1.5 rounded-full bg-[rgb(109_91_255/0.12)] px-[11px] py-[5px] text-xs font-bold text-[#6d5bff]">
            <span className="size-[7px] rounded-full bg-[#6d5bff]" />
            Scheduled · goes out in 14 h
          </span>
        </div>
        <div className="absolute right-0 bottom-[86px] flex items-center gap-2.5 rounded-xl bg-white px-3.5 py-2.5 drop-shadow-[0_14px_18px_rgb(20_15_36/0.3)]">
          <CheckDot className="bg-[#ddf7ee] text-[#1e9e72]" />
          <span className="text-[13px] font-medium whitespace-nowrap text-[#1f1b2d]">First comment ready: #sourdough</span>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Multi-platform                                                      */
/* ------------------------------------------------------------------ */

/** A device screen drawn onto a recomposed photo: its top left at `x, y` and
 *  `w` wide, in the photo's pixels. `designW` is the screen's own width. */
function OnPhoto({ x, y, w, designW, children }: { x: number; y: number; w: number; designW: number; children: React.ReactNode }) {
  return (
    // Place in the photo's pixels first, then scale the screen inside (an em
    // offset on the scaled element itself would scale the offset too).
    <div className="absolute" style={{ left: `${x}em`, top: `${y}em` }}>
      <div className="relative" style={{ fontSize: `${(w / designW).toFixed(4)}em` }}>
        {children}
      </div>
    </div>
  );
}

/** A chip or card on a recomposed photo, at a point in % of the photo, at
 *  screen size (1em is about 1px inside). */
function PhotoPin({
  x,
  y,
  center,
  children,
}: {
  x: number;
  y: number;
  /** Centre on the point instead of hanging from it. */
  center?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn("absolute text-[0.9px] sm:text-[1px]", center && "-translate-x-1/2")}
      style={{ left: `${x}%`, top: `${y}%` }}
    >
      {children}
    </div>
  );
}

function MultiPlatform() {
  return (
    <PhotoBand
      id="how"
      photo="/landing/multi.webp"
      height={920}
      copyTop={150}
      mobile={{
        src: "/landing/multi-mobile.webp",
        w: 1024,
        h: 1536,
        plainTop: 0.15,
        screens: (
          <>
            <OnPhoto x={223} y={348} w={578} designW={300}>
              <YouTubeLandscapeScreen height={201.4} />
            </OnPhoto>
            <OnPhoto x={282} y={826} w={192} designW={115}>
              <LinkedInScreen height={257} />
            </OnPhoto>
            <OnPhoto x={551} y={826} w={192} designW={115}>
              <InstagramScreen height={256.4} />
            </OnPhoto>
          </>
        ),
        labels: (
          <>
            <PhotoPin x={49.9} y={20.6} center>
              <NetworkChip icon="label-yt" name="YouTube" />
            </PhotoPin>
            {/* No room between the tablet and the phones: below them instead. */}
            <PhotoPin x={36.9} y={84.5} center>
              <NetworkChip icon="label-li" name="LinkedIn" below />
            </PhotoPin>
            <PhotoPin x={63.2} y={84.5} center>
              <NetworkChip icon="label-ig" name="Instagram" below />
            </PhotoPin>
            <PhotoPin x={50} y={91.5} center>
              <LiveChip />
            </PhotoPin>
          </>
        ),
      }}
      tablet={{
        src: "/landing/multi-tablet.webp",
        w: 1536,
        h: 1024,
        plainTop: 0.278,
        screens: (
          <>
            <OnPhoto x={262} y={324} w={169} designW={115}>
              <LinkedInScreen height={249.7} />
            </OnPhoto>
            <OnPhoto x={520} y={324} w={168} designW={115}>
              <InstagramScreen height={251.2} />
            </OnPhoto>
            <OnPhoto x={783} y={335} w={485} designW={300}>
              <YouTubeLandscapeScreen height={212.8} />
            </OnPhoto>
          </>
        ),
        labels: (
          <>
            <PhotoPin x={22.6} y={30} center>
              <NetworkChip icon="label-li" name="LinkedIn" />
            </PhotoPin>
            <PhotoPin x={39.4} y={30} center>
              <NetworkChip icon="label-ig" name="Instagram" />
            </PhotoPin>
            <PhotoPin x={66.7} y={31} center>
              <NetworkChip icon="label-yt" name="YouTube" />
            </PhotoPin>
            <PhotoPin x={49.8} y={73} center>
              <LiveChip />
            </PhotoPin>
          </>
        ),
      }}
      plate={
        <>
          {/* Screens on the white screens found in the photo. */}
          <OnPhoto x={808} y={358} w={112} designW={115}>
            <LinkedInScreen height={259.8} />
          </OnPhoto>
          <OnPhoto x={964} y={358} w={112} designW={115}>
            <InstagramScreen height={259.8} />
          </OnPhoto>
          <OnPhoto x={1124} y={332} w={227} designW={227}>
            <YouTubeScreen height={274} />
          </OnPhoto>
          <PlateLabel className="top-[261em] left-[817em]">
            <Icon name="label-li" size={14} className="size-[14em]" />
            <PlateLabelText>LinkedIn</PlateLabelText>
          </PlateLabel>
          <PlateLabel className="top-[261em] left-[968em]">
            <Icon name="label-ig" size={14} className="size-[14em]" />
            <PlateLabelText>Instagram</PlateLabelText>
          </PlateLabel>
          <PlateLabel className="top-[255em] left-[1190em]">
            <Icon name="label-yt" size={14} className="size-[14em]" />
            <PlateLabelText>YouTube</PlateLabelText>
          </PlateLabel>
          <div className="absolute top-[641em] left-[992em]">
            <LiveChip />
          </div>
        </>
      }
    >
      <div className="flex max-w-[700px] flex-col items-start gap-[22px]">
        <p className="text-[15px] font-medium text-white/75">Multi-platform posting</p>
        <h2 className={cn(DISPLAY, "text-[clamp(2.75rem,8vw,5rem)] leading-[0.9] tracking-[-0.045em]")}>
          Write once.
          <br />
          Post everywhere.
        </h2>
        <p className="max-w-[540px] text-lg leading-[1.55] text-white/88 sm:text-[19px]">
          One post becomes a LinkedIn update, an Instagram post and a YouTube Short, each in the right shape, all going
          out at the same minute.
        </p>
        <ul className="flex flex-col gap-3 pt-1.5">
          {[
            "A tailored caption for each network",
            "First comment on Instagram and YouTube",
            "Images, Reels, Shorts, documents and polls",
          ].map((t) => (
            <li key={t} className="flex items-center gap-2.5 text-base font-medium sm:text-[17px]">
              <CheckDot className="bg-[#3ccb9a] text-white" />
              {t}
            </li>
          ))}
        </ul>
      </div>
    </PhotoBand>
  );
}

/** "LinkedIn" (etc.) over a device: hangs above the point it's pinned to. */
function NetworkChip({ icon, name, below }: { icon: string; name: string; below?: boolean }) {
  return (
    <PlateLabel className={cn("relative", !below && "-translate-y-[calc(100%+8em)]")}>
      <Icon name={icon} size={14} className="size-[14em]" />
      <PlateLabelText>{name}</PlateLabelText>
    </PlateLabel>
  );
}

function LiveChip() {
  return (
    <PlateLabel className="relative">
      <span className="size-[8em] rounded-full bg-[#3ccb9a]" />
      <PlateLabelText>Live on all three · 09:00</PlateLabelText>
    </PlateLabel>
  );
}

function AutoDmChip() {
  return (
    <PlateLabel className="relative">
      <span className="size-[8em] shrink-0 rounded-full bg-[#3ccb9a]" />
      <PlateLabelText>Auto-DM sent by Cue · 2 seconds after the comment</PlateLabelText>
    </PlateLabel>
  );
}

/** The comment, and Cue's reply under it. Sized in em. */
function CommentCard({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={cn("flex w-[440em] flex-col gap-[14em] rounded-[18em] bg-white p-[16em] text-[#1f1b2d] shadow-[0_20em_25em_rgb(13_10_26/0.35)]", className)}
      style={style}
    >
      <div className="flex items-center gap-[10em]">
        <Image src="/landing/gym.webp" alt="" width={40} height={40} unoptimized className="size-[40em] rounded-[8em] object-cover" />
        <div className="flex flex-1 flex-col">
          <span className="text-[14em] font-bold">northwind.gym</span>
          <span className="text-[12em] text-[#6b6680]">Free 7-day plan for beginners</span>
        </div>
        <InstagramIcon className="size-[16em] text-[#e4405f]" />
      </div>
      <div className="flex items-start gap-[10em]">
        <span className="grid size-[30em] shrink-0 place-items-center rounded-full bg-[#ff9a76] text-white">
          <span className="text-[11em] font-bold">PS</span>
        </span>
        <div className="flex flex-1 flex-col gap-[2em]">
          <span className="text-[14em] whitespace-pre">
            <b>priya.s</b>
            {"  GUIDE"}
          </span>
          <span className="text-[11em] text-[#6b6680]">2m · Reply</span>
        </div>
      </div>
      <div className="flex items-start gap-[10em] pl-[40em]">
        <span className="grid size-[30em] shrink-0 place-items-center rounded-full bg-[#10b981] text-white">
          <span className="text-[11em] font-bold">NG</span>
        </span>
        <div className="flex flex-1 flex-col items-start gap-[6em]">
          <span className="text-[14em] whitespace-pre-wrap">
            <b>northwind.gym</b>
            {"  Sent it to your DMs, Priya!"}
          </span>
          <span className="flex items-center gap-[6em] rounded-full bg-[#edeaff] px-[10em] py-[4em] text-[#5b4bdb]">
            <Zap className="size-[12em] fill-current" strokeWidth={0} />
            <span className="text-[11em] font-bold">Auto-reply by Cue</span>
          </span>
        </div>
      </div>
    </div>
  );
}

/** The lead it saved. Sized in em. */
function LeadCard({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={cn("flex w-[340em] items-center gap-[12em] rounded-[14em] bg-white px-[14em] py-[12em] text-[#1f1b2d] shadow-[0_14em_20em_rgb(13_10_26/0.3)]", className)}
      style={style}
    >
      <span className="grid size-[32em] shrink-0 place-items-center rounded-[10em] bg-[#ddf7ee] text-[#1e9e72]">
        <UserRound className="size-[16em]" strokeWidth={2.25} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col whitespace-nowrap">
        <span className="text-[13em] font-bold">New lead · Priya S.</span>
        <span className="truncate text-[12em] text-[#6b6680]">priya.s@… · tagged “7-day plan”</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Automations                                                         */
/* ------------------------------------------------------------------ */

const FUNNEL = [
  { n: "412", label: "commented the keyword" },
  { n: "398", label: "got a DM" },
  { n: "284", label: "opened the link", accent: true },
];

function Automations() {
  return (
    <PhotoBand
      id="automations"
      photo="/landing/automations.webp"
      height={980}
      copyTop={140}
      mobile={{
        src: "/landing/auto-mobile.webp",
        w: 1024,
        h: 1536,
        plainTop: 0.115,
        plainBottom: 0.36,
        screens: (
          <OnPhoto x={371} y={225} w={273} designW={186}>
            <InstagramDmScreen height={399.3} />
          </OnPhoto>
        ),
        labels: (
          <PhotoPin x={50} y={57} center>
            <AutoDmChip />
          </PhotoPin>
        ),
      }}
      tablet={{
        src: "/landing/auto-tablet.webp",
        w: 1536,
        h: 1024,
        plainTop: 0.094,
        screens: (
          <OnPhoto x={367} y={136} w={315} designW={186}>
            <InstagramDmScreen height={435.2} />
          </OnPhoto>
        ),
        labels: (
          <>
            <PhotoPin x={51} y={13}>
              <AutoDmChip />
            </PhotoPin>
            <PhotoPin x={54} y={26}>
              <CommentCard style={{ width: "min(440em, 42cqw)" }} />
            </PhotoPin>
            <PhotoPin x={60} y={68}>
              <LeadCard style={{ width: "min(340em, 36cqw)" }} />
            </PhotoPin>
          </>
        ),
      }}
      after={
        <div className="flex flex-col items-center gap-[14px] text-[1px]">
          <CommentCard className="w-full max-w-[440em]" />
          <LeadCard className="w-full max-w-[340em]" />
        </div>
      }
      plate={
        <>
          <OnPhoto x={908} y={134} w={188} designW={186}>
            <InstagramDmScreen height={388} />
          </OnPhoto>
          <div className="absolute top-[75em] left-[889em]">
            <AutoDmChip />
          </div>
          <CommentCard className="absolute top-[600em] left-[880em]" />
          <LeadCard className="absolute top-[850em] left-[980em]" />
        </>
      }
    >
      <div className="flex max-w-[720px] flex-col items-start gap-[22px]">
        <p className="flex items-center gap-2 text-[15px] font-medium text-white/80">
          <InstagramIcon className="size-4" />
          Instagram comment and DM automations
        </p>
        <h2 className={cn(DISPLAY, "text-[clamp(2.75rem,8vw,4.75rem)] leading-[0.92] tracking-[-0.04em]")}>
          Comment “GUIDE”.
          <br />
          Get the guide.
        </h2>
        <p className="max-w-[560px] text-lg leading-[1.55] text-white/88 sm:text-[19px]">
          When someone comments a keyword on a client&apos;s post, Cue replies under the comment and sends them the link
          by DM, in seconds. Every lead is saved, and anything odd waits for you.
        </p>
      </div>

      <div className="mt-14 flex flex-wrap items-end gap-x-9 gap-y-6 xl:absolute xl:top-[calc(var(--u)*720)] xl:mt-0">
        {FUNNEL.map((f, i) => (
          <div key={f.n} className="flex items-end gap-9">
            {i > 0 && <ArrowRight aria-hidden className="mb-6 hidden size-7 text-white/70 sm:block" />}
            <div className="flex flex-col gap-0.5 whitespace-nowrap">
              <span
                className={cn(
                  DISPLAY,
                  "text-[clamp(3.25rem,9vw,5.25rem)] leading-[0.95] tracking-[-0.03em]",
                  f.accent && "text-[#3ccb9a]",
                )}
              >
                {f.n}
              </span>
              <span className="text-[15px] font-medium text-white/75">{f.label}</span>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-8 text-[13px] font-medium text-white/60 xl:absolute xl:top-[calc(var(--u)*880)] xl:mt-0">
        Northwind Gym · last 30 days
      </p>
    </PhotoBand>
  );
}

/* ------------------------------------------------------------------ */
/* Calendar                                                            */
/* ------------------------------------------------------------------ */

function CalendarBand() {
  return (
    <section id="calendar" className="scroll-mt-4 overflow-hidden bg-[#ff9a76] px-5 pt-20 sm:px-8 sm:pt-[110px]">
      <div className="mx-auto max-w-[1200px]">
        <div className="flex flex-col gap-10 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-3.5 text-white">
            <p className="text-[15px] font-medium">Calendar management</p>
            <h2 className={cn(DISPLAY, "text-[clamp(2.75rem,8vw,5.75rem)] leading-[0.92] tracking-[-0.04em]")}>
              Your whole month,
              <br />
              in one view.
            </h2>
          </div>
          <div className="flex shrink-0 flex-col gap-3.5 lg:w-[400px]">
            <p className="text-lg leading-[1.55] text-white">
              Every client colour-coded on one calendar. Drag a post to another day and Cue moves it on every network it
              goes to.
            </p>
            <ul className="flex flex-col gap-3.5">
              {["Month, week and list views", "Filter by client, network or status", "Unscheduled drafts in a side drawer"].map(
                (t) => (
                  <li key={t} className="flex items-center gap-2.5 text-base font-medium text-white">
                    <CheckDot className="bg-white text-[#ff9a76]" />
                    {t}
                  </li>
                ),
              )}
            </ul>
          </div>
        </div>

        <div className="relative mt-12 rounded-t-[1.125rem] shadow-[0_-8px_50px_rgb(13_10_26/0.25)]">
          <CalendarScreen />
          <div
            aria-hidden
            className="absolute top-[78.3%] left-[65%] hidden items-center gap-3 rounded-xl bg-[#1f1b2d] py-2.5 pr-2.5 pl-4 text-white shadow-[0_14px_30px_rgb(20_15_36/0.35)] md:flex"
          >
            <MoveHorizontal className="size-4 text-[#a397ff]" />
            <span className="text-sm font-medium whitespace-nowrap">Moved to Thu 27 · 10:30</span>
            <span className="rounded-md bg-white/12 px-2.5 py-1 text-[13px] font-bold text-[#a397ff]">Undo</span>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* See it working                                                      */
/* ------------------------------------------------------------------ */

function Demo() {
  return (
    <section id="demo" className="scroll-mt-4 bg-[#f3f0fa] px-5 py-24 sm:px-8 sm:py-[120px] dark:bg-[#0e0c14]">
      <div className="mx-auto max-w-[1200px] text-center">
        <p className="text-muted-foreground inline-flex items-center gap-2 text-sm font-medium">
          <span className="size-2 rounded-full bg-[#1e9e72] dark:bg-[#3ccb9a]" />
          Live demo · real app, demo clients
        </p>
        <h2 className={cn(DISPLAY, "mt-9 text-[clamp(3rem,9vw,6.5rem)] leading-[1.05] tracking-[-0.045em]")}>
          See it working.
        </h2>
        <p className="text-muted-foreground mx-auto mt-9 max-w-[620px] text-lg leading-[1.6]">
          This is the real Cue dashboard with demo clients. Every tab below opens the actual screen.
        </p>
        <div className="text-left">
          <SeeItWorking />
        </div>
        <p className="text-muted-foreground mt-9 text-[13px]">No sign-up needed to look around.</p>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Pricing                                                             */
/* ------------------------------------------------------------------ */

const GB = 1024 * 1024 * 1024;
const PRICE_COLUMNS = ["Clients", "Teammates", "Posts a month", "Media"] as const;

function planNumbers(key: "FREE" | "PRO" | "AGENCY") {
  const l = PLANS[key].limits;
  return [
    String(l.clients),
    String(l.members),
    (l.postsPerMonth ?? 0).toLocaleString("en-IN"),
    `${Math.round((l.storageBytes ?? 0) / GB)} GB`,
  ];
}

const PRICE_ROWS = [
  {
    key: "FREE" as const,
    name: "Free",
    price: (
      <>
        <b className="text-foreground text-[17px] font-bold">₹0</b> forever, no card
      </>
    ),
    blurb: "For trying Cue with a couple of clients.",
  },
  {
    key: "PRO" as const,
    name: "Pro",
    price: <b className="text-[17px] font-bold">Priced on a call</b>,
    blurb: "For a growing agency desk.",
  },
  {
    key: "AGENCY" as const,
    name: "Agency",
    price: <b className="text-foreground text-[17px] font-bold">Priced on a call</b>,
    blurb: "For a full roster and a full team.",
  },
];

/** Columns of the price list on wide screens. */
const PRICE_GRID = "lg:grid lg:grid-cols-[300px_140px_150px_180px_180px_1fr] lg:items-center";

function PlanButton({ plan }: { plan: "FREE" | "PRO" | "AGENCY" }) {
  const base =
    "inline-flex items-center gap-2.5 rounded-full px-[22px] py-4 text-base font-bold whitespace-nowrap transition-opacity hover:opacity-90";
  if (plan === "FREE") {
    return (
      <AccountCta
        className={cn(base, "bg-foreground text-background")}
        label={
          <>
            Start free <ArrowRight className="inline size-[18px]" />
          </>
        }
      />
    );
  }
  return (
    <a
      href={`mailto:${SALES_EMAIL}?subject=${encodeURIComponent(`Cue ${PLANS[plan].label}`)}`}
      className={cn(
        base,
        plan === "PRO" ? "bg-white text-[#5b4bdb]" : "border-foreground text-foreground border-[1.5px]",
      )}
    >
      Talk to us <ArrowRight className="size-[18px]" />
    </a>
  );
}

function Pricing() {
  return (
    <section id="pricing" className="bg-[#fff8f2] dark:bg-background scroll-mt-4 px-5 py-24 sm:px-8 sm:py-[120px]">
      <div className="mx-auto max-w-[1200px]">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <h2 className={cn(DISPLAY, "text-[clamp(3rem,9vw,6.5rem)] leading-[0.96] tracking-[-0.04em]")}>
            <span className="block">Start free.</span>
            <span className="block text-[#6d5bff] dark:text-[#a397ff]">Grow into Pro.</span>
          </h2>
          <div className="flex flex-col items-start gap-[18px] lg:w-[380px] lg:pb-2.5">
            <p className="text-muted-foreground text-[19px] leading-[1.45]">
              Plans differ only in size. Every feature is in every plan, from the first day.
            </p>
            <p className="bg-card flex items-center gap-2 rounded-full border border-[#e8dcd2] px-4 py-2.5 text-[15px] font-medium dark:border-border">
              <CheckDot className="size-5 bg-[#1e9e72] text-white" />
              No card needed to start
            </p>
          </div>
        </div>

        <div className="mt-14">
          <div className={cn("hidden px-8 pb-3.5", PRICE_GRID)}>
            <span className="text-muted-foreground text-xs font-bold tracking-[0.1em] uppercase">Plan</span>
            {PRICE_COLUMNS.map((c) => (
              <span key={c} className="text-muted-foreground text-xs font-bold tracking-[0.1em] uppercase">
                {c}
              </span>
            ))}
          </div>
          <div className="bg-foreground h-0.5" />
          {PRICE_ROWS.map((row) => {
            const pro = row.key === "PRO";
            const numbers = planNumbers(row.key);
            return (
              <div
                key={row.key}
                className={cn(
                  "relative px-6 py-8 sm:px-8 lg:py-[34px]",
                  PRICE_GRID,
                  pro && "my-4 rounded-[28px] bg-[#6d5bff] text-white drop-shadow-[0_20px_24px_rgb(109_91_255/0.28)] lg:my-0",
                )}
              >
                {pro && (
                  <span className="absolute -top-[14px] left-5 rotate-6 rounded-full bg-[#ff9a76] px-4 py-2 text-sm font-bold text-[#4a1a10]">
                    Recommended
                  </span>
                )}
                <div className="flex flex-col gap-1.5">
                  <h3 className={cn(DISPLAY, "text-[4rem] leading-none tracking-[-0.03em]")}>{row.name}</h3>
                  <p className={cn("text-[15px]", pro ? "text-white" : "text-muted-foreground")}>{row.price}</p>
                  <p className={cn("text-[15px]", pro ? "text-white/80" : "text-muted-foreground")}>{row.blurb}</p>
                </div>
                {/* Phones: the four limits as a labelled grid. */}
                <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 lg:contents">
                  {numbers.map((n, i) => (
                    <div key={PRICE_COLUMNS[i]} className="lg:contents">
                      <dt
                        className={cn(
                          "text-xs font-bold tracking-[0.1em] uppercase lg:hidden",
                          pro ? "text-white/75" : "text-muted-foreground",
                        )}
                      >
                        {PRICE_COLUMNS[i]}
                      </dt>
                      <dd className="font-display text-[2rem] font-bold tracking-[-0.02em] lg:text-5xl">{n}</dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-6 lg:mt-0 lg:flex lg:justify-end">
                  <PlanButton plan={row.key} />
                </div>
              </div>
            );
          })}
          <div className="bg-foreground h-0.5" />
        </div>

        <div className="mt-14 flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <p className="font-display text-muted-foreground max-w-[820px] text-[clamp(1.5rem,3.4vw,2.125rem)] leading-[1.25] font-bold tracking-[-0.01em]">
            Every plan includes <span className="text-foreground">LinkedIn</span>,{" "}
            <span className="text-foreground">Instagram</span> and <span className="text-foreground">YouTube</span>, the{" "}
            <span className="text-foreground">calendar</span>, <span className="text-foreground">approvals</span> and the{" "}
            <span className="text-foreground">first comment</span>.
          </p>
          <div className="flex flex-col gap-1 pb-1.5 whitespace-nowrap">
            <span className="text-muted-foreground text-[15px] font-medium">Running more than 50 clients?</span>
            <a href={`mailto:${SALES_EMAIL}`} className="text-base font-bold hover:underline">
              {SALES_EMAIL}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Closing call to action and footer                                   */
/* ------------------------------------------------------------------ */

function Cta() {
  return (
    <section className="bg-[#5b4bdb] px-5 py-20 text-white sm:px-8 sm:py-[110px]">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-6">
        <h2 className={cn(DISPLAY, "text-[clamp(4rem,14vw,10rem)] leading-[0.9] tracking-[-0.06em]")}>Start free.</h2>
        <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-lg text-[#dcd6ff] sm:text-xl">Free for two clients. Your first post can go out tonight.</p>
          <AccountCta
            label="Create your workspace"
            className="rounded-[10px] bg-white px-6 py-3.5 text-base font-bold text-[#5b4bdb] transition-colors hover:bg-white/90"
          />
        </div>
      </div>
    </section>
  );
}

const FOOTER_COLUMNS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: "Product",
    links: [
      { href: "#calendar", label: "Calendar" },
      { href: "/help/write-a-post", label: "Compose" },
      { href: "#automations", label: "Automations" },
      { href: "#automations", label: "Reply Desk" },
      { href: "/help", label: "Link in bio" },
    ],
  },
  {
    title: "Networks",
    links: [
      { href: "/help/connect-linkedin", label: "LinkedIn" },
      { href: "/help/connect-instagram", label: "Instagram" },
      { href: "/help/connect-youtube", label: "YouTube" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/help", label: "Help centre" },
      { href: `mailto:${CONTACT_EMAIL}`, label: "Contact us" },
      { href: "/privacy", label: "Privacy" },
      { href: "/terms", label: "Terms" },
      { href: "/data-deletion", label: "Data deletion" },
    ],
  },
];

function Footer() {
  return (
    <footer className="isolate overflow-hidden bg-[#13111c] px-5 pt-20 sm:px-8 sm:pt-24">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-14">
        <div className="flex flex-col gap-12 lg:flex-row lg:justify-between">
          <div className="flex max-w-[420px] flex-col gap-[18px]">
            <Link href="/" aria-label="Cue home" className="flex items-center gap-2.5">
              <Icon name="cue-mark-footer" size={30} />
              <span className="font-display text-[28px] leading-none font-bold tracking-[-0.03em] text-white">cue</span>
            </Link>
            <p className="text-base leading-[1.6] text-[#b7b1cc]">
              Social media scheduling for agencies that run many clients. Plan, approve, publish and answer, from one
              place.
            </p>
            <div aria-hidden className="flex gap-2.5">
              {["li-white", "ig-white", "yt-white"].map((n) => (
                <span key={n} className="grid size-10 place-items-center rounded-xl bg-[#221e31]">
                  <Icon name={n} size={18} />
                </span>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-10 gap-y-10 sm:flex sm:gap-[72px]">
            {FOOTER_COLUMNS.map((col) => (
              <div key={col.title} className="flex flex-col gap-3.5">
                <p className="font-mono text-xs tracking-[0.06em] text-[#8e88a6] uppercase">{col.title}</p>
                <ul className="flex flex-col gap-3.5">
                  {col.links.map((l) => (
                    <li key={l.label}>
                      <Link href={l.href} className="text-base font-medium whitespace-nowrap text-[#e4e0f0] hover:text-white">
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-3 border-t border-[#2c2740] py-6 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[#8e88a6]">© 2026 Cue · Made in India · Hosted in Mumbai</p>
          <p className="flex flex-wrap items-center gap-2.5 font-medium text-[#b7b1cc]">
            <span className="size-2 rounded-full bg-[#3ccb9a]" />
            Official Meta, LinkedIn and Google APIs
            <span className="text-[#4a4460]">·</span>
            <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-white">
              {CONTACT_EMAIL}
            </a>
          </p>
        </div>
        {/* The giant wordmark, cut off by the bottom of the page. */}
        <FooterWordmark />
      </div>
    </footer>
  );
}

export default function HomePage() {
  return (
    <div className="bg-background text-foreground min-h-dvh overflow-x-clip">
      <main>
        <Hero />
        <MultiPlatform />
        <Automations />
        <CalendarBand />
        <Demo />
        <Pricing />
        <Cta />
      </main>
      <Footer />
    </div>
  );
}
