# Cue API (v1)

A token-authenticated API for creating, scheduling and publishing posts from a
script, without a browser. Built for the YouTube Shorts pipeline, but it covers
every platform Cue supports.

**Base URL:** `https://trycue.space/api/v1`

Everything is JSON in and JSON out. All examples assume:

```bash
export CUE=https://trycue.space/api/v1
export CUE_KEY=cue_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

## Authentication

Create a key in **Settings → API keys** (admins only). The full key is shown
**once**, at creation. Cue stores only its sha256, so it can't be recovered: if
it's lost, revoke it and create another.

Send it on every request:

```
Authorization: Bearer cue_...
```

- A key acts as **the admin who created it**, inside that admin's workspace.
  Posts it creates have that admin as their author.
- Every authentication failure (missing header, malformed, unknown key, revoked
  key) returns the same response, by design:

  ```json
  HTTP 401
  { "error": "Invalid or missing API key." }
  ```

- Revoking takes effect immediately. The Settings list shows each key's prefix
  and when it was last used.

---

## Errors

Every error has the same body:

```json
{ "error": "human-readable message", "details": [{ "path": "youtubeTags", "message": "..." }] }
```

`details` appears only on validation failures, one entry per failed field.

| Status | Meaning |
| --- | --- |
| 400 | Invalid body, query or header. Read `error` (and `details`). |
| 401 | Missing, unknown or revoked API key. |
| 404 | Not found, **or belongs to another workspace**. The two are deliberately indistinguishable. |
| 409 | The post's state doesn't allow this (for example, deleting a published post). |
| 500 | Unexpected server error. The body never includes internals; safe to retry with the same `Idempotency-Key`. |

---

## Idempotency

`POST /posts` accepts an optional **`Idempotency-Key`** header (1-255
characters). A repeat request with a key already used **for the same client**
returns the original post's `{ id, status }` with **HTTP 200** and creates and
publishes nothing. The first request gets **201**.

This is what makes retries safe. Always send one for `action: "now"`: without
it, a retry after a network timeout would upload the video to the channel a
second time.

- It's safe under concurrency: several simultaneous requests with the same key
  produce exactly one post, and they all receive its id.
- The request body isn't compared. The key alone identifies the request, so
  derive it from something unique per video, such as the staging folder name.
- **A key is remembered for as long as its post exists**, which is
  indefinitely unless someone deletes the post. Reusing a key always returns
  that old post and publishes nothing, so give every video its own key.

---

## Endpoints

### `GET /clients`

The workspace's clients and their connected accounts. Use the account `id`s in
`POST /posts`.

```bash
curl -s "$CUE/clients" -H "Authorization: Bearer $CUE_KEY"
```

```json
[
  {
    "id": "cmg...",
    "name": "Shorts Channel",
    "accounts": [{ "id": "cmh...", "platform": "YOUTUBE", "displayName": "My Channel" }]
  }
]
```

`platform` is `LINKEDIN`, `INSTAGRAM` or `YOUTUBE`. Access tokens are never
returned by any endpoint.

### `POST /media/presign`

A short-lived (5 minute) URL for uploading a file **directly to storage**. The
file never passes through Cue, so there's no request-size limit (max 512 MB per
file).

```bash
curl -s -X POST "$CUE/media/presign" \
  -H "Authorization: Bearer $CUE_KEY" -H "Content-Type: application/json" \
  -d '{"filename":"short.mp4","contentType":"video/mp4","size":31457280}'
```

```json
{
  "uploadUrl": "https://....r2.cloudflarestorage.com/...&X-Amz-Signature=...",
  "storageKey": "posts/2f0c...e1.mp4",
  "url": "https://.../posts/2f0c...e1.mp4",
  "type": "VIDEO"
}
```

Then `PUT` the raw bytes to `uploadUrl`, with the **same `Content-Type`** you
declared (the signature covers it):

```bash
curl -s -X PUT "$UPLOAD_URL" -H "Content-Type: video/mp4" --data-binary @short.mp4
```

`type` is derived from the content type: `VIDEO`, `IMAGE`, or `DOCUMENT` (PDF,
PPT, DOC). Documents also get a `title` (the original filename). Pass
`{ type, url, storageKey, title? }` from this response as a `media` item.

### `POST /posts`

Creates a post and, depending on `action`, schedules or publishes it.

```bash
curl -s -X POST "$CUE/posts" \
  -H "Authorization: Bearer $CUE_KEY" -H "Content-Type: application/json" \
  -H "Idempotency-Key: short-2026-10-01-a1b2" \
  -d @post.json
