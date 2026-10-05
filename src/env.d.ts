/** The launcher version from package.json, which tauri.conf.json also uses. */
declare const __APP_VERSION__: string;
/** The running version's notes from CHANGELOG.md, added at build time. */
declare const __APP_RELEASE_NOTES__: string[];

/** A language's catalogue, compiled when imported by the Lingui Vite plugin. */
declare module "*.po" {
  import type { Messages } from "@lingui/core";
  export const messages: Messages;
}
