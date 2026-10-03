//! Measures latency to servers and reads their live player counts.
//!
//! Latency comes from an ICMP echo, which reflects the network path a player
//! will actually get. Player counts come from a Steam A2S_INFO query. A server
//! takes a while to answer that query, so its response time reads well above
//! the real latency and is only used as an estimate for hosts that block ICMP.

use std::collections::{HashMap, HashSet};
use std::net::{IpAddr, SocketAddr};
use std::time::{Duration, Instant};

use futures::StreamExt;
use ping_async::{IcmpEchoRequestor, IcmpEchoStatus};
use serde::Serialize;
use tauri::State;
use tokio::net::UdpSocket;

use crate::servers::ServerCache;

const HEADER: [u8; 4] = [0xFF; 4];
const INFO_REQUEST: &[u8] = b"\xFF\xFF\xFF\xFFTSource Engine Query\0";
const CHALLENGE: u8 = 0x41;
const INFO: u8 = 0x49;
const QUERY_TIMEOUT: Duration = Duration::from_millis(1500);
const ICMP_TIMEOUT: Duration = Duration::from_millis(1000);
const CONCURRENCY: usize = 48;
const MAX_BATCH: usize = 256;

#[derive(Debug, PartialEq)]
pub struct Info {
  pub players: u8,
  pub max_players: u8,
}

fn skip_cstring(data: &[u8]) -> Option<&[u8]> {
  let end = data.iter().position(|&b| b == 0)?;
  Some(&data[end + 1..])
}

/// Parses the payload of an A2S_INFO reply (everything after the type byte).
fn parse_info(payload: &[u8]) -> Option<Info> {
  // protocol, then name, map, folder and game as null-terminated strings
  let mut rest = payload.get(1..)?;
  for _ in 0..4 {
    rest = skip_cstring(rest)?;
  }
  // app id (u16), players, max players
  Some(Info { players: *rest.get(2)?, max_players: *rest.get(3)? })
}

/// Queries a server, returning how long it took to answer and what it said.
pub async fn a2s_info(addr: SocketAddr) -> Option<(Duration, Info)> {
  let socket = UdpSocket::bind("0.0.0.0:0").await.ok()?;
  socket.connect(addr).await.ok()?;
  let mut request = INFO_REQUEST.to_vec();
  let mut buf = [0u8; 1400];

  // A server may answer with a challenge that has to be echoed back.
  for _ in 0..3 {
    let sent = Instant::now();
    socket.send(&request).await.ok()?;
    let len = tokio::time::timeout(QUERY_TIMEOUT, socket.recv(&mut buf)).await.ok()?.ok()?;
    let elapsed = sent.elapsed();
    let reply = &buf[..len];
    if reply.len() < 5 || reply[..4] != HEADER {
      return None;
    }
    match reply[4] {
      CHALLENGE if reply.len() >= 9 => {
        request.truncate(INFO_REQUEST.len());
        request.extend_from_slice(&reply[5..9]);
      }
      INFO => return parse_info(&reply[5..]).map(|info| (elapsed, info)),
      _ => return None,
    }
  }
  None
}

/// Sends one ICMP echo. Needs no elevated rights on Windows.
pub async fn icmp_ping(ip: IpAddr) -> Option<Duration> {
  let pinger = IcmpEchoRequestor::new(ip, None, None, Some(ICMP_TIMEOUT)).ok()?;
  let reply = pinger.send().await.ok()?;
  (reply.status() == IcmpEchoStatus::Success).then(|| reply.round_trip_time())
}

/// Picks the latency to show: the ICMP round trip when the host answered one,
/// otherwise the query response time flagged as an estimate.
fn latency(icmp: Option<Duration>, query: Option<Duration>) -> (Option<u32>, bool) {
  match (icmp, query) {
    (Some(rtt), _) => (Some(rtt.as_millis() as u32), false),
    (None, Some(elapsed)) => (Some(elapsed.as_millis() as u32), true),
    (None, None) => (None, false),
  }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Ping {
  pub id: String,
  /// `None` when the server answered neither a ping nor a query.
  pub ping_ms: Option<u32>,
  /// True when `ping_ms` is the query response time rather than a real ping.
  pub estimated: bool,
  pub players: Option<u8>,
  pub max_players: Option<u8>,
}

#[tauri::command]
pub async fn ping_servers(cache: State<'_, ServerCache>, ids: Vec<String>) -> Result<Vec<Ping>, ()> {
  let targets: Vec<(String, Option<SocketAddr>)> = {
    let servers = cache.0.read().unwrap();
    ids
      .into_iter()
      .take(MAX_BATCH)
      .map(|id| {
        let addr = servers
          .get(&id)
          .and_then(|s| format!("{}:{}", s.row.ip, s.row.query_port).parse().ok());
        (id, addr)
      })
      .collect()
  };

  // Communities often run several servers on one address, so ping each host once.
  let hosts: HashSet<IpAddr> = targets.iter().filter_map(|(_, addr)| addr.map(|a| a.ip())).collect();
  let pings = futures::stream::iter(hosts)
    .map(|ip| async move { (ip, icmp_ping(ip).await) })
    .buffer_unordered(CONCURRENCY)
    .collect::<HashMap<IpAddr, Option<Duration>>>();

  let queries = futures::stream::iter(targets)
    .map(|(id, addr)| async move {
      let reply = match addr {
        Some(addr) => a2s_info(addr).await,
        None => None,
      };
      (id, addr, reply)
    })
    .buffer_unordered(CONCURRENCY)
    .collect::<Vec<_>>();

  let (pings, queries) = tokio::join!(pings, queries);

  Ok(
    queries
      .into_iter()
      .map(|(id, addr, reply)| {
        let icmp = addr.and_then(|a| pings.get(&a.ip()).copied().flatten());
        let (ping_ms, estimated) = latency(icmp, reply.as_ref().map(|(elapsed, _)| *elapsed));
        Ping {
          id,
          ping_ms,
          estimated,
          players: reply.as_ref().map(|(_, info)| info.players),
          max_players: reply.as_ref().map(|(_, info)| info.max_players),
        }
      })
      .collect(),
  )
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn parses_player_counts_from_info_payload() {
    let mut payload = vec![0x11];
    payload.extend_from_slice(b"My Server\0chernarusplus\0dayz\0DayZ\0");
    payload.extend_from_slice(&[0x00, 0x00, 42, 60, 0, b'd', b'w', 0, 1]);
    assert_eq!(parse_info(&payload), Some(Info { players: 42, max_players: 60 }));
  }

  #[test]
  fn rejects_truncated_info_payload() {
    assert_eq!(parse_info(b"\x11My Server\0cherna"), None);
    assert_eq!(parse_info(b""), None);
  }

  #[test]
  fn prefers_icmp_and_flags_query_time_as_an_estimate() {
    let ms = Duration::from_millis;
    assert_eq!(latency(Some(ms(13)), Some(ms(90))), (Some(13), false));
    assert_eq!(latency(Some(ms(13)), None), (Some(13), false));
    assert_eq!(latency(None, Some(ms(90))), (Some(90), true));
    assert_eq!(latency(None, None), (None, false));
  }
}
