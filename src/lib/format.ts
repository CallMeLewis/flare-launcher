import { i18n } from "@lingui/core";
import { t } from "@lingui/core/macro";
import type { ModProgress } from "./types";

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
 * Overall progress of a set of mod downloads, from 0 to 1. Each mod counts
 * equally because Steam only reports a mod's size once it starts downloading.
 */
export function downloadFraction(progress: ModProgress[]): number {
  if (progress.length === 0) return 0;
  const sum = progress.reduce((acc, p) => {
    if (p.status === "installed") return acc + 1;
    return acc + (p.total > 0 ? Math.min(p.downloaded / p.total, 1) : 0);
  }, 0);
  return sum / progress.length;
}

/** A wait in whole minutes, as `40 min` or `1 h 20 min`. */
export function formatMinutes(minutes: number): string {
  if (minutes < 1) return t`under 1 min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return t`${rest} min`;
  if (rest === 0) return t`${hours} h`;
  return t`${hours} h ${rest} min`;
}
