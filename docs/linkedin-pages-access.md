# LinkedIn Company Pages access (playbook)

Goal: publish to clients' **LinkedIn Company Pages**, not personal profiles.

Every client on the roster uses a Page, and we hold admin access on them, so the
only thing standing in the way is LinkedIn granting the organization scopes.

---

## 0. Why the current build cannot do it

| | Today | Needed for Pages |
| --- | --- | --- |
| Scope | `w_member_social` | `w_organization_social` |
| Author URN | `urn:li:person:{sub}` | `urn:li:organization:{id}` |
| Access | self-serve | **application and review** |

- Scope is requested in `src/app/api/oauth/linkedin/start/route.ts`
- The person URN is stored in `src/app/api/oauth/linkedin/callback/route.ts`

`w_member_social` can only ever post to the authorizing member's own profile.
There is no workaround: posting as an organization requires
`w_organization_social`, which is only granted through LinkedIn's **Community
Management API** product.

> Do not add the scope to the OAuth URL before approval. LinkedIn fails the
> authorization with `unauthorized_scope_error`, which would break the LinkedIn
> connect flow that currently works.

---

## 1. The publishing adapter already supports Pages

`src/lib/platforms/linkedin.ts` posts with `author: externalId`, and asset
uploads pass `owner: ownerUrn`, which is also `externalId`. Both fields accept
an organization URN.

So once `externalId` holds `urn:li:organization:{id}`, **text, single image,
multi-image, document and poll posts all publish with no adapter change.** The
work is entirely in the connect flow.

---

## 2. Prerequisites

- [ ] A **LinkedIn Company Page for Cue** exists, and the developer app is
      associated with it. The app already publishes via `w_member_social`, so
      this is probably done. Confirm under the app's **Settings** tab.
- [ ] The app is **verified** by a Page admin (LinkedIn requires this before
      products can be requested).
- [ ] Privacy policy and terms are reachable: `https://trycue.space/privacy`,
      `https://trycue.space/terms`. Both are live.

---

## 3. Apply

LinkedIn Developer Portal -> your app -> **Products** tab -> request
**Community Management API**.

Unlike "Share on LinkedIn", this one is reviewed rather than granted instantly.

Request **only** the scopes actually used. Asking for more than the app
demonstrably needs is the most common reason these get refused:

| Scope | Why Cue needs it |
| --- | --- |
| `w_organization_social` | publish the scheduled post to the connected Page |
| `r_organization_admin` | list the Pages the authorizing member administers, so they can pick one |

Cue does **not** need `r_organization_social` (reading Page posts), follower
data, or messaging scopes. Do not request them.

### Use case description (paste)

> Cue is a social media scheduling tool used by agencies to manage content for
> their clients. An administrator of a client's LinkedIn Company Page connects
> that Page to Cue through LinkedIn OAuth. Cue uses `w_organization_social`
> solely to publish the post the agency composed and scheduled inside Cue to
> that Page, at the time they scheduled it. `r_organization_admin` is used only
> to list the Pages the authorizing member administers, so they can choose which
> Page to connect. Publishing is always initiated by the user for a Page they
> administer. Cue does not read Page analytics, follower data, or messages, and
> requests no other organization scope.

---

## 4. Code changes, once approved

Only the connect flow moves. Roughly:

1. **`linkedin/start`** - add `w_organization_social` and `r_organization_admin`
   to the scope string.
2. **`linkedin/callback`** - instead of storing the member URN, call the
   organization ACLs endpoint (`/rest/organizationAcls?q=roleAssignee`) to fetch
   the Pages this member administers, then resolve each organization's name for
   display.
3. **Page picker** - a member may administer several Pages, so the callback
   cannot guess. Land on a small selection screen, then store the chosen
   `urn:li:organization:{id}` as `externalId` with the Page name as
   `displayName`.
4. **Nothing else.** The adapter, composer, scheduler and publish engine are all
   URN-agnostic.

`@@unique([clientId, platform, externalId])` keys on the URN, so a client can
hold both a Page and a legacy personal profile without conflict. Existing
personal-profile connections keep working and can be disconnected once the Page
is attached.

---

## 5. While waiting

Clients whose only LinkedIn presence is a Page cannot be published to through
the API until this is approved. Either post to those Pages by hand, or lead with
Instagram and YouTube for them.

This review is **independent of the Meta and Google ones**, so it can run at the
same time. It is the slowest of the three to start, so file it first.
