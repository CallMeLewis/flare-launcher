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
  ServerRow,
  SubscribedMod,
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

  /** Searches the local network for servers. Their rows have no mod positions. */
  searchLan: (): Promise<ServerRow[]> => (isPreview ? Promise.resolve([]) : invoke("search_lan")),

  /** Asks saved servers missing from the server list for their details. Resolves to those that answered. */
  queryServers: (ids: string[]): Promise<ServerRow[]> =>
    isPreview ? Promise.resolve([]) : invoke("query_servers", { ids }),

  /** Finds a server from an address the player typed, such as `192.168.1.20:2302`. */
  findServer: (address: string): Promise<ServerRow> =>
    isPreview
      ? Promise.reject("Joining by address only works in the desktop app.")
      : invoke("find_server", { address }),

  detectInstall: (dayzDir: string): Promise<Install | null> =>
    isPreview ? Promise.resolve(null) : invoke("detect_install", { dayzDir: dayzDir || null }),

  installedMods: (dayzDir: string, ids: number[]): Promise<number[]> =>
    isPreview ? Promise.resolve([]) : invoke("installed_mods", { dayzDir: dayzDir || null, ids }),

  /** The mods the player is subscribed to. Resolves to `null` when DayZ isn't found. */
  subscribedMods: (dayzDir: string): Promise<SubscribedMod[] | null> =>
    isPreview ? preview().then((p) => p.subscribedMods()) : invoke("subscribed_mods", { dayzDir: dayzDir || null }),

  /** Unsubscribes from the mods in Steam, which then removes them from this computer. */
  unsubscribeMods: (ids: number[]): Promise<void> =>
    isPreview ? preview().then((p) => p.unsubscribeMods(ids)) : invoke("unsubscribe_mods", { ids }),

  launch: (request: LaunchRequest): Promise<void> =>
    isPreview ? Promise.reject("Launching only works in the desktop app.") : invoke("launch", { request }),

  /** Whether server passwords can be remembered: it needs a password store on this computer. */
  passwordStoreAvailable: (): Promise<boolean> =>
    isPreview ? Promise.resolve(true) : invoke("password_store_available"),

  /** The password remembered for a server, or `null` if there isn't one. */
  savedPassword: (serverId: string): Promise<string | null> =>
    isPreview ? preview().then((p) => p.savedPassword(serverId)) : invoke("saved_password", { serverId }),

  /** Remembers a server's password in the computer's password store, replacing any saved before. */
  savePassword: (serverId: string, password: string): Promise<void> =>
    isPreview
      ? preview().then((p) => p.savePassword(serverId, password))
      : invoke("save_password", { serverId, password }),

  forgetPassword: (serverId: string): Promise<void> =>
    isPreview ? preview().then((p) => p.forgetPassword(serverId)) : invoke("forget_password", { serverId }),

  /** Waits for DayZ to start, up to the given number of seconds. Resolves to whether it did. */
  waitForGame: (timeoutSecs: number): Promise<boolean> =>
    isPreview ? Promise.resolve(true) : invoke("wait_for_game", { timeoutSecs }),

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

  /** Turns the Discord status on or off. It shows the launcher and whether the player is in game, never the server. */
  setDiscordStatus: async (enabled: boolean): Promise<void> => {
    if (!isPreview) await invoke("set_discord_presence", { enabled });
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
