import { defineConfig } from "@lingui/cli";
import { formatter } from "@lingui/format-po";

// British English is what the interface is written in. Other languages fall back to it for anything not translated,
// so the American catalogue only needs the strings spelled differently.
export default defineConfig({
  sourceLocale: "en-GB",
  locales: ["en-GB", "en-US", "fr", "de"],
  fallbackLocales: { default: "en-GB" },
  catalogs: [{ path: "<rootDir>/src/locales/{locale}", include: ["src"], exclude: ["**/*.test.ts"] }],
  // Files without line numbers, so moving code doesn't change every catalogue.
  format: formatter({ lineNumbers: false }),
});
