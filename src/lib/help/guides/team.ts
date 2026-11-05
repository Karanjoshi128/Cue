import { ArrowLeftRight, BadgeCheck, MailOpen, ShieldCheck, UsersRound } from "lucide-react";
import type { HelpGuide } from "../types";

export const inviteTeammates: HelpGuide = {
  slug: "invite-teammates",
  group: "team",
  icon: UsersRound,
  title: "Invite teammates",
  summary:
    "Invite people to your workspace by email, resend or withdraw invites, and remove people who've left.",
  keywords: ["team", "invite", "add user", "members", "colleague", "remove member", "resend invite"],
  screens: ["src/components/team-manager.tsx", "src/lib/invites.ts"],
  related: ["roles", "accept-an-invite"],
  sections: [
    {
      id: "invite",
      title: "Invite someone",
      steps: [
        { text: "Open **Settings** and go to **Team**." },
        { text: "Type their email address." },
        {
          text: "Admins can choose a role: **Manager** or **Admin**. See [Roles](/help/roles). Managers can only invite managers.",
        },
        {
          text: "Click **Invite**. They get an email with a button to join. You also get **Copy link**, so you can send it yourself (for example on WhatsApp).",
          shot: {"id": "settings-team", "path": "/settings", "alt": "Settings, Team: the invite box, a pending invite and the members list.", "actions": [{"fill": {"label": "Teammate email address"}, "value": "lee@northwind.example"}], "crop": {"css": "#team"}, "highlight": [{"label": "Teammate email address"}, {"role": "button", "name": "Invite", "exact": true}]},
        },
      ],
      tips: [
        "The invite is for that exact email address. They must sign in with it to accept.",
        "Invites last 7 days.",
      ],
    },
    {
      id: "pending",
      title: "Pending invites",
      intro: "Invites not yet accepted are listed under **Pending invites** with when they expire.",
      table: {
        head: ["Button", "Does"],
        rows: [
          ["**Resend**", "Emails it again and gives 7 more days. Once an hour per invite."],
          ["**Renew**", "Same as Resend, for an invite that has expired."],
          ["**Copy link**", "Copies the join link to share yourself."],
          ["**✕** (Revoke)", "Withdraws the invite. The link stops working."],
        ],
      },
      tips: ["A workspace can send up to 20 invite emails a day."],
    },
    {
      id: "remove",
      title: "Remove someone",
      steps: [
        { text: "In **Settings** → **Team**, find them in the members list." },
        { text: "Click **✕** next to their name and confirm." },
      ],
      points: [
        "They lose access to this workspace straight away, and their API keys for it stop working. Their posts stay.",
        "Only admins can remove people. The last admin can't be removed, and you can't remove yourself.",
      ],
    },
    {
      id: "trouble",
      title: "If it doesn't work",
      faq: [
        { q: "\"They're already in this workspace.\"", a: "Nothing to do. They can already sign in." },
        {
          q: "\"They already have an invite. Use Resend on it below.\"",
          a: "Find them under **Pending invites** and click **Resend**.",
        },
        {
          q: "\"Email isn't set up yet, so share the link yourself.\"",
          a: "The invite was created but not emailed. Click **Copy link** and send it to them.",
        },
        { q: "\"Only admins can invite admins.\"", a: "Ask an admin, or invite them as a Manager." },
        {
          q: "The invite email didn't arrive.",
          a: "Ask them to check spam, or send the link with **Copy link**.",
        },
      ],
    },
  ],
};

export const roles: HelpGuide = {
  slug: "roles",
  group: "team",
  icon: ShieldCheck,
  title: "Roles: Admin and Manager",
  summary: "What Admins and Managers can each do in a workspace.",
  keywords: ["permissions", "admin", "manager", "access", "change role"],
  screens: ["src/components/team-manager.tsx", "src/lib/actions.ts", "src/lib/auth.ts"],
  related: ["invite-teammates"],
  sections: [
    {
      id: "table",
      title: "Who can do what",
      table: {
        head: ["Task", "Manager", "Admin"],
        rows: [
          ["Write, schedule, edit and delete posts", "Yes", "Yes"],
          ["Approve posts, leave notes", "Yes", "Yes"],
          ["Add, edit and delete clients", "Yes", "Yes"],
          ["Connect and disconnect accounts", "Yes", "Yes"],
          ["Invite Managers, resend or revoke their invites", "Yes", "Yes"],
          ["Invite Admins", "No", "Yes"],
          ["Change someone's role, remove someone", "No", "Yes"],
          ["Rename the workspace", "No", "Yes"],
          ["Create and revoke API keys", "No", "Yes"],
          ["Connect the workspace's own media storage", "No", "Yes"],
        ],
      },
      tips: [
        "Managers can do almost everything day to day. Keep Admin for the people who run the workspace.",
      ],
    },
    {
      id: "change",
      title: "Change someone's role",
      steps: [
        { text: "Open **Settings** → **Team** (you must be an Admin)." },
        { text: "Use the role menu next to their name to pick **Admin** or **Manager**." },
      ],
      points: [
        "A workspace always keeps at least one Admin.",
        "You can't remove your own Admin role.",
      ],
    },
  ],
};

