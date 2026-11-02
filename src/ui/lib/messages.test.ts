import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { MESSAGES } from "./messages";

function sources(dir: string, extensions: string[]): string[] {
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((file) => extensions.some((extension) => file.endsWith(extension)) && !file.includes(".test."))
    .map((file) => readFileSync(join(dir, file), "utf8"));
}

function literals(texts: string[], call: RegExp): string[] {
  return texts.flatMap((text) => [...text.matchAll(call)].map((match) => JSON.parse(`"${match[1]}"`) as string));
}

test("lists every message the components and the updater use", () => {
  const src = join(import.meta.dirname, "..");
  const crate = join(import.meta.dirname, "../../../src-tauri/crates/tauri-plugin-flare-updater/src");
  const components = literals(sources(src, [".ts", ".tsx"]), /\bt\(\s*"((?:[^"\\]|\\.)*)"/g);
  // The crate's tests make up their own text.
  const crateCode = sources(crate, [".rs"]).map((text) => text.split("#[cfg(test)]")[0]);
  const updater = literals(crateCode, /Text::new\("((?:[^"\\]|\\.)*)"/g);
  expect([...MESSAGES].sort()).toEqual([...new Set([...components, ...updater])].sort());
});
