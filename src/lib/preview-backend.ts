// Development only: stands in for the Rust backend when the UI runs in a
// browser. Mirrors `src-tauri/src/servers.rs`.

import type { Mod, ServerList, ServerRow } from "./types";

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
  const positions = new Map<number, number>();
  const position = (mod: Mod) => {
    let found = positions.get(mod.steamWorkshopId);
    if (found === undefined) {
      found = modNames.push(mod.name) - 1;
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
  return { servers: rows, modNames };
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
