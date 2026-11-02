// Talks to tauri-plugin-flare-updater. The browser preview can't update itself, so it reports `unsupported` and the
// update controls stay hidden. Development builds pretend to update instead (see `fake`).
import type { UpdateChannel, UpdateSettings, UpdateStatus } from "./types";

const STATUS_EVENT = "update:status";

async function isTauri(): Promise<boolean> {
  const { isTauri } = await import("@tauri-apps/api/core");
  return isTauri();
}

async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(`plugin:flare-updater|${command}`, args);
}

const real = {
  status: async (): Promise<UpdateStatus> => ((await isTauri()) ? invoke("status") : { state: "unsupported" }),
  check: () => invoke<UpdateStatus>("check"),
  download: () => invoke<void>("download"),
  install: () => invoke<void>("install"),
  settings: async (): Promise<UpdateSettings> =>
    (await isTauri()) ? invoke("settings") : { channel: "stable", autoCheck: true },
  setAutoCheck: (enabled: boolean) => invoke<UpdateStatus>("set_auto_check", { enabled }),
  setChannel: (channel: UpdateChannel) => invoke<UpdateStatus>("set_channel", { channel }),
};

// A pretend update, so the update controls can be tried in development builds: checking always finds the next patch
// version with the running version's release notes, the download fills over a few seconds, and installing reloads.
let fakeStatus: UpdateStatus = { state: "idle" };
let fakeSettings: UpdateSettings = { channel: "stable", autoCheck: true };
let fakeRelease = { version: "0.0.0", notes: [] as string[] };
const fakeListeners = new Set<(status: UpdateStatus) => void>();
const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

function setFakeStatus(next: UpdateStatus) {
  fakeStatus = next;
  for (const listener of fakeListeners) listener(next);
}

const fake: typeof real = {
  status: async () => fakeStatus,
  check: async () => {
    setFakeStatus({ state: "checking" });
    await wait(1500);
    const version = fakeRelease.version.replace(/\d+$/, (patch) => String(Number(patch) + 1));
    const notes = fakeRelease.notes.map((item) => `- ${item}`).join("\n") || "- A pretend change, to show the notes.";
    setFakeStatus({ state: "available", version, releaseDate: new Date().toISOString(), notes });
    return fakeStatus;
  },
  download: async () => {
    if (fakeStatus.state !== "available") return;
    const { version, notes } = fakeStatus;
    for (let percent = 0; percent < 100; percent += 4 + Math.random() * 8) {
      setFakeStatus({ state: "downloading", version, percent, notes });
      await wait(400);
    }
    setFakeStatus({ state: "ready", version, notes });
  },
  install: async () => {
    await wait(1500);
    window.location.reload();
  },
  settings: async () => fakeSettings,
  setAutoCheck: async (autoCheck) => {
    fakeSettings = { ...fakeSettings, autoCheck };
    return fakeStatus;
  },
  setChannel: async (channel) => {
    fakeSettings = { ...fakeSettings, channel };
    return fake.check();
  },
};

/** The running version, which the pretend update offers the next patch version of. Set by `FlareProvider`. */
export function setPretendRelease(version: string, notes: string[]) {
  fakeRelease = { version, notes };
}

let pretendingCheck: Promise<boolean> | undefined;
/** Whether to use the pretend update: a development build that can't update, as it has no test feed. */
function pretending(): Promise<boolean> {
  if (!import.meta.env.DEV) return Promise.resolve(false);
  pretendingCheck ??= real.status().then(
    (status) => status.state === "unsupported",
    () => true,
  );
  return pretendingCheck;
}

const backend = async () => ((await pretending()) ? fake : real);

/** The app's own updates. Every call goes to the updater plugin, or to the pretend update in development builds. */
export const updates: typeof real = {
  status: async () => (await backend()).status(),
  check: async () => (await backend()).check(),
  download: async () => (await backend()).download(),
  install: async () => (await backend()).install(),
  settings: async () => (await backend()).settings(),
  setAutoCheck: async (enabled) => (await backend()).setAutoCheck(enabled),
  setChannel: async (channel) => (await backend()).setChannel(channel),
};

/** Calls back whenever the app's own update status changes. Resolves, once listening, to a function that stops it. */
export async function onUpdateStatus(handler: (status: UpdateStatus) => void): Promise<() => void> {
  if (await pretending()) {
    fakeListeners.add(handler);
    return () => {
      fakeListeners.delete(handler);
    };
  }
  if (!(await isTauri())) return () => {};
  const { listen } = await import("@tauri-apps/api/event");
  return listen<UpdateStatus>(STATUS_EVENT, (event) => handler(event.payload));
}
