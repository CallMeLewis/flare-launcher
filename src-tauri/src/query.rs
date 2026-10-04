//! Measures latency to servers and reads their live player counts, and asks a
//! server about itself and its mods when it isn't in the server list.
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

use crate::servers::{Mod, ServerCache};

pub const HEADER: [u8; 4] = [0xFF; 4];
const SPLIT_HEADER: [u8; 4] = [0xFE, 0xFF, 0xFF, 0xFF];
pub const INFO_REQUEST: &[u8] = b"\xFF\xFF\xFF\xFFTSource Engine Query\0";
const RULES_REQUEST: &[u8] = b"\xFF\xFF\xFF\xFFV";
const NO_CHALLENGE: [u8; 4] = [0xFF; 4];
const CHALLENGE: u8 = 0x41;
const INFO: u8 = 0x49;
const RULES: u8 = 0x45;
const QUERY_TIMEOUT: Duration = Duration::from_millis(1500);
const ICMP_TIMEOUT: Duration = Duration::from_millis(1000);
const CONCURRENCY: usize = 48;
const MAX_BATCH: usize = 256;

/// What a server says about itself in reply to an A2S_INFO query.
#[derive(Debug, Default, PartialEq)]
pub struct Info {
  pub name: String,
  pub map: String,
  pub players: u8,
  pub max_players: u8,
  pub password: bool,
  pub version: String,
  /// The port players join on, when the server gives it.
  pub game_port: Option<u16>,
  /// Comma-separated tags. DayZ puts its settings here, such as `no3rd` and the in-game time.
  pub keywords: String,
}

/// Reads the little-endian numbers and null-terminated strings that query replies are made of.
struct Reader<'a>(&'a [u8]);

impl<'a> Reader<'a> {
  fn bytes(&mut self, len: usize) -> Option<&'a [u8]> {
    if self.0.len() < len {
      return None;
    }
    let (taken, rest) = self.0.split_at(len);
    self.0 = rest;
    Some(taken)
  }

  fn u8(&mut self) -> Option<u8> {
    self.bytes(1).map(|b| b[0])
  }

  fn u16(&mut self) -> Option<u16> {
    self.bytes(2).map(|b| u16::from_le_bytes([b[0], b[1]]))
  }

  fn u32(&mut self) -> Option<u32> {
    self.bytes(4).map(|b| u32::from_le_bytes([b[0], b[1], b[2], b[3]]))
  }

  fn cstring(&mut self) -> Option<&'a [u8]> {
    let end = self.0.iter().position(|&b| b == 0)?;
    let text = &self.0[..end];
    self.0 = &self.0[end + 1..];
    Some(text)
  }

  fn string(&mut self) -> Option<String> {
    self.cstring().map(|text| String::from_utf8_lossy(text).into_owned())
  }
}

/// Parses the payload of an A2S_INFO reply (everything after the type byte).
fn parse_info(payload: &[u8]) -> Option<Info> {
  let mut reader = Reader(payload);
  reader.u8()?; // protocol
  let name = reader.string()?;
  let map = reader.string()?;
  reader.cstring()?; // folder
  reader.cstring()?; // game
  reader.u16()?; // app id
  let players = reader.u8()?;
  let max_players = reader.u8()?;
  let mut info = Info { name, map, players, max_players, ..Info::default() };
  // The rest only matters for servers that aren't in the list, so a reply cut short still gives the player count.
  read_details(&mut reader, &mut info);
  Some(info)
}

fn read_details(reader: &mut Reader, info: &mut Info) -> Option<()> {
  reader.bytes(3)?; // bots, server type, environment
  info.password = reader.u8()? == 1;
  reader.u8()?; // VAC
  info.version = reader.string()?;
  // Each set flag adds a field, in this order.
  let flags = reader.u8()?;
  if flags & 0x80 != 0 {
    info.game_port = Some(reader.u16()?);
  }
  if flags & 0x10 != 0 {
    reader.bytes(8)?; // Steam id
  }
  if flags & 0x40 != 0 {
    reader.u16()?; // spectator port
    reader.cstring()?; // spectator name
  }
  if flags & 0x20 != 0 {
    info.keywords = reader.string()?;
  }
  Some(())
}

/// Undoes the escaping DayZ applies to its binary rules to keep 0x00 out of them.
fn unescape(data: &[u8]) -> Vec<u8> {
  let mut out = Vec::with_capacity(data.len());
  let mut bytes = data.iter();
  while let Some(&byte) = bytes.next() {
    if byte != 0x01 {
      out.push(byte);
      continue;
    }
    match bytes.next() {
      Some(0x01) => out.push(0x01),
      Some(0x02) => out.push(0x00),
      Some(0x03) => out.push(0xFF),
      _ => {}
    }
  }
  out
}

