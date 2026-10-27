import { i18n } from "@lingui/core";
import { t } from "@lingui/core/macro";
import type { ModProgress, ServerRow } from "./types";

/** The address players join a server on, its game port rather than the query port in its id: `1.2.3.4:2302`. */
export function joinAddress(server: Pick<ServerRow, "ip" | "gamePort">): string {
  return `${server.ip}:${server.gamePort}`;
}

/**
 * A link to share a server by. It opens a page that opens the launcher on the server, or offers the launcher to
 * download, as links to the launcher's own scheme can't be clicked in most chat apps.
 */
export function joinLink(server: Pick<ServerRow, "ip" | "gamePort">): string {
  return `https://flarelauncher.app/join/${joinAddress(server)}`;
}

const UNITS = ["B", "KB", "MB", "GB", "TB"];

/** Formats a byte count the way Steam does, e.g. `1.4 GB`, with the interface language's decimal mark. */
export function formatBytes(bytes: number): string {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const decimals = unit < 2 ? 0 : 1;
  const number = i18n.number(value, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: false,
  });
  return `${number} ${UNITS[unit]}`;
}

/**
 * Overall progress of a set of mod downloads, from 0 to 1, for when their sizes
 * aren't all known. Each mod counts equally because Steam only reports a mod's
 * size once it starts downloading.
 */
export function downloadFraction(progress: ModProgress[]): number {
  if (progress.length === 0) return 0;
  const sum = progress.reduce((acc, p) => {
    if (p.status === "installed") return acc + 1;
    return acc + (p.total > 0 ? Math.min(p.downloaded / p.total, 1) : 0);
  }, 0);
  return sum / progress.length;
}

/**
 * The sizes known for a set of mods, with Steam's for each it has started on. Steam's is exact, and for an update
 * it's only what changed, so it's kept once the mod finishes and Steam stops reporting it.
 */
export function withReportedSizes(sizes: Record<number, number>, progress: ModProgress[]): Record<number, number> {
  const reported = progress.filter((p) => p.total > 0 && sizes[p.id] !== p.total);
  if (reported.length === 0) return sizes;
  return { ...sizes, ...Object.fromEntries(reported.map((p) => [p.id, p.total])) };
}

/** Bytes downloaded so far and in all across a set of mod downloads, or `null` while any mod's size is unknown. */
export function downloadBytes(
  progress: ModProgress[],
  sizes: Record<number, number>,
): { downloaded: number; total: number } | null {
  let downloaded = 0;
  let total = 0;
  for (const p of progress) {
    const size = p.total > 0 ? p.total : sizes[p.id];
    if (size === undefined) return null;
    total += size;
    if (p.status === "installed") downloaded += size;
    else if (p.status === "downloading") downloaded += Math.min(p.downloaded, size);
  }
  return total > 0 ? { downloaded, total } : null;
}

/** A wait in whole minutes, as `40 min` or `1 h 20 min`. */
/** How long ago a time was, such as "3 hours ago", in the interface language. `seconds` is since 1970. */
export function formatAgo(seconds: number, now = Date.now()): string {
  const elapsed = Math.max(0, now / 1000 - seconds);
  const format = new Intl.RelativeTimeFormat(i18n.locale, { numeric: "auto" });
  if (elapsed < 3600) return format.format(-Math.max(1, Math.round(elapsed / 60)), "minute");
  if (elapsed < 86400) return format.format(-Math.round(elapsed / 3600), "hour");
  return format.format(-Math.round(elapsed / 86400), "day");
}

export function formatMinutes(minutes: number): string {
  if (minutes < 1) return t`under 1 min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return t`${rest} min`;
  if (rest === 0) return t`${hours} h`;
  return t`${hours} h ${rest} min`;
}
