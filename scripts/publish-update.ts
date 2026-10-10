// Publishes releases to GitHub. The builds are made and published by the Release workflow
// (.github/workflows/release.yml), which runs when a v<version> tag is pushed.
//
//   node scripts/publish-update.ts release           (pnpm release) check the version is ready, tag the commit
//                                                    v<version> and push the tag, which starts the workflow
//   node scripts/publish-update.ts publish           (the workflow) sign the builds, publish them as the GitHub release
//                                                    v<version>, then update the channel file on the update feed (needs
//                                                    `pnpm exec wrangler login`, or a Cloudflare API token in CI)
//   node scripts/publish-update.ts feed <dir> [url]  sign local builds and write a feed to <dir> instead of
//                                                    publishing, for testing; [url] is where <dir> will be served
//   node scripts/publish-update.ts check             (CI) go through publishing as far as it can without the signing
//                                                    key or uploading: find the builds, read the notes, sign with a
//                                                    throwaway key and write the feed and the GitHub release notes
//   node scripts/publish-update.ts keygen            create the signing key (once) and print its public key
//
// The update feed is on Cloudflare R2, at https://updates.darkzone.dev/dayz-server-launcher/: the app's stable channel
// reads latest.json and its beta channel beta.json. A stable release is also published as beta.json when it is newer
// than the latest beta. Each channel file points at the builds attached to that version's GitHub release.
//
// Every release carries every build, so no player is left with a feed that has nothing for them. Each is signed with
// the private key (a repository secret in CI), and the signature is bound to the version. The app refuses an update
// whose signature does not match the public key in src-tauri/tauri.conf.json or whose signed version differs from the
// one the feed announces, so a tampered feed cannot push another installer.
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compareVersions, notesFor } from "./changelog.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// In CI the key comes from the TAURI_SIGNING_PRIVATE_KEY secret, which the Tauri CLI reads itself.
const keyFromEnv = Boolean(process.env.TAURI_SIGNING_PRIVATE_KEY);
const keyPath = process.env.DZSL_UPDATE_SIGNING_KEY ?? join(homedir(), ".dayz-server-launcher", "update-signing-key");
const repo = process.env.GITHUB_REPOSITORY ?? "CallMeLewis/flare-launcher";
// The R2 bucket behind https://updates.darkzone.dev. Must match FEED_URL in src-tauri/src/updater.rs. Named after the
// launcher's first name, DayZ Server Launcher, and kept: installed copies check this address for updates.
const r2Bucket = process.env.DZSL_R2_BUCKET ?? "darkzone-updates";
const r2Prefix = "dayz-server-launcher";
const feedUrl = `https://updates.darkzone.dev/${r2Prefix}/`;
// Run through Node rather than the .bin shim, which on Windows is a .cmd that needs a shell, and a shell drops empty
// arguments and splits ones with spaces.
const tauri = join(root, "node_modules", "@tauri-apps", "cli", "tauri.js");
const wrangler = join(root, "node_modules", "wrangler", "bin", "wrangler.js");
const target = join(root, "src-tauri", "target");
const linuxBundles = join(target, "linux", "release", "bundle");

/** What each release ships. `platform` is the updater's key for it; `paths` are where Tauri may have built it. */
interface Build {
  platform: string;
  paths: (product: string, version: string) => string[];
  uploadName: (version: string) => string;
  buildWith: string;
}

/** A version ready to publish: its notes as "- " lines, and every build signed. */
interface Release {
  version: string;
  notes: string;
  builds: { platform: string; file: string; uploadName: string; signature: string }[];
  prerelease: boolean;
}

/** The parts of src-tauri/tauri.conf.json used here. */
interface TauriConfig {
  productName: string;
  plugins?: { updater?: { pubkey?: string } };
}

const BUILDS: Build[] = [
  {
    platform: "windows-x86_64",
    paths: (product, version) =>
      ["x86_64-pc-windows-msvc/release", "release"].map((dir) =>
        join(target, dir, "bundle", "nsis", `${product}_${version}_x64-setup.exe`),
      ),
    uploadName: (version) => `Flare-Launcher-Setup-${version}.exe`,
    buildWith: "pnpm dist:cross (pnpm dist on Windows)",
  },
  // The Linux builds come from the Ubuntu 22.04 container (scripts/build-linux.ts), so they run on older systems too.
  // Each install updates itself in its own format: the launcher looks for its own format's entry in the feed.
  {
    platform: "linux-x86_64-appimage",
    paths: (product, version) => [join(linuxBundles, "appimage", `${product}_${version}_amd64.AppImage`)],
    uploadName: (version) => `Flare-Launcher-${version}.AppImage`,
    buildWith: "pnpm dist:linux (on Linux, needs podman)",
  },
  {
    platform: "linux-x86_64-deb",
    paths: (product, version) => [join(linuxBundles, "deb", `${product}_${version}_amd64.deb`)],
    uploadName: (version) => `Flare-Launcher-${version}-amd64.deb`,
    buildWith: "pnpm dist:linux (on Linux, needs podman)",
  },
  {
    platform: "linux-x86_64-rpm",
    paths: (product, version) => [join(linuxBundles, "rpm", `${product}-${version}-1.x86_64.rpm`)],
    uploadName: (version) => `Flare-Launcher-${version}.x86_64.rpm`,
    buildWith: "pnpm dist:linux (on Linux, needs podman)",
  },
];