/// Reads the mods a DayZ server runs from the payload of its A2S_RULES reply (everything after the type byte).
///
/// DayZ packs them into rules with two-byte keys that number the parts of one escaped binary blob. The blob holds a
/// version, flags and a hash per DLC, then each mod's hash, Workshop id and name.
fn parse_mods(payload: &[u8]) -> Option<Vec<Mod>> {
  let mut reader = Reader(payload);
  let count = reader.u16()?;
  let mut parts = Vec::new();
  for _ in 0..count {
    let key = reader.cstring()?;
    let value = reader.cstring()?;
    if let &[low, high] = key {
      parts.push((u16::from_le_bytes([low, high]), value));
    }
  }
  parts.sort_by_key(|&(key, _)| key);
  let joined: Vec<u8> = parts.into_iter().flat_map(|(_, value)| value.iter().copied()).collect();
  let blob = unescape(&joined);

  let mut reader = Reader(&blob);
  reader.u8()?; // protocol version
  reader.u8()?; // overflow flags
  let dlcs = reader.u16()?.count_ones() as usize;
  reader.bytes(4 * dlcs)?;
  let mod_count = reader.u8()?;
  let mut mods = Vec::with_capacity(mod_count.into());
  for _ in 0..mod_count {
    reader.u32()?; // hash
    // The low four bits give the id's length in bytes; the rest are flags.
    let id_len = usize::from(reader.u8()? & 0x0F);
    let mut id = [0u8; 8];
    id.get_mut(..id_len)?.copy_from_slice(reader.bytes(id_len)?);
    let name_len = reader.u8()?.into();
    let name = String::from_utf8_lossy(reader.bytes(name_len)?).trim().to_string();
    mods.push(Mod { name, steam_workshop_id: u64::from_le_bytes(id) });
  }
  Some(mods)
}

/// Reads one packet of a reply split over several: which part it is, how many parts there are, and its data.
fn split_part(packet: &[u8]) -> Option<(u8, u8, &[u8])> {
  let mut reader = Reader(packet.get(4..)?);
  // A set high bit on the reply's id means the parts are compressed, which DayZ doesn't do.
  if reader.u32()? & 0x8000_0000 != 0 {
    return None;
  }
  let total = reader.u8()?;
  let number = reader.u8()?;
  reader.u16()?; // largest packet size
  Some((number, total, reader.0))
}

/// Receives one reply, joining it back together when it arrives split over several packets.
async fn receive(socket: &UdpSocket) -> Option<Vec<u8>> {
  let mut buf = vec![0u8; 65536];
  let mut parts: Vec<Option<Vec<u8>>> = Vec::new();
  loop {
    let len = socket.recv(&mut buf).await.ok()?;
    let packet = &buf[..len];
    if packet.get(..4)? != SPLIT_HEADER {
      return Some(packet.to_vec());
    }
    let (number, total, data) = split_part(packet)?;
    if total == 0 || number >= total {
      return None;
    }
    if parts.is_empty() {
      parts.resize(total.into(), None);
    }
    *parts.get_mut(usize::from(number))? = Some(data.to_vec());
    if parts.iter().all(Option::is_some) {
      return Some(parts.into_iter().flatten().flatten().collect());
    }
  }
}

/// Sends a query and waits for a reply of the given type. Returns how long it took and the payload after the type
/// byte.
async fn request(addr: SocketAddr, prefix: &[u8], challenge: Option<[u8; 4]>, kind: u8) -> Option<(Duration, Vec<u8>)> {
  let socket = UdpSocket::bind("0.0.0.0:0").await.ok()?;
  socket.connect(addr).await.ok()?;
  let mut request = prefix.to_vec();
  request.extend(challenge.iter().flatten());

  // A server may answer with a challenge that has to be sent back with the query.
  for _ in 0..3 {
    let sent = Instant::now();
    socket.send(&request).await.ok()?;
    let reply = tokio::time::timeout(QUERY_TIMEOUT, receive(&socket)).await.ok()??;
    let elapsed = sent.elapsed();
    if reply.len() < 5 || reply[..4] != HEADER {
      return None;
    }
    match reply[4] {
      CHALLENGE if reply.len() >= 9 => {
        request.truncate(prefix.len());
        request.extend_from_slice(&reply[5..9]);
      }
      found if found == kind => return Some((elapsed, reply[5..].to_vec())),
      _ => return None,
    }
  }
  None
}

/// Queries a server, returning how long it took to answer and what it said.
pub async fn a2s_info(addr: SocketAddr) -> Option<(Duration, Info)> {
  let (elapsed, payload) = request(addr, INFO_REQUEST, None, INFO).await?;
  parse_info(&payload).map(|info| (elapsed, info))
}

