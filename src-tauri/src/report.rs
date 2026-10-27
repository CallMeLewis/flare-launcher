//! Reports a player chooses to send when something fails: what they were doing, the error, how the launcher and
//! Steam are set up, and the launcher's last few log lines. The player sees the whole report before it's sent, and
//! nothing is sent without them asking. A report never holds server names or addresses, and paths in it have the
//! home folder replaced with `~`.

use std::collections::VecDeque;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Manager};

use crate::error::Result;
use crate::text;

/// Where reports go: the stats dashboard's Worker, which stores them for its Reports page.
const REPORT_URL: &str = "https://stats.darkzone.dev/api/report";

/// Development aid: `DZSL_REPORT_URL=<url>` sends a debug build's reports elsewhere, such as the dashboard running
/// locally (`http://127.0.0.1:5174/api/report`).
const TEST_URL_VAR: &str = "DZSL_REPORT_URL";

/// How many log lines a report carries, the newest last.
const KEPT_LINES: usize = 30;

/// The longest note a player can add, in characters.
const MAX_NOTE: usize = 1000;

/// What the player was doing when it failed.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum Problem {
  /// Joining a server: checking its mods, downloading them or starting DayZ.
  Join,
  /// DayZ didn't open in time after joining.
  SlowStart,
  /// Download mods only, which downloads a server's mods without starting DayZ.
  ModDownload,
  ModUpdate,
  ModVerify,
  Unsubscribe,
  /// Checking for, downloading or installing a launcher update.
  Update,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Report {
  problem: Problem,
  /// The error as the interface received it: the launcher's own as `{message, values}`, anything else as text.
  error: Option<Value>,
  version: String,
  /// `windows` or `linux`.
  platform: String,
  /// How the launcher was installed: `nsis`, `appimage`, `deb`, `rpm` or `unknown` for a development build.
  install_format: String,
  channel: tauri_plugin_flare_updater::UpdateChannel,
  /// The operating system's name and version.
  system: String,
  /// How Steam was found, or `None` when it wasn't.
  steam: Option<String>,
  dayz_found: bool,
  /// The DayZ version on this computer, such as `1.30.164200`.
  #[serde(default)]
  game_version: Option<String>,
  /// On Linux, `vm.max_map_count` when it's too low for DayZ.
  low_map_count: Option<u64>,
  log: Vec<String>,
}

/// Keeps the launcher's last few log lines for reports, and prints them in development builds. Nothing is written to
/// disk.
struct Recorder {
  lines: Mutex<VecDeque<String>>,
}

static RECORDER: Recorder = Recorder { lines: Mutex::new(VecDeque::new()) };

impl log::Log for Recorder {
  fn enabled(&self, metadata: &log::Metadata) -> bool {
    metadata.level() <= log::Level::Info
  }

  fn log(&self, record: &log::Record) {
    if !self.enabled(record.metadata()) {
      return;
    }
    if cfg!(debug_assertions) {
      eprintln!("[{} {}] {}", record.level(), record.target(), record.args());
    }
    // Only the launcher's own lines: those from libraries say little about why something failed.
    if record.target().starts_with(env!("CARGO_CRATE_NAME")) {
      record_line(format!("{} {}", record.level(), record.args()));
    }
  }

  fn flush(&self) {}
}

/// Starts keeping log lines. Called once, first thing, so the download helper keeps them too.
pub fn keep_log() {
  if log::set_logger(&RECORDER).is_ok() {
    log::set_max_level(log::LevelFilter::Info);
  }
}

/// Logs panics, which a release build otherwise loses: it has no console, and a panic in a command leaves the interface
/// waiting for an answer that never comes. Logged, it shows in the next report.
pub fn log_panics() {
  let default = std::panic::take_hook();
  std::panic::set_hook(Box::new(move |info| {
    let message = info
      .payload()
      .downcast_ref::<&str>()
      .copied()
      .or_else(|| info.payload().downcast_ref::<String>().map(String::as_str))
      .unwrap_or("unknown cause");
    match info.location() {
      Some(at) => log::error!("Panicked at {}:{}: {message}", at.file(), at.line()),
      None => log::error!("Panicked: {message}"),
    }
    default(info);
  }));
}