const [command = "release", ...args] = process.argv.slice(2);

try {
  if (command === "keygen") keygen();
  else if (command === "feed") {
    const [dir, url = "http://127.0.0.1:8765/"] = args;
    if (!dir) throw new Error("Usage: node scripts/publish-update.ts feed <dir> [url]");
    const release = prepare();
    const out = resolve(dir);
    mkdirSync(out, { recursive: true });
    for (const build of release.builds) copyFileSync(build.file, join(out, build.uploadName));
    writeFileSync(join(out, channelFile(release)), JSON.stringify(manifest(release, url), null, 2) + "\n");
    console.log(`Wrote ${channelFile(release)} and ${release.builds.map((b) => b.uploadName).join(", ")} to ${out}`);
  } else if (command === "check") {
    check();
  } else if (command === "release") {
    const version = checkReady();
    tagRelease(version);
    console.log(`\nThe Release workflow is now building ${version}. Follow it with: gh run watch`);
  } else if (command === "publish") {
    const release = prepare();
    await publishRelease(release);
    await publishFeed(release);
  } else throw new Error(`Unknown command "${command}". Use release, publish, feed or keygen.`);
} catch (error) {
  console.error(`\n${error instanceof Error ? error.message : error}`);
  process.exit(1);
}

function keygen(): void {
  if (existsSync(keyPath)) throw new Error(`A signing key already exists at ${keyPath}. Refusing to replace it.`);
  mkdirSync(dirname(keyPath), { recursive: true });
  run(process.execPath, [tauri, "signer", "generate", "--ci", "--password", "", "--write-keys", keyPath]);
  console.log(`\nSigning key written to ${keyPath}. Back it up: without it no further updates can be shipped.`);
  console.log(
    `Public key for plugins.updater.pubkey in src-tauri/tauri.conf.json:\n${readFileSync(`${keyPath}.pub`, "utf8").trim()}`,
  );
  console.log(`\nFor the Release workflow: gh secret set TAURI_SIGNING_PRIVATE_KEY < ${keyPath}`);
}

function packageVersion(): string {
  return JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
}

/** The version's release notes as "- " lines, after checking the version is one the channels can carry. */
function releaseNotes(version: string): string {
  const prerelease = version.split("-")[1];
  if (prerelease && !/^beta(\.\d+)?$/.test(prerelease)) {
    throw new Error(
      `Version ${version}: pre-releases must be named like 1.2.0-beta.1; the channels are stable and beta.`,
    );
  }
  const items = notesFor(readFileSync(join(root, "CHANGELOG.md"), "utf8"), version);
  if (!items) throw new Error(`CHANGELOG.md has no "## ${version}" section.`);
  if (items.length === 0) throw new Error(`The "## ${version}" section of CHANGELOG.md has no "- " bullet points.`);
  return items.map((item) => `- ${item}`).join("\n");
}

/**
 * Publishing up to the upload, so a release script that no longer fits the builds or the changelog fails on an ordinary
 * push rather than on release day. Signs with a throwaway key, since the real one is only given to the Release
 * workflow, and removes the signatures again.
 */
