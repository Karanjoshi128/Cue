/* eslint-disable @typescript-eslint/no-explicit-any */
/** Local Postgres only; HTTP and media downloads are mocked and unexpected requests fail closed. */
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import https from "node:https";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import { publishingOptionsSchema, publishingProblem } from "@/lib/publishing-options";
import { instagramAdapter } from "@/lib/platforms/instagram";
import { linkedinAdapter } from "@/lib/platforms/linkedin";
import { youtubeAdapter } from "@/lib/platforms/youtube";
import { applyPublishingEnhancements } from "@/lib/publishing-enhancements";
import { postSchema, mediaCreate } from "@/lib/posts";
import { ruleMatch, compareRules } from "@/lib/automations/settings";
import { trackedLink, verifyTrackedLink } from "@/lib/automations/clicks";
import { instagramScopes } from "@/lib/automations/config";
import { accountSelect, tapPayload } from "@/lib/automations/shared";
import { ingestComments, processRun, createRun } from "@/lib/automations/engine";
import { handleIncomingMessages, sendFollowUps } from "@/lib/automations/conversation";
import { recoverableComments, queueRecoveredComments } from "@/lib/automations/recovery";
import { closeContactAutomations } from "@/lib/automations/handoff";
import { recordLead } from "@/lib/automations/leads";
import { GET as clickRoute } from "@/app/api/automations/click/[id]/route";
import { NextRequest } from "next/server";

