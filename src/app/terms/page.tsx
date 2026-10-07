import Link from "next/link";
import type { Metadata } from "next";
import { LegalShell } from "@/components/marketing/site-chrome";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms governing your use of Cue.",
};

const UPDATED = "July 6, 2026";
const ENTITY = "Karan Joshi (“Cue”, “we”, “us”)";
const CONTACT = "joshikaran0008@gmail.com";
const GOVERNING = "India";

export default function TermsPage() {
  return (
    <LegalShell title="Terms of Service" updated={UPDATED}>
        <div className="text-muted-foreground space-y-10 text-[1rem] leading-[1.75] [&_a]:underline-offset-2 [&_li]:pl-1 [&_strong]:font-medium">
          <Section title="1. Acceptance">
            <p>
              By creating an account or using Cue, operated by {ENTITY}, you agree
              to these Terms. If you use Cue on behalf of an organization, you
              represent that you have authority to bind that organization.
            </p>
          </Section>

          <Section title="2. The service">
            <p>
              Cue lets you connect LinkedIn, Instagram, and YouTube accounts and
              schedule and publish content to them. You are responsible for the
              accounts you connect and the content you publish.
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
                Meta/Instagram, the{" "}
                <a
                  className="text-primary underline"
                  href="https://www.youtube.com/t/terms"
                  target="_blank"
                  rel="noreferrer"
                >
                  YouTube Terms of Service
                </a>
                , and all applicable laws.
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
              Cue depends on third-party APIs (LinkedIn, Meta/Instagram, and
              YouTube API Services). We are
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
