# Developing Flare Launcher

Built with Tauri v2, Rust, React, TypeScript, Tailwind CSS and shadcn/ui. Every change has to work on both Windows and
Linux: see [platforms.md](platforms.md) for how the two differ.

## Run it

Needs Node.js 24, pnpm 11 and a stable Rust toolchain. On Linux, Tauri also needs the WebKitGTK development packages.

```sh
pnpm install
pnpm app          # the desktop app, with hot reload
pnpm dev          # the interface alone in a browser at http://127.0.0.1:5173
```

In a plain browser the interface loads the server list straight from its public API. Ping, mod checks and launching
only work in the desktop app.

## Test

```sh
pnpm test                                   # frontend unit tests
cd src-tauri && cargo test                  # backend unit tests
cd src-tauri && cargo test -- --ignored     # live checks against the real server list and Workshop
```

## Build

```sh
pnpm dist:linux   # Linux AppImage, .deb and .rpm, built in an Ubuntu 22.04 container
pnpm dist:cross   # Windows installer, cross-built from Linux
pnpm dist         # Windows installer, on Windows
```

Cross-building for Windows needs `nsis`, `lld`, `llvm` and `clang`, the `x86_64-pc-windows-msvc` Rust target and
`cargo-xwin`. The installer lands in `src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/`.
`cargo check --target x86_64-pc-windows-msvc` type-checks the Windows-only code without a full build.

`pnpm dist:linux` needs podman. It builds inside Ubuntu 22.04 (`scripts/linux-build.Containerfile`), because Linux
programs only run on systems at least as new as the one they were built on: built there, they run on Ubuntu 22.04,
Debian 12 and newer. The builds land in `src-tauri/target/linux/release/bundle/{appimage,deb,rpm}/`. The first run
sets up the container and takes a while; later runs reuse its caches. `pnpm app` and `pnpm app:build` still build
directly on this machine, for development.

