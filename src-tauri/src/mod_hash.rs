//! Compares the mods on this computer with a server's copies, through the hash DayZ gives a mod's files.
//!
//! A server reports the hash of each of its mods in its rules. When the copy on this computer hashes differently, the
//! two are different versions: usually the mod was updated on the Workshop and the server hasn't restarted since.
//!
//! Every PBO ends with a SHA-1 of itself. A mod's hash is a SHA-1 of those, sorted and written in lowercase hex, cut
//! down to 32 bits with the RS hash.

use std::collections::HashMap;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::net::SocketAddr;
use std::path::Path;

use sha1::{Digest, Sha1};

/// The folders of a mod that hold its PBOs. Only their top level counts.
const DATA_DIRS: [&str; 3] = ["dta", "addons", "bin"];

/// The hash of the mod in `mod_dir`. `None` when its files can't be read.
pub fn mod_hash(mod_dir: &Path) -> Option<u32> {
  let mut pbo_hashes = Vec::new();
  for dir in std::fs::read_dir(mod_dir).ok()?.flatten() {
    // Mods name the folder `addons` or `Addons`, which matters on Linux.
    let name = dir.file_name();
    if !DATA_DIRS.iter().any(|data| name.to_string_lossy().eq_ignore_ascii_case(data)) {
      continue;
    }
    for file in std::fs::read_dir(dir.path()).ok()?.flatten() {
      let path = file.path();
      if path.is_file() && path.extension().is_some_and(|ext| ext.eq_ignore_ascii_case("pbo")) {
        pbo_hashes.push(pbo_hash(&path)?);
      }
    }
  }
  Some(short_hash(&full_hash(pbo_hashes)))
}

/// The SHA-1 a PBO ends with.
fn pbo_hash(path: &Path) -> Option<[u8; 20]> {
  let mut file = File::open(path).ok()?;
  file.seek(SeekFrom::End(-20)).ok()?;
  let mut hash = [0; 20];
  file.read_exact(&mut hash).ok()?;
  Some(hash)
}

fn hex(bytes: &[u8]) -> String {
  bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn full_hash(mut pbo_hashes: Vec<[u8; 20]>) -> [u8; 20] {
  pbo_hashes.sort_unstable();
  let mut sha = Sha1::new();
  for hash in &pbo_hashes {
    sha.update(hex(hash));
  }
  sha.finalize().into()
}

/// The RS hash of the full hash in hex, after a byte giving its length.
fn short_hash(full: &[u8; 20]) -> u32 {
  let text = hex(full);
  let (mut hash, mut a) = (0u32, 378_551u32);
  for byte in std::iter::once(text.len() as u8).chain(text.bytes()) {
    hash = hash.wrapping_mul(a).wrapping_add(byte.into());
    a = a.wrapping_mul(63_689);
  }
  hash
}

/// A mod the server runs a different version of than this computer.
#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DifferingMod {
  pub id: u64,
  /// When the Workshop's copy was published, to tell how long the server has gone without it. `None` when the
  /// Workshop can't be reached.
  pub updated_at: Option<u64>,
}

/// Of the given mods installed on this computer, those the server runs a different version of. Empty when DayZ isn't
/// found or the server doesn't answer, so nothing is flagged that can't be checked.
#[tauri::command]
pub async fn mods_differing_from_server(
  http: tauri::State<'_, reqwest::Client>,
  dayz_dir: Option<String>,
  server_id: String,
  ids: Vec<u64>,
) -> Result<Vec<DifferingMod>, ()> {
  let differing = differing_ids(dayz_dir, server_id, ids).await;
  if differing.is_empty() {
    return Ok(Vec::new());
  }
  let updated = crate::workshop::latest_update_times(&http, &differing).await.unwrap_or_default();
  Ok(differing.into_iter().map(|id| DifferingMod { id, updated_at: updated.get(&id).copied() }).collect())
}

