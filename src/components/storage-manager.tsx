"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CircleDashed,
  Cloud,
  Copy,
  Database,
  HardDrive,
  Loader2,
  XCircle,
} from "lucide-react";
import {
  cleanupStorageTest,
  removeStorageConfig,
  retestStorage,
  saveStorageConfig,
  testStorageConnection,
} from "@/lib/actions";
import type { StorageTestResult } from "@/lib/storage-config";
import type { StorageSummary } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// Settings > Media storage: where this workspace's uploads go. Cue's own R2
// bucket by default; an admin can connect the workspace's own Cloudflare R2
// or S3-compatible bucket instead. Three steps: pick a provider, enter the
// bucket and keys, then a live test that must pass before it can be saved.

type Provider = "R2" | "S3";
type Jurisdiction = "default" | "eu" | "fedramp";
type ServiceId = "aws" | "b2" | "spaces" | "wasabi" | "supabase" | "minio" | "other";

interface Service {
  label: string;
  endpoint: string; // placeholder; "" = AWS's own endpoint
  region: string; // default region, "" = must be typed
  regionPlaceholder: string;
  pathStyle: boolean;
  publicUrl: (bucket: string, region: string) => string;
  keys: string;
  access: string;
}

// Per-service defaults and setup notes. They only fill placeholders and
// defaults; whatever the admin types is what gets tested and saved.
const SERVICES: Record<ServiceId, Service> = {
  aws: {
    label: "Amazon S3",
    endpoint: "",
    region: "us-east-1",
    regionPlaceholder: "us-east-1",
    pathStyle: false,
    publicUrl: (b, r) => `https://${b}.s3.${r || "us-east-1"}.amazonaws.com`,
    keys: "In IAM, create a user that can s3:PutObject and s3:DeleteObject on this bucket, then create an access key for it.",
    access:
      "Allow public reads with a bucket policy (s3:GetObject for everyone; Block Public Access must allow bucket policies), or put CloudFront in front and use its domain.",
  },
  b2: {
    label: "Backblaze B2",
    endpoint: "https://s3.us-west-004.backblazeb2.com",
    region: "",
    regionPlaceholder: "us-west-004",
    pathStyle: true,
    publicUrl: (b) => `https://f004.backblazeb2.com/file/${b}`,
    keys: "Application Keys, Add a New Application Key, with read and write access to this bucket. The keyID is the access key ID and the applicationKey is the secret. The endpoint is on the bucket's details.",
    access:
      "Set the bucket to Public. The public URL is the start of a file's Friendly URL, up to and including the bucket name.",
  },
  spaces: {
    label: "DigitalOcean Spaces",
    endpoint: "https://nyc3.digitaloceanspaces.com",
    region: "us-east-1",
    regionPlaceholder: "us-east-1",
    pathStyle: false,
    publicUrl: (b) => `https://${b}.nyc3.digitaloceanspaces.com`,
    keys: "API, Spaces Keys, Generate New Key. Use your Space's region in the endpoint (nyc3, ams3, sgp1 and so on); the region field can stay us-east-1.",
    access:
      "Allow public reads with a bucket policy, then use the Space's origin or CDN endpoint as the public URL.",
  },
  wasabi: {
    label: "Wasabi",
    endpoint: "https://s3.us-east-1.wasabisys.com",
    region: "us-east-1",
    regionPlaceholder: "us-east-1",
    pathStyle: true,
    publicUrl: (b, r) => `https://s3.${r || "us-east-1"}.wasabisys.com/${b}`,
    keys: "Access Keys, Create New Access Key, for a user that can read and write this bucket.",
    access: "Allow public reads with a bucket policy (s3:GetObject for everyone).",
  },
  supabase: {
    label: "Supabase Storage",
    endpoint: "https://PROJECT_REF.storage.supabase.co/storage/v1/s3",
    region: "",
    regionPlaceholder: "ap-south-1",
    pathStyle: true,
    publicUrl: (b) => `https://PROJECT_REF.supabase.co/storage/v1/object/public/${b}`,
    keys: "Project Settings, Storage, S3 Connection: enable it, copy the endpoint and region, and create an access key.",
    access: "Mark the bucket Public.",
  },
  minio: {
    label: "MinIO",
    endpoint: "https://minio.example.com",
    region: "us-east-1",
    regionPlaceholder: "us-east-1",
    pathStyle: true,
    publicUrl: (b) => `https://minio.example.com/${b}`,
    keys: "Create an access key whose policy can read and write this bucket. The server must be reachable over HTTPS from the internet.",
    access: "Set the bucket's anonymous access to download (read-only).",
  },
  other: {
    label: "Other S3-compatible",
    endpoint: "https://s3.example.com",
    region: "",
    regionPlaceholder: "us-east-1",
    pathStyle: false,
    publicUrl: (b) => `https://cdn.example.com/${b}`,
    keys: "Create an access key with read and write access to this bucket.",
    access: "Make objects publicly readable and enter the base URL they're served from.",
  },
};

