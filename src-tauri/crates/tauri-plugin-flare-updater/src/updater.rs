//! Nothing downloads or installs without the user asking: downloading and installing are separate actions, and
//! installing is only reached through a confirmation in the window. The one exception: if the feed offers a different
//! version while a downloaded one is waiting to be installed (a newer release, or the user switched channel), that one
//! replaces it, so someone who already chose to update never installs an outdated version or one from the channel
//! they left.
//!
//! Every installer is signed by the app's release script, and Tauri's updater refuses one whose signature doesn't
//! match the public key in the app's tauri.conf.json, or whose signed version differs from the one the feed announces,
//! so a tampered feed cannot push a different installer.
//!
//! Stable reads latest.json and beta reads beta.json. Publishing a stable release also updates beta.json when it is
//! newer than the latest beta, so beta users get stable releases too.

use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_updater::{Update, UpdaterExt};

use crate::text::Text;
use crate::{NO_AUTO_CHECK_VAR, TEST_FEED_VAR};

const CHECK_INTERVAL: Duration = Duration::from_secs(6 * 60 * 60);
const PROGRESS_INTERVAL: Duration = Duration::from_millis(250);
/// A check that hasn't heard back by then gives up, rather than leaving the window showing it as checking.
const CHECK_TIMEOUT: Duration = Duration::from_secs(30);
/// A download that receives nothing for this long has stalled, after a sleep or a change of network, and gives up so it
/// can be tried again. A slow one carries on however long it takes.
const STALL_TIMEOUT: Duration = Duration::from_secs(60);
const STATUS_EVENT: &str = "update:status";

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

  fn name(self) -> &'static str {
    match self {
      Self::Stable => "stable",
      Self::Beta => "beta",
    }
  }
}

/// The user's update choices, kept in the app's config folder, which updates leave alone.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSettings {
  /// Apps saved before they had a beta channel only saved `autoCheck`, so they start on stable.
  #[serde(default = "stable")]
  pub channel: UpdateChannel,
  /// Whether the app checks on its own, at start and every few hours.
  #[serde(default = "checks_automatically")]
  pub auto_check: bool,
}

fn stable() -> UpdateChannel {
  UpdateChannel::Stable
}

fn checks_automatically() -> bool {
  true
}

/// The settings as saved, with the app version that saved them, so the first start of a different build shows.
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
  /// A downloaded update waiting for the user to confirm the install.
  downloaded: Option<(Update, Vec<u8>)>,
  /// Counts checks started, so only the latest one reports what it found.
  latest_check: u64,
}

pub struct Updater {
  product: &'static str,
  /// `None` when updates are unsupported.
  feed: Option<String>,
  before_exit: Option<Arc<dyn Fn() + Send + Sync>>,
  inner: Mutex<Inner>,
}

impl Updater {
  pub(crate) fn new(
    product: &'static str,
    feed_url: &'static str,
    before_exit: Option<Arc<dyn Fn() + Send + Sync>>,
  ) -> Self {
    let test_feed = cfg!(debug_assertions).then(|| std::env::var(TEST_FEED_VAR).ok()).flatten();
    let feed = match test_feed {
      Some(url) => Some(if url.ends_with('/') { url } else { format!("{url}/") }),
      None if !cfg!(debug_assertions) => Some(feed_url.to_string()),
      None => None,
    };
    let status = if feed.is_some() { UpdateStatus::Idle } else { UpdateStatus::Unsupported };
    Self {
      product,
      feed,
      before_exit,
      inner: Mutex::new(Inner { status, settings: None, offered: None, downloaded: None, latest_check: 0 }),
    }
  }

