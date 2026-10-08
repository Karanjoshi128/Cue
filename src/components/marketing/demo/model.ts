import type { Platform } from "@prisma/client";

// A self-contained, in-browser copy of Cue's data, for the landing page demo.
// Every client and post here is fictional.

export type DemoStatus =
  | "DRAFT"
  | "SCHEDULED"
  | "PUBLISHING"
  | "PUBLISHED"
  | "FAILED";
export type DemoApproval = "APPROVED" | "PENDING" | "CHANGES_REQUESTED";
export type DemoView = "dashboard" | "compose" | "calendar" | "queue" | "clients";
export type DemoFilter = "ALL" | DemoStatus;

export interface DemoAccount {
  id: string;
  platform: Platform;
  handle: string;
  health: "ok" | "warn";
  healthLabel: string;
}

export interface DemoClient {
  id: string;
  name: string;
  color: string;
  accounts: DemoAccount[];
}

export interface DemoPost {
  id: string;
  clientId: string;
  body: string;
  title?: string;
  accountIds: string[];
  /** Epoch ms, or null for an unscheduled draft. */
  at: number | null;
  status: DemoStatus;
  approval: DemoApproval;
  image?: string;
  error?: string;
  notes: number;
}

export const DEMO_IMAGES = {
  latte: "/marketing/demo-latte.jpg",
  library: "/marketing/demo-library.jpg",
  plant: "/marketing/demo-plant.jpg",
};

export const SWATCHES = [
  "#196bf5",
  "#d6409f",
  "#f2701f",
  "#14a39a",
  "#5b6070",
  "#a8754d",
];

