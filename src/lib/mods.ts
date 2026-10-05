import { t } from "@lingui/core/macro";
import type { ModProgress, ServerRow, SubscribedMod } from "./types";

/** Where a subscribed mod stands: on this computer and current, needing a download, or gone from the Workshop. */
export type ModState = "missing" | "outdated" | "removed" | "current";

export function modState(mod: SubscribedMod): ModState {
  if (!mod.installed) return "missing";
  if (mod.updatedAt !== null && mod.latestUpdatedAt !== null && mod.latestUpdatedAt > mod.updatedAt) return "outdated";
  if (mod.removed) return "removed";
  return "current";
}

/** Whether Update all would download the mod. */
export const needsDownload = (mod: SubscribedMod) => {
  const state = modState(mod);
  return state === "missing" || state === "outdated";
};

/** Whether Verify can check the mod: Steam needs a copy on this computer and the mod still on the Workshop. */
export const canVerify = (mod: SubscribedMod) => mod.installed && !mod.removed;

/** A download started from the mods page, with Steam's progress on each mod. */
export type ModJob = { kind: "update" | "verify"; progress: ModProgress[] };

export function modName(mod: SubscribedMod): string {
  if (mod.name !== null) return mod.name;
  const id = mod.id;
  return t`Mod ${id}`;
}

/** How many servers run each mod, by Workshop id. */
export function serverCounts(rows: readonly ServerRow[], modIds: readonly number[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const row of rows) {
    for (const position of row.mods) {
      const id = modIds[position];
      if (id !== undefined) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return counts;
}

export type ModSortKey = "name" | "servers" | "size" | "updated" | "status";
export type ModSort = { key: ModSortKey; descending: boolean };
export const DEFAULT_MOD_SORT: ModSort = { key: "name", descending: false };

// What needs doing first.
const STATE_ORDER: Record<ModState, number> = { missing: 0, outdated: 1, removed: 2, current: 3 };

export function sortMods(
  mods: readonly SubscribedMod[],
  sort: ModSort,
  servers: ReadonlyMap<number, number>,
): SubscribedMod[] {
  const byName = (a: SubscribedMod, b: SubscribedMod) =>
    modName(a).localeCompare(modName(b), undefined, { sensitivity: "base", numeric: true });
  const value = (mod: SubscribedMod): number => {
    switch (sort.key) {
      case "servers":
        return servers.get(mod.id) ?? 0;
      case "size":
        return mod.size ?? 0;
      case "updated":
        return mod.latestUpdatedAt ?? mod.updatedAt ?? 0;
      case "status":
        return STATE_ORDER[modState(mod)];
      default:
        return 0;
    }
  };
  const direction = sort.descending ? -1 : 1;
  return [...mods].sort((a, b) => {
    const order = sort.key === "name" ? byName(a, b) : value(a) - value(b);
    // Ties stay in name order whichever way the column runs.
    return order !== 0 ? order * direction : byName(a, b);
  });
}

/** Mods whose name or Workshop id contains the search. */
export function filterMods(mods: readonly SubscribedMod[], search: string): SubscribedMod[] {
  const term = search.trim().toLowerCase();
  if (!term) return [...mods];
  return mods.filter((mod) => modName(mod).toLowerCase().includes(term) || String(mod.id).includes(term));
}
