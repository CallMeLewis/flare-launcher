//! What the window calls, as `plugin:flare-updater|<command>`. Each one is listed in build.rs.

use tauri::{AppHandle, Manager, Runtime, State};

use crate::text::Text;
use crate::updater::{UpdateChannel, UpdateSettings, UpdateStatus, Updater};

#[tauri::command]
pub(crate) fn status(updater: State<'_, Updater>) -> UpdateStatus {
  updater.status()
}

#[tauri::command]
pub(crate) async fn check<R: Runtime>(app: AppHandle<R>, updater: State<'_, Updater>) -> Result<UpdateStatus, ()> {
  Ok(updater.check_and_download(&app).await)
}

#[tauri::command]
pub(crate) async fn download<R: Runtime>(app: AppHandle<R>, updater: State<'_, Updater>) -> Result<(), ()> {
  updater.download(&app).await;
  Ok(())
}

#[tauri::command]
pub(crate) async fn install<R: Runtime>(app: AppHandle<R>) -> Result<(), Text> {
  tauri::async_runtime::spawn_blocking(move || app.state::<Updater>().install(&app))
    .await
    .map_err(|error| Text::new("The update failed: {error}").with("error", error))?
}

#[tauri::command]
pub(crate) fn settings<R: Runtime>(app: AppHandle<R>, updater: State<'_, Updater>) -> UpdateSettings {
  updater.settings(&app)
}

#[tauri::command]
pub(crate) async fn set_auto_check<R: Runtime>(
  app: AppHandle<R>,
  updater: State<'_, Updater>,
  enabled: bool,
) -> Result<UpdateStatus, Text> {
  updater.set_auto_check(&app, enabled).await
}

#[tauri::command]
pub(crate) async fn set_channel<R: Runtime>(
  app: AppHandle<R>,
  updater: State<'_, Updater>,
  channel: UpdateChannel,
) -> Result<UpdateStatus, Text> {
  updater.set_channel(&app, channel).await
}
