// Builds the Linux AppImage, .deb and .rpm inside an Ubuntu 22.04 container (scripts/linux-build.Containerfile), so
// they run on Ubuntu 22.04, Debian 12 and newer rather than only on systems as new as this one. Needs podman.
//
//   node scripts/build-linux.ts     (pnpm dist:linux)
//
// Output goes to src-tauri/target/linux/release/bundle/{appimage,deb,rpm}/. The container keeps its own node_modules
// and download caches in podman volumes, so the local node_modules is left alone and later builds are quicker.
//
// CI starts on a fresh machine every time, so it shares the container image through a registry instead of building it
// on every run: LINUX_BUILD_REGISTRY names the image there, and LINUX_BUILD_PUSH=true publishes it when it's missing.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const containerfile = join(root, "scripts", "linux-build.Containerfile");
// Rust is installed into the image from this file, so the container uses the same version as everywhere else.
const toolchain = readFileSync(join(root, "rust-toolchain.toml"), "utf8");
// Registry names must be lower case; the repository's owner isn't.
const registry = process.env.LINUX_BUILD_REGISTRY?.toLowerCase();
const push = process.env.LINUX_BUILD_PUSH === "true";

/** Runs podman, and reports whether it succeeded. */
function podman(args: string[]): boolean {
  const result = spawnSync("podman", args, { stdio: "inherit" });
  if (result.error) throw new Error(`podman couldn't be started (${result.error.message}). Install podman first.`);
  return result.status === 0;
}

function run(args: string[]) {
  if (!podman(args)) throw new Error(`podman ${args[0]} failed.`);
}

function build(image: string) {
  // prettier-ignore
  run([
    "build",
    "--tag", image,
    "--build-arg", `RUST_TOOLCHAIN=${toolchain}`,
    "--file", containerfile,
    join(root, "scripts"),
  ]);
}

/** The image to build in: built here, or taken from the registry when one is set. */
function image(): string {
  if (!registry) {
    // Cached after the first time; rebuilt only when the Containerfile or the Rust version changes.
    const local = "flare-launcher-linux-build";
    build(local);
    return local;
  }
  // Tagged by what goes into it, so a change to either gets a new image and an old one is never reused.
  const tag = createHash("sha256").update(readFileSync(containerfile)).update(toolchain).digest("hex").slice(0, 16);
  const shared = `${registry}:${tag}`;
  if (podman(["pull", "--quiet", shared])) return shared;
  console.log(`\n${shared} hasn't been published yet, so building it.`);
  build(shared);
  if (push) run(["push", shared]);
  return shared;
}

try {
  const tagged = image();
  // Each flag stays on one line with its value.
  // prettier-ignore
  run([
    "run",
    "--rm",
    "--volume", `${root}:/src`,
    "--volume", "flare-launcher-node-modules:/src/node_modules",
    "--volume", "flare-launcher-cargo-registry:/usr/local/cargo/registry",
    "--volume", "flare-launcher-pnpm-store:/pnpm-store",
    "--env", "CARGO_TARGET_DIR=/src/src-tauri/target/linux",
    "--env", "COREPACK_ENABLE_DOWNLOAD_PROMPT=0",
    tagged,
    "bash", "-c", "pnpm install --frozen-lockfile && pnpm tauri build --bundles appimage,deb,rpm",
  ]);
  // Tauri's frontend build, a pnpm run inside another, leaves an empty pnpm index beside the project whatever the store
  // setting. Nothing outside the container uses it.
  rmSync(join(root, ".pnpm-store"), { recursive: true, force: true });
  console.log("\nLinux builds are in src-tauri/target/linux/release/bundle/");
} catch (error) {
  console.error(`\n${error instanceof Error ? error.message : error}`);
  process.exit(1);
}
