import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { ApiError } from "@/lib/api";

// AI helpers (Claude). Everything here is optional: without ANTHROPIC_API_KEY
// the features that use it are hidden, and the automatic ones (moderation,
// sorting comments) quietly fall back to Cue's own rules.
//
// One model, Claude Opus 5.5, at low effort: these are short, routine jobs.
// Every request opts into the server-side refusal fallback, so a request a
// safety classifier declines is retried on the model Anthropic picks for it.
// Comments and DMs are written by strangers, so prompts treat them as data.

const MODEL = "claude-opus-5-5";

export function aiEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

let client: Anthropic | undefined;
const claude = () => (client ??= new Anthropic({ timeout: 60_000, maxRetries: 2 }));

/** A failure the person should read (in a toast): an ApiError, so toResult passes it on. */
export class AiError extends ApiError {
  constructor(message: string) {
    super(502, message);
  }
}

/** One request whose answer must match `schema`. */
async function ask<S extends z.ZodType>(opts: {
  system: string;
  prompt: string;
  schema: S;
  maxTokens?: number;
}): Promise<z.output<S>> {
  if (!aiEnabled()) throw new AiError("AI helpers aren't set up.");
  let res;
  try {
    res = await claude().beta.messages.parse({
      model: MODEL,
      max_tokens: opts.maxTokens ?? 8000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: opts.system,
      messages: [{ role: "user", content: opts.prompt }],
      output_config: { effort: "low", format: betaZodOutputFormat(opts.schema) },
    });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) throw new AiError("Claude is busy. Try again in a minute.");
    if (e instanceof Anthropic.AuthenticationError) throw new AiError("Cue's Claude API key isn't valid.");
    if (e instanceof Anthropic.APIError) {
      console.error("[ai] request failed:", e.status, e.message);
      throw new AiError("Claude couldn't answer just now. Try again.");
    }
    throw e;
  }
  if (res.stop_reason === "refusal") throw new AiError("Claude wouldn't write this one.");
  if (res.stop_reason === "max_tokens" || res.parsed_output === null) {
    throw new AiError("Claude's answer came back incomplete. Try again.");
  }
  return res.parsed_output as z.output<S>;
}

/** Text from a stranger, fenced so instructions inside it read as content. */
const quoted = (label: string, text: string) =>
  `<${label}>\n${text.replaceAll(`</${label}>`, "")}\n</${label}>`;

const URLS = /https?:\/\/\S+/g;

// ---------------------------------------------------------------------------
// Automations
// ---------------------------------------------------------------------------

/**
 * Other wordings of a DM, same offer and link, so a busy automation doesn't
 * send hundreds of identical messages. Any version that drops a link or the
 * {username} placeholder is thrown away.
 */
export async function writeDmVariants(text: string, count: number): Promise<string[]> {
  const { variants } = await ask({
    system:
      "You rewrite the direct message an Instagram brand account sends automatically when someone comments a keyword. " +
      "Write fresh versions that say the same thing in different words: same offer, same tone, about the same length. " +
      "Keep every link exactly as written and keep {username} exactly as written if it appears. " +
      "Don't add claims, prices, discounts or emojis the original doesn't have. Match the original's language.",
    prompt: `Write ${count} versions of this DM.\n\n${quoted("dm", text)}`,
    schema: z.object({ variants: z.array(z.string()) }).strict(),
  });
  const links = text.match(URLS) ?? [];
  const keepsName = text.includes("{username}");
  const seen = new Set([text.trim()]);
  return variants
    .map((v) => v.trim())
    .filter((v) => {
      const ok =
        v.length > 0 &&
        v.length <= 640 &&
        !seen.has(v) &&
        links.every((l) => v.includes(l)) &&
        (!keepsName || v.includes("{username}"));
      seen.add(v);
      return ok;
    })
    .slice(0, count);
}

const moderationSchema = z
  .object({
    hold: z.boolean(),
    reason: z.string().describe("Under 8 words, e.g. 'Harassment' or 'Spam link'. Empty when not held."),
  })
  .strict();

/**
 * Why a comment should be held instead of answered automatically, or null.
 * Fails open: if Claude can't answer, the automation carries on.
 */
export async function moderateComment(text: string): Promise<string | null> {
  try {
    const r = await ask({
      system:
        "You screen comments on a brand's Instagram posts before an automation replies to them. " +
        "Hold a comment only if replying would embarrass the brand: harassment, hate, threats, sexual content, " +
        "scams or spam links, or attacks on someone. Criticism, complaints, jokes and slang are fine, don't hold them.",
      prompt: `Should this comment be held?\n\n${quoted("comment", text)}`,
      schema: moderationSchema,
      maxTokens: 2000,
    });
    return r.hold ? (r.reason.trim().slice(0, 60) || "Flagged by AI") : null;
  } catch (e) {
    console.error("[ai] moderation skipped:", e instanceof Error ? e.message : e);
    return null;
  }
}

