import { useCallback, useEffect, useRef, useState } from "react";
import { backend, errorMessage } from "@/lib/backend";
import type { Install, SubscribedMod } from "@/lib/types";

export type SubscribedModsState = {
  /** `null` when DayZ isn't found, so there's no Workshop folder to read. */
  mods: SubscribedMod[] | null;
  /** `loading` and `error` only describe the first load; later failures keep the old list. */
  status: "loading" | "ready" | "error";
  error: string;
  refreshing: boolean;
  refresh: () => Promise<void>;
};

/**
 * The mods the player is subscribed to, read once DayZ has been looked for and again whenever its folder changes.
 * `install` is `undefined` while DayZ is still being looked for.
 */
export function useSubscribedMods(
  install: Install | null | undefined,
  dayzDir: string,
  onRefreshFailed: (message: string) => void,
): SubscribedModsState {
  const [mods, setMods] = useState<SubscribedMod[] | null>(null);
  const [status, setStatus] = useState<SubscribedModsState["status"]>("loading");
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const loaded = useRef(false);
  // Only the latest request counts, so an answer for a folder chosen earlier can't overwrite a newer one.
  const latest = useRef(0);

  const refresh = useCallback(async () => {
    const request = ++latest.current;
    setRefreshing(true);
    try {
      const found = await backend.subscribedMods(dayzDir);
      if (request !== latest.current) return;
      setMods(found);
      loaded.current = true;
      setStatus("ready");
    } catch (e) {
      if (request !== latest.current) return;
      const message = errorMessage(e);
      if (loaded.current) {
        onRefreshFailed(message);
      } else {
        setError(message);
        setStatus("error");
      }
    } finally {
      if (request === latest.current) setRefreshing(false);
    }
  }, [dayzDir, onRefreshFailed]);

  useEffect(() => {
    if (install !== undefined) void refresh();
  }, [install, refresh]);

  return { mods, status, error, refreshing, refresh };
}
