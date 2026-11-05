import { CalendarDays, Gauge, ListOrdered } from "lucide-react";
import type { HelpGuide } from "../types";

export const calendar: HelpGuide = {
  slug: "calendar",
  group: "planning",
  icon: CalendarDays,
  title: "Use the calendar",
  summary:
    "See every client's posts by week or month, filter them, drag to reschedule, and plan from the Unscheduled drawer.",
  keywords: ["week view", "month view", "drag and drop", "reschedule", "unscheduled", "plan", "filter"],
  screens: ["src/app/(app)/calendar/page.tsx", "src/components/calendar/"],
  related: ["change-a-post", "queue", "write-a-post"],
  sections: [
    {
      id: "views",
      shot: {"id": "calendar-week", "path": "/calendar", "alt": "The calendar's week view with posts in each client's colour."},
      title: "Views",
      table: {
        head: ["View", "Shows"],
        rows: [
          ["**Week** (default)", "Seven days with times. Best for planning a week in detail."],
          ["**Month**", "The whole month at a glance."],
          ["**List**", "Everything coming up over the next six months, in order."],
        ],
      },
      points: [
        "Use the arrows to go back or forward, **Today** to return, or pick a date to jump to it.",
        "On a phone, Week and Month show as a simple list of days.",
        "Switch between **Comfortable** and **Compact** to fit more on screen.",
      ],
    },
    {
      id: "filters",
      title: "Filter what you see",
      points: [
        "**Client**: one client, or **All clients**. This follows the client switcher at the top of the page.",
        "The network buttons: show only LinkedIn, Instagram or YouTube posts.",
        "**Any status**: pick Scheduled, Draft, Published, Failed or Needs approval.",
        "**Clear** resets the filters.",
      ],
      tips: ["The calendar remembers your view and filters on this device."],
    },
    {
      id: "plan",
      title: "Plan posts",
      steps: [
        {
          text: "Click an empty slot to write a post for that time. The composer opens with the date (and, in week view, the time) filled in.",
        },
        {
          text: "Drag a post to move it. Hold `Alt` while dropping to copy it as a draft instead. See [Edit, move, copy or delete a post](/help/change-a-post).",
        },
        {
          text: "Click a post to see its details: each account's status and any error, plus **Edit**, **Retry**, **Duplicate**, **Copy link** and **Delete**.",
        },
      ],
      tips: [
        "Times in the past can't be clicked or dropped on.",
        "When a client has nothing planned, a chip says so. Click it to write a post for them.",
      ],
    },
    {
      id: "unscheduled",
      title: "The Unscheduled drawer",
      intro: "Click **Unscheduled** (or press `U`) to see posts that need a decision:",
      points: [
        "**Needs attention**: posts that failed in the last 14 days.",
        "**Waiting for approval**: posts in review.",
        "**No date yet**: drafts without a time. Drag one onto the calendar to plan it.",
      ],
    },
    {
      id: "keys",
      title: "Calendar keys",
      table: {
        head: ["Press", "To"],
        rows: [
          ["`T`", "Go to today"],
          ["`←` / `→`", "Previous / next week or month"],
          ["`W` / `M` / `L`", "Week / Month / List view"],
          ["`C`", "Switch density"],
          ["`U`", "Open or close Unscheduled"],
        ],
      },
    },
  ],
};

export const queue: HelpGuide = {
  slug: "queue",
  group: "planning",
  icon: ListOrdered,
  title: "Use the queue",
  summary:
    "Every post as a list, in order, with what needs attention at the top. Approve, edit, retry and leave notes here.",
  keywords: ["list", "failed posts", "retry", "drafts", "published", "search posts", "overdue"],
  screens: ["src/app/(app)/queue/page.tsx", "src/components/queue-list.tsx"],
  related: ["approvals-and-notes", "why-did-my-post-fail", "change-a-post"],
  sections: [
    {
      id: "tabs",
      shot: {"id": "queue-page", "path": "/queue", "alt": "The queue: status tabs, search, and posts that need attention at the top."},
      title: "Tabs and search",
      points: [
        "Tabs across the top filter by status: **All**, **Drafts**, **Scheduled**, **Publishing**, **Published**, **Partial**, **Failed**. Each shows a count.",
        "**Search posts or clients** finds a post by its words or its client's name.",
      ],
    },
    {
      id: "sections",
      title: "How it's ordered",
      table: {
        head: ["Section", "Holds"],
        rows: [
          ["**Needs attention**", "Failed, partly sent, or waiting on approval."],
          ["**Overdue**", "Scheduled posts whose time has passed and that haven't gone out yet."],
          ["**Today**, **Tomorrow**, then each date", "What's coming up."],
          ["**Drafts**", "Not scheduled to go out."],
          ["**Published**", "Latest first."],
        ],
      },
    },
    {
      id: "actions",
      title: "What you can do with a post",
      table: {
        head: ["Button", "Does"],
        rows: [
          ["**Edit**", "Opens it in the composer (drafts and scheduled posts only)."],
          [
            "**Retry**",
            "For **Failed** or **Partial** posts: tries the failed accounts again straight away.",
          ],
          ["**Delete**", "Removes it from Cue. Anything already published stays live."],
          ["**View ↗**", "Opens the published post on that network."],
          ["**Send for approval** / **Approve**", "See [Approvals and notes](/help/approvals-and-notes)."],
          ["**Note**", "Leave a note for your team on this post."],
        ],
      },
      tips: [
        "A failed post shows the reason at the top of its card. [Why did my post fail?](/help/why-did-my-post-fail) explains each one.",
      ],
    },
  ],
};

export const dashboard: HelpGuide = {
  slug: "dashboard",
  group: "planning",
  icon: Gauge,
  title: "Read the dashboard",
  summary: "What each part of the dashboard tells you, and what to do about it.",
  keywords: ["home", "overview", "stats", "faults", "on standby", "needs attention", "roster"],
  screens: ["src/app/(app)/dashboard/page.tsx"],
  related: ["queue", "calendar", "account-health"],
  sections: [
    {
      id: "tiles",
      shot: {"id": "dashboard", "path": "/dashboard", "alt": "The dashboard: next cue countdown, the four tiles and the next two weeks."},
      title: "The four numbers",
      table: {
        head: ["Tile", "Counts"],
        rows: [
          ["**On standby**", "Posts scheduled to publish."],
          ["**Gone live**", "Posts published, all time."],
          [
            "**Faults**",
            "Failed sends that need a retry. It counts accounts, so one post that failed on two accounts counts as 2.",
          ],
          ["**Clients**", "Your clients, and how many accounts are connected."],
        ],
      },
      tips: ["Click a tile to open the matching list in the queue."],
    },
    {
      id: "panels",
      title: "The rest of the page",
      points: [
        "**Next cue**: a countdown to the next post going out.",
        "**The next two weeks**: each mark is a post, in its client's colour. Click a day to open that week on the calendar, or an empty day to write a post for it.",
        "**Run of show**: the next few posts. **Full schedule** opens the calendar list.",
        "**Needs attention**: failed posts, accounts to reconnect (expiring within 7 days or disconnected), posts awaiting approval, and drafts.",
        "**Roster**: each client and how many posts are queued for them.",
      ],
      tips: [
        "Use the client switcher at the top to see the dashboard for a single client.",
        "New workspaces also see a three-step setup checklist. See [Set up your workspace](/help/set-up-your-workspace).",
      ],
    },
  ],
};

export const planningGuides = [calendar, queue, dashboard];
