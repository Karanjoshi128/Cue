"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import { audit, getPlatformAdminEmail } from "@/lib/admin-guard";
import type { AdminResult } from "@/lib/admin-actions";
import { audienceSchema, countAudience, queueCampaignSends, refreshCampaignCounts } from "@/lib/mailer/audience";
import { contactVars, escapeHtml, fieldKey, SAMPLE_VARS } from "@/lib/mailer/merge";
import { sendTestEmail } from "@/lib/mailer/runner";
import { updateMailerSettings } from "@/lib/mailer/settings";
import { suppress } from "@/lib/mailer/suppression";
import { defaultStorage, objectUrl, presignPut } from "@/lib/storage";

// Write side of /admin/mailer. Like every admin action: re-check the
// platform admin, validate input, return failures as values, audit.

const NOT_ALLOWED: AdminResult = { ok: false, error: "Not found." };
const id = z.string().min(1).max(100);
const email = z.string().trim().toLowerCase().email("Enter a valid email address.").max(254);
const tag = z.string().trim().min(1).max(40);

function fail(e: unknown): { ok: false; error: string } {
  if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Invalid input." };
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
    return { ok: false, error: "That name is already used. Pick another." };
  }
  console.error("[mailer] action failed:", e);
  return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." };
}

function done(message?: string): AdminResult {
  revalidatePath("/admin/mailer", "layout");
  return { ok: true, message };
}

const log = (actor: string, action: string, targetId?: string | null, details?: Prisma.InputJsonValue) =>
  audit({ actor, action: `mailer.${action}`, targetType: "mailer", targetId: targetId ?? null, details });

// ---------------------------------------------------------------------------
// Sending accounts and settings
// ---------------------------------------------------------------------------

const accountInput = z.object({
  id: id.optional(),
  name: z.string().trim().min(1, "Name the account.").max(60),
  fromName: z.string().trim().min(1, "Add a sender name.").max(80),
  fromEmail: email,
  replyTo: z.union([email, z.literal("")]).optional(),
  apiKey: z.string().trim().max(200).optional(),
  webhookSecret: z.string().trim().max(200).optional(),
  perMinute: z.coerce.number().int().min(1).max(600),
  perDay: z.coerce.number().int().min(1).max(1_000_000),
  active: z.boolean(),
});

export async function saveMailerAccount(input: z.input<typeof accountInput>): Promise<AdminResult> {
  const actor = await getPlatformAdminEmail();
  if (!actor) return NOT_ALLOWED;
  try {
    const a = accountInput.parse(input);
    if (a.apiKey && !/^re_[A-Za-z0-9_]{8,}$/.test(a.apiKey)) {
      return { ok: false, error: "That doesn't look like a Resend API key (it starts with re_)." };
    }
    if (a.webhookSecret && !a.webhookSecret.startsWith("whsec_")) {
      return { ok: false, error: "The webhook signing secret starts with whsec_." };
    }
    const data = {
      name: a.name,
      fromName: a.fromName,
      fromEmail: a.fromEmail,
      replyTo: a.replyTo || null,
      perMinute: a.perMinute,
      perDay: a.perDay,
      active: a.active,
      // Blank means "keep the one saved".
      ...(a.apiKey ? { apiKey: encrypt(a.apiKey) } : {}),
      ...(a.webhookSecret ? { webhookSecret: encrypt(a.webhookSecret) } : {}),
    };
    if (a.id) {
      await prisma.mailerAccount.update({ where: { id: a.id }, data });
      await log(actor, "account.update", a.id, {
        name: a.name,
        apiKey: a.apiKey ? "changed" : "unchanged",
        webhookSecret: a.webhookSecret ? "changed" : "unchanged",
      });
      return done(`${a.name} saved.`);
    }
    if (!a.apiKey) return { ok: false, error: "Paste the Resend API key." };
    const row = await prisma.mailerAccount.create({ data: { ...data, apiKey: encrypt(a.apiKey) } });
    await log(actor, "account.create", row.id, { name: a.name, fromEmail: a.fromEmail });
    return done(`${a.name} added. Send a test to check it works.`);
  } catch (e) {
    return fail(e);
  }
}

