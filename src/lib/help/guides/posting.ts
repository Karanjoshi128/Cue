import {
  Building2,
  Camera,
  Clock,
  Images,
  MessageSquareText,
  PencilLine,
  PlaySquare,
  Shuffle,
  SquarePen,
} from "lucide-react";
import type { HelpGuide } from "../types";

export const writeAPost: HelpGuide = {
  slug: "write-a-post",
  group: "posting",
  icon: SquarePen,
  title: "Write a post",
  summary:
    "Use the composer's three steps (who it's for, what it says, when it goes out) to write a post and schedule it to one or more accounts.",
  keywords: ["compose", "composer", "new post", "create post", "caption", "schedule a post", "preview"],
  screens: ["src/components/composer.tsx", "src/app/(app)/composer/page.tsx"],
  related: [
    "draft-schedule-or-post-now",
    "posting-to-linkedin",
    "posting-to-instagram",
    "posting-to-youtube",
    "media-files",
  ],
  sections: [
    {
      id: "open",
      title: "Open the composer",
      points: [
        "Click **New post** at the top of the sidebar, or **Compose**, or press `N`.",
        "Or click an empty time on the [calendar](/help/calendar): the composer opens with that date and time filled in.",
      ],
    },
    {
      id: "who",
      title: "01 Who it's for",
      steps: [
        { text: "Choose the client in **Client**." },
        {
          text: "Under **Publish to**, switch on each account the post should go to. You can pick several, across LinkedIn, Instagram and YouTube.",
          shot: {"id": "composer-who", "path": "/composer", "alt": "Step 01 of the composer with a client chosen and two accounts switched on.", "actions": [{"click": {"role": "combobox"}}, {"click": {"role": "option", "name": "Sunmeadow Organics"}}, {"click": {"role": "button", "name": "Sunmeadow Organics LinkedIn"}}, {"click": {"role": "button", "name": "@sunmeadow.organics Instagram"}}], "crop": {"css": "section:has(h2:text-is(\"Who it's for\"))"}, "highlight": [{"role": "combobox"}, {"role": "button", "name": "Sunmeadow Organics LinkedIn"}]},
        },
      ],
      tips: [
        "No accounts listed? The client has none connected yet. Click **Connect one**, or see [Connect LinkedIn](/help/connect-linkedin).",
      ],
    },
    {
      id: "what",
      title: "02 What it says",
      steps: [
        {
          text: "Pick the kind of post. **Text & media** works everywhere. **Document**, **Link** and **Poll** are LinkedIn-only, so choosing one switches off non-LinkedIn accounts.",
        },
        {
          text: "Write the caption in the box. The ring beside it counts characters against the strictest network you picked (LinkedIn 3,000, Instagram 2,200, YouTube 5,000).",
          shot: {"id": "composer-what", "path": "/composer", "alt": "Step 02 of the composer with a caption written.", "actions": [{"click": {"role": "combobox"}}, {"click": {"role": "option", "name": "Sunmeadow Organics"}}, {"click": {"role": "button", "name": "Sunmeadow Organics LinkedIn"}}, {"click": {"role": "button", "name": "@sunmeadow.organics Instagram"}}, {"fill": {"role": "textbox", "name": "Caption"}, "value": "Harvest week is here. This season's oats come from three family farms within 60 km of our mill."}], "crop": {"css": "section:has(h2:text-is('What it says'))"}, "highlight": [{"role": "textbox", "name": "Caption"}, {"role": "button", "name": "Add media"}]},
        },
        {
          text: "To add pictures or video, click **Add media** or drop files onto the box. See [Media files](/help/media-files).",
        },
        {
          text: "Optional: for YouTube or Instagram, add a **First comment**. See [First comment](/help/first-comment).",
        },
      ],
      tips: [
        "Posting to more than one network? Switch on **Tailor the caption per network** to give each account its own version. See [Tailor the caption per network](/help/tailor-the-caption).",
        "The **Preview** on the right shows roughly how the post will look on each network. Click the tabs above it to switch networks.",
      ],
    },
    {
      id: "youtube",
      title: "02b YouTube details",
      intro:
        "This step only appears when a YouTube account is selected. See [Posting to YouTube](/help/posting-to-youtube).",
    },
    {
      id: "when",
      title: "03 When it goes out",
      steps: [
        {
          text: "Click a quick choice (**In an hour**, **Tomorrow 9 AM**, **Tomorrow 6 PM** or **Monday 9 AM**), or set a date and time in **Schedule for**.",
          shot: {"id": "composer-when", "path": "/composer", "alt": "Step 03 of the composer with Tomorrow 9 AM chosen and the time confirmed underneath.", "actions": [{"click": {"role": "combobox"}}, {"click": {"role": "option", "name": "Sunmeadow Organics"}}, {"click": {"role": "button", "name": "Sunmeadow Organics LinkedIn"}}, {"click": {"role": "button", "name": "@sunmeadow.organics Instagram"}}, {"fill": {"role": "textbox", "name": "Caption"}, "value": "Harvest week is here. This season's oats come from three family farms within 60 km of our mill."}, {"click": {"role": "button", "name": "Tomorrow 9 AM"}}], "crop": {"css": "section:has(h2:text-is('When it goes out'))"}, "highlight": [{"role": "button", "name": "Tomorrow 9 AM"}, {"role": "textbox", "name": "Schedule for"}]},
        },
        {
          text: "Check the line underneath: it says the exact day and time, and how long until then. Times are in your computer's time zone.",
        },
      ],
      tips: [
        "**In an hour** picks the next full hour at least an hour away. At 10:15 it chooses 12:00.",
      ],
    },
    {
      id: "finish",
      shot: {"id": "composer-ready", "path": "/composer", "alt": "The composer ready to schedule, with Save draft, Post now and Schedule at the bottom.", "actions": [{"click": {"role": "combobox"}}, {"click": {"role": "option", "name": "Sunmeadow Organics"}}, {"click": {"role": "button", "name": "Sunmeadow Organics LinkedIn"}}, {"click": {"role": "button", "name": "@sunmeadow.organics Instagram"}}, {"fill": {"role": "textbox", "name": "Caption"}, "value": "Harvest week is here. This season's oats come from three family farms within 60 km of our mill."}, {"click": {"role": "button", "name": "Tomorrow 9 AM"}}], "highlight": [{"role": "button", "name": "Save draft"}, {"role": "button", "name": "Post now"}, {"role": "button", "name": "Schedule", "exact": true}]},
      title: "Save it",
      intro:
        "The bar at the bottom tells you what's still missing (\"To continue, pick a client…\") or confirms \"Ready for 2 accounts · Acme Co.\". Then choose:",
      table: {
        head: ["Button", "What happens"],
        rows: [
          ["**Schedule**", "Publishes at the time you set. You land on the calendar."],
          ["**Post now**", "Publishes straight away, without waiting."],
          ["**Save draft**", "Keeps it in Cue without publishing. You land on the queue."],
        ],
      },
      tips: ["More on the difference: [Draft, Schedule or Post now](/help/draft-schedule-or-post-now)."],
    },
    {
      id: "trouble",
      title: "If it doesn't work",
      faq: [
        { q: "\"Pick a client\" / \"Select at least one account\"", a: "Fill in step 01." },
        { q: "\"Write something first\"", a: "The caption is empty." },
        {
          q: "\"Acme LinkedIn: caption is over the 3000-character limit\"",
          a: "Shorten the caption, or tailor a shorter version for that network.",
        },
        {
          q: "\"Instagram posts need at least one image or video\"",
          a: "Add media, or switch off the Instagram account.",
        },
        { q: "\"Pick a date and time\"", a: "Fill in step 03, or use **Post now**." },
        {
          q: "\"Your … plan includes N posts a month…\"",
          a: "The workspace has reached its monthly post limit. See [Plan and usage](/help/plan-and-usage).",
        },
      ],
    },
  ],
};

