import { Building2, Camera, HeartPulse, PlaySquare, Unplug, UserPlus } from "lucide-react";
import type { HelpGuide } from "../types";

export const addAClient: HelpGuide = {
  slug: "add-a-client",
  group: "clients",
  icon: UserPlus,
  title: "Add, edit or delete a client",
  summary:
    "A client is a brand you post for. Give it a name and a colour, then connect its social accounts.",
  keywords: ["new client", "brand", "customer", "colour", "color", "rename client", "remove client"],
  screens: ["src/components/clients-manager.tsx"],
  related: ["connect-linkedin", "connect-instagram", "connect-youtube"],
  sections: [
    {
      id: "add",
      title: "Add a client",
      steps: [
        { text: "Click **Clients** in the sidebar." },
        { text: "Click **Add client**.", shot: {"id": "clients-add", "path": "/clients", "alt": "The Clients page with the Add client button marked.", "highlight": [{"role": "button", "name": "Add client"}]} },
        {
          text: "Type the client's name in **Name**, for example their brand name.",
        },
        {
          text: "Pick a **Colour**. It marks this client's posts in the calendar. Click **+** for any colour you like.",
          shot: {"id": "clients-add-dialog", "path": "/clients", "alt": "The Add a client dialog with a name typed in and colour swatches below.", "actions": [{"click": {"role": "button", "name": "Add client"}}, {"waitFor": {"role": "dialog"}}, {"fill": {"placeholder": "Acme Co."}, "value": "Bloom Florists"}], "crop": {"role": "dialog"}},
        },
        { text: "Click **Add client**. Their card appears on the page." },
      ],
      tips: [
        "Next, connect the client's accounts from the bottom of their card. See [Connect LinkedIn](/help/connect-linkedin), [Connect Instagram](/help/connect-instagram) and [Connect YouTube](/help/connect-youtube).",
        "With more than six clients, a **Find a client** box appears so you can search them by name.",
      ],
    },
    {
      id: "edit",
      title: "Rename a client or change its colour",
      steps: [
        { text: "On the client's card, click the **⋯** menu and choose **Edit client**." },
        { text: "Change the name or colour and click **Save changes**." },
      ],
    },
    {
      id: "delete",
      title: "Delete a client",
      steps: [
        { text: "On the client's card, click the **⋯** menu and choose **Delete**." },
        { text: "Read the message, then click **Delete client**." },
      ],
      warnings: [
        "Deleting a client permanently removes the client, its connected accounts and all its posts in Cue. Posts already published stay on LinkedIn, Instagram or YouTube.",
      ],
    },
    {
      id: "limits",
      title: "If it doesn't work",
      faq: [
        {
          q: "\"Your … plan includes N clients, and this would go over it.\"",
          a: "Your workspace's plan has a client limit. See [Plan and usage](/help/plan-and-usage), or contact Cue support to raise it.",
        },
      ],
    },
  ],
};

