"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { motion } from "framer-motion";
import type { Platform } from "@prisma/client";
import { createClient } from "@/lib/actions";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { PlatformIcon, ClientDot } from "@/components/post-bits";
import { LinkedinIcon, InstagramIcon } from "@/components/platform-icons";
import { Plus, CheckCircle2 } from "lucide-react";

interface AccountLite {
  id: string;
  platform: Platform;
  displayName: string;
  tokenExpires: string | null;
}
interface ClientLite {
  id: string;
  name: string;
  color: string | null;
  postCount: number;
  accounts: AccountLite[];
}

export function ClientsManager({ clients }: { clients: ClientLite[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#2A6FF2");
  const [pending, startTransition] = useTransition();

  function addClient() {
    if (!name.trim()) return toast.error("Enter a name");
    startTransition(async () => {
      try {
        await createClient({ name, color });
        toast.success("Client added");
        setName("");
        setOpen(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed");
      }
    });
  }

  function connect(clientId: string, platform: "linkedin" | "instagram") {
    window.location.href = `/api/oauth/${platform}/start?clientId=${clientId}`;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Clients</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger
            render={
              <Button>
                <Plus className="size-4" /> Add client
              </Button>
            }
          />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add a client</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Acme Co."
                />
              </div>
              <div className="space-y-2">
                <Label>Color</Label>
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="h-9 w-16 rounded border"
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={addClient} disabled={pending}>
                Add client
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {clients.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-12 text-center text-sm">
            No clients yet. Add your first one to start scheduling.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {clients.map((c) => (
            <motion.div key={c.id} layout>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <ClientDot color={c.color} />
                    {c.name}
                    <span className="text-muted-foreground ml-auto text-xs font-normal">
                      {c.postCount} posts
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {c.accounts.length > 0 && (
                    <div className="space-y-1.5">
                      {c.accounts.map((a) => (
                        <div
                          key={a.id}
                          className="text-muted-foreground flex items-center gap-2 text-sm"
                        >
                          <PlatformIcon platform={a.platform} />
                          <span>{a.displayName}</span>
                          <CheckCircle2 className="text-mint ml-auto size-4" />
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => connect(c.id, "linkedin")}
                    >
                      <LinkedinIcon className="size-4" /> LinkedIn
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => connect(c.id, "instagram")}
                    >
                      <InstagramIcon className="size-4" /> Instagram
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
