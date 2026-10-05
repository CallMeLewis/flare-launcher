import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { mapName } from "./maps";
import type { ServerRow } from "./types";

export type ModsFilter = "any" | "vanilla" | "modded";
export type Perspective = "any" | "first" | "third";
export type TimeOfDay = "any" | "day" | "night";
export type ServerType = "any" | "official" | "community";

export type Filters = {
  search: string;
  /** Map name as shown to the player, or an empty string for any map. */
  map: string;
  /** Game version, or an empty string for any version. */
  version: string;
  serverType: ServerType;
  hasPlayers: boolean;
  notFull: boolean;
  /** Highest ping in milliseconds, or null for any. */
  maxPing: number | null;
  hideOffline: boolean;
  perspective: Perspective;
  timeOfDay: TimeOfDay;
  mods: ModsFilter;
  /** Names of mods a server has to run, every one of them. */
  requiredMods: string[];
  noPassword: boolean;
  battlEye: boolean;
};

export const DEFAULT_FILTERS: Filters = {
  search: "",
  map: "",
  version: "",
  serverType: "any",
  hasPlayers: true,
  notFull: false,
  maxPing: null,
  hideOffline: false,
  perspective: "any",
  timeOfDay: "any",
  mods: "any",
  requiredMods: [],
  noPassword: false,
  battlEye: false,
};

/** Filters with nothing narrowed, the search aside: what Clear all goes back to. */
export const NO_FILTERS: Filters = { ...DEFAULT_FILTERS, hasPlayers: false };

/**
 * The filters remembered between launches: standing preferences such as ping or perspective. Search, map, version
 * and mods describe what the player is looking for right now, so they start fresh.
 */
export type SavedFilters = Pick<
  Filters,
  "hasPlayers" | "notFull" | "maxPing" | "hideOffline" | "perspective" | "serverType" | "noPassword" | "battlEye"
>;

const oneOf =
  <T extends string>(...values: T[]) =>
  (value: unknown): value is T =>
    values.includes(value as T);

/** Takes just the remembered filters, falling back to the defaults for anything missing or malformed. */
export function pickSaved(stored: Record<string, unknown>): SavedFilters {
  const flag = (key: keyof SavedFilters) =>
    typeof stored[key] === "boolean" ? (stored[key] as boolean) : (DEFAULT_FILTERS[key] as boolean);
  // Versions before the Filters menu saved first person as a yes/no toggle.
  const perspective = oneOf<Perspective>("any", "first", "third")(stored.perspective)
    ? stored.perspective
    : stored.firstPersonOnly === true
      ? "first"
      : "any";
  return {
    hasPlayers: flag("hasPlayers"),
    notFull: flag("notFull"),
    maxPing: typeof stored.maxPing === "number" && stored.maxPing > 0 ? stored.maxPing : null,
    hideOffline: flag("hideOffline"),
    perspective,
    serverType: oneOf<ServerType>("any", "official", "community")(stored.serverType) ? stored.serverType : "any",
    noPassword: flag("noPassword"),
    battlEye: flag("battlEye"),
  };
}

export function isNight(time: string): boolean {
  const hour = Number.parseInt(time, 10);
  return Number.isFinite(hour) && (hour < 5 || hour >= 20);
}

/** Moves favourites to the top, keeping the existing order within each group. */
export function pinFavourites(rows: ServerRow[], favourites: ReadonlySet<string>): ServerRow[] {
  const pinned: ServerRow[] = [];
  const rest: ServerRow[] = [];
  for (const row of rows) (favourites.has(row.id) ? pinned : rest).push(row);
  return pinned.length === 0 ? rows : [...pinned, ...rest];
}

export const SORT_KEYS = ["name", "map", "players", "time", "ping"] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export type Sort = { key: SortKey; descending: boolean };

export const DEFAULT_SORT: Sort = { key: "players", descending: true };

function searchTerms(search: string): string[] {
  return search.toLowerCase().split(/\s+/).filter(Boolean);
}

function serverText(row: ServerRow): string {
  return `${row.name} ${row.id} ${row.map} ${mapName(row.map)}`.toLowerCase();
}

