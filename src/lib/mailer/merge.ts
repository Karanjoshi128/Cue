/*
 * Merge fields: {{ first_name | there }} in a subject or body is replaced with
 * the contact's value, or the fallback after "|" when it's blank. Unknown or
 * empty fields with no fallback disappear rather than leaking "{{x}}".
 *
 * Values are HTML-escaped in bodies (imported spreadsheet cells must not be
 * able to inject markup) and left as plain text in subjects.
 *
 * Shared by the preview in the browser and the sender, so what you preview
 * is what gets sent.
 */

export type MergeVars = Record<string, string>;

const TOKEN = /\{\{\s*([a-zA-Z0-9_]+)\s*(?:\|\s*([^}]*?)\s*)?\}\}/g;

export const BUILT_IN_FIELDS = ["first_name", "name", "email", "company"] as const;

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Lowercase snake_case, so "First Name" and "first_name" are the same field. */
export function fieldKey(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

/** The values a contact brings to an email. Extra fields win over built-ins of the same name. */
export function contactVars(c: {
  email: string;
  name?: string | null;
  company?: string | null;
  fields?: unknown;
}): MergeVars {
  const name = (c.name ?? "").trim();
  const vars: MergeVars = {
    email: c.email,
    name,
    first_name: name.split(/\s+/)[0] ?? "",
    company: (c.company ?? "").trim(),
  };
  if (c.fields && typeof c.fields === "object" && !Array.isArray(c.fields)) {
    for (const [k, v] of Object.entries(c.fields as Record<string, unknown>)) {
      if (v === null || v === undefined) continue;
      vars[fieldKey(k)] = String(v);
    }
  }
  return vars;
}

export function mergeText(template: string, vars: MergeVars): string {
  return template.replace(TOKEN, (_, key: string, fallback?: string) => {
    const v = vars[key.toLowerCase()]?.trim();
    return v ? v : (fallback ?? "");
  });
}

export function mergeHtml(template: string, vars: MergeVars): string {
  return template.replace(TOKEN, (_, key: string, fallback?: string) => {
    const v = vars[key.toLowerCase()]?.trim();
    // The fallback is written by the admin in the template, so it's already HTML.
    return v ? escapeHtml(v) : (fallback ?? "");
  });
}

/** Field names used in a template, for warnings about fields no contact has. */
export function fieldsUsed(...templates: string[]): string[] {
  const out = new Set<string>();
  for (const t of templates) for (const m of t.matchAll(TOKEN)) out.add(m[1].toLowerCase());
  return [...out];
}

/** Sample values for previews. */
export const SAMPLE_VARS: MergeVars = {
  email: "priya@example.com",
  name: "Priya Sharma",
  first_name: "Priya",
  company: "Sunmeadow Organics",
};
