// Development only: stands in for the Rust backend when the UI runs in a
// browser. Mirrors `src-tauri/src/servers.rs`.

import type { Mod, ServerList, ServerRow, SubscribedMod } from "./types";

const LIST_URL = "https://dayzsalauncher.com/api/v1/launcher/servers/dayz";

type ApiServer = {
  endpoint: { ip: string; port: number };
  gamePort: number;
  name: string;
  map?: string;
  players?: number;
  maxPlayers?: number;
  password?: boolean;
  version?: string;
  firstPersonOnly?: boolean;
  shard?: string;
  time?: string;
  timeAcceleration?: number;
  battlEye?: boolean;
  mods?: Mod[];
};

const mods = new Map<string, Mod[]>();

export async function fetchServers(): Promise<ServerList> {
  const response = await fetch(LIST_URL);
  if (!response.ok) throw new Error(`Could not reach the server list (${response.status}).`);
  const body = (await response.json()) as { result: ApiServer[] };

  mods.clear();
  const rows: ServerRow[] = [];
  const modNames: string[] = [];
  const modIds: number[] = [];
  const positions = new Map<number, number>();
  const position = (mod: Mod) => {
    let found = positions.get(mod.steamWorkshopId);
    if (found === undefined) {
      found = modNames.push(mod.name) - 1;
      modIds.push(mod.steamWorkshopId);
      positions.set(mod.steamWorkshopId, found);
    }
    return found;
  };
  for (const api of body.result) {
    if (!api.endpoint?.ip || !api.endpoint.port || !api.gamePort || typeof api.name !== "string") continue;
    const id = `${api.endpoint.ip}:${api.endpoint.port}`;
    if (mods.has(id)) continue;
    mods.set(id, api.mods ?? []);
    rows.push({
      id,
      ip: api.endpoint.ip,
      queryPort: api.endpoint.port,
      gamePort: api.gamePort,
      name: api.name.trim(),
      map: (api.map ?? "").trim().toLowerCase(),
      players: api.players ?? 0,
      maxPlayers: api.maxPlayers ?? 0,
      password: api.password ?? false,
      firstPersonOnly: api.firstPersonOnly ?? false,
      official: api.shard === "public",
      battlEye: api.battlEye ?? false,
      version: api.version ?? "",
      time: api.time ?? "",
      timeAcceleration: api.timeAcceleration ?? null,
      modCount: api.mods?.length ?? 0,
      mods: (api.mods ?? []).map(position),
    });
  }
  return { servers: rows, modNames, modIds };
}

export async function serverMods(id: string): Promise<Mod[]> {
  return mods.get(id) ?? [];
}

// Remembered passwords last until the page reloads, so the Remember option can be tried in the browser.
const passwords = new Map<string, string>();

export async function savedPassword(serverId: string): Promise<string | null> {
  return passwords.get(serverId) ?? null;
}

export async function savePassword(serverId: string, password: string): Promise<void> {
  passwords.set(serverId, password);
}

export async function forgetPassword(serverId: string): Promise<void> {
  passwords.delete(serverId);
}

const DAY = 24 * 60 * 60;
const now = Math.floor(Date.now() / 1000);
// A few well-known mods in every state the mods page shows, so it can be worked on in the browser.
let subscribed: SubscribedMod[] = [
  { id: 1559212036, name: "Community Framework", size: 527_656, updatedAt: now - 40 * DAY },
  { id: 1564026768, name: "Community Online Tools", size: 9_813_244, updatedAt: now - 90 * DAY },
  { id: 2116151222, name: "DayZ-Expansion-Bundle", size: 1_402_337_112, updatedAt: now - 12 * DAY },
  { id: 2291785308, name: "DayZ-Expansion-Core", size: 52_011_874, updatedAt: now - 3 * DAY },
  { id: 1750506510, name: "Namalsk Island", size: 13_217_773_714, updatedAt: now - 200 * DAY },
  { id: 1646187754, name: "Code Lock", size: 10_301_213, updatedAt: now - 400 * DAY },
  { id: 1828439124, name: "VPPAdminTools", size: 66_402_910, updatedAt: now - 30 * DAY },
  { id: 2545327648, name: "Dabs Framework", size: null, updatedAt: null },
  { id: 1797720064, name: "BuilderItems", size: 893_953_809, updatedAt: now - 700 * DAY },
].map((mod, i) => ({
  ...mod,
  installed: mod.size !== null,
  // The third and fourth have updates waiting; the sixth is gone from the Workshop.
  latestUpdatedAt: i === 5 ? null : mod.updatedAt === null ? now - DAY : mod.updatedAt + (i === 2 || i === 3 ? DAY : 0),
  removed: i === 5,
}));

export async function subscribedMods(): Promise<SubscribedMod[]> {
  return subscribed;
}

export async function unsubscribeMods(ids: number[]): Promise<void> {
  subscribed = subscribed.filter((mod) => !ids.includes(mod.id));
}
