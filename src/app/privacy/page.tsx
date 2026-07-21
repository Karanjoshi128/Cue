import Link from "next/link";
import type { Metadata } from "next";
import { Logo } from "@/components/brand/logo";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Cue collects, uses, and protects your data.",
};

// Operating entity: Karan Joshi (individual). Governing law: India.
// Describes Cue's actual data practices for Meta / LinkedIn / Google review.
// The YouTube API Services section is required for Google OAuth verification.
const UPDATED = "July 6, 2026";
const ENTITY = "Karan Joshi (“Cue”, “we”, “us”)";
const CONTACT = "joshikaran0008@gmail.com";

export default function PrivacyPage() {
  return (
    <main className="bg-background text-foreground min-h-screen px-5 py-12">
      <article className="mx-auto max-w-3xl space-y-6">
        <header className="space-y-3">
          <Link href="/" aria-label="Cue home">
            <Logo className="h-8 w-auto" />
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight">
            Privacy Policy
          </h1>
          <p className="text-muted-foreground text-sm">Last updated {UPDATED}</p>
        </header>

        <div className="text-muted-foreground space-y-6 text-[0.95rem] leading-relaxed">
          <section className="space-y-2">
            <p>
              {ENTITY} operates Cue, a social media scheduling tool that lets
              agencies plan, schedule, and publish posts to their clients&apos;
              LinkedIn, Instagram, and YouTube accounts. This policy explains
              what we collect, why, and the choices you have.
            </p>
          </section>

          <Section title="Information we collect">
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong className="text-foreground">Account data.</strong> The
                email address you sign in with (via a passwordless one-time code
                we email you) and a display name you choose.
              </li>
              <li>
                <strong className="text-foreground">
                  Connected social accounts.
                </strong>{" "}
                When you connect a LinkedIn, Instagram, or YouTube account, we
                receive and store an access token (and, where provided, a
                refresh token) plus
                that account&apos;s platform id, username, and display name. Tokens
                are <strong className="text-foreground">encrypted at rest</strong>{" "}
                and used only to publish on your behalf.
              </li>
              <li>
                <strong className="text-foreground">Content you create.</strong>{" "}
                Post captions, scheduling times, and any images, videos, or
                documents you upload for publishing. Media is stored in
                Cloudflare R2.
              </li>
            </ul>
          </Section>

          <Section title="How we use your information">
            <p>We use the data solely to provide the service:</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>Authenticate you and keep your workspace isolated.</li>
              <li>
                Schedule and publish your posts to the LinkedIn, Instagram, and
                YouTube accounts you connect, at the times you set.
              </li>
              <li>Show publishing status, history, and account health.</li>
            </ul>
            <p>
              We do <strong className="text-foreground">not</strong> sell your
              data or use it for advertising.
            </p>
          </Section>

          <Section title="Platforms and third parties">
            <p>
              Cue integrates with the official APIs of{" "}
              <strong className="text-foreground">
                LinkedIn, Meta (Instagram), and YouTube
              </strong>
              . When you publish, your content and the relevant access token are
              sent to those platforms to create the post. Our use of the
              Instagram Platform complies with the{" "}
              <a
                className="text-primary underline"
                href="https://developers.facebook.com/terms/"
                target="_blank"
                rel="noreferrer"
              >
                Meta Platform Terms
              </a>{" "}
              and Developer Policies. We also rely on these processors:
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong className="text-foreground">Supabase</strong> —
                authentication and database.
              </li>
              <li>
                <strong className="text-foreground">Cloudflare R2</strong> —
                storage for the media you upload.
              </li>
              <li>
                <strong className="text-foreground">Vercel</strong> — application
                hosting.
              </li>
            </ul>
          </Section>

          <Section title="YouTube API Services">
            <p>
              Cue uses{" "}
              <strong className="text-foreground">YouTube API Services</strong>{" "}
              to upload videos to the channel you connect. By connecting a
              YouTube channel you agree to the{" "}
              <a
                className="text-primary underline"
                href="https://www.youtube.com/t/terms"
                target="_blank"
                rel="noreferrer"
              >
                YouTube Terms of Service
              </a>
              , and Google&apos;s handling of your data is described in the{" "}
              <a
                className="text-primary underline"
                href="https://policies.google.com/privacy"
                target="_blank"
                rel="noreferrer"
              >
                Google Privacy Policy
              </a>
              .
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong className="text-foreground">What we access.</strong> Your
                Google account id, email address, and name — used only to label
                the connected channel — plus permission to upload videos on your
                behalf. We do not read your existing videos, comments,
                subscribers, or analytics.
              </li>
              <li>
                <strong className="text-foreground">Limited Use.</strong>{" "}
                Cue&apos;s use and transfer of information received from Google
                APIs adheres to the{" "}
                <a
                  className="text-primary underline"
                  href="https://developers.google.com/terms/api-services-user-data-policy"
                  target="_blank"
                  rel="noreferrer"
                >
                  Google API Services User Data Policy
                </a>
                , including its Limited Use requirements. We do not sell this
                data, use it for advertising, or let humans read it except where
                required for security or by law.
              </li>
              <li>
                <strong className="text-foreground">Revoking access.</strong>{" "}
                Disconnect the channel from the{" "}
                <strong className="text-foreground">Clients</strong> page, which
                deletes its stored tokens, or revoke Cue&apos;s access at any
                time through your{" "}
                <a
                  className="text-primary underline"
                  href="https://myaccount.google.com/permissions"
                  target="_blank"
                  rel="noreferrer"
                >
                  Google security settings
                </a>
                .
              </li>
            </ul>
          </Section>

          <Section title="Data retention">
            <ul className="list-disc space-y-2 pl-5">
              <li>
                Access tokens are kept until you disconnect the account or delete
                the client, then removed.
              </li>
              <li>
                Published posts and their uploaded media are automatically purged
                about 7 days after they finish publishing; a lightweight record
                (platform, link, date) is retained for your history.
              </li>
              <li>
                Deleting a client or workspace removes its accounts, posts, and
                media.
              </li>
            </ul>
          </Section>

          <Section title="Your choices and data deletion">
            <p>
              You can disconnect any social account at any time from the{" "}
              <strong className="text-foreground">Clients</strong> page, which
              immediately deletes its stored tokens. To request deletion of your
              account and all associated data, see our{" "}
              <Link className="text-primary underline" href="/data-deletion">
                Data Deletion instructions
              </Link>{" "}
              or email us at{" "}
              <a className="text-primary underline" href={`mailto:${CONTACT}`}>
                {CONTACT}
              </a>
              .
            </p>
          </Section>

          <Section title="Security">
            <p>
              Traffic is served over HTTPS and social access tokens are encrypted
              at rest. No system is perfectly secure, but we work to protect your
              data using industry-standard measures.
            </p>
          </Section>

          <Section title="Changes to this policy">
            <p>
              We may update this policy from time to time. Material changes will
              be reflected by the &ldquo;Last updated&rdquo; date above.
            </p>
          </Section>

          <Section title="Contact">
            <p>
              Questions? Email{" "}
              <a className="text-primary underline" href={`mailto:${CONTACT}`}>
                {CONTACT}
              </a>
              .
            </p>
          </Section>
        </div>
      </article>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-foreground text-xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}
