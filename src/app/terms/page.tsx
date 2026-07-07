import Link from "next/link";
import type { Metadata } from "next";
import { Logo } from "@/components/brand/logo";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms governing your use of Cue.",
};

const UPDATED = "July 6, 2026";
const ENTITY = "BFG Market Consult Private Limited (“Cue”, “we”, “us”)";
const CONTACT = "joshikaran0008@gmail.com";
const GOVERNING = "India";
const ADDRESS =
  "Floor 1st, House No-18, Block-SU, Pitampura, North West Delhi, Delhi 110034";

export default function TermsPage() {
  return (
    <main className="bg-background text-foreground min-h-screen px-5 py-12">
      <article className="mx-auto max-w-3xl space-y-6">
        <header className="space-y-3">
          <Link href="/" aria-label="Cue home">
            <Logo className="h-8 w-auto" />
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight">
            Terms of Service
          </h1>
          <p className="text-muted-foreground text-sm">Last updated {UPDATED}</p>
        </header>

        <div className="text-muted-foreground space-y-6 text-[0.95rem] leading-relaxed">
          <Section title="1. Acceptance">
            <p>
              By creating an account or using Cue, operated by {ENTITY}, you agree
              to these Terms. If you use Cue on behalf of an organization, you
              represent that you have authority to bind that organization.
            </p>
          </Section>

          <Section title="2. The service">
            <p>
              Cue lets you connect LinkedIn and Instagram accounts and schedule
              and publish content to them. You are responsible for the accounts
              you connect and the content you publish.
            </p>
          </Section>

          <Section title="3. Your responsibilities">
            <ul className="list-disc space-y-2 pl-5">
              <li>
                You must have the right and authorization to connect and post to
                each social account you add.
              </li>
              <li>
                Your use must comply with the terms and policies of LinkedIn and
                Meta/Instagram, and all applicable laws.
              </li>
              <li>
                You must not use Cue to publish spam, illegal, infringing, or
                deceptive content, or to abuse the connected platforms&apos; APIs.
              </li>
            </ul>
          </Section>

          <Section title="4. Content ownership">
            <p>
              You retain all rights to the content you upload and publish. You
              grant Cue a limited license to store and transmit that content
              solely to provide the scheduling and publishing service.
            </p>
          </Section>

          <Section title="5. Third-party platforms">
            <p>
              Cue depends on third-party APIs (LinkedIn, Meta/Instagram). We are
              not responsible for changes, outages, or actions those platforms
              take, including rate limits, account restrictions, or removal of a
              post.
            </p>
          </Section>

          <Section title="6. Availability & disclaimer">
            <p>
              Cue is provided &ldquo;as is,&rdquo; without warranties of any
              kind. We do not guarantee that every scheduled post will publish
              successfully, as publishing depends on the connected platforms and
              valid credentials.
            </p>
          </Section>

          <Section title="7. Limitation of liability">
            <p>
              To the maximum extent permitted by law, {ENTITY} will not be liable
              for any indirect, incidental, or consequential damages arising from
              your use of Cue.
            </p>
          </Section>

          <Section title="8. Termination">
            <p>
              You may stop using Cue and delete your data at any time (see our{" "}
              <Link className="text-primary underline" href="/data-deletion">
                Data Deletion
              </Link>{" "}
              page). We may suspend or terminate accounts that violate these
              Terms.
            </p>
          </Section>

          <Section title="9. Governing law">
            <p>These Terms are governed by the laws of {GOVERNING}.</p>
          </Section>

          <Section title="10. Contact">
            <p>
              Cue is operated by BFG Market Consult Private Limited, registered
              office: {ADDRESS}.
            </p>
            <p>
              Questions about these Terms? Email{" "}
              <a className="text-primary underline" href={`mailto:${CONTACT}`}>
                {CONTACT}
              </a>
              .
            </p>
          </Section>

          <p className="text-sm">
            See also our{" "}
            <Link className="text-primary underline" href="/privacy">
              Privacy Policy
            </Link>
            .
          </p>
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
