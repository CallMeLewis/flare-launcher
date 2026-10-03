import { describe, expect, it } from "vitest";
import { downloadFraction, formatBytes } from "./format";
import type { ModProgress } from "./types";

describe("formatBytes", () => {
  it("picks a readable unit", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(900)).toBe("900 B");
    expect(formatBytes(1536)).toBe("2 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatBytes(1.4 * 1024 ** 3)).toBe("1.4 GB");
  });
});

describe("downloadFraction", () => {
  const mod = (status: ModProgress["status"], downloaded = 0, total = 0): ModProgress => ({
    id: 1,
    status,
    downloaded,
    total,
  });

  it("weights every mod equally", () => {
    expect(downloadFraction([mod("installed"), mod("downloading", 50, 100), mod("queued")])).toBeCloseTo(0.5);
  });

  it("handles mods whose size is not known yet", () => {
    expect(downloadFraction([mod("downloading"), mod("queued")])).toBe(0);
    expect(downloadFraction([])).toBe(0);
  });

  it("is complete once every mod is installed", () => {
    expect(downloadFraction([mod("installed"), mod("installed", 10, 10)])).toBe(1);
  });
});
