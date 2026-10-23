import { describe, expect, it } from "vitest";
import { downloadFraction, formatAgo, formatBytes, joinAddress, joinLink } from "./format";
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

describe("joinLink", () => {
  it("shares the address players join on, not the query port", () => {
    const server = { ip: "1.2.3.4", gamePort: 2302 };
    expect(joinAddress(server)).toBe("1.2.3.4:2302");
    expect(joinLink(server)).toBe("https://flarelauncher.app/join/1.2.3.4:2302");
  });
});

describe("formatAgo", () => {
  const now = 1_800_000_000_000;
  const ago = (seconds: number) => formatAgo(now / 1000 - seconds, now);

  it("picks minutes, hours or days", () => {
    expect(ago(10)).toBe("1 minute ago");
    expect(ago(25 * 60)).toBe("25 minutes ago");
    expect(ago(3 * 3600)).toBe("3 hours ago");
    expect(ago(86400)).toBe("yesterday");
    expect(ago(9 * 86400)).toBe("9 days ago");
  });
});
