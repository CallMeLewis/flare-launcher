//! Puts the launcher in the Linux app menu. The Linux version is an AppImage: one file with no installer, so without
//! this a player has to keep the file somewhere and double-click it every time. Adding it moves the file to
//! `~/Applications` and writes a menu entry and icon, as AppImage tools such as Gear Lever do. The Windows installer
//! already adds Start menu shortcuts, so there is nothing to do there.

use serde::Serialize;
use tauri::AppHandle;

use crate::error::Result;

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AppMenu {
  /// Whether this copy can add itself: only an AppImage on Linux.
  supported: bool,
  /// Whether some menu entry opens this copy.
  added: bool,
  /// Whether that entry is the launcher's own, so it can remove it. An entry made by another tool is left alone.
  ours: bool,
}

#[tauri::command]
pub fn app_menu_status() -> AppMenu {
  imp::status()
}

/// Adds the launcher to the app menu, and returns whether it is reopening. If the file had to move, the launcher
/// reopens from its new place and this copy closes: its update check would otherwise keep writing updates to where the
/// file used to be.
#[tauri::command]
pub fn add_to_app_menu(app: AppHandle) -> Result<bool> {
  imp::add(&app)
}

/// Takes the launcher's own entry out of the app menu. The AppImage stays in `~/Applications`.
#[tauri::command]
pub fn remove_from_app_menu() -> Result<()> {
  imp::remove()
}

#[cfg(target_os = "linux")]
mod imp {
  use std::path::{Path, PathBuf};
  use std::process::Command;

  use tauri::AppHandle;

  use super::AppMenu;
  use crate::desktop::without_appimage_env;
  use crate::error::Result;
  use crate::text;

  /// Named after the program, which is what the window reports to the desktop, so docks match the window to it.
  const DESKTOP_FILE: &str = "flare-launcher.desktop";
  const ICON_FILE: &str = "flare-launcher.png";
  /// No version in the name: updates replace this same file, so the menu entry keeps working.
  const APPIMAGE_NAME: &str = "Flare-Launcher.AppImage";
  const ICON: &[u8] = include_bytes!("../icons/128x128@2x.png");

  /// The AppImage this copy runs from, set by the AppImage runtime.
  fn appimage() -> Option<PathBuf> {
    std::env::var_os("APPIMAGE").map(PathBuf::from).filter(|path| path.is_file())
  }

  /// Where the desktop looks for a user's menu entries and icons.
  fn data_home() -> Option<PathBuf> {
    std::env::var_os("XDG_DATA_HOME")
      .map(PathBuf::from)
      .filter(|path| path.is_absolute())
      .or_else(|| std::env::home_dir().map(|home| home.join(".local/share")))
  }

  pub fn status() -> AppMenu {
    let (Some(appimage), Some(data)) = (appimage(), data_home()) else {
      return AppMenu { supported: false, added: false, ours: false };
    };
    let apps = data.join("applications");
    let ours = opens(&apps.join(DESKTOP_FILE), &appimage);
    AppMenu { supported: true, added: ours || any_entry_opens(&apps, &appimage), ours }
  }

  pub fn add(app: &AppHandle) -> Result<bool> {
    let current = appimage().ok_or_else(|| text!("Only the AppImage can add itself to the app menu."))?;
    let home = std::env::home_dir().ok_or_else(|| text!("Your home folder couldn't be found."))?;
    let data = data_home().ok_or_else(|| text!("Your home folder couldn't be found."))?;
    let target = home.join("Applications").join(APPIMAGE_NAME);
    let moved = current != target;
    if moved {
      move_file(&current, &target)?;
    }
    let icon = data.join("icons/hicolor/256x256/apps").join(ICON_FILE);
    std::fs::create_dir_all(icon.parent().unwrap())?;
    std::fs::write(&icon, ICON)?;
    let apps = data.join("applications");
    std::fs::create_dir_all(&apps)?;
    std::fs::write(apps.join(DESKTOP_FILE), desktop_entry(&target, &icon))?;
    refresh_menu(&apps);
    if moved {
      without_appimage_env(&mut Command::new(&target))
        .spawn()
        .map_err(|e| text!("Flare Launcher is in your app menu, but couldn't reopen: {error}", error = e))?;
      app.exit(0);
    }
    Ok(moved)
  }

  pub fn remove() -> Result<()> {
    let data = data_home().ok_or_else(|| text!("Your home folder couldn't be found."))?;
    let apps = data.join("applications");
    remove_if_present(&apps.join(DESKTOP_FILE))?;
    remove_if_present(&data.join("icons/hicolor/256x256/apps").join(ICON_FILE))?;
    refresh_menu(&apps);
    Ok(())
  }

