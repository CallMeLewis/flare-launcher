use std::collections::HashMap;
use std::net::{IpAddr, SocketAddr};
use std::sync::RwLock;
use std::time::{Duration, SystemTime};

use reqwest::StatusCode;
use reqwest::header::{ETAG, IF_NONE_MATCH};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::countries;
use crate::error::Result;
use crate::query::Info;
use crate::text;

/// The server list, with each server's settings and mods.
const OWN_LIST_URL: &str = "https://servers.darkzone.dev/v1/servers";
/// Just the player counts, replaced every minute, so a refresh downloads a small file when the list hasn't changed.
const OWN_LIVE_URL: &str = "https://servers.darkzone.dev/v1/live";
/// The list's format. A list in a newer one is left for the fallback rather than misread.
const OWN_FORMAT: u32 = 1;
/// Older than this, the list has stopped being updated, and the fallback is fresher.
const OWN_STALE: Duration = Duration::from_secs(15 * 60);
/// The most characters in a full name, as the download site allows.
const MAX_FULL_NAME: usize = 128;
/// The list the launcher used before, kept as a fallback.
const LIST_URL: &str = "https://dayzsalauncher.com/api/v1/launcher/servers/dayz";

#[derive(Deserialize)]
struct ListResponse {
  result: Vec<serde_json::Value>,
}

#[derive(Deserialize)]
struct ApiEndpoint {
  ip: String,
  port: u16,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ApiServer {
  endpoint: ApiEndpoint,
  game_port: u16,
  name: String,
  #[serde(default)]
  map: String,
  #[serde(default)]
  players: u32,
  #[serde(default)]
  max_players: u32,
  #[serde(default)]
  password: bool,
  #[serde(default)]
  version: String,
  #[serde(default)]
  first_person_only: bool,
  #[serde(default)]
  shard: String,
  #[serde(default)]
  time: String,
  #[serde(default)]
  time_acceleration: Option<f32>,
  #[serde(default)]
  battl_eye: bool,
  #[serde(default)]
  mods: Vec<Mod>,
}

#[derive(Deserialize, Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Mod {
  pub name: String,
  pub steam_workshop_id: u64,
}

/// One row of the server browser. Mods are fetched separately so the list
/// stays small enough to send to the webview in one go.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ServerRow {
  /// `ip:queryPort`, unique per server.
  pub id: String,
  pub ip: String,
  pub query_port: u16,
  pub game_port: u16,
  pub name: String,
  /// Lowercased so the same map groups together regardless of server casing.
  pub map: String,
  pub players: u32,
  pub max_players: u32,
  pub password: bool,
  pub first_person_only: bool,
  pub official: bool,
  /// Whether its owner has proved on the download site that they run it. Only the launcher's own list says so.
  pub verified: bool,
  pub battl_eye: bool,
  pub version: String,
  pub time: String,
  pub time_acceleration: Option<f32>,
  /// The two-letter code of the country the server is in, such as `DE`, when its address shows one.
  pub country: Option<String>,
  pub mod_count: usize,
  /// Positions in [`ServerList::mod_names`], for searching by mod.
  pub mods: Vec<u32>,
}

/// The browser list. Mod names are shared between servers, since most
/// servers run many of the same mods.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerList {
  pub servers: Vec<ServerRow>,
  pub mod_names: Vec<String>,
  /// Each mod's Workshop id, in the same order as `mod_names`.
  pub mod_ids: Vec<u64>,
}

#[derive(Clone)]
pub struct StoredServer {
  pub row: ServerRow,
  pub mods: Vec<Mod>,
  /// False for a server asked directly, one found on the local network or added by address.
  pub listed: bool,
}

/// Every server the launcher can ping and join: the server list, plus servers it asked directly.
#[derive(Default)]
pub struct ServerCache(pub RwLock<HashMap<String, StoredServer>>);

