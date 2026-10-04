// Sets a new version everywhere it's written (package.json, which tauri.conf.json reads, Cargo.toml and Cargo.lock)
// and adds a dated section for it at the top of CHANGELOG.md, ready for its release notes. The build stops until the
// section has at least one bullet.
//
//   node scripts/bump-version.ts <version>      (pnpm bump 1.2.0, pnpm bump 1.2.0-beta.1)
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compareVersions, parseChangelog } from "./changelog.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const path = (file: string) => resolve(root, file);

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/.test(version))
  fail("Give the new version, such as 1.2.0 or 1.2.0-beta.1.");

const current: string = JSON.parse(readFileSync(path("package.json"), "utf8")).version;
if (compareVersions(version, current) <= 0) fail(`${version} isn't newer than the current version, ${current}.`);

// Each file is edited as text, so the rest of it stays exactly as it was. Nothing is written until every file has
// been found to have its version where expected.
const name = readFileSync(path("src-tauri/Cargo.toml"), "utf8").match(/^name\s*=\s*"([^"]+)"/m)?.[1];
if (!name) fail("Couldn't find the package name in src-tauri/Cargo.toml.");
const edits = [
  edited("package.json", /^(\s*"version":\s*")[^"]+(")/m),
  edited("src-tauri/Cargo.toml", /^(version\s*=\s*")[^"]+(")/m),
  edited("src-tauri/Cargo.lock", new RegExp(`^(name = "${name}"\\nversion = ")[^"]+(")`, "m")),
];

const changelog = readFileSync(path("CHANGELOG.md"), "utf8");
const releases = parseChangelog(changelog);
if (!releases.some((release) => release.version === version)) {
  const at = changelog.search(/^## /m);
  const section = `## ${version} - ${today()}\n\n`;
  const text =
    at === -1 ? `${changelog.trimEnd()}\n\n${section}` : changelog.slice(0, at) + section + changelog.slice(at);
  edits.push(["CHANGELOG.md", text]);
}
for (const [file, text] of edits) writeFileSync(path(file), text);

console.log(`\nVersion ${current} -> ${version}.\n`);
console.log("Write its release notes in CHANGELOG.md, following docs/release-notes.md.");
const betas = releases.filter((release) => release.version.startsWith(`${version}-`)).map((release) => release.version);
if (!version.includes("-") && betas.length > 0) {
  console.log(`Write them fresh for someone coming from the last stable version, then delete ${betas.join(", ")}.`);
}
console.log("Then commit, push and run pnpm release.\n");

function edited(file: string, pattern: RegExp): [string, string] {
  const text = readFileSync(path(file), "utf8");
  if (!pattern.test(text)) fail(`Couldn't find the version in ${file}.`);
  return [file, text.replace(pattern, `$1${version}$2`)];
}

function today() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function fail(problem: string): never {
  console.error(`\n${problem}\n`);
  process.exit(1);
}
