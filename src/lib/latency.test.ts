import { describe, expect, it } from "vitest";
import { combine, estimateMs } from "./latency";

describe("estimating latency from status replies", () => {
  it("keeps the fastest reply and counts every sample", () => {
    expect(combine(undefined, { fastestMs: 70, samples: 2 })).toEqual({ fastestMs: 70, samples: 2 });
    expect(combine({ fastestMs: 70, samples: 2 }, { fastestMs: 48, samples: 2 })).toEqual({
      fastestMs: 48,
      samples: 4,
    });
    expect(combine({ fastestMs: 48, samples: 4 }, { fastestMs: 61, samples: 2 })).toEqual({
      fastestMs: 48,
      samples: 6,
    });
  });

  it("takes off the wait expected to be left in the fastest reply", () => {
    // Two replies leave a third of a 50 ms tick on average, six leave a seventh.
    expect(estimateMs({ fastestMs: 70, samples: 2 })).toBe(53);
    expect(estimateMs({ fastestMs: 48, samples: 6 })).toBe(41);
  });

  it("never shows less than 1 ms", () => {
    expect(estimateMs({ fastestMs: 5, samples: 2 })).toBe(1);
  });
});
