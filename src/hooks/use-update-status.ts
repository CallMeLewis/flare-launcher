import { useEffect, useState } from "react";
import { backend } from "@/lib/backend";
import type { UpdateStatus } from "@/lib/types";

// Download progress glides between reports over this long (the `duration-1000` on the ring and bar).
const PROGRESS_GLIDE_MS = 1000;

/** The launcher's own update status, kept current by events from the backend. */
export function useUpdateStatus(): UpdateStatus {
  const [status, setStatus] = useState<UpdateStatus>({ state: "idle" });
  useEffect(() => {
    let current: UpdateStatus = { state: "idle" };
    let finishTimer: number | undefined;
    const show = (next: UpdateStatus) => {
      current = next;
      setStatus(next);
    };
    const receive = (next: UpdateStatus) => {
      window.clearTimeout(finishTimer);
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      // A quick download can finish while the ring is still a quarter full. Let it glide to full before
      // swapping to the install icon instead of jumping there.
      if (next.state === "ready" && current.state === "downloading" && !reduceMotion) {
        show({ ...current, percent: 100 });
        finishTimer = window.setTimeout(() => show(next), PROGRESS_GLIDE_MS + 100);
        return;
      }
      show(next);
    };
    // Listen first, then read the current status: a check that finishes in between would otherwise go unheard
    // and leave the icon spinning. Once an event has arrived it is newer than the status read, so that is dropped.
    let cancelled = false;
    let heard = false;
    let stop: (() => void) | undefined;
    void backend
      .onUpdateStatus((next) => {
        heard = true;
        receive(next);
      })
      .then(async (unlisten) => {
        if (cancelled) return unlisten();
        stop = unlisten;
        const initial = await backend.updateStatus();
        if (!cancelled && !heard) receive(initial);
      });
    return () => {
      cancelled = true;
      window.clearTimeout(finishTimer);
      stop?.();
    };
  }, []);
  return status;
}