export const postingToLinkedIn: HelpGuide = {
  slug: "posting-to-linkedin",
  group: "posting",
  icon: Building2,
  platform: "LINKEDIN",
  title: "Posting to LinkedIn",
  summary:
    "What you can post to LinkedIn from Cue: text, images, documents (carousels), link previews and polls.",
  keywords: ["linkedin carousel", "pdf", "document post", "poll", "link preview", "gallery", "linkedin video"],
  screens: ["src/components/composer.tsx", "src/lib/platforms/linkedin.ts"],
  related: ["write-a-post", "connect-linkedin"],
  sections: [
    {
      id: "types",
      title: "Kinds of LinkedIn post",
      table: {
        head: ["Kind", "How", "Good to know"],
        rows: [
          [
            "Text and images",
            "**Text & media** tab, add up to 20 images",
            "Several images post as a gallery.",
          ],
          [
            "Document (carousel)",
            "**Document** tab, drop one PDF, PowerPoint or Word file",
            "LinkedIn shows it as a swipeable carousel. A PDF gives the most reliable result.",
          ],
          [
            "Link with a preview card",
            "**Link** tab: **Link URL**, **Preview title**, **Preview description**",
            "LinkedIn doesn't fetch the preview by itself, so the title and description you type are what people see.",
          ],
          [
            "Poll",
            "**Poll** tab: **Question** (140 characters), 2–4 **Options** (30 characters each), **Duration** (1 day to 2 weeks)",
            "Polls can't be edited once published.",
          ],
        ],
      },
      warnings: [
        "**Video isn't supported for LinkedIn yet.** If you add a video and pick a LinkedIn account, the LinkedIn post goes out as text only. Post videos to LinkedIn directly for now.",
        "**Document**, **Link** and **Poll** can't be combined with Instagram or YouTube. Make a separate post for those.",
      ],
    },
    {
      id: "limits",
      title: "Limits",
      points: [
        "Caption: up to 3,000 characters.",
        "Link URL must start with `https://`. Title up to 200 characters, description up to 300.",
      ],
    },
  ],
};

