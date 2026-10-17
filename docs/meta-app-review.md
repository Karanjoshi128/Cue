# Meta App Review - Instagram publishing (playbook)

Goal: move Cue's Meta app from **Development mode / Standard Access** (only tester
accounts can connect) to **Live mode / Advanced Access** so **any** agency can
connect **their clients'** Instagram accounts.

Cue uses the **Instagram API with Instagram Login** path with two permissions:

- `instagram_business_basic`
- `instagram_business_content_publish`

Both need **Advanced Access**, which requires **App Review**.

> **Since first comments (branch `feat/first-comment`), Cue also requests
> `instagram_business_manage_comments`**, used only to post the first comment
> the user wrote under the post Cue just published for them
> (`POST /{media-id}/comments`). It needs Advanced Access too, so App Review
> must cover it: its own use-case text in §2, and the screencast must show the
> comment appearing. Check that it is listed under the app's Instagram use
> case permissions before deploying, or the connect flow may reject the scope.

---

## 0. Status

| Round | Result | Reason |
| ----- | ------ | ------ |
| 1 (results 20 Jul 2026, resubmitted 1 Aug 2026) | **Rejected**, both permissions | "Screencast Not Aligned with Use Case Details" (Developer Policy 1.6) |
| 2 | Not submitted yet | New screencast per §3 |

**What Meta said (same note on both permissions):** the use case is allowed, but
the screencast didn't show the end-to-end experience. The new one must show:

