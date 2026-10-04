// Builds the Linux AppImage, .deb and .rpm inside an Ubuntu 22.04 container (scripts/linux-build.Containerfile), so
// they run on Ubuntu 22.04, Debian 12 and newer rather than only on systems as new as this one. Needs podman.
//
//   node scripts/build-linux.ts     (pnpm dist:linux)
//
// Output goes to src-tauri/target/linux/release/bundle/{appimage,deb,rpm}/. The container keeps its own node_modules
// and download caches in podman volumes, so the local node_modules is left alone and later builds are quicker.
import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const image = "flare-launcher-linux-build";

function run(args: string[]) {
  const result = spawnSync("podman", args, { stdio: "inherit" });
  if (result.error) throw new Error(`podman couldn't be started (${result.error.message}). Install podman first.`);
  if (result.status !== 0) throw new Error(`podman ${args[0]} failed.`);
}

try {
  // Cached after the first time; rebuilt only when the Containerfile changes.
  run(["build", "--tag", image, "--file", join(root, "scripts", "linux-build.Containerfile"), join(root, "scripts")]);
  // Each flag stays on one line with its value.
  // prettier-ignore
  run([
    "run",
    "--rm",
    "--volume", `${root}:/src`,
    "--volume", "flare-launcher-node-modules:/src/node_modules",
    "--volume", "flare-launcher-cargo-registry:/usr/local/cargo/registry",
    "--volume", "flare-launcher-rustup:/usr/local/rustup",
    "--volume", "flare-launcher-pnpm-store:/pnpm-store",
    "--env", "CARGO_TARGET_DIR=/src/src-tauri/target/linux",
    "--env", "COREPACK_ENABLE_DOWNLOAD_PROMPT=0",
    image,
    "bash", "-c", "rustup toolchain install && pnpm install --frozen-lockfile && pnpm tauri build --bundles appimage,deb,rpm",
  ]);
  // Tauri's frontend build, a pnpm run inside another, leaves an empty pnpm index beside the project whatever the store
  // setting. Nothing outside the container uses it.
  rmSync(join(root, ".pnpm-store"), { recursive: true, force: true });
  console.log("\nLinux builds are in src-tauri/target/linux/release/bundle/");
} catch (error) {
  console.error(`\n${error instanceof Error ? error.message : error}`);
  process.exit(1);
}
