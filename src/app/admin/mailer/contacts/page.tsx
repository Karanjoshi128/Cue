import { getContactsPage } from "@/lib/mailer/data";
import { Empty, FilterTabs, Pager, Panel, SearchForm, qs } from "@/components/admin/admin-ui";
import { AddContactsDialog, ContactsTable, ImportCsvDialog } from "@/components/admin/mailer/contact-controls";

export const metadata = { title: "Contacts" };

export default async function MailerContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tag?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const q = sp.q?.trim().slice(0, 100);
  const tag = sp.tag?.trim().slice(0, 40) || undefined;
  const { contacts, total, all, tags } = await getContactsPage({ q, tag, page });
  const tagNames = tags.map((t) => t.tag);

  return (
    <Panel
      title="Contacts"
      description={`${all.toLocaleString()} people. Tags make the groups you send campaigns to.`}
      actions={
        <>
          <AddContactsDialog tagSuggestions={tagNames} />
          <ImportCsvDialog tagSuggestions={tagNames} />
        </>
      }
      flush
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-5">
        <FilterTabs
          active={tag ?? "all"}
          items={[
            { key: "all", label: "Everyone", href: qs("/admin/mailer/contacts", { q }), count: all },
            ...tags.map((t) => ({
              key: t.tag,
              label: t.tag,
              href: qs("/admin/mailer/contacts", { q, tag: t.tag }),
              count: t.count,
            })),
          ]}
        />
        <SearchForm placeholder="Search email, name or company" q={q} hidden={{ tag }} />
      </div>
      {contacts.length === 0 ? (
        <Empty>
          {all === 0
            ? "No contacts yet. Add people by hand, or import a CSV saved from Excel or Google Sheets."
            : "Nobody matches that."}
        </Empty>
      ) : (
        <>
          <ContactsTable
            tagSuggestions={tagNames}
            contacts={contacts.map((c) => ({
              id: c.id,
              email: c.email,
              name: c.name,
              company: c.company,
              tags: c.tags,
              fieldCount: c.fields && typeof c.fields === "object" ? Object.keys(c.fields).length : 0,
              source: c.source,
              suppressed: c.suppressed,
              createdAt: c.createdAt.toISOString(),
            }))}
          />
          <Pager page={page} total={total} href={(p) => qs("/admin/mailer/contacts", { q, tag, page: p })} />
        </>
      )}
    </Panel>
  );
}
