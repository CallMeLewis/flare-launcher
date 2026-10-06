//! Keeps the launcher up to date from the update feed on Cloudflare R2. The
//! feed points at the builds on each version's GitHub release.
//!
//! Nothing downloads or installs without the player asking: downloading and
//! installing are separate actions, and installing is only reached through a
//! confirmation in the window. The one exception: if the feed offers a
//! different version while a downloaded one is waiting to be installed (a
//! newer release, or the player switched channel), that one replaces it, so
//! someone who already chose to update never installs an outdated version or
//! one from the channel they left.
//!
//! Every installer is signed (scripts/publish-update.ts) and the plugin
//! refuses one whose signature doesn't match the public key in
//! tauri.conf.json, or whose signed version differs from the one the feed
//! announces, so a tampered feed cannot push a different installer.
//!
//! Stable reads latest.json and beta reads beta.json. Publishing a stable
//! release also updates beta.json when it is newer than the latest beta, so
//! beta players get stable releases too.

use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_updater::{Update, UpdaterExt};

use crate::error::Text;
use crate::text;

/// Must match `feedUrl` in scripts/publish-update.ts. Keeps the launcher's first name, DayZ Server Launcher: every
/// installed copy checks this address, so moving it would strand them.
const FEED_URL: &str = "https://updates.darkzone.dev/dayz-server-launcher/";
const CHECK_INTERVAL: Duration = Duration::from_secs(6 * 60 * 60);
const PROGRESS_INTERVAL: Duration = Duration::from_millis(250);
/// A check that hasn't heard back by then gives up, rather than leaving the window showing it as checking.
const CHECK_TIMEOUT: Duration = Duration::from_secs(30);
const STATUS_EVENT: &str = "update:status";

/// Development aid: `DZSL_UPDATE_TEST_URL=<url>` points a debug build at a
/// local folder served over HTTP holding latest.json and an installer, to
/// exercise the update flow without publishing a release.
const TEST_FEED_VAR: &str = "DZSL_UPDATE_TEST_URL";

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(tag = "state", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum UpdateStatus {
  /// Development builds, which cannot update themselves.
  Unsupported,
  Idle,
  Checking,
  UpToDate {
    checked_at: u64,
  },
  /// `notes` are the new version's release notes from the feed, as "- " bullet lines.
  Available {
    version: String,
    release_date: Option<String>,
    notes: Option<String>,
  },
  Downloading {
    version: String,
    percent: f64,
    notes: Option<String>,
  },
  Ready {
    version: String,
    notes: Option<String>,
  },
  Error {
    message: Text,
  },
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum UpdateChannel {
  Stable,
  Beta,
}

impl UpdateChannel {
  fn feed_file(self) -> &'static str {
    match self {
      Self::Stable => "latest.json",
      Self::Beta => "beta.json",
    }
  }
}

/// The player's update choices, kept in the app's config folder, which updates leave alone.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSettings {
  pub channel: UpdateChannel,
  /// Whether the launcher checks on its own, at start and every few hours.
  #[serde(default = "checks_automatically")]
  pub auto_check: bool,
}

fn checks_automatically() -> bool {
  true
}

/// The settings as saved, with the launcher version that saved them, so the first start of a different build shows.
#[derive(Serialize, Deserialize)]
struct SavedSettings {
  #[serde(flatten)]
  settings: UpdateSettings,
  #[serde(default)]
  version: Option<String>,
}

struct Inner {
  status: UpdateStatus,
  settings: Option<UpdateSettings>,
  /// The update on offer, kept so it can be downloaded without checking again.
  offered: Option<Update>,
  /// A downloaded update waiting for the player to confirm the install.
  downloaded: Option<(Update, Vec<u8>)>,
  /// Counts checks started, so only the latest one reports what it found.
  latest_check: u64,
}

pub struct Updater {
  /// `None` when updates are unsupported.
  feed: Option<String>,
  inner: Mutex<Inner>,
}