export const acceptAnInvite: HelpGuide = {
  slug: "accept-an-invite",
  group: "team",
  icon: MailOpen,
  title: "Accept an invite",
  summary: "Join a workspace you've been invited to.",
  keywords: ["join workspace", "invitation", "invite link", "wrong email"],
  screens: ["src/app/invite/[token]/page.tsx", "src/app/onboarding/page.tsx"],
  related: ["sign-in", "switch-workspaces"],
  sections: [
    {
      id: "steps",
      title: "Join",
      steps: [
        { text: "Open the invite email and click **Accept invitation** (or open the link you were sent)." },
        { text: "If you're not signed in, click **Sign in to accept** and sign in with the invited email." },
        { text: "Click **Accept and join**. You're taken into the workspace." },
      ],
      tips: [
        "Already in Cue? Invites also appear as a banner at the top of the app. Click **Accept** there.",
      ],
    },
    {
      id: "trouble",
      title: "If it doesn't work",
      faq: [
        {
          q: "It says I'm signed in with a different email.",
          a: "Click **Sign out and use …** and sign in with the email the invite was sent to.",
        },
        {
          q: "\"This invite is closed.\"",
          a: "It expired, was withdrawn, or was declined. Ask your teammate to **Renew** it or send a new one.",
        },
        { q: "\"This link doesn't work.\"", a: "The link is incomplete. Copy it again from the email, or ask for a new one." },
      ],
    },
  ],
};

export const approvalsAndNotes: HelpGuide = {
  slug: "approvals-and-notes",
  group: "team",
  icon: BadgeCheck,
  title: "Approvals and notes",
  summary:
    "Hold a post until someone approves it, ask for changes, and leave notes on posts for your team.",
  keywords: ["approve", "review", "request changes", "sign off", "comments", "notes", "client approval"],
  screens: ["src/components/queue-list.tsx"],
  related: ["queue", "draft-schedule-or-post-now"],
  sections: [
    {
      id: "flow",
      title: "Send a post for approval",
      steps: [
        { text: "Open **Queue** and find the post." },
        { text: "Click **Send for approval**. It now shows **In review**, and it won't publish.", shot: {"id": "queue-approval", "path": "/queue", "alt": "A post in the queue marked In review, with Approve and Request changes buttons.", "crop": {"css": "li.bg-card:has-text('commercial lease')"}, "highlight": [{"role": "button", "name": "Approve"}]} },
        {
          text: "The reviewer clicks **Approve** to let it go out at its time, or **Request changes** to send it back.",
        },
        {
          text: "After changes are made, anyone can click **Approve**.",
        },
      ],
      warnings: [
        "Posts **In review** or with **Changes requested** never publish, even at their scheduled time, and **Post now** and **Retry** are blocked. Remember to approve them.",
      ],
      points: [
        "New posts start as approved. Review only starts when someone clicks **Send for approval**.",
        "Any member can approve, including the post's author.",
        "Posts waiting for approval are listed under **Needs attention** in the queue and on the dashboard.",
      ],
    },
    {
      id: "notes",
      title: "Leave a note",
      steps: [
        { text: "In **Queue**, click **Note** on the post (it shows a count once there are notes)." },
        { text: "Type in **Add a note…** and send. Up to 2,000 characters." },
      ],
      tips: ["Notes are only seen inside Cue. They're never posted to the network."],
    },
  ],
};

export const switchWorkspaces: HelpGuide = {
  slug: "switch-workspaces",
  group: "team",
  icon: ArrowLeftRight,
  title: "Switch or create workspaces",
  summary: "Move between workspaces you belong to, or start a new one.",
  keywords: ["workspace", "agency", "switch", "multiple workspaces", "new workspace"],
  screens: ["src/components/app-sidebar.tsx", "src/app/onboarding/page.tsx"],
  related: ["accept-an-invite", "set-up-your-workspace"],
  sections: [
    {
      id: "switch",
      title: "Switch",
      steps: [
        { text: "Click your name at the bottom of the sidebar." },
        { text: "Under **Workspaces**, click the one you want. The current one has a tick.", shot: {"id": "user-menu", "path": "/dashboard", "alt": "The account menu open: workspaces, Help & guide, Settings, theme and Sign out.", "actions": [{"click": {"role": "button", "name": "Account menu"}}, {"waitFor": {"role": "menu"}}], "highlight": [{"role": "menu"}]} },
      ],
      points: [
        "Cue opens that workspace's dashboard and resets the client switcher to **All clients**.",
        "A greyed-out workspace marked **Suspended** can't be opened. Contact Cue support.",
      ],
    },
    {
      id: "create",
      title: "Create another workspace",
      steps: [
        { text: "Click your name at the bottom of the sidebar, then **Create a workspace**." },
        { text: "Type a **Workspace name** and click **Create workspace**." },
      ],
      tips: ["You can be Admin of up to 10 workspaces."],
    },
  ],
};

export const teamGuides = [inviteTeammates, roles, acceptAnInvite, approvalsAndNotes, switchWorkspaces];
