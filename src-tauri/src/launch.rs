//! Links a server's mods into the DayZ folder and starts the game.

use std::ffi::OsStr;
use std::path::Path;
use std::process::Command;
use std::time::{Duration, Instant};

use serde::Deserialize;
use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, System, UpdateKind};
use tauri::{AppHandle, State};
#[cfg(not(target_os = "linux"))]
use tauri_plugin_opener::OpenerExt;

use crate::error::Result;
use crate::servers::ServerCache;
use crate::steam::{self, Install};
use crate::text;

/// Folder inside the DayZ directory that holds our links to Workshop mods.
/// Short relative paths keep the `-mod=` argument well under the Windows
/// command line limit on heavily modded servers.
const LINK_DIR: &str = "!dzsl";
/// The game itself, started by BattlEye's `DayZ_BE.exe` once its checks pass.
const GAME_PROCESS: &str = "DayZ_x64.exe";
const GAME_POLL_INTERVAL: Duration = Duration::from_millis(500);

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchRequest {
  server_id: String,
  dayz_dir: Option<String>,
  profile_name: Option<String>,
  password: Option<String>,
  extra_args: Option<String>,
}

fn non_empty(value: &Option<String>) -> Option<&str> {
  value.as_deref().map(str::trim).filter(|v| !v.is_empty())
}

/// A password is passed on exactly as typed: a space at either end can be part of it.
fn password(value: &Option<String>) -> Option<&str> {
  value.as_deref().filter(|v| !v.is_empty())
}

fn build_args(
  ip: &str,
  game_port: u16,
  mod_paths: &[String],
  profile_name: Option<&str>,
  password: Option<&str>,
  extra_args: Option<&str>,
) -> Vec<String> {
  let mut args = vec![format!("-connect={ip}"), format!("-port={game_port}")];
  if !mod_paths.is_empty() {
    args.push(format!("-mod={}", mod_paths.join(";")));
  }
  if let Some(name) = profile_name {
    args.push(format!("-name={name}"));
  }
  if let Some(password) = password {
    args.push(format!("-password={password}"));
  }
  if let Some(extra) = extra_args {
    args.extend(extra.split_whitespace().map(String::from));
  }
  args
}

#[cfg(windows)]
fn create_link(target: &Path, link: &Path) -> std::io::Result<()> {
  // Junctions, unlike symlinks, need no administrator rights.
  junction::create(target, link)
}

#[cfg(not(windows))]
fn create_link(target: &Path, link: &Path) -> std::io::Result<()> {
  std::os::unix::fs::symlink(target, link)
}

fn remove_link(link: &Path) -> std::io::Result<()> {
  // A junction is removed as a directory, a symlink as a file. Neither
  // touches the Workshop folder it points to.
  std::fs::remove_dir(link).or_else(|_| std::fs::remove_file(link))
}

/// A mod's full path as the game sees it: a Windows path everywhere, because on Linux Steam runs DayZ under Proton,
/// which shows the whole file system as drive Z:.
fn game_path(path: &Path) -> String {
  let path = path.display().to_string();
  if cfg!(windows) { path } else { format!("Z:{}", path.replace('/', "\\")) }
}

