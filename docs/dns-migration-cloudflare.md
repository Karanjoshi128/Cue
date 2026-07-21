# Moving trycue.space DNS to Cloudflare (checklist)

Why: Cloudflare R2 custom domains require the zone to be **managed by Cloudflare**
(full nameserver delegation, since partial CNAME setup is Business plan only).
Today `trycue.space` runs on Hostinger nameservers, so `media.trycue.space`
cannot be attached to the `cue-media` bucket without this migration.

Goal: replace the rate limited `pub-*.r2.dev` public URL, which Cloudflare itself
flags as "not recommended for production", and which **Meta fetches Instagram
media from during publishing**.

> **Do not run this while an app review is in flight.** Meta and Google both
> re-fetch `trycue.space` (privacy policy, OAuth domain ownership, the app
> itself). A propagation window at the wrong moment can fail a review. Wait
> until both verifications have landed.

---

## 0. Current records (captured live, keep this as the source of truth)

Nameservers today: `pixel.dns-parking.com`, `byte.dns-parking.com` (Hostinger).

| Type  | Name                             | Value                                                                   | Purpose             |
| ----- | -------------------------------- | ----------------------------------------------------------------------- | ------------------- |
| A     | `trycue.space`                   | `216.198.79.1`                                                          | Vercel apex         |
| CNAME | `www.trycue.space`               | `cname.vercel-dns.com`                                                  | Vercel www          |
| TXT   | `trycue.space`                   | `google-site-verification=VT-QzbNkvunQ0sfYYDDbSRrZqCZA6rWdHs-YBMnzzXk`  | Search Console      |
| MX    | `send.trycue.space`              | `10 feedback-smtp.ap-northeast-1.amazonses.com`                         | Resend bounces      |
| TXT   | `send.trycue.space`              | `v=spf1 include:amazonses.com ~all`                                     | Resend SPF          |
| TXT   | `resend._domainkey.trycue.space` | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCpXdIdVv8gMCnL2ULavYh5xaGYzk9PdEE+zQeA+n++C/vnCd59XVC9H+38jzWQmJiJmry4T8AAeEZWNPKXWiiUCPAsi93GQn4SzYrvuPJ28BDmqwPXLQlSxlSKnOxOmW4atyUeFFPgOPiHC3nIvCJRvwbvxah+ApaPvedx2vTsiQIDAQAB` | Resend DKIM |
| TXT   | `_dmarc.trycue.space`            | `v=DMARC1; p=none;`                                                     | DMARC               |

There is **no MX on the apex** - that is correct, Cue does not receive mail.

What breaks if each is lost:

- **A / CNAME** - the site goes down, and both reviews fail.
- **Search Console TXT** - domain ownership evaporates, which is what the Google
  OAuth authorized domain rests on.
- **Resend MX / SPF / DKIM** - sign-in codes stop arriving, so **nobody can log
  in**, including reviewers.

Re-capture the list any time with:

```powershell
Resolve-DnsName trycue.space -Type A
Resolve-DnsName www.trycue.space -Type CNAME
Resolve-DnsName trycue.space -Type TXT
Resolve-DnsName send.trycue.space -Type MX
Resolve-DnsName send.trycue.space -Type TXT
Resolve-DnsName resend._domainkey.trycue.space -Type TXT
Resolve-DnsName _dmarc.trycue.space -Type TXT
```

---

## 1. Stage the zone in Cloudflare (no cutover yet)

- [ ] Cloudflare dashboard, **Add a site** -> `trycue.space` -> **Free** plan.
- [ ] Cloudflare scans and imports what it can find. **The scan is not
      trustworthy.** Compare against the table above, row by row, and add
      anything missing.
- [ ] Set **proxy status** correctly:
  - `trycue.space` (A) and `www` (CNAME) -> **DNS only (grey cloud)**. Proxying
    in front of Vercel adds a second CDN and TLS layer for no benefit and is a
    common source of redirect loops.
  - TXT and MX records are never proxied.
- [ ] Do **not** change nameservers yet. Nothing is live at this point, so this
      step is safe to do at any time, even during a review.

---

## 2. Cutover

- [ ] In **Hostinger** (registrar, not the DNS zone editor), replace the
      nameservers with the two Cloudflare assigns you, of the form
      `something.ns.cloudflare.com`.
- [ ] Propagation is typically minutes, but allow up to 24 to 48 hours.
- [ ] Cloudflare emails you when the zone goes active.

---

## 3. Verify before touching anything else

- [ ] `https://trycue.space` loads the landing page.
- [ ] `https://www.trycue.space` reaches the site.
- [ ] **Send yourself a sign-in code and confirm the email arrives.** This is the
      single most important check, because DKIM or SPF being wrong is silent
      until someone tries to log in.
- [ ] Search Console still reports the domain as verified.
- [ ] `https://trycue.space/privacy` and `/terms` resolve, since both reviewers
      fetch them.

Rollback: point the nameservers back to `pixel.dns-parking.com` and
`byte.dns-parking.com` at Hostinger. Rollback is **not** instant, it propagates
like any other change, which is the whole reason not to do this during a review.

---

## 4. Only now, attach the R2 custom domain

- [ ] Cloudflare, **R2 -> `cue-media` -> Settings -> Custom Domains -> Add**
      -> `media.trycue.space`. Cloudflare creates the DNS record itself.
- [ ] Wait for the domain to report **Active**.
- [ ] Confirm an existing object loads over the new host, for example
      `https://media.trycue.space/posts/<some-existing-key>`.

---

## 5. Point the app at it

- [ ] Vercel project settings, environment variables:
      `R2_PUBLIC_URL=https://media.trycue.space`
- [ ] Local `.env`, same value.
- [ ] **Redeploy.** Environment variables are read at build and runtime, so an
      old deployment keeps using the old value.

> **Leave the `pub-*.r2.dev` development URL enabled.** `MediaAsset.url` stores
> **absolute** URLs, so every already-published post still points at r2.dev.
> Disabling it breaks media on historical posts, and on anything Meta re-fetches.
> Only new uploads pick up the new host.
>
> A later cleanup could rewrite stored URLs and serve from `storageKey` plus the
> current base instead, which would make the base URL swappable. Not required for
> this migration.

---

## 6. Optional hardening, once stable

- Cloudflare caching rules on `media.trycue.space`, which R2 egress does not
  charge for.
- Keep the apex on **DNS only** unless there is a concrete reason to proxy.
