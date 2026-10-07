"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface the error for debugging (Vercel logs / browser console).
    console.error(error);
  }, [error]);

  return (
    <div className="bg-card relative mx-auto max-w-2xl overflow-hidden rounded-2xl border px-6 py-16 text-center sm:px-12">
      <div
        aria-hidden
        className="bg-grid pointer-events-none absolute inset-0 mask-[radial-gradient(ellipse_at_center,black,transparent_70%)]"
      />
      <div className="relative">
        <span className="label-caps inline-flex items-center gap-2">
          <span className="tally text-fault" data-live="true" />
          Fault
        </span>
        <h1 className="headline mt-3 text-4xl">
          We missed a <em>cue.</em>
        </h1>
        <p className="text-muted-foreground mx-auto mt-3 max-w-md text-sm leading-relaxed">
          This page hit an unexpected error. Try again, and if it keeps
          happening, the details are in the logs
          {error.digest ? (
            <>
              {" "}
              under{" "}
              <code className="bg-muted rounded px-1 font-mono text-xs">
                {error.digest}
              </code>
            </>
          ) : null}
          .
        </p>
        <div className="mt-7 flex justify-center gap-2">
          <Button onClick={reset}>
            <RotateCw /> Try again
          </Button>
          <Button render={<Link href="/dashboard" />} variant="outline">
            Back to dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