/// Links each mod into `!dzsl` and returns how `-mod=` should name it: by its link when it has one, otherwise by its
/// full path. Some drives can't hold links at all, such as exFAT and FAT32 ones on Windows (which refuse with
/// "Incorrect function"), and there a link only shortens the command line, so its full path does the same job.
fn link_mods(install: &Install, mod_ids: &[u64]) -> Result<Vec<String>> {
  let link_dir = install.dayz_dir.join(LINK_DIR);
  std::fs::create_dir_all(&link_dir).map_err(|e| {
    log::warn!("could not create {}: {e}", link_dir.display());
    text!("The launcher couldn't make the {folder} folder in the DayZ folder: {error}", folder = LINK_DIR, error = e)
  })?;
  let mut mod_paths = Vec::with_capacity(mod_ids.len());
  for &id in mod_ids {
    let target = install.mod_dir(id);
    let link = link_dir.join(format!("@{id}"));
    let linked = format!("{LINK_DIR}\\@{id}");
    // Compared by where both lead: Windows reads a junction back as a `\\?\` path, never equal to the target as written.
    let resolved = std::fs::canonicalize(&link).ok();
    if resolved.is_some() && resolved == std::fs::canonicalize(&target).ok() {
      mod_paths.push(linked);
      continue;
    }
    if link.symlink_metadata().is_ok() {
      remove_link(&link).map_err(|e| {
        log::warn!("could not replace {}: {e}", link.display());
        // Most likely a real folder with files in it, put there by hand or by another program.
        text!(
          "{folder} in the DayZ folder isn't a link the launcher made, so it can't be replaced. Move or delete it, then try again.",
          folder = format!("{LINK_DIR}{}@{id}", std::path::MAIN_SEPARATOR)
        )
      })?;
    }
    match create_link(&target, &link) {
      Ok(()) => mod_paths.push(linked),
      Err(e) => {
        log::warn!("could not link {} to {}, so passing its full path: {e}", link.display(), target.display());
        // A junction that can't be made leaves its empty folder behind. Only an empty folder is removed.
        let _ = std::fs::remove_dir(&link);
        mod_paths.push(game_path(&target));
      }
    }
  }
  Ok(mod_paths)
}

#[cfg(windows)]
fn game_command(install: &Install, args: &[String]) -> Command {
  let mut command = Command::new(install.dayz_dir.join("DayZ_BE.exe"));
  command.current_dir(&install.dayz_dir).args(args);
  command
}

#[cfg(not(windows))]
fn game_command(install: &Install, args: &[String]) -> Command {
  let mut command = match steam::client_for(install) {
    steam::SteamClient::Native => Command::new("steam"),
    steam::SteamClient::Flatpak => {
      let mut command = Command::new("flatpak");
      command.args(["run", steam::FLATPAK_STEAM]);
      command
    }
  };
  command.arg("-applaunch").arg(steam::DAYZ_APP_ID.to_string()).args(args).arg("-nolauncher");
  // From the AppImage, Steam would otherwise inherit its libraries and fail to start the game.
  #[cfg(target_os = "linux")]
  crate::desktop::without_appimage_env(&mut command);
  command
}

// Async so linking the mods and starting the game happen off the window's thread.
#[tauri::command(async)]
pub fn launch(cache: State<'_, ServerCache>, request: LaunchRequest) -> Result<()> {
  let (ip, game_port, mod_ids) = {
    let servers = cache.0.read().unwrap();
    let server = servers
      .get(&request.server_id)
      .ok_or_else(|| text!("That server is no longer in the list. Refresh and try again."))?;
    let mod_ids: Vec<u64> = server.mods.iter().map(|m| m.steam_workshop_id).collect();
    (server.row.ip.clone(), server.row.game_port, mod_ids)
  };

  let install = steam::locate(request.dayz_dir.as_deref())
    .ok_or_else(|| text!("DayZ wasn't found. Set the DayZ folder in Settings."))?;

  let missing = mod_ids.iter().filter(|&&id| !install.is_mod_installed(id)).count();
  if missing > 0 {
    return Err(
      text!(
        "{missing, plural, one {# required mod is} other {# required mods are}} not installed yet.",
        missing = missing
      )
      .into(),
    );
  }

  let mod_paths = link_mods(&install, &mod_ids)?;
  let args = build_args(
    &ip,
    game_port,
    &mod_paths,
    non_empty(&request.profile_name),
    password(&request.password),
    non_empty(&request.extra_args),
  );
  let mut child = game_command(&install, &args).spawn().map_err(|e| {
    #[cfg(not(windows))]
    if e.kind() == std::io::ErrorKind::NotFound {
      return text!("Steam wasn't found on this computer. Install Steam, then try again.");
    }
    text!("DayZ couldn't be started: {error}", error = e)
  })?;
  // Collected once it ends, so it doesn't linger as a finished process while the launcher stays open.
  std::thread::spawn(move || child.wait());
  Ok(())
}

