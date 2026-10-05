//! Finds servers that aren't in the server list by asking them directly: servers on the local network, and servers
//! the player enters by address.
//!
//! A search sends a server info query to every machine on each network this computer is on, at the query ports DayZ
//! servers use by default, then asks each server that answers for its details and mods.

use std::collections::{HashMap, HashSet};
use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::time::Duration;

use futures::StreamExt;
use if_addrs::IfAddr;
use tauri::State;
use tokio::net::UdpSocket;
use tokio::time::Instant;

use crate::error::{Error, Result};
use crate::query::{self, HEADER, INFO_REQUEST};
use crate::servers::{self, ServerCache, ServerRow, StoredServer};
use crate::text;

/// The query ports a search covers. DayZ uses 27016 unless the server sets another.
const SEARCH_PORTS: [u16; 6] = [27016, 27015, 27017, 27018, 27019, 27020];
/// How long a search waits for servers to answer.
const SEARCH_TIME: Duration = Duration::from_millis(1500);
/// How far above the game port hosts commonly put the query port, the game port itself first.
const QUERY_PORT_OFFSETS: [u16; 5] = [0, 1, 2, 3, 100];
/// How long to wait before asking a server again, as a host may briefly ignore an address that just sent it a burst.
const RETRY_AFTER: Duration = Duration::from_millis(750);
const CONCURRENCY: usize = 16;
const MAX_SAVED: usize = 64;

/// Where to send the search: each network's broadcast address, plus this computer for a server running on it.
fn search_targets() -> Vec<Ipv4Addr> {
  let mut targets = vec![Ipv4Addr::BROADCAST, Ipv4Addr::LOCALHOST];
  for interface in if_addrs::get_if_addrs().unwrap_or_default() {
    if let IfAddr::V4(addr) = interface.addr
      && !addr.is_loopback()
      && let Some(broadcast) = addr.broadcast
      && !targets.contains(&broadcast)
    {
      targets.push(broadcast);
    }
  }
  targets
}

/// This computer's own addresses, to spot a server running on it.
fn own_addresses() -> HashSet<IpAddr> {
  if_addrs::get_if_addrs().unwrap_or_default().into_iter().map(|interface| interface.ip()).collect()
}

/// The address this computer has on its main network, the one its default route goes through. Connecting a UDP socket
/// sends nothing; it only picks the route. `None` without a default route.
fn main_address() -> Option<IpAddr> {
  let socket = std::net::UdpSocket::bind((Ipv4Addr::UNSPECIFIED, 0)).ok()?;
  // An address reserved for documentation, reached through the default route like any other.
  socket.connect((Ipv4Addr::new(192, 0, 2, 1), 9)).ok()?;
  let ip = socket.local_addr().ok()?.ip();
  (!ip.is_unspecified()).then_some(ip)
}

/// A server on this computer answers on every one of its addresses: loopback, the main network, and virtual adapters
/// such as WSL, VirtualBox or a VPN. Keeps one address per server: the main network's, which other players see too,
/// then loopback, then the lowest.
fn one_per_server_here(found: HashSet<SocketAddr>, own: &HashSet<IpAddr>, main: Option<IpAddr>) -> Vec<SocketAddr> {
  let rank = |addr: SocketAddr| (Some(addr.ip()) != main, !addr.ip().is_loopback(), addr);
  let mut here: HashMap<u16, SocketAddr> = HashMap::new();
  let mut kept = Vec::new();
  for addr in found {
    if !own.contains(&addr.ip()) && !addr.ip().is_loopback() {
      kept.push(addr);
      continue;
    }
    let best = here.entry(addr.port()).or_insert(addr);
    if rank(addr) < rank(*best) {
      *best = addr;
    }
  }
  kept.extend(here.into_values());
  kept.sort();
  kept
}