export async function deleteMailerAccount(accountId: string): Promise<AdminResult> {
  const actor = await getPlatformAdminEmail();
  if (!actor) return NOT_ALLOWED;
  try {
    const busy = await prisma.mailerCampaign.count({
      where: { accountId: id.parse(accountId), status: { in: ["SCHEDULED", "SENDING"] } },
    });
    if (busy) return { ok: false, error: "A campaign is scheduled or sending from this account. Cancel it first." };
    const a = await prisma.mailerAccount.delete({ where: { id: accountId }, select: { name: true } });
    await log(actor, "account.delete", accountId, { name: a.name });
    return done(`${a.name} deleted.`);
  } catch (e) {
    return fail(e);
  }
}

/** Sends a short test email through the account, to prove the key and domain work. */
export async function testMailerAccount(accountId: string, to: string): Promise<AdminResult> {
  const actor = await getPlatformAdminEmail();
  if (!actor) return NOT_ALLOWED;
  try {
    const account = await prisma.mailerAccount.findUniqueOrThrow({ where: { id: id.parse(accountId) } });
    const r = await sendTestEmail({
      account,
      to: email.parse(to),
      vars: { ...SAMPLE_VARS, email: to },
      campaign: {
        id: "account-test",
        subject: `Test from ${account.name}`,
        preheader: "If you can read this, the sending account works.",
        bodyHtml: `<p>Hi,</p><p>This is a test from the <strong>${escapeHtml(account.name)}</strong> sending account in Cue's mailer. If it arrived, the API key and the sending domain work.</p><p>Check where it landed: if it's in spam, finish the domain's DNS setup (SPF, DKIM and DMARC) in Resend.</p>`,
      },
    });
    await prisma.mailerAccount.update({
      where: { id: accountId },
      data: r.ok ? { lastVerifiedAt: new Date(), lastError: null } : { lastError: r.error.slice(0, 500) },
    });
    await log(actor, "account.test", accountId, { to, ok: r.ok });
    if (!r.ok) {
      revalidatePath("/admin/mailer", "layout");
      return { ok: false, error: r.error };
    }
    return done(`Test sent to ${to}. Check the inbox (and spam).`);
  } catch (e) {
    return fail(e);
  }
}

const settingsInput = z.object({
  footerName: z.string().trim().min(1, "Add the name shown in the footer.").max(80),
  footerAddress: z.string().trim().max(200).optional(),
});

export async function saveMailerSettings(input: z.input<typeof settingsInput>): Promise<AdminResult> {
  const actor = await getPlatformAdminEmail();
  if (!actor) return NOT_ALLOWED;
  try {
    const s = settingsInput.parse(input);
    await updateMailerSettings({ footerName: s.footerName, footerAddress: s.footerAddress || null, updatedBy: actor });
    await log(actor, "settings.update", null, { footerName: s.footerName, footerAddress: s.footerAddress ?? null });
    return done("Footer saved.");
  } catch (e) {
    return fail(e);
  }
}

