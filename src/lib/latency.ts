/**
 * Estimating latency for servers that don't answer pings.
 *
 * A DayZ server only gets to status requests every 50 ms or so, so each reply waits a random part of that on top of
 * the network delay. The fastest of several replies comes close to the network delay, and the wait still left in it
 * averages the tick divided by one more than the number of replies, which is taken off.
 */

/** How often a DayZ server gets to status requests, in milliseconds. */
export const QUERY_TICK_MS = 50;

/** Replies to collect before an estimate is settled: three requests, each timed twice (challenge and answer). */
export const SETTLED_SAMPLES = 6;

/** Samples from requests further apart than this aren't combined, as the route may have changed in between. */
export const COMBINE_WITHIN_MS = 10 * 60_000;

export type QuerySamples = {
  /** The fastest status reply so far, in milliseconds. */
  fastestMs: number;
  /** How many replies it's the fastest of. */
  samples: number;
};

/** Combines the replies of an earlier request with a new one. */
export function combine(earlier: QuerySamples | undefined, latest: QuerySamples): QuerySamples {
  if (!earlier) return latest;
  return { fastestMs: Math.min(earlier.fastestMs, latest.fastestMs), samples: earlier.samples + latest.samples };
}

/** The latency to show for a server that answered status requests but not pings. */
export function estimateMs({ fastestMs, samples }: QuerySamples): number {
  const leftover = QUERY_TICK_MS / (Math.max(1, samples) + 1);
  return Math.max(1, Math.round(fastestMs - leftover));
}
