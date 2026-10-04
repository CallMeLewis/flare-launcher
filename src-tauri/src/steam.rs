//! Finds the Steam, DayZ and Workshop folders on disk.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use serde::Serialize;

pub const DAYZ_APP_ID: u32 = 221100;

/// Present in every DayZ install, so it tells a real game folder apart.
const GAME_EXE: &str = "DayZ_x64.exe";

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Install {
  pub dayz_dir: PathBuf,
  pub workshop_dir: PathBuf,
}

impl Install {
  /// Builds an install from a DayZ folder inside a Steam library
  /// (`<library>/steamapps/common/DayZ`).
  fn from_dayz_dir(dayz_dir: PathBuf) -> Option<Self> {
    let steamapps = dayz_dir.parent()?.parent()?;
    let workshop_dir = steamapps.join("workshop").join("content").join(DAYZ_APP_ID.to_string());
    Some(Self { dayz_dir, workshop_dir })
  }

  pub fn mod_dir(&self, workshop_id: u64) -> PathBuf {
    self.workshop_dir.join(workshop_id.to_string())
  }

  /// When Steam last updated each installed mod, from its record of the Workshop folder.
  fn installed_update_times(&self) -> HashMap<u64, u64> {
    let manifest = self
      .workshop_dir
      .parent()
      .and_then(Path::parent)
      .map(|workshop| workshop.join(format!("appworkshop_{DAYZ_APP_ID}.acf")));
    manifest.and_then(|path| std::fs::read_to_string(path).ok()).map(|acf| parse_update_times(&acf)).unwrap_or_default()
  }

  /// A mod counts as installed once Steam has put files in its folder.
  pub fn is_mod_installed(&self, workshop_id: u64) -> bool {
    std::fs::read_dir(self.mod_dir(workshop_id)).map(|mut entries| entries.next().is_some()).unwrap_or(false)
  }
}

#[cfg(windows)]
fn steam_roots() -> Vec<PathBuf> {
  use winreg::RegKey;
  use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};

  let lookups = [
    (HKEY_CURRENT_USER, r"Software\Valve\Steam", "SteamPath"),
    (HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Valve\Steam", "InstallPath"),
    (HKEY_LOCAL_MACHINE, r"SOFTWARE\Valve\Steam", "InstallPath"),
  ];
  lookups
    .iter()
    .filter_map(|(hive, key, value)| RegKey::predef(*hive).open_subkey(key).ok()?.get_value::<String, _>(value).ok())
    .map(PathBuf::from)
    .collect()
}

#[cfg(not(windows))]
fn steam_roots() -> Vec<PathBuf> {
  let Some(home) = std::env::home_dir() else { return Vec::new() };
  vec![
    home.join(".steam/steam"),
    home.join(".local/share/Steam"),
    home.join(".var/app/com.valvesoftware.Steam/.local/share/Steam"),
  ]
}

/// Splits a line of a Valve KeyValues file into its quoted tokens.
fn quoted_tokens(line: &str) -> Vec<String> {
  let mut tokens = Vec::new();
  let mut chars = line.chars();
  while let Some(c) = chars.next() {
    if c != '"' {
      continue;
    }
    let mut token = String::new();
    while let Some(c) = chars.next() {
      match c {
        '"' => break,
        '\\' => token.extend(chars.next()),
        _ => token.push(c),
      }
    }
    tokens.push(token);
  }
  tokens
}

/// Reads each installed mod's `timeupdated` out of Steam's `appworkshop_221100.acf`.
fn parse_update_times(acf: &str) -> HashMap<u64, u64> {
  let mut times = HashMap::new();
  let mut sections: Vec<String> = Vec::new();
  let mut name = String::new();
  for line in acf.lines() {
    match (line.trim(), quoted_tokens(line).as_slice()) {
      ("{", _) => sections.push(std::mem::take(&mut name)),
      ("}", _) => drop(sections.pop()),
      (_, [section]) => name = section.clone(),
      (_, [key, value]) if key == "timeupdated" => {
        if let [.., parent, id] = sections.as_slice()
          && parent == "WorkshopItemsInstalled"
          && let (Ok(id), Ok(time)) = (id.parse(), value.parse())
        {
          times.insert(id, time);
        }
      }
      _ => {}
    }
  }
  times
}

