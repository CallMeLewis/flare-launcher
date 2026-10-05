import { readdirSync, readFileSync } from "node:fs";
import { i18n } from "@lingui/core";
import { describe, expect, it } from "vitest";
import { BACKEND_MESSAGES, backendText } from "./backend-messages";

const RUST_DIR = new URL("../../src-tauri/src/", import.meta.url);

/** Rust source without comments or `#[cfg(test)]` items, whose `text!` calls never reach the player. */
function withoutTests(source: string): string {
  const code = source.replace(/^\s*\/\/.*$/gm, "");
  let kept = "";
  let from = 0;
  for (const match of code.matchAll(/#\[cfg\((?:test|all\(test[^\]]*\))\)\]/g)) {
    if (match.index < from) continue;
    kept += code.slice(from, match.index);
    let depth = 0;
    for (let i = code.indexOf("{", match.index); i < code.length; i++) {
      depth += code[i] === "{" ? 1 : code[i] === "}" ? -1 : 0;
      if (depth === 0) {
        from = i + 1;
        break;
      }
    }
  }
  return kept + code.slice(from);
}

function rustTemplates(): string[] {
  const templates = readdirSync(RUST_DIR)
    .filter((file) => file.endsWith(".rs"))
    .flatMap((file) => {
      const source = withoutTests(readFileSync(new URL(file, RUST_DIR), "utf8"));
      return [...source.matchAll(/text!\(\s*"((?:[^"\\]|\\.)*)"/g)].map((match) => match[1].replace(/\\"/g, '"'));
    });
  return [...new Set(templates)].sort();
}

describe("backend messages", () => {
  it("lists every message the backend sends for translation, and no others", () => {
    const listed = [...new Set(BACKEND_MESSAGES.map((message) => message.message))].sort();
    expect(listed).toEqual(rustTemplates());
  });

  it("fills in a message's values", () => {
    expect(
      backendText({ message: "Couldn't find {host}. Check the address and try again.", values: { host: "x" } }),
    ).toBe("Couldn't find x. Check the address and try again.");
    expect(
      backendText({
        message: "{missing, plural, one {# required mod is} other {# required mods are}} not installed yet.",
        values: { missing: 2 },
      }),
    ).toBe("2 required mods are not installed yet.");
    expect(i18n.locale).toBe("en-GB");
  });
});