function modsMatching(modNames: readonly string[], term: string): Set<number> {
  const found = new Set<number>();
  modNames.forEach((name, position) => {
    if (name.toLowerCase().includes(term)) found.add(position);
  });
  return found;
}

/** What is known about a server's connection, for the ping filters. */
export type Reachability = { pingMs: number | null; offline: boolean };

/**
 * Every search term has to match the server's name, address or map, or the
 * name of one of its mods. A server that hasn't been pinged yet passes the
 * ping filters until it has.
 */
export function filterServers(
  rows: ServerRow[],
  filters: Filters,
  modNames: readonly string[] = [],
  reachability: (id: string) => Reachability | undefined = () => undefined,
): ServerRow[] {
  const terms = searchTerms(filters.search);
  const modsByTerm = terms.map((term) => modsMatching(modNames, term));
  const required = filters.requiredMods.map((name) => modNames.indexOf(name));
  return rows.filter((row) => {
    if (filters.map && mapName(row.map) !== filters.map) return false;
    if (filters.version && row.version !== filters.version) return false;
    if (filters.serverType === "official" && !row.official) return false;
    if (filters.serverType === "community" && row.official) return false;
    if (filters.hasPlayers && row.players === 0) return false;
    if (filters.notFull && row.players >= row.maxPlayers) return false;
    if (filters.maxPing !== null || filters.hideOffline) {
      const reach = reachability(row.id);
      if (filters.hideOffline && reach?.offline) return false;
      if (filters.maxPing !== null && reach && (reach.pingMs === null || reach.pingMs > filters.maxPing)) return false;
    }
    if (filters.perspective === "first" && !row.firstPersonOnly) return false;
    if (filters.perspective === "third" && row.firstPersonOnly) return false;
    if (filters.timeOfDay !== "any" && (!row.time || isNight(row.time) !== (filters.timeOfDay === "night")))
      return false;
    if (filters.mods === "vanilla" && row.modCount > 0) return false;
    if (filters.mods === "modded" && row.modCount === 0) return false;
    // A required mod no server in the list runs any more matches nothing.
    if (required.some((position) => !row.mods.includes(position))) return false;
    if (filters.noPassword && row.password) return false;
    if (filters.battlEye && !row.battlEye) return false;
    if (terms.length === 0) return true;
    const text = serverText(row);
    return terms.every((term, i) => text.includes(term) || row.mods.some((mod) => modsByTerm[i].has(mod)));
  });
}

/**
 * The mod a search matched a server through, if the server's own name,
 * address and map didn't match. Shown so it's clear why the server is listed.
 */
export function matchedMod(row: ServerRow, search: string, modNames: readonly string[]): string | null {
  const text = serverText(row);
  for (const term of searchTerms(search)) {
    if (text.includes(term)) continue;
    const mod = row.mods.find((position) => modNames[position]?.toLowerCase().includes(term));
    if (mod !== undefined) return modNames[mod];
  }
  return null;
}

/**
 * Sorts a copy of the rows. Servers with no ping result yet always sink to the
 * bottom when sorting by ping, whichever direction is chosen.
 */
export function sortServers(
  rows: ServerRow[],
  sort: Sort,
  pingOf: (id: string) => number | null | undefined,
): ServerRow[] {
  const direction = sort.descending ? -1 : 1;
  const compare = (a: ServerRow, b: ServerRow): number => {
    switch (sort.key) {
      case "name":
        return direction * a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      case "map":
        return direction * mapName(a.map).localeCompare(mapName(b.map));
      case "players":
        return direction * (a.players - b.players);
      case "time":
        return direction * a.time.localeCompare(b.time);
      case "ping": {
        const pa = pingOf(a.id);
        const pb = pingOf(b.id);
        if (pa == null || pb == null) return (pa == null ? 1 : 0) - (pb == null ? 1 : 0);
        return direction * (pa - pb);
      }
    }
  };
  // Ties fall back to player count so busy servers surface first.
  return [...rows].sort((a, b) => compare(a, b) || b.players - a.players);
}

export type Option = { value: string; count: number };

function countBy(rows: ServerRow[], key: (row: ServerRow) => string): Option[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const value = key(row);
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts].map(([value, count]) => ({ value, count }));
}

