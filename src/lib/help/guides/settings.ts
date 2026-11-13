import { Code2, HardDrive, Keyboard, Gauge as Meter, UserRound } from "lucide-react";
import type { HelpGuide } from "../types";

export const profileAndWorkspace: HelpGuide = {
  slug: "profile-and-workspace",
  group: "settings",
  icon: UserRound,
  title: "Your name and workspace name",
  summary: "Change the name your team sees, and rename the workspace.",
  keywords: ["display name", "rename", "profile", "account settings", "workspace name"],
  screens: ["src/app/(app)/settings/page.tsx"],
  related: ["roles"],
  sections: [
    {
      id: "name",
      title: "Change your display name",
      steps: [
        { text: "Open **Settings**. **Account** is the first section." },
        { text: "Type your name in **Display name** and click **Save**." },
      ],
      tips: [
        "Your email can't be changed here. It's the address you sign in with. To use another email, ask an admin to invite that address.",
      ],
    },
    {
      id: "workspace",
      title: "Rename the workspace",
      steps: [
        { text: "Open **Settings** → **Workspace** (Admins only)." },
        { text: "Type the new name and save." },
      ],
    },
  ],
};

export const planAndUsage: HelpGuide = {
  slug: "plan-and-usage",
  group: "settings",
  icon: Meter,
  title: "Plan and usage",
  summary: "See your workspace's plan, what it includes, and how much of it you've used.",
  keywords: ["plan", "limits", "usage", "upgrade", "pricing", "quota", "storage used"],
  screens: ["src/app/(app)/settings/page.tsx", "src/lib/plans.ts"],
  related: ["use-your-own-storage"],
  sections: [
    {
      id: "where",
      title: "Check your usage",
      steps: [
        {
          text: "Open **Settings** → **Plan and usage**. It shows your plan and, for each limit, how much is used.",
          shot: {"id": "settings-plan", "path": "/settings", "alt": "Settings, Plan and usage: the plan name and each limit with how much is used.", "crop": {"css": "#plan"}},
        },
      ],
    },
    {
      id: "plans",
      title: "What each plan includes",
      table: {
        head: ["", "Free", "Pro", "Agency", "Unlimited"],
        rows: [
          ["Clients", "2", "10", "50", "No limit"],
          ["Team members", "2", "5", "25", "No limit"],
          ["Posts a month", "30", "300", "2,000", "No limit"],
          ["API keys", "1", "5", "20", "No limit"],
          ["Storage on Cue", "1 GB", "20 GB", "100 GB", "No limit"],
        ],
      },
      points: [
        "**Posts a month** counts every post created since the 1st of the month, including drafts and copies.",
        "Files kept in your own storage (see [Use your own media storage](/help/use-your-own-storage)) don't count towards **Storage on Cue**.",
        "To change plan, contact Cue support at `karan@trycue.space`.",
      ],
    },
    {
      id: "limit",
      title: "When you reach a limit",
      intro:
        "Cue stops the action and says: \"Your Pro plan includes 10 clients, and this would go over it. Contact Cue support to raise the limit.\" Nothing already in Cue is removed.",
    },
  ],
};

export const useYourOwnStorage: HelpGuide = {
  slug: "use-your-own-storage",
  group: "settings",
  icon: HardDrive,
  title: "Use your own media storage",
  summary:
    "Keep your workspace's uploads in your own Cloudflare R2, Amazon S3, Backblaze B2 or other S3-compatible bucket.",
  keywords: [
    "bucket",
    "r2",
    "s3",
    "backblaze",
    "wasabi",
    "digitalocean spaces",
    "supabase storage",
    "minio",
    "cors",
    "storage",
  ],
  screens: ["src/components/storage-manager.tsx"],
  related: ["media-files", "plan-and-usage"],
  sections: [
    {
      id: "why",
      title: "Do you need this?",
      intro:
        "No. By default, uploads go to Cue's storage and there's nothing to set up. Use your own bucket if you want your files in your own account, or need more space than your plan includes. Only Admins can set this up.",
    },
    {
      id: "connect",
      title: "Connect a bucket",
      steps: [
        { text: "Open **Settings** → **Media storage** and click **Connect your own bucket**.", shot: {"id": "settings-storage", "path": "/settings", "alt": "Settings, Media storage, showing Cue's storage in use and the Connect your own bucket button.", "crop": {"css": "#storage"}, "highlight": [{"role": "button", "name": "Connect your own bucket"}]} },
        {
          text: "**Provider:** choose **Cloudflare R2** or **S3-compatible** (Amazon S3, Backblaze B2, DigitalOcean Spaces, Wasabi, Supabase Storage, MinIO or another).",
        },
        {
          text: "**Bucket and keys:** fill in the bucket name, access keys and public URL. Under each field the wizard explains where to find that value for your provider.",
        },
        {
          text: "Set the bucket's CORS policy. The wizard shows the exact policy (or command) to paste for your provider.",
        },
        {
          text: "**Test and save:** click **Test connection**. When all checks pass, click **Save and use**.",
        },
      ],
      warnings: [
        "Files must be publicly readable: Instagram, LinkedIn and YouTube download your media from the public URL when they publish.",
      ],
    },
    {
      id: "checks",
      title: "What the test checks",
      table: {
        head: ["Check", "If it fails"],
        rows: [
          [
            "**Write a file with these keys**",
            "The keys are wrong, or can't write to this bucket. Check the access key, secret and bucket name.",
          ],
          [
            "**Read it back from the public URL**",
            "The bucket isn't public, or the public URL is wrong.",
          ],
          [
            "**Upload straight from this browser**",
            "The CORS policy is missing or doesn't include Cue. Paste the policy the wizard shows.",
          ],
          ["**Remove the test files**", "The keys can't delete. Allow delete for this bucket."],
        ],
      },
    },
    {
      id: "manage",
      title: "Change or remove it",
      points: [
        "**Test again** reruns the checks at any time.",
        "**Edit** changes the details. They're tested again before saving.",
        "**Disconnect** sends new uploads back to Cue's storage. Files already in your bucket stay there.",
      ],
    },
  ],
};

