import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { notesFor } from "./scripts/changelog.ts";

const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
// Only the running version's notes go into the app, for Settings > About. The full history stays in CHANGELOG.md.
const notes = notesFor(readFileSync(new URL("./CHANGELOG.md", import.meta.url), "utf8"), version) ?? [];
export default defineConfig({
  base: "./",
  clearScreen: false,
  define: { __APP_VERSION__: JSON.stringify(version), __APP_RELEASE_NOTES__: JSON.stringify(notes) },
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: { watch: { ignored: ["**/src-tauri/**"] } },
});
