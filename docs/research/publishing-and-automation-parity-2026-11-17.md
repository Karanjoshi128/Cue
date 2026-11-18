# Cue publishing and Instagram automation audit

Researched on 17 November 2026 against Cue revision `8d10c9f`. The “Cue before” entries describe that revision. The implementation branch is `feature/publishing-and-automation-parity`.

## Scope and confidence

Cue currently connects Instagram, YouTube, LinkedIn profiles and LinkedIn Pages. This audit covers all four destinations, and the comment, Story-reply and inbound-DM automation category already present in Cue. It does not treat Facebook, TikTok, Threads or WhatsApp as existing Cue integrations.

The competitor set covers established automation/inbox benchmarks (Manychat, Chatfuel, respond.io) and relevant Instagram specialists (LinkDM, CreatorFlow, SlideDM, InstantDM, Inrō). It is a practical benchmark set, not a verified ranking by market share or a claim to enumerate every vendor. Competitor observations come from public product/help flows and their illustrated documentation; no paid account or authenticated competitor UI was tested. Recommendations below are our interpretation of those flows.

**“No new review” here means no new OAuth scopes, platform products, login flows or review submissions introduced by this branch.** Public documentation supports using existing permissions for the additions. It cannot guarantee that a platform will never request another review. Cue's existing Meta automation approval dependency and Google optional-scope gates remain intact. Read the [handoff](../claude-handoff-publishing-automation-2026-11-17.md) before deploying.

## Uploading from Cue versus the native platform

Cue submits files and metadata through each platform's API. Native apps include editors, account-specific switches and surfaces those APIs do not necessarily expose. Cue adds a shared queue, client workspaces, approvals, caption overrides and automation attachment. Scheduling still means Cue sends the upload when the post is due; it is not the same as uploading early into a platform's native scheduler. Processing can delay visibility.

### Instagram

Meta documents image, video, Reel and mixed-carousel publishing under Instagram Login's existing basic/content-publish permissions. Story publishing has an account-type restriction. [Content publishing](https://developers.facebook.com/documentation/instagram-platform/content-publishing).

| Native capability | Cue before | Branch result / limit |
| --- | --- | --- |
| Feed images and Reels | Available | Retained |
| Ordered mixed carousel | Image-only path could discard videos | Images and videos preserved; up to 20 items; reorder controls |
| Image accessibility | No composer field | Per-image alt text; excluded from Reels/Stories |
| People and collaborators | No dedicated controls | User tags with image/Story positions; up to three collaborator invitations |
| Stories | Missing | One image/video; Business-account check |
| Reel cover | Platform-selected | Uploaded JPEG or frame offset |
| Reel distribution/audio | Default only | Share-to-feed and original-audio name |
| Trial Reel and AI disclosure | Missing | Trial graduation setting and AI self-disclosure |
| Location | No field | Known numeric location ID; no new place-search permission |
| Native editing/music/stickers | Not available | Upload finished media; licensed music, filters and interactive Story stickers remain native |

Parameter support, media constraints and account eligibility are governed by Meta's [media reference](https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-user/media). Collaborators must accept; tagging is not a guarantee of reach. Trial availability remains account-dependent. Switching placement does not erase incompatible settings silently: preflight asks the user to resolve them.

Instagram's newer caption polls/comment prompts and paid-partnership labeling are documented for **Facebook Login**, while Cue uses Instagram Login. Commerce tags also involve additional permissions/products. They are not added by changing a JSON field. No login-system migration is attempted here. [Publishing guide](https://developers.facebook.com/documentation/instagram-platform/content-publishing).

### YouTube

| Native Studio capability | Cue before | Branch result / limit |
| --- | --- | --- |
| Title, description, privacy, tags, category | Available | Retained; validation shared with API |
| Made-for-kids audience | Hardcoded false | Explicit audience selection; incompatible first comment rejected |
| Altered/synthetic disclosure | Missing | Explicit field |
| Subscriber notification, embedding, license | Defaults only | Controls added |
| Extended public statistics | Default only | Control added; does not promise to hide all engagement counts |
| Original metadata language, translated titles/descriptions, recording date | Missing | Added |
| Custom thumbnail | Missing | Separate upload after publishing; independent status/retry in Queue |
| Native scheduling | Cue uploads at due time | Existing scheduling retained; no early-upload/native-scheduler migration |
| Subtitle tracks, playlists | Missing | Require permissions beyond the default upload grant; not introduced |
| Editor, music, cards/end screens, advanced moderation/monetization | Missing | Continue in Studio; no equivalent verified upload-only implementation shipped |
| Paid-placement / brand-partner metadata | Missing | Not shipped: presence of a response `part` alone does not establish that a field is writable on insert |