export const postingToInstagram: HelpGuide = {
  slug: "posting-to-instagram",
  group: "posting",
  icon: Camera,
  platform: "INSTAGRAM",
  title: "Posting to Instagram",
  summary:
    "Instagram needs a picture or a video. Here is how Cue turns what you add into a photo, a carousel or a Reel.",
  keywords: ["reel", "carousel", "instagram photo", "instagram video", "ig"],
  screens: ["src/components/composer.tsx", "src/lib/platforms/instagram.ts"],
  related: ["write-a-post", "first-comment", "connect-instagram"],
  sections: [
    {
      id: "what-you-get",
      title: "What you add → what Instagram gets",
      table: {
        head: ["You add", "Instagram posts"],
        rows: [
          ["One image", "A photo post"],
          ["One video", "A Reel"],
          ["Two or more images", "A carousel (swipeable)"],
          ["Nothing", "Nothing: Cue stops you. Instagram needs an image or video."],
        ],
      },
      warnings: [
        "A carousel uses only the first 10 images.",
        "Instagram carousels from Cue are images only. If you add images and a video together, the video is left out.",
      ],
    },
    {
      id: "limits",
      title: "Limits",
      points: [
        "Caption: up to 2,200 characters.",
        "Large videos take Instagram a while to process. If it takes more than 3 minutes, the post fails with \"IG media processing timed out\". Try a shorter or smaller file, then **Retry**.",
      ],
    },
  ],
};

