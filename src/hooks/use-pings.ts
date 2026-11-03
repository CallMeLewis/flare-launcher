import { useCallback, useRef, useState } from "react";
import { backend } from "@/lib/backend";
import { COMBINE_WITHIN_MS, combine, estimateMs, type QuerySamples, SETTLED_SAMPLES } from "@/lib/latency";

export type PingResult = {
  /** `null` when the server did not answer. */
  pingMs: number | null;
  /** True when `pingMs` is estimated from status replies because the server doesn't answer pings. */
  estimated: boolean;
  /** The status replies behind an estimate, combined over the last few requests. */
  query?: QuerySamples;
  players: number | null;
  maxPlayers: number | null;
  /** Players waiting to join, or `null` when the server didn't answer or doesn't say. */
  queue: number | null;
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
  /** Changes shortly after new results arrive, for use as a memo dependency. */
  version: number;
};

const CHUNK_SIZE = 12;
const MAX_CHUNKS_IN_FLIGHT = 8;
const STALE_AFTER_MS = 60_000;
// A single unanswered request can be a lost packet, so a server is asked again soon before it counts as offline.
const RETRY_AFTER_MS = 3_000;
// A server that only answers status requests is asked again this soon, a few times, to sharpen its estimate. The
// requests land at unrelated points in the server's query cycle, which is what makes the fastest reply useful.
const REFINE_AFTER_MS = 1_200;
// New results are announced at most this often, as filtering and sorting by ping redo the whole list each time.
const ANNOUNCE_EVERY_MS = 250;

export function usePings(): Pings {
  const results = useRef(new Map<string, PingResult>());
  const queue = useRef<string[]>([]);
  const queued = useRef(new Set<string>());
  const chunksInFlight = useRef(0);
  const [version, setVersion] = useState(0);
  const announcing = useRef(false);
  const announce = useRef(() => {
    if (announcing.current) return;
    announcing.current = true;
    setTimeout(() => {
      announcing.current = false;
      setVersion((v) => v + 1);
    }, ANNOUNCE_EVERY_MS);
  });

  // Whether any server has answered a status request, so a network that blocks them doesn't mark every server offline.
  const anyAnswered = useRef(false);

  const pump = useCallback(function pump() {
    while (chunksInFlight.current < MAX_CHUNKS_IN_FLIGHT && queue.current.length > 0) {
      const chunk = queue.current.splice(0, CHUNK_SIZE);
      chunksInFlight.current += 1;
      backend
        .pingServers(chunk)
        .then((pings) => {
          const at = Date.now();
          const retry: string[] = [];
          const refine: string[] = [];
          for (const { id, samples, cached, ...ping } of pings) {
            const answered = ping.players !== null;
            if (answered) anyAnswered.current = true;
            const earlier = results.current.get(id);
            const misses = answered ? 0 : (earlier?.misses ?? 0) + 1;
            if (misses === 1) retry.push(id);
            let shown: Pick<PingResult, "pingMs" | "query"> = { pingMs: ping.pingMs };
            // A copy answered by DDoS protection replies at once, so there's nothing to refine.
            if (ping.estimated && !cached && ping.pingMs !== null) {
              const recent = earlier?.query && at - earlier.at < COMBINE_WITHIN_MS ? earlier.query : undefined;
              const query = combine(recent, { fastestMs: ping.pingMs, samples });
              shown = { pingMs: estimateMs(query), query };
              if (query.samples < SETTLED_SAMPLES) refine.push(id);
            }
            results.current.set(id, { ...ping, ...shown, misses, offline: misses >= 2 && anyAnswered.current, at });
          }
          if (pings.length > 0) announce.current();
          if (retry.length > 0) setTimeout(() => enqueue.current(retry, true), RETRY_AFTER_MS);
          if (refine.length > 0) setTimeout(() => enqueue.current(refine, true), REFINE_AFTER_MS);
        })
        .catch(() => {})
        .finally(() => {
          for (const id of chunk) queued.current.delete(id);
          chunksInFlight.current -= 1;
          pump();
        });
    }
  }, []);

  const enqueue = useRef((ids: string[], urgent: boolean) => {
    const wanted = ids.filter((id) => !queued.current.has(id));
    if (wanted.length === 0) return;
    for (const id of wanted) queued.current.add(id);
    queue.current = urgent ? [...wanted, ...queue.current] : [...queue.current, ...wanted];
    pump();
  });

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
