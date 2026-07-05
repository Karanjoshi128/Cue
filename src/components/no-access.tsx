import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ShieldAlert } from "lucide-react";

/** Shown when someone is authenticated but not a member of the workspace. */
export function NoAccess({ email }: { email: string }) {
  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-md space-y-4 text-center">
        <div className="bg-muted text-muted-foreground mx-auto grid size-12 place-items-center rounded-full">
          <ShieldAlert className="size-6" />
        </div>
        <h1 className="text-xl font-semibold">You don&apos;t have access yet</h1>
        <p className="text-muted-foreground text-sm">
          You&apos;re signed in as{" "}
          <span className="text-foreground font-medium">{email}</span>, but this
          email hasn&apos;t been added to a workspace. Ask a workspace admin to
          invite you, then sign in again.
        </p>
        <Button render={<Link href="/logout" />} variant="outline">
          Sign out
        </Button>
      </div>
    </div>
  );
}
