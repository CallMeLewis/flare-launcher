// Starts a built launcher and fails if it closes within its first seconds, so a build that compiles but crashes on start
// never reaches players through an update. CI runs it on every build, after making the build.
//
//   node scripts/smoke-test.ts <installer or program>
//
// A Windows installer (*-setup.exe) is installed silently into a scratch folder first, which also runs the installer's
// hooks, and the launcher it installed is started. Anything else is started as it is: on Linux, the AppImage, which
// needs a display (CI uses xvfb-run). It only proves the launcher stays open, not that every screen works.
import { spawn, spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

/** How long the launcher has to stay open. Long enough to load the interface and fetch the server list. */
const SECONDS = 20;

const [file] = process.argv.slice(2);
if (!file) {
  console.error("Usage: node scripts/smoke-test.ts <installer or program>");
  process.exit(1);
}

try {
  const program = basename(file).endsWith("-setup.exe") ? install(resolve(file)) : resolve(file);
  await staysOpen(program);
} catch (error) {
  console.error(`\n${error instanceof Error ? error.message : error}`);
  process.exit(1);
}

/** Installs silently into a scratch folder and returns the launcher it installed. */
function install(installer: string): string {
  const dir = mkdtempSync(join(tmpdir(), "flare-launcher-smoke-"));
  // NSIS takes the folder as the last argument, unquoted, even with spaces in it.
  const result = spawnSync(installer, ["/S", `/D=${dir}`], { stdio: "inherit" });
  if (result.error) throw new Error(`The installer couldn't be started: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`The installer failed with exit code ${result.status}.`);
  const programs = readdirSync(dir).filter((name) => name.endsWith(".exe") && name !== "uninstall.exe");
  if (programs.length !== 1) throw new Error(`Expected one program in ${dir}, found: ${programs.join(", ") || "none"}`);
  console.log(`Installed ${programs[0]} into ${dir}`);
  return join(dir, programs[0]);
}

/** Starts the launcher, fails if it exits within SECONDS, then closes it and everything it started. */
async function staysOpen(program: string): Promise<void> {
  if (process.platform !== "win32") chmodSync(program, 0o755);
  // Linux runners have no FUSE, which an AppImage normally mounts itself with; this unpacks it to a folder instead.
  const env = { ...process.env, APPIMAGE_EXTRACT_AND_RUN: "1" };
  // Its own process group on Linux, so closing it also closes the web view's processes.
  const child = spawn(program, [], { stdio: "inherit", env, detached: process.platform !== "win32" });
  const exited = new Promise<string>((done) => {
    child.on("error", (error) => done(`couldn't be started: ${error.message}`));
    child.on("exit", (code, signal) => done(`closed after starting (${signal ?? `exit code ${code}`})`));
  });
  const timer = new Promise<null>((done) => setTimeout(() => done(null), SECONDS * 1000));
  const failure = await Promise.race([exited, timer]);
  if (failure) throw new Error(`The launcher ${failure}.`);

  console.log(`The launcher stayed open for ${SECONDS} seconds.`);
  if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  else process.kill(-child.pid!, "SIGKILL");
  await exited;
}
