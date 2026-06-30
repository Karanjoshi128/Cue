import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { LoginForm } from "@/components/login-form";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  const configured = isSupabaseConfigured();

  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className="flex justify-center">
          <Logo className="h-10 w-auto" />
        </div>
        <p className="text-muted-foreground text-sm">
          Schedule social posts for every client, in one place.
        </p>

        {configured ? (
          <LoginForm />
        ) : (
          <div className="space-y-3">
            <p className="text-muted-foreground text-sm">
              Auth isn&apos;t configured yet — running in local dev mode.
            </p>
            <Button render={<Link href="/" />} className="w-full">
              Enter app
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