impl ServerCache {
  /// Keeps servers asked directly so they can be pinged and joined, and returns their rows.
  pub fn remember(&self, servers: Vec<StoredServer>) -> Vec<ServerRow> {
    let mut cache = self.0.write().unwrap();
    servers
      .into_iter()
      .map(|server| {
        let row = server.row.clone();
        cache.insert(row.id.clone(), server);
        row
      })
      .collect()
  }
}

/// Builds a server from what it said when asked directly. `None` when it didn't say which port to join on.
pub fn from_query(addr: SocketAddr, info: Info, mods: Vec<Mod>) -> Option<StoredServer> {
  // DayZ keeps its settings in the keywords, as tags such as `no3rd` and `etm4.000000` and the time as `HH:MM`.
  let tags: Vec<&str> = info.keywords.split(',').map(str::trim).collect();
  let has = |tag: &str| tags.contains(&tag);
  let row = ServerRow {
    id: addr.to_string(),
    ip: addr.ip().to_string(),
    query_port: addr.port(),
    game_port: info.game_port?,
    name: info.name.trim().to_string(),
    map: info.map.trim().to_lowercase(),
    players: info.players.into(),
    max_players: info.max_players.into(),
    password: info.password,
    first_person_only: first_person_only(has("no3rd"), &info.version),
    // Community servers say they run their own hive or an external one.
    official: !has("privHive") && !has("external"),
    verified: false,
    battl_eye: has("battleye"),
    version: info.version,
    time: tags.iter().find(|tag| tag.contains(':')).copied().unwrap_or_default().to_string(),
    time_acceleration: tags.iter().find_map(|tag| tag.strip_prefix("etm")?.parse().ok()),
    country: country_of(addr.ip()),
    mod_count: mods.len(),
    mods: Vec::new(),
  };
  Some(StoredServer { row, mods, listed: false })
}

/// Whether a server only lets players see in first person, from whether its keywords carry `no3rd`.
///
/// From 1.30, DayZ servers send `no3rd` the wrong way round: when third person is on, or on in vehicles only, and not
/// when it's off. Lists built from the tags, the fallback among them, carry the mistake too, so this turns it back.
/// When a DayZ update fixes it, stop turning it from that version on (see "DayZ's mistakes" in docs/development.md).
fn first_person_only(no3rd: bool, version: &str) -> bool {
  let mut parts = version.trim().split('.').map(str::parse::<u32>);
  let backwards = match (parts.next(), parts.next()) {
    (Some(Ok(major)), Some(Ok(minor))) => (major, minor) >= (1, 30),
    _ => false,
  };
  no3rd != backwards
}

fn country_of(ip: IpAddr) -> Option<String> {
  match ip {
    IpAddr::V4(ip) => countries::country(ip),
    IpAddr::V6(_) => None,
  }
}

fn into_stored(api: ApiServer) -> StoredServer {
  let country = api.endpoint.ip.parse().ok().and_then(country_of);
  let row = ServerRow {
    id: format!("{}:{}", api.endpoint.ip, api.endpoint.port),
    ip: api.endpoint.ip,
    query_port: api.endpoint.port,
    game_port: api.game_port,
    name: api.name.trim().to_string(),
    map: api.map.trim().to_lowercase(),
    players: api.players,
    max_players: api.max_players,
    password: api.password,
    // The fallback list passes on `no3rd` as it comes.
    first_person_only: first_person_only(api.first_person_only, &api.version),
    official: api.shard == "public",
    verified: false,
    battl_eye: api.battl_eye,
    version: api.version,
    time: api.time,
    time_acceleration: api.time_acceleration,
    country,
    mod_count: api.mods.len(),
    mods: Vec::new(),
  };
  StoredServer { row, mods: api.mods, listed: true }
}

