// Rebuilds src-tauri/data/countries.bin, the table the launcher finds a server's country in, from DB-IP's free
// IP to Country Lite database (CC BY 4.0, credited in Settings > About). Run it now and then to pick up changes.
//
//   node scripts/update-countries.ts      (pnpm countries)
//
// The table holds one 6-byte entry per IPv4 range, sorted: the range's first address (4 bytes, big-endian) and its
// country code (2 ASCII bytes, or two zero bytes where no country applies, such as private networks). Each range
// runs until the next one starts.
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const out = resolve(dirname(fileURLToPath(import.meta.url)), "../src-tauri/data/countries.bin");

/** This month's database, or last month's early in a month before the new one is out. */
async function download(): Promise<string> {
  const now = new Date();
  for (const back of [0, 1]) {
    const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1)).toISOString().slice(0, 7);
    const url = `https://download.db-ip.com/free/dbip-country-lite-${month}.csv.gz`;
    const response = await fetch(url);
    if (response.ok) {
      console.log(`Using ${url}`);
      return gunzipSync(Buffer.from(await response.arrayBuffer())).toString("utf8");
    }
  }
  throw new Error("Couldn't download the DB-IP country database.");
}

function ipv4(text: string): number {
  const parts = text.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255))
    throw new Error(`Not an IPv4 address: ${text}`);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

const ranges: { start: number; end: number; country: string }[] = [];
for (const line of (await download()).split("\n")) {
  const [start, end, country] = line.trim().split(",");
  // IPv6 ranges are left out: the server list only has IPv4 addresses.
  if (!country || start.includes(":")) continue;
  // ZZ marks addresses with no country, such as private networks.
  const code = /^[A-Z]{2}$/.test(country) && country !== "ZZ" ? country : "";
  const range = { start: ipv4(start), end: ipv4(end), country: code };
  const last = ranges.at(-1);
  if (last && range.start <= last.end) throw new Error(`Ranges out of order at ${start}`);
  if (last && last.country === code && last.end + 1 === range.start) last.end = range.end;
  else {
    // A gap between ranges has no country.
    if (last && last.end + 1 < range.start && last.country !== "")
      ranges.push({ start: last.end + 1, end: range.start - 1, country: "" });
    ranges.push(range);
  }
}

const table = Buffer.alloc(ranges.length * 6);
ranges.forEach(({ start, country }, i) => {
  table.writeUInt32BE(start, i * 6);
  if (country) table.write(country, i * 6 + 4, "ascii");
});
writeFileSync(out, table);
console.log(
  `Wrote ${ranges.length} ranges (${(table.length / 1024 / 1024).toFixed(1)} MB) to src-tauri/data/countries.bin`,
);