function check(): void {
  const scratch = mkdtempSync(join(tmpdir(), "flare-launcher-release-check-"));
  try {
    const key = join(scratch, "key");
    run(process.execPath, [tauri, "signer", "generate", "--ci", "--password", "", "--write-keys", key]);
    const release = prepare({ path: key, pubkey: readFileSync(`${key}.pub`, "utf8").trim() });
    for (const build of release.builds) rmSync(`${build.file}.sig`);
    const feed = JSON.stringify(manifest(release, `https://github.com/${repo}/releases/download/v${release.version}/`));
    console.log(`\n${channelFile(release)}:\n${feed}\n\nGitHub release notes:\n${githubNotes(release)}`);
    console.log(`\nReady to publish ${release.version}.`);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/**
 * Checks the builds and their notes, then signs each build for this version: with the update signing key, or with
 * `testKey` and its public key when checking.
 */
function prepare(testKey?: { path: string; pubkey: string }): Release {
  const version = packageVersion();
  const notes = releaseNotes(version);
  const config: TauriConfig = JSON.parse(readFileSync(join(root, "src-tauri", "tauri.conf.json"), "utf8"));
  if (!testKey && !keyFromEnv && !existsSync(keyPath)) {
    throw new Error(`No signing key at ${keyPath}. Run: node scripts/publish-update.ts keygen`);
  }

  const found = BUILDS.map((build) => ({ ...build, file: build.paths(config.productName, version).find(existsSync) }));
  const missing = found.filter((build) => !build.file);
  if (missing.length > 0) {
    const steps = missing.map((build) => `  ${build.platform}: ${build.buildWith}`).join("\n");
    throw new Error(`Not built for ${version} yet. Build first:\n${steps}`);
  }

  const key = testKey ? ["--private-key-path", testKey.path] : keyFromEnv ? [] : ["--private-key-path", keyPath];
  const pubkey = testKey?.pubkey ?? config.plugins?.updater?.pubkey ?? "";
  const builds = found.map(({ platform, file: built, uploadName }) => {
    const file = built!; // Every build was found, or the check above stopped.
    run(process.execPath, [tauri, "signer", "sign", ...key, "--password", "", "--app-version", version, file]);
    const signature = readFileSync(`${file}.sig`, "utf8").trim();
    if (keyId(signature) !== keyId(pubkey)) {
      throw new Error("The signing key does not match plugins.updater.pubkey in src-tauri/tauri.conf.json.");
    }
    console.log(`Signed ${platform} build for ${version}`);
    return { platform, file, uploadName: uploadName(version), signature };
  });

  return { version, notes, builds, prerelease: version.includes("-") };
}

/**
 * The id of the key behind a Tauri public key or signature: both are base64 of a minisign file whose second line is
 * base64 of a two-byte algorithm, then the eight-byte key id.
 */
function keyId(base64: string): string {
  const line = Buffer.from(base64, "base64").toString("utf8").split("\n")[1] ?? "";
  return Buffer.from(line, "base64").subarray(2, 10).toString("hex");
}

function channelFile(release: Release): string {
  return release.prerelease ? "beta.json" : "latest.json";
}

function manifest(release: Release, baseUrl: string) {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return {
    version: release.version,
    notes: release.notes,
    pub_date: new Date().toISOString(),
    platforms: Object.fromEntries(
      release.builds.map((build) => [
        build.platform,
        { signature: build.signature, url: `${base}${build.uploadName}` },
      ]),
    ),
  };
}

/**
 * The GitHub release v<version> with every build, made as a draft and only published once all of them are attached.
 * Running it again for the same version replaces the builds.
 */
async function publishRelease(release: Release): Promise<void> {
  const tag = `v${release.version}`;
  const staging = join(target, "github-release");
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });
  const files = release.builds.map((build) => {
    const file = join(staging, build.uploadName);
    copyFileSync(build.file, file);
    return file;
  });
  const notesFile = join(staging, "notes.md");
  writeFileSync(notesFile, `${githubNotes(release)}\n`);

  if (gh(["release", "view", tag, "--json", "tagName"], true)) {
    gh(["release", "upload", tag, ...files, "--clobber"]);
    gh(["release", "edit", tag, "--notes-file", notesFile]);
  } else {
    const title = `Flare Launcher ${release.version}`;
    gh(["release", "create", tag, ...files, "--draft", "--verify-tag", "--title", title, "--notes-file", notesFile]);
  }
  // Building an older tag again leaves the newest stable release as GitHub's latest.
  const latest = !release.prerelease && !(await newerPublished("latest.json", release.version));
  const channel = [release.prerelease ? "--prerelease" : "--prerelease=false", latest ? "--latest" : "--latest=false"];
  gh(["release", "edit", tag, "--draft=false", ...channel]);
  console.log(`Published the release ${tag}`);
}

/**
 * The GitHub release's notes: the players' notes, then a link to every commit since the previous release, for
 * developers. The launcher and the download page show only the players' notes. A stable release links from the last
 * stable one, so the link spans the betas between them.
 */
function githubNotes(release: Release): string {
  const tagged = capture("git", ["ls-remote", "--tags", "--refs", "origin", "refs/tags/v*"], true)
    .split("\n")
    .map((line) => line.match(/refs\/tags\/v(.+)$/)?.[1])
    .filter((version) => version !== undefined);
  const previous = tagged
    .filter(
      (version) => compareVersions(version, release.version) < 0 && (release.prerelease || !version.includes("-")),
    )
    .sort((a, b) => compareVersions(b, a))[0];
  if (!previous) return release.notes;
  const compare = `https://github.com/${repo}/compare/v${previous}...v${release.version}`;
  return `${release.notes}\n\nEvery change since ${previous}: ${compare}`;
}

