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

  /// Steam's record of the Workshop folder: which mods are installed and who is subscribed to them.
  fn workshop_record(&self) -> WorkshopRecord {
    let manifest = self
      .workshop_dir
      .parent()
      .and_then(Path::parent)
      .map(|workshop| workshop.join(format!("appworkshop_{DAYZ_APP_ID}.acf")));
    manifest
      .and_then(|path| std::fs::read_to_string(path).ok())
      .map(|acf| parse_workshop_record(&acf))
      .unwrap_or_default()
  }

  /// When Steam last updated each installed mod.
  fn installed_update_times(&self) -> HashMap<u64, u64> {
    let record = self.workshop_record();
    record.installed.into_iter().filter_map(|(id, item)| Some((id, item.time_updated?))).collect()
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

#[derive(Default, Debug, PartialEq)]
struct InstalledItem {
  size: Option<u64>,
  time_updated: Option<u64>,
}

/// What Steam's `appworkshop_221100.acf` says about each mod.
#[derive(Default, Debug)]
struct WorkshopRecord {
  installed: HashMap<u64, InstalledItem>,
  /// The Steam accounts on this computer subscribed to each mod.
  subscribed_by: HashMap<u64, Vec<u32>>,
}

fn parse_workshop_record(acf: &str) -> WorkshopRecord {
  let mut record = WorkshopRecord::default();
  let mut sections: Vec<String> = Vec::new();
  let mut name = String::new();
  for line in acf.lines() {
    match (line.trim(), quoted_tokens(line).as_slice()) {
      ("{", _) => sections.push(std::mem::take(&mut name)),
      ("}", _) => drop(sections.pop()),
      (_, [section]) => name = section.clone(),
      (_, [key, value]) => {
        let [.., parent, id] = sections.as_slice() else { continue };
        let Ok(id) = id.parse::<u64>() else { continue };
        match (parent.as_str(), key.as_str()) {
          ("WorkshopItemsInstalled", "size") => record.installed.entry(id).or_default().size = value.parse().ok(),
          ("WorkshopItemsInstalled", "timeupdated") => {
            record.installed.entry(id).or_default().time_updated = value.parse().ok()
          }
          ("WorkshopItemDetails", "subscribedby") => {
            record
              .subscribed_by
              .insert(id, value.split(',').filter_map(|account| account.trim().parse().ok()).collect());
          }
          _ => {}
        }
      }
      _ => {}
    }
  }
  record
}

/// Steam IDs are an account number added to this.
const STEAM_ID_BASE: u64 = 76561197960265728;

/// The account that last signed in to Steam, from `loginusers.vdf`, as the account number the Workshop record uses.
/// Older Steam versions mark it `MostRecent`; newer ones only keep when each account last signed in.
fn parse_most_recent_account(vdf: &str) -> Option<u32> {
  let mut latest: Option<(bool, u64, u64)> = None;
  let mut user: Option<(bool, u64, u64)> = None;
  let mut sections: Vec<String> = Vec::new();
  let mut name = String::new();
  for line in vdf.lines() {
    match (line.trim(), quoted_tokens(line).as_slice()) {
      ("{", _) => {
        sections.push(std::mem::take(&mut name));
        user = sections.last().and_then(|id| id.parse().ok()).map(|id| (false, 0, id));
      }
      ("}", _) => {
        if let Some(found) = user.take() {
          latest = latest.max(Some(found));
        }
        sections.pop();
      }
      (_, [section]) => name = section.clone(),
      (_, [key, value]) => {
        if let Some((most_recent, timestamp, _)) = user.as_mut() {
          if key.eq_ignore_ascii_case("MostRecent") {
            *most_recent = value == "1";
          } else if key.eq_ignore_ascii_case("timestamp") {
            *timestamp = value.parse().unwrap_or(0);
          }
        }
      }
      _ => {}
    }
  }
  let (_, _, steam_id) = latest?;
  u32::try_from(steam_id.checked_sub(STEAM_ID_BASE)?).ok()
}

/// The account Steam is signed in to right now, which Steam keeps in the registry while it runs.
#[cfg(windows)]
fn active_account() -> Option<u32> {
  use winreg::RegKey;
  use winreg::enums::HKEY_CURRENT_USER;
  let key = RegKey::predef(HKEY_CURRENT_USER).open_subkey(r"Software\Valve\Steam\ActiveProcess").ok()?;
  key.get_value::<u32, _>("ActiveUser").ok().filter(|&account| account != 0)
}

/// The account Steam is signed in to right now, which Steam keeps in `~/.steam/registry.vdf` while it runs.
#[cfg(not(windows))]
fn active_account() -> Option<u32> {
  let vdf = std::fs::read_to_string(std::env::home_dir()?.join(".steam/registry.vdf")).ok()?;
  vdf.lines().find_map(|line| match quoted_tokens(line).as_slice() {
    [key, value] if key.eq_ignore_ascii_case("ActiveUser") => value.parse().ok().filter(|&account| account != 0),
    _ => None,
  })
}

/// The Steam account the player uses, so the mods page lists their subscriptions and not another account's.
fn signed_in_account() -> Option<u32> {
  active_account().or_else(|| {
    steam_roots().iter().find_map(|root| {
      let vdf = std::fs::read_to_string(root.join("config").join("loginusers.vdf")).ok()?;
      parse_most_recent_account(&vdf)
    })
  })
}

/// The name a mod gives itself in its `meta.cpp`, such as `name = "CF";`.
fn parse_meta_name(meta: &str) -> Option<String> {
  meta.lines().find_map(|line| {
    let (key, value) = line.split_once('=')?;
    if !key.trim().eq_ignore_ascii_case("name") {
      return None;
    }
    let name = value.trim().trim_end_matches(';').trim().trim_matches('"').trim();
    (!name.is_empty()).then(|| name.to_string())
  })
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

/// A mod the player is subscribed to.
#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SubscribedMod {
  pub id: u64,
  /// Its name on the Workshop, or the name in its files when the Workshop can't say.
  pub name: Option<String>,
  /// Whether Steam has put its files on this computer.
  pub installed: bool,
  /// Bytes on disk.
  pub size: Option<u64>,
  /// When the copy on this computer was published on the Workshop.
  pub updated_at: Option<u64>,
  /// When the Workshop's copy was published. `None` when the Workshop couldn't be reached or no longer has it.
  pub latest_updated_at: Option<u64>,
  /// The Workshop answered but no longer has the mod: it was removed or made private.
  pub removed: bool,
}

/// The mods the signed-in Steam account is subscribed to, from Steam's record on this computer, with names and the
/// latest versions from the Workshop. `None` when DayZ isn't found.
#[tauri::command]
pub async fn subscribed_mods(
  http: tauri::State<'_, reqwest::Client>,
  dayz_dir: Option<String>,
) -> crate::error::Result<Option<Vec<SubscribedMod>>> {
  let Some(install) = locate(dayz_dir.as_deref()) else { return Ok(None) };
  let record = install.workshop_record();
  let ids = subscribed_ids(&record, signed_in_account());
  let workshop = crate::workshop::item_details(&http, &ids).await;
  if let Err(e) = &workshop {
    log::warn!("could not look up subscribed mods on the Workshop: {e}");
  }
  Ok(Some(
    ids
      .into_iter()
      .map(|id| {
        let item = workshop.as_ref().ok().map(|items| items.get(&id));
        let local = record.installed.get(&id);
        let name = item.flatten().and_then(|item| item.title.clone()).or_else(|| {
          let meta = std::fs::read_to_string(install.mod_dir(id).join("meta.cpp")).ok()?;
          parse_meta_name(&meta)
        });
        SubscribedMod {
          id,
          name,
          installed: install.is_mod_installed(id),
          size: local.and_then(|item| item.size),
          updated_at: local.and_then(|item| item.time_updated),
          latest_updated_at: item.flatten().and_then(|item| item.time_updated),
          removed: item.is_some_and(|item| item.is_none()),
        }
      })
      .collect(),
  ))
}

/// The mods the account is subscribed to. Without a known account, every mod anyone on this computer subscribed to.
fn subscribed_ids(record: &WorkshopRecord, account: Option<u32>) -> Vec<u64> {
  let mut ids: Vec<u64> = record
    .subscribed_by
    .iter()
    .filter(|(_, accounts)| match account {
      Some(account) => accounts.contains(&account),
      None => !accounts.is_empty(),
    })
    .map(|(&id, _)| id)
    .collect();
  ids.sort_unstable();
  ids
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

  const WORKSHOP_ACF: &str = r#"
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
			"subscribedby"		"198223138,65974518"
		}
		"1750506510"
		{
			"subscribedby"		"65974518"
		}
		"999"
		{
			"timeupdated"		"5"
			"subscribedby"		""
		}
	}
}
"#;

  #[test]
  fn reads_installed_mods_from_the_workshop_record() {
    let record = parse_workshop_record(WORKSHOP_ACF);
    assert_eq!(record.installed.len(), 2);
    assert_eq!(record.installed[&1559212036], InstalledItem { size: Some(2051364), time_updated: Some(1700000000) });
    assert_eq!(record.installed[&1750506510], InstalledItem { size: None, time_updated: Some(1690000000) });
  }

  #[test]
  fn lists_the_mods_the_signed_in_account_is_subscribed_to() {
    let record = parse_workshop_record(WORKSHOP_ACF);
    assert_eq!(subscribed_ids(&record, Some(198223138)), [1559212036]);
    assert_eq!(subscribed_ids(&record, Some(65974518)), [1559212036, 1750506510]);
    // Without knowing the account, any subscription counts, but a mod nobody is subscribed to doesn't.
    assert_eq!(subscribed_ids(&record, None), [1559212036, 1750506510]);
  }

  #[test]
  fn finds_the_account_that_last_signed_in() {
    let users = |first: &str, second: &str| {
      format!(
        "\"users\"
{{
	\"76561198158488866\"
	{{
		\"AccountName\"		\"a\"
{first}	}}
	\"76561198026240246\"
	{{
{second}	}}
}}
"
      )
    };
    // Newer Steam versions only say when each account last signed in.
    let vdf = users(
      "		\"timestamp\"		\"1791134641\"
",
      "		\"timestamp\"		\"1790953389\"
",
    );
    assert_eq!(parse_most_recent_account(&vdf), Some(198223138));
    // Older ones mark it.
    let vdf = users(
      "		\"MostRecent\"		\"0\"
		\"timestamp\"		\"1791134641\"
",
      "		\"MostRecent\"		\"1\"
		\"timestamp\"		\"1790953389\"
",
    );
    assert_eq!(parse_most_recent_account(&vdf), Some(65974518));
    assert_eq!(
      parse_most_recent_account(
        "\"users\"
{
}
"
      ),
      None
    );
  }

  #[test]
  fn reads_a_mod_name_from_its_meta_file() {
    let meta = "protocol = 1;
publishedid = 1559212036;
name = \"CF\";
timestamp = 5250757174595880000;
";
    assert_eq!(parse_meta_name(meta).as_deref(), Some("CF"));
    assert_eq!(parse_meta_name("name = \"\";"), None);
    assert_eq!(parse_meta_name("protocol = 1;"), None);
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