/// Asks a DayZ server which mods it runs.
pub async fn a2s_mods(addr: SocketAddr) -> Option<Vec<Mod>> {
  let (_, payload) = request(addr, RULES_REQUEST, Some(NO_CHALLENGE), RULES).await?;
  parse_mods(&payload)
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
        let addr = servers.get(&id).and_then(|s| format!("{}:{}", s.row.ip, s.row.query_port).parse().ok());
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
    let info = parse_info(&payload).unwrap();
    assert_eq!((info.players, info.max_players), (42, 60));
    assert_eq!(info.name, "My Server");
  }

  #[test]
  fn parses_the_details_of_a_dayz_server() {
    let mut payload = vec![0x11];
    payload.extend_from_slice(b"LAN Server\0enoch\0dayz\0DayZ\0");
    payload.extend_from_slice(&[0x00, 0x00, 3, 10, 0, b'd', b'w', 1, 0]);
    payload.extend_from_slice(b"1.29.162510\0");
    payload.push(0x80 | 0x10 | 0x20 | 0x01);
    payload.extend_from_slice(&2402u16.to_le_bytes());
    payload.extend_from_slice(&[7; 8]);
    payload.extend_from_slice(b"battleye,no3rd,privHive,etm4.000000,entm8.000000,14:05\0");
    payload.extend_from_slice(&221100u64.to_le_bytes());
    assert_eq!(
      parse_info(&payload),
      Some(Info {
        name: "LAN Server".into(),
        map: "enoch".into(),
        players: 3,
        max_players: 10,
        password: true,
        version: "1.29.162510".into(),
        game_port: Some(2402),
        keywords: "battleye,no3rd,privHive,etm4.000000,entm8.000000,14:05".into(),
      })
    );
  }

  #[test]
  fn rejects_truncated_info_payload() {
    assert_eq!(parse_info(b"\x11My Server\0cherna"), None);
    assert_eq!(parse_info(b""), None);
  }

  /// Escapes a blob the way DayZ does and splits it into numbered rules of `size` bytes, after one plain rule.
  fn rules_payload(blob: &[u8], size: usize) -> Vec<u8> {
    let mut escaped = Vec::new();
    for &byte in blob {
      match byte {
        0x00 => escaped.extend_from_slice(&[0x01, 0x02]),
        0x01 => escaped.extend_from_slice(&[0x01, 0x01]),
        0xFF => escaped.extend_from_slice(&[0x01, 0x03]),
        other => escaped.push(other),
      }
    }
    let chunks: Vec<&[u8]> = escaped.chunks(size).collect();
    let mut payload = ((chunks.len() + 1) as u16).to_le_bytes().to_vec();
    payload.extend_from_slice(b"dedicated\x001\0");
    // Out of order, to check they're put back in order.
    for (i, chunk) in chunks.iter().enumerate().rev() {
      payload.extend_from_slice(&[i as u8 + 1, chunks.len() as u8, 0]);
      payload.extend_from_slice(chunk);
      payload.push(0);
    }
    payload
  }

  #[test]
  fn reads_the_mods_from_the_rules() {
    let mut blob = vec![2, 0];
    blob.extend_from_slice(&2u16.to_le_bytes()); // one DLC
    blob.extend_from_slice(&[0xAA, 0x00, 0x01, 0xFF]);
    blob.push(2);
    for (id, name) in [(1559212036u32, &b"Community Framework"[..]), (2116157322, b"DabsFramework")] {
      blob.extend_from_slice(&[0x10, 0x20, 0x30, 0x40]);
      blob.push(0x04);
      blob.extend_from_slice(&id.to_le_bytes());
      blob.push(name.len() as u8);
      blob.extend_from_slice(name);
    }
    blob.push(0); // signatures
    assert_eq!(
      parse_mods(&rules_payload(&blob, 7)),
      Some(vec![
        Mod { name: "Community Framework".into(), steam_workshop_id: 1559212036 },
        Mod { name: "DabsFramework".into(), steam_workshop_id: 2116157322 },
      ])
    );
  }

  #[test]
  fn reads_a_vanilla_server_as_having_no_mods() {
    assert_eq!(parse_mods(&rules_payload(&[2, 0, 0, 0, 0, 0], 100)), Some(vec![]));
  }

  #[test]
  fn unescapes_each_pair_once() {
    assert_eq!(unescape(&[0x01, 0x01, 0x02, 0x01, 0x02, 0x01, 0x03, 0x05]), vec![0x01, 0x02, 0x00, 0xFF, 0x05]);
  }

  #[test]
  fn reads_the_parts_of_a_split_reply() {
    let mut packet = SPLIT_HEADER.to_vec();
    packet.extend_from_slice(&7u32.to_le_bytes());
    packet.extend_from_slice(&[3, 1]);
    packet.extend_from_slice(&1248u16.to_le_bytes());
    packet.extend_from_slice(b"data");
    assert_eq!(split_part(&packet), Some((1, 3, &b"data"[..])));

    packet[4..8].copy_from_slice(&0x8000_0007u32.to_le_bytes());
    assert_eq!(split_part(&packet), None);
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
