import { MESSAGES } from "@flare/ui";
import { describe, expect, it } from "vitest";
import { SHARED_MESSAGES } from "./shared-messages";

describe("shared messages", () => {
  it("lists every message the shared interface and updater use, for translation", () => {
    const listed = [...new Set(SHARED_MESSAGES.map((message) => message.message))].sort();
    expect(listed).toEqual([...MESSAGES].sort());
  });
});
