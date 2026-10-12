import Link from "next/link";
import { listStorageConfigs } from "@/lib/admin-data";
import { adminRemoveStorage } from "@/lib/admin-actions";
import { ActionButton, RetestStorageButton } from "@/components/admin/admin-controls";
import { AdminHeader, Ago, Empty, Mono, Panel, Pill, Table, Td, Th } from "@/components/admin/admin-ui";

export const metadata = { title: "Storage" };

export default async function AdminStoragePage() {
  const rows = await listStorageConfigs();
  return (
    <>
      <AdminHeader
        eyebrow="Media"
        title="Storage"
        description="Workspaces that keep their media in their own bucket. Everyone else uses Cue's R2 bucket. Re-test runs the server checks: write, public read and cleanup."
      />
      <Panel flush>
        {rows.length === 0 ? (
          <Empty>No workspace has connected its own bucket.</Empty>
        ) : (
          <Table className="min-w-[960px]">
            <thead>
              <tr>
                <Th>Workspace</Th>
                <Th>Bucket</Th>
                <Th>Public URL</Th>
                <Th>Last verified</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.workspace.id}>
                  <Td>
                    <Link href={`/admin/workspaces/${s.workspace.id}`} className="font-medium underline-offset-4 hover:underline">
                      {s.workspace.name}
                    </Link>
                    {s.workspace.disabledFeatures.includes("custom_storage") && (
                      <div className="mt-1"><Pill tone="warn">Switched off</Pill></div>
                    )}
                  </Td>
                  <Td>
                    <div>{s.provider === "R2" ? "Cloudflare R2" : "S3-compatible"}</div>
                    <Mono className="text-muted-foreground">
                      {s.bucket}
                      {s.endpoint ? ` @ ${new URL(s.endpoint).host}` : s.provider === "S3" ? ` @ AWS ${s.region}` : ""}
                    </Mono>
                  </Td>
                  <Td className="max-w-72 break-all"><Mono>{s.publicUrl}</Mono></Td>
                  <Td><Ago date={s.verifiedAt} /></Td>
                  <Td className="text-right">
                    <span className="inline-flex flex-wrap items-start justify-end gap-1.5">
                      <RetestStorageButton workspaceId={s.workspace.id} />
                      <ActionButton
                        label="Disconnect"
                        variant="ghost"
                        destructive
                        action={adminRemoveStorage.bind(null, s.workspace.id)}
                        title={`Disconnect ${s.workspace.name}'s bucket?`}
                        description="New uploads go to Cue's storage. Existing files stay in their bucket and posts keep pointing at them."
                        reason="required"
                      />
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>
    </>
  );
}
