import { useCallback, useEffect, useRef, useState } from "react";
import { backend, errorMessage } from "@/lib/backend";
import type { ServerList, ServerRow } from "@/lib/types";

export type ServersState = {
  rows: ServerRow[];
  /** Names that `ServerRow.mods` point into. */
  modNames: string[];
  /** Workshop ids that `ServerRow.mods` point into. */
  modIds: number[];
  /** `loading` and `error` only describe the first load; later failures keep the old list. */
  status: "loading" | "ready" | "error";
  error: string;
  refreshing: boolean;
  refresh: () => Promise<void>;
};

export function useServers(onRefreshFailed: (message: string) => void): ServersState {
  const [list, setList] = useState<ServerList>({ servers: [], modNames: [], modIds: [] });
  const [status, setStatus] = useState<ServersState["status"]>("loading");
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const inFlight = useRef<Promise<void> | null>(null);
  const loaded = useRef(false);

  const refresh = useCallback(() => {
    // Coalesce overlapping calls: the list is a ~17 MB download.
    inFlight.current ??= (async () => {
      setRefreshing(true);
      try {
        setList(await backend.fetchServers());
        loaded.current = true;
        setStatus("ready");
      } catch (e) {
        const message = errorMessage(e);
        if (loaded.current) {
          onRefreshFailed(message);
        } else {
          setError(message);
          setStatus("error");
        }
      } finally {
        setRefreshing(false);
        inFlight.current = null;
      }
    })();
    return inFlight.current;
  }, [onRefreshFailed]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { rows: list.servers, modNames: list.modNames, modIds: list.modIds, status, error, refreshing, refresh };
}
