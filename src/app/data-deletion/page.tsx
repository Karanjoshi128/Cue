import type { Metadata } from "next";
import { LegalShell } from "@/components/marketing/site-chrome";

export const metadata: Metadata = {
  title: "Data Deletion",
  description: "How to delete your data from Cue.",
};

const CONTACT = "joshikaran0008@gmail.com";

// Meta requires a public Data Deletion Instructions URL for app review.
export default function DataDeletionPage() {
  return (
    <LegalShell title="Data Deletion">
        <div className="text-muted-foreground space-y-10 text-[1rem] leading-[1.75] [&_a]:underline-offset-2 [&_li]:pl-1 [&_strong]:font-medium">
          <p>
            You are in control of the data Cue stores. There are two ways to
            remove it.
          </p>

          <section className="space-y-3">
            <h2 className="headline text-foreground text-[1.75rem]">
              1. Disconnect an account yourself (instant)
            </h2>
            <p>
              Sign in to Cue, open the{" "}
              <strong className="text-foreground">Clients</strong> page, find the
              connected LinkedIn, Instagram, or YouTube account, and click the{" "}
              <strong className="text-foreground">disconnect</strong> (unplug)
              icon. This immediately deletes the stored access token and stops
              Cue from accessing that account. Deleting a client removes its
              connected accounts, posts, and uploaded media.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="headline text-foreground text-[1.75rem]">
              2. Delete your whole account and workspace
            </h2>
            <p>
              To permanently delete your account, your workspace, and all
              associated data (connected accounts, tokens, posts, media, and
              history), email{" "}
              <a className="text-primary underline" href={`mailto:${CONTACT}`}>
                {CONTACT}
              </a>{" "}
              from your account email with the subject{" "}
              <strong className="text-foreground">
                &ldquo;Delete my data&rdquo;</strong>
              . We will verify the request and complete deletion within{" "}
              <strong className="text-foreground">30 days</strong>, then confirm
              by email.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="headline text-foreground text-[1.75rem]">
              What gets deleted
            </h2>
            <ul className="list-disc space-y-2 pl-5">
              <li>Your profile (email, name) and workspace membership.</li>
              <li>
                All connected LinkedIn / Instagram / YouTube (Google) access
                &amp; refresh tokens.
              </li>
              <li>Clients, scheduled and published posts, and uploaded media.</li>
              <li>Publishing history records.</li>
            </ul>
          </section>

          <p>
            You can also revoke Cue&apos;s access directly from the platform: in
            Instagram, remove Cue under{" "}
            <em>Settings → Apps and Websites</em>; in LinkedIn, under{" "}
            <em>Settings → Data privacy → Permitted services</em>; and for a
            YouTube channel, remove Cue from your{" "}
            <a
              className="text-primary underline"
              href="https://myaccount.google.com/permissions"
              target="_blank"
              rel="noreferrer"
            >
              Google account permissions
            </a>
            .
          </p>
        </div>
    </LegalShell>
  );
}
