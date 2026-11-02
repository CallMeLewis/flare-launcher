// Publishes the launcher's releases to GitHub and its update feed. scripts/publish-update.ts runs it, giving it the
// launcher's name, repository, feed and builds (see release.d.ts). The builds are made and published by the Release
// workflow (.github/workflows/release.yml), which runs when a v<version> tag is pushed.
//
//   release           (pnpm release) check the version is ready and CI passed on the commit (waiting for it if it's
//                     still running), tag the commit v<version> and push the tag, which starts the workflow
//   publish           (the workflow) sign the builds, publish them as the GitHub release v<version>, then update the
//                     channel files on the update feed (needs `pnpm exec wrangler login`, or a Cloudflare API token in CI)
//   feed <dir> [url]  sign local builds and write a feed to <dir> instead of publishing, for testing; [url] is where
//                     <dir> will be served
//   check             (CI) go through publishing as far as it can without the signing key or uploading: find the
//                     builds, read the notes, sign with a throwaway key and write the feed and the GitHub release notes
//   keygen            create the update signing key (once) and print its public key
//
// The update feed is on Cloudflare R2, at https://updates.darkzone.dev/<feed>/: the app's stable channel reads
// latest.json and its beta channel beta.json. A beta (1.2.0-beta.1) goes to beta.json. A stable release goes to
// latest.json, and to beta.json too unless a newer beta is already out, so beta users get stable releases. Each channel
// file points at the builds attached to that version's GitHub release.
//
// Every build is signed with the private key (a repository secret in CI), and the signature is bound to the version.
// The app refuses an update whose signature does not match the public key in src-tauri/tauri.conf.json or whose signed
// version differs from the one the feed announces, so a tampered feed cannot push another installer.
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { compareVersions, notesFor, versionProblem } from "./changelog.js";

/**
 * @typedef {import("./release.d.ts").ReleaseConfig} ReleaseConfig
 * @typedef {{ platform: string, file: string, uploadName: string, signature: string }} SignedBuild
 * @typedef {{ version: string, notes: string, builds: SignedBuild[], prerelease: boolean }} Release
 * @typedef {{ productName: string, plugins?: { updater?: { pubkey?: string } } }} TauriConfig
 * @typedef {{ databaseId: number, status: string, conclusion: string, url: string }} CiRun
 */

/** The secrets the Release workflow gives this script, by the tool that needs each. */
const SECRETS = {
  signer: ["TAURI_SIGNING_PRIVATE_KEY", "TAURI_SIGNING_PRIVATE_KEY_PASSWORD"],
  github: ["GH_TOKEN", "GITHUB_TOKEN"],
  cloudflare: ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"],
};

/** The channel files on the feed: stable, then beta. */
const CHANNELS = ["latest.json", "beta.json"];

/**
 * The environment with only the given secrets, so no tool, or anything it runs, can read another's.
 * @param {...keyof typeof SECRETS} keep
 * @returns {NodeJS.ProcessEnv}
 */
function envFor(...keep) {
  const env = { ...process.env };
  for (const [tool, names] of Object.entries(SECRETS)) {
    if (!keep.includes(/** @type {keyof typeof SECRETS} */ (tool))) for (const name of names) delete env[name];
  }
  return env;
}

/**
 * @param {ReleaseConfig} config
 * @param {string[]} [argv]
 */