export const connectLinkedIn: HelpGuide = {
  slug: "connect-linkedin",
  group: "clients",
  icon: Building2,
  platform: "LINKEDIN",
  title: "Connect LinkedIn",
  summary:
    "Connect a client's LinkedIn Company Page or a person's own profile, so Cue can post there.",
  keywords: [
    "linkedin page",
    "company page",
    "personal profile",
    "organisation",
    "organization",
    "content admin",
    "match your pages",
  ],
  screens: [
    "src/components/clients-manager.tsx",
    "src/components/linkedin-page-picker.tsx",
    "src/app/(app)/clients/linkedin-pages/page.tsx",
  ],
  related: ["account-health", "posting-to-linkedin", "cant-connect-an-account"],
  sections: [
    {
      id: "which",
      title: "Company Page or personal profile?",
      table: {
        head: ["Choose", "When"],
        rows: [
          [
            "**Company Page**",
            "Posts appear as the brand, for example \"Acme Co.\". You must be an **Administrator** or **Content Administrator** of that Page on LinkedIn.",
          ],
          [
            "**Personal profile**",
            "Posts appear as a person, for example the founder. That person signs in with their own LinkedIn account.",
          ],
        ],
      },
    },
    {
      id: "page",
      title: "Connect a Company Page",
      steps: [
        { text: "Open **Clients** and find the client's card." },
        {
          text: "At the bottom of the card, next to **Connect**, click the LinkedIn logo. Choose **Company Page**.",
          shot: {"id": "connect-linkedin-menu", "path": "/clients", "alt": "A client card with the LinkedIn menu open, offering Company Page or Personal profile.", "actions": [{"click": {"role": "button", "name": "Connect LinkedIn for Sunmeadow Organics"}}, {"waitFor": {"role": "menuitem", "name": "Company Page"}}], "highlight": [{"role": "button", "name": "Connect LinkedIn for Sunmeadow Organics"}, {"role": "menuitem", "name": "Company Page"}]},
        },
        {
          text: "LinkedIn opens. Sign in with the LinkedIn account that manages the Page and click **Allow**.",
        },
        {
          text: "Cue shows **Match your Pages**: every Page that account can post to. Next to each Page, choose the client it belongs to. Leave Pages you don't want on **Don't connect**.",
        },
        {
          text: "Click **Connect 1 Page** (or **Connect N Pages**). You're back on Clients, and the Page shows on the client's card.",
        },
      ],
      tips: [
        "Cue suggests a client when a Page's name matches it, and remembers Pages you've already connected.",
        "Only the first 30 Pages an account manages are listed.",
      ],
      warnings: [
        "Finish matching within 15 minutes. After that the screen says **This link has expired.** and you need to start again from the client's card.",
      ],
    },
    {
      id: "profile",
      title: "Connect a personal profile",
      steps: [
        { text: "Open **Clients** and find the client's card." },
        {
          text: "Click the LinkedIn logo at the bottom of the card and choose **Personal profile**.",
        },
        {
          text: "The person whose profile it is signs in on LinkedIn and clicks **Allow**. If that isn't you, do this together, or have them sign in to Cue themselves and do it.",
        },
        {
          text: "Back on Clients you'll see **LinkedIn account connected**, and the profile is listed on the card.",
        },
      ],
    },
    {
      id: "trouble",
      title: "If it doesn't work",
      faq: [
        {
          q: "\"That LinkedIn account isn't an admin or content admin of any Page…\"",
          a: "Ask a Page admin to give your LinkedIn account the **Content Administrator** role (on LinkedIn: the Page → **Settings** → **Manage admins**), then try again. Or have a Page admin connect it.",
        },
        {
          q: "\"LinkedIn connection was cancelled.\"",
          a: "The LinkedIn window was closed or **Cancel** was clicked. Start again from the card.",
        },
        {
          q: "\"That connection expired or was started in another browser…\"",
          a: "Connect in the same browser you're signed in to Cue with, and finish within a few minutes.",
        },
      ],
    },
  ],
};

export const connectInstagram: HelpGuide = {
  slug: "connect-instagram",
  group: "clients",
  icon: Camera,
  platform: "INSTAGRAM",
  title: "Connect Instagram",
  summary:
    "Connect a client's Instagram Business or Creator account. Personal Instagram accounts can't be used.",
  keywords: ["instagram business", "creator account", "professional account", "ig", "meta"],
  screens: ["src/components/clients-manager.tsx"],
  related: ["account-health", "posting-to-instagram", "cant-connect-an-account"],
  sections: [
    {
      id: "before",
      title: "Before you start",
      intro:
        "Instagram only lets apps like Cue post to **Business** or **Creator** accounts. Switching is free, takes a minute and can be undone.",
      steps: [
        {
          text: "In the Instagram app, open the profile and tap the menu (☰) at the top right.",
        },
        {
          text: "Tap **Account type and tools**, then **Switch to professional account**.",
        },
        { text: "Choose **Business** or **Creator** and follow the steps." },
      ],
      tips: ["You don't need a Facebook Page to connect to Cue."],
    },
    {
      id: "connect",
      title: "Connect the account",
      steps: [
        { text: "Open **Clients** and find the client's card." },
        { text: "At the bottom of the card, click the Instagram logo." },
        {
          text: "Instagram opens and always asks you to sign in, so you can choose the right account. Sign in as the client's account and allow access.",
        },
        {
          text: "Back on Clients you'll see **Instagram account connected**, and the account shows as `@username` on the card.",
        },
      ],
      tips: [
        "To add a second Instagram account to the same client, click the Instagram logo again (it says **Add another Instagram account**).",
      ],
    },
    {
      id: "trouble",
      title: "If it doesn't work",
      faq: [
        {
          q: "\"Instagram couldn't be connected. It must be a Business or Creator account.\"",
          a: "Switch the account to Business or Creator (see Before you start above), then connect again.",
        },
        {
          q: "It connected the wrong Instagram account.",
          a: "Disconnect it from the card (see [Disconnect an account](/help/disconnect-an-account)), then connect again and sign in as the right account on the Instagram screen.",
        },
      ],
    },
  ],
};