/// Whether a process is the game, from its name and the program on its command line. Under Proton the game soon
/// renames its process (to `enfMain`), but its command line still starts with its Windows path.
fn is_game(name: &OsStr, program: Option<&OsStr>) -> bool {
  let file_name = |path: &OsStr| path.to_string_lossy().rsplit(['/', '\\']).next() == Some(GAME_PROCESS);
  name == GAME_PROCESS || program.is_some_and(file_name)
}

pub(crate) fn game_running(system: &mut System) -> bool {
  let refresh = ProcessRefreshKind::nothing().with_cmd(UpdateKind::OnlyIfNotSet);
  system.refresh_processes_specifics(ProcessesToUpdate::All, true, refresh);
  system.processes().values().any(|process| is_game(process.name(), process.cmd().first().map(|arg| arg.as_os_str())))
}

/// Waits for the game to start, up to `timeout_secs`. Returns whether it did.
#[tauri::command]
pub async fn wait_for_game(timeout_secs: u64) -> bool {
  // Listing every process with its command line takes a while, so it's done on a thread of its own.
  let waited = tauri::async_runtime::spawn_blocking(move || {
    let deadline = Instant::now() + Duration::from_secs(timeout_secs);
    let mut system = System::new();
    while Instant::now() < deadline {
      if game_running(&mut system) {
        return true;
      }
      std::thread::sleep(GAME_POLL_INTERVAL);
    }
    false
  });
  waited.await.unwrap_or(false)
}

/// The `vm.max_map_count` DayZ needs on Linux. Below it, the game can freeze in the main menu or soon after joining.
/// Newer systems already use it by default; Ubuntu 22.04 and Debian 12 have 65530.
const MAP_COUNT_NEEDED: u64 = 1_048_576;

/// On Linux, the system's limit on how many memory areas a program may map, when it's too low for DayZ. `None` when it's
/// high enough or can't be read, and always on Windows.
#[tauri::command]
pub fn low_map_count() -> Option<u64> {
  #[cfg(target_os = "linux")]
  return std::fs::read_to_string("/proc/sys/vm/max_map_count").ok().and_then(|value| too_low(&value));
  #[cfg(not(target_os = "linux"))]
  None
}

#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
fn too_low(map_count: &str) -> Option<u64> {
  map_count.trim().parse().ok().filter(|&count| count < MAP_COUNT_NEEDED)
}