impl Updater {
  pub fn new() -> Self {
    let test_feed = cfg!(debug_assertions).then(|| std::env::var(TEST_FEED_VAR).ok()).flatten();
    let feed = match test_feed {
      Some(url) => Some(if url.ends_with('/') { url } else { format!("{url}/") }),
      None if !cfg!(debug_assertions) => Some(FEED_URL.to_string()),
      None => None,
    };
    let status = if feed.is_some() { UpdateStatus::Idle } else { UpdateStatus::Unsupported };
    Self { feed, inner: Mutex::new(Inner { status, settings: None, offered: None, downloaded: None, latest_check: 0 }) }
  }

  /// Checks now and then every few hours, unless the player turned that off.
  /// Only installed builds update themselves.
  pub fn start(app: &AppHandle) {
    if app.state::<Updater>().feed.is_none() {
      return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
      loop {
        let updater = app.state::<Updater>();
        if updater.settings(&app).auto_check {
          updater.check(&app).await;
        }
        tokio::time::sleep(CHECK_INTERVAL).await;
      }
    });
  }

  pub fn status(&self) -> UpdateStatus {
    self.inner.lock().unwrap().status.clone()
  }

  fn set(&self, app: &AppHandle, status: UpdateStatus) {
    self.inner.lock().unwrap().status = status.clone();
    let _ = app.emit(STATUS_EVENT, status);
  }

  /// Marks a check as running, returning its number for `finish_check`.
  fn start_check(&self, app: &AppHandle) -> u64 {
    let check = {
      let mut inner = self.inner.lock().unwrap();
      inner.latest_check += 1;
      inner.status = UpdateStatus::Checking;
      inner.latest_check
    };
    let _ = app.emit(STATUS_EVENT, UpdateStatus::Checking);
    check
  }

  /// Reports what a check found, unless a download started while it was running or a newer check (after switching
  /// channel, say) replaced it.
  fn finish_check(&self, app: &AppHandle, check: u64, status: UpdateStatus, offered: Option<Update>) {
    {
      let mut inner = self.inner.lock().unwrap();
      if inner.status != UpdateStatus::Checking || inner.latest_check != check {
        return;
      }
      if offered.is_some() {
        inner.offered = offered;
      }
      inner.status = status.clone();
    }
    let _ = app.emit(STATUS_EVENT, status);
  }

  pub fn settings(&self, app: &AppHandle) -> UpdateSettings {
    let mut inner = self.inner.lock().unwrap();
    *inner.settings.get_or_insert_with(|| load_settings(app))
  }

  pub fn channel(&self, app: &AppHandle) -> UpdateChannel {
    self.settings(app).channel
  }

  fn change_settings(&self, app: &AppHandle, change: impl FnOnce(&mut UpdateSettings)) -> crate::error::Result<()> {
    let mut settings = self.settings(app);
    change(&mut settings);
    save_settings(app, settings)?;
    self.inner.lock().unwrap().settings = Some(settings);
    Ok(())
  }

  /// Turning automatic checks back on checks straight away.
  pub async fn set_auto_check(&self, app: &AppHandle, auto_check: bool) -> crate::error::Result<UpdateStatus> {
    self.change_settings(app, |settings| settings.auto_check = auto_check)?;
    Ok(if auto_check { self.check(app).await } else { self.status() })
  }

  pub async fn set_channel(&self, app: &AppHandle, channel: UpdateChannel) -> crate::error::Result<UpdateStatus> {
    self.change_settings(app, |settings| settings.channel = channel)?;
    {
      let mut inner = self.inner.lock().unwrap();
      // An update found on the other channel may not be on this one.
      if matches!(inner.status, UpdateStatus::Available { .. }) {
        inner.offered = None;
        inner.status = UpdateStatus::Idle;
      }
    }
    Ok(self.check(app).await)
  }

  async fn fetch(&self, app: &AppHandle) -> Result<Option<Update>, tauri_plugin_updater::Error> {
    let feed = self.feed.as_deref().unwrap_or(FEED_URL);
    let url = format!("{feed}{}", self.channel(app).feed_file()).parse()?;
    let update = app.updater_builder().endpoints(vec![url])?.timeout(CHECK_TIMEOUT).build()?.check().await?;
    // The timeout is for the check only: a slow connection can take far longer to download the installer.
    Ok(update.map(|mut update| {
      update.timeout = None;
      update
    }))
  }

  pub async fn check(&self, app: &AppHandle) -> UpdateStatus {
    if self.feed.is_none() {
      return self.status();
    }
    match self.status() {
      UpdateStatus::Downloading { .. } => return self.status(),
      UpdateStatus::Ready { version, .. } => return self.replace_downloaded(app, &version).await,
      _ => {}
    }

    let check = self.start_check(app);
    match self.fetch(app).await {
      Ok(Some(update)) => self.finish_check(app, check, offered_status(&update), Some(update)),
      Ok(None) => self.finish_check(app, check, UpdateStatus::UpToDate { checked_at: now_millis() }, None),
      Err(error) => {
        self.finish_check(app, check, UpdateStatus::Error { message: friendly_error(&error, self.channel(app)) }, None)
      }
    }
    self.status()
  }

  /// Behind a downloaded update: checks the feed still offers that version.
  /// If it offers another one (a newer release, or the player switched
  /// channel), that is downloaded in its place; if it offers nothing, the
  /// waiting one is dropped. Failing to reach the feed leaves it as it is.
  async fn replace_downloaded(&self, app: &AppHandle, ready_version: &str) -> UpdateStatus {
    let replacement = match self.fetch(app).await {
      Ok(Some(update)) if update.version == ready_version => return self.status(),
      Ok(update) => update,
      Err(_) => return self.status(),
    };
    let status = match &replacement {
      Some(update) => offered_status(update),
      None => UpdateStatus::UpToDate { checked_at: now_millis() },
    };
    {
      let mut inner = self.inner.lock().unwrap();
      if !matches!(inner.status, UpdateStatus::Ready { .. }) {
        return inner.status.clone();
      }
      inner.downloaded = None;
      inner.offered = replacement;
    }
    self.set(app, status);
    self.download(app).await;
    self.status()
  }

  pub async fn download(&self, app: &AppHandle) {
    let channel = self.channel(app);
    // Taken under one lock, so a second request while this one runs does nothing.
    let (update, status) = {
      let mut inner = self.inner.lock().unwrap();
      if matches!(inner.status, UpdateStatus::Downloading { .. }) {
        return;
      }
      let Some(update) = inner.offered.clone() else { return };
      let status =
        UpdateStatus::Downloading { version: update.version.clone(), percent: 0.0, notes: update.body.clone() };
      inner.status = status.clone();
      (update, status)
    };
    let _ = app.emit(STATUS_EVENT, status);
    let notes = update.body.clone();
    let version = update.version.clone();

    let mut received: u64 = 0;
    let mut last_report = Instant::now();
    let result = update
      .download(
        |chunk, total| {
          received += chunk as u64;
          // Progress is reported a few times a second; the window animates between reports.
          if let Some(total) = total.filter(|&t| t > 0)
            && last_report.elapsed() >= PROGRESS_INTERVAL
          {
            last_report = Instant::now();
            let percent = (received as f64 / total as f64 * 100.0).min(100.0);
            self.set(app, UpdateStatus::Downloading { version: version.clone(), percent, notes: notes.clone() });
          }
        },
        || {},
      )
      .await;

    match result {
      Ok(bytes) => {
        {
          let mut inner = self.inner.lock().unwrap();
          inner.offered = None;
          inner.downloaded = Some((update, bytes));
        }
        self.set(app, UpdateStatus::Ready { version, notes });
        // The player switched channel while this downloaded: make sure the new channel offers it too.
        if self.channel(app) != channel {
          Box::pin(self.check(app)).await;
        }
      }
      Err(error) => self.set(app, UpdateStatus::Error { message: friendly_error(&error, self.channel(app)) }),
    }
  }

  /// Runs the downloaded installer. On Windows it installs silently in the
  /// background and reopens the launcher; the launcher closes straight away.
  pub fn install(&self, app: &AppHandle) -> crate::error::Result<()> {
    let Some((update, bytes)) = self.inner.lock().unwrap().downloaded.take() else {
      return Err(text!("There is no downloaded update to install.").into());
    };
    if let Err(error) = update.install(&bytes) {
      // Shows on the update icon, where trying again checks and downloads afresh.
      let message = friendly_error(&error, self.channel(app));
      self.set(app, UpdateStatus::Error { message: message.clone() });
      return Err(message.into());
    }
    // Windows never gets here: the installer takes over and the process exits.
    app.restart();
  }
}

