import { describe, expect, it } from "vitest";
import { sameKind } from "./use-stored-state";

describe("sameKind", () => {
  it("accepts a value of the fallback's kind", () => {
    expect(sameKind(["1.2.3.4:2303"], [])).toBe(true);
    expect(sameKind({ key: "ping" }, { key: "players" })).toBe(true);
    expect(sameKind(true, false)).toBe(true);
  });

  it("turns down a damaged value", () => {
    expect(sameKind(null, [])).toBe(false);
    expect(sameKind({}, [])).toBe(false);
    expect(sameKind(null, { key: "players" })).toBe(false);
    expect(sameKind([], {})).toBe(false);
    expect(sameKind("yes", false)).toBe(false);
  });
});
