import { Channel, invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import type {
  AppMenu,
  Install,
  LaunchRequest,
  Mod,
  ModProgress,
  Ping,
  ServerList,
  UpdateChannel,
  UpdateSettings,
  UpdateStatus,
} from "./types";

/**
 * True when the UI is opened in a plain browser during development. The server
 * list then comes straight from the public API so the interface can be worked
 * on without the desktop shell. Ping, mod checks and launching need the app.
 */
export const isPreview = import.meta.env.DEV && !isTauri();

/** Whether the window has the system title bar, as it does on Linux. Set by the backend before the page loads. */
export const hasSystemTitleBar = (window as { __systemTitleBar?: boolean }).__systemTitleBar === true;

const preview = () => import("./preview-backend");

export const backend = {
  fetchServers: (): Promise<ServerList> =>
    isPreview ? preview().then((p) => p.fetchServers()) : invoke("fetch_servers"),

  serverMods: (id: string): Promise<Mod[]> =>
    isPreview ? preview().then((p) => p.serverMods(id)) : invoke("server_mods", { id }),

  pingServers: (ids: string[]): Promise<Ping[]> => (isPreview ? Promise.resolve([]) : invoke("ping_servers", { ids })),

  detectInstall: (dayzDir: string): Promise<Install | null> =>
    isPreview ? Promise.resolve(null) : invoke("detect_install", { dayzDir: dayzDir || null }),

  installedMods: (dayzDir: string, ids: number[]): Promise<number[]> =>
    isPreview ? Promise.resolve([]) : invoke("installed_mods", { dayzDir: dayzDir || null, ids }),

  launch: (request: LaunchRequest): Promise<void> =>
    isPreview ? Promise.reject("Launching only works in the desktop app.") : invoke("launch", { request }),

  /**
   * Subscribes to the mods in Steam and waits for them to install. Resolves to
   * `false` if the player cancelled.
   */
  downloadMods: (ids: number[], onProgress: (progress: ModProgress[]) => void): Promise<boolean> => {
    if (isPreview) return Promise.reject("Downloading mods only works in the desktop app.");
    const channel = new Channel<ModProgress[]>();
    channel.onmessage = onProgress;
    return invoke("download_mods", { ids, onProgress: channel });
  },

  // async so a failure, even a synchronous one, can only ever reject.
  /** Makes the window light or dark, or follows the system when given null. */
  setWindowTheme: async (theme: "light" | "dark" | null): Promise<void> => {
    if (!isPreview) await invoke("set_window_theme", { theme });
  },

  setInterfaceScale: async (scale: number): Promise<void> => {
    if (!isPreview) await getCurrentWebview().setZoom(scale);
  },

  downloadedModCount: (dayzDir: string): Promise<number | null> =>
    isPreview ? Promise.resolve(null) : invoke("downloaded_mod_count", { dayzDir: dayzDir || null }),

  openFolder: (dayzDir: string, folder: "game" | "workshop"): Promise<void> =>
    isPreview
      ? Promise.reject("Opening folders only works in the desktop app.")
      : invoke("open_folder", { dayzDir: dayzDir || null, folder }),

  /** Asks the player to choose a folder. Resolves to `null` if they cancel. */
  pickFolder: async (title: string, defaultPath?: string): Promise<string | null> => {
    if (isPreview) return null;
    const chosen = await open({ directory: true, title, defaultPath: defaultPath || undefined });
    return typeof chosen === "string" ? chosen : null;
  },

  minimiseWindow: async (): Promise<void> => {
    if (!isPreview) await getCurrentWindow().minimize();
  },

  closeWindow: async (): Promise<void> => {
    if (!isPreview) await getCurrentWindow().close();
  },

  toggleMaximiseWindow: async (): Promise<void> => {
    if (!isPreview) await getCurrentWindow().toggleMaximize();
  },

  isWindowMaximised: async (): Promise<boolean> => (isPreview ? false : getCurrentWindow().isMaximized()),

  /** Calls back whenever the window changes size. Resolves, once listening, to a function that stops it. */
  onWindowResized: async (callback: () => void): Promise<() => void> => {
    if (isPreview) return () => {};
    return getCurrentWindow().onResized(callback);
  },

  updateStatus: (): Promise<UpdateStatus> =>
    isPreview ? Promise.resolve({ state: "unsupported" }) : invoke("update_status"),

  /** Calls back whenever the update status changes. Resolves, once listening, to a function that stops it. */
  onUpdateStatus: async (callback: (status: UpdateStatus) => void): Promise<() => void> => {
    if (isPreview) return () => {};
    return listen<UpdateStatus>("update:status", (event) => callback(event.payload));
  },

  checkForUpdates: (): Promise<UpdateStatus> =>
    isPreview ? Promise.resolve({ state: "unsupported" }) : invoke("check_for_updates"),

  downloadUpdate: (): Promise<void> => (isPreview ? Promise.resolve() : invoke("download_update")),

  installUpdate: (): Promise<void> => (isPreview ? Promise.resolve() : invoke("install_update")),

  updateSettings: (): Promise<UpdateSettings> =>
    isPreview ? Promise.resolve({ channel: "stable", autoCheck: true }) : invoke("update_settings"),

  setAutoUpdateCheck: (enabled: boolean): Promise<UpdateStatus> =>
    isPreview ? Promise.resolve({ state: "unsupported" }) : invoke("set_auto_update_check", { enabled }),

  setUpdateChannel: (channel: UpdateChannel): Promise<UpdateStatus> =>
    isPreview ? Promise.resolve({ state: "unsupported" }) : invoke("set_update_channel", { channel }),

  appMenuStatus: (): Promise<AppMenu> =>
    isPreview ? Promise.resolve({ supported: false, added: false, ours: false }) : invoke("app_menu_status"),

  /**
   * Adds the launcher to the Linux app menu. Resolves to true when it had to move the file: the launcher then reopens
   * from there and this window closes.
   */
  addToAppMenu: (): Promise<boolean> => invoke("add_to_app_menu"),

  removeFromAppMenu: (): Promise<void> => invoke("remove_from_app_menu"),

  cancelModDownload: (): Promise<void> => (isPreview ? Promise.resolve() : invoke("cancel_mod_download")),

  openWorkshopPage: (id: number): Promise<void> => {
    if (!isPreview) return invoke("open_workshop_page", { id });
    window.open(`https://steamcommunity.com/sharedfiles/filedetails/?id=${id}`, "_blank", "noopener");
    return Promise.resolve();
  },
};

/** Turns whatever a failed command rejected with into a message to show. */
export function errorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}
