import { escapeHtml, mergeHtml, mergeText, type MergeVars } from "@/lib/mailer/merge";

/*
 * Turns a campaign's body into the email that's actually sent: merge fields
 * filled in, wrapped in a simple email-safe layout with the footer (who it's
 * from, the unsubscribe link, an optional address), a hidden preview line,
 * and a plain-text version. Pure: used by the browser preview too.
 */

export interface RenderInput {
  subject: string;
  preheader?: string | null;
  bodyHtml: string;
  vars: MergeVars;
  footer: { name: string; address?: string | null; contactEmail: string };
  /** The recipient's personal unsubscribe link. */
  unsubscribeUrl: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** Images never overflow a phone screen. */
export function responsiveImages(html: string): string {
  return html.replace(/<img\b([^>]*)>/gi, (tag, attrs: string) => {
    if (/style\s*=/i.test(attrs)) {
      return tag.replace(/style\s*=\s*"([^"]*)"/i, (_m, s: string) =>
        /max-width/i.test(s) ? `style="${s}"` : `style="max-width:100%;height:auto;${s}"`,
      );
    }
    return `<img${attrs} style="max-width:100%;height:auto;">`;
  });
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", nbsp: " " };

/** A readable plain-text version for clients that don't show HTML (and for spam filters). */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<a\b[^>]*href\s*=\s*"([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, label: string) => {
      const text = label.replace(/<[^>]+>/g, "").trim();
      return !text || text === href ? href : `${text} (${href})`;
    })
    .replace(/<li\b[^>]*>/gi, "\n• ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr|table|ul|ol|blockquote)>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#39|amp|lt|gt|quot|nbsp);/g, (_m, e: string) => ENTITIES[e] ?? "")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function renderEmail(input: RenderInput): RenderedEmail {
  const subject = mergeText(input.subject, input.vars).replace(/\s+/g, " ").trim();
  const preheader = input.preheader ? mergeText(input.preheader, input.vars).trim() : "";
  const body = responsiveImages(mergeHtml(input.bodyHtml, input.vars));
  const { name, address, contactEmail } = input.footer;
  const unsub = escapeHtml(input.unsubscribeUrl);

  // A run of invisible characters after the preview text stops inboxes from
  // filling the preview line with the start of the body.
  const spacer = "&#847;&zwnj;&nbsp;".repeat(40);

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(subject)}</title>
<style>
  .cue-body a { color: #1f5fd6; }
  .cue-body h1, .cue-body h2, .cue-body h3 { line-height: 1.3; margin: 1.2em 0 0.5em; color: #14130f; }
  .cue-body p { margin: 0 0 1em; }
  .cue-body ul, .cue-body ol { margin: 0 0 1em; padding-left: 1.4em; }
  .cue-body img { max-width: 100%; height: auto; border: 0; }
  @media (max-width: 620px) { .cue-pad { padding: 24px 20px !important; } }
</style>
</head>
<body style="margin:0;padding:0;background:#f4f3ee;">
${preheader ? `<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">${escapeHtml(preheader)}${spacer}</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f3ee;">
<tr><td align="center" style="padding:32px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;border:1px solid #e6e3da;border-radius:14px;">
<tr><td class="cue-body cue-pad" style="padding:32px 36px;font-family:${FONT};font-size:16px;line-height:1.6;color:#2b2a26;">
${body}
</td></tr>
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;">
<tr><td style="padding:20px 24px;font-family:${FONT};font-size:12px;line-height:1.7;color:#7a766c;text-align:center;">
${escapeHtml(name)} &middot; <a href="mailto:${escapeHtml(contactEmail)}" style="color:#7a766c;">${escapeHtml(contactEmail)}</a>${address ? `<br>${escapeHtml(address)}` : ""}<br>
Don&#39;t want these emails? <a href="${unsub}" style="color:#7a766c;text-decoration:underline;">Unsubscribe</a>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const text = [
    preheader ? `${preheader}\n` : "",
    htmlToText(body),
    "",
    "--",
    `${name} · ${contactEmail}`,
    address ?? "",
    `Unsubscribe: ${input.unsubscribeUrl}`,
  ]
    .filter((l, i, a) => !(l === "" && a[i - 1] === ""))
    .join("\n")
    .trim();

  return { subject, html, text };
}