export async function setMailerPaused(paused: boolean): Promise<AdminResult> {
  const actor = await getPlatformAdminEmail();
  if (!actor) return NOT_ALLOWED;
  try {
    await updateMailerSettings({ paused: z.boolean().parse(paused), updatedBy: actor });
    await log(actor, paused ? "pause" : "resume");
    return done(paused ? "All email is paused." : "Sending resumed.");
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

const contactRow = z.object({
  email: z.string().max(320),
  name: z.string().max(200).optional(),
  company: z.string().max(200).optional(),
  fields: z.record(z.string().max(60), z.string().max(1000)).optional(),
});

const importInput = z.object({
  rows: z.array(contactRow).max(2000),
  tags: z.array(tag).max(20).default([]),
  tagExisting: z.boolean().default(true),
  source: z.enum(["manual", "paste", "import"]),
});

export type ImportResult =
  | { ok: true; added: number; tagged: number; existing: number; invalid: number }
  | { ok: false; error: string };

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[a-z]{2,}$/i;

/**
 * Adds contacts (up to 2,000 per call; the import dialog sends big files in
 * chunks). New addresses are created; existing ones are left alone apart
 * from getting the new tags when `tagExisting` is on.
 */
export async function importContacts(input: z.input<typeof importInput>): Promise<ImportResult> {
  const actor = await getPlatformAdminEmail();
  if (!actor) return NOT_ALLOWED as ImportResult;
  try {
    const { rows, tags, tagExisting, source } = importInput.parse(input);
    const seen = new Map<string, z.infer<typeof contactRow>>();
    let invalid = 0;
    for (const r of rows) {
      const e = r.email.trim().toLowerCase();
      if (!EMAIL_RE.test(e)) {
        invalid++;
        continue;
      }
      if (!seen.has(e)) seen.set(e, r);
    }
    const emails = [...seen.keys()];
    const existing = new Set(
      (await prisma.mailerContact.findMany({ where: { email: { in: emails } }, select: { email: true } })).map(
        (c) => c.email,
      ),
    );
    const fresh = emails.filter((e) => !existing.has(e));
    const created = await prisma.mailerContact.createMany({
      data: fresh.map((e) => {
        const r = seen.get(e)!;
        const fields = r.fields
          ? Object.fromEntries(Object.entries(r.fields).map(([k, v]) => [fieldKey(k), v]).filter(([k, v]) => k && v))
          : undefined;
        return {
          email: e,
          name: r.name?.trim() || null,
          company: r.company?.trim() || null,
          tags,
          fields: fields && Object.keys(fields).length ? fields : undefined,
          source,
        };
      }),
      skipDuplicates: true,
    });
    let tagged = 0;
    if (tagExisting && tags.length && existing.size) {
      tagged = await prisma.$executeRaw`
        UPDATE "MailerContact"
        SET tags = ARRAY(SELECT DISTINCT unnest(tags || ${tags}::text[])), "updatedAt" = (now() AT TIME ZONE 'UTC')
        WHERE email = ANY(${[...existing]}::text[]) AND NOT (tags @> ${tags}::text[])`;
    }
    await log(actor, "contacts.import", null, {
      source,
      added: created.count,
      existing: existing.size,
      invalid,
      tags,
    });
    revalidatePath("/admin/mailer", "layout");
    return { ok: true, added: created.count, tagged, existing: existing.size, invalid };
  } catch (e) {
    return fail(e);
  }
}

const contactEdit = z.object({
  id,
  name: z.string().trim().max(200).optional(),
  company: z.string().trim().max(200).optional(),
  tags: z.array(tag).max(30),
});

export async function updateContact(input: z.input<typeof contactEdit>): Promise<AdminResult> {
  const actor = await getPlatformAdminEmail();
  if (!actor) return NOT_ALLOWED;
  try {
    const c = contactEdit.parse(input);
    const row = await prisma.mailerContact.update({
      where: { id: c.id },
      data: { name: c.name || null, company: c.company || null, tags: [...new Set(c.tags)] },
      select: { email: true },
    });
    await log(actor, "contacts.update", c.id, { email: row.email });
    return done("Contact saved.");
  } catch (e) {
    return fail(e);
  }
}

export async function deleteContacts(ids: string[]): Promise<AdminResult> {
  const actor = await getPlatformAdminEmail();
  if (!actor) return NOT_ALLOWED;
  try {
    const list = z.array(id).min(1).max(500).parse(ids);
    const r = await prisma.mailerContact.deleteMany({ where: { id: { in: list } } });
    await log(actor, "contacts.delete", null, { count: r.count });
    return done(`${r.count} contact${r.count === 1 ? "" : "s"} deleted.`);
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------------------
// Do-not-email list
// ---------------------------------------------------------------------------

export async function addSuppressions(emails: string[], note?: string): Promise<AdminResult> {
  const actor = await getPlatformAdminEmail();
  if (!actor) return NOT_ALLOWED;
  try {
    const list = [...new Set(z.array(email).min(1).max(1000).parse(emails))];
    const n = z.string().trim().max(300).optional().parse(note);
    for (const e of list) await suppress(e, "manual", { note: n || null, createdBy: actor });
    await log(actor, "suppression.add", null, { count: list.length, note: n ?? null });
    return done(`${list.length} address${list.length === 1 ? "" : "es"} added to the do-not-email list.`);
  } catch (e) {
    return fail(e);
  }
}

export async function removeSuppression(address: string, reason: string): Promise<AdminResult> {
  const actor = await getPlatformAdminEmail();
  if (!actor) return NOT_ALLOWED;
  try {
    const e = email.parse(address);
    const why = z.string().trim().min(3, "Say why; it goes in the audit log.").max(300).parse(reason);
    const row = await prisma.mailerSuppression.delete({ where: { email: e } });
    await log(actor, "suppression.remove", null, { email: e, was: row.reason, why });
    return done(`${e} can be emailed again.`);
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

const content = {
  subject: z.string().trim().min(1, "Add a subject line.").max(200),
  preheader: z.string().trim().max(200).optional(),
  bodyHtml: z.string().max(200_000),
};

const templateInput = z.object({ id: id.optional(), name: z.string().trim().min(1, "Name the template.").max(80), ...content });

export type SaveResult = { ok: true; id: string; message: string } | { ok: false; error: string };

export async function saveTemplate(input: z.input<typeof templateInput>): Promise<SaveResult> {
  const actor = await getPlatformAdminEmail();
  if (!actor) return NOT_ALLOWED as SaveResult;
  try {
    const t = templateInput.parse(input);
    const data = { name: t.name, subject: t.subject, preheader: t.preheader || null, bodyHtml: t.bodyHtml };
    const row = t.id
      ? await prisma.mailerTemplate.update({ where: { id: t.id }, data })
      : await prisma.mailerTemplate.create({ data: { ...data, createdBy: actor } });
    await log(actor, t.id ? "template.update" : "template.create", row.id, { name: t.name });
    revalidatePath("/admin/mailer", "layout");
    return { ok: true, id: row.id, message: "Template saved." };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteTemplate(templateId: string): Promise<AdminResult> {
  const actor = await getPlatformAdminEmail();
  if (!actor) return NOT_ALLOWED;
  try {
    const t = await prisma.mailerTemplate.delete({ where: { id: id.parse(templateId) }, select: { name: true } });
    await log(actor, "template.delete", templateId, { name: t.name });
    return done(`${t.name} deleted.`);
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------

const campaignInput = z.object({
  id: id.optional(),
  name: z.string().trim().min(1, "Name the campaign.").max(100),
  accountId: z.union([id, z.literal("")]).optional(),
  audience: audienceSchema,
  ...content,
});

/** Saves a draft. Only drafts (and scheduled campaigns, which go back to draft) can change. */
export async function saveCampaign(input: z.input<typeof campaignInput>): Promise<SaveResult> {
  const actor = await getPlatformAdminEmail();
  if (!actor) return NOT_ALLOWED as SaveResult;
  try {
    const c = campaignInput.parse(input);
    const data = {
      name: c.name,
      accountId: c.accountId || null,
      subject: c.subject,
      preheader: c.preheader || null,
      bodyHtml: c.bodyHtml,
      audience: c.audience,
    };
    if (c.id) {
      const r = await prisma.mailerCampaign.updateMany({
        where: { id: c.id, status: { in: ["DRAFT", "SCHEDULED"] } },
        data: { ...data, status: "DRAFT", scheduledAt: null },
      });
      if (r.count !== 1) return { ok: false, error: "This campaign has already started, so it can't be changed." };
      await log(actor, "campaign.update", c.id, { name: c.name });
      revalidatePath("/admin/mailer", "layout");
      return { ok: true, id: c.id, message: "Draft saved." };
    }
    const row = await prisma.mailerCampaign.create({ data: { ...data, createdBy: actor } });
    await log(actor, "campaign.create", row.id, { name: c.name });
    revalidatePath("/admin/mailer", "layout");
    return { ok: true, id: row.id, message: "Draft saved." };
  } catch (e) {
    return fail(e);
  }
}

export type AudienceCount = { ok: true; matched: number; suppressed: number; reachable: number } | { ok: false; error: string };

export async function previewAudience(raw: unknown): Promise<AudienceCount> {
  const actor = await getPlatformAdminEmail();
  if (!actor) return NOT_ALLOWED as AudienceCount;
  try {
    return { ok: true, ...(await countAudience(audienceSchema.parse(raw))) };
  } catch (e) {
    return fail(e);
  }
}

/** Sends the current draft (not necessarily saved) to one address, filled in as `asContact` would see it. */
export async function sendCampaignTest(input: {
  accountId: string;
  subject: string;
  preheader?: string;
  bodyHtml: string;
  to: string;
  asContact?: string;
}): Promise<AdminResult> {
  const actor = await getPlatformAdminEmail();
  if (!actor) return NOT_ALLOWED;
  try {
    const p = z
      .object({
        accountId: id,
        to: email,
        asContact: z.union([email, z.literal("")]).optional(),
        ...content,
      })
      .parse(input);
    const account = await prisma.mailerAccount.findUnique({ where: { id: p.accountId } });
    if (!account) return { ok: false, error: "Pick a sending account first." };
    const contact = p.asContact
      ? await prisma.mailerContact.findUnique({ where: { email: p.asContact } })
      : null;
    if (p.asContact && !contact) return { ok: false, error: `${p.asContact} isn't one of your contacts.` };
    const r = await sendTestEmail({
      account,
      to: p.to,
      vars: contact ? contactVars(contact) : { ...SAMPLE_VARS },
      campaign: { id: "test", subject: p.subject, preheader: p.preheader ?? null, bodyHtml: p.bodyHtml },
    });
    await log(actor, "campaign.test", null, { to: p.to, ok: r.ok });
    return r.ok ? { ok: true, message: `Test sent to ${p.to}.` } : { ok: false, error: r.error };
  } catch (e) {
    return fail(e);
  }
}

async function readyToSend(campaignId: string) {
  const c = await prisma.mailerCampaign.findUnique({ where: { id: campaignId }, include: { account: true } });
  if (!c) throw new Error("Campaign not found.");
  if (c.status !== "DRAFT" && c.status !== "SCHEDULED") throw new Error("This campaign has already started.");
  if (!c.account) throw new Error("Pick a sending account and save the draft first.");
  if (!c.account.active) throw new Error(`${c.account.name} is switched off. Turn it on in Sending.`);
  if (!c.subject.trim()) throw new Error("Add a subject line.");
  if (c.bodyHtml.replace(/<[^>]+>/g, "").trim().length === 0) throw new Error("The email is empty.");
  return c;
}

/**
 * Starts sending now. `expected` is the number the admin confirmed; if the
 * audience changed since, nothing is sent and they're asked again.
 */
export async function sendCampaignNow(campaignId: string, expected: number): Promise<AdminResult> {
  const actor = await getPlatformAdminEmail();
  if (!actor) return NOT_ALLOWED;
  try {
    const c = await readyToSend(id.parse(campaignId));
    const { reachable } = await countAudience(audienceSchema.parse(c.audience));
    if (reachable === 0) return { ok: false, error: "Nobody in this audience can be emailed." };
    if (reachable !== z.number().int().parse(expected)) {
      return { ok: false, error: `The audience is now ${reachable} people. Check it and confirm again.` };
    }
    const flipped = await prisma.mailerCampaign.updateMany({
      where: { id: c.id, status: { in: ["DRAFT", "SCHEDULED"] } },
      data: { status: "SENDING", startedAt: new Date(), scheduledAt: null },
    });
    if (flipped.count !== 1) return { ok: false, error: "This campaign has already started." };
    const q = await queueCampaignSends(c.id, audienceSchema.parse(c.audience));
    await refreshCampaignCounts(c.id);
    await log(actor, "campaign.send", c.id, { name: c.name, queued: q.queued, skipped: q.skipped });
    return done(`Sending to ${q.queued} people. It starts within a minute.`);
  } catch (e) {
    return fail(e);
  }
}

export async function scheduleCampaign(campaignId: string, at: string): Promise<AdminResult> {
  const actor = await getPlatformAdminEmail();
  if (!actor) return NOT_ALLOWED;
  try {
    const c = await readyToSend(id.parse(campaignId));
    const when = new Date(z.string().max(40).parse(at));
    if (Number.isNaN(when.getTime())) return { ok: false, error: "Pick a date and time." };
    if (when.getTime() < Date.now() + 60_000) return { ok: false, error: "Pick a time at least a minute from now." };
    await prisma.mailerCampaign.update({ where: { id: c.id }, data: { status: "SCHEDULED", scheduledAt: when } });
    await log(actor, "campaign.schedule", c.id, { name: c.name, at: when.toISOString() });
    return done("Scheduled. The audience is worked out when it starts.");
  } catch (e) {
    return fail(e);
  }
}

export async function unscheduleCampaign(campaignId: string): Promise<AdminResult> {
  const actor = await getPlatformAdminEmail();
  if (!actor) return NOT_ALLOWED;
  try {
    const r = await prisma.mailerCampaign.updateMany({
      where: { id: id.parse(campaignId), status: "SCHEDULED" },
      data: { status: "DRAFT", scheduledAt: null },
    });
    if (r.count !== 1) return { ok: false, error: "It isn't scheduled any more." };
    await log(actor, "campaign.unschedule", campaignId);
    return done("Back to draft. Nothing will be sent.");
  } catch (e) {
    return fail(e);
  }
}

/** Stops a campaign that's sending: whatever hasn't gone out yet is skipped. */
export async function cancelCampaign(campaignId: string): Promise<AdminResult> {
  const actor = await getPlatformAdminEmail();
  if (!actor) return NOT_ALLOWED;
  try {
    const cid = id.parse(campaignId);
    const r = await prisma.mailerCampaign.updateMany({
      where: { id: cid, status: "SENDING" },
      data: { status: "CANCELLED", completedAt: new Date() },
    });
    if (r.count !== 1) return { ok: false, error: "It isn't sending any more." };
    // Rows already handed to Resend (SENDING) finish on their own; the rest stop.
    await prisma.mailerSend.updateMany({
      where: { campaignId: cid, status: "PENDING" },
      data: { status: "SKIPPED", error: "Campaign cancelled" },
    });
    const counts = await refreshCampaignCounts(cid);
    await log(actor, "campaign.cancel", cid, { sent: counts.sent });
    return done(`Cancelled. ${counts.sent} had already been sent.`);
  } catch (e) {
    return fail(e);
  }
}

export async function duplicateCampaign(campaignId: string): Promise<SaveResult> {
  const actor = await getPlatformAdminEmail();
  if (!actor) return NOT_ALLOWED as SaveResult;
  try {
    const c = await prisma.mailerCampaign.findUniqueOrThrow({ where: { id: id.parse(campaignId) } });
    const row = await prisma.mailerCampaign.create({
      data: {
        name: `${c.name} (copy)`.slice(0, 100),
        accountId: c.accountId,
        subject: c.subject,
        preheader: c.preheader,
        bodyHtml: c.bodyHtml,
        audience: c.audience ?? {},
        createdBy: actor,
      },
    });
    await log(actor, "campaign.duplicate", row.id, { from: c.id });
    revalidatePath("/admin/mailer", "layout");
    return { ok: true, id: row.id, message: "Copied to a new draft." };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteCampaign(campaignId: string): Promise<AdminResult> {
  const actor = await getPlatformAdminEmail();
  if (!actor) return NOT_ALLOWED;
  try {
    const cid = id.parse(campaignId);
    const c = await prisma.mailerCampaign.findUniqueOrThrow({ where: { id: cid }, select: { name: true, status: true } });
    if (c.status === "SENDING" || c.status === "SCHEDULED") {
      return { ok: false, error: "Cancel or unschedule it first." };
    }
    await prisma.mailerCampaign.delete({ where: { id: cid } });
    await log(actor, "campaign.delete", cid, { name: c.name, status: c.status });
    return done(`${c.name} deleted.`);
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
};

export type ImageUpload = { ok: true; uploadUrl: string; url: string } | { ok: false; error: string };

/** A short-lived link to upload one email image straight to Cue's bucket. */
export async function presignMailerImage(input: { fileName: string; contentType: string; size: number }): Promise<ImageUpload> {
  const actor = await getPlatformAdminEmail();
  if (!actor) return NOT_ALLOWED as ImageUpload;
  try {
    const f = z
      .object({ fileName: z.string().max(200), contentType: z.string().max(100), size: z.number().int().positive() })
      .parse(input);
    const ext = IMAGE_TYPES[f.contentType];
    if (!ext) return { ok: false, error: "Use a JPG, PNG, GIF or WebP image." };
    if (f.size > 5 * 1024 * 1024) return { ok: false, error: "Keep email images under 5 MB (smaller is better)." };
    const target = defaultStorage();
    if (!target.publicUrl) return { ok: false, error: "Cue's storage isn't set up on this server." };
    const key = `mailer/${randomUUID()}.${ext}`;
    const uploadUrl = await presignPut(target, key, f.contentType, 300, f.size);
    const url = objectUrl(target, key);
    await prisma.mailerAsset.create({
      data: { storageKey: key, url, fileName: f.fileName, contentType: f.contentType, size: f.size, createdBy: actor },
    });
    return { ok: true, uploadUrl, url };
  } catch (e) {
    return fail(e);
  }
}