fn offered_status(update: &Update) -> UpdateStatus {
  UpdateStatus::Available {
    version: update.version.clone(),
    release_date: update.date.map(|date| date.date().to_string()),
    notes: notes_text(update.body.as_deref()),
  }
}

/// The notes come from the feed, which the signature does not cover, so they
/// are only ever shown as plain text.
fn notes_text(notes: Option<&str>) -> Option<String> {
  notes.map(str::trim).filter(|text| !text.is_empty()).map(String::from)
}

fn now_millis() -> u64 {
  SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

fn friendly_error(error: &tauri_plugin_updater::Error, channel: UpdateChannel) -> Text {
  use tauri_plugin_updater::Error as E;
  match error {
    E::Reqwest(_) | E::Network(_) => text!("Couldn't reach the update server."),
    E::ReleaseNotFound | E::TargetNotFound(_) | E::TargetsNotFound(_) => match channel {
      UpdateChannel::Beta => text!("No beta release has been published yet."),
      UpdateChannel::Stable => text!("No release has been published yet."),
    },
    E::Minisign(_) | E::SignedVersionMismatch { .. } | E::MissingSignedVersion => {
      text!("The update failed a security check, so it wasn't installed.")
    }
    other => text!("The update failed: {error}", error = other.to_string().lines().next().unwrap_or_default()),
  }
}

fn load_settings(app: &AppHandle) -> UpdateSettings {
  let saved = settings_path(app)
    .and_then(|path| std::fs::read_to_string(path).ok())
    .and_then(|text| serde_json::from_str::<SavedSettings>(&text).ok());
  let (settings, changed) = settings_for_build(saved, &app.package_info().version.to_string());
  if changed {
    let _ = save_settings(app, settings);
  }
  settings
}

/// The settings for this build, and whether they changed. The first start of a beta build, installed by hand or
/// through the beta channel, moves the launcher to the beta channel; choosing stable after that sticks until another
/// build is installed. A stable build keeps the channel it finds, so beta players stay on beta when a stable release
/// reaches them. Without saved settings, everything else starts on stable with automatic checks on.
fn settings_for_build(saved: Option<SavedSettings>, version: &str) -> (UpdateSettings, bool) {
  match saved {
    Some(saved) if saved.version.as_deref() == Some(version) => (saved.settings, false),
    saved => {
      let mut settings =
        saved.map_or(UpdateSettings { channel: UpdateChannel::Stable, auto_check: true }, |saved| saved.settings);
      if version.contains('-') {
        settings.channel = UpdateChannel::Beta;
      }
      (settings, true)
    }
  }
}

fn settings_path(app: &AppHandle) -> Option<std::path::PathBuf> {
  app.path().app_config_dir().ok().map(|dir| dir.join("update-settings.json"))
}

fn save_settings(app: &AppHandle, settings: UpdateSettings) -> crate::error::Result<()> {
  let path =
    settings_path(app).ok_or_else(|| crate::error::Error::from(text!("The settings folder couldn't be found.")))?;
  if let Some(dir) = path.parent() {
    std::fs::create_dir_all(dir)?;
  }
  let saved = SavedSettings { settings, version: Some(app.package_info().version.to_string()) };
  std::fs::write(path, serde_json::to_string(&saved).unwrap() + "\n")?;
  Ok(())
}

#[tauri::command]
pub fn update_status(updater: State<'_, Updater>) -> UpdateStatus {
  updater.status()
}

#[tauri::command]
pub async fn check_for_updates(app: AppHandle, updater: State<'_, Updater>) -> Result<UpdateStatus, ()> {
  Ok(updater.check(&app).await)
}

#[tauri::command]
pub async fn download_update(app: AppHandle, updater: State<'_, Updater>) -> Result<(), ()> {
  updater.download(&app).await;
  Ok(())
}

/// Runs away from the main thread: installing a .deb or .rpm waits for the system's password prompt, and the window
/// would stop responding until it closed.
#[tauri::command]
pub async fn install_update(app: AppHandle) -> crate::error::Result<()> {
  tauri::async_runtime::spawn_blocking(move || app.state::<Updater>().install(&app))
    .await
    .map_err(|e| text!("The update failed: {error}", error = e))?
}

#[tauri::command]
pub fn update_settings(app: AppHandle, updater: State<'_, Updater>) -> UpdateSettings {
  updater.settings(&app)
}

#[tauri::command]
pub async fn set_auto_update_check(
  app: AppHandle,
  updater: State<'_, Updater>,
  enabled: bool,
) -> crate::error::Result<UpdateStatus> {
  updater.set_auto_check(&app, enabled).await
}

#[tauri::command]
pub async fn set_update_channel(
  app: AppHandle,
  updater: State<'_, Updater>,
  channel: UpdateChannel,
) -> crate::error::Result<UpdateStatus> {
  updater.set_channel(&app, channel).await
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn beta_builds_start_on_the_beta_channel() {
    let saved = |channel, version: Option<&str>| {
      Some(SavedSettings { settings: UpdateSettings { channel, auto_check: true }, version: version.map(String::from) })
    };
    let channel = |saved, version| settings_for_build(saved, version).0.channel;
    // A first install.
    assert_eq!(channel(None, "1.2.0-beta.1"), UpdateChannel::Beta);
    assert_eq!(channel(None, "1.2.0"), UpdateChannel::Stable);
    // A beta installed over a stable install, including one saved before versions were recorded.
    assert_eq!(channel(saved(UpdateChannel::Stable, Some("1.1.0")), "1.2.0-beta.1"), UpdateChannel::Beta);
    assert_eq!(channel(saved(UpdateChannel::Stable, None), "1.2.0-beta.1"), UpdateChannel::Beta);
    // Choosing stable while running that beta sticks.
    let (settings, changed) = settings_for_build(saved(UpdateChannel::Stable, Some("1.2.0-beta.1")), "1.2.0-beta.1");
    assert_eq!((settings.channel, changed), (UpdateChannel::Stable, false));
    // A beta player who updates to a stable release stays on beta.
    assert_eq!(channel(saved(UpdateChannel::Beta, Some("1.2.0-beta.2")), "1.2.0"), UpdateChannel::Beta);
    // Settings saved by 1.0.x have no version.
    let old: SavedSettings = serde_json::from_str(r#"{"channel":"stable","autoCheck":false}"#).unwrap();
    assert_eq!((old.settings.channel, old.settings.auto_check, old.version), (UpdateChannel::Stable, false, None));
    assert_eq!(UpdateChannel::Beta.feed_file(), "beta.json");
    assert_eq!(UpdateChannel::Stable.feed_file(), "latest.json");
  }

  #[test]
  fn status_serialises_for_the_window() {
    let status = UpdateStatus::Downloading { version: "1.2.0".into(), percent: 42.0, notes: None };
    assert_eq!(
      serde_json::to_value(status).unwrap(),
      serde_json::json!({ "state": "downloading", "version": "1.2.0", "percent": 42.0, "notes": null })
    );
    assert_eq!(
      serde_json::to_value(UpdateStatus::UpToDate { checked_at: 5 }).unwrap(),
      serde_json::json!({ "state": "upToDate", "checkedAt": 5 })
    );
  }

  #[test]
  fn explains_errors_in_plain_words() {
    use tauri_plugin_updater::Error as E;
    assert_eq!(
      friendly_error(&E::Network("timeout".into()), UpdateChannel::Stable).to_string(),
      "Couldn't reach the update server."
    );
    assert_eq!(
      friendly_error(&E::ReleaseNotFound, UpdateChannel::Beta).to_string(),
      "No beta release has been published yet."
    );
    assert!(friendly_error(&E::MissingSignedVersion, UpdateChannel::Stable).message.contains("security check"));
  }

  #[test]
  fn settings_saved_before_automatic_checks_existed_keep_them_on() {
    let settings: UpdateSettings = serde_json::from_str(r#"{"channel":"beta"}"#).unwrap();
    assert_eq!(settings, UpdateSettings { channel: UpdateChannel::Beta, auto_check: true });
    assert_eq!(
      serde_json::to_value(UpdateSettings { channel: UpdateChannel::Stable, auto_check: false }).unwrap(),
      serde_json::json!({ "channel": "stable", "autoCheck": false })
    );
  }

  #[test]
  fn blank_notes_count_as_none() {
    assert_eq!(notes_text(Some("  \n ")), None);
    assert_eq!(notes_text(Some("- Fixed it\n")), Some("- Fixed it".into()));
  }
}
