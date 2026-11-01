# SlideDM: what it does, and how

Researched 28 Oct 2026 from [slidedm.app](https://www.slidedm.app/), its policy pages, its app store listings and third-party comparisons.

SlideDM is an Instagram automation tool, mainly for creators, small businesses, D2C brands and agencies in India. A comment with a keyword gets an automatic reply and a DM with a link. It claims to use Meta's official Instagram API and to be a Meta Business Partner. Two companies run it: Rigmasters Technology Pvt Ltd for India, and Sliding Into DMs LLC (Delaware) for everyone else.

**About the "How" lines.** SlideDM doesn't publish how it's built. Each "How" is our best reading of how the feature works on Instagram's official API, which SlideDM says it uses. Cue's own comment automation (branch `feature/instagram-automations`) uses the same API calls. Where we're guessing at their exact tools, it says "likely".

Terms used below:
- **API:** the official way an app talks to Instagram.
- **Webhook:** Instagram pinging SlideDM's server the moment something happens.
- **AI:** a language model like ChatGPT or Claude, called behind the scenes.

## Core: comment to DM

- **Keyword or any-comment trigger on a reel, post or carousel.**
  - How: when you connect Instagram, SlideDM asks Meta to send it a webhook for every new comment on your account. Each comment arrives with its text, the post it's on and who wrote it. SlideDM checks it against your automations: right post, right keyword.
- **A public reply, then a DM with a link button.**
  - How: the public reply is one API call that posts a reply under that comment. The DM uses Instagram's "private reply": a message tied to that one comment, which is the only way a business can DM someone who never messaged it. Instagram allows one per comment, within 7 days of it. The link button is Instagram's button message format.
- **About 2 seconds from comment to DM.**
  - How: the webhook arrives within a second or so, and the replies go out straight away.
- **Typo-tolerant keywords ("lnik", "Link pls 🙏").**
  - How: they clean the text first (lowercase, strip emoji and punctuation), then allow a letter or two of difference. Some messier cases are likely passed to AI.
- **Trial reels work too.**
  - How: a trial reel is just another post, so its comments send the same webhook.
- **Story replies and DM keywords.**
  - How: a reply to your story reaches your inbox as a normal DM, and Instagram sends a webhook for it. SlideDM reads the text, checks for the keyword and replies in the same chat. Because the person messaged first, Instagram allows replies for the next 24 hours.
- **Follow to unlock.**
  - How:
    - The first DM has a button, like "Send me the link".
    - When the person taps it, Instagram tells SlideDM. That tap also opens a 24-hour window where SlideDM can keep messaging them.
    - SlideDM then asks Instagram whether this person follows you. Instagram's profile lookup returns a yes or no for that.
    - If no, it replies "follow first, then tap again". If yes, it sends the link.
- **Follow-ups when people go quiet.**
  - How: they set a timer when they send a message. If the person hasn't answered or tapped, a reminder goes out. It has to go out inside the 24-hour window Instagram allows after the person's last action. After that, Instagram doesn't allow automated messages.
- **Lead capture (email or phone), with CSV export.**
  - How: the DM asks "what's your email?" and the reply comes back by webhook. SlideDM checks it looks like a real email or phone number, then saves it. If it does, they send the link; if not, they ask again. The export is a download of those saved rows.
- **A contact log of everyone who triggered an automation.**
  - How: every comment they act on is saved as a row in their database: who, which post, what was sent.

## Account safety and scale

- **DM Variants (wording rotates every 50 sends).**
  - How: AI rewrites your DM five or ten different ways, and you approve the set. A counter on each automation switches to the next version every 50 sends. The point is that Instagram's spam filters see varied text, not the same message thousands of times.
- **Viral Queue (pacing during spikes).**
  - How: comments don't trigger a send directly. They go into a queue, a waiting line, and a worker sends from it at a capped speed per account, which they say is about 200 an hour. In a spike the line just gets longer, and nobody is skipped.
- **Missed DM recovery.**
  - How: a regular background job asks Instagram for each post's comment list. It compares that list with what was already handled, and sends to anyone missed, as long as the comment is under 7 days old. This catches comments whose webhook never arrived.
- **Spike Alerts with one-tap pause.**
  - How: they count comments per automation per minute and compare that with its usual rate. A big jump sends a push notification to the mobile app, through Apple's and Google's push services, and shows a dashboard banner. "Pause" just switches the automation off, so the queue stops sending.
- **Held for You (no auto-reply to abuse).**
  - How: before replying, each comment is checked by AI, or a trained filter, for hate or abuse. Hindi and Hinglish are included, so the check is likely AI-based rather than a word list. Flagged comments get no reply and wait in a review list.

## Inbox and replies

- **Reply Desk (real questions, sorted from the noise).**
  - How: AI labels each comment ("question about price", "praise", "just emoji") and only the questions are shown. When you reply, SlideDM posts it under the comment through the same API call as the auto-reply.
- **Unified inbox (automated and manual chats together).**
  - How: Instagram's API can list an account's conversations and messages, and webhooks bring new ones in live. Your typed replies go back through the same messaging API.

## AI

- **Voice Create (an automation from one sentence).**
  - How:
    - If spoken, speech-to-text turns your voice into text first.
    - AI then turns "send my course link to anyone who comments COURSE on my last reel" into a filled-in form: trigger word, DM text, button label and link.
    - You check the form, then save it.
- **AI-written DMs and replies in your tone, in 10+ languages.**
  - How: they send AI your past messages as examples of your tone, plus the target language and the message to write. Keywords "in any script" means they compare text without converting it, and likely also accept the English spelling of a Hindi word.
- **Claude and ChatGPT connectors (ask about leads, draft automations, answer comments).**
  - How:
    - SlideDM likely runs an MCP server, the standard way to give Claude or ChatGPT access to an app.
    - You sign in once to approve the connection.
    - The assistant can then call tools such as "list my leads", "draft an automation" or "reply to this comment".
    - Each tool call is logged; their privacy policy says these logs are kept 180 days.

## Beyond Instagram

- **Link-in-bio page (taphere.bio) built from your Instagram grid, with click counts.**
  - How: SlideDM already has access to your posts through the API, so it shows them as a grid on a web page. Each tile links to that post's automation. Clicks pass through SlideDM's own redirect, which counts them.
- **Store (digital files, courses, sessions, products, waitlists) with UPI or card, and a Meta Pixel option.**
  - How:
    - Checkout uses Razorpay in India and Stripe elsewhere.
    - Digital items are emailed or unlocked after payment.
    - The "platform fee" is likely a cut taken automatically through the payment provider's split-payment feature (Razorpay Route or Stripe Connect).
    - The Meta Pixel is Meta's tracking script. Their policy says email and phone are hashed (scrambled) before being shared with Meta.
- **Facebook and WhatsApp automation (Max plan).**
  - How: Facebook Page comments and Messenger have the same comment-webhook, reply and private-reply features as Instagram. WhatsApp uses Meta's WhatsApp Business API with a dedicated business number. WhatsApp charges for some messages, and business-started chats need pre-approved message templates. That's likely why it's only on the top plan.
- **Shopify app ("where's my order?" answered in DMs).**
  - How:
    - The store owner installs the app, which gives SlideDM read-only access to orders.
    - When a DM asks about an order, AI spots the question and asks for the order number and email.
    - SlideDM looks the order up in Shopify and only answers if the email matches the order.
    - The reply gives the status and tracking link.
- **Mobile apps (iOS and Android).**
  - How: the apps are a front end to the same SlideDM server as the website. Alerts are push notifications through Apple and Google.

## Plans (INR)

| Plan | Price | Main additions |
|---|---|---|
| Free | ₹0 | 1,000 DMs (the terms say lifetime), SlideDM branding, Reply Desk |
| Pro | ₹999/mo, or ₹799/mo yearly | Unlimited DMs, no branding, follow to unlock, lead capture, Claude/ChatGPT, priority WhatsApp support |
| Max | ₹2,999/mo | Pro + Facebook and WhatsApp automation, 0% store fees |
| Agency | ₹3,990/mo | Pro features, team seats, a relationship manager, 5 to 20 client Instagram accounts |

- **Flat pricing with "unlimited" DMs.**
  - How: Meta doesn't charge apps for Instagram messages, so SlideDM's cost per DM is just server time plus any AI calls. That makes a flat price workable. The 100,000 DMs per month "fair usage" cap protects them from the few huge accounts.
- **Agency seats and client accounts.**
  - How: one login can hold several connected Instagram accounts (a workspace each), and teammates are invited with their own logins. The plan sets how many accounts and seats you get.
- **Billing in INR or USD.**
  - How: they detect your country and show INR or USD. Indian payments go through Razorpay's recurring subscriptions (cards and UPI autopay), and foreign payments through Stripe.
- **Influencer program (5,000+ followers get 6 months of Pro for one reel).**
  - How: applications are reviewed by hand, and Pro is turned on for the account once the reel is live.

## Things to know

- **Prices don't agree across the site.** The homepage says Pro is ₹999/mo (₹1,990 list) or ₹799/mo yearly. The pricing page says ₹1,990 monthly or ₹999/mo yearly. The terms say ₹999/mo or ₹9,588/yr. Which features are free also differs between pages.
- **Marketing and terms contradict each other.** The marketing says "zero ban risk" and offers a 100% refund on Pro if the Instagram account is restricted. The terms let SlideDM pause sends without notice, give no refund for those pauses, and cap liability at 12 months of fees. I couldn't read the refund-guarantee page: the site returned HTTP 429, too many requests.
- **The 200 DMs/hour figure** is their own number. Meta documents 750 private replies per hour per account.
- **Little independent coverage.** Social proof is the vendor's own: "10k+ creators", Bhuvan Bam and others, and brands like PhonePe and MakeMyTrip. Capterra and Shopify have no real reviews yet, and the comparison blogs are written by competitors.
- **Not mentioned anywhere:** broadcasts, multi-step flow builders, Live comment triggers, story mentions, or a public API. Their ManyChat page concedes ManyChat is broader: multi-channel and complex funnels.

## Sources

- [slidedm.app](https://www.slidedm.app/), [features](https://www.slidedm.app/features), [comment to DM](https://www.slidedm.app/features/comment-to-dm), [pricing](https://www.slidedm.app/pricing), [FAQ](https://www.slidedm.app/faq), [ManyChat alternative](https://www.slidedm.app/manychat-alternative), [fair usage](https://www.slidedm.app/fair-usage), [terms](https://www.slidedm.app/terms), [privacy](https://www.slidedm.app/privacy), [influencer program](https://www.slidedm.app/influencer-program)
- [taphere.bio](https://taphere.bio/), [Shopify app](https://apps.shopify.com/slidedm), [iOS app](https://apps.apple.com/in/app/slidedm-dm-automation-tool/id6767774887) (via [mwm.ai](https://mwm.ai/apps/slidedm-dm-automation-tool/6767774887))
- Third-party: [likecmtshare comparison](https://likecmtshare.com/manychat-alternatives-india.html), [indianalternatives.org](https://indianalternatives.org/slide-dm)
- How Instagram's API works: Meta's [private replies](https://developers.facebook.com/docs/instagram-platform/private-replies/), [webhooks](https://developers.facebook.com/docs/instagram-platform/webhooks) and [comment moderation](https://developers.facebook.com/docs/instagram-platform/comment-moderation) docs