```

```json
{
  "clientId": "cmg...",
  "accountIds": ["cmh..."],
  "body": "Full YouTube description. Up to 5000 characters for YouTube-only posts.",
  "title": "How a timelapse is made",
  "youtubePrivacy": "public",
  "youtubeTags": ["timelapse", "shorts", "behind the scenes"],
  "youtubeCategoryId": "24",
  "media": [{ "type": "VIDEO", "url": "https://.../posts/2f0c...e1.mp4", "storageKey": "posts/2f0c...e1.mp4" }],
  "scheduledAt": "2026-10-01T18:30:00+05:30",
  "action": "schedule"
}
```

Response: `{ "id": "...", "status": "SCHEDULED" }`, with **201** when created and
**200** on an idempotent replay.

| Field | Type | Notes |
| --- | --- | --- |
| `clientId` | string | From `GET /clients`. 404 if it isn't in your workspace. |
| `accountIds` | string[] | At least one. **Every id must belong to `clientId`**, or the request is rejected (400) rather than posting to fewer accounts than asked. |
| `body` | string | Caption / YouTube description. 1-5000 chars, but **3000 max if any target isn't YouTube**. |
| `title` | string? | YouTube title, max 100. **Required when a YouTube account is targeted**, except for drafts. |
| `youtubePrivacy` | `"public"` \| `"unlisted"` \| `"private"`? | Default `public`. |
| `youtubeTags` | string[]? | See [YouTube tags](#youtube-tags). |
| `youtubeCategoryId` | string? | Numeric id, e.g. `"24"`. Default `"22"`. See [categories](#youtube-categories). |
| `media` | object[]? | Items from `/media/presign`. YouTube needs a `VIDEO` item, except for drafts. |
| `scheduledAt` | string \| null? | ISO-8601 **with a timezone** (`Z` or `+05:30`). A bare local time is rejected. Required when `action` is `schedule`. |
| `action` | `"draft"` \| `"schedule"` \| `"now"` | See below. |

It also accepts the composer's LinkedIn-only fields, `link`, `poll` and
`overrides`, which the pipeline won't need.

**`action`:**

- `draft`: saved, never published. Title/video requirements are skipped.
- `schedule`: published by the publish sweep, which runs **every 5 minutes**. It
  is a GitHub Actions cron, and GitHub can delay those, so allow up to ~15
  minutes after `scheduledAt`. A time already in the past publishes on the next
  sweep.
- `now`: published **inside the request**, which can take a while for a video
  (the file is fetched and uploaded to YouTube). Set your client timeout to at
  least **300 s**. The response reports where publishing landed: `PUBLISHED` on
  success. If the first attempt failed and a retry is queued, you get
  `PUBLISHING`, and the sweep retries it (up to 3 attempts total). Poll
  `GET /posts/:id` to see the outcome.

`status` is one of `DRAFT`, `SCHEDULED`, `PUBLISHING`, `PUBLISHED`,
`PARTIAL` (some targets published, some failed), `FAILED`.

### `GET /posts/:id`

A post with each target's result. This is what you poll.

```bash
curl -s "$CUE/posts/$POST_ID" -H "Authorization: Bearer $CUE_KEY"
```

```json
{
  "id": "cmi...",
  "status": "PUBLISHED",
  "scheduledAt": "2026-10-01T13:00:00.000Z",
  "title": "How a timelapse is made",
  "targets": [
    {
      "id": "cmj...",
      "platform": "YOUTUBE",
      "status": "PUBLISHED",
      "permalink": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "externalPostId": "dQw4w9WgXcQ",
      "error": null,
      "publishedAt": "2026-10-01T13:02:11.000Z"
    }
  ]
}
```

Target `status` is `SCHEDULED`, `PROCESSING` (uploading now), `PUBLISHED` or
`FAILED`. On failure, `error` holds the platform's message. Timestamps are UTC.

### `GET /posts?clientId=&status=&limit=`

Newest first, in the same shape as above but without `targets`.

```bash
curl -s "$CUE/posts?clientId=$CLIENT_ID&status=FAILED&limit=50" -H "Authorization: Bearer $CUE_KEY"
```

- All parameters are optional. Empty ones (`?status=`) are ignored.
- `limit` is 1-100 (default 20). Values outside that range are rejected with
  400, not clamped.

### `DELETE /posts/:id`

Only while the post is `DRAFT` or `SCHEDULED`.

```bash
curl -s -X DELETE "$CUE/posts/$POST_ID" -H "Authorization: Bearer $CUE_KEY"
```

```json
{ "id": "cmi...", "deleted": true }
```

**409** if the post is past that point, including a `SCHEDULED` post whose
upload has already started. **404** if it doesn't exist.

---

## YouTube tags

YouTube allows **500 characters of tags in total**, counted its own way. Each
tag costs its length **+ 1**, plus **2 more if it contains a space** (YouTube
stores those in quotes). For example, `["shorts", "ai art"]` costs
`(6+1) + (6+1+2) = 16`.

Before counting, Cue trims each tag, drops empty ones, and removes duplicates
**case-insensitively**, keeping the first occurrence ("Shorts" and "shorts"
count as one). Over 500 after cleaning, or any tag containing `<` or `>`, is a
**400** at creation time, not a publish-time failure.

## YouTube categories

Common assignable ids: `1` Film & Animation, `2` Autos & Vehicles, `10` Music,
`15` Pets & Animals, `17` Sports, `19` Travel & Events, `20` Gaming,
`22` People & Blogs (default), `23` Comedy, `24` Entertainment,
`25` News & Politics, `26` Howto & Style, `27` Education,
`28` Science & Technology, `29` Nonprofits & Activism.

The API accepts any numeric id (1-3 digits), since the assignable set varies
by region.
YouTube itself rejects ids it doesn't allow, and that surfaces as a failed
target.

---

## Full flow: publishing a Short

```bash
#!/usr/bin/env bash
set -euo pipefail
FILE=short.mp4
IDEM="short-$(basename "$PWD")"          # unique per video, never reused
SIZE=$(stat -c%s "$FILE")

