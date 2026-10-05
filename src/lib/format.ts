import { i18n } from "@lingui/core";
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
