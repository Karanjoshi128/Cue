import { getScopeClientId } from "@/lib/client-scope";
import { getBioEditor } from "@/lib/bio/data";
import { BioEditorView } from "@/components/bio/bio-editor";

export const dynamic = "force-dynamic";

export default async function BioPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  const [{ client }, scopeClientId] = await Promise.all([searchParams, getScopeClientId()]);
  const data = await getBioEditor(scopeClientId, client);
  return <BioEditorView data={data} />;
}
