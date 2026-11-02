// The app's own updates, as tauri-plugin-flare-updater (crates/tauri-plugin-flare-updater) reports them.

/** Text from the updater: its English template and values, for the app to translate or fill in. */
export interface UpdaterText {
  message: string;
  values: Record<string, string | number>;
}

export type UpdateStatus =
  /** Builds that can't update themselves: development builds without a test feed, and the browser preview. */
  | { state: "unsupported" }
  | { state: "idle" }
  | { state: "checking" }
  | { state: "upToDate"; checkedAt: number }
  // notes: the new version's release notes from the update feed, as plain text ("- " bullet lines).
  | { state: "available"; version: string; releaseDate: string | null; notes: string | null }
  | { state: "downloading"; version: string; percent: number; notes: string | null }
  | { state: "ready"; version: string; notes: string | null }
  | { state: "error"; message: UpdaterText };

export type UpdateChannel = "stable" | "beta";

export interface UpdateSettings {
  channel: UpdateChannel;
  /** Whether the app checks on its own, at start and every few hours. */
  autoCheck: boolean;
}
