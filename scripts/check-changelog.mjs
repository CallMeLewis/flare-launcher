// Stops a build unless CHANGELOG.md has a section for the version in package.json with at least one "- " bullet. The
// app bundles that section to show the running version's notes in Settings > About, and the release script puts it
// in the update feed.
//
//   node scripts/check-changelog.mjs
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { notesFor } from "./changelog.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { version } = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));

const notes = notesFor(readFileSync(resolve(root, "CHANGELOG.md"), "utf8"), version);
if (!notes) fail(`CHANGELOG.md has no "## ${version}" section.`);
if (notes.length === 0) fail(`The "## ${version}" section of CHANGELOG.md has no "- " bullet points.`);
console.log(`Release notes for ${version}:\n\n${notes.map((item) => `- ${item}`).join("\n")}\n`);

function fail(problem) {
  console.error(`\n${problem}\nAdd release notes for ${version} (see docs/release-notes.md) before building.\n`);
  process.exit(1);
}
