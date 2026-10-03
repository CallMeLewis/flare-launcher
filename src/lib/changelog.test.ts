import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compareVersions, notesFor, parseChangelog } from "../../scripts/changelog.mjs";

const changelog = `# Changelog

Some introduction.

## 1.2.0-beta.1 - 2026-11-01

- New thing.
  not a bullet, ignored
-
- Fixed thing.

## 1.1.0

- Older thing.
`;

describe("parseChangelog", () => {
  it("reads each version's heading, date and bullets, newest first", () => {
    expect(parseChangelog(changelog)).toEqual([
      { version: "1.2.0-beta.1", date: "2026-11-01", items: ["New thing.", "Fixed thing."] },
      { version: "1.1.0", date: null, items: ["Older thing."] },
    ]);
  });

  it("ignores bullets before the first version", () => {
    expect(parseChangelog("- stray\n## 1.0.0\n- kept")).toEqual([{ version: "1.0.0", date: null, items: ["kept"] }]);
  });
});

describe("notesFor", () => {
  it("returns one version's notes, or null when it has no section", () => {
    expect(notesFor(changelog, "1.1.0")).toEqual(["Older thing."]);
    expect(notesFor(changelog, "9.9.9")).toBeNull();
  });

  it("finds the running version in the real CHANGELOG.md", () => {
    const { version } = JSON.parse(readFileSync("package.json", "utf8"));
    expect(notesFor(readFileSync("CHANGELOG.md", "utf8"), version)?.length).toBeGreaterThan(0);
    expect(__APP_RELEASE_NOTES__).toEqual(notesFor(readFileSync("CHANGELOG.md", "utf8"), version));
  });
});

describe("compareVersions", () => {
  it("orders betas before their release, and numbers numerically", () => {
    const sorted = ["1.2.0", "1.2.0-beta.10", "1.10.0", "1.2.0-beta.2", "1.1.0"].sort(compareVersions);
    expect(sorted).toEqual(["1.1.0", "1.2.0-beta.2", "1.2.0-beta.10", "1.2.0", "1.10.0"]);
  });
});