/// Parses the list response, skipping entries that don't match the expected
/// shape so one malformed server can't take the whole list down. The address
/// must be a plain IP, as it ends up on DayZ's command line.
fn parse_list(body: &[u8]) -> Result<HashMap<String, StoredServer>> {
  let response: ListResponse = serde_json::from_slice(body)
    .map_err(|e| text!("The server list wasn't in the expected format: {error}", error = e))?;
  let total = response.result.len();
  let mut servers = HashMap::with_capacity(total);
  for value in response.result {
    if let Ok(api) = serde_json::from_value::<ApiServer>(value)
      && api.endpoint.ip.parse::<IpAddr>().is_ok()
    {
      let stored = into_stored(api);
      servers.entry(stored.row.id.clone()).or_insert(stored);
    }
  }
  if servers.len() < total {
    log::info!("server list: kept {} of {total} entries", servers.len());
  }
  Ok(servers)
}

/// Downloads the fallback list.
pub async fn download_list(http: &reqwest::Client) -> Result<HashMap<String, StoredServer>> {
  let body = http.get(LIST_URL).send().await?.error_for_status()?.bytes().await?;
  parse_list(&body)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct OwnList {
  format: u32,
  generated_at: String,
  servers: Vec<serde_json::Value>,
  mod_names: Vec<String>,
  mod_ids: Vec<u64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct OwnServer {
  ip: String,
  query_port: u16,
  game_port: u16,
  name: String,
  /// The full name the server's owner gave on the download site, since DayZ cuts names at 63 bytes. Sent only for
  /// servers whose owners have given one.
  #[serde(default)]
  full_name: Option<String>,
  map: String,
  players: u32,
  max_players: u32,
  password: bool,
  first_person_only: bool,
  official: bool,
  /// Sent only for servers whose owners have proved they run them.
  #[serde(default)]
  verified: bool,
  battl_eye: bool,
  version: String,
  time: String,
  time_acceleration: Option<f32>,
  /// Positions in `mod_names` and `mod_ids`.
  mods: Vec<u32>,
}

#[derive(Deserialize)]
struct OwnLive {
  format: u32,
  /// Players on each server, by `ip:queryPort`.
  players: HashMap<String, u32>,
}

/// The list as last downloaded, kept so a refresh can ask whether it changed rather than download it again.
pub struct OwnListCache {
  etag: String,
  servers: HashMap<String, StoredServer>,
}

#[derive(Default)]
pub struct OwnCache(pub tokio::sync::Mutex<Option<OwnListCache>>);

/// The name to show for a server: the full name its owner gave, while it carries on from the name the server sends,
/// or else that name. The list only sends a full name that does, but this checks again, as the download site and the
/// list's crawler do, so a full name can never stand in for an unrelated one.
fn shown_name(name: &str, full_name: Option<&str>) -> String {
  let name = name.trim();
  match full_name {
    Some(full)
      if !name.is_empty()
        && full.len() > name.len()
        && full.starts_with(name)
        && full.chars().count() <= MAX_FULL_NAME
        && !full.chars().any(char::is_control) =>
    {
      full.to_string()
    }
    _ => name.to_string(),
  }
}

/// Parses the list, skipping entries that don't match the expected shape as [`parse_list`] does, and turning it down
/// when it's in a newer format or has stopped being updated. Errors here aren't shown: the fallback is used instead.
fn parse_own_list(body: &[u8], now: SystemTime) -> std::result::Result<HashMap<String, StoredServer>, String> {
  let list: OwnList = serde_json::from_slice(body).map_err(|e| e.to_string())?;
  if list.format != OWN_FORMAT {
    return Err(format!("format {} isn't one this version reads", list.format));
  }
  let generated = humantime::parse_rfc3339(&list.generated_at).map_err(|e| e.to_string())?;
  if now.duration_since(generated).unwrap_or_default() > OWN_STALE {
    return Err(format!("it was last updated at {}", list.generated_at));
  }
  let mut servers = HashMap::with_capacity(list.servers.len());
  for value in list.servers {
    let Ok(own) = serde_json::from_value::<OwnServer>(value) else { continue };
    let Ok(ip) = own.ip.parse::<IpAddr>() else { continue };
    let mods: Vec<Mod> = own
      .mods
      .iter()
      .filter_map(|&i| {
        let i = i as usize;
        Some(Mod { name: list.mod_names.get(i)?.clone(), steam_workshop_id: *list.mod_ids.get(i)? })
      })
      .collect();
    let row = ServerRow {
      id: format!("{}:{}", own.ip, own.query_port),
      ip: own.ip,
      query_port: own.query_port,
      game_port: own.game_port,
      name: shown_name(&own.name, own.full_name.as_deref()),
      map: own.map.trim().to_lowercase(),
      players: own.players,
      max_players: own.max_players,
      password: own.password,
      first_person_only: own.first_person_only,
      official: own.official,
      verified: own.verified,
      battl_eye: own.battl_eye,
      version: own.version,
      time: own.time,
      time_acceleration: own.time_acceleration,
      country: country_of(ip),
      mod_count: mods.len(),
      mods: Vec::new(),
    };
    servers.entry(row.id.clone()).or_insert(StoredServer { row, mods, listed: true });
  }
  Ok(servers)
}

/// Updates the player counts from the live file. Servers it doesn't mention keep the count the list gave.
fn apply_live(servers: &mut HashMap<String, StoredServer>, body: &[u8]) -> std::result::Result<(), String> {
  let live: OwnLive = serde_json::from_slice(body).map_err(|e| e.to_string())?;
  if live.format != OWN_FORMAT {
    return Err(format!("format {} isn't one this version reads", live.format));
  }
  for (id, players) in live.players {
    if let Some(server) = servers.get_mut(&id) {
      server.row.players = players;
    }
  }
  Ok(())
}

/// Downloads the list, or reuses the last one when it hasn't changed, and brings its player counts up to date.
pub async fn own_list(
  http: &reqwest::Client,
  cache: &OwnCache,
) -> std::result::Result<HashMap<String, StoredServer>, String> {
  let mut cache = cache.0.lock().await;
  let mut request = http.get(OWN_LIST_URL);
  if let Some(cached) = cache.as_ref() {
    request = request.header(IF_NONE_MATCH, &cached.etag);
  }
  let response = request.send().await.and_then(|r| r.error_for_status()).map_err(|e| e.to_string())?;
  let mut servers = match (response.status(), cache.as_ref()) {
    (StatusCode::NOT_MODIFIED, Some(cached)) => cached.servers.clone(),
    _ => {
      let etag = response.headers().get(ETAG).and_then(|v| v.to_str().ok()).unwrap_or_default().to_string();
      let body = response.bytes().await.map_err(|e| e.to_string())?;
      let servers = parse_own_list(&body, SystemTime::now())?;
      *cache = Some(OwnListCache { etag, servers: servers.clone() });
      servers
    }
  };
  // The list itself is up to five minutes old; without the live counts it's still worth showing.
  let live = async { http.get(OWN_LIVE_URL).send().await?.error_for_status()?.bytes().await };
  match live.await {
    Ok(body) => {
      if let Err(e) = apply_live(&mut servers, &body) {
        log::warn!("server list: couldn't read the player counts: {e}");
      }
    }
    Err(e) => log::warn!("server list: couldn't download the player counts: {e}"),
  }
  Ok(servers)
}

/// Builds the browser list, giving each distinct mod one entry in a shared
/// name table. A mod is named the way the first server listing it names it.
fn build_list(servers: &HashMap<String, StoredServer>) -> ServerList {
  let mut positions: HashMap<u64, u32> = HashMap::new();
  let mut mod_names = Vec::new();
  let mut mod_ids = Vec::new();
  let rows = servers
    .values()
    .map(|server| {
      let mut row = server.row.clone();
      row.mods = server
        .mods
        .iter()
        .map(|m| {
          *positions.entry(m.steam_workshop_id).or_insert_with(|| {
            mod_names.push(m.name.clone());
            mod_ids.push(m.steam_workshop_id);
            (mod_names.len() - 1) as u32
          })
        })
        .collect();
      row
    })
    .collect();
  ServerList { servers: rows, mod_names, mod_ids }
}

#[tauri::command]
pub async fn fetch_servers(
  http: State<'_, reqwest::Client>,
  own: State<'_, OwnCache>,
  cache: State<'_, ServerCache>,
) -> Result<ServerList> {
  let servers = match own_list(&http, &own).await {
    Ok(servers) => servers,
    Err(e) => {
      log::warn!("server list: using the fallback: {e}");
      download_list(&http).await?
    }
  };
  let list = build_list(&servers);
  let mut cache = cache.0.write().unwrap();
  // Servers asked directly stay, unless the list now has them too.
  cache.retain(|_, server| !server.listed);
  cache.extend(servers);
  Ok(list)
}

#[tauri::command]
pub fn server_mods(cache: State<'_, ServerCache>, id: String) -> Result<Vec<Mod>> {
  cache
    .0
    .read()
    .unwrap()
    .get(&id)
    .map(|s| s.mods.clone())
    .ok_or_else(|| text!("That server is no longer in the list. Refresh and try again.").into())
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn parses_rows_and_skips_malformed_entries() {
    let body = br#"{"status":0,"result":[
      {"endpoint":{"ip":"1.2.3.4","port":2303},"gamePort":2302,"name":"  Alpha  ","map":"ChernarusPlus",
       "players":10,"maxPlayers":60,"password":false,"version":"1.29","firstPersonOnly":true,"shard":"private",
       "time":"12:30","timeAcceleration":6,"battlEye":true,
       "mods":[{"name":"CF","steamWorkshopId":1559212036}]},
      {"endpoint":{"ip":"1.2.3.4","port":2303},"gamePort":2302,"name":"Duplicate"},
      {"endpoint":{"ip":"5.6.7.8"},"name":"No query port"},
      {"endpoint":{"ip":"1.2.3.4\" -mod=x","port":2303},"gamePort":2302,"name":"Not an IP"},
      {"endpoint":{"ip":"9.9.9.9","port":27016},"gamePort":2302,"name":"Bare","shard":"public"}
    ]}"#;
    let servers = parse_list(body).unwrap();
    assert_eq!(servers.len(), 2);

    let alpha = &servers["1.2.3.4:2303"];
    assert_eq!(alpha.row.name, "Alpha");
    assert_eq!(alpha.row.map, "chernarusplus");
    assert_eq!(alpha.row.mod_count, 1);
    assert!(alpha.row.first_person_only && !alpha.row.official);
    assert_eq!(alpha.mods[0].steam_workshop_id, 1559212036);

    let bare = &servers["9.9.9.9:27016"];
    assert!(bare.row.official);
    assert_eq!(bare.row.time_acceleration, None);
    assert_eq!(alpha.row.country.as_deref(), Some("AU"));
  }

  fn own_list(generated_at: &str) -> String {
    format!(
      r#"{{"format":1,"generatedAt":"{generated_at}","modNames":["CF","Dabs Framework"],"modIds":[1559212036,2545327648],
      "servers":[
        {{"ip":"1.2.3.4","queryPort":2303,"gamePort":2302,"name":" Alpha ","map":"ChernarusPlus","players":10,
         "maxPlayers":60,"password":false,"firstPersonOnly":true,"official":false,"verified":true,"battlEye":true,
         "environment":"w","version":"1.30.164200","time":"12:30","timeAcceleration":6.0,"mods":[1,0]}},
        {{"ip":"not an ip","queryPort":2303,"gamePort":2302,"name":"Bad","map":"enoch","players":0,"maxPlayers":10,
         "password":false,"firstPersonOnly":false,"official":false,"battlEye":true,"version":"1","time":"",
         "timeAcceleration":null,"mods":[]}},
        {{"ip":"5.6.7.8","name":"Missing fields"}}
      ]}}"#
    )
  }

  #[test]
  fn reads_the_list() {
    let now = humantime::parse_rfc3339("2026-10-24T00:05:00Z").unwrap();
    let servers = parse_own_list(own_list("2026-10-24T00:00:00Z").as_bytes(), now).unwrap();
    assert_eq!(servers.len(), 1);
    let alpha = &servers["1.2.3.4:2303"];
    assert_eq!((alpha.row.name.as_str(), alpha.row.map.as_str()), ("Alpha", "chernarusplus"));
    assert_eq!((alpha.row.game_port, alpha.row.mod_count, alpha.row.time_acceleration), (2302, 2, Some(6.0)));
    assert_eq!(alpha.row.country.as_deref(), Some("AU"));
    assert_eq!(alpha.mods[0], Mod { name: "Dabs Framework".into(), steam_workshop_id: 2545327648 });
    assert!(alpha.listed && alpha.row.verified);
  }

  #[test]
  fn counts_a_server_as_unverified_unless_the_list_says_so() {
    let now = humantime::parse_rfc3339("2026-10-24T00:05:00Z").unwrap();
    let list = own_list("2026-10-24T00:00:00Z").replacen(r#""verified":true,"#, "", 1);
    let servers = parse_own_list(list.as_bytes(), now).unwrap();
    assert!(!servers["1.2.3.4:2303"].row.verified);
  }

  #[test]
  fn shows_an_owners_full_name_while_it_carries_on_from_the_servers_own() {
    let now = humantime::parse_rfc3339("2026-10-24T00:05:00Z").unwrap();
    let named = |full_name: &str| {
      let list = own_list("2026-10-24T00:00:00Z").replacen(
        r#""name":" Alpha ","#,
        &format!(r#""name":" Alpha ","fullName":{},"#, serde_json::json!(full_name)),
        1,
      );
      parse_own_list(list.as_bytes(), now).unwrap()["1.2.3.4:2303"].row.name.clone()
    };
    assert_eq!(named("Alpha | Vanilla+ | discord.gg/alpha"), "Alpha | Vanilla+ | discord.gg/alpha");
    assert_eq!(named("Beta | Vanilla+"), "Alpha", "doesn't carry on from the server's name");
    assert_eq!(named("Alpha"), "Alpha");
    assert_eq!(named("Alpha\nmore"), "Alpha");
    assert_eq!(named(&format!("Alpha{}", "x".repeat(MAX_FULL_NAME))), "Alpha", "too long");
  }

  #[test]
  fn turns_down_the_list_when_stale_or_in_a_newer_format() {
    let now = humantime::parse_rfc3339("2026-10-24T01:00:00Z").unwrap();
    assert!(parse_own_list(own_list("2026-10-24T00:00:00Z").as_bytes(), now).is_err(), "an hour old");
    let newer = own_list("2026-10-24T01:00:00Z").replacen(r#""format":1"#, r#""format":2"#, 1);
    assert!(parse_own_list(newer.as_bytes(), now).is_err());
  }

  #[test]
  fn brings_player_counts_up_to_date_from_the_live_file() {
    let now = humantime::parse_rfc3339("2026-10-24T00:00:00Z").unwrap();
    let mut servers = parse_own_list(own_list("2026-10-24T00:00:00Z").as_bytes(), now).unwrap();
    apply_live(&mut servers, br#"{"format":1,"generatedAt":"x","players":{"1.2.3.4:2303":42,"9.9.9.9:1":3}}"#).unwrap();
    assert_eq!(servers["1.2.3.4:2303"].row.players, 42);
    assert!(apply_live(&mut servers, br#"{"format":2,"players":{}}"#).is_err());
  }

  #[test]
  fn shares_one_name_per_mod_across_servers() {
    let body = br#"{"status":0,"result":[
      {"endpoint":{"ip":"1.1.1.1","port":2303},"gamePort":2302,"name":"A",
       "mods":[{"name":"CF","steamWorkshopId":1},{"name":"Expansion Core","steamWorkshopId":2}]},
      {"endpoint":{"ip":"2.2.2.2","port":2303},"gamePort":2302,"name":"B",
       "mods":[{"name":"Expansion Core","steamWorkshopId":2},{"name":"Mag Obfuscation","steamWorkshopId":3}]},
      {"endpoint":{"ip":"3.3.3.3","port":2303},"gamePort":2302,"name":"Vanilla"}
    ]}"#;
    let list = build_list(&parse_list(body).unwrap());
    assert_eq!(list.mod_names.len(), 3);
    let cf = list.mod_names.iter().position(|name| name == "CF").unwrap();
    assert_eq!(list.mod_ids[cf], 1);

    let names = |server: &str| -> Vec<&str> {
      let row = list.servers.iter().find(|r| r.name == server).unwrap();
      row.mods.iter().map(|&i| list.mod_names[i as usize].as_str()).collect()
    };
    assert_eq!(names("A"), ["CF", "Expansion Core"]);
    assert_eq!(names("B"), ["Expansion Core", "Mag Obfuscation"]);
    assert!(names("Vanilla").is_empty());
  }

  #[test]
  fn reads_dayz_settings_from_a_queried_server() {
    let info = Info {
      name: " Home server ".into(),
      map: "ChernarusPlus".into(),
      players: 2,
      max_players: 10,
      password: true,
      version: "1.29.162510".into(),
      game_port: Some(2302),
      keywords: "battleye,no3rd,privHive,lqs0,etm6.000000,entm2.000000,08:41".into(),
    };
    let mods = vec![Mod { name: "CF".into(), steam_workshop_id: 1559212036 }];
    let server = from_query("192.168.1.20:27016".parse().unwrap(), info, mods).unwrap();
    assert_eq!(server.row.id, "192.168.1.20:27016");
    assert_eq!((server.row.game_port, server.row.query_port), (2302, 27016));
    assert_eq!(server.row.name, "Home server");
    assert_eq!(server.row.map, "chernarusplus");
    assert_eq!(server.row.time, "08:41");
    assert_eq!(server.row.time_acceleration, Some(6.0));
    assert_eq!(server.row.country, None);
    assert_eq!(server.row.mod_count, 1);
    assert!(server.row.password && server.row.first_person_only && server.row.battl_eye && !server.row.official);
    assert!(!server.listed);

    let no_port = Info { game_port: None, ..Info::default() };
    assert!(from_query("192.168.1.20:27016".parse().unwrap(), no_port, Vec::new()).is_none());
  }

  #[test]
  fn reads_no3rd_the_other_way_round_from_dayz_1_30() {
    let first_person = |keywords: &str, version: &str| {
      let info = Info { version: version.into(), game_port: Some(2302), keywords: keywords.into(), ..Info::default() };
      from_query("192.168.1.20:27016".parse().unwrap(), info, Vec::new()).unwrap().row.first_person_only
    };
    assert!(first_person("battleye,no3rd,privHive", "1.29.163709"));
    assert!(!first_person("battleye,privHive", "1.29.163709"));
    assert!(!first_person("battleye,no3rd,privHive", "1.30.164200"));
    assert!(first_person("battleye,privHive", "1.30.164200"));
    assert!(!first_person("battleye,no3rd,privHive", "1.31.1"));
    assert!(first_person("battleye,no3rd,privHive", ""), "no version to go by");

    let body = br#"{"status":0,"result":[
      {"endpoint":{"ip":"1.2.3.4","port":2303},"gamePort":2302,"name":"A","version":"1.30.164200","firstPersonOnly":true},
      {"endpoint":{"ip":"5.6.7.8","port":2303},"gamePort":2302,"name":"B","version":"1.30.164200","firstPersonOnly":false}
    ]}"#;
    let servers = parse_list(body).unwrap();
    assert!(!servers["1.2.3.4:2303"].row.first_person_only && servers["5.6.7.8:2303"].row.first_person_only);
  }
}