let passed = 0;
function check(name: string, condition: unknown) { assert.ok(condition, name); passed++; console.log(`ok ${name}`); }
const calls: { url: URL; method: string; body: any; headers: Headers }[] = [];
const json = (body: unknown, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
const IG = "17840000001";
let nextId = 0;
let profileType = "BUSINESS";
let media: any[] = [];
let comments: any[] = [];
let processing = "succeeded";
let thumbnailFails = false;
const bytes = Buffer.alloc(80_000, 7);
const originalFetch = globalThis.fetch;
const originalGet = https.get;

globalThis.fetch = (async (input, init) => {
  const url = new URL(String(input));
  const method = init?.method ?? "GET";
  const body = init?.body instanceof URLSearchParams ? Object.fromEntries(init.body) : typeof init?.body === "string" ? JSON.parse(init.body) : init?.body;
  calls.push({ url, method, body, headers: new Headers(init?.headers) });
  if (url.hostname === "graph.instagram.com") {
    const path = url.pathname.replace(/^\/v[\d.]+/, "");
    if (path === "/me/media") return json({ data: media });
    if (method === "GET" && path.endsWith("/comments")) return json({ data: comments });
    if (url.searchParams.get("fields") === "account_type") return json({ account_type: profileType });
    if (path.endsWith("/media_publish")) return json({ id: "published-ig" });
    if (path.endsWith("/media") && method === "POST") return json({ id: `container-${++nextId}` });
    if (url.searchParams.get("fields")?.startsWith("status_code")) return json({ status_code: "FINISHED" });
    if (url.searchParams.get("fields") === "permalink") return json({ permalink: "https://www.instagram.com/p/test/" });
    if (path.endsWith("/messages")) return json({ message_id: `dm-${++nextId}`, recipient_id: body.recipient.id || `person-${body.recipient.comment_id}` });
    if (path.endsWith("/replies")) return json({ id: `reply-${++nextId}` });
  }
  if (url.hostname === "api.linkedin.com") {
    if (url.searchParams.get("action") === "initializeUpload") return json({ value: { video: "urn:li:video:fixture", uploadToken: "fixture-upload", uploadInstructions: [{ uploadUrl: "https://upload.example/part1", firstByte: 0, lastByte: 39999 }, { uploadUrl: "https://upload.example/part2", firstByte: 40000, lastByte: 79999 }], captionsUploadUrl: "https://upload.example/captions", thumbnailUploadUrl: "https://upload.example/cover" } });
    if (url.searchParams.get("action") === "finalizeUpload") return new Response(null, { status: 204 });
    if (url.pathname.startsWith("/rest/videos/")) return json({ status: "AVAILABLE" });
    if (url.pathname === "/rest/posts") return json({}, 201, { "x-restli-id": "urn:li:share:fixture" });
  }
  if (url.hostname === "upload.example") return new Response(null, { status: 200, headers: { etag: `"etag-${url.pathname.slice(1)}"` } });
  if (url.hostname === "www.googleapis.com") {
    if (url.pathname === "/upload/youtube/v3/videos") return json({}, 200, { location: "https://upload.example/youtube" });
    if (url.pathname === "/youtube/v3/videos") return json({ items: [{ processingDetails: { processingStatus: processing } }] });
    if (url.pathname === "/upload/youtube/v3/thumbnails/set") return json(thumbnailFails ? { error: "test refusal" } : { items: [{}] }, thumbnailFails ? 403 : 200);
  }
  throw new Error(`Unexpected test HTTP request: ${method} ${url.origin}${url.pathname}`);
}) as typeof fetch;
// Test the real fetchMedia consumer and adapter byte ranges without reaching a network socket.
https.get = ((url: URL, _options: unknown, callback: (res: any) => void) => {
  assert.equal(url.hostname, "media.example", "unexpected media host");
  const req = new EventEmitter() as any;
  req.destroy = () => req;
  queueMicrotask(() => {
    const res = new EventEmitter() as any;
    res.statusCode = 200;
    res.headers = { "content-type": url.pathname.endsWith(".jpg") ? "image/jpeg" : "video/mp4", "content-length": String(bytes.length) };
    callback(res);
    res.emit("data", bytes);
    res.emit("end");
  });
  return req;
}) as typeof https.get;

async function main() {
  const url = new URL(process.env.DATABASE_URL || "http://invalid");
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname) && url.pathname.includes("test"), "local test database required BEFORE any query");
  const [{ db }] = await prisma.$queryRaw<{ db: string }[]>`select current_database() as db`;
  assert.ok(db.includes("test"));
  const previous = await prisma.workspace.findMany({ where: { name: "Parity Test Workspace" }, select: { id: true } });
  const previousIds = previous.map((w) => w.id);
  await prisma.client.deleteMany({ where: { workspaceId: { in: previousIds } } });
  await prisma.user.deleteMany({ where: { workspaceId: { in: previousIds } } });
  await prisma.workspace.deleteMany({ where: { id: { in: previousIds } } });
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3219";
  const jpg = { type: "IMAGE" as const, url: "https://media.example/one.jpg", altText: "A coffee cup", userTags: [{ username: "creator", x: .25, y: .75 }] };
  const video = { type: "VIDEO" as const, url: "https://media.example/video.mp4" };
  const input = { body: "Launch", media: [jpg, video], accessToken: "fixture-token", externalId: IG };
  check("mixed IG carousel passes preflight", !publishingProblem("INSTAGRAM", input.media, {}));
  check("IG refuses PNG rather than silently dropping it", !!publishingProblem("INSTAGRAM", [{ ...jpg, url: "https://media.example/a.png" }], {}));
  check("YT rejects two videos", !!publishingProblem("YOUTUBE", [video, video], {}));
  check("Page cannot use profile audience", !!publishingProblem("LINKEDIN", [], { linkedin: { visibility: "CONNECTIONS" } }, { externalId: "urn:li:organization:1" }));
  check("made-for-kids refuses first comment", !!publishingProblem("YOUTUBE", [video], { youtube: { madeForKids: true } }, { firstComment: "Hello" }));
  check("corrupt disclosure rejected", !publishingOptionsSchema.safeParse({ youtube: { madeForKids: "false" } }).success);
  await instagramAdapter.publish({ ...input, options: { instagram: { collaborators: ["creator"], aiGenerated: true } } });
  const containers = calls.filter((c) => c.method === "POST" && c.url.pathname.endsWith("/media"));
  check("IG includes image then video then parent", containers.length === 3 && containers[0].body.image_url && containers[1].body.media_type === "VIDEO" && containers[2].body.media_type === "CAROUSEL");
  check("IG alt text and tags belong to child", containers[0].body.alt_text === jpg.altText && JSON.parse(containers[0].body.user_tags)[0].x === .25);
  check("IG collaborators and disclosure belong to parent", containers[2].body.collaborators === '["creator"]' && containers[2].body.is_ai_generated === "true" && !containers[0].body.is_ai_generated);
  check("IG auth never in publish URLs", calls.every((c) => !c.url.searchParams.has("access_token")));
  calls.length = 0;
  await instagramAdapter.publish({ ...input, media: [video], cover: jpg, options: { instagram: { thumbOffset: 5000, shareToFeed: false, trialReel: "MANUAL" } } });
  const reel = calls.find((c) => c.url.pathname.endsWith("/media"))!.body;
  check("Reel cover takes precedence over frame", reel.cover_url === jpg.url && !reel.thumb_offset);
  check("Reel feed and trial settings sent", reel.share_to_feed === "false" && JSON.parse(reel.trial_params).graduation_strategy === "MANUAL");
  profileType = "MEDIA_CREATOR";
  await assert.rejects(instagramAdapter.publish({ ...input, media: [jpg], options: { instagram: { placement: "STORY" } } }), /Business account/); passed++;
  profileType = "BUSINESS";
  calls.length = 0;
  await instagramAdapter.publish({ ...input, media: [jpg], options: { instagram: { placement: "STORY" } } });
  const story = calls.find((c) => c.url.pathname.endsWith("/media"))!.body;
  check("Story has mentions but no feed caption or alt text", story.media_type === "STORIES" && story.user_tags && !story.caption && !story.alt_text);

  calls.length = 0;
  await linkedinAdapter.publish({ ...input, externalId: "urn:li:person:1", media: [video], cover: jpg, options: { linkedin: { visibility: "CONNECTIONS", disableReshares: true, videoTitle: "Launch video", captionsSrt: "1\n00:00:00,000 --> 00:00:01,000\nHello" } } });
  const parts = calls.filter((c) => c.url.pathname.startsWith("/part"));
  check("LinkedIn uploads exact provider byte ranges", parts.length === 2 && parts.every((c) => c.body.byteLength === 40000));
  check("LinkedIn finalizes returned ETags", JSON.stringify(calls.find((c) => c.url.searchParams.get("action") === "finalizeUpload")!.body.finalizeUploadRequest.uploadedPartIds) === '["etag-part1","etag-part2"]');
  check("LinkedIn captions are multipart", calls.find((c) => c.url.pathname === "/captions")?.body instanceof FormData);
  const liPost = calls.find((c) => c.url.pathname === "/rest/posts")!.body;
  check("LinkedIn video is attached, never text-only", liPost.content.media.id === "urn:li:video:fixture" && liPost.visibility === "CONNECTIONS" && liPost.isReshareDisabledByAuthor);

  const uploadFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => String(url) === "https://upload.example/youtube" ? json({ id: "fixture-yt" }) : uploadFetch(url, init);
  calls.length = 0;
  await youtubeAdapter.publish({ ...input, media: [video], title: "Launch", options: { youtube: { madeForKids: true, containsSyntheticMedia: true, notifySubscribers: false, embeddable: false, publicStatsViewable: false, license: "creativeCommon", defaultLanguage: "en", localizations: { hi: { title: "Launch Hindi", description: "Translated description" } }, recordingDate: "2026-11-01T00:00:00.000Z" } } });
  const yt = calls.find((c) => c.url.pathname === "/upload/youtube/v3/videos")!;
  check("YT upload-only metadata and notify switch", yt.body.status.selfDeclaredMadeForKids && yt.body.status.containsSyntheticMedia && !yt.body.status.embeddable && yt.url.searchParams.get("notifySubscribers") === "false");
  check("YT localized metadata and recording date parts", yt.url.searchParams.get("part")?.includes("localizations") && yt.body.localizations.hi.title === "Launch Hindi" && yt.body.recordingDetails.recordingDate);

  const ws = await prisma.workspace.create({ data: { name: "Parity Test Workspace", earlyFeatures: ["ig_automations"] } });
  const user = await prisma.user.create({ data: { email: `parity-${randomUUID()}@example.test`, name: "Test owner", workspaceId: ws.id, role: "ADMIN", memberships: { create: { workspaceId: ws.id, role: "ADMIN" } } } });
  const client = await prisma.client.create({ data: { workspaceId: ws.id, name: "Parity Test Brand" } });
  const account = await prisma.socialAccount.create({ data: { clientId: client.id, platform: "INSTAGRAM", externalId: IG, displayName: "@fixture", accessToken: encrypt("fixture-token"), tokenExpires: new Date(Date.now() + 86400_000), scopes: instagramScopes({ automations: true }).join(",") } });
  const acct = await prisma.socialAccount.findUniqueOrThrow({ where: { id: account.id }, select: accountSelect });
  const rule = await prisma.automationRule.create({ data: { clientId: client.id, accountId: account.id, name: "Opening DM and tracking", activeSince: new Date(Date.now() - 3600_000), matchMode: "WORD", keywords: ["guide"], dmText: "Your guide", dmButtonLabel: "Read guide", dmButtonUrl: "https://example.com/guide", replies: ["Check your DMs"], settings: { openingDm: true, gateButtonLabel: "Yes please", leadTags: ["launch"], trackClicks: true, excludedKeywords: ["not interested"] } } });
  const event = (id: string, text = "guide", fromId = `person-${id}`) => ({ id, text, fromId, fromUsername: `reader_${id}`, parentId: null, mediaId: "post1", timestamp: new Date() });
  const message = (senderId: string, text: string | null, payload: string | null = null) => ({ igUserId: IG, senderId, mid: randomUUID(), text, payload, storyId: null, isEcho: false, at: new Date() });
  const runFor = (commentId: string) => prisma.automationRun.findUniqueOrThrow({ where: { commentId } });
  await ingestComments(acct, [event("opening")], "WEBHOOK");
  const opening = await runFor("opening");
  check("opening DM waits for tap without follow gate", opening.stage === "WAIT_TAP" && opening.dmMessageId && !opening.deliveredAt);
  await handleIncomingMessages([message("person-opening", null, tapPayload(opening.id))]);
  const delivered = await runFor("opening");
  check("tap delivers without follower lookup", delivered.stage === "DONE" && delivered.deliveredAt && !calls.some((c) => c.url.searchParams.get("fields")?.includes("is_user_follow_business")));
  const lead = await prisma.lead.findUniqueOrThrow({ where: { accountId_igsid: { accountId: account.id, igsid: "person-opening" } } });
  check("rule tags stored", lead.tags.includes("launch"));
  await Promise.all([recordLead({ clientId: client.id, accountId: account.id, igsid: lead.igsid, username: null, source: "COMMENT", ruleName: rule.name, tags: ["new", "launch"] }), recordLead({ clientId: client.id, accountId: account.id, igsid: lead.igsid, username: null, source: "COMMENT", ruleName: rule.name, tags: ["other"] })]);
  const tagged = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
  check("concurrent tag updates merge without duplicates", tagged.tags.length === 3 && tagged.tags.includes("new") && tagged.tags.includes("other"));
  const signed = new URL(trackedLink(opening.id, "https://example.com/guide"));
  check("signed redirect validates", verifyTrackedLink(opening.id, signed.searchParams.get("to"), signed.searchParams.get("sig")) === "https://example.com/guide");
  check("changed destination refused", !verifyTrackedLink(opening.id, Buffer.from("https://attacker.example").toString("base64url"), signed.searchParams.get("sig")));
  const response = await clickRoute(new NextRequest(signed, { headers: { "user-agent": "Mozilla/5.0" } }), { params: Promise.resolve({ id: opening.id }) });
  check("click redirects and counts once", response.status === 302 && (await runFor("opening")).clickCount === 1);
  await clickRoute(new NextRequest(signed, { headers: { "user-agent": "facebookexternalhit" } }), { params: Promise.resolve({ id: opening.id }) });
  check("preview bot ignored", (await runFor("opening")).clickCount === 1);
  check("exclusion applies to catch-all", !ruleMatch("not interested", { ...rule, matchMode: "ANY_COMMENT" }).matched);
  check("exact matcher ignores case, rejects extra words", ruleMatch("GUIDE", { ...rule, settings: { exactMatch: true } }).matched && !ruleMatch("guide please", { ...rule, settings: { exactMatch: true } }).matched);
  check("specific post beats high-priority catch-all", compareRules({ ...rule, scope: "ONE_POST" }, { ...rule, settings: { priority: 100 } }) < 0);
  await ingestComments(acct, [event("excluded", "guide not interested")], "WEBHOOK");
  check("excluded event never queues", !await prisma.automationRun.findUnique({ where: { commentId: "excluded" } }));
  const future = await prisma.automationRule.create({ data: { clientId: client.id, accountId: account.id, name: "Future campaign", startsAt: new Date(Date.now() + 86400_000), keywords: ["future"], dmText: "Soon", activeSince: new Date(0) } });
  await ingestComments(acct, [event("future", "future")], "WEBHOOK");
  check("future campaign does not start", !await prisma.automationRun.findUnique({ where: { commentId: "future" } }));
  await prisma.automationRule.update({ where: { id: future.id }, data: { startsAt: null, endsAt: new Date(Date.now() - 1000) } });
  const expired = await createRun({ account: acct, rule: future, eventId: "expired", mediaId: "post1", commenterId: "expired-person", username: null, text: "future", at: new Date(), source: "POLL" });
  if (expired) await processRun(expired);
  check("expired campaign cannot send queued work", !(await runFor("expired")).dmMessageId);
  const simultaneous = await Promise.all(["race-one", "race-two"].map((eventId) => createRun({ account: acct, rule, eventId, mediaId: "post1", commenterId: "same-person", username: null, text: "guide", at: new Date(), source: "POLL" })));
  check("simultaneous different comments respect once-per-person", simultaneous.filter(Boolean).length === 1);
  const cooldownRule = await prisma.automationRule.create({ data: { clientId: client.id, accountId: account.id, name: "Cooldown", oncePerPerson: false, dmText: "Again", keywords: ["again"], settings: { cooldownHours: 24 } } });
  const cooled = await Promise.all(["cool-one", "cool-two"].map((eventId) => createRun({ account: acct, rule: cooldownRule, eventId, mediaId: "post1", commenterId: "cool-person", username: null, text: "again", at: new Date(), source: "POLL" })));
  check("cooldown also survives simultaneous events", cooled.filter(Boolean).length === 1);
  const queued = await createRun({ account: acct, rule, eventId: "stop-queued", mediaId: "post1", commenterId: "stop-person", username: null, text: "guide", at: new Date(), source: "POLL" });
  await handleIncomingMessages([message("stop-person", "STOP")]);
  check("STOP cancels old queue", (await runFor("stop-queued")).status === "SKIPPED");
  await prisma.lead.update({ where: { accountId_igsid: { accountId: account.id, igsid: "stop-person" } }, data: { automationPaused: false } });
  if (queued) await processRun(queued);
  check("resume does not revive old queue", !(await runFor("stop-queued")).dmMessageId);
  await closeContactAutomations(account.id, "person-opening");
  await sendFollowUps();

  // Native next post must bind by publication time, even if a newer post gets the comment first.
  const next = await prisma.automationRule.create({ data: { clientId: client.id, accountId: account.id, name: "Next post", scope: "ONE_POST", nextPost: true, activeSince: new Date(Date.now() - 5000), keywords: ["next"], dmText: "Next resource" } });
  media = [{ id: "newest", timestamp: new Date().toISOString() }, { id: "first", timestamp: new Date(Date.now() - 2000).toISOString() }];
  await ingestComments(acct, [{ ...event("next", "next"), mediaId: "newest" }], "WEBHOOK");
  check("next post bound to first actual publication", (await prisma.automationRule.findUniqueOrThrow({ where: { id: next.id } })).mediaId === "first" && !await prisma.automationRun.findUnique({ where: { commentId: "next" } }));
  media.push({ id: "post1", timestamp: new Date(Date.now() - 86400_000).toISOString() });
  comments = [{ id: "recover", text: "guide", timestamp: new Date(Date.now() - 2 * 3600_000).toISOString(), from: { id: "recover-person", username: "reader" } }, { id: "too-old", text: "guide", timestamp: new Date(Date.now() - 8 * 86400_000).toISOString(), from: { id: "old-person" } }];
  const preview = await recoverableComments(ws.id, rule.id, "post1");
  check("recovery finds missed matches before activeSince, but within seven days", preview.comments.length === 1 && preview.comments[0].id === "recover");
  await assert.rejects(recoverableComments("other-workspace", rule.id, "post1"), /not found/); passed++;
  await assert.rejects(recoverableComments(ws.id, rule.id, "foreign-post"), /recent/); passed++;
  const recovered = await queueRecoveredComments(ws.id, rule.id, "post1", ["recover", "forged-id"]);
  check("confirmation rechecks IDs and queues only eligible", recovered.queued === 1 && !await prisma.automationRun.findUnique({ where: { commentId: "forged-id" } }));
  check("recovery cannot queue the same comment again", (await queueRecoveredComments(ws.id, rule.id, "post1", ["recover"])).queued === 0);

  const ytAccount = await prisma.socialAccount.create({ data: { clientId: client.id, platform: "YOUTUBE", externalId: "fixture-channel", displayName: "Test channel", accessToken: encrypt("fixture-token"), tokenExpires: new Date(Date.now() + 86400_000), scopes: "https://www.googleapis.com/auth/youtube.upload" } });
  const postData = postSchema.parse({ clientId: client.id, body: "Media order", accountIds: [ytAccount.id], action: "draft", media: [ { ...video, storageKey: `posts/${randomUUID()}.mp4`, role: "CONTENT" }, { ...jpg, storageKey: `posts/${randomUUID()}.jpg`, role: "COVER" } ], publishOptions: { youtube: { madeForKids: true } } });
  const post = await prisma.post.create({ data: { clientId: client.id, authorId: user.id, body: "Local test video", status: "PUBLISHED", media: mediaCreate(postData), publishOptions: postData.publishOptions, targets: { create: { accountId: ytAccount.id, platform: "YOUTUBE", status: "PUBLISHED", externalPostId: "fixture-yt", publishedAt: new Date(Date.now() - 10 * 60_000) } } }, include: { media: { orderBy: { sortOrder: "asc" } }, targets: true } });
  check("media role, alt text and order round-trip", post.media[0].type === "VIDEO" && post.media[1].role === "COVER" && post.media[1].altText === jpg.altText && post.media[1].sortOrder === 1);
  calls.length = 0;
  thumbnailFails = true;
  await applyPublishingEnhancements();
  let target = await prisma.postTarget.findUniqueOrThrow({ where: { id: post.targets[0].id } });
  check("thumbnail failure does not change published status", target.status === "PUBLISHED" && !!target.enhancementError && target.enhancementAttempts === 1);
  check("upload-only grant never requests processing read scope", !calls.some((c) => c.url.pathname === "/youtube/v3/videos"));
  thumbnailFails = false;
  await prisma.postTarget.update({ where: { id: target.id }, data: { enhancementClaimedAt: null } });
  await applyPublishingEnhancements();
  target = await prisma.postTarget.findUniqueOrThrow({ where: { id: target.id } });
  check("thumbnail retry succeeds without another video upload", !!target.enhancedAt && !calls.some((c) => c.url.pathname === "/upload/youtube/v3/videos"));
  const before = calls.length;
  await applyPublishingEnhancements();
  check("applied thumbnail not retried", calls.length === before);
  await prisma.socialAccount.update({ where: { id: ytAccount.id }, data: { scopes: "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.force-ssl" } });
  await prisma.postTarget.update({ where: { id: target.id }, data: { enhancedAt: null, enhancementClaimedAt: null, enhancementAttempts: 0 } });
  processing = "processing";
  await applyPublishingEnhancements();
  target = await prisma.postTarget.findUniqueOrThrow({ where: { id: target.id } });
  check("existing broad grant waits for processing without consuming retries", target.enhancementAttempts === 0 && target.enhancementError?.includes("processing"));
  const liAccount = await prisma.socialAccount.create({ data: { clientId: client.id, platform: "LINKEDIN", externalId: "urn:li:person:fixture", displayName: "Test LinkedIn profile", accessToken: encrypt("fixture-token"), scopes: "w_member_social" } });
  await prisma.post.create({ data: { clientId: client.id, authorId: user.id, body: "UI preview fixture", title: "UI preview", media: mediaCreate(postData), publishOptions: { instagram: { shareToFeed: false }, youtube: { containsSyntheticMedia: true }, linkedin: { videoTitle: "Preview video" } }, targets: { create: [account, ytAccount, liAccount].map((a) => ({ accountId: a.id, platform: a.platform })) } } });
  console.log(`\n${passed} parity checks passed. Fixture workspace retained for UI QA: ${ws.id}`);
}

main().catch((err) => { console.error(err); process.exitCode = 1; }).finally(async () => { globalThis.fetch = originalFetch; https.get = originalGet; await prisma.$disconnect(); });
