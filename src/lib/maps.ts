const NAMES: Record<string, string> = {
  chernarusplus: "Chernarus",
  chernarusplusgloom: "Chernarus",
  enoch: "Livonia",
  enochgloom: "Livonia",
  sakhal: "Sakhal",
  deerisle: "Deer Isle",
  namalsk: "Namalsk",
  banov: "Banov",
  bitterroot: "Bitterroot",
  pripyat: "Pripyat",
  nhchernobyl: "Chernobyl",
  chernarus2035: "Chernarus 2035",
  takistanplus: "Takistan",
  exclusionzone: "Exclusion Zone",
  esseker: "Esseker",
  rostow: "Rostow",
  chiemsee: "Chiemsee",
  melkart: "Melkart",
  iztek: "Iztek",
  alteria: "Alteria",
};

/** Player-facing name for a map identifier reported by a server. */
export function mapName(map: string): string {
  if (!map) return "Unknown";
  return NAMES[map] ?? map.charAt(0).toUpperCase() + map.slice(1);
}