export const postingToYouTube: HelpGuide = {
  slug: "posting-to-youtube",
  group: "posting",
  icon: PlaySquare,
  platform: "YOUTUBE",
  title: "Posting to YouTube",
  summary:
    "Upload a video to a client's channel with a title, visibility, category and tags.",
  keywords: ["youtube upload", "title", "unlisted", "private", "tags", "category", "quota", "shorts"],
  screens: ["src/components/composer.tsx", "src/lib/youtube-tags.ts"],
  related: ["write-a-post", "first-comment", "connect-youtube"],
  sections: [
    {
      id: "steps",
      title: "Upload a video",
      steps: [
        { text: "In **01 Who it's for**, switch on the client's YouTube account." },
        {
          text: "In **02 What it says**, add exactly the video you want to upload. The caption becomes the video's description.",
        },
        { text: "Step **02b YouTube details** appears. Type the **Video title** (up to 100 characters).", shot: {"id": "composer-youtube", "path": "/composer", "alt": "The YouTube details step: video title, visibility, category and tags.", "actions": [{"click": {"role": "combobox"}}, {"click": {"role": "option", "name": "Sunmeadow Organics"}}, {"click": {"role": "button", "name": "Sunmeadow Kitchen YouTube"}}, {"waitFor": {"role": "heading", "name": "YouTube details"}}, {"fill": {"placeholder": "Title shown on YouTube"}, "value": "5 oat breakfasts in 10 minutes"}, {"fill": {"placeholder": "Comma-separated, e.g. shorts, ai art, timelapse"}, "value": "breakfast, oats, recipes"}], "crop": {"css": "section:has(h2:text-is('YouTube details'))"}} },
        {
          text: "Choose **Visibility**: **Public** (anyone), **Unlisted** (only people with the link) or **Private** (only the channel).",
        },
        { text: "Pick a **Category**. The default is People & Blogs." },
        {
          text: "Add **Tags**, separated by commas. The counter shows how much of YouTube's 500-character tag budget you've used.",
        },
        { text: "Choose a time in **03 When it goes out** and click **Schedule**." },
      ],
    },
    {
      id: "good-to-know",
      title: "Good to know",
      points: [
        "Description (the caption): up to 5,000 characters.",
        "Tags can't contain `<` or `>`. Repeated tags are removed. A tag with a space costs a little more of the budget.",
        "YouTube limits how many videos apps can upload: about 6 a day across all of Cue. If uploads start failing late in the day, try again the next day.",
        "Unverified YouTube channels can only upload videos up to 15 minutes long. Verify the channel on YouTube to lift that.",
      ],
    },
    {
      id: "trouble",
      title: "If it doesn't work",
      faq: [
        { q: "\"YouTube needs a video to upload\"", a: "Add a video in step 02." },
        { q: "\"Add a title for your YouTube video\"", a: "Fill in **Video title** in step 02b." },
        {
          q: "\"YouTube connection expired or was revoked…\"",
          a: "Reconnect the channel on **Clients** (see [Account health](/help/account-health)), then **Retry** the post.",
        },
      ],
    },
  ],
};

export const mediaFiles: HelpGuide = {
  slug: "media-files",
  group: "posting",
  icon: Images,
  title: "Media files",
  summary: "Which pictures, videos and documents you can upload, and how big they can be.",
  keywords: ["upload", "image", "photo", "video", "file size", "file type", "pdf", "heic", "mp4"],
  screens: ["src/components/composer.tsx", "src/lib/media.ts"],
  related: ["write-a-post", "use-your-own-storage"],
  sections: [
    {
      id: "types",
      title: "What you can upload",
      table: {
        head: ["Kind", "File types"],
        rows: [
          ["Images", "JPG, PNG, GIF, WEBP, HEIC/HEIF, AVIF"],
          ["Videos", "MP4, MOV, WEBM, M4V, AVI, MKV, MPEG"],
          ["Documents (LinkedIn)", "PDF, DOC/DOCX, PPT/PPTX"],
        ],
      },
      points: ["Up to 512 MB per file.", "Up to 20 files per post."],
      tips: [
        "Each network has its own rules on top of these. See [Posting to LinkedIn](/help/posting-to-linkedin), [Posting to Instagram](/help/posting-to-instagram) and [Posting to YouTube](/help/posting-to-youtube).",
      ],
    },
    {
      id: "trouble",
      title: "If it doesn't work",
      faq: [
        {
          q: "\"That file type isn't supported…\"",
          a: "Save or export the file as one of the types above.",
        },
        { q: "\"File is too large (max 512 MB).\"", a: "Compress the video, or trim it." },
        {
          q: "\"Could not upload … to storage…\"",
          a: "If your workspace uses its own storage, an admin can test it in **Settings** → **Media storage** (see [Use your own media storage](/help/use-your-own-storage)). Otherwise try again, or contact support.",
        },
      ],
    },
  ],
};

