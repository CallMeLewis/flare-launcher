# Developing Flare Launcher

Built with Tauri v2, Rust, React, TypeScript, Tailwind CSS and shadcn/ui. Every change has to work on both Windows and
Linux: see [Windows and Linux](#windows-and-linux).

## Run it

Needs Node.js 24, pnpm 11 and rustup, which installs the Rust version pinned in `rust-toolchain.toml` the first time
it's used. On Linux, Tauri also needs the WebKitGTK development packages.

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
pnpm lint                                   # lint the frontend and scripts (cargo clippy covers the backend)
pnpm format                                 # format the frontend and backend; CI fails on unformatted code
```

## Build

```sh
pnpm dist:linux   # Linux AppImage, .deb and .rpm, built in an Ubuntu 22.04 container
pnpm dist:cross   # Windows installer, cross-built from Linux
pnpm dist         # Windows installer, on Windows
```

Cross-building for Windows needs `nsis`, `lld`, `llvm`, `clang`, `cargo-xwin` and the `x86_64-pc-windows-msvc` Rust
target (`rustup target add x86_64-pc-windows-msvc`, again after each Rust version bump). The installer lands in
`src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/`.
`cargo check --target x86_64-pc-windows-msvc` type-checks the Windows-only code without a full build.

`pnpm dist:linux` needs podman. It builds inside Ubuntu 22.04 (`scripts/linux-build.Containerfile`), because Linux
programs only run on systems at least as new as the one they were built on: built there, they run on Ubuntu 22.04,
Debian 12 and newer. The builds land in `src-tauri/target/linux/release/bundle/{appimage,deb,rpm}/`. The first run
sets up the container and takes a while; later runs reuse its caches, and only set it up again when the Containerfile
or the Rust version changes. `pnpm app` and `pnpm app:build` still build directly on this machine, for development.
CI pulls the container from GitHub's container registry instead of setting it up each run; a push to `main` that
changes it publishes the new one there.

Each build stops if `CHANGELOG.md` has no section for the version being built (see [Releasing](#releasing)).

## Windows and Linux

The launcher ships for both, and a feature, fix or release that only works on one of them is not finished.

- **Windows:** an NSIS installer and the launcher's own title bar. Mods are linked into the DayZ folder with
  junctions, and DayZ starts through `DayZ_BE.exe`. Steam is found through the registry.
- **Linux:** an AppImage, a `.deb` and an `.rpm`, all with the system title bar. Each install updates itself in its own
  format (`.deb` and `.rpm` updates ask for the password, as system packages do). Mods are linked with symlinks, and
  DayZ starts through `steam -applaunch`, so Steam runs it under Proton with BattlEye. Steam is found in
  `~/.steam/steam`, `~/.local/share/Steam`, `~/.steam/debian-installation`, and the Flatpak and Snap folders. When the
  game is in the Flatpak's library, or the Flatpak is the only Steam, it starts through
  `flatpak run com.valvesoftware.Steam -applaunch` instead. DayZ can freeze under Proton when `vm.max_map_count` is
  below 1048576, as on Ubuntu 22.04 and Debian 12, so the server panel warns then and shows the commands to raise it.
  On first run the AppImage offers to add itself to the app menu (also in Settings > Launcher): it moves the AppImage
  to `~/Applications/Flare-Launcher.AppImage`, writes `~/.local/share/applications/flare-launcher.desktop` and an icon,
  then reopens from the new place.
- Steam's library ships per platform: `src-tauri/steam_api64.dll` through `tauri.windows.conf.json` and
  `src-tauri/libsteam_api.so` through `tauri.linux.conf.json`. Both are Valve's redistributable Steamworks library,
  copied from the `steamworks-sys` crate.
- DayZ is a Windows program on both, so anything passed to the game (such as `-mod=` paths) stays Windows-style.

When writing code:

- Put platform differences behind `cfg(windows)` / `cfg(target_os = "linux")` in Rust, with both branches written, not
  one branch and a `todo!()`. Keep the frontend platform-neutral: ask the backend or the window rather than sniffing the
  user agent.
- Anything platform-specific added to bundling (resources, libraries) goes in `tauri.windows.conf.json` or
  `tauri.linux.conf.json`, not in the shared `tauri.conf.json`.
- Wording must suit both: "this computer", not "this PC" or "Windows", unless the text is about one platform only.

Before opening a pull request:

- Build both, `pnpm dist:cross` and `pnpm dist:linux`. Both must succeed.
- Run the Linux build, not just compile it. Under Xvfb for most things; for anything about the window or title bar,
  under Weston nested in Xvfb with `GDK_BACKEND=wayland`, because Ubuntu uses Wayland and behaves differently from X11.
  The window is created with the system title bar because Wayland ignores turning it on later.
- Say in the pull request which platform-specific parts you couldn't test (anything needing real Steam, DayZ or
  Windows).

What hasn't been tried for real yet: finding Steam through the registry, junctions, starting `DayZ_BE.exe`, the Windows
ping path and mod downloads compile for Windows but haven't been run on a Windows PC with Steam and DayZ installed. The
download screens have only been exercised against a simulated Steam. On Linux, the AppImage starts, loads the server
list and pings servers, but joining, mod downloads and launching through Proton haven't been tried with Steam and DayZ
installed. The Discord status has been tried against Discord on Windows, but not on Linux, including its Flatpak and
Snap packages.

## Languages

The interface is translated with [Lingui](https://lingui.dev). It's written in British English (`en-GB`), which is
also what any other language falls back to, and comes in American English (`en-US`), French (`fr`), German (`de`)
and Spanish (`es`) too. Each language's catalogue is a file in `src/locales/`, packaged with the app as a file of its
own and loaded when chosen in Settings > Launcher. System, the default, uses the computer's language when the launcher has it.

- To add a language, add it to `locales` in `lingui.config.ts`, to `Locale` in `src/lib/types.ts` and to `LOCALES` in
  `src/lib/i18n.ts` (named in itself), run `pnpm i18n`, then translate every entry of its new `.po` file. A test fails
  while any message is untranslated or a translation drops a placeholder or tag.
- French addresses the player as "vous", German as "du" and Spanish as "tú".

- Mark interface text where it's written: `<Trans>Refresh</Trans>` in JSX, and `t` from `useLingui()` for
  attributes, toasts and other strings. Use `msg` for labels kept in module-level constants and translate them when
  shown, since module code runs before the language loads. Counts go through `plural`.
- After changing interface text, run `pnpm i18n` to update the catalogues, and commit them with the change. CI fails
  when they're out of date.
- `en-US.po` only needs the messages spelled differently, such as "Minimise" or "favourite"; the rest fall back to
  British English. A test fails when a message with a British spelling has no American translation.
- Text the Rust backend shows the player is written with `text!("Couldn't find {host}.", host = host)`. It reaches the
  interface as its English template and values and is translated there. Templates are listed in
  `src/lib/backend-messages.ts`; a test fails when the list and the Rust code differ. Text from elsewhere, such as the
  system's own error messages, goes in a placeholder and isn't translated.
- Server, mod and map names, release notes and the Discord activity aren't translated.

## Layout

- `src/`: the interface. `App.tsx` holds the state, `components/` the screens, `lib/filter.ts` the filtering and
  sorting, `lib/backend.ts` every call into Rust, `lib/i18n.ts` loading languages and `locales/` their catalogues.
- `src-tauri/src/servers.rs`: downloads and caches the server list.
- `src-tauri/src/query.rs`: ICMP ping for latency and Steam A2S_INFO queries for player counts.
- `src-tauri/src/countries.rs`: finds the country a server's address is in, from the table in
  `src-tauri/data/countries.bin`. `pnpm countries` rebuilds it from DB-IP's free IP to Country Lite database, which
  Settings > About credits as its licence asks.
- `src-tauri/src/steam.rs`: finds Steam, DayZ and the Workshop folder, and reads which mods the player is subscribed to.
- `src-tauri/src/launch.rs`: links mods into `<DayZ>/!dzsl` and starts the game.
- `src-tauri/src/workshop.rs`: subscribes to, downloads and unsubscribes from mods through Steamworks.
- `src-tauri/src/discord.rs`: shows the Discord status, the launcher and whether DayZ is running, never the server.
  Its art comes from the Flare Launcher application in Discord's developer portal, as the asset `logo`.
- `src-tauri/src/updater.rs`: checks for, downloads and installs launcher updates.
- `src-tauri/src/app_menu.rs`: on Linux, moves the AppImage to `~/Applications` and adds it to the app menu.
- `src-tauri/windows/installer-hooks.nsh`: removes an install made under the launcher's old name.
- `scripts/`: the release tooling. `CHANGELOG.md` holds every version's notes, read through `scripts/changelog.ts`.
- `docs/design.md`: the visual rules the launcher follows.
- `docs/commit-messages.md`: how commit messages are written.
- `src-tauri/icons/source.svg`: the icon artwork. Regenerate the icon set with `pnpm tauri icon src-tauri/icons/source.svg`.

## Releasing

Releases are built and published by the Release workflow (`.github/workflows/release.yml`) on GitHub Actions: it builds
the Windows installer and the Linux AppImage, .deb and .rpm, signs them, publishes them as the GitHub release
`v<version>` and then updates the update feed. Every release carries both platforms: the workflow publishes nothing
unless both built.

The update feed is on Cloudflare R2, at `https://updates.darkzone.dev/dayz-server-launcher/`: `latest.json` for the
stable channel and `beta.json` for beta, each pointing at the builds on its version's GitHub release. The workflow
writes it with the repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. A stable release also updates `beta.json`
when it is newer than the latest beta. Builds are signed with the update signing key, kept at
`~/.dayz-server-launcher/update-signing-key` (back it up: without it no further updates can be shipped) and in the
repository secret `TAURI_SIGNING_PRIVATE_KEY`. The launcher refuses an update whose signature or signed version doesn't
match the public key in `src-tauri/tauri.conf.json`.

1. `pnpm bump <version>` sets the version in `package.json` (which `tauri.conf.json` reads), `Cargo.toml` and
   `Cargo.lock`, and adds a dated section for it at the top of `CHANGELOG.md`. `1.2.0` is stable, `1.2.0-beta.1` is
   beta.
2. Write the release notes in that section, following [release-notes.md](release-notes.md).
3. Commit and push, then `pnpm release`. It checks the release notes, tags the commit `v<version>` and pushes the tag,
   which starts the workflow. It refuses to run with uncommitted or unpushed changes. Follow the build with `gh run watch`.

To build a tag again (after a failed run, say), run the Release workflow from the Actions tab on `main` and enter the tag
(or `gh workflow run release.yml -f tag=v<version>`). The workflow comes from `main`, so fixes to it apply, and the code
from the tag. It replaces that release's builds.

To try the update flow without publishing, write a feed to a folder with `pnpm release:feed <dir> <url>`, serve the
folder at `<url>`, and start a development build with `DZSL_UPDATE_TEST_URL=<url>`. Development builds otherwise don't
check for updates.

## The download page

The download page at [flarelauncher.app](https://flarelauncher.app) is kept separately. It reads the update feed for
its downloads and this repo's `CHANGELOG.md` for its changelog, both when visited, so a release needs nothing from it.