const SERVICE_LABELS = Object.fromEntries(
  Object.entries(SERVICES).map(([id, s]) => [id, s.label]),
) as Record<ServiceId, string>;

const JURISDICTION_LABELS: Record<Jurisdiction, string> = {
  default: "Default (automatic location)",
  eu: "European Union (EU)",
  fedramp: "FedRAMP",
};

/** Which service an S3 endpoint belongs to, for presets and labels. */
function serviceFor(endpoint: string | null): ServiceId {
  if (!endpoint) return "aws";
  const host = (() => {
    try {
      return new URL(endpoint).hostname;
    } catch {
      return endpoint;
    }
  })();
  if (host.endsWith("amazonaws.com")) return "aws";
  if (host.endsWith("backblazeb2.com")) return "b2";
  if (host.endsWith("digitaloceanspaces.com")) return "spaces";
  if (host.endsWith("wasabisys.com")) return "wasabi";
  if (host.endsWith("supabase.co")) return "supabase";
  return "other";
}

interface FormState {
  provider: Provider;
  service: ServiceId;
  accountId: string;
  jurisdiction: Jurisdiction;
  endpoint: string;
  region: string;
  forcePathStyle: boolean;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicUrl: string;
}

function formFrom(provider: Provider, saved: StorageSummary | null): FormState {
  const same = saved?.provider === provider ? saved : null;
  const service = provider === "S3" ? serviceFor(same?.endpoint ?? null) : "aws";
  return {
    provider,
    service,
    accountId: same?.accountId ?? "",
    jurisdiction: (same?.jurisdiction as Jurisdiction | null) ?? "default",
    endpoint: same?.endpoint ?? "",
    region: same && provider === "S3" ? same.region : SERVICES[service].region,
    forcePathStyle: same?.forcePathStyle ?? SERVICES[service].pathStyle,
    bucket: same?.bucket ?? "",
    accessKeyId: same?.accessKeyId ?? "",
    secretAccessKey: "",
    publicUrl: same?.publicUrl ?? "",
  };
}

/** What the server actions take: only the fields for the chosen provider. */
function toInput(f: FormState) {
  const common = {
    bucket: f.bucket,
    accessKeyId: f.accessKeyId,
    secretAccessKey: f.secretAccessKey || undefined,
    publicUrl: f.publicUrl,
  };
  return f.provider === "R2"
    ? { provider: "R2" as const, accountId: f.accountId, jurisdiction: f.jurisdiction, ...common }
    : {
        provider: "S3" as const,
        endpoint: f.endpoint,
        region: f.region,
        forcePathStyle: f.forcePathStyle,
        ...common,
      };
}

function corsPolicy(origin: string) {
  return JSON.stringify(
    [
      {
        AllowedOrigins: [origin],
        AllowedMethods: ["PUT"],
        AllowedHeaders: ["Content-Type"],
        MaxAgeSeconds: 3600,
      },
    ],
    null,
    2,
  );
}

function corsCommand(origin: string, bucket: string, endpoint: string) {
  const rules = JSON.stringify({
    CORSRules: [
      {
        AllowedOrigins: [origin],
        AllowedMethods: ["PUT"],
        AllowedHeaders: ["Content-Type"],
        MaxAgeSeconds: 3600,
      },
    ],
  });
  return `aws s3api put-bucket-cors --bucket ${bucket || "BUCKET"}${
    endpoint ? ` --endpoint-url ${endpoint}` : ""
  } --cors-configuration '${rules}'`;
}

