/** One build the app ships, such as its Windows installer. */
export interface Build {
  /** The updater's key for it, such as "windows-x86_64". */
  platform: string;
  /** Where Tauri may have built it, the first one found being used. */
  paths: (product: string, version: string) => string[];
  /** Its name on the GitHub release, such as "Flare-Navgen-Setup-1.2.0.exe". */
  uploadName: (version: string) => string;
  /** How to build it, for the message when it hasn't been. */
  buildWith: string;
}

export interface ReleaseConfig {
  /** The app's name as shown, such as "Flare Navgen", for messages and the GitHub release's title. */
  name: string;
  /** The folder with the app's package.json, src-tauri and node_modules. */
  app: string;
  /** The git repository's root, with CHANGELOG.md and .github/workflows/ci.yml. */
  root: string;
  /** The GitHub repository, such as "CallMeLewis/flare-navgen". GITHUB_REPOSITORY overrides it in CI. */
  repo: string;
  /** The app's folder on the update feed, such as "flare-navgen": its channel files are at updates.darkzone.dev/<feed>/. */
  feed: string;
  /** Where the update signing key is kept on this computer. In CI it comes from TAURI_SIGNING_PRIVATE_KEY instead. */
  keyPath: string;
  /** Every build a release carries. */
  builds: Build[];
  /** How the app runs this script, such as "node scripts/release.ts", for its messages. */
  script: string;
  /** The GitHub environment the Release workflow keeps the signing key in, if it uses one. */
  secretEnvironment?: string;
}

/**
 * Runs one of the release commands (release, publish, feed, check or keygen) from the command line, and exits with an
 * error message if it fails.
 */
export function release(config: ReleaseConfig, argv?: string[]): Promise<void>;
