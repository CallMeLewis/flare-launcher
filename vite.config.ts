/// <reference types="vitest/config" />
import { defineConfig, searchForWorkspaceRoot } from "vite";
import react from "@vitejs/plugin-react";
import { lingui } from "@lingui/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { notesFor } from "@flare/release/changelog";

const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
// Only the running version's notes go into the app, for Settings > About. The full history stays in CHANGELOG.md.
const notes = notesFor(readFileSync(new URL("./CHANGELOG.md", import.meta.url), "utf8"), version) ?? [];
export default defineConfig({
  base: "./",
  clearScreen: false,
  define: { __APP_VERSION__: JSON.stringify(version), __APP_RELEASE_NOTES__: JSON.stringify(notes) },
  // Flags stay separate files, so only the ones on screen load, rather than all of them inside the app's code.
  build: { assetsInlineLimit: (file) => (file.includes("country-flag-icons") ? false : undefined) },
  plugins: [react(), lingui({ macroTransform: true, failOnCompileError: true }), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    // The shared interface (@flare/ui) uses this app's copies of these, as it's linked from the flare-common checkout
    // beside this repo, which has its own.
    dedupe: ["react", "react-dom", "radix-ui", "lucide-react", "cn", "class-variance-authority", "@tauri-apps/api"],
  },
  server: {
    watch: { ignored: ["**/src-tauri/**"] },
    // The flare-common checkout serves the shared interface's fonts from its own node_modules.
    fs: { allow: [searchForWorkspaceRoot(process.cwd()), fileURLToPath(new URL("../flare-common", import.meta.url))] },
  },
  test: { setupFiles: ["src/test-setup.ts"] },
});
