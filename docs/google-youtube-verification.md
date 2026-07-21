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
- [ ] App name `Cue`, user support email, and an **app logo** (square PNG;
      `public/brand/cue-app-icon-1024.png` works, resized)
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

Search for the **"YouTube API Services – Audit and Quota Extension Form"**. It
asks for a compliance review of how the app uses YouTube data, plus your expected
daily upload volume. Budget real time for this one.

Math to quote in the form: `uploads/day × 1600 units`. 15 clients posting once a
day ≈ **24,000 units/day**, so request headroom above that.

---

## 5. Common rejection reasons

- Privacy policy not on the verified domain, or missing the Limited Use language.
- Demo video doesn't show the consent screen with the scope.
- Requesting broader YouTube scopes than the app demonstrably uses.
- Authorized domain not verified in Search Console under the same account.