/// Sends the search and returns the address of every server that answered.
async fn search() -> Result<Vec<SocketAddr>> {
  let socket = UdpSocket::bind((Ipv4Addr::UNSPECIFIED, 0)).await?;
  socket.set_broadcast(true)?;
  for ip in search_targets() {
    for port in SEARCH_PORTS {
      // A network that refuses broadcasts shouldn't stop the others from being searched.
      let _ = socket.send_to(INFO_REQUEST, (ip, port)).await;
    }
  }

  let mut found = HashSet::new();
  let mut buf = vec![0u8; 65536];
  let deadline = Instant::now() + SEARCH_TIME;
  loop {
    match tokio::time::timeout_at(deadline, socket.recv_from(&mut buf)).await {
      // A server may answer with a challenge or with its details; either way, it's there.
      Ok(Ok((len, from))) if len >= 5 && buf[..4] == HEADER => {
        found.insert(from);
      }
      // Windows reports a port nobody listens on as an error on the next receive, so keep listening.
      Ok(_) => {}
      Err(_) => break,
    }
  }
  Ok(one_per_server_here(found, &own_addresses(), main_address()))
}

/// Asks a server for everything the browser shows, and the mods it needs.
async fn ask(addr: SocketAddr) -> Option<StoredServer> {
  let (info, mods) = tokio::join!(query::a2s_info(addr), query::a2s_mods(addr));
  servers::from_query(addr, info?.1, mods?)
}

async fn ask_all(addrs: Vec<SocketAddr>) -> Vec<StoredServer> {
  futures::stream::iter(addrs).map(ask).buffer_unordered(CONCURRENCY).filter_map(|s| async { s }).collect().await
}

/// Searches the local network for servers.
#[tauri::command]
pub async fn search_lan(cache: State<'_, ServerCache>) -> Result<Vec<ServerRow>> {
  let found = ask_all(search().await?).await;
  Ok(cache.remember(found))
}

/// Asks saved servers that aren't in the server list for their details, by their `ip:queryPort` ids. Returns those
/// that answered.
#[tauri::command]
pub async fn query_servers(cache: State<'_, ServerCache>, ids: Vec<String>) -> Result<Vec<ServerRow>> {
  let addrs = ids.iter().take(MAX_SAVED).filter_map(|id| id.parse().ok()).collect();
  let found = ask_all(addrs).await;
  Ok(cache.remember(found))
}

/// Splits what the player typed into a host and an optional port.
fn split_address(address: &str) -> Result<(&str, Option<u16>)> {
  let address = address.trim();
  let (host, port) = match address.rsplit_once(':') {
    Some((host, port)) => {
      let port = port.trim().parse().map_err(|_| Error::from(text!("The port after the colon has to be a number.")))?;
      (host.trim(), Some(port))
    }
    None => (address, None),
  };
  if host.is_empty() {
    return Err(text!("Enter the server's address, such as {example}.", example = "192.168.1.20:2302").into());
  }
  Ok((host, port))
}

async fn resolve(host: &str) -> Result<Ipv4Addr> {
  if let Ok(ip) = host.parse() {
    return Ok(ip);
  }
  let not_found = || Error::from(text!("Couldn't find {host}. Check the address and try again.", host = host));
  tokio::net::lookup_host((host, 0))
    .await
    .map_err(|_| not_found())?
    .find_map(|addr| match addr.ip() {
      IpAddr::V4(ip) => Some(ip),
      IpAddr::V6(_) => None,
    })
    .ok_or_else(not_found)
}

/// The query ports to try. Players usually know the port they join on, which isn't the one a server answers queries
/// on, so the port they gave is tried along with the offsets hosts commonly use from it, and DayZ's defaults.
fn candidate_ports(port: Option<u16>) -> Vec<u16> {
  let mut ports: Vec<u16> =
    port.into_iter().flat_map(|p| QUERY_PORT_OFFSETS.iter().filter_map(move |&offset| p.checked_add(offset))).collect();
  ports.extend(SEARCH_PORTS);
  if port.is_none() {
    ports.push(2303);
  }
  let mut seen = HashSet::new();
  ports.retain(|p| seen.insert(*p));
  ports
}

