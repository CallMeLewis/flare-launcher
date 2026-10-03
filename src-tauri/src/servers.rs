use std::collections::HashMap;
use std::net::IpAddr;
use std::sync::RwLock;

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::error::{Error, Result};

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
}

pub struct StoredServer {
  pub row: ServerRow,
  pub mods: Vec<Mod>,
}

#[derive(Default)]
pub struct ServerCache(pub RwLock<HashMap<String, StoredServer>>);

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
  StoredServer { row, mods: api.mods }
}

/// Parses the list response, skipping entries that don't match the expected
/// shape so one malformed server can't take the whole list down. The address
/// must be a plain IP, as it ends up on DayZ's command line.
fn parse_list(body: &[u8]) -> Result<HashMap<String, StoredServer>> {
  let response: ListResponse = serde_json::from_slice(body)
    .map_err(|e| Error::msg(format!("The server list wasn't in the expected format: {e}")))?;
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
            (mod_names.len() - 1) as u32
          })
        })
        .collect();
      row
    })
    .collect();
  ServerList { servers: rows, mod_names }
}

#[tauri::command]
pub async fn fetch_servers(
  http: State<'_, reqwest::Client>,
  cache: State<'_, ServerCache>,
) -> Result<ServerList> {
  let servers = download_list(&http).await?;
  let list = build_list(&servers);
  *cache.0.write().unwrap() = servers;
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
    .ok_or_else(|| Error::msg("That server is no longer in the list. Refresh and try again."))
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

    let names = |server: &str| -> Vec<&str> {
      let row = list.servers.iter().find(|r| r.name == server).unwrap();
      row.mods.iter().map(|&i| list.mod_names[i as usize].as_str()).collect()
    };
    assert_eq!(names("A"), ["CF", "Expansion Core"]);
    assert_eq!(names("B"), ["Expansion Core", "Mag Obfuscation"]);
    assert!(names("Vanilla").is_empty());
  }
}
