mod app_menu;
#[cfg(target_os = "linux")]
mod desktop;
mod error;
mod launch;
mod query;
mod servers;
mod steam;
mod updater;
mod workshop;

use std::sync::Arc;
use std::time::Duration;

use tauri_plugin_window_state::StateFlags;

/// Sets whether the window looks light or dark: its title bar, and what the page's `prefers-color-scheme` reports.
/// `None` follows the system.
#[tauri::command]
async fn set_window_theme(window: tauri::WebviewWindow, theme: Option<tauri::Theme>) -> error::Result<()> {
  let failed = |error: tauri::Error| error::Error::msg(error.to_string());
  window.set_theme(theme).map_err(failed)?;
  // Linux turns no theme into light rather than the system's, so look up the system's (with the choice cleared,
  // the window reports it) and set that. Changes the system makes later are passed on by the window itself.
  #[cfg(target_os = "linux")]
  if theme.is_none() {
    let system = window.theme().map_err(failed)?;
    window.set_theme(Some(system)).map_err(failed)?;
  }
  Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  #[cfg(target_os = "linux")]
  desktop::unpin_theme_variant();
  let http = reqwest::Client::builder()
    .user_agent(concat!("FlareLauncher/", env!("CARGO_PKG_VERSION")))
    .timeout(Duration::from_secs(30))
    .build()
    .expect("error while building http client");

  tauri::Builder::default()
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_updater::Builder::new().build())
    // Remembers size and position, but not the window frame: on Windows the launcher draws its own title bar, and a
    // frame saved by an older version would otherwise come back and show two.
    .plugin(
      tauri_plugin_window_state::Builder::default()
        .with_state_flags(StateFlags::all() - StateFlags::DECORATIONS)
        .build(),
    )
    .manage(http)
    .manage(servers::ServerCache::default())
    .manage(Arc::new(workshop::Downloads::default()))
    .manage(updater::Updater::new())
    .invoke_handler(tauri::generate_handler![
      servers::fetch_servers,
      servers::server_mods,
      query::ping_servers,
      steam::detect_install,
      steam::installed_mods,
      steam::downloaded_mod_count,
      steam::open_folder,
      launch::launch,
      launch::open_workshop_page,
      workshop::download_mods,
      workshop::cancel_mod_download,
      updater::update_status,
      updater::check_for_updates,
      updater::download_update,
      updater::install_update,
      updater::update_settings,
      updater::set_auto_update_check,
      updater::set_update_channel,
      set_window_theme,
      app_menu::app_menu_status,
      app_menu::add_to_app_menu,
      app_menu::remove_from_app_menu,
    ])
    .setup(|app| {
      // The window is built here rather than from the config alone so Linux can keep the system title bar: Linux
      // desktops draw window frames their own way, and Wayland only adds a title bar to a window created with one.
      // Windows uses the launcher's own title bar. The page is told which before it first draws, so it never shows
      // the launcher's title bar under the system one.
      #[cfg(target_os = "linux")]
      {
        desktop::use_adwaita();
        desktop::follow_button_layout();
      }
      let config = app.config().app.windows.iter().find(|window| window.label == "main").expect("main window config");
      tauri::WebviewWindowBuilder::from_config(app.handle(), config)?
        .decorations(cfg!(target_os = "linux"))
        .initialization_script(format!("window.__systemTitleBar = {};", cfg!(target_os = "linux")))
        .build()?;
      updater::Updater::start(app.handle());
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}

#[cfg(test)]
mod live_tests {
  //! Checks against the real server list and Workshop. Run with `cargo test -- --ignored`.

  use super::*;

  #[tokio::test]
  #[ignore = "needs network access"]
  async fn downloads_the_list_and_pings_a_busy_server() {
    let http = reqwest::Client::builder().user_agent("FlareLauncher/test").build().unwrap();
    let servers = servers::download_list(&http).await.unwrap();
    assert!(servers.len() > 1000, "only {} servers", servers.len());

    let mut busy: Vec<_> = servers.values().collect();
    busy.sort_by_key(|s| std::cmp::Reverse(s.row.players));
    let (mut queried, mut pinged) = (0, 0);
    for server in busy.iter().take(10) {
      let addr: std::net::SocketAddr = format!("{}:{}", server.row.ip, server.row.query_port).parse().unwrap();
      let (ping, query) = tokio::join!(query::icmp_ping(addr.ip()), query::a2s_info(addr));
      println!(
        "{:>15} ping {:>7} query {:>7}  {}",
        server.row.ip,
        ping.map_or("none".into(), |rtt| format!("{} ms", rtt.as_millis())),
        query.as_ref().map_or("none".into(), |(elapsed, _)| format!("{} ms", elapsed.as_millis())),
        server.row.name,
      );
      queried += usize::from(query.is_some());
      pinged += usize::from(ping.is_some());
    }
    assert!(queried > 0, "none of the 10 busiest servers answered an A2S_INFO query");
    assert!(pinged > 0, "none of the 10 busiest servers answered an ICMP echo");
  }

  #[tokio::test]
  #[ignore = "needs network access"]
  async fn reads_when_workshop_mods_were_last_updated() {
    let http = reqwest::Client::builder().user_agent("FlareLauncher/test").build().unwrap();
    // Community Framework, and an id the Workshop doesn't have.
    let times = workshop::latest_update_times(&http, &[1559212036, 1]).await.unwrap();
    assert!(times[&1559212036] > 1_600_000_000);
    assert!(!times.contains_key(&1));
  }
}