/** An automation the person described in a sentence, for the editor to open with. */
export const automationIdeaSchema = z
  .object({
    name: z.string().describe("A short name, e.g. 'Menu link for MENU'."),
    trigger: z
      .enum(["COMMENT", "STORY_REPLY", "DM_KEYWORD"])
      .describe("COMMENT: a comment on a post. STORY_REPLY: a reply to a story. DM_KEYWORD: a keyword sent by DM."),
    matchMode: z
      .enum(["WORD", "CONTAINS", "ANY_COMMENT"])
      .describe("WORD: the keyword as a word. CONTAINS: anywhere. ANY_COMMENT: every comment, no keyword."),
    keywords: z.array(z.string()).describe("Keywords in the language people will type them, without quotes."),
    publicReplies: z
      .array(z.string())
      .describe("Short public replies under the comment, e.g. 'Sent! Check your DMs 📩'. Empty for stories and DMs."),
    dmText: z.string().describe("The DM. Use {username} for their handle. Put the link on the button, not here."),
    link: z.string().nullable().describe("The web address to send, exactly as the person gave it, or null."),
    buttonLabel: z.string().nullable().describe("Up to 20 characters, e.g. 'See the menu'. Null when there's no link."),
    followGate: z.boolean().describe("Only send the link to people who follow the account."),
    collect: z.enum(["EMAIL", "PHONE"]).nullable().describe("Ask for an email or phone number before sending."),
    followUp: z.boolean().describe("Send a reminder later if they don't open the link."),
  })
  .strict();

export type AutomationIdea = z.output<typeof automationIdeaSchema>;

export async function draftAutomation(description: string, brand: string): Promise<AutomationIdea> {
  return ask({
    system:
      "You turn a social media manager's one-sentence description into the settings for an Instagram automation: " +
      "when someone comments a keyword (or replies to a story, or DMs a keyword), the account replies publicly and sends a DM, " +
      "usually with a link. Fill every field. Only use a link the person actually gave; never invent one. " +
      "Write replies and the DM in the brand's voice and in the language of the description, short and friendly.",
    prompt: `Brand: ${brand}\n\n${quoted("description", description)}`,
    schema: automationIdeaSchema,
  });
}

// ---------------------------------------------------------------------------
// Reply Desk
// ---------------------------------------------------------------------------

/**
 * A short public reply to a comment, in the brand's voice. Facts Claude can't
 * know (prices, dates, stock) are left as [blanks] for the person to fill in.
 */
export async function draftCommentReply(input: {
  brand: string;
  platform: string;
  post: string | null;
  comment: string;
  author: string | null;
}): Promise<string> {
  const { reply } = await ask({
    system:
      `You draft public replies to comments for ${input.brand}'s ${input.platform === "YOUTUBE" ? "YouTube" : "Instagram"} account. ` +
      "One or two short sentences, warm and specific to what they said, in the comment's language. No hashtags. " +
      "Never invent facts such as prices, dates, stock or policies: where the answer needs one, leave a blank in square brackets, like [price], " +
      "for the team to fill in. A person reviews the draft before it's posted.",
    prompt:
      (input.post ? `The post: ${quoted("post", input.post)}\n\n` : "") +
      `${input.author ? `From ${input.author}: ` : ""}${quoted("comment", input.comment)}`,
    schema: z.object({ reply: z.string() }).strict(),
    maxTokens: 4000,
  });
  return reply.trim();
}

export type CommentKindAi = "QUESTION" | "OTHER" | "NOISE" | "ABUSE";

/**
 * Sorts new comments for the Reply Desk: questions first, noise (emoji, tags,
 * "nice") out of the way, abuse flagged. Returns what it could sort; anything
 * missing keeps Cue's own guess.
 */
export async function classifyComments(
  comments: { id: string; text: string }[],
): Promise<Map<string, CommentKindAi>> {
  if (!comments.length) return new Map();
  const { results } = await ask({
    system:
      "You sort comments on a brand's posts for its social media team. For each comment pick one kind: " +
      "QUESTION (asks something the brand should answer, including 'price?', 'link pls', 'where?'), " +
      "ABUSE (harassment, hate, threats, sexual content, scams or spam), " +
      "NOISE (only emoji, tagging friends, or a one-word reaction like 'nice' or 'wow'), " +
      "or OTHER (everything else worth reading). Comments may be in any language, including Hinglish.",
    prompt:
      "Sort these comments. Answer with every id.\n\n" +
      quoted("comments", JSON.stringify(comments.map((c) => ({ id: c.id, text: c.text.slice(0, 500) })))),
    schema: z
      .object({
        results: z.array(z.object({ id: z.string(), kind: z.enum(["QUESTION", "OTHER", "NOISE", "ABUSE"]) }).strict()),
      })
      .strict(),
  });
  const ids = new Set(comments.map((c) => c.id));
  return new Map(results.filter((r) => ids.has(r.id)).map((r) => [r.id, r.kind]));
}