export const firstComment: HelpGuide = {
  slug: "first-comment",
  group: "posting",
  icon: MessageSquareText,
  title: "First comment",
  summary:
    "Have Cue post a comment under your YouTube video or Instagram post a few minutes after it goes live, for example links or hashtags.",
  keywords: ["comment", "hashtags in comment", "first comment", "pinned comment"],
  screens: ["src/components/composer.tsx", "src/lib/publish.ts"],
  related: ["write-a-post"],
  sections: [
    {
      id: "steps",
      title: "Add a first comment",
      steps: [
        {
          text: "In the composer, select a YouTube or Instagram account and stay on the **Text & media** tab.",
        },
        {
          text: "Type your comment in **First comment** (up to 2,200 characters).",
        },
        {
          text: "Schedule the post as usual. A few minutes after it's live, Cue posts the comment as the same account.",
        },
      ],
      points: [
        "Only YouTube and Instagram. LinkedIn posts ignore it.",
        "YouTube doesn't let apps pin a comment. Pin it yourself on YouTube if you want it at the top.",
        "Cue tries up to 3 times. If the comment still fails, the post itself stays **Published**. Only the comment is missing.",
      ],
    },
    {
      id: "permission",
      title: "If comments fail: give Cue comment permission",
      intro:
        "Commenting needs a permission that isn't asked for in the normal connection. If a comment fails with \"Reconnect this account to allow comments\", grant it once:",
      steps: [
        {
          text: "Ask Cue support (`karan@trycue.space`) for the comment-permission link for your account, or ask your workspace admin.",
        },
        {
          text: "Open the link while signed in to Cue and allow the extra permission on Google or Instagram.",
        },
        {
          text: "From then on, reconnecting the account keeps comment permission.",
        },
      ],
    },
  ],
};

export const draftScheduleOrPostNow: HelpGuide = {
  slug: "draft-schedule-or-post-now",
  group: "posting",
  icon: Clock,
  title: "Draft, Schedule or Post now",
  summary:
    "The three ways to save a post, what each one does, and when a scheduled post actually goes out.",
  keywords: ["timing", "when does it post", "late", "publish now", "draft", "scheduled", "delay"],
  screens: ["src/components/composer.tsx", "src/lib/posts.ts", "src/lib/publish.ts"],
  related: ["write-a-post", "change-a-post", "approvals-and-notes"],
  sections: [
    {
      id: "compare",
      title: "The three choices",
      table: {
        head: ["", "Publishes?", "Use it when"],
        rows: [
          ["**Save draft**", "Never, until you schedule it", "You're not finished, or it needs a date later."],
          ["**Schedule**", "At the time you set", "The normal choice."],
          ["**Post now**", "Straight away", "It needs to be out right now."],
        ],
      },
    },
    {
      id: "timing",
      title: "When a scheduled post goes out",
      points: [
        "Cue checks for due posts about every 5 minutes, so a post goes out up to a few minutes after its time.",
        "If you schedule a time that has already passed, it goes out on the next check.",
        "If an account fails, Cue tries it up to 3 times in total before marking it **Failed**.",
        "A post sent to several accounts can end up **Partial**: published on some, failed on others. See [Why did my post fail?](/help/why-did-my-post-fail).",
      ],
      warnings: [
        "Posts waiting for approval (**In review** or **Changes requested**) don't go out, even when their time comes. See [Approvals and notes](/help/approvals-and-notes).",
        "If Cue support has paused publishing, a banner says so. Scheduled posts go out as soon as it resumes.",
      ],
    },
    {
      id: "status",
      title: "What the statuses mean",
      table: {
        head: ["Status", "Means"],
        rows: [
          ["Draft", "Saved, not scheduled."],
          ["Scheduled", "Waiting for its time."],
          ["Publishing", "Being sent right now."],
          ["Published", "Live on every account."],
          ["Partial", "Live on some accounts, failed on others."],
          ["Failed", "Didn't go out. Open it in **Queue** to see why and **Retry**."],
        ],
      },
    },
  ],
};

