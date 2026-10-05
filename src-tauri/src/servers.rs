use std::collections::HashMap;
use std::net::{IpAddr, SocketAddr};
use std::sync::RwLock;

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::error::Result;
use crate::query::Info;
use crate::text;

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
  pub battl_eye: bool,
  pub version: String,
  pub time: String,
  pub time_acceleration: Option<f32>,
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
    first_person_only: has("no3rd"),
    // Community servers say they run their own hive or an external one.
    official: !has("privHive") && !has("external"),
    battl_eye: has("battleye"),
    version: info.version,
    time: tags.iter().find(|tag| tag.contains(':')).copied().unwrap_or_default().to_string(),
    time_acceleration: tags.iter().find_map(|tag| tag.strip_prefix("etm")?.parse().ok()),
    mod_count: mods.len(),
    mods: Vec::new(),
  };
  Some(StoredServer { row, mods, listed: false })
}

fn into_stored(api: ApiServer) -> StoredServer {
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
    first_person_only: api.first_person_only,
    official: api.shard == "public",
    battl_eye: api.battl_eye,
    version: api.version,
    time: api.time,
    time_acceleration: api.time_acceleration,
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

pub async fn download_list(http: &reqwest::Client) -> Result<HashMap<String, StoredServer>> {
  let body = http.get(LIST_URL).send().await?.error_for_status()?.bytes().await?;
  parse_list(&body)
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
pub async fn fetch_servers(http: State<'_, reqwest::Client>, cache: State<'_, ServerCache>) -> Result<ServerList> {
  let servers = download_list(&http).await?;
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
    assert_eq!(server.row.mod_count, 1);
    assert!(server.row.password && server.row.first_person_only && server.row.battl_eye && !server.row.official);
    assert!(!server.listed);

    let no_port = Info { game_port: None, ..Info::default() };
    assert!(from_query("192.168.1.20:27016".parse().unwrap(), no_port, Vec::new()).is_none());
  }
}
