import { useCallback, useRef, useState } from "react";
import { backend } from "@/lib/backend";

export type PingResult = {
  /** `null` when the server did not answer. */
  pingMs: number | null;
  /** True when `pingMs` is the query response time, which reads higher than a real ping. */
  estimated: boolean;
  players: number | null;
  maxPlayers: number | null;
  /** Status requests in a row the server hasn't answered. */
  misses: number;
  /** True once the server has missed two status requests in a row while other servers answer. */
  offline: boolean;
  at: number;
};

export type Pings = {
  get: (id: string) => PingResult | undefined;
  /** Queues servers to be pinged. `urgent` jumps the queue, for rows on screen. */
  request: (ids: string[], urgent?: boolean) => void;
  /** Changes whenever new results arrive, for use as a memo dependency. */
  version: number;
};

const CHUNK_SIZE = 12;
const MAX_CHUNKS_IN_FLIGHT = 8;
const STALE_AFTER_MS = 60_000;
// A single unanswered request can be a lost packet, so a server is asked again soon before it counts as offline.
const RETRY_AFTER_MS = 3_000;

export function usePings(): Pings {
  const results = useRef(new Map<string, PingResult>());
  const queue = useRef<string[]>([]);
  const queued = useRef(new Set<string>());
  const chunksInFlight = useRef(0);
  const [version, setVersion] = useState(0);

  // Whether any server has answered a status request, so a network that blocks them doesn't mark every server offline.
  const anyAnswered = useRef(false);

  const enqueue = useRef((ids: string[], urgent: boolean) => {
    const wanted = ids.filter((id) => !queued.current.has(id));
    if (wanted.length === 0) return;
    for (const id of wanted) queued.current.add(id);
    queue.current = urgent ? [...wanted, ...queue.current] : [...queue.current, ...wanted];
    pump();
  });

  const pump = useCallback(() => {
    while (chunksInFlight.current < MAX_CHUNKS_IN_FLIGHT && queue.current.length > 0) {
      const chunk = queue.current.splice(0, CHUNK_SIZE);
      chunksInFlight.current += 1;
      backend
        .pingServers(chunk)
        .then((pings) => {
          const at = Date.now();
          const retry: string[] = [];
          for (const { id, ...ping } of pings) {
            const answered = ping.players !== null;
            if (answered) anyAnswered.current = true;
            const misses = answered ? 0 : (results.current.get(id)?.misses ?? 0) + 1;
            if (misses === 1) retry.push(id);
            results.current.set(id, { ...ping, misses, offline: misses >= 2 && anyAnswered.current, at });
          }
          if (pings.length > 0) setVersion((v) => v + 1);
          if (retry.length > 0) setTimeout(() => enqueue.current(retry, true), RETRY_AFTER_MS);
        })
        .catch(() => {})
        .finally(() => {
          for (const id of chunk) queued.current.delete(id);
          chunksInFlight.current -= 1;
          pump();
        });
    }
  }, []);

  const request = useCallback((ids: string[], urgent = false) => {
    const now = Date.now();
    enqueue.current(
      ids.filter((id) => {
        const last = results.current.get(id);
        return !last || now - last.at > STALE_AFTER_MS;
      }),
      urgent,
    );
  }, []);

  const get = useCallback((id: string) => results.current.get(id), []);

  return { get, request, version };
}
