//! Finds which country an IPv4 address is in, from the table `scripts/update-countries.ts` builds out of DB-IP's
//! free country database. Each 6-byte entry is a range's first address, big-endian, and its two-letter country code,
//! or two zero bytes for addresses with no country. A range runs until the next one starts.

use std::net::Ipv4Addr;

static TABLE: &[u8] = include_bytes!("../data/countries.bin");
const ENTRY: usize = 6;

/// The ISO 3166 code of the country `ip` is in, such as `DE`. `None` for private and reserved addresses, and for
/// any the table doesn't know.
pub fn country(ip: Ipv4Addr) -> Option<String> {
  country_in(TABLE, ip)
}

fn country_in(table: &[u8], ip: Ipv4Addr) -> Option<String> {
  let ip = u32::from(ip);
  let start = |i: usize| u32::from_be_bytes(table[i * ENTRY..i * ENTRY + 4].try_into().unwrap());
  // The number of ranges starting at or before ip; the last of them holds it.
  let count = table.len() / ENTRY;
  let (mut low, mut high) = (0, count);
  while low < high {
    let mid = (low + high) / 2;
    if start(mid) <= ip { low = mid + 1 } else { high = mid }
  }
  let code = &table[(low.checked_sub(1)?) * ENTRY + 4..][..2];
  code.iter().all(u8::is_ascii_uppercase).then(|| String::from_utf8_lossy(code).into_owned())
}

#[cfg(test)]
mod tests {
  use super::*;

  fn entry(start: [u8; 4], code: &[u8; 2]) -> Vec<u8> {
    [&start[..], code].concat()
  }

  #[test]
  fn finds_the_range_holding_an_address() {
    let table = [entry([1, 0, 0, 0], b"AU"), entry([2, 0, 0, 0], b"\0\0"), entry([3, 0, 0, 0], b"DE")].concat();
    let find = |ip: [u8; 4]| country_in(&table, Ipv4Addr::from(ip));
    assert_eq!(find([0, 255, 255, 255]), None);
    assert_eq!(find([1, 0, 0, 0]).as_deref(), Some("AU"));
    assert_eq!(find([1, 200, 3, 4]).as_deref(), Some("AU"));
    assert_eq!(find([2, 0, 0, 1]), None);
    assert_eq!(find([3, 0, 0, 0]).as_deref(), Some("DE"));
    assert_eq!(find([255, 255, 255, 255]).as_deref(), Some("DE"));
  }

  #[test]
  fn reads_the_bundled_table() {
    assert_eq!(TABLE.len() % ENTRY, 0);
    assert_eq!(country(Ipv4Addr::new(192, 168, 1, 20)), None);
    assert_eq!(country(Ipv4Addr::new(10, 0, 0, 1)), None);
    // Google's public DNS.
    assert_eq!(country(Ipv4Addr::new(8, 8, 8, 8)).as_deref(), Some("US"));
  }
}
