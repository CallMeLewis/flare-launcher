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
  // installsOnClose: the update installs by itself when the app closes. Otherwise (the .deb and .rpm, which ask for a
  // password) it waits for the user.
  | { state: "ready"; version: string; notes: string | null; installsOnClose: boolean }
  | { state: "error"; message: UpdaterText };

export type UpdateChannel = "stable" | "beta";

export interface UpdateSettings {
  channel: UpdateChannel;
  /** Whether the app updates on its own: it checks at start and every few hours, and downloads what it finds. */
  autoCheck: boolean;
}
