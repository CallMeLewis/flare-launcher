//! Server passwords the player chose to remember, kept in the computer's own credential store: Windows Credential
//! Manager on Windows, and the Secret Service (GNOME Keyring, KWallet) on Linux. Each is saved under the server's
//! address, so it follows the server rather than a place in the list.

use std::sync::LazyLock;

use keyring_core::Entry;

use crate::error::{Error, Result};
use crate::text;

/// What the passwords are filed under in the credential store, where the player can also see and remove them.
const SERVICE: &str = "Flare Launcher";

/// Opened once. On Linux there may be no Secret Service running, and then passwords can't be remembered.
static STORE: LazyLock<std::result::Result<(), String>> = LazyLock::new(|| {
  #[cfg(windows)]
  let store = windows_native_keyring_store::Store::new();
  #[cfg(target_os = "linux")]
  let store = zbus_secret_service_keyring_store::Store::new();
  let store = store.map_err(|e| e.to_string())?;
  keyring_core::set_default_store(store);
  Ok(())
});

fn entry(server_id: &str) -> Result<Entry> {
  STORE
    .as_ref()
    .map_err(|e| Error::from(text!("No password store was found on this computer ({error}).", error = e)))?;
  Entry::new(SERVICE, server_id).map_err(store_error)
}

fn store_error(error: keyring_core::Error) -> Error {
  text!("The password store couldn't be used: {error}", error = error).into()
}

/// The store can be slow, and on Linux may ask the player to unlock it, so it's never used on the main thread.
async fn off_main_thread<T: Send + 'static>(work: impl FnOnce() -> Result<T> + Send + 'static) -> Result<T> {
  tauri::async_runtime::spawn_blocking(work).await.map_err(|e| Error::msg(e.to_string()))?
}

/// Whether passwords can be remembered on this computer.
#[tauri::command]
pub async fn password_store_available() -> bool {
  off_main_thread(|| Ok(STORE.is_ok())).await.unwrap_or(false)
}

/// The password remembered for a server, if there is one.
#[tauri::command]
pub async fn saved_password(server_id: String) -> Result<Option<String>> {
  off_main_thread(move || match entry(&server_id)?.get_password() {
    Ok(password) => Ok(Some(password)),
    Err(keyring_core::Error::NoEntry) => Ok(None),
    Err(e) => Err(store_error(e)),
  })
  .await
}

#[tauri::command]
pub async fn save_password(server_id: String, password: String) -> Result<()> {
  off_main_thread(move || entry(&server_id)?.set_password(&password).map_err(store_error)).await
}

/// Forgets a server's password. Forgetting one that was never saved is fine.
#[tauri::command]
pub async fn forget_password(server_id: String) -> Result<()> {
  off_main_thread(move || match entry(&server_id)?.delete_credential() {
    Ok(()) | Err(keyring_core::Error::NoEntry) => Ok(()),
    Err(e) => Err(store_error(e)),
  })
  .await
}

#[cfg(test)]
mod tests {
  use super::*;

  /// Uses the real credential store, so it only runs when asked for: `cargo test -- --ignored`.
  #[tokio::test]
  #[ignore]
  async fn saves_reads_and_forgets_a_password() {
    let server = "203.0.113.7:2302".to_string();
    forget_password(server.clone()).await.unwrap();
    assert_eq!(saved_password(server.clone()).await.unwrap(), None);
    save_password(server.clone(), "hunter2".into()).await.unwrap();
    assert_eq!(saved_password(server.clone()).await.unwrap().as_deref(), Some("hunter2"));
    // Passwords in any language, with spaces and quotes, come back exactly as saved.
    let unusual = "Пароль ñandú 日本語 \"quoted\" 🙂";
    save_password(server.clone(), unusual.into()).await.unwrap();
    assert_eq!(saved_password(server.clone()).await.unwrap().as_deref(), Some(unusual));
    forget_password(server.clone()).await.unwrap();
    assert_eq!(saved_password(server.clone()).await.unwrap(), None);
    forget_password(server).await.unwrap();
  }
}
