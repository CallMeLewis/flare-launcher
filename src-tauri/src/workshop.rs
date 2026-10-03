//! Downloads Workshop mods through the running Steam client.
//!
//! The Steam connection only lives for the length of a download. While it is
//! open Steam shows the player as in DayZ, so it is closed again before the
//! game itself is started.

use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use steamworks::{Client, DownloadItemResult, ItemState, PublishedFileId, SteamAPIInitError};
use tauri::ipc::Channel;
use tauri::State;

use crate::error::{Error, Result};
use crate::steam::DAYZ_APP_ID;

const POLL_INTERVAL: Duration = Duration::from_millis(250);
/// Public, and needs no key.
const DETAILS_URL: &str = "https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/";

#[derive(Deserialize)]
struct DetailsResponse {
  response: DetailsList,
}

#[derive(Deserialize)]
struct DetailsList {
  #[serde(default)]
  publishedfiledetails: Vec<Details>,
}

#[derive(Deserialize)]
struct Details {
  publishedfileid: String,
  time_updated: Option<u64>,
}

/// When each mod was last updated on the Workshop. Mods the Workshop doesn't know, such as removed ones, are left out.
pub async fn latest_update_times(http: &reqwest::Client, ids: &[u64]) -> Result<HashMap<u64, u64>> {
  if ids.is_empty() {
    return Ok(HashMap::new());
  }
  let mut form = vec![("itemcount".to_string(), ids.len().to_string())];
  form.extend(ids.iter().enumerate().map(|(i, id)| (format!("publishedfileids[{i}]"), id.to_string())));
  let details: DetailsResponse = http
    .post(DETAILS_URL)
    .form(&form)
    // Checked whenever a server is opened, so a slow answer must not hold up the panel for long.
    .timeout(Duration::from_secs(10))
    .send()
    .await?
    .error_for_status()?
    .json()
    .await?;
  Ok(
    details
      .response
      .publishedfiledetails
      .into_iter()
      .filter_map(|d| Some((d.publishedfileid.parse().ok()?, d.time_updated?)))
      .collect(),
  )
}

#[derive(Default)]
pub struct Downloads {
  running: AtomicBool,
  cancelled: AtomicBool,
}

#[derive(Serialize, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum ModStatus {
  Queued,
  Downloading,
  Installed,
  Failed,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ModProgress {
  pub id: u64,
  pub status: ModStatus,
  pub downloaded: u64,
  pub total: u64,
}

fn status_of(state: ItemState, failed: bool) -> ModStatus {
  let busy = ItemState::NEEDS_UPDATE | ItemState::DOWNLOADING | ItemState::DOWNLOAD_PENDING;
  if failed {
    ModStatus::Failed
  } else if state.contains(ItemState::INSTALLED) && !state.intersects(busy) {
    ModStatus::Installed
  } else if state.contains(ItemState::DOWNLOADING) {
    ModStatus::Downloading
  } else {
    ModStatus::Queued
  }
}

fn connect() -> Result<Client> {
  Client::init_app(DAYZ_APP_ID).map_err(|e| {
    let (SteamAPIInitError::FailedGeneric(detail)
    | SteamAPIInitError::NoSteamClient(detail)
    | SteamAPIInitError::VersionMismatch(detail)) = &e;
    log::warn!("could not connect to Steam: {e} ({detail})");
    Error::msg(match e {
      SteamAPIInitError::VersionMismatch(_) => "Steam is out of date. Restart Steam so it can update, then try again.",
      _ => "Steam couldn't be reached. Make sure Steam is running and you're signed in, then try again.",
    })
  })
}