1. The complete Meta login flow.
2. A user granting the app access to the permission.
3. The end-to-end experience of the use case for each permission.
4. English UI, **captions and tool-tips** explaining the buttons and UI elements.
5. Whether the app is server-to-server (it isn't, say so in the notes).

**Why round 1 failed, looking at the old video:** it opened on the screen
recorder's own setup dialog over the Clients page, used the old UI, and had no
captions tying each moment to a permission. Nothing in the app was wrong, only the
video. The permission text also promised "id, username, and profile" while Cue
only reads `user_id` and `username`, so §2 is now worded to match exactly.

**App changes made for round 2:**

- The Instagram connect link sends `force_reauth=true`, so the Instagram login
  screen always appears, even when the browser is already signed in to Instagram.
  This makes point 1 visible in the video, and stops an agency connecting the
  wrong client's account from a browser that's still logged into another one.
  (`src/app/api/oauth/instagram/start/route.ts`)
- The composer's Instagram preview shows the connected account's real username.
  It used to show a handle made up from the client name, so the video showed
  two different usernames. (`src/components/post-preview.tsx`)

**Already in place:** Privacy Policy `https://trycue.space/privacy`, Terms
`https://trycue.space/terms`, Data Deletion `https://trycue.space/data-deletion`,
app icon `public/brand/cue-app-icon-1024.png`.

---

## 1. Prerequisites checklist (before you open the review form)

- [ ] App type is **Business**; the **Instagram** product is added with
      "Instagram API setup with Instagram login".
- [ ] OAuth **redirect URI** is registered exactly:
      `https://trycue.space/api/oauth/instagram/callback`
- [ ] **App icon** (1024×1024) and a **Category** are set.
- [ ] **Privacy Policy URL**, **Terms URL**, and **User Data Deletion** →
      "Data deletion instructions URL" are filled with the three URLs above.
- [ ] A **test IG Business/Creator account** exists and is added as an Instagram
      Tester (App roles → Roles → Instagram Testers; accept the invite in that
      Instagram account under Settings → Website permissions → Apps and websites).
- [ ] The `force_reauth` change is **deployed** to trycue.space before recording.

---

## 2. Permissions + use-case text (paste into the review form)

Every claim here must be something the video shows. Don't add anything Cue
doesn't do.

### `instagram_business_basic`

> Cue is a social media scheduling tool for agencies. A user connects an Instagram
> professional (Business or Creator) account to one of their clients in Cue by
> logging in through Instagram Login. Cue then uses instagram_business_basic to
> read the account's Instagram user ID and username. The username is shown on the
> client's card on the Clients page, in the "Publish to" list in the post composer,
> and in the live post preview, so the user always knows which account a post will
> go to. The user ID is stored so Cue can publish to that account later. Cue reads
> no other profile data, followers, or media. Long-lived tokens are refreshed
> server-side so a connection stays healthy while the user keeps it.

### `instagram_business_content_publish`

> Cue lets agencies write posts and publish them to the Instagram professional
> accounts they have connected. When the user clicks "Post now", or when the time
> they chose with "Schedule" arrives, Cue uses instagram_business_content_publish
> to create a media container from the image or video the user uploaded and the
> caption they wrote, and then publish it to the selected account. Cue only ever
> publishes content the user composed and chose to send to an account they
> connected themselves. It never posts automatically or on its own.

### Notes for the reviewer (the free-text field)

> Cue is a web app, not a server-to-server integration. Every Instagram connection
> starts with the user clicking Connect → Instagram in Cue, which opens the
> standard Instagram Login screen and permission dialog shown in the screencast.
> We do not use system user tokens. Test instructions are below.

---

## 3. Screencast (the part that failed: follow it exactly)

**One video, uploaded to both permission slots.** Captions name the permission at
the moment it's in use, so one video serves both.

### Before you hit record

- **Recorder:** Windows Snipping Tool (Win+Shift+S → Record) or OBS. Start the
  recording, *then* switch to the browser; cut the recorder's own UI out in
  editing. The round 1 video opened on the recorder dialog.
- **Browser:** Chrome, English, window maximised, **URL bar visible**, zoom
  110-125% so text is readable at 1080p. Close other tabs, hide bookmarks and
  extensions.
- **Sign out of Instagram** in that browser (or use a fresh profile). With
  `force_reauth` the login screen appears anyway, but a clean profile avoids
  surprises.
- **Cue state:** signed out of Cue. Have a client called something like
  "Demo Brand" with **no Instagram account connected** (disconnect it first if
  needed). Have a square JPG ready on the desktop.
- **Test Instagram account:** know its username and password; keep 2FA codes to
  hand if it has 2FA.
- **Captions:** add them afterwards in **Clipchamp** (built into Windows 11): Text
  → a plain lower-third. Keep each on screen for at least 3 seconds. Add an arrow
  or circle (Clipchamp → Graphics → Shapes) on the button being explained; that's
  the "tool-tips" Meta asked for.

### Shot list

| # | On screen | Caption to add | Meta point |
| - | --------- | -------------- | ---------- |
| 1 | `trycue.space/login`. Type the email, click **Email me a sign-in code**, switch to the inbox, copy the code, type it in. Land on the dashboard. | "Cue is a social media scheduler for agencies. The user signs in to Cue with a one-time code sent to their email." | context |
| 2 | Click **Clients** in the sidebar. Hover the "Demo Brand" card. | "Each client is a brand the agency manages. This client has no Instagram account connected yet." | context |
| 3 | In the card's **Connect** row, hover the **Instagram (+)** button so its tooltip ("Business or Creator account") shows, then click it. | Arrow on the button: "This button connects an Instagram professional account to this client using Instagram Login (Meta's login flow)." | 1 |
| 4 | The Instagram login page at `instagram.com`, URL bar visible. Type the test account's username and password, then **Log in**. Complete 2FA if asked. | "The standard Instagram Login page. The user logs in with their Instagram professional account." | 1 |
| 5 | The **permission dialog** listing what Cue is asking for. **Hold still for 4-5 seconds.** Then click **Allow**. | "Instagram shows the permissions Cue requests: instagram_business_basic (profile: user ID and username) and instagram_business_content_publish (publish content). The user clicks Allow to grant them." | 2 |
| 6 | Redirect back to `trycue.space/clients`. The green **"Instagram account connected"** toast appears; the card now shows **@username**. Circle the username. | "instagram_business_basic: Cue reads the account's username and shows it on the client card, so the agency knows which account is connected." | 3 (basic) |
| 7 | Click **Compose** in the sidebar. Pick the client, then in **Publish to** tick the Instagram account. Circle **@username** in the list. | "instagram_business_basic: the username identifies the account the post will be published to." | 3 (basic) |
| 8 | Write a caption, e.g. "Testing Cue for Meta App Review 🚀". Drag in the JPG. Show the **Live preview**: it carries the same username as the connected account. | "The user writes a caption and uploads an image. The live preview shows exactly what will be posted, and to which account (username from instagram_business_basic)." | 3 (publish) |
| 9 | Point to **Schedule** and **Post now** (don't click Schedule). | Arrows on both: "'Schedule' publishes at a chosen time. 'Post now' publishes immediately. Publishing only happens when the user chooses it." | 4 |
| 10 | Click **Post now**. The "Publishing…" toast shows and Cue opens the Calendar. Click **Queue** and show the post marked Published. (Use an image, not a Reel: Reels wait for Instagram to finish processing.) | "instagram_business_content_publish: Cue creates a media container with the image and caption, then publishes it to the connected account." | 3 (publish) |
| 11 | New tab: `instagram.com/<username>`. Refresh. Open the new post so the caption is readable. | "The post is now live on the user's Instagram account, published by Cue through instagram_business_content_publish." | 3 (publish) |
| 12 | Back in Cue → Clients → the **disconnect** (×) on the account → confirm. Then open `trycue.space/data-deletion`. | "The user can disconnect the account at any time. Cue's data deletion instructions are public at trycue.space/data-deletion." | trust |

Aim for **3-5 minutes**, 1080p, no music needed. **Never cut** across shots 3→6
(login, consent, return) or shots 10→11 (publish, live post). Those are exactly
what the reviewer checks.

If the post takes a few seconds to appear on Instagram, leave the wait in the
video or keep the cut visible, but don't splice in a post from another day.

---

## 4. Reviewer access (sign-in is a 6-digit emailed code)

Cue is passwordless: you enter an email and Cue emails back a **one-time code**.
There is deliberately **no click-through link**: mail scanners that prefetch links
were consuming the token before the recipient clicked ("otp_expired"). A code
can't be prefetched, so reviewer sign-in is reliable.

Paste into the review form's test instructions:

```
Cue is a web app at https://trycue.space. No download or special setup needed.

1. Go to https://trycue.space/login
2. Enter YOUR OWN email and click "Email me a sign-in code".
3. Open the email from Cue and type the 6-digit code into the sign-in screen.
4. On first sign-in you'll be asked to name a workspace - type anything, click Continue.
5. Click Clients -> Add client -> name it anything -> Add client.
6. On the client's card, in the "Connect" row, click the Instagram (+) button.
   Log in on the Instagram page with the test account below and click Allow.
   Test Instagram Business account: <username> / <password>
7. The username now appears on the client card (instagram_business_basic).
8. Click Compose, choose the client, tick the Instagram account under "Publish to",
   write a caption, upload an image, and click "Post now".
9. Open https://www.instagram.com/<username> - the post is published there
   (instagram_business_content_publish).
```

The test account must be an **Instagram Tester** on the app (§1), or the
reviewer's connect attempt fails while the app is in Development mode.

---

## 5. Submit

App Dashboard → **Review → App Review** → **Request again** (on the rejected
request), or **Permissions and Features** → request **Advanced Access** on
`instagram_business_basic` and `instagram_business_content_publish`. Attach the
text from §2 (including the reviewer notes), the screencast from §3 on **both**
permissions, and the test instructions from §4 → **Submit**.

After approval: **Publish** the app (sidebar → Publish, currently "Unpublished")
so it leaves Development mode.

---

## 6. Timeline & common rejection reasons

- Review typically takes **a few days to ~2 weeks**; resubmission resets the clock.
- Top rejection reasons to avoid:
  - Screencast doesn't show the **login**, the **consent screen**, or the
    **published result** (round 1).
  - No captions explaining what each step and button does (round 1).
  - Use-case text claims data or features the video doesn't show.
  - Privacy Policy / Data Deletion URL missing, broken, or not describing
    Instagram data.
  - Reviewer couldn't reproduce the flow (test account not a Tester, bad sign-in
    instructions).

---

## LinkedIn (separate)

LinkedIn is a different process. The app is already verified for personal-profile
posting (`w_member_social`). Every client on the roster uses a Company Page, which
needs LinkedIn's **Community Management API** (`w_organization_social`). See
`linkedin-pages-access.md`.
