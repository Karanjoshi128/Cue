import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { UnsubscribeControls } from "@/components/unsubscribe-controls";
import { prisma } from "@/lib/prisma";
import { verifyUnsubscribeToken } from "@/lib/mailer/suppression";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Email preferences",
  robots: { index: false, follow: false },
};

export default async function UnsubscribePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const email = verifyUnsubscribeToken(token);
  const row = email
    ? await prisma.mailerSuppression.findUnique({ where: { email }, select: { reason: true } })
    : null;

  return (
    <div className="bg-canvas text-foreground flex min-h-dvh items-center justify-center px-4 py-16">
      <main className="bg-card w-full max-w-md rounded-2xl border p-7 shadow-[0_1px_2px_0_rgb(20_20_40/0.04)] sm:p-8">
        <Link href="/" aria-label="Cue home">
          <Logo className="h-7 w-auto" />
        </Link>
        {email ? (
          <UnsubscribeControls
            token={token}
            email={email}
            initial={row ? (row.reason === "unsubscribed" ? "unsubscribed" : "blocked") : "subscribed"}
          />
        ) : (
          <div className="mt-6 space-y-2">
            <h1 className="headline text-[1.75rem]">This link doesn&apos;t work.</h1>
            <p className="text-muted-foreground text-sm leading-relaxed">
              It may have been cut short when it was copied. Open the unsubscribe link from the email again, or
              reply to the email and ask to be removed.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
