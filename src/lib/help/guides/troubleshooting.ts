import { CircleAlert, LifeBuoy, PlugZap, Siren } from "lucide-react";
import type { HelpGuide } from "../types";

export const whyDidMyPostFail: HelpGuide = {
  slug: "why-did-my-post-fail",
  group: "troubleshooting",
  icon: CircleAlert,
  title: "Why did my post fail?",
  summary:
    "Find the reason a post failed or only partly went out, what the message means, and how to fix it.",
  keywords: ["failed", "error", "partial", "retry", "didn't post", "not published", "401", "400"],
  screens: ["src/components/queue-list.tsx", "src/lib/publish.ts", "src/lib/platforms/"],
  related: ["account-health", "queue", "draft-schedule-or-post-now"],
  sections: [
    {
      id: "find",
      title: "Find the reason",
      steps: [
        {
          text: "Open **Queue** and click the **Failed** tab (or **Partial** if some accounts worked). The dashboard's **Faults** tile takes you there too.",
        },
        {
          text: "The reason is shown at the top of the post's card, for each account that failed.",
          shot: {"id": "queue-failed", "path": "/queue?status=FAILED", "alt": "A failed post in the queue with the reason shown and a Retry button.", "crop": {"css": "li.bg-card:has-text('roast lighter')"}, "highlight": [{"role": "button", "name": "Retry"}]},
        },
        { text: "Fix the cause using the table below, then click **Retry**." },
      ],
      tips: [
        "**Retry** only resends to the accounts that failed. Accounts that already published aren't posted to twice.",
        "Before marking an account **Failed**, Cue has already tried it 3 times.",
      ],
    },
    {
      id: "messages",
      title: "What the messages mean",
      table: {
        head: ["The message says", "What it means", "Fix"],
        rows: [
          [
            "\"YouTube connection expired or was revoked…\"",
            "Google withdrew Cue's access to the channel.",
            "Reconnect the channel on **Clients**, then **Retry**.",
          ],
          [
            "\"… failed (401) …\"",
            "The network refused the account's access. It has expired or was withdrawn.",
            "Reconnect the account ([Account health](/help/account-health)), then **Retry**.",
          ],
          [
            "\"… failed (403) …\"",
            "The account isn't allowed to do this, for example a LinkedIn account that's no longer a Page admin.",
            "Check the account's role on the network, reconnect, then **Retry**.",
          ],
          [
            "\"… failed (429) …\"",
            "The network is limiting how fast or how often Cue can post.",
            "Wait an hour (or until tomorrow for YouTube), then **Retry**.",
          ],
          [
            "\"IG media processing timed out…\"",
            "Instagram took more than 3 minutes to process the video.",
            "Use a shorter or smaller video, then **Retry**.",
          ],
          [
            "\"IG media processing error…\"",
            "Instagram couldn't use the file, often the wrong shape or format.",
            "Re-export the image or video (MP4 or JPG are safest), edit the post, schedule again.",
          ],
          [
            "\"LinkedIn document processing failed\"",
            "LinkedIn couldn't turn the document into a carousel.",
            "Export it as a PDF and try again.",
          ],
          [
            "\"YouTube requires a video to upload.\"",
            "The post had no video for the YouTube account.",
            "Edit the post and add a video.",
          ],
          [
            "\"A previous publish attempt did not finish.\"",
            "Publishing was interrupted part-way. Cue stopped so it wouldn't post twice.",
            "Check the network: if it isn't live there, **Retry**.",
          ],
          [
            "\"This post is awaiting approval - approve it before publishing.\"",
            "The post is in review.",
            "**Approve** it ([Approvals and notes](/help/approvals-and-notes)).",
          ],
          [
            "\"Publishing is paused across Cue right now…\"",
            "Cue support has paused all publishing.",
            "Nothing to do. Posts go out when it resumes.",
          ],
        ],
      },
      tips: [
        "Messages that start with a network's name and a number, like \"LinkedIn publish failed (422): …\", come straight from that network. The text after the colon is their explanation.",
        "Still stuck? Copy the message and send it to support: [Contact support](/help/contact-support).",
      ],
    },
    {
      id: "first-comment",
      title: "The post worked but the first comment didn't",
      intro:
        "A failed first comment never changes the post's status. If it says \"Reconnect this account to allow comments\", see [First comment](/help/first-comment).",
    },
  ],
};

