// Signs and publishes the update feed (the Windows installer, and the Linux AppImage, .deb and .rpm) to the Cloudflare
// R2 bucket behind https://updates.darkzone.dev.
//
//   node scripts/publish-update.mjs keygen           create the signing key (once) and print its public key
//   node scripts/publish-update.mjs feed <dir> [url] sign the builds and write a feed to <dir> instead of
//                                                    uploading, for testing; [url] is where <dir> will be served
//   node scripts/publish-update.mjs publish          sign, upload to R2 (needs `pnpm exec wrangler login` once), tag
//                                                    the release commit v<version> and push the tag, then redeploy
//                                                    the download page so its changelog shows the new version
//
// Channels: a version like 1.2.0 is stable and 1.2.0-beta.1 is beta. The app's stable channel reads latest.json and
// its beta channel reads beta.json, so a stable release is also published as beta.json when it is newer than the
// latest beta.
//
// Every release carries both builds, so no player is left with a feed that has nothing for them. Each is signed with
// a private key that never leaves this machine, and the signature is bound to the version. The app refuses an update
// whose signature does not match the public key in src-tauri/tauri.conf.json or whose signed version differs from the
// one the feed announces, so a tampered bucket cannot push another installer.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compareVersions, notesFor } from "./changelog.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const keyPath = process.env.DZSL_UPDATE_SIGNING_KEY ?? join(homedir(), ".dayz-server-launcher", "update-signing-key");
const bucket = process.env.DZSL_R2_BUCKET ?? "darkzone-updates";
// Must match FEED_URL in src-tauri/src/updater.rs. Named after the launcher's first name, DayZ Server Launcher, and
// kept: installed copies check this address for updates.
const prefix = "dayz-server-launcher";
const feedUrl = `https://updates.darkzone.dev/${prefix}/`;
const tauri = join(root, "node_modules", ".bin", process.platform === "win32" ? "tauri.cmd" : "tauri");
const target = join(root, "src-tauri", "target");
const linuxBundles = join(target, "linux", "release", "bundle");

