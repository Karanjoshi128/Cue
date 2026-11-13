/*
 * Prints every screenshot defined in the help guides as JSON, for
 * scripts/help-screenshots.py. Run through `pnpm help:shots`.
 */
import { HELP_GUIDES } from "../src/lib/help";
import type { HelpShot } from "../src/lib/help/types";

const shots: (HelpShot & { guide: string })[] = [];
for (const g of HELP_GUIDES) {
  for (const s of g.sections) {
    for (const shot of [s.shot, ...(s.steps ?? []).map((st) => st.shot)]) {
      if (shot) shots.push({ ...shot, guide: g.slug });
    }
  }
}
process.stdout.write(JSON.stringify(shots));
