import Link from "next/link";
import type { Metadata } from "next";
import { CONTACT_EMAIL as CONTACT, LegalShell } from "@/components/marketing/site-chrome";
import { featureInUse } from "@/lib/plans";
import { aiEnabled } from "@/lib/ai";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Cue collects, uses, and protects your data.",
};

// Operating entity: Karan Joshi (individual). Governing law: India.
// Describes Cue's actual data practices for Meta / LinkedIn / Google review.
// The YouTube API Services section is required for Google OAuth verification.
const UPDATED = "October 28, 2026";
const ENTITY = "Karan Joshi (“Cue”, “we”, “us”)";

export default async function PrivacyPage() {
  // Comment automations, the Reply Desk and AI helpers are described only once
  // they're switched on, so the policy matches what's live (and what Meta and
  // Google are reviewing).
  // Also once a workspace has them early (Admin → Users): that's live too.
  // Unlocking one re-renders this page (setEarlyFeature).
  const [automations, replyDesk] = await Promise.all([
    featureInUse("ig_automations"),
    featureInUse("reply_desk"),
  ]);
  const ai = aiEnabled();
  return (
    <LegalShell title="Privacy Policy" updated={UPDATED}>
        <div className="text-muted-foreground space-y-10 text-[1rem] leading-[1.75] [&_a]:underline-offset-2 [&_li]:pl-1 [&_strong]:font-medium">
          <section className="space-y-3">
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
                refresh token) plus that account&apos;s platform id, username,
                and display name. When you connect a LinkedIn Company Page, we
                receive the list of Pages you administer so you can choose one,
                and store only the chosen Page&apos;s id and name. Tokens are{" "}
                <strong className="text-foreground">encrypted at rest</strong>{" "}
                and used only to identify the connected account, keep the
                connection active, and publish on your behalf.
              </li>
              <li>
                <strong className="text-foreground">Content you create.</strong>{" "}
                Post captions, scheduling times, and any images, videos, or
                documents you upload for publishing. Media is stored in
                Cloudflare R2, or in the storage provider your workspace
                connects in Settings.
              </li>
              {automations && (
                <li>
                  <strong className="text-foreground">
                    Instagram comment automations.
                  </strong>{" "}
                  If your workspace sets up an automation, Cue reads new
                  comments on that Instagram account&apos;s posts, and the
                  direct messages people send it: replies to its stories,
                  messages with a keyword, and answers to a question the
                  automation asked. For each one that matches an automation, we
                  store its id and text, the person&apos;s Instagram username
                  and Instagram-scoped id, and what Cue sent. If an automation
                  sends its link to followers only, Cue asks Instagram whether
                  the person follows the account. If it asks for an email
                  address or phone number, we store the answer as a lead for
                  the account&apos;s owner. Comments and messages that don&apos;t
                  match an automation are read and discarded, not stored.
                </li>
              )}
              {replyDesk && (
                <li>
                  <strong className="text-foreground">Reply Desk.</strong> If
                  your workspace uses the Reply Desk, Cue reads recent comments
                  on the Instagram and YouTube accounts you connected with
                  comment access, and stores each comment&apos;s id and text,
                  its author&apos;s name and id, and the post it&apos;s on, so
                  your team can answer them from Cue.
                </li>
              )}
              <li>
                <strong className="text-foreground">Link pages.</strong> If
                your workspace publishes a link page for a client, Cue counts
                how many times the page is viewed and each link or post on it
                is tapped, per day. It doesn&apos;t keep a record of who
                visited.
              </li>
              <li>
                <strong className="text-foreground">AI assistants you connect.</strong>{" "}
                If you connect an assistant such as Claude or ChatGPT to Cue,
                we store which app you approved, when, and when it was last
                used, with its access tokens stored only as hashes. It acts
                with your permissions in your workspace.
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
              {automations && (
                <li>
                  Reply to comments, and send the direct messages you wrote,
                  when someone comments a keyword you chose, replies to a
                  story, or messages a keyword to an Instagram account you
                  connect. Cue only messages people who commented or wrote to
                  the account first, within the time Instagram allows (7 days
                  after a comment, 24 hours after their last message).
                </li>
              )}
              {replyDesk && (
                <li>
                  Show comments on your connected accounts in the Reply Desk,
                  and post the replies your team writes there, as the account.
                </li>
              )}
              {ai && (
                <li>
                  When your team uses Cue&apos;s AI helpers, send the text
                  involved (a direct message, a comment and the post it&apos;s
                  on, or the description of an automation) to Anthropic&apos;s
                  Claude API to write a suggestion, to sort comments, or to
                  screen comments for abuse when an automation asks for that.
                </li>
              )}
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
              and Developer Policies, and our use of LinkedIn&apos;s APIs
              complies with the{" "}
              <a
                className="text-primary underline"
                href="https://www.linkedin.com/legal/l/api-terms-of-use"
                target="_blank"
                rel="noreferrer"
              >
                LinkedIn API Terms of Use
              </a>
              . We also rely on these processors:
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong className="text-foreground">Supabase</strong> -
                authentication and database.
              </li>
              <li>
                <strong className="text-foreground">Cloudflare R2</strong> -
                storage for the media you upload, unless your workspace
                connects its own storage.
              </li>
              <li>
                <strong className="text-foreground">Vercel</strong> - application
                hosting.
              </li>
              <li>
                <strong className="text-foreground">Resend</strong> - delivers
                the sign-in code emails and the alert emails admins can turn
                on.
              </li>
              {ai && (
                <li>
                  <strong className="text-foreground">Anthropic</strong> - the
                  Claude API, for the AI helpers described above.
                </li>
              )}
              <li>
                <strong className="text-foreground">Zoho Mail</strong> - our
                business email, for messages you send us.
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
                <strong className="text-foreground">What we access.</strong>{" "}
                Your Google account id, email address, and name - used only to
                label the connected channel - plus permission to upload videos on
                your behalf. We do not read your existing videos, comments,
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
                Access tokens are kept until you disconnect the account or
                delete the client, then removed.
              </li>
              <li>
                Posts, their captions, and the media you upload are kept until
                you delete them, so your publishing history stays available. A
                lightweight record of each published post (platform, link,
                date) is also kept for your history.
              </li>
              <li>
                Deleting a post removes its media from Cue&apos;s storage.
                Deleting a client or workspace removes its accounts, posts, and
                media. Files in storage your workspace connected itself stay in
                your bucket, under your control.
              </li>
              {automations && (
                <li>
                  Records of comments and messages an automation acted on are
                  deleted after 30 days. Deleting the automation, disconnecting
                  the account, or deleting the client removes them straight
                  away. Leads are kept until your team deletes them,
                  disconnects the account, or deletes the client.
                </li>
              )}
              {replyDesk && (
                <li>Comments in the Reply Desk are deleted after 30 days.</li>
              )}
              <li>
                A link page&apos;s view and tap counts are deleted with the
                page.
              </li>
              <li>
                An assistant you connected stays connected until you
                disconnect it in Settings, or until it goes 60 days without
                renewing its access.
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
              Traffic is served over HTTPS and social access tokens are
              encrypted at rest. No system is perfectly secure, but we work to
              protect your data using industry-standard measures.
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
    </LegalShell>
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
    <section className="space-y-3">
      <h2 className="headline text-foreground text-[1.75rem]">{title}</h2>
      {children}
    </section>
  );
}
