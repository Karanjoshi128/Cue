/*
 * Checks the help guides hang together: unique slugs and section ids, every
 * related guide and every /help link points somewhere real, screenshot ids
 * are unique, and every listed screenshot file exists.
 *
 *   pnpm help:check
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { HELP_GROUPS, HELP_GUIDES, getGuide } from "../src/lib/help";
import { HELP_SHOTS } from "../src/lib/help/shots.generated";

const problems: string[] = [];
const fail = (msg: string) => problems.push(msg);

const slugs = new Set<string>();
const shotIds = new Set<string>();

for (const g of HELP_GUIDES) {
  if (slugs.has(g.slug)) fail(`duplicate slug: ${g.slug}`);
  slugs.add(g.slug);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(g.slug)) fail(`${g.slug}: slug must be kebab-case`);
  if (!HELP_GROUPS.some((x) => x.key === g.group)) fail(`${g.slug}: unknown group ${g.group}`);
  if (g.summary.length > 200) fail(`${g.slug}: summary is ${g.summary.length} chars (keep it under 200 for search results)`);

  const ids = new Set<string>();
  for (const s of g.sections) {
    if (ids.has(s.id)) fail(`${g.slug}: duplicate section id ${s.id}`);
    ids.add(s.id);
    for (const shot of [s.shot, ...(s.steps ?? []).map((st) => st.shot)]) {
      if (!shot) continue;
      if (shotIds.has(shot.id)) fail(`duplicate screenshot id: ${shot.id}`);
      shotIds.add(shot.id);
    }
  }
  for (const r of g.related ?? []) if (!getGuide(r)) fail(`${g.slug}: related guide "${r}" doesn't exist`);
}

// Every /help/<slug>(#anchor) link in any text field.
const LINK = /\]\((\/help[^)]*)\)/g;
for (const g of HELP_GUIDES) {
  const texts = [
    g.summary,
    ...g.sections.flatMap((s) => [
      s.intro ?? "",
      ...(s.steps ?? []).map((x) => x.text),
      ...(s.points ?? []),
      ...(s.tips ?? []),
      ...(s.warnings ?? []),
      ...(s.faq ?? []).flatMap((f) => [f.q, f.a]),
      ...(s.table?.rows.flat() ?? []),
    ]),
  ];
  for (const t of texts) {
    for (const m of t.matchAll(LINK)) {
      const [pathPart, anchor] = m[1].split("#");
      const slug = pathPart.replace(/^\/help\/?/, "");
      if (!slug) continue;
      const target = getGuide(slug);
      if (!target) fail(`${g.slug}: link to missing guide ${m[1]}`);
      else if (anchor && !target.sections.some((s) => s.id === anchor))
        fail(`${g.slug}: link to missing section ${m[1]}`);
    }
    if ((t.match(/\*\*/g)?.length ?? 0) % 2) fail(`${g.slug}: unbalanced ** in "${t.slice(0, 60)}…"`);
  }
}

for (const id of Object.keys(HELP_SHOTS)) {
  if (!existsSync(path.join("public", "help", `${id}.png`))) fail(`listed screenshot missing: public/help/${id}.png`);
  if (!shotIds.has(id)) fail(`listed screenshot ${id} isn't used by any step`);
}

if (problems.length) {
  console.error(`Help check found ${problems.length} problem(s):\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log(
  `Help OK: ${HELP_GUIDES.length} guides in ${HELP_GROUPS.length} topics, ${shotIds.size} screenshots defined, ${Object.keys(HELP_SHOTS).length} taken.`,
);
