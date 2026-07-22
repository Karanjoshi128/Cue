# Google / YouTube verification (playbook)

Goal: let **any** agency connect **their clients'** YouTube channels, instead of
only Google accounts you've added as test users.

Cue requests one sensitive scope:

- `https://www.googleapis.com/auth/youtube.upload` (plus `openid`, `email`,
  `profile`, which are non-sensitive)

There are **two independent processes**. Do them in this order.

| #   | Process                                          | Unlocks                      |
| --- | ------------------------------------------------ | ---------------------------- |
| 1   | **OAuth consent screen verification**            | Anyone can connect a channel |
| 2   | **YouTube API Services audit + quota extension** | More than ~6 uploads/day     |

---

## 0. Two things that bite early

**Testing mode expires refresh tokens after 7 days.** While the OAuth app is in
_Testing_ publishing status, Google invalidates refresh tokens weekly, so a
connected channel silently stops publishing. Publishing the app (step 1) is what
fixes this - it is not just a "more users" nicety.

**Quota is the real ceiling.** `videos.insert` costs **1600 units** and the
default project quota is **10,000 units/day** - about **6 uploads per day across
all clients**. A 15-client agency will hit this immediately, so step 2 matters as
much as step 1.

---

## 1. Prerequisites (done in this repo)

- Privacy Policy has a **YouTube API Services** section -`https://trycue.space/privacy`
  - links the [YouTube ToS](https://www.youtube.com/t/terms) and
    [Google Privacy Policy](https://policies.google.com/privacy)
  - states **Limited Use** compliance with the
    [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy)
  - documents revoking access at `myaccount.google.com/permissions`
- Terms reference the YouTube ToS -`https://trycue.space/terms`
- Data deletion covers YouTube/Google tokens -`https://trycue.space/data-deletion`

> These must be **live on the domain** before submitting - reviewers fetch them.

---

## 2. OAuth consent screen (Google Cloud Console)

**APIs & Services → OAuth consent screen**, on the project that owns the OAuth
client in `GOOGLE_CLIENT_ID`:

- [ ] User type **External**
- [ ] App name `Cue`, user support email, and an **app logo**:
      `public/brand/cue-app-icon-wordmark-1024.png`. Use this one rather than
      the mark-only `cue-app-icon-1024.png`. Google rejected the bare blue C
      with "your logo does not uniquely identify your brand and identity", so
      the icon now stacks the mark above the "cue" wordmark, which ties the
      consent screen name, the homepage H1 and the logo into one identity.
- [ ] **App domain**: home `https://trycue.space`, privacy
      `https://trycue.space/privacy`, terms `https://trycue.space/terms`
- [ ] **Authorized domain**: `trycue.space`
- [ ] Developer contact email
- [ ] **Scopes** → add `.../auth/youtube.upload`
- [ ] **Credentials → OAuth client → Authorized redirect URIs** must contain
      `https://trycue.space/api/oauth/youtube/callback`

**Verify domain ownership** in [Google Search Console](https://search.google.com/search-console)
for `trycue.space` using the same Google account - Google will not accept the
authorized domain otherwise.

---

## 3. Submit for verification

Click **Publish app** → Google prompts for verification because of the sensitive
scope. You'll be asked for:

**Scope justification** - paste:

> Cue is a social media scheduling tool for agencies. After a user connects their
> own YouTube channel via Google OAuth, Cue uses `youtube.upload` solely to
> upload the video the user composed and scheduled in Cue, with the title,
> description, and visibility they chose. Uploads are always initiated by the
> user for a channel they authorized. Cue does not read existing videos,
> comments, subscribers, or analytics, and requests no other YouTube scope.

**Demo video** (unlisted YouTube link) that shows, without cuts:

1. The Cue sign-in and the Clients page.
2. Clicking **YouTube** → the **Google OAuth consent screen with the scope
   visible** → approving it.
3. Composing a post: title, visibility, video attached.
4. **Post now** → the video appearing on the channel.
5. Disconnecting the channel / the `/data-deletion` page.

> Reviewers reject videos that skip the consent screen or the result. Same rule
> as the Meta screencast (`meta-app-review.md` §3).

Timeline: usually several days, sometimes weeks. Watch the email on the developer
account for follow-up questions and answer fast.

---

## 4. Quota extension (do after step 3)

Default quota is **10,000 units/day** and `videos.insert` costs **1600 units**,
so Cue can publish roughly **6 videos a day across every client** before uploads
start failing. Raising it means the **"YouTube API Services - Audit and Quota
Extension Form"**, linked from Google's YouTube API compliance audit docs.

### Before applying

- [ ] OAuth verification (step 3) complete, or at least submitted.
- [ ] Real usage on the project. Google weighs **demonstrated need**, so an
      application from a project with almost no traffic is usually deferred.
      Onboard clients first and apply as you approach the ceiling.

### Details to hand over

| Field                | Value                                                     |
| -------------------- | --------------------------------------------------------- |
| Google Cloud project | `cuePostingProject`                                       |
| Project number       | `887582754693` (numeric prefix of the OAuth client id)    |
| API                  | YouTube Data API v3                                       |
| Scope requested      | `youtube.upload` only                                     |
| Methods called       | `videos.insert` (resumable upload), and nothing else      |

### What the app does (paste)

> Cue is a social media scheduling tool for agencies and social media managers.
> A user connects their own or their client's YouTube channel through Google
> OAuth, then composes a video post in Cue alongside their LinkedIn and Instagram
> content on a single calendar. At the scheduled time Cue uploads the video to
> that channel with `videos.insert`, using the title, description, and privacy
> status the user chose. Cue calls no other YouTube Data API method and requests
> no other YouTube scope: it does not read videos, comments, subscribers, or
> analytics.

### Quota justification (put real numbers in)

Show the arithmetic, `uploads per day x 1600 units`:

- 15 clients x 2 uploads/day = 30 uploads = **48,000 units/day**
- roughly 20% headroom for retries and growth, so request about **60,000/day**

Ask for what the arithmetic supports. Inflated requests with no calculation
behind them get refused.

### Compliance points the audit checks (already satisfied in this repo)

- Privacy policy links the [YouTube ToS](https://www.youtube.com/t/terms) and the
  [Google Privacy Policy](https://policies.google.com/privacy), at `/privacy`
- Limited Use statement for the Google API Services User Data Policy, at `/privacy`
- Revoking access via Google account permissions, at `/privacy` and `/data-deletion`
- Terms reference the YouTube ToS, at `/terms`
- Every upload is user-initiated, to a channel the user explicitly authorized

---

## 5. Common rejection reasons

- Privacy policy not on the verified domain, or missing the Limited Use language.
- Demo video doesn't show the consent screen with the scope.
- Requesting broader YouTube scopes than the app demonstrably uses.
- Authorized domain not verified in Search Console under the same account.
