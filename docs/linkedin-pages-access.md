# LinkedIn Company Pages access (playbook)

Goal: publish to clients' **LinkedIn Company Pages**, not personal profiles.

Every client on the roster uses a Page, and we hold admin access on them, so the
only thing standing in the way is LinkedIn granting the organization scopes.

Sources: LinkedIn's
[Community Management App Review](https://learn.microsoft.com/en-us/linkedin/marketing/community-management-app-review)
and [Increasing Access](https://learn.microsoft.com/en-us/linkedin/marketing/increasing-access)
pages (checked 13 Oct 2026).

---

## 0. Status

| Step | State |
| ---- | ----- |
| Applying entity | **Karan Joshi (Udyam MSME)**, decided 13 Oct 2026. Matches the privacy policy, terms and the Meta submission. |
| Cue LinkedIn Page | Exists; Karan is super admin. |
| Business mailbox on trycue.space | **Done, 13 Oct 2026.** `karan@trycue.space` on Zoho Mail (Forever Free, India DC); MX + SPF set in Hostinger DNS; test mail received. Legal pages and site contact switched to it. |
| New developer app for Pages | Created as `Cue`, linked to the Cue Page (company 142914285). The old `post Auto` app (Google for Startups Page, not verified) still powers personal-profile posting. |
| Community Management API, Development tier | **Submitted 13 Oct 2026** as legal name **Karan Joshi**, use case **Page Management only**, app verified by the Cue Page. Waiting on: the Microsoft Vetting Services email to `karan@trycue.space` (click to verify), any document request (send the Udyam certificate), and a possible vetting survey in the Developer Portal (21-day limit). |
| Page connect flow in Cue | **Built 13 Oct 2026**, hidden until the new app's keys are set in Vercel (see §6). |

---

## 1. Why the current build cannot do it

| | Today | Needed for Pages |
| --- | --- | --- |
| Scope | `w_member_social` | `w_organization_social` |
| Author URN | `urn:li:person:{sub}` | `urn:li:organization:{id}` |
| Access | self-serve | **application and review** |

- Scope is requested in `src/app/api/oauth/linkedin/start/route.ts`
- The person URN is stored in `src/app/api/oauth/linkedin/callback/route.ts`

`w_member_social` can only ever post to the authorizing member's own profile.
Posting as an organization requires `w_organization_social`, which is only
granted through LinkedIn's **Community Management API** product.

> Do not add the scope to the OAuth URL before approval. LinkedIn fails the
> authorization with `unauthorized_scope_error`, which would break the LinkedIn
> connect flow that currently works.

The publishing adapter already supports Pages: `src/lib/platforms/linkedin.ts`
posts with `author: externalId` and uploads with `owner: externalId`, and both
accept an organization URN. The work is in the connect flow only (§6).

---

## 2. The two tiers, and why Development is enough to start

All apps start on **Development tier**. **Standard tier** is a second
application, made after the integration is built.

| | Development | Standard |
| --- | --- | --- |
| Limits | 500 calls per app per day; 100 calls per member per day; no BATCH_GET; no webhooks | none |
| Duration | integration must be finished within 12 months | permanent |
| Needs | access form + vetting | Development tier + a screencast + test credentials |

A text post is about 1 call and an image post about 2-3 (upload, then post), so
100 calls per admin per day covers roughly 30+ posts a day. That fits 15 clients
publishing from Cue. **Development tier is enough for our own clients' Pages.**
Standard tier only matters when other agencies use Cue at volume.

---

## 3. Hard rules (any one of these fails the application)

1. **Registered legal organizations only, for commercial use.** Use the exact
   enterprise name and address from the Udyam certificate.
2. **Business email on the organization's domain, verified.** "Personal email
   addresses won't pass the vetting process." Use an `@trycue.space` address.
3. **The app must be verified by a super admin of the organization's LinkedIn
   Page** (the Cue Page).
4. **The app's name and logo must not contain any part of the LinkedIn or
   Microsoft names or logos** (no "Linked", no "In").
5. **A rejection is final for that app.** You must create a new app to re-apply.
   Get every field right the first time.
6. **Vetting survey:** if one appears in the Developer Portal after you apply, it
   must be completed within **21 days**.

**Separate app:** create a **new** developer app for this rather than adding the
product to the existing one. The existing app carries Sign In with LinkedIn and
Share on LinkedIn, and as far as we know Community Management API can't share an
app with other products (the Products tab says so if true). A separate app also
means a rejection can't touch the personal-profile posting that works today.

---

## 4. Steps

### 4.1 Business mailbox on trycue.space (blocker)

Recommended: **Zoho Mail, Forever Free plan** (real inbox, up to 5 users). Fallback:
**ImprovMX** free forwarding to Gmail.

1. Sign up for Zoho Mail → add domain `trycue.space` → create `karan@trycue.space`.
2. In **Hostinger → DNS** for trycue.space, add exactly what Zoho shows:
   - the TXT record that proves domain ownership
   - the **MX** records on the apex (`@`)
   - the SPF TXT on the apex (`v=spf1 include:zoho.in ~all` or as Zoho shows)
3. Send a test email from Gmail to `karan@trycue.space` and confirm it arrives.

These records sit on the apex only. Resend's sign-in email records live on
`send.trycue.space` and are **not touched**. If DNS later moves to Cloudflare,
copy these new MX/SPF records across too (`dns-migration-cloudflare.md`).

Done: the contact email on `/privacy`, `/terms`, `/data-deletion` and the
landing page now comes from one constant, `CONTACT_EMAIL` in
`src/components/marketing/site-chrome.tsx`, set to `karan@trycue.space`, so the
policy, website and business email all sit on one domain.

### 4.2 Check the Cue LinkedIn Page

- Website field: `https://trycue.space`
- Name and description describe Cue, the product.

### 4.3 Create the new developer app

[linkedin.com/developers/apps/new](https://www.linkedin.com/developers/apps/new):

| Field | Value |
| ----- | ----- |
| App name | `Cue` |
| LinkedIn Page | the Cue Page |
| Privacy policy URL | `https://trycue.space/privacy` |
| App logo | `public/brand/cue-app-icon-1024.png` |

Then:

1. **Settings tab → Verify** → generate the URL → open it while signed in as the
   Cue Page super admin → approve. The app shows as Verified.
2. **Auth tab → Authorized redirect URLs** → add
   `https://trycue.space/api/oauth/linkedin-page/callback` (used by the Page
   connect flow in §6).

### 4.4 Request Community Management API

**Products tab → Community Management API → Request access**, then fill the form
with §5. Click the verification link LinkedIn emails to `karan@trycue.space`.

---

## 5. Access form answers

| Field | Answer |
| ----- | ------ |
| Organization legal name | exactly as on the Udyam certificate |
| Registered address | exactly as on the Udyam certificate |
| Website | `https://trycue.space` |
| Privacy policy | `https://trycue.space/privacy` |
| Business email | `karan@trycue.space` |
| Use case(s) | **Page Management only** |

**Tick only Page Management.** For Standard tier, the screencast must demonstrate
every use case ticked here, so Page Analytics, Brand Engagement, Executive
Management or Employee Advocacy would each add something Cue would have to build
and show. Personal-profile posting stays on the existing app.

### Use case description (paste)

> Cue (trycue.space) is a social media scheduling tool for marketing agencies.
> An agency manages content for several client brands, and an administrator of a
> client's LinkedIn Company Page connects that Page to Cue through LinkedIn OAuth.
> Cue uses rw_organization_admin only to list the Pages the signed-in member
> administers, so they can choose which Page to connect, and to show that Page's
> name in Cue. Cue uses w_organization_social only to publish posts that the
> agency wrote and scheduled in Cue to the Page they connected, at the time they
> chose (text, images, documents and polls). Every post is created and scheduled
> by a person; Cue never posts on its own. Cue does not read Page analytics,
> follower data, comments or messages, and does not request those permissions.

---

## 6. The Page connect flow (built 13 Oct 2026, off until approval)

Built ahead of approval and **hidden until the new app's keys are set**, so
nothing changes for users before then.

### How it works

1. **Clients → a client card → LinkedIn Page button** (LinkedIn icon with a
   building). It only appears when `LINKEDIN_PAGES_CLIENT_ID` and
   `LINKEDIN_PAGES_CLIENT_SECRET` are set.
2. **`/api/oauth/linkedin-page/start`** sends the user to LinkedIn on the new app
   with scopes `rw_organization_admin w_organization_social`. A nonce in a
   cookie is checked on return, so a forged callback can't inject Pages.
3. **`/api/oauth/linkedin-page/callback`** exchanges the code, lists every Page
   the member is an approved **Administrator or Content admin** of
   (`/rest/organizationAcls?q=roleAssignee&state=APPROVED`), looks up each name
   with single GETs (Development tier has no BATCH_GET), and holds the token and
   list in two encrypted, 15-minute cookies. Nothing is saved yet.
4. **`/clients/linkedin-pages`** shows every Page with a client dropdown. One
   consent connects **all** clients' Pages at once, which keeps setup inside
   the Development tier's 100 calls per member per day. Dropdowns are
   preselected: a Page already connected to a client (so reconnecting is one
   click), then a client whose name matches the Page, then the card the
   connect began from if only one Page came back.
5. **Connect** saves each chosen Page as a LINKEDIN account:
   `externalId = urn:li:organization:{id}`, `displayName` = Page name. Page ids
   are checked against the encrypted list, not the form.
6. **Token refresh** (publish time and the keepalive cron) uses the Pages app's
   keys for any `urn:li:organization:` account.
7. Publishing needed no change: the adapter posts with `author: externalId`.

Code: `src/lib/linkedin-pages.ts`, `src/lib/linkedin-page-actions.ts`,
`src/app/api/oauth/linkedin-page/*`, `src/app/(app)/clients/linkedin-pages/`,
`src/components/linkedin-page-picker.tsx`.

Content admins: LinkedIn's single Page lookup is admin-only, so for a Page
where the member is only a Content admin the name may show as
"LinkedIn Page {id}". It still connects and publishes.

### Switching it on, once LinkedIn approves

1. The `Cue` app → **Auth** tab: confirm the redirect URL
   `https://trycue.space/api/oauth/linkedin-page/callback` is listed; copy the
   **Client ID** and **Client Secret** (never paste the secret in chat).
2. **Vercel → cue → Settings → Environment Variables** (Production): add
   `LINKEDIN_PAGES_CLIENT_ID` and `LINKEDIN_PAGES_CLIENT_SECRET`, then redeploy.
3. Clients → any card → **LinkedIn Page** → approve → match each Page to its
   client → Connect.
4. Publish a test post to the **Cue** Page first, then the clients'.

`@@unique([clientId, platform, externalId])` keys on the URN, so a client can hold
both a Page and a personal profile without conflict.

---

## 7. Standard tier, later

Needs: Development tier, a finished integration, test credentials, and a
high-resolution, downloadable screencast with only Cue on screen (narration
recommended). For Page Management it must show:

- a user approving access through the complete OAuth flow
- a user posting to their Page via Cue
- how a member's comment on that post is displayed in Cue, and which commenter
  profile fields are shown
- any other feature that uses members' personal data

Cue shows no comments. LinkedIn says to state that in the recording when a
listed feature doesn't exist.

---

## 8. While waiting

Clients whose only LinkedIn presence is a Page can't be published to through the
API until approval. Post to those Pages by hand, or lead with Instagram and
YouTube for them. This review is independent of Meta and Google, so all three can
run at the same time.
