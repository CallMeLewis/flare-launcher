import { useCallback, useRef, useState } from "react";
import { backend, errorMessage } from "@/lib/backend";
import type { ServerRow } from "@/lib/types";

export type LanState = {
  rows: ServerRow[];
  searching: boolean;
  /** Whether a search has finished, so an empty list means nothing was found. */
  searched: boolean;
  search: () => void;
};

/** Servers on the local network, found by a search the player starts by opening the LAN list. */
export function useLan(onSearchFailed: (message: string) => void): LanState {
  const [rows, setRows] = useState<ServerRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const inFlight = useRef(false);

  const search = useCallback(() => {
    if (inFlight.current) return;
    inFlight.current = true;
    setSearching(true);
    backend
      .searchLan()
      .then(setRows)
      .catch((e) => onSearchFailed(errorMessage(e)))
      .finally(() => {
        inFlight.current = false;
        setSearching(false);
        setSearched(true);
      });
  }, [onSearchFailed]);

  return { rows, searching, searched, search };
}
