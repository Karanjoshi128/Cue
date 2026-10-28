// Client-safe. Instagram comment automations stay hidden until Meta grants
// comment and message access (App Review round 3). The flag is a public env
// var so the nav can read it; Next inlines it at build time, so flipping it
// on Vercel needs a redeploy.

export function automationsEnabled(): boolean {
  return process.env.NEXT_PUBLIC_IG_AUTOMATIONS === "1";
}

/** What Cue asks Instagram for today. Must match the App Review screencast. */
export const IG_PUBLISH_SCOPES = [
  "instagram_business_basic",
  "instagram_business_content_publish",
];

/** Read and reply to comments, and send the private reply DM. */
export const IG_AUTOMATION_SCOPES = [
  "instagram_business_manage_comments",
  "instagram_business_manage_messages",
];

/** The comment permission alone: first comments and the Reply Desk need it. */
export const IG_COMMENT_SCOPE = "instagram_business_manage_comments";

/**
 * The scopes a connect asks for. Publishing always; the extras only when the
 * connect link opts in (?comments=1, ?automations=1), so the default dialog
 * matches App Review. Messages also need the automations flag on.
 */
export function instagramScopes(
  opts: { comments?: boolean; automations?: boolean } = {},
): string[] {
  const scopes = [...IG_PUBLISH_SCOPES];
  if (opts.comments || opts.automations) scopes.push(IG_COMMENT_SCOPE);
  if (opts.automations && automationsEnabled()) {
    scopes.push("instagram_business_manage_messages");
  }
  return scopes;
}

/** Whether an account was connected with comment and message access. */
export function hasAutomationScopes(scopes: string | null | undefined): boolean {
  if (!scopes) return false;
  const granted = new Set(scopes.split(/[\s,]+/));
  return IG_AUTOMATION_SCOPES.every((s) => granted.has(s));
}

// Instagram's limits, mirrored in the editor and in validation.
export const LIMITS = {
  keywords: 20,
  keywordLength: 40,
  replies: 5,
  replyLength: 300,
  /** Button template text is capped at 640 characters, plain text at 1000. */
  dmLength: 640,
  buttonLabel: 20,
  name: 60,
  dmVariants: 5,
  holdWords: 30,
  /** The follow-up has to land inside Instagram's 24-hour window. */
  followUpMaxMinutes: 23 * 60,
};

/** Default wording for the conversation steps a rule leaves blank. */
export const COPY = {
  gate: "Tap below and I'll send it over 👇",
  tapLabel: "Send me the link",
  notFollowing: "Almost there! Follow {handle} first, then tap the button again 👇",
  followUp: "Still want it? Tap below 👇",
  ask: {
    EMAIL: "What's your email? Reply here and I'll send it over.",
    PHONE: "What's your phone number? Reply here and I'll send it over.",
  },
  invalid: {
    EMAIL: "That doesn't look like an email address. Could you send it again?",
    PHONE: "That doesn't look like a phone number. Could you send it again?",
  },
} as const;

/** Instagram only allows the private reply within this long of the comment. */
export const PRIVATE_REPLY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** The per-comment activity log (commenter names and text) is kept this long. */
export const RUN_RETENTION_DAYS = 30;
