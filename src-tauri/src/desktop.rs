//! Fits the window to the Linux desktop. The AppImage bundles its own GTK and points it at its own settings and theme,
//! so without this the title bar shows only a close button and ignores the light or dark look the launcher asks for.

use gtk::prelude::GtkSettingsExt;

/// Before GTK starts: lets the window's theme choose between light and dark Adwaita. The AppImage's start-up script
/// pins GTK to `Adwaita:light` or `Adwaita:dark`, guessing from settings it usually can't read, and a pinned variant
/// overrides the window's theme, so the title bar stayed light. A different theme the player chose through
/// `APPIMAGE_GTK_THEME` is left alone.
pub fn unpin_theme_variant() {
  if std::env::var_os("APPDIR").is_some()
    && matches!(std::env::var("GTK_THEME").as_deref(), Ok("Adwaita:light" | "Adwaita:dark"))
  {
    // SAFETY: called first thing in `run`, before any other thread exists.
    unsafe { std::env::remove_var("GTK_THEME") };
  }
}

/// After GTK starts: with the variant unpinned, names Adwaita as the theme, since it is the one the AppImage bundles.
pub fn use_adwaita() {
  if std::env::var_os("APPDIR").is_some()
    && std::env::var_os("GTK_THEME").is_none()
    && let Some(settings) = gtk::Settings::default()
  {
    settings.set_gtk_theme_name(Some("Adwaita"));
  }
}

/// After GTK starts: shows the title bar buttons the desktop is set to show, such as Ubuntu's minimise, maximise and
/// close. Asks the system's own gsettings, away from the AppImage's bundled schemas, which only know GNOME's default.
pub fn follow_button_layout() {
  let mut command = std::process::Command::new("gsettings");
  command.args(["get", "org.gnome.desktop.wm.preferences", "button-layout"]);
  let Ok(output) = without_appimage_env(&mut command).output() else { return };
  let layout = String::from_utf8_lossy(&output.stdout);
  let layout = layout.trim().trim_matches('\'');
  if output.status.success()
    && !layout.is_empty()
    && let Some(settings) = gtk::Settings::default()
  {
    settings.set_gtk_decoration_layout(Some(layout));
  }
}

/// Variables the AppImage's start-up script sets to point GTK at the files inside it.
const APPIMAGE_VARS: &[&str] = &[
  "APPDIR",
  "APPIMAGE",
  "ARGV0",
  "OWD",
  "GTK_DATA_PREFIX",
  "GTK_THEME",
  "GTK_EXE_PREFIX",
  "GTK_PATH",
  "GTK_IM_MODULE_FILE",
  "GDK_PIXBUF_MODULE_FILE",
  "GSETTINGS_SCHEMA_DIR",
  "GI_TYPELIB_PATH",
  "GIO_MODULE_DIR",
];

/// Runs a program as if started from the desktop rather than from inside the AppImage: without the variables that
/// point at the AppImage's own files, and with its folders taken out of every list of paths, such as `PATH`,
/// `LD_LIBRARY_PATH` and `XDG_DATA_DIRS`. System programs then use their own libraries and settings (Steam's start-up
/// script fails on the AppImage's older libraries), and a new copy of the launcher doesn't inherit paths into this
/// copy's soon-gone mount.
pub fn without_appimage_env(command: &mut std::process::Command) -> &mut std::process::Command {
  for var in APPIMAGE_VARS {
    command.env_remove(var);
  }
  if let Ok(appdir) = std::env::var("APPDIR") {
    for (name, value) in outside_appdir(std::env::vars(), &appdir) {
      match value {
        Some(value) => command.env(name, value),
        None => command.env_remove(name),
      };
    }
  }
  command
}

/// Opens a link or folder with the desktop's own app for it, away from the AppImage's libraries and settings. A
/// `steam://` link may start Steam, which fails to start the game with them, as do some file managers.
pub fn open(target: &str) -> std::io::Result<()> {
  let mut command = std::process::Command::new("xdg-open");
  command.arg(target);
  let mut child = without_appimage_env(&mut command).spawn()?;
  // Collected once it ends, so it doesn't linger as a finished process.
  std::thread::spawn(move || child.wait());
  Ok(())
}

/// The variables that mention the AppImage's folder, each with that folder's entries taken out of it, or `None` when
/// nothing is left.
fn outside_appdir(vars: impl Iterator<Item = (String, String)>, appdir: &str) -> Vec<(String, Option<String>)> {
  vars
    .filter(|(name, value)| !APPIMAGE_VARS.contains(&name.as_str()) && value.contains(appdir))
    .map(|(name, value)| {
      let kept: Vec<&str> = value.split(':').filter(|entry| !entry.is_empty() && !entry.starts_with(appdir)).collect();
      (name, (!kept.is_empty()).then(|| kept.join(":")))
    })
    .collect()
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn takes_the_appimage_out_of_inherited_paths() {
    let appdir = "/tmp/.mount_flare-Mk";
    let vars = [
      ("PATH", "/tmp/.mount_flare-Mk/usr/bin/:/tmp/.mount_flare-Mk/bin/:/usr/local/bin:/usr/bin"),
      ("LD_LIBRARY_PATH", "/tmp/.mount_flare-Mk/usr/lib/:/tmp/.mount_flare-Mk/usr/lib64"),
      ("XDG_DATA_DIRS", "/tmp/.mount_flare-Mk/usr/share/:/usr/share:"),
      ("PYTHONHOME", "/tmp/.mount_flare-Mk/usr/"),
      ("HOME", "/home/lewis"),
      ("GTK_PATH", "/tmp/.mount_flare-Mk//usr/lib/gtk-3.0"),
    ]
    .map(|(name, value)| (name.to_string(), value.to_string()));
    let mut cleaned = outside_appdir(vars.into_iter(), appdir);
    cleaned.sort();
    let expected: Vec<(String, Option<String>)> = vec![
      ("LD_LIBRARY_PATH".into(), None),
      ("PATH".into(), Some("/usr/local/bin:/usr/bin".into())),
      ("PYTHONHOME".into(), None),
      ("XDG_DATA_DIRS".into(), Some("/usr/share".into())),
    ];
    assert_eq!(cleaned, expected);
  }
}
