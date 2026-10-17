// Publishes the launcher's releases to GitHub and its update feed, with the release script every Flare app shares
// (@flare/release, in the flare-common repo beside this one). The builds are made and published by the Release
// workflow (.github/workflows/release.yml), which runs when a v<version> tag is pushed.
//
//   node scripts/publish-update.ts release           (pnpm release) tag the commit and push the tag, once CI passed on
//                                                    it, which starts the Release workflow
//   node scripts/publish-update.ts publish           (the workflow) sign the builds, publish the GitHub release, then
//                                                    the update feed's channel files
//   node scripts/publish-update.ts feed <dir> [url]  sign local builds and write a feed to <dir>, for testing
//   node scripts/publish-update.ts check             (CI) go through publishing as far as it can without the signing key
//   node scripts/publish-update.ts keygen            create the signing key (once) and print its public key
//
// The feed is https://updates.darkzone.dev/dayz-server-launcher/, named after the launcher's first name, DayZ Server
// Launcher, and kept: installed copies check this address for updates. It must match the feed given to the updater
// plugin in src-tauri/src/lib.rs. Every release carries every build, so no player is left with a feed that has nothing
// for them.
import { release } from "@flare/release";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(root, "src-tauri", "target");
const linuxBundles = join(target, "linux", "release", "bundle");

await release({
  name: "Flare Launcher",
  app: root,
  root,
  repo: "CallMeLewis/flare-launcher",
  feed: "dayz-server-launcher",
  keyPath: process.env.DZSL_UPDATE_SIGNING_KEY ?? join(homedir(), ".dayz-server-launcher", "update-signing-key"),
  script: "node scripts/publish-update.ts",
  // Beside this repo, as the launcher links to it, and on the tag in .flare-common-version.
  common: { dir: resolve(root, "..", "flare-common"), versionFile: join(root, ".flare-common-version") },
  builds: [
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
  ],
});