/// Subscribes to the mods and waits for Steam to finish installing them.
/// Returns `false` if the wait was cancelled.
fn download(ids: &[u64], cancelled: &AtomicBool, mut report: impl FnMut(&[ModProgress])) -> Result<bool> {
  let client = connect()?;
  let ugc = client.ugc();
  let failed = Arc::new(Mutex::new(HashSet::new()));
  let finished = Arc::new(Mutex::new(HashSet::new()));
  // A mod already on disk is being updated. Steam can still call it installed before it notices the update, so it
  // only counts once Steam reports the download done or the files change.
  let updating: HashMap<u64, u32> = ids
    .iter()
    .filter_map(|&id| Some((id, ugc.item_install_info(PublishedFileId(id))?.timestamp)))
    .collect();

  let _on_download = client.register_callback({
    let failed = failed.clone();
    let finished = finished.clone();
    move |result: DownloadItemResult| {
      let id = result.published_file_id.0;
      if result.error.is_some() {
        failed.lock().unwrap().insert(id);
      } else {
        finished.lock().unwrap().insert(id);
      }
    }
  });

  for &id in ids {
    let item = PublishedFileId(id);
    let failed = failed.clone();
    // Subscribing makes Steam keep the mod up to date from now on.
    ugc.subscribe_item(item, move |result| {
      if result.is_err() {
        failed.lock().unwrap().insert(id);
      }
    });
    // High priority puts it ahead of anything else Steam is downloading.
    if !ugc.download_item(item, true) {
      log::warn!("Steam did not accept a download request for mod {id}");
    }
  }

  let mut last = Vec::new();
  loop {
    client.run_callbacks();

    let progress: Vec<ModProgress> = {
      let failed = failed.lock().unwrap();
      let finished = finished.lock().unwrap();
      ids
        .iter()
        .map(|&id| {
          let item = PublishedFileId(id);
          let (downloaded, total) = ugc.item_download_info(item).unwrap_or_default();
          let mut status = status_of(ugc.item_state(item), failed.contains(&id));
          if status == ModStatus::Installed
            && let Some(&before) = updating.get(&id)
            && !finished.contains(&id)
            && ugc.item_install_info(item).map(|info| info.timestamp) == Some(before)
          {
            status = ModStatus::Queued;
          }
          ModProgress { id, status, downloaded, total }
        })
        .collect()
    };
    if progress != last {
      report(&progress);
      last = progress;
    }

    let failures = last.iter().filter(|p| p.status == ModStatus::Failed).count();
    if failures > 0 {
      let noun = if failures == 1 { "mod" } else { "mods" };
      return Err(Error::msg(format!(
        "Steam couldn't download {failures} {noun}. Check your connection and disk space, then try again."
      )));
    }
    if last.iter().all(|p| p.status == ModStatus::Installed) {
      return Ok(true);
    }
    if cancelled.load(Ordering::Relaxed) {
      return Ok(false);
    }
    std::thread::sleep(POLL_INTERVAL);
  }
}

/// Downloads the given mods, reporting progress as it changes. Resolves to
/// `true` once every mod is installed, or `false` if the player cancelled.
#[tauri::command]
pub async fn download_mods(
  downloads: State<'_, Arc<Downloads>>,
  ids: Vec<u64>,
  on_progress: Channel<Vec<ModProgress>>,
) -> Result<bool> {
  let downloads = downloads.inner().clone();
  if downloads.running.swap(true, Ordering::SeqCst) {
    return Err(Error::msg("Mods are already being downloaded."));
  }
  downloads.cancelled.store(false, Ordering::SeqCst);

  let worker = downloads.clone();
  let outcome = tauri::async_runtime::spawn_blocking(move || {
    download(&ids, &worker.cancelled, |progress| {
      let _ = on_progress.send(progress.to_vec());
    })
  })
  .await;

  downloads.running.store(false, Ordering::SeqCst);
  outcome.map_err(|e| Error::msg(format!("The download stopped unexpectedly: {e}")))?
}

/// Stops waiting for the current download. Steam carries on downloading the
/// mods the player is now subscribed to.
#[tauri::command]
pub fn cancel_mod_download(downloads: State<'_, Arc<Downloads>>) {
  downloads.cancelled.store(true, Ordering::SeqCst);
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn maps_steam_item_state_to_a_status() {
    let subscribed = ItemState::SUBSCRIBED;
    assert_eq!(status_of(ItemState::NONE, false), ModStatus::Queued);
    assert_eq!(status_of(subscribed | ItemState::DOWNLOAD_PENDING, false), ModStatus::Queued);
    assert_eq!(status_of(subscribed | ItemState::DOWNLOADING, false), ModStatus::Downloading);
    assert_eq!(status_of(subscribed | ItemState::INSTALLED, false), ModStatus::Installed);
  }

  #[test]
  fn an_installed_mod_being_updated_is_not_ready() {
    let installed = ItemState::SUBSCRIBED | ItemState::INSTALLED;
    assert_eq!(status_of(installed | ItemState::NEEDS_UPDATE, false), ModStatus::Queued);
    assert_eq!(status_of(installed | ItemState::NEEDS_UPDATE | ItemState::DOWNLOADING, false), ModStatus::Downloading);
  }

  #[test]
  fn a_failed_download_wins_over_any_state() {
    assert_eq!(status_of(ItemState::SUBSCRIBED | ItemState::INSTALLED, true), ModStatus::Failed);
  }
}