/** Maps in the list by player-facing name, A to Z. Variants of one map are merged. */
export function mapCounts(rows: ServerRow[]): Option[] {
  return countBy(rows, (row) => (row.map ? mapName(row.map) : "")).sort((a, b) =>
    a.value.localeCompare(b.value, undefined, { sensitivity: "base" }),
  );
}

/** Game versions in the list, newest first. */
export function versionCounts(rows: ServerRow[]): Option[] {
  return countBy(rows, (row) => row.version).sort((a, b) =>
    b.value.localeCompare(a.value, undefined, { numeric: true }),
  );
}

/**
 * A filter that is on, as a chip the player can remove. A label that is a plain string is a value such as a map, mod
 * or version name, shown as it is; descriptors are translated where the chip is shown.
 */
export type FilterChip = {
  key: string;
  label: MessageDescriptor | string;
  prefix?: MessageDescriptor;
  clear: Partial<Filters>;
};

const PERSPECTIVE_LABELS: Record<Exclude<Perspective, "any">, MessageDescriptor> = {
  first: msg`1PP only`,
  third: msg`3PP allowed`,
};

/** The filters that narrow the list, the search aside, in the order the Filters menu shows them. */
export function filterChips(filters: Filters): FilterChip[] {
  const chips: FilterChip[] = [];
  if (filters.map) chips.push({ key: "map", prefix: msg`Map`, label: filters.map, clear: { map: "" } });
  if (filters.version)
    chips.push({ key: "version", prefix: msg`Version`, label: filters.version, clear: { version: "" } });
  if (filters.serverType !== "any")
    chips.push({
      key: "serverType",
      label: filters.serverType === "official" ? msg`Official` : msg`Community`,
      clear: { serverType: "any" },
    });
  if (filters.hasPlayers) chips.push({ key: "hasPlayers", label: msg`Hide empty`, clear: { hasPlayers: false } });
  if (filters.notFull) chips.push({ key: "notFull", label: msg`Hide full`, clear: { notFull: false } });
  if (filters.maxPing !== null) {
    const maxPing = filters.maxPing;
    chips.push({ key: "maxPing", prefix: msg`Ping`, label: msg`under ${maxPing} ms`, clear: { maxPing: null } });
  }
  if (filters.hideOffline) chips.push({ key: "hideOffline", label: msg`Hide offline`, clear: { hideOffline: false } });
  if (filters.perspective !== "any")
    chips.push({ key: "perspective", label: PERSPECTIVE_LABELS[filters.perspective], clear: { perspective: "any" } });
  if (filters.timeOfDay !== "any")
    chips.push({
      key: "timeOfDay",
      prefix: msg`Time`,
      label: filters.timeOfDay === "day" ? msg`Day` : msg`Night`,
      clear: { timeOfDay: "any" },
    });
  if (filters.mods !== "any")
    chips.push({
      key: "mods",
      label: filters.mods === "vanilla" ? msg`Vanilla` : msg`Modded`,
      clear: { mods: "any" },
    });
  for (const name of filters.requiredMods)
    chips.push({
      key: `mod:${name}`,
      prefix: msg`Mod`,
      label: name,
      clear: { requiredMods: filters.requiredMods.filter((other) => other !== name) },
    });
  if (filters.noPassword) chips.push({ key: "noPassword", label: msg`No password`, clear: { noPassword: false } });
  if (filters.battlEye) chips.push({ key: "battlEye", label: msg`BattlEye on`, clear: { battlEye: false } });
  return chips;
}

/** How many filters narrow the list, counting the search. */
export function activeFilterCount(filters: Filters): number {
  return Number(filters.search.trim() !== "") + filterChips(filters).length;
}

/** How many servers run each mod, busiest first. */
export function modCounts(rows: ServerRow[], modNames: readonly string[]): Option[] {
  const counts = new Map<number, number>();
  for (const row of rows) for (const mod of row.mods) counts.set(mod, (counts.get(mod) ?? 0) + 1);
  return [...counts]
    .map(([position, count]) => ({ value: modNames[position], count }))
    .filter((option) => option.value)
    .sort((a, b) => b.count - a.count);
}
