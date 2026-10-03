# Windows and Linux

The launcher ships for Windows and Linux, and every change must work on both. This is not optional: a feature, fix or
release that only works on one of them is not finished.

## How the two differ

- Windows: an NSIS installer, the launcher's own title bar, junctions for mod links, DayZ started through
  `DayZ_BE.exe`, Steam found through the registry, `steam_api64.dll`.
- Linux: an AppImage, a `.deb` and an `.rpm` (built on Ubuntu 22.04 so they run on older systems), the system title bar
  (the window is created with it; Wayland ignores turning it on later), symlinks for mod links, DayZ started through
  `steam -applaunch` so Steam runs it under Proton with BattlEye, Steam found in `~/.steam/steam`,
  `~/.local/share/Steam` and the Flatpak folder, `libsteam_api.so`.
- DayZ is a Windows program on both, so anything passed to the game (such as `-mod=` paths) stays Windows-style.

## When writing code

- Put platform differences behind `cfg(windows)` / `cfg(target_os = "linux")` in Rust, with both branches written, not
  one branch and a `todo!()`. Keep the frontend platform-neutral: ask the backend or the window rather than sniffing the
  user agent.
- Anything added to bundling (resources, libraries) goes in `tauri.windows.conf.json` or `tauri.linux.conf.json` when it
  is platform-specific, not in the shared `tauri.conf.json`.
- Wording must suit both: "this computer", not "this PC" or "Windows", unless the text is about one platform only.

## Before opening a pull request

- Build both: `pnpm dist:cross` (Windows, cross-built from Linux) and `pnpm dist:linux` (AppImage, `.deb` and `.rpm`, in
  an Ubuntu 22.04 container). Both must succeed.
- Run the Linux build, not just compile it. Under Xvfb for most things; for anything about the window or title bar, under
  Weston nested in Xvfb with `GDK_BACKEND=wayland`, because Ubuntu uses Wayland and behaves differently from X11.
- Say in the pull request which platform-specific parts you couldn't test (anything needing real Steam, DayZ or
  Windows).

## Releases

- Every release carries both builds; `pnpm release` refuses to publish until both exist.
- When a change only affects one platform, say so in its release-notes bullet (for example "On Linux, ...").