Each build stops if `CHANGELOG.md` has no section for the version being built (see [Releasing](#releasing)).

## How it works on each platform

- **Windows:** an NSIS installer and the launcher's own title bar. Mods are linked into the DayZ folder with
  junctions, and DayZ starts through `DayZ_BE.exe`. Steam is found through the registry.
- **Linux:** an AppImage, a `.deb` and an `.rpm`, all with the system title bar. Each install updates itself in its own
  format (`.deb` and `.rpm` updates ask for the password, as system packages do). Mods are linked with symlinks, and
  DayZ starts through `steam -applaunch`, so Steam runs it under Proton with BattlEye. Steam is found in
  `~/.steam/steam`, `~/.local/share/Steam` and the Flatpak folder. On first run the AppImage offers to add itself to the
  app menu (also in Settings > General): it moves the AppImage to `~/Applications/Flare-Launcher.AppImage`, writes
  `~/.local/share/applications/flare-launcher.desktop` and an icon, then reopens from the new place.
- Steam's library ships per platform: `src-tauri/steam_api64.dll` through `tauri.windows.conf.json` and
  `src-tauri/libsteam_api.so` through `tauri.linux.conf.json`. Both are Valve's redistributable Steamworks library,
  copied from the `steamworks-sys` crate.

What hasn't been tried for real yet: finding Steam through the registry, junctions, starting `DayZ_BE.exe`, the Windows
ping path and mod downloads compile for Windows but haven't been run on a Windows PC with Steam and DayZ installed. The
download screens have only been exercised against a simulated Steam. On Linux, the AppImage starts, loads the server
list and pings servers, but joining, mod downloads and launching through Proton haven't been tried with Steam and DayZ
installed.

## Layout

- `src/`: the interface. `App.tsx` holds the state, `components/` the screens, `lib/filter.ts` the filtering and
  sorting, `lib/backend.ts` every call into Rust.
- `src-tauri/src/servers.rs`: downloads and caches the server list.
- `src-tauri/src/query.rs`: ICMP ping for latency and Steam A2S_INFO queries for player counts.
- `src-tauri/src/steam.rs`: finds Steam, DayZ and the Workshop folder.
- `src-tauri/src/launch.rs`: links mods into `<DayZ>/!dzsl` and starts the game.
- `src-tauri/src/workshop.rs`: subscribes to and downloads mods through Steamworks.
- `src-tauri/src/updater.rs`: checks for, downloads and installs launcher updates.
- `src-tauri/src/app_menu.rs`: on Linux, moves the AppImage to `~/Applications` and adds it to the app menu.
- `src-tauri/windows/installer-hooks.nsh`: removes an install made under the launcher's old name (see below).
- `scripts/`: the release tooling. `CHANGELOG.md` holds every version's notes, read through `scripts/changelog.mjs`.
- `site/`: the download page.
- `docs/design.md` and `docs/design-download-page.md`: the visual rules the launcher and the download page follow.
- `src-tauri/icons/source.svg`: the icon artwork. Regenerate the icon set with `pnpm tauri icon src-tauri/icons/source.svg`.

## The old name

The launcher was first called DayZ Server Launcher. A few things keep that name on purpose, so installed copies carry
on working: the update feed's address (`updates.darkzone.dev/dayz-server-launcher/`), the app identifier
(`com.callmelewis.dayzserverlauncher`, which holds players' settings), the signing-key folder and the `!dzsl` mod-link
folder. On Windows, the first Flare Launcher installer removes an old DayZ Server Launcher install and recreates its
shortcuts under the new name.

## Releasing

Releases are built and published by the Release workflow (`.github/workflows/release.yml`) on GitHub Actions: it builds
the Windows installer and the Linux AppImage, .deb and .rpm, signs them, publishes them as the GitHub release
`v<version>` and then updates the update feed.

The update feed is on Cloudflare R2, at `https://updates.darkzone.dev/dayz-server-launcher/`: `latest.json` for the
stable channel and `beta.json` for beta, each pointing at the builds on its version's GitHub release. The workflow
writes it with the repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. A stable release also updates `beta.json`
when it is newer than the latest beta. Builds are signed with the update signing key, kept at
`~/.dayz-server-launcher/update-signing-key` (back it up: without it no further updates can be shipped) and in the
repository secret `TAURI_SIGNING_PRIVATE_KEY`. The launcher refuses an update whose signature or signed version doesn't
match the public key in `src-tauri/tauri.conf.json`.

1. Set the new version in `package.json` (`tauri.conf.json` reads it from there). `1.2.0` is stable, `1.2.0-beta.1` is
   beta.
2. Add a section for the version at the top of `CHANGELOG.md`, following [release-notes.md](release-notes.md).
3. Commit and push, then `pnpm release`. It checks the release notes, tags the commit `v<version>` and pushes the tag,
   which starts the workflow, then redeploys the download page so its changelog shows the new version once it is out.
   It refuses to run with uncommitted or unpushed changes. Follow the build with `gh run watch`.

To build a tag again (after a failed run, say), run the Release workflow from the Actions tab on `main` and enter the tag
(or `gh workflow run release.yml -f tag=v<version>`). The workflow comes from `main`, so fixes to it apply, and the code
from the tag. It replaces that release's builds.

To try the update flow without publishing, write a feed to a folder with `pnpm release:feed <dir> <url>`, serve the
folder at `<url>`, and start a development build with `DZSL_UPDATE_TEST_URL=<url>`. Development builds otherwise don't
check for updates.

## The download page

`site/` offers the current stable build for the visitor's system, then opens a thank-you page that starts the download
and shows the first-run steps. It reads the same `latest.json`, so it needs no change when a release goes out.
`/changelog` lists every published version's notes, built from `CHANGELOG.md` when the page is deployed; a section
for a version that isn't in a feed yet stays hidden.
`pnpm site` runs it locally, and `pnpm site:deploy` publishes it to Cloudflare (a Worker with static assets, named
`flare-launcher`), served at [flare.darkzone.dev](https://flare.darkzone.dev).
