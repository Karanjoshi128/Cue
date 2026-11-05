import { Compass, KeyRound, Rocket, Sparkles } from "lucide-react";
import type { HelpGuide } from "../types";

export const whatCueDoes: HelpGuide = {
  slug: "what-cue-does",
  group: "start",
  icon: Sparkles,
  title: "What Cue does",
  summary:
    "The four things Cue is built around (workspaces, clients, accounts and posts) and how a post gets from Compose to LinkedIn, Instagram or YouTube.",
  keywords: ["overview", "introduction", "how it works", "basics", "workspace", "client"],
  screens: ["src/app/(app)/dashboard/page.tsx"],
  related: ["set-up-your-workspace", "find-your-way-around"],
  sections: [
    {
      id: "the-idea",
      title: "The idea",
      intro:
        "Cue is a scheduler for agencies. You write a post once, choose which of a client's social accounts it goes to, pick a time, and Cue publishes it for you. Everything for every client sits in one calendar.",
    },
    {
      id: "four-things",
      title: "The four things to know",
      table: {
        head: ["Thing", "What it is"],
        rows: [
          [
            "Workspace",
            "Your agency's space in Cue. Your team, clients and posts live here. One person can belong to more than one workspace.",
          ],
          [
            "Client",
            "A brand you post for, like a café or a law firm. Each client has a name and a colour, so you can tell them apart in the calendar.",
          ],
          [
            "Account",
            "A client's LinkedIn profile or Page, Instagram account or YouTube channel, connected to Cue. Cue can only publish to accounts that are connected.",
          ],
          [
            "Post",
            "What you write: the caption, any pictures or video, and when it should go out. One post can go to several accounts at once.",
          ],
        ],
      },
    },
    {
      id: "journey",
      title: "How a post travels",
      steps: [
        { text: "You add a client on the **Clients** page." },
        {
          text: "Someone who manages that client's social account connects it. They sign in on LinkedIn, Instagram or Google and agree to let Cue post. Cue never sees their password.",
        },
        {
          text: "You open **Compose**, pick the client and the accounts, write the post and choose a time.",
        },
        {
          text: "At that time Cue publishes it. Cue checks for posts that are due about every 5 minutes, so a post can go out a few minutes after the time you picked.",
        },
        {
          text: "The post's status changes to **Published**, and **View ↗** opens it on the network.",
        },
      ],
      tips: [
        "Nothing is posted until you press **Schedule** or **Post now**. Drafts never publish.",
      ],
    },
  ],
};

export const signIn: HelpGuide = {
  slug: "sign-in",
  group: "start",
  icon: KeyRound,
  title: "Sign in",
  summary: "Cue has no passwords. You sign in with a one-time code sent to your email.",
  keywords: ["login", "log in", "code", "otp", "password", "email code"],
  screens: ["src/app/login/page.tsx", "src/components/login-form.tsx"],
  related: ["accept-an-invite", "set-up-your-workspace"],
  sections: [
    {
      id: "steps",
      title: "Sign in with an email code",
      steps: [
        { text: "Go to `trycue.space` and click **Sign in**." },
        {
          text: "Type your work email in **Work email** and click **Email me a sign-in code**.",
        },
        {
          text: "Open the email from Cue and copy the code. It's a number, 6 to 10 digits long.",
        },
        {
          text: "Paste it into **Sign-in code** and click **Verify and sign in**.",
        },
      ],
      tips: [
        "Use the same email your teammate invited. Invites belong to one email address.",
        "Signing in on a new device works the same way. There's nothing to remember.",
      ],
    },
    {
      id: "trouble",
      title: "If it doesn't work",
      faq: [
        {
          q: "The code never arrived.",
          a: "Check your spam or promotions folder. Then click **Resend code**. You can ask for a new one once a minute; the button counts down until then.",
        },
        {
          q: "I typed the wrong email.",
          a: "Click **Different email** under the code box and start again.",
        },
        {
          q: "The code says it's invalid or expired.",
          a: "Codes only work once and for a short time. Ask for a new one with **Resend code** and use the newest email.",
        },
      ],
    },
  ],
};