The new metadata controls use the documented upload endpoint and `youtube.upload`; Google lists its writable properties separately from response parts. [Videos.insert](https://developers.google.com/youtube/data/reference/rest/v3/videos/insert). Caption management requires a broader grant. [Captions.insert](https://developers.google.com/youtube/data/reference/rest/v3/captions/insert).

Thumbnail upload also accepts `youtube.upload`. Current documentation includes Shorts, but says they must finish processing first. [Thumbnails.set](https://developers.google.com/youtube/data/reference/rest/v3/thumbnails/set). The processing read endpoint does **not** accept upload-only authorization. [Videos.list](https://developers.google.com/youtube/data/reference/rest/v3/videos/list). Cue waits at least five minutes; if the account already has the optional force-ssl grant it checks processing, otherwise it attempts the thumbnail without requesting a new scope. A refusal leaves the video published and exposes a thumbnail-only retry. Account eligibility still applies. Cue conservatively limits cover uploads to 2 MB; this is a Cue limit, not the current API maximum.

Cue also retains its 512 MB media ceiling and buffered/serverless upload architecture. Native YouTube supports much larger files. Removing that gap responsibly requires streaming/background-upload infrastructure, not a larger input number.

### LinkedIn profiles and Pages

| Native capability | Cue before | Branch result / limit |
| --- | --- | --- |
| Text, images, documents, link cards, polls | Available | Retained |
| Native video attachment | Video could fall through to a text-only post | Real multipart video upload and video URN attached |
| Video cover and captions | Missing | Cover and English SRT sidecar |
| Image accessibility | Missing | Single/multi-image alt text |
| Profile audience | Public only | Public or connections-only |
| Page audience | Public | Remains public; profile-only choice rejected |
| Resharing switch | Default only | Disable-resharing control |
| Link-card preview image | Missing | Explicit uploaded preview image |
| Mentions/hashtags | Caption text | Existing LinkedIn annotation syntax remains usable; no new people-search permission |
| First-comment automation / comment management | Missing | Not added with the old publishing grants |
| Newsletters/articles, events/live, group/targeted/ad workflows, native editing | Separate native experiences | Not implemented as ordinary feed uploads |

Video upload, thumbnail and caption operations use the existing member/organization publishing grants. The API accepts MP4 with its documented size/duration restrictions; caption upload is English-only. [Videos API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/videos-api?view=li-lms-2026-06). Audience and reshare fields are part of the [Post schema](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/post-api-schema?view=li-lms-2026-08). Link-card images must be uploaded explicitly; the API does not scrape their URLs. Accepted posts can continue processing asynchronously. [Posts API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api?view=li-lms-2026-06).

Current comment documentation names the newer feed permissions, so introducing LinkedIn comments cannot be assumed safe under Cue's stored publishing scopes. [Comments API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/comments-api?view=li-lms-2026-07).

## Instagram automation competitor audit

| Product and public evidence | Relevant features and UI flow | What Cue should take from it |
| --- | --- | --- |
| [Manychat quick automation](https://help.manychat.com/en/articles/17742037-quick-automation-auto-dm-links-from-comments) | Specific/any/next post, keyword, optional public replies, opening DM, follow/email steps, reminders and insights. A guided sequence presents one decision at a time. | Clear trigger scope, independent opening DM, editable step copy, outcome templates and meaningful results. These were added. |
| [Chatfuel Instagram](https://chatfuel.com/instagram), [setup templates](https://sdk.chatfuel.com/channels/instagram) | Comment, Story and inbound-message automation, templates, flow/AI assistance and human conversations. | Keep fast templates alongside Cue's existing AI drafting, preview and Reply Desk; add contact context and an explicit human handoff pause. |
| [respond.io private replies](https://respond.io/help/instagram/instagram-auto-private-replies) | Channel-level setup, all/specific posts, original-post context, personalization and inbox follow-through. | Scope and contact state should be visible, and delivery should not be confused with consent or engagement. Added notes/pause and visit metrics; no fake read receipts. |
| [LinkDM](https://www.linkdm.com/), [Planner](https://www.linkdm.com/help/planner) | Comment/Story automation, next posts, reminders, link reporting, templates, recovery and planning. | Add next-native-post binding, recovery preview and click attribution. Cue already attaches rules directly to scheduled Cue posts. |
| [CreatorFlow features](https://creatorflow.so/help/features), [first automation](https://creatorflow.so/help/getting-started/create-first-automation) | Keyword/follow/email flows, public-reply variations, recovery and exports. Four-step setup and test guidance reduce first-run friction. | Retain Cue's live preview and keyword test, add ready-made outcomes and searchable/exportable lead context. |
| [SlideDM](https://www.slidedm.app/) | Reply Desk, held-for-review workflow, multilingual/AI assistance, variations, pacing/viral handling and connectors. | Cue already has most of these primitives. Improve observability and selective retry instead of adding another disconnected dashboard. |
| [InstantDM navigation](https://instantdm.com/how-to/dashboard-navigation), [features](https://instantdm.com/pricing) | When/where/what entry flow; existing/all/next-post categories; saved libraries, contacts, recovery and reports; a separate advanced flow editor. | Outcome-first templates, next-post scope and searchable activity/contacts are useful. Avoid hiding basic controls behind a graph editor. |
| [Inrō quick start](https://help.inro.social/en/articles/15631993-quick-start-your-first-scenario) | Comment-to-DM wizard: post, keyword, message; contextual explanations of the private-reply limit. | Preserve the short path from trigger to message and explain reply windows where recovery is offered. |

These are qualitative usability judgments, not timed usability studies or accessibility certifications. Broad omnichannel CRM suites offer routing, integrations and visual workflow engines beyond Cue's existing auto-reply category; this branch does not claim to reproduce those entire products.

### Coverage after this branch

| Capability | Status |
| --- | --- |
| Comment-to-DM, public auto-reply, all/specific/scheduled Cue posts | Existing, retained |
| Story replies, inbound DM keywords, catch-all, typo tolerance, personalization | Existing, retained |
| Follow gate, email/phone capture, timed in-window reminder | Existing; step copy now configurable |
| Public/DM wording variations, AI drafting, multilingual moderation, held queue | Existing, retained |
| Live preview, account checks, webhook plus polling fallback, pacing and backoff | Existing; preview now uses the production matcher |
| Six outcome templates; next native post | Added |
| Opening DM independent of follow requirement | Added |
| Exact matching, exclusions, priority, repeat cooldown, start/end dates | Added |
| Matched/sent/delivered/captured/visited reporting over 7 or 30 days | Added |
| Signed button-link tracking, preview-bot filtering | Added; visits are not reads or sales |
| Lead tags/notes/search/pagination, CSV context, manual pause and STOP | Added |
| Selective retry of unsent portions | Added; cannot override reply windows |
| Missed-comment recovery | Added; preview/select, latest 50 comments on a recent owned post, maximum seven-day window |
| Failed/held/waiting activity across pages | Added server-side filtering/pagination |
| New-follower DM | Excluded: Meta-controlled beta eligibility/onboarding, not a generic existing permission |
| Cold-DM blasts or out-of-window reminders | Excluded; no compliant permission shortcut |
| Ad/Live/mention-specific entry points, rich-media DM builders, multi-branch workflow canvas, full shared DM inbox, external CRM routing | Separate workflows; not represented as implemented by this branch |

Manychat's new-follower feature explicitly depends on Meta eligibility and its newer onboarding. [Follow to DM beta](https://help.manychat.com/en/articles/17741911-follow-to-dm-on-instagram-say-hi-to-new-followers-beta). Instagram private replies allow one initial private reply per comment within seven days; continued messaging needs the person's interaction and the applicable messaging window. [Meta private replies](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api/private-replies). Recovering an old comment does not bypass either restriction or a reply already sent by another tool.

## UX implementation choices

New platform settings use progressive disclosure inside the existing composer. Media descriptions/tags sit beside the relevant item; covers are a separate role so they cannot accidentally become carousel slides. The automation editor keeps its numbered flow and preview, with advanced matching/campaign options collapsed initially. Templates provide an outcome and sample copy but require a real destination link. Results distinguish the initial DM, final delivery, captured contact information and link visits. Leads expose the context needed for a human to take over in Instagram.

No new platform scopes, OAuth review screens, AI provider spending, competitor subscriptions, automatic production migrations or real social test messages were used for this work.