  /// Checks now and then every few hours, unless the user turned that off. Only installed builds update themselves.
  pub(crate) fn start<R: Runtime>(app: &AppHandle<R>) {
    if app.state::<Updater>().feed.is_none() || std::env::var_os(NO_AUTO_CHECK_VAR).is_some() {
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

  fn set<R: Runtime>(&self, app: &AppHandle<R>, status: UpdateStatus) {
    self.inner.lock().unwrap().status = status.clone();
    let _ = app.emit(STATUS_EVENT, status);
  }

  /// Marks a check as running, returning its number for `finish_check`.
  fn start_check<R: Runtime>(&self, app: &AppHandle<R>) -> u64 {
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
  fn finish_check<R: Runtime>(&self, app: &AppHandle<R>, check: u64, status: UpdateStatus, offered: Option<Update>) {
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

  pub fn settings<R: Runtime>(&self, app: &AppHandle<R>) -> UpdateSettings {
    let mut inner = self.inner.lock().unwrap();
    *inner.settings.get_or_insert_with(|| load_settings(app))
  }

  pub fn channel<R: Runtime>(&self, app: &AppHandle<R>) -> UpdateChannel {
    self.settings(app).channel
  }

  fn change_settings<R: Runtime>(
    &self,
    app: &AppHandle<R>,
    change: impl FnOnce(&mut UpdateSettings),
  ) -> Result<(), Text> {
    // Held throughout, so two changes at once can't both start from the old settings and lose one.
    let mut inner = self.inner.lock().unwrap();
    let mut settings = *inner.settings.get_or_insert_with(|| load_settings(app));
    change(&mut settings);
    save_settings(app, settings)?;
    inner.settings = Some(settings);
    Ok(())
  }

  /// Turning automatic checks back on checks straight away.
  pub async fn set_auto_check<R: Runtime>(&self, app: &AppHandle<R>, auto_check: bool) -> Result<UpdateStatus, Text> {
    self.change_settings(app, |settings| settings.auto_check = auto_check)?;
    Ok(if auto_check { self.check(app).await } else { self.status() })
  }

  pub async fn set_channel<R: Runtime>(
    &self,
    app: &AppHandle<R>,
    channel: UpdateChannel,
  ) -> Result<UpdateStatus, Text> {
    self.change_settings(app, |settings| settings.channel = channel)?;
    {
      let mut inner = self.inner.lock().unwrap();
      // An update found on the other channel may not be on this one, whatever is showing now.
      inner.offered = None;
      if matches!(inner.status, UpdateStatus::Available { .. }) {
        inner.status = UpdateStatus::Idle;
      }
    }
    Ok(self.check(app).await)
  }

  async fn fetch<R: Runtime>(&self, app: &AppHandle<R>) -> Result<Option<Update>, tauri_plugin_updater::Error> {
    let Some(feed) = self.feed.as_deref() else { return Ok(None) };
    let channel = self.channel(app);
    let url = format!("{feed}{}", channel.feed_file()).parse()?;
    let mut builder = app
      .updater_builder()
      .endpoints(vec![url])?
      .header("User-Agent", user_agent(self.product, &app.package_info().version.to_string(), channel))?
      .timeout(CHECK_TIMEOUT)
      .configure_client(|client| client.read_timeout(STALL_TIMEOUT));
    if let Some(before_exit) = self.before_exit.clone() {
      // The installer closes the app straight away, so let the app stop its work first.
      builder = builder.on_before_exit(move || before_exit());
    }
    let update = builder.build()?.check().await?;
    // The timeout is for the check only: a slow connection can take far longer to download the installer.
    Ok(update.map(|mut update| {
      update.timeout = None;
      update
    }))
  }

  pub async fn check<R: Runtime>(&self, app: &AppHandle<R>) -> UpdateStatus {
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

  /// Behind a downloaded update: checks the feed still offers that version. If it offers another one (a newer
  /// release, or the user switched channel), that is downloaded in its place; if it offers nothing, the waiting one
  /// is dropped. Failing to reach the feed leaves it as it is.
  async fn replace_downloaded<R: Runtime>(&self, app: &AppHandle<R>, ready_version: &str) -> UpdateStatus {
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
      // The waiting update stays until its replacement has downloaded, in case that fails.
      if replacement.is_none() {
        inner.downloaded = None;
      }
      inner.offered = replacement;
    }
    self.set(app, status);
    self.download(app).await;
    self.status()
  }

  pub async fn download<R: Runtime>(&self, app: &AppHandle<R>) {
    let channel = self.channel(app);
    // Taken under one lock, so a second request while this one runs does nothing.
    let (update, status) = {
      let mut inner = self.inner.lock().unwrap();
      if matches!(inner.status, UpdateStatus::Downloading { .. }) {
        return;
      }
      let Some(update) = inner.offered.clone() else { return };
      let status = UpdateStatus::Downloading {
        version: update.version.clone(),
        percent: 0.0,
        notes: notes_text(update.body.as_deref()),
      };
      inner.status = status.clone();
      (update, status)
    };
    let _ = app.emit(STATUS_EVENT, status);
    let notes = notes_text(update.body.as_deref());
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
        // The user switched channel while this downloaded: make sure the new channel offers it too.
        if self.channel(app) != channel {
          Box::pin(self.check(app)).await;
        }
      }
      Err(error) => {
        // A replacement that failed leaves the update downloaded before it ready to install.
        let kept = self.inner.lock().unwrap().downloaded.as_ref().map(|(update, _)| UpdateStatus::Ready {
          version: update.version.clone(),
          notes: notes_text(update.body.as_deref()),
        });
        let failed = UpdateStatus::Error { message: friendly_error(&error, self.channel(app)) };
        self.set(app, kept.unwrap_or(failed));
      }
    }
  }

  /// Runs the downloaded installer, which installs silently in the background and reopens the app; the app closes
  /// straight away.
  pub fn install<R: Runtime>(&self, app: &AppHandle<R>) -> Result<(), Text> {
    let Some((update, bytes)) = self.inner.lock().unwrap().downloaded.take() else {
      return Err(Text::new("There is no downloaded update to install."));
    };
    if let Err(error) = update.install(&bytes) {
      // Shows on the update icon, where trying again checks and downloads afresh.
      let message = friendly_error(&error, self.channel(app));
      self.set(app, UpdateStatus::Error { message: message.clone() });
      return Err(message);
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

/// The notes come from the feed, which the signature does not cover, so they are only ever shown as plain text.
fn notes_text(notes: Option<&str>) -> Option<String> {
  notes.map(str::trim).filter(|text| !text.is_empty()).map(String::from)
}

/// Names the app to the update server, so its traffic stats can tell it from bots and the download page, and show
/// which versions, platforms and channels are in use. Nothing in it identifies a user or a computer.
fn user_agent(product: &str, version: &str, channel: UpdateChannel) -> String {
  format!("{product}/{version} ({}; {}; {})", std::env::consts::OS, install_format(), channel.name())
}

/// How this copy was installed: `nsis`, `appimage`, `deb` or `rpm`, or `unknown` for a development build.
pub fn install_format() -> &'static str {
  use tauri::utils::config::BundleType;
  match tauri::utils::platform::bundle_type() {
    Some(BundleType::Nsis) => "nsis",
    Some(BundleType::AppImage) => "appimage",
    Some(BundleType::Deb) => "deb",
    Some(BundleType::Rpm) => "rpm",
    _ => "unknown",
  }
}

fn now_millis() -> u64 {
  SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

fn friendly_error(error: &tauri_plugin_updater::Error, channel: UpdateChannel) -> Text {
  use tauri_plugin_updater::Error as E;
  match error {
    E::Reqwest(_) | E::Network(_) => Text::new("Couldn't reach the update server."),
    E::ReleaseNotFound | E::TargetNotFound(_) | E::TargetsNotFound(_) => match channel {
      UpdateChannel::Beta => Text::new("No beta release has been published yet."),
      UpdateChannel::Stable => Text::new("No release has been published yet."),
    },
    E::Minisign(_) | E::SignedVersionMismatch { .. } | E::MissingSignedVersion => {
      Text::new("The update failed a security check, so it wasn't installed.")
    }
    other => {
      Text::new("The update failed: {error}").with("error", other.to_string().lines().next().unwrap_or_default())
    }
  }
}

fn load_settings<R: Runtime>(app: &AppHandle<R>) -> UpdateSettings {
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
/// through the beta channel, moves the app to the beta channel; choosing stable after that sticks until another build
/// is installed. A stable build keeps the channel it finds, so beta users stay on beta when a stable release reaches
/// them. Without saved settings, everything else starts on stable with automatic checks on.
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

fn settings_path<R: Runtime>(app: &AppHandle<R>) -> Option<std::path::PathBuf> {
  app.path().app_config_dir().ok().map(|dir| dir.join("update-settings.json"))
}

fn save_settings<R: Runtime>(app: &AppHandle<R>, settings: UpdateSettings) -> Result<(), Text> {
  let failed = |error: std::io::Error| Text::new("The update settings couldn't be saved: {error}").with("error", error);
  let path = settings_path(app).ok_or_else(|| Text::new("The settings folder couldn't be found."))?;
  if let Some(dir) = path.parent() {
    std::fs::create_dir_all(dir).map_err(failed)?;
  }
  let saved = SavedSettings { settings, version: Some(app.package_info().version.to_string()) };
  // Written whole and then swapped in, since a file cut short reads as no settings, which would turn automatic checks
  // back on.
  let tmp = path.with_extension("json.tmp");
  std::fs::write(&tmp, serde_json::to_string(&saved).unwrap() + "\n").map_err(failed)?;
  std::fs::rename(&tmp, &path).map_err(failed)
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
    // A beta installed over a stable install.
    assert_eq!(channel(saved(UpdateChannel::Stable, Some("1.1.0")), "1.2.0-beta.1"), UpdateChannel::Beta);
    // Choosing stable while running that beta sticks.
    let (settings, changed) = settings_for_build(saved(UpdateChannel::Stable, Some("1.2.0-beta.1")), "1.2.0-beta.1");
    assert_eq!((settings.channel, changed), (UpdateChannel::Stable, false));
    // A beta user who updates to a stable release stays on beta.
    assert_eq!(channel(saved(UpdateChannel::Beta, Some("1.2.0-beta.2")), "1.2.0"), UpdateChannel::Beta);
    assert_eq!(UpdateChannel::Beta.feed_file(), "beta.json");
    assert_eq!(UpdateChannel::Stable.feed_file(), "latest.json");
  }

  #[test]
  fn user_agent_names_the_app_version_platform_and_channel() {
    let os = std::env::consts::OS;
    // Test builds aren't bundled, so their format is unknown.
    assert_eq!(
      user_agent("Flare-Navgen", "1.2.0", UpdateChannel::Stable),
      format!("Flare-Navgen/1.2.0 ({os}; unknown; stable)")
    );
    assert_eq!(
      user_agent("Flare-Tools", "1.3.0-beta.1", UpdateChannel::Beta),
      format!("Flare-Tools/1.3.0-beta.1 ({os}; unknown; beta)")
    );
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
    assert_eq!(
      serde_json::to_value(UpdateStatus::Error { message: Text::new("Couldn't reach the update server.") }).unwrap(),
      serde_json::json!({ "state": "error", "message": { "message": "Couldn't reach the update server.", "values": {} } })
    );
  }

  #[test]
  fn explains_errors_in_plain_words() {
    use tauri_plugin_updater::Error as E;
    let english = |error, channel| friendly_error(&error, channel).to_string();
    assert_eq!(english(E::Network("timeout".into()), UpdateChannel::Stable), "Couldn't reach the update server.");
    assert_eq!(english(E::ReleaseNotFound, UpdateChannel::Beta), "No beta release has been published yet.");
    assert!(english(E::MissingSignedVersion, UpdateChannel::Stable).contains("security check"));
  }

  #[test]
  fn settings_default_to_checking_automatically_on_stable() {
    let settings: UpdateSettings = serde_json::from_str(r#"{"channel":"beta"}"#).unwrap();
    assert_eq!(settings, UpdateSettings { channel: UpdateChannel::Beta, auto_check: true });
    // Saved by an app before it had a beta channel.
    let settings: UpdateSettings = serde_json::from_str(r#"{"autoCheck":false}"#).unwrap();
    assert_eq!(settings, UpdateSettings { channel: UpdateChannel::Stable, auto_check: false });
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