export const setUpYourWorkspace: HelpGuide = {
  slug: "set-up-your-workspace",
  group: "start",
  icon: Rocket,
  title: "Set up your workspace",
  summary:
    "Create your workspace, then finish the three-step checklist on the dashboard: add a client, connect an account, schedule a post.",
  keywords: ["onboarding", "getting started", "first steps", "checklist", "create workspace"],
  screens: ["src/app/onboarding/page.tsx", "src/app/(app)/dashboard/page.tsx"],
  related: ["add-a-client", "connect-linkedin", "write-a-post", "invite-teammates"],
  sections: [
    {
      id: "create",
      title: "Create your workspace",
      intro:
        "The first time you sign in, Cue asks whether you're joining a team or starting your own.",
      steps: [
        {
          text: "If a teammate invited you, their invite is shown. Click **Accept** to join their workspace.",
        },
        {
          text: "To start your own, click **Create my own workspace**.",
        },
        {
          text: "Type a name in **Workspace name** (usually your agency's name) and click **Create workspace**. You can rename it later in Settings.",
        },
      ],
      tips: [
        "Waiting for an invite? Ask the person who invited you which email they used. Then click **Use a different email** and sign in with that one.",
      ],
    },
    {
      id: "checklist",
      title: "The three-step checklist",
      intro:
        "Your dashboard shows **Setup · 0 of 3** until you've done these. It disappears once all three are done.",
      steps: [
        { text: "**Add your first client.** See [Add a client](/help/add-a-client)." },
        {
          text: "**Connect a LinkedIn, Instagram or YouTube account.** See [Connect LinkedIn](/help/connect-linkedin), [Connect Instagram](/help/connect-instagram) or [Connect YouTube](/help/connect-youtube).",
        },
        {
          text: "**Write and schedule a post.** See [Write a post](/help/write-a-post).",
        },
      ],
    },
    {
      id: "next",
      title: "Then",
      points: [
        "Bring in your team: [Invite teammates](/help/invite-teammates).",
        "Learn the shortcuts that save the most time: [Find your way around](/help/find-your-way-around).",
      ],
    },
  ],
};

export const findYourWayAround: HelpGuide = {
  slug: "find-your-way-around",
  group: "start",
  icon: Compass,
  title: "Find your way around",
  summary:
    "The sidebar, the client switcher, the search box (Ctrl K) and the keyboard shortcuts that make Cue quick to use.",
  keywords: [
    "navigation",
    "sidebar",
    "menu",
    "shortcuts",
    "keyboard",
    "command palette",
    "search",
    "ctrl k",
    "dark mode",
    "client switcher",
  ],
  screens: [
    "src/components/app-sidebar.tsx",
    "src/components/app-topbar.tsx",
    "src/components/command-menu.tsx",
    "src/components/client-switcher.tsx",
  ],
  related: ["appearance-and-shortcuts", "switch-workspaces"],
  sections: [
    {
      id: "sidebar",
      shot: {"id": "nav-sidebar", "path": "/dashboard", "alt": "The Cue app with the sidebar on the left: New post at the top, then the Publish and Manage sections.", "highlight": [{"css": "aside a[href='/composer']"}, {"css": "aside a[href='/guide']"}]},
      title: "The sidebar",
      table: {
        head: ["Item", "What it's for"],
        rows: [
          ["**New post**", "Opens the composer to write a post."],
          ["**Dashboard**", "Today at a glance: what's next, what failed, what needs you."],
          ["**Compose**", "Write a post."],
          ["**Calendar**", "Every post on a week or month view. Drag posts to move them."],
          ["**Queue**", "Every post as a list, with approvals, retries and notes."],
          ["**Clients**", "Add clients and connect their accounts."],
          ["**Settings**", "Your name, team, plan, media storage, API keys and appearance."],
          ["**Help**", "These guides."],
        ],
      },
      tips: [
        "Your name at the bottom of the sidebar opens a menu: switch workspaces, create a new one, change the theme, or sign out.",
        "On a phone, the sidebar is behind the menu button at the top left.",
      ],
    },
    {
      id: "client-switcher",
      title: "Focus on one client",
      intro:
        "At the top of every page, next to your workspace name, is the client switcher. It says **All clients** until you pick one.",
      steps: [
        { text: "Click **All clients** and choose a client." },
        {
          text: "The dashboard, calendar and queue now show only that client's posts, and new posts start with that client selected.",
        },
        { text: "To see everyone again, open the switcher and choose **All clients**." },
      ],
      tips: ["Cue remembers your choice on this device until you change it."],
    },
    {
      id: "search",
      title: "Search or jump to anything",
      steps: [
        {
          text: "Click **Search or jump to…** at the top, or press `Ctrl K` (`⌘K` on a Mac) or `/`.",
          shot: {"id": "nav-command-palette", "path": "/dashboard", "alt": "The search box open over the dashboard, listing actions and pages.", "actions": [{"click": {"role": "button", "name": "Search or jump to"}}, {"waitFor": {"role": "dialog"}}], "highlight": [{"role": "dialog"}]},
        },
        {
          text: "Type what you want: a page, a client's name, \"failed\", \"drafts\", or a help topic.",
        },
        { text: "Press `Enter` to go there." },
      ],
    },
    {
      id: "shortcuts",
      title: "Keyboard shortcuts",
      table: {
        head: ["Press", "To"],
        rows: [
          ["`N`", "Write a new post"],
          ["`G` then `D`", "Go to the Dashboard"],
          ["`G` then `C`", "Go to the Calendar"],
          ["`G` then `Q`", "Go to the Queue"],
          ["`G` then `L`", "Go to Clients"],
          ["`G` then `S`", "Go to Settings"],
          ["`G` then `H`", "Open Help"],
          ["`Ctrl K` or `/`", "Search or jump to…"],
        ],
      },
      tips: [
        "Press `G`, let go, then press the second key within about a second.",
        "The calendar has its own keys. See [Use the calendar](/help/calendar).",
      ],
    },
  ],
};

export const startGuides = [whatCueDoes, signIn, setUpYourWorkspace, findYourWayAround];