/// Reads the library folders out of Steam's `libraryfolders.vdf`.
fn parse_library_paths(vdf: &str) -> Vec<PathBuf> {
  vdf
    .lines()
    .filter_map(|line| match quoted_tokens(line).as_slice() {
      [key, value] if key == "path" => Some(PathBuf::from(value)),
      _ => None,
    })
    .collect()
}

fn find_dayz(steam_root: &Path) -> Option<Install> {
  let vdf = std::fs::read_to_string(steam_root.join("steamapps").join("libraryfolders.vdf")).ok();
  let mut libraries = vdf.as_deref().map(parse_library_paths).unwrap_or_default();
  libraries.push(steam_root.to_path_buf());

  libraries.into_iter().find_map(|library| {
    let steamapps = library.join("steamapps");
    steamapps
      .join(format!("appmanifest_{DAYZ_APP_ID}.acf"))
      .is_file()
      .then(|| Install::from_dayz_dir(steamapps.join("common").join("DayZ")))?
  })
}

/// Locates DayZ. A folder chosen by the player in settings wins over
/// detection, as long as it really contains the game.
pub fn locate(custom_dayz_dir: Option<&str>) -> Option<Install> {
  if let Some(dir) = custom_dayz_dir.map(str::trim).filter(|dir| !dir.is_empty()) {
    let dir = PathBuf::from(dir);
    return dir.join(GAME_EXE).is_file().then(|| Install::from_dayz_dir(dir))?;
  }
  steam_roots().iter().find_map(|root| find_dayz(root))
}

#[tauri::command]
pub fn detect_install(dayz_dir: Option<String>) -> Option<Install> {
  locate(dayz_dir.as_deref())
}

/// How many Workshop mods for DayZ are downloaded on this PC.
#[tauri::command]
pub fn downloaded_mod_count(dayz_dir: Option<String>) -> Option<usize> {
  let install = locate(dayz_dir.as_deref())?;
  let entries = std::fs::read_dir(&install.workshop_dir).ok()?;
  Some(entries.filter_map(|e| e.ok()).filter(|e| e.path().is_dir()).count())
}

#[derive(serde::Deserialize, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub enum Folder {
  Game,
  Workshop,
}

/// Opens the DayZ or Workshop folder in the file manager.
#[tauri::command]
pub fn open_folder(app: tauri::AppHandle, dayz_dir: Option<String>, folder: Folder) -> crate::error::Result<()> {
  use tauri_plugin_opener::OpenerExt;
  let install = locate(dayz_dir.as_deref())
    .ok_or_else(|| crate::error::Error::msg("DayZ wasn't found. Set the DayZ folder in Settings."))?;
  let path = match folder {
    Folder::Game => install.dayz_dir,
    Folder::Workshop => install.workshop_dir,
  };
  app
    .opener()
    .open_path(path.to_string_lossy(), None::<&str>)
    .map_err(|e| crate::error::Error::msg(format!("The folder couldn't be opened: {e}")))
}

/// Returns which of the given Workshop mods are installed and up to date. A mod updated on the Workshop since Steam
/// last downloaded it is left out, so it is downloaded again before joining: a server kicks a player whose copy is
/// older than its own. When the Workshop can't be reached, every installed mod counts.
#[tauri::command]
pub async fn installed_mods(
  http: tauri::State<'_, reqwest::Client>,
  dayz_dir: Option<String>,
  ids: Vec<u64>,
) -> crate::error::Result<Vec<u64>> {
  let Some(install) = locate(dayz_dir.as_deref()) else { return Ok(Vec::new()) };
  let installed: Vec<u64> = ids.into_iter().filter(|&id| install.is_mod_installed(id)).collect();
  let latest = crate::workshop::latest_update_times(&http, &installed).await.unwrap_or_else(|e| {
    log::warn!("could not check the Workshop for mod updates: {e}");
    HashMap::new()
  });
  let local = install.installed_update_times();
  Ok(installed.into_iter().filter(|id| up_to_date(local.get(id), latest.get(id))).collect())
}

