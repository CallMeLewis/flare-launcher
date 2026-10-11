import { useSyncExternalStore } from "react";
import { t } from "@lingui/core/macro";
import type { ExternalToast } from "sonner";
import type { Problem } from "./types";

/** A failure the player asked to report: what they were doing, and what the failed command rejected with. */
export type ReportRequest = { problem: Problem; error: unknown };

let request: ReportRequest | null = null;
const listeners = new Set<() => void>();

function set(next: ReportRequest | null) {
  request = next;
  listeners.forEach((listener) => listener());
}

/** Opens the report dialog for a failure. Kept outside React so a notification can open it from anywhere. */
export const openReport = (problem: Problem, error: unknown = null) => set({ problem, error });

export const closeReport = () => set(null);

/** The failure the report dialog is open for, if any. */
export function useReportRequest(): ReportRequest | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => request,
  );
}

/** Options for a failure notification that offers to report it. It stays up longer, to leave time to choose. */
export const reportable = (problem: Problem, error: unknown, description?: string): ExternalToast => ({
  description,
  duration: 10_000,
  action: { label: t`Send report`, onClick: () => openReport(problem, error) },
});
