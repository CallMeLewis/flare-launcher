//! Join links. `flare-launcher://join/<host>:<port>` opens the launcher on a server, and only selects it: the player
//! still chooses Play. Players share them as `https://flarelauncher.app/join/<host>:<port>`, a page that opens the
//! launcher, or offers it to download when it isn't installed.
//!
//! Windows and Linux start a new copy of the launcher for each link. The single-instance plugin hands the link to the
//! copy already open instead, and the deep-link plugin reads it.

use std::sync::Mutex;

use tauri::{AppHandle, Emitter, Manager, State};

/// The scheme join links use, also set in `tauri.conf.json` and the AppImage's menu entry.
pub const SCHEME: &str = "flare-launcher";

/// Tells the interface a join link is waiting, to collect with [`take_join_link`].
const EVENT: &str = "join-link";

/// The address from the last join link, until the interface collects it. Kept rather than sent with the event, so a
/// link that starts the launcher waits for the interface to load.
#[derive(Default)]
pub struct PendingLink(Mutex<Option<String>>);

/// The server address in a join link, such as `1.2.3.4:2302` or `dayz.example.com`, or `None` for anything else.
pub fn join_address(link: &str) -> Option<String> {
  let (scheme, rest) = link.split_once("://")?;
  if !scheme.eq_ignore_ascii_case(SCHEME) {
    return None;
  }
  let address = rest.strip_prefix("join/")?.trim_end_matches('/');
  let (host, port) = match address.rsplit_once(':') {
    Some((host, port)) => (host, Some(port)),
    None => (address, None),
  };
  let host_ok = !host.is_empty()
    && host.len() <= 253
    && !host.starts_with(['-', '.'])
    && host.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-');
  let port_ok = port.is_none_or(|port| port.parse::<u16>().is_ok_and(|port| port > 0));
  (host_ok && port_ok).then(|| address.to_string())
}

/// Brings the launcher's window to the front, as when another copy is started or a link is opened.
pub fn show_window(app: &AppHandle) {
  if let Some(window) = app.get_webview_window("main") {
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
  }
}

/// Takes in links the launcher was opened with. Never logs the address, as logs go into problem reports.
pub fn receive(app: &AppHandle, links: &[String]) {
  for link in links {
    let Some(address) = join_address(link) else {
      log::warn!("ignored a link that isn't a join link");
      continue;
    };
    *app.state::<PendingLink>().0.lock().unwrap_or_else(|poisoned| poisoned.into_inner()) = Some(address);
    let _ = app.emit(EVENT, ());
    show_window(app);
  }
}

/// The address from the last join link, once.
#[tauri::command]
pub fn take_join_link(pending: State<'_, PendingLink>) -> Option<String> {
  pending.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner()).take()
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn reads_the_address_from_a_join_link() {
    assert_eq!(join_address("flare-launcher://join/1.2.3.4:2302").as_deref(), Some("1.2.3.4:2302"));
    assert_eq!(join_address("flare-launcher://join/1.2.3.4:2302/").as_deref(), Some("1.2.3.4:2302"));
    assert_eq!(join_address("Flare-Launcher://join/dayz.example.com").as_deref(), Some("dayz.example.com"));
  }

  #[test]
  fn turns_down_anything_else() {
    for link in [
      "https://flarelauncher.app/join/1.2.3.4:2302",
      "flare-launcher://play/1.2.3.4:2302",
      "flare-launcher://join/",
      "flare-launcher://join/1.2.3.4:0",
      "flare-launcher://join/1.2.3.4:99999",
      "flare-launcher://join/1.2.3.4:port",
      "flare-launcher://join/-rf",
      "flare-launcher://join/1.2.3.4:2302?password=x",
      "flare-launcher://join/a b",
      "flare-launcher://join/1.2.3.4:2302/extra",
    ] {
      assert_eq!(join_address(link), None, "{link}");
    }
  }
}
