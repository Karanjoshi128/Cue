# Google / YouTube verification (playbook)

Goal: let **any** agency connect **their clients'** YouTube channels, instead of
only Google accounts you've added as test users.

Cue requests one sensitive scope:

- `https://www.googleapis.com/auth/youtube.upload` (plus `openid`, `email`,
  `profile`, which are non-sensitive)

> **Since first comments (branch `feat/first-comment`), Cue also requests
> `https://www.googleapis.com/auth/youtube.force-ssl`.** It is used only for
> `commentThreads.insert`, to post the first comment the user wrote under the
> video Cue just uploaded for them. It is a second sensitive scope, not covered
> by the `youtube.upload` verification, so any verification submission must
> declare it, justify it and show it in the demo video. The texts in §3.2 and
> §4 predate it (they say Cue doesn't use force-ssl): update them before
> submitting. Until it is verified, Google may show the unverified-app screen
> again when a channel is connected.

There are **two independent processes**. Do them in this order.

| #   | Process                                          | Unlocks                      |
| --- | ------------------------------------------------ | ---------------------------- |
| 1   | **OAuth consent screen verification**            | Anyone can connect a channel |
| 2   | **YouTube API Services audit + quota extension** | More than ~6 uploads/day     |

---

## Status

| Step | State |
| ---- | ----- |
| Cloud project | **shorts-automation-509405** (number 12824634376), shared with the youtubechannel1 tools. Console: [Audience](https://console.cloud.google.com/auth/audience?project=shorts-automation-509405), [Branding](https://console.cloud.google.com/auth/branding?project=shorts-automation-509405), [Verification Center](https://console.cloud.google.com/auth/verification?project=shorts-automation-509405). |
| Publishing status | **In production, verified.** The unverified-app warning and the 100-user cap no longer apply to `youtube.upload`. Existing connections (e.g. HiBeRNaTe) keep working; no reconnect needed. |
| Logo | Bare blue C rejected ("does not uniquely identify your brand"). Replaced by `cue-app-icon-wordmark-1024.png`. |
| Branding verification | **Verified 13 Oct 2026** (app name Cue, wordmark logo `cue-app-icon-wordmark-1024.png` uploaded, trycue.space verified in Search Console under the project owner's account, developer contacts ytkaranbusiness006@gmail.com + karan@trycue.space). **Published** the same day: the consent screen now shows "Cue". |
| OAuth clients in the project | Only `cue-web` since 14 Oct 2026. youtubechannel1's tools moved to their own project **yt-tools-511605** (number 796517867282, Desktop client `796517867282-gfveb…`, In production, unverified); old `Desktop client 1` deleted. |
| Data access | **Verified 16 Oct 2026** (Google email "OAuth Verification Request Acknowledgement", approved for `.../auth/youtube.upload`). Submitted 14 Oct with justification §3.2 and demo https://youtu.be/dZuFv-WN87w. **Any change to the consent screen (branding, logo, links, scopes) needs a new verification**, so don't edit it casually; adding a scope (e.g. youtube.readonly for analytics) means a new review. |
| Quota extension | **Next step.** Not requested. 10,000 units/day is about 6 uploads/day across all clients (HiBeRNaTe alone uses 2). Apply via §4 once real usage approaches the ceiling. |

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

## 3. Data access: declare and verify `youtube.upload`

### 3.1 Declare the scopes

**Google Auth Platform → Data Access → Add or remove scopes.** Tick exactly what
Cue requests (`src/app/api/oauth/youtube/start/route.ts`), nothing more:

| Scope | Type |
| ----- | ---- |
| `https://www.googleapis.com/auth/youtube.upload` | **Sensitive** |
| `openid` | non-sensitive |
| `.../auth/userinfo.email` | non-sensitive |
| `.../auth/userinfo.profile` | non-sensitive |

**Update → Save.** Declaring changes nothing for users; Cue already requests
these. The Verification Center then says data access needs verification.

### 3.2 Justification (paste into "How will the scopes be used?")

> Cue (https://trycue.space) is a social media scheduling tool for agencies and
> social media managers. A user connects their own or their client's YouTube
> channel to a client in Cue through Google OAuth. Cue uses youtube.upload only
> to upload the video the user composed in Cue to that channel, with the title,
> description, tags, category and visibility the user chose, either immediately
> ("Post now") or at the time they scheduled. Every upload is created and
> scheduled by a person; Cue never uploads on its own. youtube.upload is the
> narrowest scope that allows uploading; Cue does not use the broader youtube or
> youtube.force-ssl scopes. openid, email and profile are used only to show
> which Google account a connected channel belongs to. Cue does not read the
> user's existing videos, comments, subscribers or analytics. Users can
> disconnect the channel in Cue at any time, which deletes the stored tokens.

(940 characters; the field allows 1000.)

### 3.3 Demo video (the part reviewers reject most)

Google's rules: English UI, the **OAuth consent screen with the browser address
bar visible** so the `client_id` in the URL can be read, and the scope actually
in use. Upload it to YouTube as **Unlisted** and paste the link.

**The video must include every OAuth client in the project.** The
shorts-automation project is shared with the youtubechannel1 local tools; if
their OAuth client lives here, either show its consent too (and declare its
scopes) or, better, move those tools to their own project first so this project
holds only Cue's web client. Check **Google Auth Platform → Clients**.

#### Accounts: use test ones, never the real channel

- **A new Google account with its own YouTube channel.** Shot 9 disconnects the
  channel, and the test upload lands on whatever channel you connect. Doing that
  with the HiBeRNaTe account would disconnect the channel its scheduled Shorts
  publish to, and put a test video on a public channel.
- **A fresh Cue workspace.** Sign in with an email that isn't in your main
  workspace (e.g. `karan@trycue.space`; the code arrives in the Zoho Mail app).
  New workspaces start on Unlimited with YouTube on, and Google's reviewers then
  see no real client names.

#### Setup, once (about 30 minutes)

1. Move `Desktop client 1` out of the project first (see Status).
2. Create the Google account (e.g. `cue.review.demo@gmail.com`). Set its language
   to **English** (myaccount.google.com → Personal info → Language).
3. On youtube.com, signed in as it: avatar → **Create a channel** (e.g. "Cue Demo").
4. A clean **Chrome profile** (Chrome avatar → Add → continue without an account),
   English, bookmarks bar hidden (Ctrl+Shift+B), no extensions, zoom 125%. Sign
   the test Google account in at accounts.google.com, so the OAuth flow shows the
   account chooser instead of a password field.
5. In that profile, sign in to Cue with the fresh email → name the workspace
   "Cue Demo" → Clients → **Add client** "Demo Brand". Connect nothing yet.
6. A 10-20 second MP4 of your own footage, no copyrighted music, on the Desktop.
7. Windows: Do not disturb on (Win+N), other apps closed. Recorder: Snipping
   Tool → Record (Win+Shift+R), full screen.
8. Do one dry run of shots 2-7 without recording, then disconnect the channel in
   Cue so the real take starts clean. Cue always re-shows the consent screen.

#### Shots

Captions are optional for Google but help; add them in Clipchamp.

| # | On screen | Caption (optional) |
| - | --------- | ------------------ |
| 1 | `trycue.space/login` → email → code → dashboard. | "The user signs in to Cue." |
| 2 | **Clients** → a client card → hover the **YouTube (+)** button. | "Connect a YouTube channel to this client." |
| 3 | Click it. Google's account chooser, then the **"Google hasn't verified this app"** screen: show it, click **Advanced → Go to Cue**. Google says this screen is expected and must appear in the video. Then the **consent screen**: **click into the address bar** so the full URL with `client_id=…` shows, and hold 3-4 seconds. | "Google consent screen. The address bar shows Cue's OAuth client ID." |
| 4 | Hold on the scope list ("Manage your YouTube videos" / upload), then **Continue / Allow**. | "Cue requests youtube.upload to upload videos the user schedules." |
| 5 | Back on Clients: the green toast and the channel listed on the card. | "The channel is connected. Its Google account name labels it (openid, email, profile)." |
| 6 | **Compose** → pick the client → tick the YouTube channel → attach the video → fill **Video title**, description, **Visibility: Unlisted**, category, tags. | "The user writes the video's details." |
| 7 | Click **Post now** → Queue shows it Published. | "youtube.upload: Cue uploads the video with those details." |
| 8 | Open the video link (or YouTube Studio → Content) and show it with the same title. | "The video is now on the user's channel." |
| 9 | Clients → disconnect the channel → confirm; then open `trycue.space/data-deletion`. | "The user can disconnect at any time; tokens are deleted." |

Keep it 2-4 minutes. **Never cut** between steps 3 and 5 (consent) or 7 and 8
(upload and result).

### 3.4 Submit

**Verification Center → Prepare for verification** (or the prompt on Data
Access): confirm branding, paste §3.2, paste the unlisted video link, submit.
Timeline: usually several days, sometimes weeks. Answer Google's follow-up emails
fast; they go to both developer contacts (`ytkaranbusiness006@gmail.com`,
`karan@trycue.space`).

Once approved, the "Google hasn't verified this app" warning and the 100-user cap
go away.

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
| Google Cloud project | `shorts-automation-509405`                                |
| Project number       | `12824634376` (numeric prefix of the OAuth client id)     |
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
