import { describe, expect, it } from "vitest";
import { launchArgs } from "./launch-options";
import type { Settings } from "./types";

const base: Settings = {
  profileName: "",
  dayzDir: "",
  extraArgs: "",
  uiScale: 1,
  theme: "system",
  skipIntro: false,
  noSplash: false,
  noPause: false,
  windowed: false,
  afterLaunch: "keep",
};

describe("launchArgs", () => {
  it("adds nothing when every option is off", () => {
    expect(launchArgs(base)).toBe("");
  });

  it("adds the flag for each option that is on, in a stable order", () => {
    expect(launchArgs({ ...base, windowed: true, skipIntro: true })).toBe("-skipIntro -window");
  });

  it("puts extra parameters last, trimmed", () => {
    expect(launchArgs({ ...base, noSplash: true, extraArgs: "  -cpuCount=8 -exThreads=7 " })).toBe(
      "-nosplash -cpuCount=8 -exThreads=7",
    );
  });
});