/// The longest interface error kept, in characters: enough for the error and the first few components it passed through.
const MAX_INTERFACE_ERROR: usize = 600;

/// Logs an error the interface couldn't recover from, so the next report shows it.
#[tauri::command]
pub fn log_interface_error(message: String) {
  let message: String = message.chars().take(MAX_INTERFACE_ERROR).collect();
  log::error!("Interface error: {message}");
}

/// Adds a line to those kept, such as one the download helper passed back.
pub fn record_line(line: String) {
  let mut lines = RECORDER.lines.lock().unwrap();
  if lines.len() == KEPT_LINES {
    lines.pop_front();
  }
  lines.push_back(line);
}

/// The log lines kept so far, oldest first.
pub fn recent_lines() -> Vec<String> {
  RECORDER.lines.lock().unwrap().iter().cloned().collect()
}

/// Builds the report for a failure, for the player to look over before sending.
#[tauri::command]
pub async fn prepare_report(
  app: AppHandle,
  problem: Problem,
  error: Option<Value>,
  dayz_dir: Option<String>,
) -> Report {
  let install = crate::steam::locate(dayz_dir.as_deref());
  let home = std::env::home_dir();
  let scrub = |text: &str| scrub_text(text, home.as_deref());
  Report {
    problem,
    error: error.map(|error| scrub_error(error, &scrub)),
    version: app.package_info().version.to_string(),
    platform: std::env::consts::OS.to_string(),
    install_format: tauri_plugin_flare_updater::install_format().to_string(),
    channel: app.state::<tauri_plugin_flare_updater::Updater>().channel(&app),
    system: system_name(),
    steam: crate::steam::steam_kind(install.as_ref()).map(String::from),
    dayz_found: install.is_some(),
    game_version: install.as_ref().and_then(|install| crate::steam::game_version(&install.dayz_dir)),
    low_map_count: crate::launch::low_map_count(),
    log: recent_lines().iter().map(|line| scrub(line)).collect(),
  }
}

/// Sends a report the player has looked over, with their note.
#[tauri::command]
pub async fn send_report(http: tauri::State<'_, reqwest::Client>, report: Report, note: String) -> Result<()> {
  let note: String = note.trim().chars().take(MAX_NOTE).collect();
  let url = cfg!(debug_assertions).then(|| std::env::var(TEST_URL_VAR).ok()).flatten();
  let failed = |error: String| text!("The report couldn't be sent: {error}", error = error);
  let response = http
    .post(url.as_deref().unwrap_or(REPORT_URL))
    .json(&serde_json::json!({ "report": report, "note": note }))
    .send()
    .await
    .map_err(|e| failed(e.to_string()))?;
  if !response.status().is_success() {
    return Err(failed(response.status().to_string()).into());
  }
  Ok(())
}

fn system_name() -> String {
  let name = sysinfo::System::long_os_version().unwrap_or_else(|| std::env::consts::OS.to_string());
  match sysinfo::System::kernel_version() {
    Some(kernel) if cfg!(target_os = "linux") => format!("{name}, kernel {kernel}"),
    _ => name,
  }
}

/// Keeps what helps to find the problem and leaves out what could say who or where the player is: numbers stay as
/// they are, an `error` value from the system keeps its text with the home folder hidden, and every other value, such
/// as a server's address, is left out.
fn scrub_error(error: Value, scrub: &impl Fn(&str) -> String) -> Value {
  match error {
    Value::String(text) => Value::String(scrub(&text)),
    Value::Object(mut fields) => {
      if let Some(Value::Object(values)) = fields.get_mut("values") {
        for (name, value) in values.iter_mut() {
          *value = match value {
            Value::Number(_) => value.clone(),
            Value::String(text) if name == "error" => Value::String(scrub(text)),
            _ => Value::String("(left out)".into()),
          };
        }
      }
      Value::Object(fields)
    }
    _ => Value::Null,
  }
}