export const cantConnectAnAccount: HelpGuide = {
  slug: "cant-connect-an-account",
  group: "troubleshooting",
  icon: PlugZap,
  title: "Can't connect an account",
  summary: "Every message you might see when connecting LinkedIn, Instagram or YouTube, and what to do.",
  keywords: ["connect error", "oauth", "login failed", "cancelled", "not configured", "business account"],
  screens: ["src/components/clients-manager.tsx"],
  related: ["connect-linkedin", "connect-instagram", "connect-youtube"],
  sections: [
    {
      id: "messages",
      title: "Messages and fixes",
      faq: [
        {
          q: "\"That connection expired or was started in another browser…\"",
          a: "Start again from the client's card, in the same browser you're signed in to Cue with, and finish within a few minutes.",
        },
        {
          q: "\"LinkedIn connection was cancelled.\" (or Instagram, YouTube)",
          a: "The sign-in window was closed, or access wasn't allowed. Start again and allow access on every screen.",
        },
        {
          q: "\"Instagram couldn't be connected. It must be a Business or Creator account.\"",
          a: "Switch the Instagram account to Business or Creator. See [Connect Instagram](/help/connect-instagram).",
        },
        {
          q: "\"That LinkedIn account isn't an admin or content admin of any Page…\"",
          a: "Get the **Content Administrator** role on the Page, or ask a Page admin to connect it. See [Connect LinkedIn](/help/connect-linkedin).",
        },
        {
          q: "\"This link has expired.\" (on Match your Pages)",
          a: "Matching LinkedIn Pages must be finished within 15 minutes. Start again from the client's card.",
        },
        {
          q: "\"Couldn't read that LinkedIn profile.\" / \"Couldn't read that Google account.\" / \"… didn't return a valid token.\"",
          a: "A hiccup on the network's side. Try again in a minute.",
        },
        {
          q: "\"Connecting this platform is turned off for your workspace. Contact Cue support.\"",
          a: "Cue support has switched this network off for your workspace. Email `karan@trycue.space`.",
        },
        {
          q: "\"You're viewing this workspace read-only, so accounts can't be connected.\"",
          a: "You're in Cue support's read-only view. Nothing can be changed there.",
        },
        {
          q: "\"… isn't set up on the server yet.\"",
          a: "Cue isn't configured for that network yet. Contact support.",
        },
      ],
    },
  ],
};

export const bannersAndLockScreens: HelpGuide = {
  slug: "banners-and-lock-screens",
  group: "troubleshooting",
  icon: Siren,
  title: "Banners and lock screens",
  summary: "What the coloured banners at the top of Cue mean, and why you might be locked out.",
  keywords: ["banner", "paused", "suspended", "locked", "access paused", "announcement", "read-only"],
  screens: ["src/components/app-banners.tsx", "src/app/locked/page.tsx"],
  related: ["contact-support"],
  sections: [
    {
      id: "banners",
      title: "Banners",
      table: {
        head: ["Banner", "Means"],
        rows: [
          [
            "\"Publishing is paused across Cue right now…\"",
            "Cue support has paused all publishing, usually for a short fix. Scheduled posts go out as soon as it resumes; you don't need to do anything.",
          ],
          [
            "\"… invited you to …\"",
            "A workspace invite. **Accept** or **Decline**.",
          ],
          ["A blue or amber message", "An announcement from Cue. Close it with ✕ once read."],
          [
            "\"Viewing … as its admin, read-only.\"",
            "Only seen by Cue support while helping you. Nothing can be changed in this view.",
          ],
        ],
      },
    },
    {
      id: "locked",
      title: "Lock screens",
      table: {
        head: ["Screen", "Means"],
        rows: [
          [
            "**This workspace is suspended**",
            "Nobody in the workspace can use Cue, and its scheduled posts are on hold. Nothing has been deleted.",
          ],
          [
            "**Your access is paused**",
            "Your own account can't use Cue right now. Your posts and data are kept.",
          ],
        ],
      },
      tips: ["Both screens say how to reach support: `karan@trycue.space`."],
    },
  ],
};

export const contactSupport: HelpGuide = {
  slug: "contact-support",
  group: "troubleshooting",
  icon: LifeBuoy,
  title: "Contact support",
  summary: "How to reach Cue support, and what to include so we can help quickly.",
  keywords: ["support", "help", "contact", "email", "bug", "report a problem"],
  screens: [],
  related: ["why-did-my-post-fail"],
  sections: [
    {
      id: "how",
      title: "Email us",
      intro: "Write to `karan@trycue.space`. Include:",
      points: [
        "Your workspace name and the email you sign in with.",
        "Which client and which account (LinkedIn, Instagram or YouTube).",
        "What you did, what you expected, and what happened instead.",
        "The exact error message, copied from Cue, and a screenshot if you can.",
      ],
    },
  ],
};

export const troubleshootingGuides = [
  whyDidMyPostFail,
  cantConnectAnAccount,
  bannersAndLockScreens,
  contactSupport,
];
