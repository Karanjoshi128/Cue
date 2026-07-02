"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
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
    <div className="mx-auto grid max-w-md place-items-center gap-4 py-24 text-center">
      <div className="bg-destructive/10 text-destructive rounded-full p-3">
        <AlertTriangle className="size-6" />
      </div>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Something went wrong</h2>
        <p className="text-muted-foreground text-sm">
          This page hit an unexpected error. You can try again — if it keeps
          happening, the details are in the logs.
        </p>
      </div>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