  fn remove_if_present(path: &Path) -> Result<()> {
    match std::fs::remove_file(path) {
      Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.into()),
      _ => Ok(()),
    }
  }

  /// Moves a file, copying it across when the destination is on another drive. A running AppImage can be moved: the
  /// copy that is running stays open until it closes.
  fn move_file(from: &Path, to: &Path) -> Result<()> {
    std::fs::create_dir_all(to.parent().unwrap())?;
    match std::fs::rename(from, to) {
      Err(e) if e.kind() == std::io::ErrorKind::CrossesDevices => {
        std::fs::copy(from, to)?;
        std::fs::remove_file(from)?;
        Ok(())
      }
      result => Ok(result?),
    }
  }

  /// Lets the desktop see the new entry straight away. Most desktops notice by themselves, so failing is fine.
  fn refresh_menu(apps: &Path) {
    let _ = without_appimage_env(Command::new("update-desktop-database").arg(apps)).output();
  }

  pub(super) fn desktop_entry(appimage: &Path, icon: &Path) -> String {
    format!(
      "[Desktop Entry]\n\
       Type=Application\n\
       Name=Flare Launcher\n\
       Comment=Server browser and mod launcher for DayZ\n\
       Exec={}\n\
       TryExec={}\n\
       Icon={}\n\
       Terminal=false\n\
       Categories=Game;\n\
       StartupWMClass=flare-launcher\n",
      exec_quote(appimage),
      appimage.display(),
      icon.display(),
    )
  }

  /// A path quoted for an `Exec=` line, as the desktop entry specification asks.
  fn exec_quote(path: &Path) -> String {
    let mut quoted = String::from("\"");
    for c in path.display().to_string().chars() {
      if matches!(c, '"' | '`' | '$' | '\\') {
        quoted.push('\\');
      }
      quoted.push(c);
    }
    quoted.push('"');
    quoted
  }

  /// Whether a desktop entry exists and its `Exec=` line runs this AppImage.
  pub(super) fn opens(entry: &Path, appimage: &Path) -> bool {
    let target = appimage.display().to_string();
    std::fs::read_to_string(entry)
      .map(|text| text.lines().any(|line| line.starts_with("Exec=") && line.contains(&target)))
      .unwrap_or(false)
  }

  /// Whether any entry in the folder opens this AppImage, such as one made by Gear Lever or AppImageLauncher.
  pub(super) fn any_entry_opens(apps: &Path, appimage: &Path) -> bool {
    std::fs::read_dir(apps)
      .map(|entries| {
        entries
          .filter_map(|entry| entry.ok())
          .map(|entry| entry.path())
          .filter(|path| path.extension().is_some_and(|ext| ext == "desktop"))
          .any(|path| opens(&path, appimage))
      })
      .unwrap_or(false)
  }
}

#[cfg(not(target_os = "linux"))]
mod imp {
  use tauri::AppHandle;

  use super::AppMenu;
  use crate::error::Result;
  use crate::text;

  pub fn status() -> AppMenu {
    AppMenu { supported: false, added: false, ours: false }
  }

  pub fn add(_app: &AppHandle) -> Result<bool> {
    Err(text!("The installer already added Flare Launcher to the Start menu.").into())
  }

  pub fn remove() -> Result<()> {
    Err(text!("Use Add or remove programs to take Flare Launcher off this computer.").into())
  }
}

#[cfg(all(test, target_os = "linux"))]
mod tests {
  use std::path::Path;

  use super::imp::{any_entry_opens, desktop_entry, opens};

  #[test]
  fn writes_a_desktop_entry_that_runs_the_appimage() {
    let entry = desktop_entry(Path::new("/home/a b/Applications/Flare-Launcher.AppImage"), Path::new("/i/f.png"));
    assert!(entry.starts_with("[Desktop Entry]\n"));
    assert!(entry.contains("\nExec=\"/home/a b/Applications/Flare-Launcher.AppImage\"\n"));
    assert!(entry.contains("\nTryExec=/home/a b/Applications/Flare-Launcher.AppImage\n"));
    assert!(entry.contains("\nIcon=/i/f.png\n"));
    assert!(entry.contains("\nStartupWMClass=flare-launcher\n"));
    assert!(!entry.contains("\n "), "no indented lines");
  }

  #[test]
  fn quotes_characters_the_exec_line_reserves() {
    let entry = desktop_entry(Path::new("/home/x$\"y/F.AppImage"), Path::new("/i.png"));
    assert!(entry.contains("\nExec=\"/home/x\\$\\\"y/F.AppImage\"\n"));
  }

  #[test]
  fn finds_entries_that_open_this_appimage() {
    let root = std::env::temp_dir().join(format!("dzsl-menu-test-{}", std::process::id()));
    let apps = root.join("applications");
    std::fs::create_dir_all(&apps).unwrap();
    let appimage = root.join("Applications/Flare-Launcher.AppImage");

    assert!(!any_entry_opens(&apps, &appimage), "an empty folder has no entry");
    std::fs::write(apps.join("other.desktop"), "[Desktop Entry]\nExec=/usr/bin/other\n").unwrap();
    assert!(!any_entry_opens(&apps, &appimage));
    // An entry made by another tool, with its own name and arguments.
    let gear = apps.join("gearlever_flare.desktop");
    std::fs::write(&gear, format!("[Desktop Entry]\nExec=\"{}\" %U\n", appimage.display())).unwrap();
    assert!(any_entry_opens(&apps, &appimage));
    assert!(opens(&gear, &appimage));
    assert!(!opens(&apps.join("missing.desktop"), &appimage));

    std::fs::remove_dir_all(root).unwrap();
  }
}