/// Opens a mod's Workshop page in the Steam client so it can be subscribed to.
#[tauri::command]
pub fn open_workshop_page(app: AppHandle, id: u64) -> Result<()> {
  let url = format!("steam://url/CommunityFilePage/{id}");
  #[cfg(target_os = "linux")]
  let opened = {
    let _ = app;
    crate::desktop::open(&url).map_err(|e| e.to_string())
  };
  #[cfg(not(target_os = "linux"))]
  let opened = app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string());
  opened.map_err(|e| text!("Steam couldn't be opened: {error}", error = e).into())
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn keeps_a_password_exactly_as_typed() {
    let typed = |value: &str| password(&Some(value.to_string())).map(String::from);
    assert_eq!(typed(" spaced out "), Some(" spaced out ".to_string()));
    assert_eq!(typed("Пароль 日本語 🙂"), Some("Пароль 日本語 🙂".to_string()));
    assert_eq!(typed(""), None);
    assert_eq!(password(&None), None);
    // Other settings still ignore stray spaces.
    assert_eq!(non_empty(&Some("  Survivor ".to_string())), Some("Survivor"));
  }

  #[test]
  fn builds_arguments_for_a_modded_server() {
    let mods = [r"!dzsl\@111".to_string(), r"F:\SteamLibrary\steamapps\workshop\content\221100\222".to_string()];
    let args = build_args("1.2.3.4", 2302, &mods, Some("Survivor"), Some("hunter2"), Some("-nosplash  -window"));
    assert_eq!(
      args,
      vec![
        "-connect=1.2.3.4".to_string(),
        "-port=2302".to_string(),
        r"-mod=!dzsl\@111;F:\SteamLibrary\steamapps\workshop\content\221100\222".to_string(),
        "-name=Survivor".to_string(),
        "-password=hunter2".to_string(),
        "-nosplash".to_string(),
        "-window".to_string(),
      ]
    );
  }

  #[test]
  fn omits_optional_arguments_for_a_vanilla_server() {
    assert_eq!(build_args("1.2.3.4", 2402, &[], None, None, None), vec!["-connect=1.2.3.4", "-port=2402"]);
  }

  #[cfg(windows)]
  #[test]
  fn names_a_mod_by_its_full_path_on_windows() {
    let path = Path::new(r"F:\SteamLibrary\steamapps\workshop\content\221100\111");
    assert_eq!(game_path(path), r"F:\SteamLibrary\steamapps\workshop\content\221100\111");
  }

  #[cfg(unix)]
  #[test]
  fn names_a_mod_through_protons_drive_z() {
    let path = Path::new("/home/survivor/.steam/steam/steamapps/workshop/content/221100/111");
    assert_eq!(game_path(path), r"Z:\home\survivor\.steam\steam\steamapps\workshop\content\221100\111");
  }

  #[test]
  fn recognises_the_game_on_windows_and_under_proton() {
    let os = OsStr::new;
    assert!(is_game(os("DayZ_x64.exe"), Some(os(r"C:\Steam\steamapps\common\DayZ\DayZ_x64.exe"))));
    // Under Proton, once the game has renamed its process.
    assert!(is_game(os("enfMain"), Some(os(r"S:\steamapps\common\DayZ\DayZ_x64.exe"))));
    assert!(!is_game(os("DayZLauncher.exe"), Some(os(r"S:\steamapps\common\DayZ\DayZLauncher.exe"))));
    // A shell whose arguments mention the game isn't it.
    assert!(!is_game(os("bash"), Some(os("bash"))));
    assert!(!is_game(os("enfMain"), None));
  }

  #[test]
  fn spots_a_map_count_too_low_for_dayz() {
    assert_eq!(
      too_low(
        "65530
"
      ),
      Some(65530)
    );
    assert_eq!(
      too_low(
        "1048576
"
      ),
      None
    );
    // SteamOS sets it far higher.
    assert_eq!(too_low("2147483642"), None);
    assert_eq!(too_low("not a number"), None);
  }

  #[test]
  fn ignores_blank_settings() {
    assert_eq!(non_empty(&Some("   ".into())), None);
    assert_eq!(non_empty(&Some(" Survivor ".into())), Some("Survivor"));
    assert_eq!(non_empty(&None), None);
  }

  #[cfg(unix)]
  #[test]
  fn links_mods_and_repairs_stale_links() {
    let root = std::env::temp_dir().join(format!("dzsl-link-test-{}", std::process::id()));
    let dayz_dir = root.join("steamapps/common/DayZ");
    let workshop_dir = root.join("steamapps/workshop/content/221100");
    std::fs::create_dir_all(&dayz_dir).unwrap();
    std::fs::create_dir_all(workshop_dir.join("111")).unwrap();
    std::fs::write(workshop_dir.join("111/meta.cpp"), "").unwrap();
    let install = Install { dayz_dir: dayz_dir.clone(), workshop_dir: workshop_dir.clone() };

    // A leftover link pointing somewhere else gets replaced.
    std::fs::create_dir_all(dayz_dir.join(LINK_DIR)).unwrap();
    std::os::unix::fs::symlink(root.join("elsewhere"), dayz_dir.join(LINK_DIR).join("@111")).unwrap();

    use std::os::unix::fs::MetadataExt;
    let link = dayz_dir.join(LINK_DIR).join("@111");
    link_mods(&install, &[111]).unwrap();
    let first = link.symlink_metadata().unwrap().ino();
    // A link that is already right is left alone.
    link_mods(&install, &[111]).unwrap();
    assert_eq!(link.symlink_metadata().unwrap().ino(), first);
    assert_eq!(std::fs::read_link(&link).unwrap(), workshop_dir.join("111"));
    assert!(link.join("meta.cpp").is_file());

    std::fs::remove_dir_all(root).unwrap();
  }

  // A folder no link can be made in stands in for a drive that can't hold links, such as an exFAT one on Windows.
  #[cfg(unix)]
  #[test]
  fn passes_the_full_path_when_a_mod_cant_be_linked() {
    use std::os::unix::fs::PermissionsExt;
    let root = std::env::temp_dir().join(format!("dzsl-no-links-test-{}", std::process::id()));
    let dayz_dir = root.join("steamapps/common/DayZ");
    let workshop_dir = root.join("steamapps/workshop/content/221100");
    let link_dir = dayz_dir.join(LINK_DIR);
    std::fs::create_dir_all(workshop_dir.join("111")).unwrap();
    std::fs::create_dir_all(&link_dir).unwrap();
    let install = Install { dayz_dir, workshop_dir: workshop_dir.clone() };

    std::fs::set_permissions(&link_dir, std::fs::Permissions::from_mode(0o555)).unwrap();
    // Root can write to it anyway, so then there's nothing to test.
    if std::fs::write(link_dir.join("probe"), "").is_err() {
      assert_eq!(link_mods(&install, &[111]).unwrap(), vec![game_path(&workshop_dir.join("111"))]);
      assert!(link_dir.join("@111").symlink_metadata().is_err());
    }

    std::fs::set_permissions(&link_dir, std::fs::Permissions::from_mode(0o755)).unwrap();
    std::fs::remove_dir_all(root).unwrap();
  }

  // Junctions on Windows, symlinks elsewhere.
  #[test]
  fn links_mods_but_leaves_real_folders_alone() {
    let root = std::env::temp_dir().join(format!("dzsl-real-folder-test-{}", std::process::id()));
    let dayz_dir = root.join("steamapps/common/DayZ");
    let workshop_dir = root.join("steamapps/workshop/content/221100");
    for id in ["111", "222"] {
      std::fs::create_dir_all(workshop_dir.join(id)).unwrap();
      std::fs::write(workshop_dir.join(id).join("meta.cpp"), id).unwrap();
    }
    std::fs::create_dir_all(&dayz_dir).unwrap();
    let install = Install { dayz_dir: dayz_dir.clone(), workshop_dir };

    assert_eq!(link_mods(&install, &[111]).unwrap(), vec![r"!dzsl\@111"]);
    assert_eq!(link_mods(&install, &[111]).unwrap(), vec![r"!dzsl\@111"]);
    assert_eq!(std::fs::read_to_string(dayz_dir.join(LINK_DIR).join("@111").join("meta.cpp")).unwrap(), "111");

    // A folder with files in it, made by someone else, is never deleted.
    let real = dayz_dir.join(LINK_DIR).join("@222");
    std::fs::create_dir_all(&real).unwrap();
    std::fs::write(real.join("keep.txt"), "mine").unwrap();
    let error = link_mods(&install, &[222]).unwrap_err().to_string();
    assert!(error.contains("isn't a link the launcher made"), "{error}");
    assert_eq!(std::fs::read_to_string(real.join("keep.txt")).unwrap(), "mine");

    std::fs::remove_dir_all(root).unwrap();
  }
}