const noSubscribe = () => () => {};
/** The app's origin, which the bucket's CORS policy has to allow. */
function useOrigin() {
  return useSyncExternalStore(
    noSubscribe,
    () => window.location.origin,
    () => "https://your-cue-address",
  );
}

async function copy(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success("Copied");
  } catch {
    toast.error("Couldn't copy. Select the text and copy it manually.");
  }
}

// ---------------------------------------------------------------------------
// The live test, shared by "Test connection" and "Test again"
// ---------------------------------------------------------------------------

type BrowserStatus = "pending" | "ok" | "fail" | "skip" | null;

interface RunState {
  running: boolean;
  result: StorageTestResult | null;
  browser: BrowserStatus;
  browserDetail?: string;
}

const IDLE: RunState = { running: false, result: null, browser: null };

/** All four checks passed: the bucket is safe to save. */
function passed(run: RunState) {
  return !run.running && !!run.result?.ok && run.browser === "ok";
}

function useStorageTest() {
  const [run, setRun] = useState<RunState>(IDLE);

  /**
   * Server checks first (write, public read, cleanup), then a real PUT from
   * this browser to a presigned URL, which is exactly what the composer does,
   * so a CORS policy that would block uploads shows up here, not mid-post.
   */
  async function start(
    serverCheck: () => Promise<StorageTestResult>,
    cleanupInput: unknown,
  ): Promise<boolean> {
    setRun({ running: true, result: null, browser: null });
    let result: StorageTestResult;
    try {
      result = await serverCheck();
    } catch {
      result = {
        ok: false,
        checks: [],
        error: "Couldn't reach Cue. Check your connection and try again.",
      };
    }
    if (!result.ok || !result.browserTest) {
      setRun({ running: false, result, browser: result.checks.length ? "skip" : null });
      return false;
    }

    setRun({ running: true, result, browser: "pending" });
    const { uploadUrl, key } = result.browserTest;
    const put = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "text/plain" },
      body: "cue browser upload check",
    }).catch(() => null);
    if (put?.ok) void cleanupStorageTest(cleanupInput, key);
    setRun({
      running: false,
      result,
      browser: put?.ok ? "ok" : "fail",
      browserDetail: put
        ? `The bucket answered ${put.status} to an upload from this browser.`
        : undefined,
    });
    return !!put?.ok;
  }

  return { run, start, reset: () => setRun(IDLE), setRun };
}

const CHECK_LABELS = {
  write: {
    title: "Write a file with these keys",
    sub: "Cue uploads a small test file to the bucket.",
  },
  public: {
    title: "Read it back from the public URL",
    sub: "Instagram, LinkedIn and YouTube fetch your media from here.",
  },
  browser: {
    title: "Upload straight from this browser",
    sub: "The composer sends files directly to the bucket, so its CORS policy must allow it.",
  },
  cleanup: {
    title: "Remove the test files",
    sub: "Nothing is left behind.",
  },
} as const;

function CheckIcon({ status }: { status: "ok" | "fail" | "warn" | "skip" | "pending" | null }) {
  if (status === "pending") return <Loader2 className="text-muted-foreground size-4 animate-spin" />;
  if (status === "ok") return <CheckCircle2 className="text-live size-4" />;
  if (status === "fail") return <XCircle className="text-destructive size-4" />;
  if (status === "warn") return <AlertTriangle className="text-standby-ink size-4" />;
  return <CircleDashed className="text-muted-foreground/60 size-4" />;
}