/** What each release ships. `platform` is the updater's key for it; `paths` are where Tauri may have built it. */
const BUILDS = [
  {
    platform: "windows-x86_64",
    paths: (product, version) =>
      ["x86_64-pc-windows-msvc/release", "release"].map((dir) =>
        join(target, dir, "bundle", "nsis", `${product}_${version}_x64-setup.exe`),
      ),
    uploadName: (version) => `Flare-Launcher-Setup-${version}.exe`,
    buildWith: "pnpm dist:cross (pnpm dist on Windows)",
  },
  // The Linux builds come from the Ubuntu 22.04 container (scripts/build-linux.mjs), so they run on older systems too.
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

const [command = "publish", ...args] = process.argv.slice(2);

try {
  if (command === "keygen") keygen();
  else if (command === "feed") {
    const [dir, url = "http://127.0.0.1:8765/"] = args;
    if (!dir) throw new Error("Usage: node scripts/publish-update.mjs feed <dir> [url]");
    const release = prepare();
    const out = resolve(dir);
    mkdirSync(out, { recursive: true });
    for (const build of release.builds) copyFileSync(build.file, join(out, build.uploadName));
    writeFileSync(join(out, release.channelFile), JSON.stringify(manifest(release, url), null, 2) + "\n");
    console.log(`Wrote ${release.channelFile} and ${release.builds.map((b) => b.uploadName).join(", ")} to ${out}`);
  } else if (command === "publish") {
    checkCommitted();
    const release = prepare();
    upload(release);
    await alsoPublishAsBeta(release);
    tagRelease(release.version);
    deploySite();
  } else throw new Error(`Unknown command "${command}". Use keygen, feed or publish.`);
} catch (error) {
  console.error(`\n${error.message}`);
  process.exit(1);
}

function keygen() {
  if (existsSync(keyPath)) throw new Error(`A signing key already exists at ${keyPath}. Refusing to replace it.`);
  mkdirSync(dirname(keyPath), { recursive: true });
  run(tauri, ["signer", "generate", "--ci", "--password", "", "--write-keys", keyPath]);
  console.log(`\nSigning key written to ${keyPath}. Back it up: without it no further updates can be shipped.`);
  console.log(
    `Public key for plugins.updater.pubkey in src-tauri/tauri.conf.json:\n${readFileSync(`${keyPath}.pub`, "utf8").trim()}`,
  );
}

/** Checks the builds and their notes, then signs each build for this version. */
function prepare() {
  const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const prerelease = version.split("-")[1];
  if (prerelease && !/^beta(\.\d+)?$/.test(prerelease)) {
    throw new Error(
      `Version ${version}: pre-releases must be named like 1.2.0-beta.1; the channels are stable and beta.`,
    );
  }
  const items = notesFor(readFileSync(join(root, "CHANGELOG.md"), "utf8"), version);
  if (!items) throw new Error(`CHANGELOG.md has no "## ${version}" section.`);
  if (items.length === 0) throw new Error(`The "## ${version}" section of CHANGELOG.md has no "- " bullet points.`);
  const notes = items.map((item) => `- ${item}`).join("\n");

  const config = JSON.parse(readFileSync(join(root, "src-tauri", "tauri.conf.json"), "utf8"));
  if (!existsSync(keyPath))
    throw new Error(`No signing key at ${keyPath}. Run: node scripts/publish-update.mjs keygen`);
  if (readFileSync(`${keyPath}.pub`, "utf8").trim() !== config.plugins?.updater?.pubkey) {
    throw new Error("The signing key does not match plugins.updater.pubkey in src-tauri/tauri.conf.json.");
  }

  const found = BUILDS.map((build) => ({ ...build, file: build.paths(config.productName, version).find(existsSync) }));
  const missing = found.filter((build) => !build.file);
  if (missing.length > 0) {
    const steps = missing.map((build) => `  ${build.platform}: ${build.buildWith}`).join("\n");
    throw new Error(`Not built for ${version} yet. Build first:\n${steps}`);
  }

  const builds = found.map(({ platform, file, uploadName }) => {
    run(tauri, ["signer", "sign", "--private-key-path", keyPath, "--password", "", "--app-version", version, file]);
    console.log(`Signed ${platform} build for ${version}`);
    return {
      platform,
      file,
      uploadName: uploadName(version),
      signature: readFileSync(`${file}.sig`, "utf8").trim(),
      fingerprint: createHash("sha256").update(readFileSync(file)).digest("hex").slice(0, 12),
    };
  });

  return { version, notes, builds, channelFile: prerelease ? "beta.json" : "latest.json" };
}

function manifest(release, baseUrl) {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return {
    version: release.version,
    notes: release.notes,
    pub_date: new Date().toISOString(),
    platforms: Object.fromEntries(
      release.builds.map((build) => [
        build.platform,
        // The fingerprint makes the address change whenever the file does. Builds are cached as never changing, so a
        // version published again under the same name would otherwise keep being served from the old cached copy.
        { signature: build.signature, url: `${base}${build.uploadName}?v=${build.fingerprint}` },
      ]),
    ),
  };
}

/** The builds first and the channel file last, so the app never sees a version whose build is not there yet. */
function upload(release) {
  const feedPath = join(target, release.channelFile);
  writeFileSync(feedPath, JSON.stringify(manifest(release, feedUrl), null, 2) + "\n");
  // Builds are versioned by name and never change once published.
  for (const build of release.builds) {
    put(build.file, build.uploadName, "application/octet-stream", "public, max-age=31536000, immutable");
  }
  put(feedPath, release.channelFile, "application/json", "no-cache");
  console.log(`\nPublished ${release.version} to ${feedUrl}${release.channelFile}`);
}

/** Beta players get a stable release too, unless a newer beta is already out. */
async function alsoPublishAsBeta(release) {
  if (release.channelFile !== "latest.json") return;
  const beta = await publishedVersion("beta.json");
  if (beta && compareVersions(release.version, beta) <= 0) {
    console.log(`Left beta.json on ${beta}, which is newer than ${release.version}.`);
    return;
  }
  put(join(target, "latest.json"), "beta.json", "application/json", "no-cache");
  console.log(`Published ${release.version} to ${feedUrl}beta.json`);
}

function put(file, name, contentType, cacheControl) {
  console.log(`Uploading ${name}`);
  const wrangler = join(root, "node_modules", "wrangler", "bin", "wrangler.js");
  const object = `${bucket}/${prefix}/${name}`;
  const flags = ["--file", file, "--remote", "--content-type", contentType, "--cache-control", cacheControl];
  run(process.execPath, [wrangler, "r2", "object", "put", object, ...flags]);
}

/** Version in a channel file on the live feed, or null if it has not been published. */
async function publishedVersion(name) {
  const response = await fetch(`${feedUrl}${name}?t=${Date.now()}`, { cache: "no-store" });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Could not read ${feedUrl}${name} (HTTP ${response.status}).`);
  const { version } = await response.json();
  if (!version) throw new Error(`${feedUrl}${name} has no version.`);
  return version;
}

/**
 * Every release is tagged, so the tag has to name what was built: refuse uncommitted or unpushed work, and a version
 * whose tag already points at another commit.
 */
function checkCommitted() {
  const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  if (git(["status", "--porcelain"]))
    throw new Error("Commit your changes before publishing: every release is tagged.");
  git(["fetch", "--quiet", "origin"]);
  if (!git(["branch", "--remotes", "--contains", "HEAD"])) throw new Error("Push this commit before publishing.");
  const tagged = git(["rev-parse", "--quiet", "--verify", `v${version}^{commit}`], true);
  if (tagged && tagged !== git(["rev-parse", "HEAD"])) {
    throw new Error(`Tag v${version} already points at another commit. Bump the version before publishing.`);
  }
}

/** Tags the published commit v<version>, like "Release 1.0.0", and pushes the tag. Re-publishing reuses the tag. */
function tagRelease(version) {
  const tag = `v${version}`;
  if (!git(["rev-parse", "--quiet", "--verify", `${tag}^{commit}`], true)) {
    run("git", ["tag", "--annotate", tag, "--message", `Release ${version}`]);
  }
  run("git", ["push", "origin", tag]);
  console.log(`Tagged ${tag}`);
}

/** The download page reads the feed itself, but its changelog page is built from CHANGELOG.md when it is deployed. */
function deploySite() {
  const wrangler = join(root, "node_modules", "wrangler", "bin", "wrangler.js");
  run(process.execPath, [wrangler, "deploy", "--config", join(root, "site", "wrangler.jsonc")]);
  console.log("Redeployed the download page");
}

/** A git command's output. `allowFailure` returns "" instead of throwing, for lookups that may find nothing. */
function git(args, allowFailure = false) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) {
    if (allowFailure) return "";
    throw new Error(`git ${args.join(" ")} failed:\n${result.stderr.trim()}`);
  }
  return result.stdout.trim();
}

function run(file, args) {
  const result = spawnSync(file, args, { stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) throw new Error(`${[file, ...args].join(" ")} failed.`);
}