async fn differing_ids(dayz_dir: Option<String>, server_id: String, ids: Vec<u64>) -> Vec<u64> {
  let Some(install) = crate::steam::locate(dayz_dir.as_deref()) else { return Vec::new() };
  // A server's id is its query address.
  let Ok(addr) = server_id.parse::<SocketAddr>() else { return Vec::new() };
  let local = tokio::task::spawn_blocking(move || {
    ids
      .into_iter()
      .filter(|&id| install.is_mod_installed(id))
      .filter_map(|id| Some((id, mod_hash(&install.mod_dir(id))?)))
      .collect::<HashMap<u64, u32>>()
  });
  let (local, server) = tokio::join!(local, crate::query::a2s_mod_hashes(addr));
  let (Ok(local), Some(server)) = (local, server) else { return Vec::new() };
  let mut differing: Vec<u64> = local
    .into_iter()
    .filter(|(id, hash)| server.get(id).is_some_and(|theirs| theirs != hash))
    .map(|(id, _)| id)
    .collect();
  differing.sort_unstable();
  differing
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn hashes_a_mod_without_pbos_as_servers_do() {
    // What servers report for a mod folder with nothing in it.
    assert_eq!(short_hash(&full_hash(Vec::new())), 0x11FD_D19C);
  }

  #[test]
  fn hashes_the_pbos_in_any_order() {
    assert_eq!(short_hash(&full_hash(vec![[1; 20], [0; 20]])), 0x33E4_37AE);
    assert_eq!(full_hash(vec![[0; 20], [1; 20]]), full_hash(vec![[1; 20], [0; 20]]));
  }

  /// For each mod installed here that busy servers run, how many servers report the same hash. A mod no server
  /// matches is most likely hashed differently from DayZ.
  #[tokio::test]
  #[ignore = "needs DayZ, Workshop mods and network access"]
  async fn installed_mods_hash_as_busy_servers_report() {
    let install = crate::steam::locate(None).expect("DayZ wasn't found");
    let installed: std::collections::HashSet<u64> = std::fs::read_dir(&install.workshop_dir)
      .unwrap()
      .flatten()
      .filter_map(|entry| entry.file_name().to_str()?.parse().ok())
      .collect();
    let local: HashMap<u64, u32> =
      installed.iter().filter_map(|&id| Some((id, mod_hash(&install.mod_dir(id))?))).collect();
    let http = reqwest::Client::builder().user_agent("FlareLauncher/test").build().unwrap();
    let servers = crate::servers::download_list(&http).await.unwrap();
    let mut busy: Vec<_> = servers
      .values()
      .filter(|s| s.row.players > 0 && s.mods.iter().any(|m| local.contains_key(&m.steam_workshop_id)))
      .collect();
    busy.sort_by_key(|s| std::cmp::Reverse(s.row.players));
    let mut tally: HashMap<u64, (u32, u32)> = HashMap::new();
    let queries = futures::future::join_all(busy.iter().take(80).map(|s| {
      let addr: SocketAddr = format!("{}:{}", s.row.ip, s.row.query_port).parse().unwrap();
      crate::query::a2s_mod_hashes(addr)
    }))
    .await;
    for hashes in queries.into_iter().flatten() {
      for (id, theirs) in hashes {
        if let Some(ours) = local.get(&id) {
          let entry = tally.entry(id).or_default();
          if *ours == theirs { entry.0 += 1 } else { entry.1 += 1 }
        }
      }
    }
    let mut rows: Vec<_> = tally.into_iter().collect();
    rows.sort_by_key(|(_, (same, differ))| (*same, std::cmp::Reverse(*differ)));
    for (id, (same, differ)) in &rows {
      println!("{id:>12}  same {same:>3}  differ {differ:>3}");
    }
  }

  #[test]
  fn reads_the_pbos_from_the_data_folders() {
    let dir = std::env::temp_dir().join(format!("flare-mod-hash-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(dir.join("Addons")).unwrap();
    std::fs::create_dir_all(dir.join("keys")).unwrap();
    std::fs::write(dir.join("Addons").join("a.pbo"), [[7u8; 4].as_slice(), &[1; 20]].concat()).unwrap();
    std::fs::write(dir.join("Addons").join("b.PBO"), [0u8; 20]).unwrap();
    std::fs::write(dir.join("Addons").join("a.pbo.author.bisign"), [9u8; 40]).unwrap();
    std::fs::write(dir.join("keys").join("c.pbo"), [9u8; 20]).unwrap();
    let hash = mod_hash(&dir);
    std::fs::remove_dir_all(&dir).unwrap();
    assert_eq!(hash, Some(0x33E4_37AE));
  }
}