export const changeAPost: HelpGuide = {
  slug: "change-a-post",
  group: "posting",
  icon: PencilLine,
  title: "Edit, move, copy or delete a post",
  summary: "Change a scheduled post, move it to another time, copy it, or delete it.",
  keywords: ["edit post", "reschedule", "duplicate", "copy post", "delete post", "move post"],
  screens: [
    "src/components/queue-list.tsx",
    "src/components/calendar/post-peek.tsx",
    "src/components/calendar/week-view.tsx",
  ],
  related: ["calendar", "queue", "draft-schedule-or-post-now"],
  sections: [
    {
      id: "edit",
      title: "Edit a post",
      steps: [
        {
          text: "Find the post in **Queue** or **Calendar** and click **Edit**.",
        },
        { text: "Change anything in the composer." },
        {
          text: "Click **Reschedule** (or **Save draft** to keep it as a draft).",
        },
      ],
      warnings: [
        "Only drafts and scheduled posts can be edited. Once a post is publishing or published, it can't be changed from Cue. Edit it on the network itself.",
      ],
    },
    {
      id: "move",
      title: "Move it to another time",
      points: [
        "On the **Calendar**, drag the post to a new slot. In week view it snaps to 15 minutes. In month view it keeps its time of day.",
        "A toast confirms the move. Click **Undo** if you didn't mean it.",
        "Scheduled posts can only move into the future.",
      ],
    },
    {
      id: "copy",
      title: "Copy a post",
      points: [
        "On the **Calendar**, hold `Alt` while you drop a post: a copy is made at the new time, as a draft. Click **Open** in the toast to edit it.",
        "Or click a post on the calendar and choose **Duplicate**. The copy is saved as a draft.",
      ],
    },
    {
      id: "delete",
      title: "Delete a post",
      steps: [
        { text: "In **Queue**, or after clicking a post on the **Calendar**, click **Delete**." },
        { text: "Confirm." },
      ],
      warnings: ["Deleting in Cue doesn't remove anything already published. Delete it on the network too if needed."],
    },
  ],
};

export const tailorTheCaption: HelpGuide = {
  slug: "tailor-the-caption",
  group: "posting",
  icon: Shuffle,
  title: "Tailor the caption per network",
  summary: "Give each account in a post its own version of the caption, for example a longer one for LinkedIn and one with hashtags for Instagram.",
  keywords: ["different caption", "per platform", "per network", "custom caption"],
  screens: ["src/components/composer.tsx"],
  related: ["write-a-post"],
  sections: [
    {
      id: "steps",
      title: "How",
      steps: [
        { text: "Select accounts on two or more networks and write the main caption." },
        { text: "Switch on **Tailor the caption per network**." },
        {
          text: "Each selected account gets its own box, starting from your main caption. Edit each one.",
        },
      ],
      tips: [
        "Each box is checked against its own network's length limit.",
        "The preview tabs show each version.",
      ],
    },
  ],
};

export const postingGuides = [
  writeAPost,
  postingToLinkedIn,
  postingToInstagram,
  postingToYouTube,
  mediaFiles,
  firstComment,
  draftScheduleOrPostNow,
  changeAPost,
  tailorTheCaption,
];
