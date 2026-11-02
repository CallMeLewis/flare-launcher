// The launcher's window frame: the title bar, sidebar, settings dialog and updates, with the basic components they and
// the rest of the interface are built from in ./components.

export { blockWebviewMenu } from "./lib/desktop";
export { FlareProvider, fill, useFlare } from "./lib/flare";
export type { FlareApp, FlareConfig, InstallNotice, Translate, Values } from "./lib/flare";
export { MESSAGES } from "./lib/messages";

export { AppShell } from "./shell/app-shell";
export { AppSidebar } from "./shell/app-sidebar";
export type { SidebarItem, SidebarSection } from "./shell/app-sidebar";
export { TitleBar } from "./shell/title-bar";

export { AboutSection } from "./settings/about-section";
export { AppearanceSettings, INTERFACE_SCALES, setInterfaceScale } from "./settings/appearance-settings";
export type { Theme } from "./settings/appearance-settings";
export { SettingsDialog } from "./settings/settings-dialog";
export type { SettingsSection } from "./settings/settings-dialog";
export { InfoRow, SectionHeading, SettingRow, SettingsGroup } from "./settings/settings-group";

export { onUpdateStatus, updates } from "./updates/api";
export { InstallUpdateDialog } from "./updates/install-update-dialog";
export { releaseNoteItems } from "./updates/notes";
export { ReleaseNotesLink, ReleaseNotesList } from "./updates/release-notes";
export type { UpdateChannel, UpdateSettings, UpdateStatus, UpdaterText } from "./updates/types";
export { UpdateButton } from "./updates/update-button";
export { UpdatesSettings } from "./updates/updates-settings";
export { useUpdateStatus } from "./updates/use-update-status";