export async function release(config, argv = process.argv.slice(2)) {
  try {
    await new Releaser(config).run(argv);
  } catch (error) {
    console.error(`\n${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}

class Releaser {
  /** @param {ReleaseConfig} config */
  constructor(config) {
    this.config = config;
    // In CI the key comes from the TAURI_SIGNING_PRIVATE_KEY secret, which the Tauri CLI reads itself.
    this.keyFromEnv = Boolean(process.env.TAURI_SIGNING_PRIVATE_KEY);
    this.repo = process.env.GITHUB_REPOSITORY ?? config.repo;
    // The R2 bucket behind https://updates.darkzone.dev, shared by the Darkzone apps, each in its own folder.
    this.bucket = process.env.FLARE_R2_BUCKET ?? "darkzone-updates";
    this.feedUrl = `https://updates.darkzone.dev/${config.feed}/`;
    // Run through Node rather than the .bin shim, which on Windows is a .cmd that needs a shell, and a shell drops empty
    // arguments and splits ones with spaces.
    this.tauri = join(config.app, "node_modules", "@tauri-apps", "cli", "tauri.js");
    this.wrangler = join(config.app, "node_modules", "wrangler", "bin", "wrangler.js");
    this.staging = join(config.app, "src-tauri", "target", "github-release");
  }

  /** @param {string[]} argv */
  async run(argv) {
    const [command = "release", ...args] = argv;
    const { script } = this.config;
    if (command === "keygen") this.keygen();
    else if (command === "feed") {
      const [dir, url = "http://127.0.0.1:8765/"] = args;
      if (!dir) throw new Error(`Usage: ${script} feed <dir> [url]`);
      const release = this.prepare();
      const out = resolve(dir);
      mkdirSync(out, { recursive: true });
      for (const build of release.builds) copyFileSync(build.file, join(out, build.uploadName));
      const manifest = JSON.stringify(this.manifest(release, url), null, 2) + "\n";
      for (const name of channelsFor(release.version)) writeFileSync(join(out, name), manifest);
      const files = [...channelsFor(release.version), ...release.builds.map((build) => build.uploadName)];
      console.log(`Wrote ${files.join(", ")} to ${out}`);
    } else if (command === "check") {
      this.check();
    } else if (command === "release") {
      const version = this.checkReady();
      await this.waitForCi();
      if (this.tagRelease(version)) {
        console.log(`\nThe Release workflow is now building ${version}. Follow it with: gh run watch`);
      } else {
        console.log(
          `\nv${version} was already on GitHub, so pushing it started nothing. To build it again, run the Release ` +
            "workflow from the Actions tab on main and enter the tag.",
        );
      }
    } else if (command === "publish") {
      const version = this.packageVersion();
      const live = await this.liveManifest(version);
      if (live) await this.finishFeed(version, live);
      else {
        const release = this.prepare();
        await this.publishRelease(release);
        await this.publishFeed(release);
      }
    } else throw new Error(`Unknown command "${command}". Use release, publish, feed, check or keygen.`);
  }

  keygen() {
    const { keyPath, secretEnvironment } = this.config;
    if (existsSync(keyPath)) throw new Error(`A signing key already exists at ${keyPath}. Refusing to replace it.`);
    mkdirSync(dirname(keyPath), { recursive: true });
    const args = [this.tauri, "signer", "generate", "--ci", "--password", "", "--write-keys", keyPath];
    run(process.execPath, args, envFor());
    console.log(`\nSigning key written to ${keyPath}. Back it up: without it no further updates can be shipped.`);
    const pubkey = readFileSync(`${keyPath}.pub`, "utf8").trim();
    console.log(`Public key for plugins.updater.pubkey in src-tauri/tauri.conf.json:\n${pubkey}`);
    const environment = secretEnvironment ? ` --env ${secretEnvironment}` : "";
    console.log(`\nFor the Release workflow: gh secret set TAURI_SIGNING_PRIVATE_KEY${environment} < ${keyPath}`);
  }

  /** @returns {string} */
  packageVersion() {
    return JSON.parse(readFileSync(join(this.config.app, "package.json"), "utf8")).version;
  }

  /**
   * The version's release notes as "- " lines, after checking the version is one the channels can carry.
   * @param {string} version
   */
  releaseNotes(version) {
    const problem = versionProblem(version, this.config.name);
    if (problem) throw new Error(problem);
    const items = notesFor(readFileSync(join(this.config.root, "CHANGELOG.md"), "utf8"), version);
    if (!items) throw new Error(`CHANGELOG.md has no "## ${version}" section.`);
    if (items.length === 0) throw new Error(`The "## ${version}" section of CHANGELOG.md has no "- " bullet points.`);
    return items.map((item) => `- ${item}`).join("\n");
  }

  /**
   * Publishing up to the upload, so a release script that no longer fits the build or the changelog fails on an
   * ordinary push rather than on release day. Signs with a throwaway key, since the real one is only given to the
   * Release workflow, and removes the signatures again.
   */
  check() {
    const scratch = mkdtempSync(join(tmpdir(), "flare-release-check-"));
    // Signing writes each build's .sig, so one already there, from a real release built on this computer, is put back
    // afterwards rather than replaced by the throwaway signature and then deleted.
    const signatures = this.existingSignatures();
    try {
      const key = join(scratch, "key");
      run(
        process.execPath,
        [this.tauri, "signer", "generate", "--ci", "--password", "", "--write-keys", key],
        envFor(),
      );
      const release = this.prepare({ path: key, pubkey: readFileSync(`${key}.pub`, "utf8").trim() });
      for (const build of release.builds) rmSync(`${build.file}.sig`);
      const builds = `https://github.com/${this.repo}/releases/download/v${release.version}/`;
      const feed = JSON.stringify(this.manifest(release, builds));
      const channels = channelsFor(release.version).join(" and ");
      console.log(`\n${channels}:\n${feed}\n\nGitHub release notes:\n${this.githubNotes(release)}`);
      console.log(`\nReady to publish ${release.version}.`);
    } finally {
      for (const [file, text] of signatures) writeFileSync(file, text);
      rmSync(scratch, { recursive: true, force: true });
    }
  }

  /**
   * The .sig files already beside this version's builds, with what's in them.
   * @returns {Map<string, Buffer>}
   */
  existingSignatures() {
    const { app, builds } = this.config;
    /** @type {TauriConfig} */
    const tauriConfig = JSON.parse(readFileSync(join(app, "src-tauri", "tauri.conf.json"), "utf8"));
    const version = this.packageVersion();
    const files = builds.flatMap((build) => build.paths(tauriConfig.productName, version)).map((path) => `${path}.sig`);
    return new Map(files.filter((file) => existsSync(file)).map((file) => [file, readFileSync(file)]));
  }

  /**
   * Checks the builds and their notes, then signs each build for this version: with the update signing key, or with
   * `testKey` and its public key when checking.
   * @param {{ path: string, pubkey: string }} [testKey]
   * @returns {Release}
   */
  prepare(testKey) {
    const { app, keyPath, script } = this.config;
    const version = this.packageVersion();
    const notes = this.releaseNotes(version);
    /** @type {TauriConfig} */
    const tauriConfig = JSON.parse(readFileSync(join(app, "src-tauri", "tauri.conf.json"), "utf8"));
    if (!testKey && !this.keyFromEnv && !existsSync(keyPath)) {
      throw new Error(`No signing key at ${keyPath}. Run: ${script} keygen`);
    }

    const found = this.config.builds.map((build) => ({
      ...build,
      file: build.paths(tauriConfig.productName, version).find((path) => existsSync(path)),
    }));
    const missing = found.filter((build) => !build.file);
    if (missing.length > 0) {
      const steps = missing.map((build) => `  ${build.platform}: ${build.buildWith}`).join("\n");
      throw new Error(`Not built for ${version} yet. Build first:\n${steps}`);
    }

    const key = testKey ? ["--private-key-path", testKey.path] : this.keyFromEnv ? [] : ["--private-key-path", keyPath];
    const pubkey = testKey?.pubkey ?? tauriConfig.plugins?.updater?.pubkey ?? "";
    const builds = found.map(({ platform, file, uploadName }) => {
      const built = /** @type {string} */ (file); // Every build was found, or the check above stopped.
      const args = [this.tauri, "signer", "sign", ...key, "--password", "", "--app-version", version, built];
      run(process.execPath, args, envFor("signer"));
      const signature = readFileSync(`${built}.sig`, "utf8").trim();
      if (keyId(signature) !== keyId(pubkey)) {
        throw new Error("The signing key does not match plugins.updater.pubkey in src-tauri/tauri.conf.json.");
      }
      console.log(`Signed the ${platform} build of ${version}`);
      return { platform, file: built, uploadName: uploadName(version), signature };
    });

    return { version, notes, builds, prerelease: version.includes("-") };
  }

  /**
   * @param {Release} release
   * @param {string} baseUrl Where the builds are.
   */
  manifest(release, baseUrl) {
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
   * A channel file on the live feed that already offers `version`, as published.
   * @param {string} version
   * @returns {Promise<{ name: string, text: string } | null>}
   */
  async liveManifest(version) {
    for (const name of CHANNELS) {
      const text = await this.publishedText(name);
      if (text && JSON.parse(text).version === version) return { name, text };
    }
    return null;
  }

  /**
   * Publishing a version the feed already offers only finishes the feed, as when writing a stable release's beta.json
   * failed after its latest.json. A rebuilt installer has a new signature, so replacing the one on GitHub would break
   * updates for everyone the feed sends to it. Instead the channels still to update get the channel file that's live,
   * which points at the builds that are there.
   * @param {string} version
   * @param {{ name: string, text: string }} live
   */
  async finishFeed(version, live) {
    console.log(
      `${version} is already on the update feed (${this.feedUrl}${live.name}), so its builds are left alone.`,
    );
    const file = join(this.staging, live.name);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, live.text);
    await this.writeChannels(version, file);
  }

  /**
   * The GitHub release v<version> with every build, made as a draft and only published once all of them are attached.
   * Running it again for the same version, before the feed offers it, replaces the builds.
   * @param {Release} release
   */
  async publishRelease(release) {
    const tag = `v${release.version}`;
    rmSync(this.staging, { recursive: true, force: true });
    mkdirSync(this.staging, { recursive: true });
    const files = release.builds.map((build) => {
      const file = join(this.staging, build.uploadName);
      copyFileSync(build.file, file);
      return file;
    });
    const notesFile = join(this.staging, "notes.md");
    writeFileSync(notesFile, `${this.githubNotes(release)}\n`);

    if (this.gh(["release", "view", tag, "--json", "tagName"], true)) {
      this.gh(["release", "upload", tag, ...files, "--clobber"]);
      this.gh(["release", "edit", tag, "--notes-file", notesFile]);
    } else {
      const title = `${this.config.name} ${release.version}`;
      this.gh([
        "release",
        "create",
        tag,
        ...files,
        "--draft",
        "--verify-tag",
        "--title",
        title,
        "--notes-file",
        notesFile,
      ]);
    }
    // Building an older tag again leaves the newest stable release as GitHub's latest.
    const latest = !release.prerelease && !(await this.newerPublished("latest.json", release.version));
    const channel = [
      release.prerelease ? "--prerelease" : "--prerelease=false",
      latest ? "--latest" : "--latest=false",
    ];
    this.gh(["release", "edit", tag, "--draft=false", ...channel]);
    console.log(`Published the release ${tag}`);
  }

  /**
   * The GitHub release's notes: the users' notes, then a link to every commit since the previous release, for
   * developers. The app shows only the users' notes. A stable release links from the last stable one, so the link
   * spans the betas between them.
   * @param {Release} release
   */
  githubNotes(release) {
    const tagged = this.git(["ls-remote", "--tags", "--refs", "origin", "refs/tags/v*"], true)
      .split("\n")
      .map((line) => line.match(/refs\/tags\/v(.+)$/)?.[1])
      .filter((version) => version !== undefined);
    const previous = tagged
      .filter(
        (version) => compareVersions(version, release.version) < 0 && (release.prerelease || !version.includes("-")),
      )
      .sort((a, b) => compareVersions(b, a))[0];
    if (!previous) return release.notes;
    const compare = `https://github.com/${this.repo}/compare/v${previous}...v${release.version}`;
    return `${release.notes}\n\nEvery change since ${previous}: ${compare}`;
  }

  /**
   * The channel files last, so the app never sees a version whose builds are not there yet.
   * @param {Release} release
   */
  async publishFeed(release) {
    const builds = `https://github.com/${this.repo}/releases/download/v${release.version}/`;
    const file = join(this.staging, "channel.json");
    writeFileSync(file, JSON.stringify(this.manifest(release, builds), null, 2) + "\n");
    await this.writeChannels(release.version, file);
  }

  /**
   * Writes a version's channel file to the channels it goes to. A channel file already on this version or a newer one
   * is left alone, so building an older tag again doesn't take users back to it.
   * @param {string} version
   * @param {string} file
   */
  async writeChannels(version, file) {
    /** @type {string[]} */
    const names = [];
    for (const name of channelsFor(version)) {
      const published = await this.publishedVersion(name);
      if (published && compareVersions(published, version) > 0) {
        console.log(`Left ${name} on ${published}, which is newer than ${version}.`);
      } else if (published !== version) names.push(name);
    }
    if (names.length === 0) {
      console.log(`Every channel ${version} goes to already has it or something newer.`);
      return;
    }
    for (const name of names) {
      const object = `${this.bucket}/${this.config.feed}/${name}`;
      const flags = ["--file", file, "--remote", "--content-type", "application/json", "--cache-control", "no-cache"];
      run(process.execPath, [this.wrangler, "r2", "object", "put", object, ...flags], envFor("cloudflare"));
    }
    console.log(`Published ${version} to ${names.map((name) => `${this.feedUrl}${name}`).join(" and ")}`);
  }

  /**
   * The version in a channel file on the live feed, if it is newer than `version`.
   * @param {string} name
   * @param {string} version
   */
  async newerPublished(name, version) {
    const published = await this.publishedVersion(name);
    return published && compareVersions(published, version) > 0 ? published : null;
  }

  /**
   * The version in a channel file on the live feed, or null if it has not been published.
   * @param {string} name
   * @returns {Promise<string | null>}
   */
  async publishedVersion(name) {
    const text = await this.publishedText(name);
    if (!text) return null;
    const { version } = /** @type {{ version?: string }} */ (JSON.parse(text));
    if (!version) throw new Error(`${this.feedUrl}${name} has no version.`);
    return version;
  }

  /**
   * A channel file on the live feed as it's published, or null if it hasn't been.
   * @param {string} name
   * @returns {Promise<string | null>}
   */
  async publishedText(name) {
    const response = await fetch(`${this.feedUrl}${name}?t=${Date.now()}`, { cache: "no-store" });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Could not read ${this.feedUrl}${name} (HTTP ${response.status}).`);
    return response.text();
  }

  /**
   * Every release is tagged and built from its tag, so the tag has to name what is meant to ship: refuse uncommitted
   * or unpushed work, missing notes, and a version whose tag already points at another commit.
   */
  checkReady() {
    const version = this.packageVersion();
    this.releaseNotes(version);
    if (this.git(["status", "--porcelain"])) {
      throw new Error("Commit your changes before releasing: every release is tagged.");
    }
    this.git(["fetch", "--quiet", "origin"]);
    // Release refuses a tag that isn't on main, but only once the tag is pushed and its version used up.
    const ancestor = ["merge-base", "--is-ancestor", "HEAD", "origin/main"];
    const onMain = spawnSync("git", ancestor, { cwd: this.config.root, env: envFor("github") }).status === 0;
    if (!onMain) throw new Error("Push this commit to main before releasing: releases are only made from main.");
    const tagged = this.git(["rev-parse", "--quiet", "--verify", `v${version}^{commit}`], true);
    if (tagged && tagged !== this.git(["rev-parse", "HEAD"])) {
      throw new Error(`Tag v${version} already points at another commit. Bump the version before releasing.`);
    }
    return version;
  }

  /**
   * Waits for CI on this commit, and refuses to tag it if CI failed. Release checks everything again itself, but by
   * then the tag is pushed, and a tag on a broken commit uses up its version: the fix is a new commit, which needs a
   * new one.
   */
  async waitForCi() {
    const commit = this.git(["rev-parse", "HEAD"]);
    // A run can take a few seconds to appear after a push.
    let found = this.ciRun(commit);
    for (let tries = 0; !found && tries < 12; tries++) {
      await sleep(5000);
      found = this.ciRun(commit);
    }
    if (!found) {
      throw new Error(
        `CI hasn't run on ${commit.slice(0, 7)}. It checks the newest commit of each push, unless only docs changed. ` +
          "Release from a commit CI has checked.",
      );
    }
    if (found.status !== "completed") {
      console.log(`Waiting for CI to finish on ${commit.slice(0, 7)}: ${found.url}`);
      spawnSync("gh", ["run", "watch", String(found.databaseId), "--interval", "10", "--repo", this.repo], {
        stdio: "inherit",
        env: envFor("github"),
      });
      found = /** @type {CiRun} */ (this.ciRun(commit));
    }
    if (found.conclusion !== "success") {
      throw new Error(
        `CI didn't pass on this commit (${found.conclusion}), so it wasn't tagged: ${found.url}\n` +
          "Fix it in a new commit, push it, then run pnpm release again.",
      );
    }
    console.log(`CI passed on ${commit.slice(0, 7)}.`);
  }

  /**
   * The latest CI run on a commit, if there is one yet.
   * @param {string} commit
   * @returns {CiRun | undefined}
   */
  ciRun(commit) {
    const fields = "databaseId,status,conclusion,url";
    const runs = this.gh(["run", "list", "--workflow", "ci.yml", "--commit", commit, "--limit", "1", "--json", fields]);
    return JSON.parse(runs)[0];
  }

  /**
   * Tags the commit v<version>, like "Release 1.0.0", and pushes the tag, which starts the Release workflow. Returns
   * false when GitHub already had the tag, so nothing started: run the workflow again from the Actions tab instead.
   * @param {string} version
   */
  tagRelease(version) {
    const tag = `v${version}`;
    if (!this.git(["rev-parse", "--quiet", "--verify", `${tag}^{commit}`], true)) {
      run("git", ["tag", "--annotate", tag, "--message", `Release ${version}`], envFor("github"), this.config.root);
    }
    // Pushing a tag GitHub already has does nothing, and starts no workflow.
    if (this.git(["ls-remote", "--tags", "origin", `refs/tags/${tag}`])) return false;
    run("git", ["push", "origin", tag], envFor("github"), this.config.root);
    console.log(`Tagged ${tag}`);
    return true;
  }

  /**
   * A git command's output. `allowFailure` returns "" instead of throwing, for lookups that may find nothing.
   * @param {string[]} args
   * @param {boolean} [allowFailure]
   */
  git(args, allowFailure = false) {
    return capture("git", args, allowFailure, envFor("github"), this.config.root);
  }

  /**
   * A GitHub CLI command's output, run against this repository.
   * @param {string[]} args
   * @param {boolean} [allowFailure]
   */
  gh(args, allowFailure = false) {
    return capture("gh", [...args, "--repo", this.repo], allowFailure, envFor("github"), this.config.root);
  }
}

