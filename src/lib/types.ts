export type ServerRow = {
  /** `ip:queryPort`, unique per server. */
  id: string;
  ip: string;
  queryPort: number;
  gamePort: number;
  name: string;
  /** Lowercased map identifier, e.g. `chernarusplus`. */
  map: string;
  players: number;
  maxPlayers: number;
  password: boolean;
  firstPersonOnly: boolean;
  official: boolean;
  battlEye: boolean;
  version: string;
  /** In-game time as `HH:MM`. */
  time: string;
  timeAcceleration: number | null;
  /** Two-letter code of the country the server is in, such as `DE`, or `null` when its address doesn't show one. */
  country: string | null;
  modCount: number;
  /** Positions in {@link ServerList.modNames}, for searching by mod. */
  mods: number[];
};

export type ServerList = {
  servers: ServerRow[];
  /** One name per distinct mod, shared between servers. */
  modNames: string[];
  /** Each mod's Workshop id, in the same order as `modNames`. */
  modIds: number[];
};

export type Mod = {
  name: string;
  steamWorkshopId: number;
};

export type Ping = {
  id: string;
  /** `null` when the server did not answer. */
  pingMs: number | null;
  /** True when `pingMs` is the query response time, which reads higher than a real ping. */
  estimated: boolean;
  players: number | null;
  maxPlayers: number | null;
};

/** A mod the player is subscribed to on the Workshop. */
export type SubscribedMod = {
  id: number;
  /** Its name on the Workshop, or the name in its files when the Workshop can't say. */
  name: string | null;
  /** Whether Steam has put its files on this computer. */
  installed: boolean;
  /** Bytes on disk. */
  size: number | null;
  /** When the copy on this computer was published on the Workshop, in seconds since 1970. */
  updatedAt: number | null;
  /** When the Workshop's copy was published. `null` when the Workshop couldn't be reached or no longer has it. */
  latestUpdatedAt: number | null;
  /** The Workshop no longer has the mod: it was removed or made private. */
  removed: boolean;
};

export type ModStatus = "queued" | "downloading" | "installed" | "failed";

export type ModProgress = {
  id: number;
  status: ModStatus;
  /** Bytes. Both are zero until Steam starts the download. */
  downloaded: number;
  total: number;
};

/** A join in progress: fetching missing mods first, then starting the game. */
export type PlayJob = {
  serverId: string;
  /** Checking which mods are missing, downloading them, then waiting for DayZ to start. */
  phase: "checking" | "downloading" | "starting";
  /** False when the player only wants the mods downloaded. */
  startsGame: boolean;
  progress: ModProgress[];
};

export type Install = {
  dayzDir: string;
  workshopDir: string;
};

export type LaunchRequest = {
  serverId: string;
  dayzDir: string | null;
  profileName: string | null;
  password: string | null;
  extraArgs: string | null;
};

/** Light or dark, or whichever the system is set to. */
export type Theme = "light" | "dark" | "system";

/** A language the launcher comes in. */
export type Locale = "en-GB" | "en-US" | "fr" | "de";
/** A language, or System to follow the computer's. */
export type Language = Locale | "system";

export type Settings = {
  profileName: string;
  dayzDir: string;
  extraArgs: string;
  /** Interface zoom, 1 being 100%. */
  uiScale: number;
  theme: Theme;
  language: Language;
  skipIntro: boolean;
  noSplash: boolean;
  noPause: boolean;
  windowed: boolean;
  /** What the launcher does once DayZ has started. */
  afterLaunch: "keep" | "minimise" | "close";
  /** Whether Discord shows the player using the launcher and in game, never which server. */
  discordStatus: boolean;
};

export type UpdateChannel = "stable" | "beta";

export type UpdateSettings = {
  channel: UpdateChannel;
  /** Whether the launcher checks on its own, at start and every few hours. */
  autoCheck: boolean;
};

export type UpdateStatus =
  /** Development builds, which cannot update themselves. */
  | { state: "unsupported" }
  | { state: "idle" }
  | { state: "checking" }
  | { state: "upToDate"; checkedAt: number }
  // notes: the new version's release notes from the update feed, as plain text ("- " bullet lines).
  | { state: "available"; version: string; releaseDate?: string | null; notes?: string | null }
  | { state: "downloading"; version: string; percent: number; notes?: string | null }
  | { state: "ready"; version: string; notes?: string | null }
  | { state: "error"; message: BackendText };

/**
 * Text from the backend: its English template and the values for its placeholders, translated with `backendText`.
 */
export type BackendText = { message: string; values: Record<string, string | number> };

/** Whether the launcher is in the Linux app menu. Only an AppImage can add itself; elsewhere `supported` is false. */
export interface AppMenu {
  supported: boolean;
  /** Some menu entry opens this copy, the launcher's own or one made by another tool. */
  added: boolean;
  /** The entry is the launcher's own, so it can remove it. */
  ours: boolean;
}