# 1. Presign
P=$(curl -sf -X POST "$CUE/media/presign" \
  -H "Authorization: Bearer $CUE_KEY" -H "Content-Type: application/json" \
  -d "{\"filename\":\"$FILE\",\"contentType\":\"video/mp4\",\"size\":$SIZE}")

# 2. Upload the bytes straight to storage (same Content-Type as declared)
curl -sf -X PUT "$(jq -r .uploadUrl <<<"$P")" -H "Content-Type: video/mp4" --data-binary @"$FILE"

# 3. Create the post
MEDIA=$(jq -c '[{type, url, storageKey}]' <<<"$P")
BODY=$(jq -n --argjson media "$MEDIA" \
  --arg client "$CLIENT_ID" --arg acct "$YT_ACCOUNT_ID" \
  --arg title "$(cat title.txt)" --arg desc "$(cat description.txt)" \
  --argjson tags "$(jq -R -s -c 'split("\n") | map(select(length>0))' tags.txt)" \
  '{clientId:$client, accountIds:[$acct], title:$title, body:$desc,
    youtubeTags:$tags, youtubeCategoryId:"24", youtubePrivacy:"public",
    media:$media, action:"schedule", scheduledAt:"2026-10-01T18:30:00+05:30"}')

POST=$(curl -sf -X POST "$CUE/posts" \
  -H "Authorization: Bearer $CUE_KEY" -H "Content-Type: application/json" \
  -H "Idempotency-Key: $IDEM" -d "$BODY")
ID=$(jq -r .id <<<"$POST")

# 4. Poll until it settles
while :; do
  S=$(curl -sf "$CUE/posts/$ID" -H "Authorization: Bearer $CUE_KEY")
  case "$(jq -r .status <<<"$S")" in
    PUBLISHED) jq -r '.targets[0].permalink' <<<"$S"; break ;;
    FAILED|PARTIAL) jq '.targets' <<<"$S"; exit 1 ;;
    *) sleep 60 ;;
  esac
done
```

On a network error at step 3, just re-send it with the **same**
`Idempotency-Key`. You'll get back the post that was already created.

---

## Limits and retention

<a id="retention"></a>

- **Retention:** posts and their uploaded media are kept indefinitely.
  `GET /posts/:id` keeps working until someone deletes the post.
- **YouTube quota:** Google's default API quota is 10,000 units/day for the
  whole project, and one upload costs 1,600. That's **about 6 uploads per day
  across every client**. Beyond that, uploads fail until the quota resets. An
  increase needs Google's quota extension (see
  `docs/google-youtube-verification.md`).