let seq = 0;
export const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${seq++}`;

const DAY = 86_400_000;

export function makeSeed(now: number): {
  clients: DemoClient[];
  posts: DemoPost[];
} {
  const clients: DemoClient[] = [
    {
      id: "fernwood",
      name: "Fernwood Coffee",
      color: "#8b5e3c",
      accounts: [
        { id: "fern_ig", platform: "INSTAGRAM", handle: "@fernwoodcoffee", health: "ok", healthLabel: "Connected" },
        { id: "fern_li", platform: "LINKEDIN", handle: "Fernwood Coffee", health: "warn", healthLabel: "Expires in 3d" },
      ],
    },
    {
      id: "atlas",
      name: "Atlas Architecture",
      color: "#23395b",
      accounts: [
        { id: "atlas_li", platform: "LINKEDIN", handle: "Atlas Architecture", health: "ok", healthLabel: "Valid 47d" },
        { id: "atlas_yt", platform: "YOUTUBE", handle: "Atlas Studio", health: "ok", healthLabel: "Connected" },
      ],
    },
    {
      id: "pulse",
      name: "Pulse Fitness",
      color: "#e5484d",
      accounts: [
        { id: "pulse_yt", platform: "YOUTUBE", handle: "Pulse Fitness", health: "ok", healthLabel: "Connected" },
        { id: "pulse_ig", platform: "INSTAGRAM", handle: "@pulse.fit", health: "ok", healthLabel: "Connected" },
        { id: "pulse_li", platform: "LINKEDIN", handle: "Pulse Fitness", health: "ok", healthLabel: "Valid 52d" },
      ],
    },
    {
      id: "verdant",
      name: "Verdant Plants",
      color: "#2f9e5b",
      accounts: [
        { id: "verd_ig", platform: "INSTAGRAM", handle: "@verdant.plants", health: "ok", healthLabel: "Connected" },
      ],
    },
    {
      id: "orbit",
      name: "Orbit Labs",
      color: "#7c4dff",
      accounts: [
        { id: "orbit_li", platform: "LINKEDIN", handle: "Orbit Labs", health: "ok", healthLabel: "Valid 31d" },
        { id: "orbit_yt", platform: "YOUTUBE", handle: "Orbit Labs", health: "ok", healthLabel: "Connected" },
      ],
    },
    {
      id: "halcyon",
      name: "Halcyon Health",
      color: "#0e8ac7",
      accounts: [
        { id: "hal_li", platform: "LINKEDIN", handle: "Halcyon Health", health: "ok", healthLabel: "Valid 47d" },
      ],
    },
  ];

  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  const day0 = midnight.getTime();
  // A wall-clock time `days` from today, e.g. at(2, 9, 30).
  const at = (days: number, h: number, m = 0) => day0 + days * DAY + (h * 60 + m) * 60_000;
  // The headline post is always just over two hours away.
  const nextCue = Math.ceil((now + 2 * 3600_000 + 13 * 60_000) / 300_000) * 300_000;

  const p = (
    clientId: string,
    accountIds: string[],
    body: string,
    when: number | null,
    status: DemoStatus,
    extra: Partial<DemoPost> = {},
  ): DemoPost => ({
    id: newId("post"),
    clientId,
    accountIds,
    body,
    at: when,
    status,
    approval: "APPROVED",
    notes: 0,
    ...extra,
  });

  const posts: DemoPost[] = [
    // History
    p("fernwood", ["fern_ig"], "Monday mornings smell like our new single-origin Ethiopia Guji. Notes of blueberry, jasmine and a long, clean finish.", at(-6, 8, 30), "PUBLISHED", { image: DEMO_IMAGES.latte }),
    p("atlas", ["atlas_li"], "Timber, concrete and a lot of patience. Notes from the site visit at Harbour Lane.", at(-5, 10), "PUBLISHED"),
    p("orbit", ["orbit_li"], "Hiring: a senior platform engineer who loves boring, reliable systems.", at(-4, 11), "PUBLISHED"),
    p("verdant", ["verd_ig"], "Low light, big personality. Meet the ZZ plant, the easiest housemate you'll ever have.", at(-3, 12), "PUBLISHED", { image: DEMO_IMAGES.plant }),
    p("halcyon", ["hal_li"], "Our Thursday clinics now stay open until 8 p.m.", at(-2, 9), "PUBLISHED"),
    p("pulse", ["pulse_ig"], "Mobility Monday: five stretches for desk-bound hips.", at(-1, 18, 30), "FAILED", { error: "Instagram rejected the media: aspect ratio must be between 4:5 and 1.91:1." }),
    p("fernwood", ["fern_li"], "Cold brew season isn't over until we say so. Batch of the week: Colombian Huila.", at(-1, 8), "PUBLISHED"),

    // Upcoming
    p("pulse", ["pulse_yt", "pulse_ig"], "20-minute full-body circuit, no equipment. Save this for the days you think you don't have time.", nextCue, "SCHEDULED", { title: "20-minute full-body circuit" }),
    p("atlas", ["atlas_li", "atlas_yt"], "We designed the Riverside Library around one idea: daylight should reach every reading table.", at(1, 9), "SCHEDULED", { title: "Riverside Library: designing for daylight", image: DEMO_IMAGES.library }),
    p("fernwood", ["fern_ig", "fern_li"], "Our latte art throwdown is back on Saturday. Bring your best tulip.", at(1, 17, 30), "SCHEDULED", { image: DEMO_IMAGES.latte }),
    p("halcyon", ["hal_li"], "Free health screenings at all three clinics this month. Book in under a minute.", at(2, 10), "SCHEDULED", { approval: "PENDING", notes: 2 }),
    p("verdant", ["verd_ig"], "Repotting doesn't have to be scary. Five signs your monstera is ready for a bigger home.", at(3, 12), "SCHEDULED", { image: DEMO_IMAGES.plant }),
    p("orbit", ["orbit_li", "orbit_yt"], "We just open-sourced our telemetry pipeline. 40k events a second on a single node, MIT licensed.", at(4, 14, 30), "SCHEDULED", { title: "Open-sourcing our telemetry pipeline" }),
    p("pulse", ["pulse_li"], "Leg day, but make it fun. Join the 6 a.m. crew this week.", at(5, 6), "SCHEDULED"),
    p("fernwood", ["fern_ig"], "The Guji is back. Blueberry, jasmine, long finish.", at(6, 8, 30), "SCHEDULED", { image: DEMO_IMAGES.latte }),
    p("atlas", ["atlas_yt"], "Behind the drawings: a walkthrough of the Hillside House, from first sketch to final pour.", at(8, 11), "SCHEDULED", { title: "Hillside House walkthrough" }),
    p("orbit", ["orbit_li"], "What we learned running 200 Postgres replicas.", at(9, 15), "SCHEDULED", { approval: "CHANGES_REQUESTED", notes: 1 }),
    p("verdant", ["verd_ig"], "Pet-safe plants for small flats: our top seven.", at(10, 12), "SCHEDULED"),
    p("halcyon", ["hal_li"], "Five questions to ask at your next check-up.", at(12, 9, 30), "SCHEDULED"),
    p("pulse", ["pulse_yt"], "Ten-minute core finisher you can do anywhere.", at(13, 7), "SCHEDULED", { title: "Ten-minute core finisher" }),
    p("fernwood", ["fern_li"], "Meet our roaster, Anjali, and the cupping table where every bean starts.", at(15, 9), "SCHEDULED"),

    // Drafts
    p("orbit", ["orbit_li"], "Draft: our 2027 roadmap, in public.", null, "DRAFT"),
    p("verdant", ["verd_ig"], "Draft: autumn care guide for fiddle-leaf figs.", null, "DRAFT"),
  ];

  return { clients, posts };
}

export function platformsOf(post: DemoPost, clients: DemoClient[]): Platform[] {
  const client = clients.find((c) => c.id === post.clientId);
  const set = new Set<Platform>();
  for (const id of post.accountIds) {
    const acct = client?.accounts.find((a) => a.id === id);
    if (acct) set.add(acct.platform);
  }
  return [...set];
}

export const DAY_MS = DAY;
