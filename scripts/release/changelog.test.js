// What decides the update feed: which version is newer, which can be released, and what the notes are.
import assert from "node:assert/strict";
import { test } from "vitest";
import { compareVersions, notesFor, parseChangelog, versionProblem } from "./changelog.js";

test("orders versions as the updater does", () => {
  const ordered = ["1.2.0-beta", "1.2.0-beta.1", "1.2.0-beta.2", "1.2.0-beta.10", "1.2.0", "1.2.1", "1.10.0", "2.0.0"];
  for (let i = 0; i < ordered.length - 1; i++) {
    assert.equal(compareVersions(ordered[i], ordered[i + 1]), -1, `${ordered[i]} < ${ordered[i + 1]}`);
    assert.equal(compareVersions(ordered[i + 1], ordered[i]), 1, `${ordered[i + 1]} > ${ordered[i]}`);
  }
  assert.equal(compareVersions("1.2.0", "1.2.0"), 0);
});

test("releases stable versions and betas only", () => {
  for (const version of ["0.1.1", "1.2.0", "10.0.12", "1.2.0-beta", "1.2.0-beta.1"]) {
    assert.equal(versionProblem(version, "Flare Navgen"), null, version);
  }
  for (const version of ["1.2", "1.2.0-rc.1", "1.2.0-beta.01", "01.2.0", "v1.2.0"]) {
    assert.match(versionProblem(version, "Flare Navgen") ?? "", /Flare Navgen can be released as/, version);
  }
});

test("reads each version's notes, with either line ending", () => {
  const text = [
    "# Changelog",
    "",
    "Intro text, ignored.",
    "",
    "## 1.2.0 - 2026-11-14",
    "",
    "- New thing.",
    "- Fixed thing.",
    "-not a bullet",
    "",
    "## 1.2.0-beta.1",
    "- Beta thing.",
  ].join("\r\n");
  assert.deepEqual(parseChangelog(text), [
    { version: "1.2.0", date: "2026-11-14", items: ["New thing.", "Fixed thing."] },
    { version: "1.2.0-beta.1", date: null, items: ["Beta thing."] },
  ]);
  assert.deepEqual(notesFor(text.replaceAll("\r\n", "\n"), "1.2.0-beta.1"), ["Beta thing."]);
  assert.equal(notesFor(text, "1.3.0"), null);
});

test("refuses a mistyped heading rather than adding its notes to the version above", () => {
  for (const heading of ["## 1.1.0 – 2026-01-01", "## 1.1.0 - 2026-01-01 (hotfix)", "## Unreleased"]) {
    assert.throws(
      () => parseChangelog(`## 1.2.0 - 2026-11-14\n- New.\n\n${heading}\n- Old.\n`),
      /isn't a version heading/,
    );
  }
});
