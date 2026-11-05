/*
 * Reading contact lists in the browser: CSV files (as saved from Excel or
 * Google Sheets) and pasted text. Nothing here touches the network.
 */

/** Splits CSV text into rows of cells. Handles quotes, "" escapes, line breaks inside quotes, a BOM, and , ; or tab. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.slice(0, src.search(/\r?\n/) === -1 ? undefined : src.search(/\r?\n/));
  const delim = [",", ";", "\t"]
    .map((d) => ({ d, n: firstLine.split(d).length }))
    .sort((a, b) => b.n - a.n)[0].d;

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"' && cell === "") quoted = true;
    else if (ch === delim) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ""));
}

const EMAIL = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[a-z]{2,}$/i;
export const looksLikeEmail = (s: string) => EMAIL.test(s.trim());

export interface ColumnGuess {
  email: number;
  name: number | null;
  company: number | null;
}

/** Which columns hold the email, name and company: by header name first, then by content. */
export function guessColumns(header: string[], sample: string[][]): ColumnGuess {
  const h = header.map((x) => x.toLowerCase().replace(/[^a-z]/g, ""));
  const find = (...names: string[]) => {
    const i = h.findIndex((x) => names.includes(x));
    return i === -1 ? null : i;
  };
  let email = find("email", "emailaddress", "mail", "emailid", "eaddress");
  if (email === null) {
    let best = -1;
    let bestScore = 0;
    for (let c = 0; c < header.length; c++) {
      const score = sample.filter((r) => looksLikeEmail(r[c] ?? "")).length / Math.max(1, sample.length);
      if (score > bestScore) {
        best = c;
        bestScore = score;
      }
    }
    email = bestScore >= 0.6 ? best : 0;
  }
  return {
    email,
    name: find("name", "fullname", "contactname", "firstname", "contact"),
    company: find("company", "companyname", "organisation", "organization", "business", "brand"),
  };
}

/** Whether the first row is a header (no email address in it) or already data. */
export function hasHeaderRow(rows: string[][]): boolean {
  return rows.length > 0 && !rows[0].some(looksLikeEmail);
}

/**
 * Pasted lines: "a@b.com", "Name <a@b.com>", "Name, a@b.com" or
 * "a@b.com, Name". One person per line.
 */
export function parsePasted(text: string): { email: string; name?: string }[] {
  const out: { email: string; name?: string }[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const angle = /^(.*)<([^>]+)>\s*$/.exec(line);
    if (angle) {
      out.push({ email: angle[2].trim(), name: angle[1].replace(/["']/g, "").trim() || undefined });
      continue;
    }
    const parts = line.split(/[,;\t]/).map((p) => p.trim()).filter(Boolean);
    const e = parts.find(looksLikeEmail);
    if (!e) {
      out.push({ email: line });
      continue;
    }
    const name = parts.filter((p) => p !== e).join(" ").trim();
    out.push({ email: e, name: name || undefined });
  }
  return out;
}
