import { describe, expect, it } from "vitest";
import { canVerify, filterMods, modName, modState, serverCounts, sortMods } from "./mods";
import type { ServerRow, SubscribedMod } from "./types";

const mod = (patch: Partial<SubscribedMod>): SubscribedMod => ({
  id: 1,
  name: "CF",
  installed: true,
  size: 100,
  updatedAt: 1000,
  latestUpdatedAt: 1000,
  removed: false,
  ...patch,
});

describe("modState", () => {
  it("needs a download when Steam hasn't put it on this computer", () => {
    expect(modState(mod({ installed: false, updatedAt: null }))).toBe("missing");
  });

  it("is out of date once the Workshop has a newer copy", () => {
    expect(modState(mod({ latestUpdatedAt: 2000 }))).toBe("outdated");
    expect(modState(mod({ latestUpdatedAt: 1000 }))).toBe("current");
  });

  it("counts as current when the Workshop couldn't be reached", () => {
    expect(modState(mod({ latestUpdatedAt: null }))).toBe("current");
  });

  it("notes a mod the Workshop no longer has", () => {
    expect(modState(mod({ latestUpdatedAt: null, removed: true }))).toBe("removed");
  });
});

describe("canVerify", () => {
  it("checks mods on this computer that the Workshop still has", () => {
    expect(canVerify(mod({}))).toBe(true);
    expect(canVerify(mod({ latestUpdatedAt: 2000 }))).toBe(true);
    expect(canVerify(mod({ installed: false, updatedAt: null }))).toBe(false);
    expect(canVerify(mod({ latestUpdatedAt: null, removed: true }))).toBe(false);
  });
});

describe("modName", () => {
  it("falls back to the Workshop id", () => {
    expect(modName(mod({ name: null, id: 42 }))).toBe("Mod 42");
  });
});

describe("serverCounts", () => {
  it("counts the servers running each mod", () => {
    const row = (mods: number[]) => ({ mods }) as ServerRow;
    const counts = serverCounts([row([0, 1]), row([1]), row([])], [111, 222]);
    expect(counts.get(111)).toBe(1);
    expect(counts.get(222)).toBe(2);
    expect(counts.get(333)).toBeUndefined();
  });
});

describe("sortMods", () => {
  const mods = [
    mod({ id: 1, name: "b", size: 5 }),
    mod({ id: 2, name: "A", size: 50, latestUpdatedAt: 2000 }),
    mod({ id: 3, name: "c", size: 5, installed: false }),
  ];
  const names = (sorted: SubscribedMod[]) => sorted.map((m) => m.name);

  it("sorts names without regard to case", () => {
    expect(names(sortMods(mods, { key: "name", descending: false }, new Map()))).toEqual(["A", "b", "c"]);
  });

  it("keeps ties in name order", () => {
    expect(names(sortMods(mods, { key: "size", descending: true }, new Map()))).toEqual(["A", "b", "c"]);
  });

  it("puts what needs doing first when sorting by status", () => {
    expect(names(sortMods(mods, { key: "status", descending: false }, new Map()))).toEqual(["c", "A", "b"]);
  });

  it("sorts by how many servers run the mod", () => {
    const counts = new Map([[3, 10]]);
    expect(names(sortMods(mods, { key: "servers", descending: true }, counts))).toEqual(["c", "A", "b"]);
  });
});

describe("filterMods", () => {
  it("finds mods by name or Workshop id", () => {
    const mods = [mod({ id: 1559212036, name: "Community Framework" }), mod({ id: 7, name: "Code Lock" })];
    expect(filterMods(mods, "framework")).toHaveLength(1);
    expect(filterMods(mods, "15592")).toHaveLength(1);
    expect(filterMods(mods, " ")).toHaveLength(2);
  });
});