/**
 * The channels a version goes to: a beta to beta.json, a stable release to both.
 * @param {string} version
 */
function channelsFor(version) {
  return version.includes("-") ? ["beta.json"] : CHANNELS;
}

/**
 * The id of the key behind a Tauri public key or signature: both are base64 of a minisign file whose second line is
 * base64 of a two-byte algorithm, then the eight-byte key id.
 * @param {string} base64
 */
function keyId(base64) {
  const line = Buffer.from(base64, "base64").toString("utf8").split("\n")[1] ?? "";
  return Buffer.from(line, "base64").subarray(2, 10).toString("hex");
}

/**
 * @param {string} file
 * @param {string[]} args
 * @param {boolean} allowFailure
 * @param {NodeJS.ProcessEnv} env
 * @param {string} cwd
 */
function capture(file, args, allowFailure, env, cwd) {
  const result = spawnSync(file, args, { cwd, encoding: "utf8", env });
  if (result.status !== 0) {
    if (allowFailure) return "";
    throw new Error(`${file} ${args.join(" ")} failed:\n${(result.stderr || result.error?.message || "").trim()}`);
  }
  return result.stdout.trim();
}

/**
 * @param {string} file
 * @param {string[]} args
 * @param {NodeJS.ProcessEnv} env
 * @param {string} [cwd]
 */
function run(file, args, env, cwd) {
  const result = spawnSync(file, args, { stdio: "inherit", env, cwd });
  if (result.status !== 0) throw new Error(`${[file, ...args].join(" ")} failed.`);
}