/// Whether a mod is current. Unknown on either side counts as current, so a missing record never blocks joining.
fn up_to_date(installed: Option<&u64>, latest: Option<&u64>) -> bool {
  match (installed, latest) {
    (Some(installed), Some(latest)) => installed >= latest,
    _ => true,
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn reads_library_paths_from_vdf() {
    let vdf = r#"
"libraryfolders"
{
	"0"
	{
		"path"		"C:\\Program Files (x86)\\Steam"
		"label"		""
		"apps"
		{
			"221100"		"25769803776"
		}
	}
	"1"
	{
		"path"		"D:\\SteamLibrary"
	}
}"#;
    assert_eq!(
      parse_library_paths(vdf),
      vec![PathBuf::from(r"C:\Program Files (x86)\Steam"), PathBuf::from(r"D:\SteamLibrary")]
    );
  }

  #[test]
  fn reads_update_times_of_installed_mods() {
    let acf = r#"
"AppWorkshop"
{
	"appid"		"221100"
	"WorkshopItemsInstalled"
	{
		"1559212036"
		{
			"size"		"2051364"
			"timeupdated"		"1700000000"
			"manifest"		"123"
		}
		"1750506510"
		{
			"timeupdated"		"1690000000"
		}
	}
	"WorkshopItemDetails"
	{
		"1559212036"
		{
			"timeupdated"		"1"
		}
		"999"
		{
			"timeupdated"		"5"
		}
	}
}
"#;
    let times = parse_update_times(acf);
    assert_eq!(times.len(), 2);
    assert_eq!(times[&1559212036], 1700000000);
    assert_eq!(times[&1750506510], 1690000000);
  }

  #[test]
  fn a_mod_updated_on_the_workshop_since_its_download_is_out_of_date() {
    assert!(!up_to_date(Some(&100), Some(&200)));
    assert!(up_to_date(Some(&200), Some(&200)));
    assert!(up_to_date(None, Some(&200)));
    assert!(up_to_date(Some(&100), None));
  }

  #[test]
  fn derives_workshop_dir_from_dayz_dir() {
    let install = Install::from_dayz_dir(PathBuf::from("/lib/steamapps/common/DayZ")).unwrap();
    assert_eq!(install.workshop_dir, PathBuf::from("/lib/steamapps/workshop/content/221100"));
    assert_eq!(install.mod_dir(1559212036), PathBuf::from("/lib/steamapps/workshop/content/221100/1559212036"));
  }

  #[test]
  fn only_accepts_a_chosen_folder_that_contains_the_game() {
    let root = std::env::temp_dir().join(format!("dzsl-custom-test-{}", std::process::id()));
    let dayz_dir = root.join("steamapps/common/DayZ");
    std::fs::create_dir_all(&dayz_dir).unwrap();
    let chosen = dayz_dir.to_string_lossy().into_owned();

    assert!(locate(Some(&chosen)).is_none(), "an empty folder is not DayZ");
    std::fs::write(dayz_dir.join(GAME_EXE), "").unwrap();
    let install = locate(Some(&format!("  {chosen}  "))).unwrap();
    assert_eq!(install.workshop_dir, root.join("steamapps/workshop/content/221100"));

    std::fs::remove_dir_all(root).unwrap();
  }

  #[test]
  fn finds_dayz_in_a_secondary_library() {
    let root = std::env::temp_dir().join(format!("dzsl-steam-test-{}", std::process::id()));
    let library = root.join("library");
    let steam = root.join("steam");
    std::fs::create_dir_all(steam.join("steamapps")).unwrap();
    std::fs::create_dir_all(library.join("steamapps/common/DayZ")).unwrap();
    std::fs::create_dir_all(library.join("steamapps/workshop/content/221100/111")).unwrap();
    std::fs::create_dir_all(library.join("steamapps/workshop/content/221100/222")).unwrap();
    std::fs::write(library.join("steamapps/workshop/content/221100/111/meta.cpp"), "").unwrap();
    std::fs::write(library.join("steamapps/appmanifest_221100.acf"), "").unwrap();
    let escaped = library.to_string_lossy().replace('\\', "\\\\");
    std::fs::write(
      steam.join("steamapps/libraryfolders.vdf"),
      format!("\"libraryfolders\"\n{{\n\t\"1\"\n\t{{\n\t\t\"path\"\t\t\"{escaped}\"\n\t}}\n}}\n"),
    )
    .unwrap();

    let install = find_dayz(&steam).unwrap();
    assert_eq!(install.dayz_dir, library.join("steamapps/common/DayZ"));
    assert!(install.is_mod_installed(111));
    // An empty folder means Steam has not downloaded the mod yet.
    assert!(!install.is_mod_installed(222));
    assert!(!install.is_mod_installed(333));

    std::fs::remove_dir_all(root).unwrap();
  }
}
