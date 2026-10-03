# Third-party components

Flare Launcher's own code is under the GNU General Public License v3 (see [LICENSE](LICENSE)). It also ships these
components, which keep their own licences.

## Steamworks API

`src-tauri/steam_api64.dll` (Windows) and `src-tauri/libsteam_api.so` (Linux) are the Steamworks API redistributables
from Valve Corporation, copied from the [`steamworks-sys`](https://crates.io/crates/steamworks-sys) crate. They are not
covered by the GPL. They are included so the launcher can download Workshop mods through the Steam client, and are
distributed under Valve's Steamworks SDK terms. Steam and Steamworks are trademarks of Valve Corporation.

## Fonts

The launcher and the download page use Fira Sans and Fira Code, under the SIL Open Font License 1.1. Their licence
texts are in `site/public/fonts/OFL-fira-sans.txt` and `site/public/fonts/OFL-fira-code.txt`.

- Fira Sans: Copyright 2012-2018 The Mozilla Foundation and Telefonica S.A.
- Fira Code: Copyright 2014-2020 The Fira Code Project Authors.

## Libraries

The Rust and JavaScript libraries the launcher is built with, such as Tauri, React and Radix UI, are listed in
`src-tauri/Cargo.toml` and `package.json` (and in full in `src-tauri/Cargo.lock` and `pnpm-lock.yaml`). Almost all
use permissive licences such as MIT, Apache 2.0, ISC, BSD or Zlib; a few use the Mozilla Public License 2.0 or the
Unicode and CDLA-Permissive data licences. All of them are compatible with the GPL v3.
