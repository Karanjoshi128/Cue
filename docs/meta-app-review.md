# Meta App Review — Instagram publishing (playbook)

Goal: move Cue's Meta app from **Development mode / Standard Access** (only tester
accounts can connect) to **Live mode / Advanced Access** so **any** agency can
connect **their clients'** Instagram accounts.

Cue uses the **Instagram API with Instagram Login** path with two permissions:

- `instagram_business_basic`
- `instagram_business_content_publish`

Both need **Advanced Access**, which requires **App Review + Business Verification**.

---

## 0. Status: done vs. your homework

**✅ Built in the app (this repo):**

- Privacy Policy — `https://cue-ruddy.vercel.app/privacy`
- Terms of Service — `https://cue-ruddy.vercel.app/terms`
- Data Deletion instructions — `https://cue-ruddy.vercel.app/data-deletion`
- Clear connect success/error messages + a "Business/Creator account" hint on Clients

> ⚠️ Before submitting, edit the `[bracketed]` placeholders in `/privacy` and
> `/terms` (legal business name, governing law) and redeploy.

**🧑‍💻 Only you can do (external):**

1. **Business Verification** in Meta Business Settings (legal docs).
2. Record the **screencast** (script below).
3. Provide a **test Instagram Business/Creator account** + a way for the reviewer
   to log into Cue (see §5).
4. Fill the App Dashboard fields and submit.

---

## 1. Prerequisites checklist (before you open the review form)

- [ ] App type is **Business**; the **Instagram** product is added with
      "Instagram API setup with Instagram login".
- [ ] OAuth **redirect URI** is registered exactly:
      `https://cue-ruddy.vercel.app/api/oauth/instagram/callback`
- [ ] **App icon** (1024×1024) and a **Category** are set.
- [ ] **Privacy Policy URL**, **Terms URL**, and **User Data Deletion** →
      "Data deletion instructions URL" are filled with the three URLs above.
- [ ] **Business Verification** completed (see §4).
- [ ] A **test IG Business/Creator account** exists and is added as an Instagram
      Tester (so you can demo end-to-end before going Live).
- [ ] The three legal `[placeholders]` are filled in and redeployed.

---

## 2. Permissions + use-case text (paste into the review form)

For each permission Meta asks *how* you use it. Paste these:

### `instagram_business_basic`

> Cue is a social media scheduling tool for agencies. After a user connects their
> Instagram professional (Business or Creator) account via Instagram Login, Cue
> uses `instagram_business_basic` to read the connected account's id, username,
> and profile. This lets us show which account a scheduled post will publish to,
> label connected accounts in the user's workspace, and confirm the connection is
> healthy. It is used only to identify accounts the user has explicitly connected.

### `instagram_business_content_publish`

> Cue lets agencies compose content and publish it to the Instagram professional
> accounts they have connected and authorized. Cue uses
> `instagram_business_content_publish` to create media containers and publish the
> single images, carousels, and Reels the user composed, at the time the user
> scheduled (or immediately via "Post now"). Publishing is always initiated by the
> user for their own or their clients' authorized accounts; Cue never posts
> content the user did not create and schedule.

---

## 3. Screencast script (Meta requires a video)

Record a single screen capture (with the browser URL bar visible) showing the
**full flow**. Narrate or add captions for each step.

1. **Log in** to Cue at `cue-ruddy.vercel.app` (show the login → magic link →
   dashboard). *Captions: "User signs in to Cue."*
2. Go to **Clients** → open a client (or add one). *"Each client is a brand the
   agency manages."*
3. Click **Instagram**. Show the **Instagram Login consent screen**, including the
   requested permissions, and approve it. *"User connects their Instagram
   Business account and grants permission."*
4. Back in Cue, show the account now listed as **Connected**. *"The connected
   account appears in the workspace."*
5. Open **Create/Composer**, write a caption, attach an image (and show a carousel
   and a Reel if you can), pick the Instagram account, and **schedule** or click
   **Post now**. *"User composes and schedules a post."*
6. Show the post **live on the Instagram account** (open Instagram and show it
   published). *"content_publish creates the post on the connected account."*
7. Optional: show **disconnect** on the Clients page + the `/data-deletion` page.
   *"Users can revoke access and delete their data at any time."*

Keep it 2–4 minutes, 1080p, no cuts that skip the consent screen or the published
result — reviewers reject videos that don't show the actual permission in use.

---

## 4. Business Verification checklist

Meta Business Settings → **Security Center** / **Business verification**:

- [ ] Legal business name, address, phone, website (`cue-ruddy.vercel.app`).
- [ ] A verification document (business registration / utility bill / license)
      matching that name + address.
- [ ] A phone/email you can receive a verification code at.

> If you don't have a registered company, you can verify as an individual
> developer in some regions, but a registered business is smoother. This step
> usually takes 1–3 business days.

---

## 5. Reviewer access (the magic-link gotcha)

Cue is passwordless (magic link), so a reviewer can't just "use a password."
In the App Review **"Instructions for reviewer"** field, give them a working path:

**Recommended:** create a dedicated test inbox you control (e.g. a throwaway
Gmail) and share its **email + password** in the instructions, plus:

```
1. Go to https://cue-ruddy.vercel.app/login
2. Enter this email: <test-inbox@gmail.com>  (password: <shared password>)
3. Click "Send magic link", open the email in that inbox, click the link.
4. On first sign-in you'll be asked to name a workspace — type anything → Continue.
5. Go to Clients → Add client → click "Instagram" → log into the test Instagram
   Business account below and approve.
   Test IG Business account: <handle> / <password>
6. Go to Create, write a caption, attach an image, choose the account, Post now.
7. The post will appear on the test Instagram account.
```

Provide the **test IG Business/Creator account** credentials too, or confirm the
reviewer may use their own. Meta weighs the **screencast** most heavily, so make §3
airtight even if reviewer login is fiddly.

---

## 6. Submit

App Dashboard → **App Review → Permissions and Features** →
request **Advanced Access** on `instagram_business_basic` and
`instagram_business_content_publish` → attach the use-case text (§2), the
screencast (§3), and reviewer instructions (§5) → **Submit**. Then flip the app to
**Live** (top toggle) once approved.

---

## 7. Timeline & common rejection reasons

- Review typically takes **a few days to ~2 weeks**; resubmission resets the clock.
- Top rejection reasons to avoid:
  - Screencast doesn't show the **consent screen** or the **published result**.
  - Privacy Policy / Data Deletion URL missing, broken, or not describing Instagram
    data. (Ours cover this — just fill the placeholders.)
  - Business Verification incomplete.
  - Reviewer couldn't reproduce the flow (bad/again-magic-link instructions).
  - Requesting a permission the app doesn't visibly use in the video.

---

## LinkedIn (separate, already mostly done)

LinkedIn is a different process and your app is already verified for personal-
profile posting (`w_member_social`). No Meta-style review needed for that. To post
to **Company Pages** you'd separately apply to LinkedIn's **Community Management
API** partner program (`w_organization_social`) — out of scope for this Instagram
submission.
