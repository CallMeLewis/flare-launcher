mod app_menu;
mod countries;
mod credentials;
#[cfg(target_os = "linux")]
mod desktop;
mod discord;
mod error;
mod lan;
mod launch;
mod query;
mod servers;
mod steam;
mod updater;
mod workshop;

use std::sync::Arc;
use std::time::Duration;

use tauri::Manager;
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

/// Opens the launcher's GitHub page in the browser.
#[tauri::command]
fn open_project_page(app: tauri::AppHandle) -> error::Result<()> {
  let url = env!("CARGO_PKG_REPOSITORY");
  #[cfg(target_os = "linux")]
  let opened = {
    let _ = app;
    desktop::open(url).map_err(|e| e.to_string())
  };
  #[cfg(not(target_os = "linux"))]
  let opened = {
    use tauri_plugin_opener::OpenerExt;
    app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
  };
  opened.map_err(|e| text!("The browser couldn't be opened: {error}", error = e).into())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  #[cfg(target_os = "linux")]
  if let Some(code) = workshop::helper::run_helper() {
    std::process::exit(code);
  }
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
      lan::search_lan,
      lan::query_servers,
      lan::find_server,
      steam::detect_install,
      steam::installed_mods,
      steam::downloaded_mod_count,
      steam::subscribed_mods,
      steam::open_folder,
      launch::launch,
      launch::wait_for_game,
      launch::open_workshop_page,
      launch::low_map_count,
      workshop::download_mods,
      workshop::cancel_mod_download,
      workshop::unsubscribe_mods,
      updater::update_status,
      updater::check_for_updates,
      updater::download_update,
      updater::install_update,
      updater::update_settings,
      updater::set_auto_update_check,
      updater::set_update_channel,
      set_window_theme,
      open_project_page,
      app_menu::app_menu_status,
      app_menu::add_to_app_menu,
      app_menu::remove_from_app_menu,
      credentials::password_store_available,
      credentials::saved_password,
      credentials::save_password,
      credentials::forget_password,
      discord::set_discord_presence,
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
      app.manage(discord::Presence::start());
      if cfg!(debug_assertions) {
        app.handle().plugin(tauri_plugin_log::Builder::default().level(log::LevelFilter::Info).build())?;
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
  async fn asking_a_server_directly_matches_the_list() {
    let http = reqwest::Client::builder().user_agent("FlareLauncher/test").build().unwrap();
    let servers = servers::download_list(&http).await.unwrap();
    // Busy modded servers, and servers with so many mods that the reply comes split over several packets.
    let mut busy: Vec<_> = servers.values().filter(|s| s.mods.len() >= 5 && s.row.players > 0).collect();
    busy.sort_by_key(|s| std::cmp::Reverse(s.row.players));
    let mut most_mods: Vec<_> = servers.values().filter(|s| s.row.players > 0).collect();
    most_mods.sort_by_key(|s| std::cmp::Reverse(s.mods.len()));
    let mut matched = 0;
    for server in busy.iter().take(5).chain(most_mods.iter().take(10)) {
      let addr: std::net::SocketAddr = format!("{}:{}", server.row.ip, server.row.query_port).parse().unwrap();
      let (info, mods) = tokio::join!(query::a2s_info(addr), query::a2s_mods(addr));
      let (Some((_, info)), Some(mods)) = (info, mods) else { continue };
      let ids = |mods: &[servers::Mod]| {
        let mut ids: Vec<u64> = mods.iter().map(|m| m.steam_workshop_id).collect();
        ids.sort();
        ids
      };
      println!("{:>3} mods, game port {:?}, {}", mods.len(), info.game_port, server.row.name);
      assert_eq!(ids(&mods), ids(&server.mods), "{}", server.row.name);
      assert_eq!(info.game_port, Some(server.row.game_port));
      matched += 1;
    }
    assert!(matched > 0, "none of the servers answered");
  }

  #[tokio::test]
  #[ignore = "needs network access"]
  async fn finds_a_server_by_the_address_players_join_on() {
    let http = reqwest::Client::builder().user_agent("FlareLauncher/test").build().unwrap();
    let servers = servers::download_list(&http).await.unwrap();
    // Servers whose query port isn't the game port, so finding them means working it out.
    let mut busy: Vec<_> = servers.values().filter(|s| s.row.query_port != s.row.game_port).collect();
    busy.sort_by_key(|s| std::cmp::Reverse(s.row.players));
    let mut found = 0;
    for server in busy.iter().take(10) {
      let address = format!("{}:{}", server.row.ip, server.row.game_port);
      match lan::find(&address).await {
        Ok(stored) => {
          println!("{address} -> query port {}: {}", stored.row.query_port, stored.row.name);
          assert_eq!(stored.row.id, server.row.id, "{}", server.row.name);
          found += 1;
        }
        Err(e) => println!("{address} -> {e}: {}", server.row.name),
      }
    }
    assert!(found > 0, "none of the 10 busiest servers were found by their game port");
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
