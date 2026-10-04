// Reads CHANGELOG.md, the one place release notes live. A line "## <version>", optionally followed by " - <date>",
// starts that version's section, and the section's "- " lines are its notes. Everything else is ignored, so the file
// can have an introduction. Used by the build check, the release script and the app build. The download page
// keeps a copy of the parser, so keep the file's format the same.

export interface Release {
  version: string;
  date: string | null;
  items: string[];
}

/** Every version in the file, in file order (newest first). */
export function parseChangelog(text: string): Release[] {
  const releases: Release[] = [];
  for (const line of text.split(/\r?\n/)) {
    const heading = line.match(/^## +(\S+)(?: +- +(\S+))?\s*$/);
    if (heading) releases.push({ version: heading[1], date: heading[2] ?? null, items: [] });
    else if (line.startsWith("- ")) {
      const item = line.slice(2).trim();
      if (item) releases.at(-1)?.items.push(item);
    }
  }
  return releases;
}

/** One version's notes, or null when the file has no section for it. */
export function notesFor(text: string, version: string): string[] | null {
  return parseChangelog(text).find((release) => release.version === version)?.items ?? null;
}

/** Semantic version order: 1.2.0-beta.1 < 1.2.0-beta.2 < 1.2.0 < 1.2.1. */
export function compareVersions(a: string, b: string): number {
  const [aCore, aPre] = a.split("-");
  const [bCore, bPre] = b.split("-");
  const core = compareParts(aCore.split("."), bCore.split("."));
  if (core !== 0 || aPre === bPre) return core;
  if (!aPre || !bPre) return aPre ? -1 : 1;
  return compareParts(aPre.split("."), bPre.split("."));
}

function compareParts(a: string[], b: string[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] === undefined || b[i] === undefined) return a[i] === undefined ? -1 : 1;
    const numeric = /^\d+$/.test(a[i]) && /^\d+$/.test(b[i]);
    const order = numeric ? Number(a[i]) - Number(b[i]) : a[i].localeCompare(b[i]);
    if (order !== 0) return Math.sign(order);
  }
  return 0;
}