function TestResults({
  run,
  origin,
  form,
}: {
  run: RunState;
  origin: string;
  form: Pick<FormState, "provider" | "service" | "bucket" | "endpoint">;
}) {
  if (!run.running && !run.result) return null;
  const byId = new Map(run.result?.checks.map((c) => [c.id, c]));
  const rows = (["write", "public", "browser", "cleanup"] as const).map((id) => {
    if (id === "browser") {
      return {
        id,
        status: run.browser ?? (run.running ? "pending" : "skip"),
        detail:
          run.browser === "fail"
            ? (run.browserDetail ??
              `The bucket's CORS policy doesn't allow uploads from ${origin} yet. Add the policy below, then test again.`)
            : undefined,
      } as const;
    }
    const c = byId.get(id);
    return {
      id,
      status: c ? c.status : run.running ? "pending" : "skip",
      detail: c?.detail,
    } as const;
  });

  return (
    <div className="space-y-3" aria-live="polite">
      {run.result?.error && (
        <p className="border-destructive/30 bg-destructive/5 text-destructive rounded-xl border px-3 py-2.5 text-sm">
          {run.result.error}
        </p>
      )}
      {!run.result?.error && (
        <ol className="divide-border divide-y rounded-xl border">
          {rows.map((r) => (
            <li key={r.id} className="flex gap-3 px-3 py-3">
              <span className="mt-0.5 shrink-0">
                <CheckIcon status={r.status} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{CHECK_LABELS[r.id].title}</div>
                <div className="text-muted-foreground text-xs">{CHECK_LABELS[r.id].sub}</div>
                {r.detail && (
                  <p
                    className={cn(
                      "mt-1.5 text-[0.8125rem] break-words",
                      r.status === "warn" ? "text-standby-ink" : "text-destructive",
                    )}
                  >
                    {r.detail}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
      {run.browser === "fail" && <CorsHelp origin={origin} form={form} />}
    </div>
  );
}

function CorsHelp({
  origin,
  form,
}: {
  origin: string;
  form: Pick<FormState, "provider" | "service" | "bucket" | "endpoint">;
}) {
  const json = corsPolicy(origin);
  const where =
    form.provider === "R2"
      ? "In Cloudflare: R2, open the bucket, Settings, CORS Policy, Edit. Paste this and save."
      : form.service === "aws"
        ? "In the AWS console: S3, open the bucket, Permissions, Cross-origin resource sharing (CORS), Edit. Paste this and save."
        : "If your provider's console has a CORS editor, paste this there. If not, run the command below with the AWS CLI, signed in with these keys.";
  return (
    <div className="bg-muted/40 space-y-3 rounded-xl border p-3">
      <div>
        <div className="text-sm font-medium">Allow uploads from Cue</div>
        <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">{where}</p>
      </div>
      <CodeBlock value={json} label="Copy CORS policy" />
      {form.provider === "S3" && form.service !== "aws" && (
        <CodeBlock
          value={corsCommand(origin, form.bucket, form.endpoint)}
          label="Copy command"
        />
      )}
      <p className="text-muted-foreground text-xs">
        Changes can take a minute to apply. Then run the test again.
      </p>
    </div>
  );
}

function CodeBlock({ value, label }: { value: string; label: string }) {
  return (
    <div className="bg-card relative rounded-lg border">
      <pre className="max-h-80 overflow-auto p-3 pr-12 font-mono text-[0.75rem] leading-relaxed whitespace-pre-wrap break-all">
        {value}
      </pre>
      <Button
        variant="ghost"
        size="icon-sm"
        className="absolute top-1.5 right-1.5"
        onClick={() => copy(value)}
        aria-label={label}
        title={label}
      >
        <Copy />
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The section
// ---------------------------------------------------------------------------

type Mode = "view" | "pick" | "form";

export function StorageManager({
  summary,
  isAdmin,
}: {
  summary: StorageSummary | null;
  isAdmin: boolean;
}) {
  const [mode, setMode] = useState<Mode>("view");
  const [form, setForm] = useState<FormState>(() => formFrom("R2", summary));

  function choose(provider: Provider) {
    setForm(formFrom(provider, summary));
    setMode("form");
  }

  if (mode === "pick") {
    return <ProviderPicker onPick={choose} onCancel={() => setMode("view")} />;
  }
  if (mode === "form") {
    return (
      <StorageForm
        form={form}
        setForm={setForm}
        editing={summary?.provider === form.provider}
        onBack={() => setMode("pick")}
        onDone={() => setMode("view")}
      />
    );
  }
  return (
    <StorageStatus
      summary={summary}
      isAdmin={isAdmin}
      onConnect={() => setMode("pick")}
      onEdit={() => {
        setForm(formFrom(summary?.provider ?? "R2", summary));
        setMode("form");
      }}
    />
  );
}

function StorageStatus({
  summary,
  isAdmin,
  onConnect,
  onEdit,
}: {
  summary: StorageSummary | null;
  isAdmin: boolean;
  onConnect: () => void;
  onEdit: () => void;
}) {
  const router = useRouter();
  const origin = useOrigin();
  const { run, start } = useStorageTest();
  const [confirm, setConfirm] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!summary) {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-xl border p-4">
          <span className="bg-muted grid size-10 shrink-0 place-items-center rounded-xl">
            <HardDrive className="text-muted-foreground size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
              Cue&apos;s storage
              <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 font-mono text-[0.625rem] tracking-wider uppercase">
                Default
              </span>
            </div>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Images, videos and documents you upload are stored in Cue&apos;s
              Cloudflare R2 bucket. There&apos;s nothing to set up.
            </p>
          </div>
        </div>
        {isAdmin ? (
          <div className="bg-muted/40 flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center">
            <p className="text-muted-foreground flex-1 text-sm">
              Want uploads in your own bucket? Connect Cloudflare R2 or any
              S3-compatible storage. Until you do, Cue&apos;s storage is used.
            </p>
            <Button onClick={onConnect} className="shrink-0">
              <Database className="size-4" /> Connect your own bucket
            </Button>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            An admin can connect the workspace&apos;s own bucket.
          </p>
        )}
      </div>
    );
  }

  const service =
    summary.provider === "R2" ? "Cloudflare R2" : SERVICE_LABELS[serviceFor(summary.endpoint)];
  const where =
    summary.provider === "R2"
      ? summary.jurisdiction
        ? `${summary.jurisdiction.toUpperCase()} jurisdiction`
        : null
      : summary.endpoint
        ? new URL(summary.endpoint).host
        : summary.region;

  function retest() {
    void start(() => retestStorage(), null).then((ok) => {
      if (ok) {
        toast.success("Everything checks out");
        router.refresh();
      }
    });
  }

  function disconnect() {
    startTransition(async () => {
      try {
        await removeStorageConfig();
        setConfirm(false);
        toast.success("Back on Cue's storage");
        router.refresh();
      } catch {
        toast.error("Couldn't disconnect. Try again.");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border">
        <div className="flex items-start gap-3 p-4">
          <span className="bg-foreground text-background grid size-10 shrink-0 place-items-center rounded-xl">
            <Cloud className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium">
              <span className="truncate">{summary.bucket}</span>
              <span className="text-live-ink flex items-center gap-1.5 text-[0.6875rem] font-medium">
                <span className="tally text-live size-1.5" /> Connected
              </span>
            </div>
            <div className="text-muted-foreground mt-0.5 text-xs">
              {service}
              {where ? ` · ${where}` : ""}
            </div>
          </div>
        </div>
        <dl className="grid gap-x-6 gap-y-3 border-t px-4 py-3 text-sm sm:grid-cols-[auto_1fr]">
          <dt className="text-muted-foreground">Public URL</dt>
          <dd className="min-w-0 font-mono text-xs break-all sm:pt-0.5">{summary.publicUrl}</dd>
          <dt className="text-muted-foreground">Access key</dt>
          <dd className="min-w-0 font-mono text-xs break-all sm:pt-0.5">{summary.accessKeyId}</dd>
          <dt className="text-muted-foreground">Last verified</dt>
          <dd className="text-xs sm:pt-0.5" suppressHydrationWarning>
            {summary.verifiedAt
              ? formatDistanceToNow(new Date(summary.verifiedAt), { addSuffix: true })
              : "Never"}
          </dd>
        </dl>
        {isAdmin && (
          <div className="flex flex-wrap gap-2 border-t px-4 py-3">
            <Button variant="outline" size="sm" onClick={retest} disabled={run.running}>
              {run.running && <Loader2 className="animate-spin" />}
              Test again
            </Button>
            <Button variant="outline" size="sm" onClick={onEdit} disabled={run.running}>
              Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive ml-auto"
              onClick={() => setConfirm(true)}
              disabled={run.running}
            >
              Disconnect
            </Button>
          </div>
        )}
      </div>

      <TestResults
        run={run}
        origin={origin}
        form={{
          provider: summary.provider,
          service: summary.provider === "S3" ? serviceFor(summary.endpoint) : "aws",
          bucket: summary.bucket,
          endpoint: summary.endpoint ?? "",
        }}
      />

      <p className="text-muted-foreground text-xs leading-relaxed">
        New uploads go to this bucket. Files are served from the public URL,
        which is where Instagram, LinkedIn and YouTube fetch them when a post
        goes live.
      </p>

      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Go back to Cue&apos;s storage?</DialogTitle>
            <DialogDescription>
              New uploads will go to Cue&apos;s storage. Files already in{" "}
              {summary.bucket} stay there, and posts that use them still point
              at them, so keep the bucket public until those posts have gone
              out.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={pending} onClick={disconnect}>
              Disconnect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Steps({ at }: { at: 1 | 2 | 3 }) {
  const steps = ["Provider", "Bucket and keys", "Test and save"];
  return (
    <ol className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[0.6875rem] tracking-wider uppercase">
      {steps.map((s, i) => (
        <li
          key={s}
          className={cn(
            "flex items-center gap-1.5",
            i + 1 === at ? "text-foreground" : "text-muted-foreground",
          )}
          aria-current={i + 1 === at ? "step" : undefined}
        >
          <span
            className={cn(
              "grid size-4 place-items-center rounded-full text-[0.625rem]",
              i + 1 === at
                ? "bg-foreground text-background"
                : i + 1 < at
                  ? "bg-live/20 text-live-ink"
                  : "bg-muted",
            )}
          >
            {i + 1}
          </span>
          {s}
        </li>
      ))}
    </ol>
  );
}

function ProviderPicker({
  onPick,
  onCancel,
}: {
  onPick: (p: Provider) => void;
  onCancel: () => void;
}) {
  const options: { id: Provider; title: string; body: string; foot: string }[] = [
    {
      id: "R2",
      title: "Cloudflare R2",
      body: "No egress fees. You'll need your account ID, an R2 API token, and the bucket's public address.",
      foot: "r2.dev or a custom domain",
    },
    {
      id: "S3",
      title: "S3-compatible",
      body: "Any storage that speaks the S3 API. You'll need the endpoint, region, an access key, and the bucket's public address.",
      foot: "Amazon S3 · Backblaze B2 · DigitalOcean Spaces · Wasabi · Supabase · MinIO",
    },
  ];
  return (
    <div className="space-y-4">
      <Steps at={1} />
      <div>
        <h3 className="text-sm font-medium">Where should uploads go?</h3>
        <p className="text-muted-foreground mt-0.5 text-sm">
          Pick the kind of storage you&apos;re connecting. You can change it later.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => onPick(o.id)}
            className="group hover:border-foreground/30 focus-visible:ring-ring/30 bg-card flex flex-col gap-2 rounded-xl border p-4 text-left transition-colors outline-none focus-visible:ring-3"
          >
            <span className="flex items-center gap-2 text-sm font-medium">
              {o.id === "R2" ? <Cloud className="size-4" /> : <Database className="size-4" />}
              {o.title}
            </span>
            <span className="text-muted-foreground text-sm leading-relaxed">{o.body}</span>
            <span className="text-muted-foreground mt-auto pt-1 font-mono text-[0.625rem] tracking-wider uppercase">
              {o.foot}
            </span>
          </button>
        ))}
      </div>
      <Button variant="ghost" size="sm" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}

function Field({
  id,
  label,
  hint,
  className,
  children,
}: {
  id: string;
  label: string;
  hint?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("min-w-0 space-y-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-muted-foreground text-xs leading-relaxed">{hint}</p>}
    </div>
  );
}

function StorageForm({
  form,
  setForm,
  editing,
  onBack,
  onDone,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  editing: boolean;
  onBack: () => void;
  onDone: () => void;
}) {
  const router = useRouter();
  const origin = useOrigin();
  const { run, start, reset, setRun } = useStorageTest();
  const [saving, startSaving] = useTransition();
  const svc = SERVICES[form.service];
  const r2 = form.provider === "R2";

  // Any edit invalidates the last test: what's saved must be what passed.
  function update(patch: Partial<FormState>) {
    setForm((f) => ({ ...f, ...patch }));
    reset();
  }

  function pickService(id: ServiceId) {
    const next = SERVICES[id];
    update({
      service: id,
      endpoint: id === "aws" ? "" : form.service === "aws" ? "" : form.endpoint,
      region: next.region || (form.service === id ? form.region : ""),
      forcePathStyle: next.pathStyle,
    });
  }

  function test() {
    void start(() => testStorageConnection(toInput(form)), toInput(form));
  }

  function save() {
    startSaving(async () => {
      let result: StorageTestResult;
      try {
        result = await saveStorageConfig(toInput(form));
      } catch {
        result = { ok: false, checks: [], error: "Couldn't reach Cue. Try again." };
      }
      if (!result.ok) {
        // Something changed since the test; show what failed this time.
        setRun({ running: false, result, browser: result.checks.length ? "skip" : null });
        return;
      }
      toast.success(`Connected. New uploads go to ${form.bucket}.`);
      onDone();
      router.refresh();
    });
  }

  const publicExample = r2
    ? "https://pub-xxxxxxxx.r2.dev"
    : svc.publicUrl(form.bucket || "BUCKET", form.region);

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2">
          <ArrowLeft className="size-4" /> {editing ? "Change provider" : "Back"}
        </Button>
        <Steps at={passed(run) ? 3 : 2} />
        <div>
          <h3 className="text-sm font-medium">
            {editing ? "Edit" : "Connect"} {r2 ? "Cloudflare R2" : "S3-compatible storage"}
          </h3>
          <p className="text-muted-foreground mt-0.5 text-sm">
            Cue tests the bucket before saving, so a typo can&apos;t break
            uploads. Keys are encrypted and never shown again.
          </p>
        </div>
      </div>

      <details className="bg-muted/40 group rounded-xl border px-4 py-3 text-sm">
        <summary className="cursor-pointer font-medium select-none">
          How to set up {r2 ? "R2" : form.service === "other" ? "your bucket" : svc.label}
        </summary>
        <ol className="text-muted-foreground mt-3 list-decimal space-y-2 pl-5 leading-relaxed">
          {r2 ? (
            <>
              <li>In Cloudflare, open R2 and create a bucket (or use one you have).</li>
              <li>
                Open the bucket, Settings, Public access: turn on the r2.dev
                subdomain or connect a custom domain. That address is the
                public URL.
              </li>
              <li>
                R2, Manage API tokens, Create API token: Object Read &amp; Write,
                limited to this bucket. Copy the Access Key ID and Secret
                Access Key.
              </li>
              <li>Your account ID is on the R2 overview page.</li>
              <li>
                In the bucket&apos;s Settings, CORS Policy, allow uploads from{" "}
                <code className="bg-card rounded px-1 font-mono text-xs">{origin}</code>.
                The test below gives you the exact policy if it&apos;s missing.
              </li>
            </>
          ) : (
            <>
              <li>Create a bucket, or use one you have.</li>
              <li>{svc.keys}</li>
              <li>{svc.access} Instagram, LinkedIn and YouTube fetch media from this public address.</li>
              <li>
                Allow uploads from{" "}
                <code className="bg-card rounded px-1 font-mono text-xs">{origin}</code>{" "}
                in the bucket&apos;s CORS policy. The test below gives you the
                exact policy if it&apos;s missing.
              </li>
            </>
          )}
        </ol>
      </details>

      <div className="grid gap-4 sm:grid-cols-2">
        {r2 ? (
          <>
            <Field id="st-account" label="Account ID" hint="32 characters, on the R2 overview page.">
              <Input
                id="st-account"
                value={form.accountId}
                onChange={(e) => update({ accountId: e.target.value })}
                placeholder="e.g. 3f9c0a6d…"
                autoComplete="off"
                spellCheck={false}
                className="font-mono"
              />
            </Field>
            <Field id="st-jurisdiction" label="Jurisdiction" hint="Only change this if the bucket was created in one.">
              <Select
                value={form.jurisdiction}
                items={JURISDICTION_LABELS}
                onValueChange={(v) => update({ jurisdiction: v as Jurisdiction })}
              >
                <SelectTrigger id="st-jurisdiction" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(JURISDICTION_LABELS) as Jurisdiction[]).map((j) => (
                    <SelectItem key={j} value={j}>
                      {JURISDICTION_LABELS[j]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </>
        ) : (
          <>
            <Field id="st-service" label="Service" className="sm:col-span-2">
              <Select
                value={form.service}
                items={SERVICE_LABELS}
                onValueChange={(v) => pickService(v as ServiceId)}
              >
                <SelectTrigger id="st-service" className="w-full sm:w-72">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(SERVICES) as ServiceId[]).map((id) => (
                    <SelectItem key={id} value={id}>
                      {SERVICES[id].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field
              id="st-endpoint"
              label="Endpoint"
              hint={
                form.service === "aws"
                  ? "Leave blank for Amazon S3."
                  : "The S3 API address, starting with https://"
              }
            >
              <Input
                id="st-endpoint"
                value={form.endpoint}
                onChange={(e) => update({ endpoint: e.target.value })}
                placeholder={svc.endpoint || "Leave blank for Amazon S3"}
                autoComplete="off"
                spellCheck={false}
                inputMode="url"
              />
            </Field>
            <Field id="st-region" label="Region">
              <Input
                id="st-region"
                value={form.region}
                onChange={(e) => update({ region: e.target.value })}
                placeholder={svc.regionPlaceholder}
                autoComplete="off"
                spellCheck={false}
              />
            </Field>
          </>
        )}

        <Field id="st-bucket" label="Bucket name">
          <Input
            id="st-bucket"
            value={form.bucket}
            onChange={(e) => update({ bucket: e.target.value })}
            placeholder="e.g. agency-media"
            autoComplete="off"
            spellCheck={false}
          />
        </Field>
        <Field
          id="st-public"
          label="Public URL"
          hint="The address files in this bucket are publicly served from."
        >
          <Input
            id="st-public"
            value={form.publicUrl}
            onChange={(e) => update({ publicUrl: e.target.value })}
            placeholder={publicExample}
            autoComplete="off"
            spellCheck={false}
            inputMode="url"
          />
        </Field>
        <Field id="st-key" label="Access key ID">
          <Input
            id="st-key"
            value={form.accessKeyId}
            onChange={(e) => update({ accessKeyId: e.target.value })}
            autoComplete="off"
            spellCheck={false}
            className="font-mono"
          />
        </Field>
        <Field
          id="st-secret"
          label="Secret access key"
          hint={editing ? "Leave blank to keep the saved secret." : undefined}
        >
          <Input
            id="st-secret"
            type="password"
            value={form.secretAccessKey}
            onChange={(e) => update({ secretAccessKey: e.target.value })}
            placeholder={editing ? "••••••••••••" : undefined}
            autoComplete="new-password"
            spellCheck={false}
            className="font-mono"
          />
        </Field>

        {!r2 && (
          <label className="flex items-start gap-3 sm:col-span-2" htmlFor="st-path">
            <Switch
              id="st-path"
              checked={form.forcePathStyle}
              onCheckedChange={(v) => update({ forcePathStyle: v })}
              className="mt-0.5"
            />
            <span className="text-sm">
              <span className="font-medium">Path-style addressing</span>
              <span className="text-muted-foreground block text-xs leading-relaxed">
                Sends requests to endpoint/bucket rather than bucket.endpoint.
                MinIO, Supabase and most self-hosted servers need this on.
              </span>
            </span>
          </label>
        )}
      </div>

      <div className="space-y-3 border-t pt-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">Test and save</div>
            <p className="text-muted-foreground text-xs">
              Runs four quick checks against the bucket. Save unlocks when they pass.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant={passed(run) ? "outline" : "default"}
              onClick={test}
              disabled={run.running || saving}
            >
              {run.running && <Loader2 className="animate-spin" />}
              {run.result ? "Test again" : "Test connection"}
            </Button>
            <Button
              variant={passed(run) ? "default" : "outline"}
              onClick={save}
              disabled={!passed(run) || saving}
            >
              {saving && <Loader2 className="animate-spin" />}
              Save and use
            </Button>
          </div>
        </div>
        <TestResults run={run} origin={origin} form={form} />
      </div>
    </div>
  );
}