/// Replaces the home folder in paths with `~`, so the player's account name stays out of the report. Windows paths
/// don't care about case and may be written with either slash.
fn scrub_text(text: &str, home: Option<&std::path::Path>) -> String {
  let Some(home) = home.map(|home| home.to_string_lossy().trim_end_matches(['/', '\\']).to_string()) else {
    return text.to_string();
  };
  if home.len() < 2 {
    return text.to_string();
  }
  if cfg!(windows) {
    let text = replace_folder(text, &home, true);
    replace_folder(&text, &home.replace('\\', "/"), true)
  } else {
    replace_folder(text, &home, false)
  }
}

/// Replaces every copy of a folder's path with `~`, but not a longer name that starts the same, such as
/// `/home/alexander` for `/home/alex`. Windows ignores the case of ASCII letters.
fn replace_folder(text: &str, folder: &str, ignore_case: bool) -> String {
  let (haystack, needle) =
    if ignore_case { (text.to_ascii_lowercase(), folder.to_ascii_lowercase()) } else { (text.into(), folder.into()) };
  let mut result = String::with_capacity(text.len());
  let mut rest = 0;
  for (start, _) in haystack.match_indices(&needle) {
    let end = start + needle.len();
    let whole = text[end..].chars().next().is_none_or(|next| !next.is_alphanumeric());
    if start < rest || !whole {
      continue;
    }
    result.push_str(&text[rest..start]);
    result.push('~');
    rest = end;
  }
  result.push_str(&text[rest..]);
  result
}

#[cfg(test)]
mod tests {
  use std::path::Path;

  use serde_json::json;

  use super::*;

  fn scrub(text: &str) -> String {
    let home = if cfg!(windows) { r"C:\Users\Alex" } else { "/home/alex" };
    scrub_text(text, Some(Path::new(home)))
  }

  #[test]
  fn hides_the_home_folder() {
    if cfg!(windows) {
      assert_eq!(scrub(r"Couldn't open c:\users\alex\Steam\x"), r"Couldn't open ~\Steam\x");
      assert_eq!(scrub("Couldn't open C:/Users/Alex/Steam"), "Couldn't open ~/Steam");
    } else {
      assert_eq!(scrub("Couldn't open /home/alex/.steam/steam"), "Couldn't open ~/.steam/steam");
    }
    assert_eq!(scrub("Steam couldn't be reached."), "Steam couldn't be reached.");
  }

  #[test]
  fn leaves_a_longer_folder_name_alone() {
    let other = if cfg!(windows) { r"C:\Users\Alexander\x" } else { "/home/alexander/x" };
    assert_eq!(scrub(other), other);
  }

  #[test]
  fn keeps_counts_and_system_errors_but_leaves_out_other_values() {
    let error = json!({
      "message": "Couldn't find {host}. Check the address and try again.",
      "values": { "host": "dayz.example.com", "failures": 2, "error": "Access is denied." },
    });
    assert_eq!(
      scrub_error(error, &scrub),
      json!({
        "message": "Couldn't find {host}. Check the address and try again.",
        "values": { "host": "(left out)", "failures": 2, "error": "Access is denied." },
      })
    );
  }

  #[test]
  fn scrubs_errors_sent_as_text() {
    let (path, scrubbed) = if cfg!(windows) { (r"C:\Users\Alex\x", r"~\x") } else { ("/home/alex/x", "~/x") };
    assert_eq!(scrub_error(json!(format!("No such file: {path}")), &scrub), json!(format!("No such file: {scrubbed}")));
  }

  #[test]
  fn keeps_only_the_last_lines() {
    for i in 0..KEPT_LINES + 5 {
      record_line(format!("line {i}"));
    }
    let lines = recent_lines();
    assert_eq!(lines.len(), KEPT_LINES);
    // Other tests may add a line of their own meanwhile.
    assert!(lines.contains(&format!("line {}", KEPT_LINES + 4)));
    assert!(!lines.contains(&"line 0".to_string()));
  }
}