export const apiKeys: HelpGuide = {
  slug: "api-keys",
  group: "settings",
  icon: Code2,
  title: "API keys and the Cue API",
  summary:
    "Create, schedule and publish posts from your own scripts or tools, using an API key.",
  keywords: ["api", "developer", "automation", "integration", "token", "bearer", "webhook", "script"],
  screens: ["src/app/(app)/settings/page.tsx", "src/app/api/v1/", "docs/api.md"],
  related: ["roles"],
  sections: [
    {
      id: "create",
      title: "Create a key",
      steps: [
        { text: "Open **Settings** → **API keys** (Admins only)." },
        { text: "Name the key after what will use it, then click **Create key**.", shot: {"id": "settings-api-keys", "path": "/settings", "alt": "Settings, API keys: a name field and the Create key button.", "crop": {"css": "#api-keys"}, "highlight": [{"role": "button", "name": "Create key"}]} },
        {
          text: "Copy the key straight away and store it somewhere safe. It's shown only once. Then click **I've saved it**.",
        },
      ],
      points: [
        "A key acts as the Admin who created it, in this workspace.",
        "**Revoke** stops a key immediately. Anything using it stops working.",
        "Lost a key? Revoke it and create a new one. Keys can't be shown again.",
      ],
      warnings: ["Treat a key like a password. Anyone with it can post as your workspace."],
    },
    {
      id: "use",
      title: "Use the API",
      intro:
        "The API lives at `https://trycue.space/api/v1`. Send the key on every request as `Authorization: Bearer cue_…`. Everything is JSON.",
      table: {
        head: ["Endpoint", "Does"],
        rows: [
          ["`GET /clients`", "Lists clients and their connected accounts (use the account ids when posting)."],
          ["`POST /media/presign`", "Gives a short-lived link to upload a file, then you PUT the file to it."],
          ["`POST /posts`", "Creates a post. `action` is `draft`, `schedule` or `now`."],
          ["`GET /posts/:id`", "A post and the status of each account."],
          ["`GET /posts?clientId=&status=&limit=`", "Lists posts (up to 100)."],
          ["`DELETE /posts/:id`", "Deletes a draft or scheduled post."],
        ],
      },
      code: {
        label: "Schedule a post",
        text: `curl -X POST https://trycue.space/api/v1/posts \\
  -H "Authorization: Bearer $CUE_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: launch-post-001" \\
  -d '{
    "clientId": "cmg…",
    "accountIds": ["cmh…"],
    "body": "We're live!",
    "scheduledAt": "2026-12-01T09:00:00+05:30",
    "action": "schedule"
  }'`,
      },
      tips: [
        "`scheduledAt` must include a time zone, like `+05:30`.",
        "Send an `Idempotency-Key` with each new post. If a request is retried, Cue returns the first post instead of publishing twice.",
      ],
    },
    {
      id: "errors",
      title: "Error codes",
      table: {
        head: ["Code", "Means"],
        rows: [
          ["400", "Something in the request is invalid. The `error` and `details` fields say what."],
          ["401", "Missing, wrong or revoked key."],
          ["403", "Refused: workspace suspended, API switched off for it, or a plan limit reached."],
          ["404", "Not found (or belongs to another workspace)."],
          ["409", "The post can't do that now, e.g. deleting a published post."],
          ["503", "`now` while publishing is paused. Schedule it instead."],
        ],
      },
    },
  ],
};

export const appearanceAndShortcuts: HelpGuide = {
  slug: "appearance-and-shortcuts",
  group: "settings",
  icon: Keyboard,
  title: "Appearance and keyboard shortcuts",
  summary: "Switch between light and dark, and find every keyboard shortcut.",
  keywords: ["dark mode", "light mode", "theme", "paper", "control room", "keyboard"],
  screens: ["src/app/(app)/settings/page.tsx", "src/components/theme-picker.tsx"],
  related: ["find-your-way-around"],
  sections: [
    {
      id: "theme",
      title: "Light or dark",
      table: {
        head: ["Choice", "Looks"],
        rows: [
          ["**Paper**", "Warm and light."],
          ["**Control room**", "Dark, easy on the eyes at night."],
          ["**System**", "Follows your computer's setting."],
        ],
      },
      points: [
        "Pick one in **Settings** → **Appearance**, or with the sun/moon button at the top of any page.",
        "Your choice is saved on this device only.",
      ],
    },
    {
      id: "shortcuts",
      title: "Shortcuts",
      intro:
        "**Settings** → **Shortcuts** lists them all. The main ones are in [Find your way around](/help/find-your-way-around), and the calendar's own keys are in [Use the calendar](/help/calendar).",
    },
  ],
};

export const settingsGuides = [
  profileAndWorkspace,
  planAndUsage,
  useYourOwnStorage,
  apiKeys,
  appearanceAndShortcuts,
];