export const connectYouTube: HelpGuide = {
  slug: "connect-youtube",
  group: "clients",
  icon: PlaySquare,
  platform: "YOUTUBE",
  title: "Connect YouTube",
  summary: "Connect a client's YouTube channel by signing in with the Google account that owns it.",
  keywords: ["youtube channel", "google", "video", "upload"],
  screens: ["src/components/clients-manager.tsx"],
  related: ["posting-to-youtube", "account-health"],
  sections: [
    {
      id: "connect",
      title: "Connect a channel",
      steps: [
        { text: "Open **Clients** and find the client's card." },
        { text: "At the bottom of the card, click the YouTube logo." },
        {
          text: "Google opens. Choose the Google account that owns or manages the channel, and allow Cue to upload videos.",
        },
        {
          text: "Back on Clients you'll see **YouTube account connected**.",
        },
      ],
      tips: [
        "The card shows the Google account's name, not the channel's name. If you manage several channels, note which Google account belongs to which.",
        "If Google shows several channels (brand accounts), pick the one this client posts to.",
      ],
    },
    {
      id: "trouble",
      title: "If it doesn't work",
      faq: [
        {
          q: "\"YouTube connection was cancelled.\"",
          a: "The Google window was closed or access wasn't allowed. Start again and click **Allow** (or **Continue**) on every Google screen.",
        },
        {
          q: "Google says the app isn't verified.",
          a: "Contact Cue support at `karan@trycue.space`.",
        },
      ],
    },
  ],
};

export const accountHealth: HelpGuide = {
  slug: "account-health",
  group: "clients",
  icon: HeartPulse,
  title: "Account health and reconnecting",
  summary:
    "What the label next to each connected account means, and how to reconnect one before posts start failing.",
  keywords: ["expired", "expires", "reconnect", "token", "valid", "reconnect needed", "refresh"],
  screens: ["src/components/clients-manager.tsx", "src/app/(app)/dashboard/page.tsx"],
  related: ["why-did-my-post-fail", "disconnect-an-account"],
  sections: [
    {
      id: "labels",
      shot: {"id": "clients-account-health", "path": "/clients", "alt": "A client card listing two accounts: one Valid, one Expired.", "crop": {"css": "article:has-text('Kiln Coffee')"}, "highlight": [{"text": "Expired", "exact": true}]},
      title: "What the labels mean",
      intro:
        "Social networks only let Cue post for a limited time before the account has to agree again. Each connected account on a client's card shows where it stands.",
      table: {
        head: ["Label", "Means", "Do"],
        rows: [
          ["**Connected**", "All good.", "Nothing."],
          ["**Valid 30d**", "All good for that many days.", "Nothing."],
          [
            "**Expires in 5d** (amber)",
            "Expires within a week. Posts after that will fail.",
            "Reconnect now.",
          ],
          ["**Expired** (red)", "Cue can't post to this account.", "Reconnect."],
          [
            "**Reconnect needed** (red, YouTube)",
            "Google withdrew Cue's access.",
            "Reconnect.",
          ],
        ],
      },
      tips: [
        "Cue renews LinkedIn and Instagram access by itself when it can, so most accounts stay **Valid** without you doing anything.",
        "The dashboard lists accounts to fix under **Needs attention** → **Accounts to reconnect**.",
      ],
    },
    {
      id: "reconnect",
      title: "Reconnect an account",
      steps: [
        {
          text: "On the client's card, click the amber or red label (its tooltip says **Reconnect**).",
        },
        {
          text: "Sign in on LinkedIn, Instagram or Google as the same account, and allow access.",
        },
        {
          text: "The label turns back to **Connected** or **Valid**. Nothing else changes: scheduled posts keep their accounts.",
        },
      ],
      tips: [
        "If a post failed because the account had expired, reconnect first, then open the post in **Queue** and click **Retry**.",
      ],
    },
  ],
};

export const disconnectAnAccount: HelpGuide = {
  slug: "disconnect-an-account",
  group: "clients",
  icon: Unplug,
  title: "Disconnect an account",
  summary: "Stop Cue posting to a social account. Posts already published stay where they are.",
  keywords: ["remove account", "unlink", "revoke", "disconnect"],
  screens: ["src/components/clients-manager.tsx"],
  related: ["account-health"],
  sections: [
    {
      id: "steps",
      title: "Disconnect",
      steps: [
        { text: "Open **Clients** and find the account on the client's card." },
        { text: "Click the unplug icon next to it." },
        { text: "Confirm with **Disconnect**." },
      ],
      warnings: [
        "Cue can't publish to the account until it's connected again. Scheduled posts for it will fail, so move or edit them first.",
      ],
      tips: [
        "To withdraw Cue's access completely, also remove Cue in the network's own settings (LinkedIn, Instagram or your Google account's third-party access page).",
      ],
    },
  ],
};

export const clientGuides = [
  addAClient,
  connectLinkedIn,
  connectInstagram,
  connectYouTube,
  accountHealth,
  disconnectAnAccount,
];
