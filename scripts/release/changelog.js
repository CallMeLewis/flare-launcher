// Reads CHANGELOG.md, the one place release notes live. A line "## <version>", optionally followed by " - <date>",
// starts that version's section, and the section's "- " lines are its notes. Any other "## " line is a mistake, and
// stops whatever is reading the file rather than adding its notes to the version above. Everything else is ignored, so
// the file can have an introduction. Used by the apps' build checks, release scripts and builds.

/** @typedef {import("./changelog.d.ts").Release} Release */

/**
 * Every version in the file, in file order (newest first).
 * @param {string} text
 * @returns {Release[]}
 */
export function parseChangelog(text) {
  /** @type {Release[]} */
  const releases = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("## ")) {
      const heading = line.match(/^## +(\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?)(?: +- +(\d{4}-\d{2}-\d{2}))?\s*$/);
      if (!heading) {
        throw new Error(`CHANGELOG.md: "${line}" isn't a version heading. Write it like "## 1.2.0 - 2026-11-14".`);
      }
      releases.push({ version: heading[1], date: heading[2] ?? null, items: [] });
    } else if (line.startsWith("- ")) {
      const item = line.slice(2).trim();
      if (item) releases.at(-1)?.items.push(item);
    }
  }
  return releases;
}

/**
 * Why a version can't be released, if it can't. The update channels are stable and beta, so a pre-release has to be a
 * beta, like 1.2.0-beta.1. Numbers have no leading zeros, which the app's version parser refuses.
 * @param {string} version
 * @param {string} app The app's name, for the message.
 * @returns {string | null}
 */
export function versionProblem(version, app) {
  const number = "(0|[1-9]\\d*)";
  if (new RegExp(`^${number}\\.${number}\\.${number}(-beta(\\.${number})?)?$`).test(version)) return null;
  return `${version} isn't a version ${app} can be released as. Use one like 1.2.0, or 1.2.0-beta.1 for a beta.`;
}

/**
 * One version's notes, or null when the file has no section for it.
 * @param {string} text
 * @param {string} version
 * @returns {string[] | null}
 */
export function notesFor(text, version) {
  return parseChangelog(text).find((release) => release.version === version)?.items ?? null;
}

/**
 * Semantic version order: 1.2.0-beta.1 < 1.2.0-beta.2 < 1.2.0 < 1.2.1.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function compareVersions(a, b) {
  const [aCore, aPre] = a.split("-");
  const [bCore, bPre] = b.split("-");
  const core = compareParts(aCore.split("."), bCore.split("."));
  if (core !== 0 || aPre === bPre) return core;
  if (!aPre || !bPre) return aPre ? -1 : 1;
  return compareParts(aPre.split("."), bPre.split("."));
}

/**
 * @param {string[]} a
 * @param {string[]} b
 */
function compareParts(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] === undefined || b[i] === undefined) return a[i] === undefined ? -1 : 1;
    const numeric = /^\d+$/.test(a[i]) && /^\d+$/.test(b[i]);
    const order = numeric ? Number(a[i]) - Number(b[i]) : a[i].localeCompare(b[i]);
    if (order !== 0) return Math.sign(order);
  }
  return 0;
}
