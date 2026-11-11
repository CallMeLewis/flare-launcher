//! Flare Launcher's self-updates, from its feed on Cloudflare R2. The feed points at the installer on each version's
//! GitHub release.
//!
//! The launcher adds Tauri's updater plugin, which this one drives, and then this one (see `lib.rs` in the launcher):
//!
//! ```ignore
//! .plugin(tauri_plugin_flare_updater::updater())
//! .plugin(tauri_plugin_flare_updater::Builder::new("Flare-Launcher", "https://updates.darkzone.dev/dayz-server-launcher/")
//!     .build())
//! ```
//!
//! and the `flare-updater:default` permission in its capabilities. The installer's public key stays in the app's
//! `tauri.conf.json` (`plugins.updater.pubkey`), with `windows.installMode` set to `quiet`.
//!
//! So a downloaded update installs when the app closes, the app runs `install_on_exit` from its own run callback:
//!
//! ```ignore
//! .build(tauri::generate_context!())?
//! .run(|app, event| {
//!     if let tauri::RunEvent::Exit = event {
//!         tauri_plugin_flare_updater::install_on_exit(app);
//!     }
//! });
//! ```
//!
//! It goes there rather than in this plugin because on Windows the installer ends the process, and the app's callback
//! runs after every plugin has handled the exit, such as the window-state plugin saving the window's size.
//!
//! The window calls `plugin:flare-updater|<command>` (see `commands.rs`) and hears every change of status as the
//! `update:status` event.

mod commands;
mod text;
mod updater;

use std::sync::Arc;

use tauri::plugin::{Builder as PluginBuilder, TauriPlugin};
use tauri::{AppHandle, Manager, Runtime};

pub use text::Text;
pub use updater::{UpdateChannel, UpdateSettings, UpdateStatus, Updater, install_format};

/// Development aid: `FLARE_UPDATE_TEST_URL=<url>` points a debug build at a local folder served over HTTP holding
/// latest.json, beta.json and an installer, to try the update flow without publishing a release. Without it, debug
/// builds report updates as unsupported.
pub const TEST_FEED_VAR: &str = "FLARE_UPDATE_TEST_URL";

/// Set by the apps' CI smoke tests, so the builds they start don't check the feed on their own and show up in the
/// update server's stats. Checking by hand still works.
pub const NO_AUTO_CHECK_VAR: &str = "FLARE_NO_AUTO_UPDATE_CHECK";

/// Tauri's updater plugin, which this one drives. Register it before this one. It can't come with this plugin, as a
/// plugin that adds another while the app is setting its plugins up waits on itself and the app never opens.
pub fn updater<R: Runtime>() -> TauriPlugin<R, tauri_plugin_updater::Config> {
  tauri_plugin_updater::Builder::new().build()
}

/// Installs a downloaded update as the app exits, without reopening it, where that needs nothing from the user. Call
/// it on `RunEvent::Exit`; see the crate's documentation.
pub fn install_on_exit<R: Runtime>(app: &AppHandle<R>) {
  if let Some(updater) = app.try_state::<Updater>() {
    updater.install_on_exit();
  }
}

/// What an app runs just before the installer closes it.
type BeforeExit<R> = Arc<dyn Fn(&AppHandle<R>) + Send + Sync>;

pub struct Builder<R: Runtime> {
  product: &'static str,
  feed_url: &'static str,
  on_before_exit: Option<BeforeExit<R>>,
}

impl<R: Runtime> Builder<R> {
  /// `product` names the app to the update server, such as `Flare-Navgen`. `feed_url` is the folder holding the
  /// app's latest.json and beta.json, ending in `/`; it must match the one the app's release script publishes to.
  pub fn new(product: &'static str, feed_url: &'static str) -> Self {
    Self { product, feed_url, on_before_exit: None }
  }

  /// Runs just before the installer closes the app, to stop work it would otherwise cut off.
  pub fn on_before_exit(mut self, stop: impl Fn(&AppHandle<R>) + Send + Sync + 'static) -> Self {
    self.on_before_exit = Some(Arc::new(stop));
    self
  }

  pub fn build(self) -> TauriPlugin<R> {
    let Self { product, feed_url, on_before_exit } = self;
    PluginBuilder::new("flare-updater")
      .invoke_handler(tauri::generate_handler![
        commands::status,
        commands::check,
        commands::download,
        commands::install,
        commands::settings,
        commands::set_auto_check,
        commands::set_channel,
      ])
      .setup(move |app, _api| {
        let before_exit: Option<Arc<dyn Fn() + Send + Sync>> = on_before_exit.map(|stop| {
          let app = app.clone();
          Arc::new(move || stop(&app)) as Arc<dyn Fn() + Send + Sync>
        });
        app.manage(Updater::new(product, feed_url, before_exit));
        Updater::start(app);
        Ok(())
      })
      .build()
  }
}