/**
 * The channel file last, so the app never sees a version whose builds are not there yet. Beta players get a stable
 * release too, unless a newer beta is already out. A channel file already on a newer version is left alone, so
 * building an older tag again doesn't take players back to it. The same version is written again, as its builds have
 * new signatures.
 */
async function publishFeed(release: Release): Promise<void> {
  const builds = `https://github.com/${repo}/releases/download/v${release.version}/`;
  const file = join(target, "github-release", channelFile(release));
  writeFileSync(file, JSON.stringify(manifest(release, builds), null, 2) + "\n");
  const names: string[] = [];
  for (const name of release.prerelease ? ["beta.json"] : ["latest.json", "beta.json"]) {
    const newer = await newerPublished(name, release.version);
    if (newer) console.log(`Left ${name} on ${newer}, which is newer than ${release.version}.`);
    else names.push(name);
  }
  if (names.length === 0) return;
  for (const name of names) {
    const object = `${r2Bucket}/${r2Prefix}/${name}`;
    const flags = ["--file", file, "--remote", "--content-type", "application/json", "--cache-control", "no-cache"];
    run(process.execPath, [wrangler, "r2", "object", "put", object, ...flags]);
  }
  console.log(`Published ${release.version} to ${names.map((name) => `${feedUrl}${name}`).join(" and ")}`);
}

/** The version in a channel file on the live feed, if it is newer than `version`. */
async function newerPublished(name: string, version: string): Promise<string | null> {
  const published = await publishedVersion(name);
  return published && compareVersions(published, version) > 0 ? published : null;
}

/** Version in a channel file on the live feed, or null if it has not been published. */
async function publishedVersion(name: string): Promise<string | null> {
  const response = await fetch(`${feedUrl}${name}?t=${Date.now()}`, { cache: "no-store" });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Could not read ${feedUrl}${name} (HTTP ${response.status}).`);
  const { version } = (await response.json()) as { version?: string };
  if (!version) throw new Error(`${feedUrl}${name} has no version.`);
  return version;
}

/**
 * Every release is tagged and built from its tag, so the tag has to name what is meant to ship: refuse uncommitted or
 * unpushed work, missing notes, and a version whose tag already points at another commit.
 */
function checkReady(): string {
  const version = packageVersion();
  releaseNotes(version);
  if (git(["status", "--porcelain"])) throw new Error("Commit your changes before releasing: every release is tagged.");
  git(["fetch", "--quiet", "origin"]);
  if (!git(["branch", "--remotes", "--contains", "HEAD"])) throw new Error("Push this commit before releasing.");
  const tagged = git(["rev-parse", "--quiet", "--verify", `v${version}^{commit}`], true);
  if (tagged && tagged !== git(["rev-parse", "HEAD"])) {
    throw new Error(`Tag v${version} already points at another commit. Bump the version before releasing.`);
  }
  return version;
}

/**
 * Tags the commit v<version>, like "Release 1.0.0", and pushes the tag, which starts the Release workflow. If the tag
 * is already on GitHub, run the workflow again from the Actions tab instead.
 */
function tagRelease(version: string): void {
  const tag = `v${version}`;
  if (!git(["rev-parse", "--quiet", "--verify", `${tag}^{commit}`], true)) {
    run("git", ["tag", "--annotate", tag, "--message", `Release ${version}`]);
  }
  run("git", ["push", "origin", tag]);
  console.log(`Tagged ${tag}`);
}

/** A git command's output. `allowFailure` returns "" instead of throwing, for lookups that may find nothing. */
function git(args: string[], allowFailure = false): string {
  return capture("git", args, allowFailure);
}

/** A GitHub CLI command's output, run against this repository. */
function gh(args: string[], allowFailure = false): string {
  return capture("gh", [...args, "--repo", repo], allowFailure);
}

function capture(file: string, args: string[], allowFailure: boolean): string {
  const result = spawnSync(file, args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) {
    if (allowFailure) return "";
    throw new Error(`${file} ${args.join(" ")} failed:\n${(result.stderr || result.error?.message || "").trim()}`);
  }
  return result.stdout.trim();
}

function run(file: string, args: string[]): void {
  const result = spawnSync(file, args, { stdio: "inherit" });
  if (result.status !== 0) throw new Error(`${[file, ...args].join(" ")} failed.`);
}