/// Picks the server the player meant from the query ports that answered, in the order they were tried: the one whose
/// game port is the port they gave, or the one answering on that port. With no port given, the first that answered.
fn pick(port: Option<u16>, answers: &[(u16, Option<u16>)]) -> Option<u16> {
  let Some(port) = port else {
    return answers.first().map(|&(query_port, _)| query_port);
  };
  answers
    .iter()
    .find(|&&(_, game_port)| game_port == Some(port))
    .or_else(|| answers.iter().find(|&&(query_port, _)| query_port == port))
    .map(|&(query_port, _)| query_port)
}

/// Finds a server from an address the player typed, such as `192.168.1.20:2302` or `play.example.com`.
#[tauri::command]
pub async fn find_server(cache: State<'_, ServerCache>, address: String) -> Result<ServerRow> {
  let server = find(&address).await?;
  Ok(cache.remember(vec![server]).remove(0))
}

pub async fn find(address: &str) -> Result<StoredServer> {
  let (host, port) = split_address(address)?;
  let ip = resolve(host).await?;
  let replies = futures::future::join_all(candidate_ports(port).into_iter().map(|query_port| async move {
    let reply = query::a2s_info(SocketAddr::from((ip, query_port))).await;
    reply.map(|(_, info)| (query_port, info.game_port))
  }))
  .await;
  let answers: Vec<(u16, Option<u16>)> = replies.into_iter().flatten().collect();

  let query_port = pick(port, &answers).ok_or_else(|| {
    text!(
      "No DayZ server answered at that address. Check it's running, or enter the server's query port instead of its game port."
    )
  })?;
  let addr = SocketAddr::from((ip, query_port));
  if let Some(server) = ask(addr).await {
    return Ok(server);
  }
  tokio::time::sleep(RETRY_AFTER).await;
  ask(addr).await.ok_or_else(|| text!("The server answered but didn't send its details. Try again in a moment.").into())
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn splits_addresses() {
    assert_eq!(split_address(" 192.168.1.20:2302 ").unwrap(), ("192.168.1.20", Some(2302)));
    assert_eq!(split_address("play.example.com").unwrap(), ("play.example.com", None));
    assert!(split_address("192.168.1.20:port").is_err());
    assert!(split_address(":2302").is_err());
    assert!(split_address("").is_err());
  }

  #[test]
  fn tries_the_given_port_first_without_repeats() {
    assert_eq!(candidate_ports(Some(2302)), [2302, 2303, 2304, 2305, 2402, 27016, 27015, 27017, 27018, 27019, 27020]);
    assert_eq!(candidate_ports(Some(27016)), [27016, 27017, 27018, 27019, 27116, 27015, 27020]);
    assert_eq!(candidate_ports(Some(65535)), [65535, 27016, 27015, 27017, 27018, 27019, 27020]);
    assert_eq!(candidate_ports(None), [27016, 27015, 27017, 27018, 27019, 27020, 2303]);
  }

  #[test]
  fn picks_the_server_the_player_meant() {
    // Two servers on one host; the player gave the second one's game port.
    let answers = [(27016, Some(2302)), (27017, Some(2402))];
    assert_eq!(pick(Some(2402), &answers), Some(27017));
    // They gave a query port.
    assert_eq!(pick(Some(27016), &answers), Some(27016));
    // A game port no server here uses isn't guessed at.
    assert_eq!(pick(Some(2502), &answers), None);
    assert_eq!(pick(None, &answers), Some(27016));
    assert_eq!(pick(None, &[]), None);
  }

  /// Answers like a DayZ server with one mod: with a challenge first, and the rules split over two packets.
  async fn stand_in_server(socket: UdpSocket) {
    let mut info = b"\xFF\xFF\xFF\xFFI\x11Stand-in\0enoch\0dayz\0DayZ\0\0\0\x01\x0A\0dw\0\0".to_vec();
    info.extend_from_slice(b"1.29.162510\0\xA0");
    info.extend_from_slice(&2402u16.to_le_bytes());
    info.extend_from_slice(b"battleye,privHive,12:00\0");
    // Version, flags, no DLCs, then one mod: hash, a 4-byte id (1559126788, whose bytes need no escaping) and its name.
    let blob = b"\x02\x01\x02\x01\x02\x01\x02\x01\x01\x07\x07\x07\x07\x04\x04\x63\xEE\x5C\x02CF";
    let mut rules = b"\xFF\xFF\xFF\xFFE\x01\0\x01\x01\0".to_vec();
    rules.extend_from_slice(blob);
    rules.push(0);
    let split = |number: u8, data: &[u8]| {
      let mut packet = b"\xFE\xFF\xFF\xFF\x09\0\0\0\x02".to_vec();
      packet.push(number);
      packet.extend_from_slice(&1248u16.to_le_bytes());
      packet.extend_from_slice(data);
      packet
    };
    let (first, second) = rules.split_at(12);

    let mut buf = [0u8; 1400];
    while let Ok((len, from)) = socket.recv_from(&mut buf).await {
      let request = &buf[..len];
      let replies = if request.starts_with(INFO_REQUEST) {
        if len == INFO_REQUEST.len() { vec![b"\xFF\xFF\xFF\xFFA\x01\x02\x03\x04".to_vec()] } else { vec![info.clone()] }
      } else if request.ends_with(&[0xFF; 4]) {
        vec![b"\xFF\xFF\xFF\xFFA\x05\x06\x07\x08".to_vec()]
      } else {
        vec![split(1, second), split(0, first)]
      };
      for reply in replies {
        socket.send_to(&reply, from).await.unwrap();
      }
    }
  }

  #[tokio::test]
  async fn finds_a_server_running_on_this_computer() {
    let Ok(socket) = UdpSocket::bind((Ipv4Addr::LOCALHOST, 27019)).await else {
      eprintln!("skipped: port 27019 is in use");
      return;
    };
    tokio::spawn(stand_in_server(socket));

    let found = search().await.unwrap();
    let addr: SocketAddr = "127.0.0.1:27019".parse().unwrap();
    assert!(found.contains(&addr), "found {found:?}");

    let server = ask(addr).await.unwrap();
    assert_eq!(server.row.name, "Stand-in");
    assert_eq!((server.row.game_port, server.row.players, server.row.max_players), (2402, 1, 10));
    assert!(server.row.battl_eye && !server.row.official);
    assert_eq!(server.row.time, "12:00");
    assert_eq!(server.mods, [servers::Mod { name: "CF".into(), steam_workshop_id: 1559126788 }]);
  }

  #[test]
  fn lists_a_server_on_this_computer_once() {
    // This computer: loopback, the main network, Tailscale, WSL and VirtualBox's host-only network.
    let own: HashSet<IpAddr> = ["127.0.0.1", "192.168.1.10", "100.98.225.107", "172.31.208.1", "192.168.56.1"]
      .iter()
      .map(|ip| ip.parse().unwrap())
      .collect();
    let main = Some("192.168.1.10".parse().unwrap());
    let addrs = |list: &[&str]| -> HashSet<SocketAddr> { list.iter().map(|a| a.parse().unwrap()).collect() };
    let kept =
      |found, main| -> Vec<String> { one_per_server_here(found, &own, main).iter().map(ToString::to_string).collect() };

    // One server answering on every address, a second one only on loopback, and another computer's server.
    let found = addrs(&[
      "100.98.225.107:27016",
      "172.31.208.1:27016",
      "192.168.1.10:27016",
      "192.168.56.1:27016",
      "127.0.0.1:27016",
      "127.0.0.1:27017",
      "192.168.1.9:27016",
    ]);
    assert_eq!(kept(found.clone(), main), ["127.0.0.1:27017", "192.168.1.9:27016", "192.168.1.10:27016"]);
    // Without a main network, loopback is kept.
    assert_eq!(kept(found, None), ["127.0.0.1:27016", "127.0.0.1:27017", "192.168.1.9:27016"]);
  }
}
