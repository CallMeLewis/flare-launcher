/// The commands the window can call, as `plugin:flare-updater|<command>`. Each gets an allow and a deny permission.
const COMMANDS: &[&str] = &["status", "check", "download", "install", "settings", "set_auto_check", "set_channel"];

fn main() {
  tauri_plugin::Builder::new(COMMANDS).build();
}
