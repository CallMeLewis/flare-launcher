import { useEffect, useState, type ReactNode } from "react";
import {
  CircleAlert,
  CircleCheck,
  Download,
  FolderOpen,
  Info,
  LoaderCircle,
  Monitor,
  Moon,
  RefreshCw,
  Gamepad2,
  RotateCcw,
  SlidersHorizontal,
  Sun,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { InstallUpdateDialog } from "@/components/install-update-dialog";
import { ReleaseNotesLink } from "@/components/release-notes";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { backend, errorMessage, isPreview } from "@/lib/backend";
import { addToAppMenu } from "@/hooks/use-app-menu-offer";
import { useUpdateStatus } from "@/hooks/use-update-status";
import { LAUNCH_OPTIONS, launchArgs } from "@/lib/launch-options";
import { releaseNoteItems, runningVersionNotes } from "@/lib/release-notes";
import type { AppMenu, Install, Settings, Theme, UpdateChannel, UpdateSettings, UpdateStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import appIcon from "../../src-tauri/icons/128x128@2x.png";

const SCALES = [0.9, 1, 1.1, 1.25, 1.5];
export const THEMES: { value: Theme; label: string; icon: LucideIcon }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];
const count = new Intl.NumberFormat();

const SECTIONS: { value: string; label: string; icon: LucideIcon; pinned?: boolean }[] = [
  // Sorted by one question: does it change DayZ, or the launcher?
  { value: "game", label: "Game", icon: Gamepad2 },
  { value: "launcher", label: "Launcher", icon: SlidersHorizontal },
  { value: "folders", label: "Folders", icon: FolderOpen },
  // Pinned to the bottom of the menu.
  { value: "about", label: "About", icon: Info, pinned: true },
];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: Settings;
  onChange: (settings: Settings) => void;
  /** `undefined` while detection is still running. */
  install: Install | null | undefined;
  /** Closes Settings and opens first-time setup again. */
  onRunSetup: () => void;
};

export function SettingsDialog({ open, onOpenChange, settings, onChange, install, onRunSetup }: Props) {
  const set = (patch: Partial<Settings>) => onChange({ ...settings, ...patch });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[min(760px,calc(100vh-4rem))] gap-0 overflow-hidden p-0 sm:max-w-[60rem]">
        <Tabs defaultValue="game" orientation="vertical" className="h-full min-h-0 gap-0">
          <div className="flex w-52 shrink-0 flex-col border-r bg-background/40 p-3">
            <div className="px-2 pt-2 pb-4">
              <DialogTitle className="text-base">Settings</DialogTitle>
              <DialogDescription className="mt-0.5 text-xs">Changes save as you make them.</DialogDescription>
            </div>
            <TabsList className="h-auto w-full flex-1 flex-col items-stretch justify-start gap-0.5 bg-transparent p-0">
              {SECTIONS.map(({ value, label, icon: Icon, pinned }) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  className={cn(
                    pinned && "mt-auto",
                    "h-9 flex-none justify-start gap-2.5 px-2.5 text-[13px] font-normal text-muted-foreground after:hidden hover:text-foreground data-[state=active]:bg-accent data-[state=active]:font-medium data-[state=active]:text-foreground data-[state=active]:shadow-none dark:data-[state=active]:border-transparent dark:data-[state=active]:bg-accent [&[data-state=active]>svg]:text-primary",
                  )}
                >
                  <Icon className="size-4" aria-hidden />
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <div className="min-w-0 flex-1 overflow-y-auto">
            <TabsContent value="game" className="flex flex-col gap-6 p-6 pr-14">
              <SectionHeading title="Game" description="How DayZ starts when you join a server." />
              <SettingsGroup title="In game">
                <SettingRow
                  id="profile-name"
                  label="Character name"
                  description="The name other players see. Leave it empty to keep the one set in DayZ."
                >
                  <Input
                    id="profile-name"
                    aria-describedby="profile-name-description"
                    placeholder="Name set in DayZ"
                    autoComplete="off"
                    spellCheck={false}
                    value={settings.profileName}
                    onChange={(event) => set({ profileName: event.target.value })}
                    className="w-60 shrink-0"
                  />
                </SettingRow>
              </SettingsGroup>
              <SettingsGroup title="Startup">
                {LAUNCH_OPTIONS.map((option) => (
                  <SettingRow
                    key={option.key}
                    id={`option-${option.key}`}
                    label={option.label}
                    description={
                      <>
                        {option.description}{" "}
                        <code className="data whitespace-nowrap text-foreground/70">{option.flag}</code>
                      </>
                    }
                  >
                    <Switch
                      id={`option-${option.key}`}
                      aria-describedby={`option-${option.key}-description`}
                      checked={settings[option.key]}
                      onCheckedChange={(checked) => set({ [option.key]: checked })}
                    />
                  </SettingRow>
                ))}
              </SettingsGroup>
              <Field
                id="extra-args"
                label="Extra parameters"
                hint="Any other DayZ startup parameters, separated by spaces."
              >
                <Input
                  id="extra-args"
                  placeholder="-cpuCount=8"
                  autoComplete="off"
                  spellCheck={false}
                  value={settings.extraArgs}
                  onChange={(event) => set({ extraArgs: event.target.value })}
                  className="data text-xs"
                />
              </Field>
              <div className="flex flex-col gap-1.5">
                <p className="text-xs font-medium text-muted-foreground">Added to the command line</p>
                <code className="data selectable rounded-md border bg-background/60 px-3 py-2 text-xs break-all text-foreground/85">
                  {launchArgs(settings) || <span className="text-muted-foreground">Nothing extra</span>}
                </code>
                <p className="text-xs text-muted-foreground">
                  The server address, its mods and your character name are added automatically.
                </p>
              </div>
            </TabsContent>

            <TabsContent value="launcher" className="flex flex-col gap-6 p-6 pr-14">
              <SectionHeading title="Launcher" description="How the launcher looks and behaves on this computer." />
              <SettingsGroup title="Appearance">
                <SettingRow id="theme" label="Theme" description="Light or dark, or System to match this computer.">
                  <ToggleGroup
                    type="single"
                    aria-labelledby="theme-label"
                    aria-describedby="theme-description"
                    value={settings.theme}
                    // Selecting the current theme again would clear it; a theme is always chosen.
                    onValueChange={(value) => value && set({ theme: value as Theme })}
                    className="shrink-0"
                  >
                    {THEMES.map(({ value, label, icon: Icon }) => (
                      <ToggleGroupItem
                        key={value}
                        // The label clicks the chosen theme, which focuses it and leaves it chosen.
                        id={value === settings.theme ? "theme" : undefined}
                        value={value}
                        className="gap-1.5"
                      >
                        <Icon className="size-3.5" aria-hidden />
                        {label}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </SettingRow>
                <SettingRow
                  id="ui-scale"
                  label="Interface size"
                  description="Makes text and controls larger or smaller."
                >
                  {/* Every size on show, so the current one is clear and any other is one click away. */}
                  <ToggleGroup
                    type="single"
                    aria-labelledby="ui-scale-label"
                    aria-describedby="ui-scale-description"
                    value={String(settings.uiScale)}
                    // Selecting the current size again would clear it; a size is always chosen.
                    onValueChange={(value) => value && set({ uiScale: Number(value) })}
                    className="shrink-0"
                  >
                    {SCALES.map((scale) => (
                      <ToggleGroupItem
                        key={scale}
                        // The label clicks the chosen size, which focuses it and leaves it chosen.
                        id={scale === settings.uiScale ? "ui-scale" : undefined}
                        value={String(scale)}
                        className="data"
                      >
                        {Math.round(scale * 100)}%
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </SettingRow>
              </SettingsGroup>
              <SettingsGroup title="Behaviour">
                <SettingRow
                  id="after-launch"
                  label="When DayZ starts"
                  description="What the launcher does once the game is running."
                >
                  <Select
                    value={settings.afterLaunch}
                    onValueChange={(value) => set({ afterLaunch: value as Settings["afterLaunch"] })}
                  >
                    <SelectTrigger
                      id="after-launch"
                      aria-describedby="after-launch-description"
                      className="w-60 shrink-0"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="keep">Keep the launcher open</SelectItem>
                      <SelectItem value="minimise">Minimise the launcher</SelectItem>
                      <SelectItem value="close">Close the launcher</SelectItem>
                    </SelectContent>
                  </Select>
                </SettingRow>
                <AppMenuRow />
              </SettingsGroup>
              <SettingsGroup title="Setup">
                <SettingRow
                  id="run-setup"
                  label="First-time setup"
                  description="Go through the choices offered when the launcher was first opened."
                >
                  <Button
                    id="run-setup"
                    variant="outline"
                    size="sm"
                    aria-describedby="run-setup-description"
                    onClick={onRunSetup}
                  >
                    Run setup again
                  </Button>
                </SettingRow>
              </SettingsGroup>
            </TabsContent>

            <TabsContent value="folders" className="flex flex-col gap-6 p-6 pr-14">
              <SectionHeading title="Folders" description="Where DayZ and its mods live on this computer." />
              <FoldersSection open={open} settings={settings} onChange={set} install={install} />
            </TabsContent>

            <TabsContent value="about" className="flex flex-col gap-6 p-6 pr-14">
              <SectionHeading title="About" description="Version, updates and release notes." />
              <AboutSection />
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function FoldersSection({
  open,
  settings,
  onChange,
  install,
}: {
  open: boolean;
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  install: Install | null | undefined;
}) {
  const [modCount, setModCount] = useState<number | null>(null);

  useEffect(() => {
    if (!open || !install) {
      setModCount(null);
      return;
    }
    let cancelled = false;
    backend
      .downloadedModCount(settings.dayzDir)
      .then((n) => !cancelled && setModCount(n))
      .catch(() => !cancelled && setModCount(null));
    return () => {
      cancelled = true;
    };
  }, [open, install, settings.dayzDir]);

  async function browse() {
    try {
      const chosen = await backend.pickFolder("Choose the DayZ folder", install?.dayzDir ?? settings.dayzDir);
      if (chosen) onChange({ dayzDir: chosen });
    } catch (e) {
      toast.error("Couldn't open the folder picker", { description: errorMessage(e) });
    }
  }

  function reveal(folder: "game" | "workshop") {
    backend
      .openFolder(settings.dayzDir, folder)
      .catch((e) => toast.error("Couldn't open the folder", { description: errorMessage(e) }));
  }

  return (
    <>
      <Field id="dayz-dir" label="DayZ folder">
        <div className="flex gap-2">
          <Input
            id="dayz-dir"
            placeholder="Found automatically from Steam"
            autoComplete="off"
            spellCheck={false}
            value={settings.dayzDir}
            onChange={(event) => onChange({ dayzDir: event.target.value })}
            className="data text-xs"
          />
          {!isPreview && (
            <Button variant="secondary" onClick={browse} className="shrink-0">
              Browse
            </Button>
          )}
        </div>
        {install ? (
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <CircleCheck className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden />
            <span className="selectable break-all">
              {settings.dayzDir ? "Using this folder." : `Found through Steam at ${install.dayzDir}`}
            </span>
          </p>
        ) : (
          install === null && (
            <p className="flex items-start gap-1.5 text-xs text-warning">
              <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {settings.dayzDir
                ? "DayZ_x64.exe isn't in that folder. Choose the folder DayZ is installed in."
                : "DayZ wasn't found through Steam. Choose the folder it is installed in."}
            </p>
          )
        )}
        {settings.dayzDir && (
          <button
            type="button"
            onClick={() => onChange({ dayzDir: "" })}
            className="self-start text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Find it through Steam instead
          </button>
        )}
      </Field>

      {install && (
        <>
          <Field id="workshop-dir" label="Workshop mods">
            <code id="workshop-dir" className="data selectable text-xs break-all text-muted-foreground">
              {install.workshopDir}
            </code>
            {modCount !== null && (
              <p className="text-xs text-muted-foreground">
                <span className="data text-foreground">{count.format(modCount)}</span> {modCount === 1 ? "mod" : "mods"}{" "}
                downloaded. Steam keeps the ones you're subscribed to up to date.
              </p>
            )}
          </Field>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => reveal("game")}>
              <FolderOpen aria-hidden />
              Open DayZ folder
            </Button>
            <Button variant="secondary" size="sm" onClick={() => reveal("workshop")}>
              <FolderOpen aria-hidden />
              Open mods folder
            </Button>
          </div>
        </>
      )}
    </>
  );
}

/** The line under the version: plain unless there is an update to act on or something went wrong. */
function describeUpdate(status: UpdateStatus): string {
  switch (status.state) {
    case "unsupported":
      return "The version you're running. This copy can't update itself.";
    case "idle":
      return "The version you're running.";
    case "checking":
      return "Checking for updates…";
    case "upToDate":
      return `You have the latest version. Last checked at ${new Date(status.checkedAt).toLocaleTimeString([], { timeStyle: "short" })}.`;
    case "available":
      return `Version ${status.version} is available.`;
    case "downloading":
      return `Downloading version ${status.version}… ${Math.floor(status.percent)}%`;
    case "ready":
      return `Version ${status.version} is ready to install. The launcher restarts to finish.`;
    case "error":
      return status.message;
  }
}

/**
 * The one button beside the version. It stays the same element as the update moves along, and is only marked
 * busy rather than disabled, so keyboard focus stays on it while it checks or downloads.
 */
function UpdateAction({ status, onRestart }: { status: UpdateStatus; onRestart: () => void }) {
  const busy = status.state === "checking" || status.state === "downloading";
  let icon = <RefreshCw aria-hidden />;
  let text = "Check for updates";
  let action: () => void = () => void backend.checkForUpdates();
  let primary = false;
  switch (status.state) {
    case "unsupported":
      return null;
    case "checking":
      icon = <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden />;
      text = "Checking…";
      break;
    case "upToDate":
      // Still checks again when selected.
      icon = <CircleCheck aria-hidden />;
      text = "Up to date";
      break;
    case "error":
      text = "Try again";
      break;
    case "available":
      icon = <Download aria-hidden />;
      text = `Download version ${status.version}`;
      action = () => void backend.downloadUpdate();
      primary = true;
      break;
    case "downloading":
      icon = <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden />;
      text = "Downloading…";
      break;
    case "ready":
      icon = <RotateCcw aria-hidden />;
      text = "Restart to update";
      action = onRestart;
      primary = true;
      break;
  }
  return (
    <Button
      variant={primary ? "default" : "secondary"}
      className="aria-disabled:cursor-default aria-disabled:opacity-60"
      aria-disabled={busy || undefined}
      onClick={() => {
        if (!busy) action();
      }}
    >
      {icon}
      {text}
    </Button>
  );
}

function AboutSection() {
  const status = useUpdateStatus();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [updateSettings, setUpdateSettings] = useState<UpdateSettings | null>(null);
  const updateNotes = "notes" in status ? releaseNoteItems(status.notes) : [];
  const updateVersion = "version" in status ? status.version : undefined;

  useEffect(() => {
    void backend.updateSettings().then(setUpdateSettings);
  }, []);

  function changeChannel(value: string) {
    const channel = value as UpdateChannel;
    const previous = updateSettings;
    setUpdateSettings((current) => current && { ...current, channel });
    // Saving also checks the new channel; the result shows in the status row.
    backend.setUpdateChannel(channel).catch((e) => {
      setUpdateSettings(previous);
      toast.error("Couldn't change the update channel", { description: errorMessage(e) });
    });
  }

  function changeAutoCheck(autoCheck: boolean) {
    const previous = updateSettings;
    setUpdateSettings((current) => current && { ...current, autoCheck });
    backend.setAutoUpdateCheck(autoCheck).catch((e) => {
      setUpdateSettings(previous);
      toast.error("Couldn't save the setting", { description: errorMessage(e) });
    });
  }

  return (
    <>
      <div className="flex items-center gap-4 rounded-lg border bg-card p-4">
        <img src={appIcon} alt="" className="size-14 shrink-0" />
        <div className="min-w-0">
          <p className="text-base font-semibold">Flare Launcher</p>
          <p className="text-[13px] text-muted-foreground">Find a DayZ server, get its mods and play.</p>
        </div>
      </div>

      <SettingsGroup title="Updates">
        <SettingRow
          id="auto-update-check"
          label="Check for updates automatically"
          description="When the launcher starts and every few hours."
        >
          <Switch
            id="auto-update-check"
            aria-describedby="auto-update-check-description"
            checked={updateSettings?.autoCheck ?? true}
            disabled={!updateSettings}
            onCheckedChange={changeAutoCheck}
          />
        </SettingRow>

        <div className="flex flex-col gap-3 px-4 py-3.5">
          <div className="flex items-center justify-between gap-6">
            <div className="min-w-0">
              <p className="flex flex-wrap items-baseline gap-x-2 text-[13px] font-medium">
                Version
                <span className="data selectable text-xs font-normal text-muted-foreground">{__APP_VERSION__}</span>
                {runningVersionNotes.length > 0 && (
                  <ReleaseNotesLink
                    version={__APP_VERSION__}
                    items={runningVersionNotes}
                    description="The changes in the version you are running."
                  />
                )}
              </p>
              <p
                className={cn("mt-0.5 text-xs", status.state === "error" ? "text-danger" : "text-muted-foreground")}
                aria-live="polite"
              >
                {status.state === "error" && <CircleAlert className="mr-1 inline size-3.5 align-[-2px]" aria-hidden />}
                {describeUpdate(status)}
                {updateVersion && updateNotes.length > 0 && (
                  <>
                    {" "}
                    <ReleaseNotesLink
                      label="See what's new"
                      version={updateVersion}
                      items={updateNotes}
                      description="The changes in the update waiting for you."
                    />
                  </>
                )}
              </p>
            </div>
            <div className="shrink-0">
              <UpdateAction status={status} onRestart={() => setConfirmOpen(true)} />
              {status.state === "ready" && (
                <InstallUpdateDialog version={status.version} open={confirmOpen} onOpenChange={setConfirmOpen} />
              )}
            </div>
          </div>
          {status.state === "downloading" && (
            <Progress
              value={status.percent}
              className="h-2 [&>*]:duration-1000 [&>*]:ease-linear motion-reduce:[&>*]:transition-none"
              aria-label="Update download progress"
            />
          )}
        </div>

        <SettingRow
          id="update-channel"
          label="Update channel"
          description="Stable releases, or beta builds with newer changes."
        >
          <Select value={updateSettings?.channel} disabled={!updateSettings} onValueChange={changeChannel}>
            <SelectTrigger id="update-channel" aria-describedby="update-channel-description" className="w-32 shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="stable">Stable</SelectItem>
              <SelectItem value="beta">Beta</SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>
      </SettingsGroup>
    </>
  );
}

/** Linux only: whether the launcher is in the app menu, with a button to add or remove it. Hidden elsewhere. */
function AppMenuRow() {
  const [menu, setMenu] = useState<AppMenu | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = () =>
    backend
      .appMenuStatus()
      .then(setMenu)
      .catch(() => setMenu(null));
  useEffect(() => void refresh(), []);
  if (!menu?.supported) return null;

  async function add() {
    setBusy(true);
    // When the file moves, the launcher reopens from the app menu and this window closes.
    if (await addToAppMenu()) await refresh();
    setBusy(false);
  }

  async function remove() {
    setBusy(true);
    try {
      await backend.removeFromAppMenu();
      toast.success("Removed from the app menu", { description: "The launcher stays in your Applications folder." });
    } catch (error) {
      toast.error("Couldn't remove Flare Launcher from the app menu", { description: errorMessage(error) });
    }
    await refresh();
    setBusy(false);
  }

  const description = !menu.added
    ? "Open Flare Launcher from your app menu like any other app. The file moves to your Applications folder."
    : menu.ours
      ? "Flare Launcher is in your app menu."
      : "Flare Launcher is in your app menu, added by another app. Remove it there.";
  return (
    <SettingRow id="app-menu" label="App menu" description={description}>
      {!menu.added ? (
        <Button
          id="app-menu"
          variant="outline"
          size="sm"
          aria-describedby="app-menu-description"
          disabled={busy}
          onClick={add}
        >
          Add to app menu
        </Button>
      ) : menu.ours ? (
        <Button
          id="app-menu"
          variant="outline"
          size="sm"
          aria-describedby="app-menu-description"
          disabled={busy}
          onClick={remove}
        >
          Remove
        </Button>
      ) : null}
    </SettingRow>
  );
}

function SectionHeading({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h3 className="text-[15px] font-semibold">{title}</h3>
      <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>
    </div>
  );
}

/** A titled card of setting rows. */
export function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  const id = `group-${title.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h4 id={id} className="text-sm font-semibold">
        {title}
      </h4>
      <div className="flex flex-col divide-y rounded-lg border bg-card">{children}</div>
    </section>
  );
}

/**
 * One setting: what it is and what it does on the left, its control on the right. The control is passed in, so it
 * points `aria-describedby` at `<id>-description` itself; a group of buttons uses `<id>-label` as its name.
 */
export function SettingRow({
  id,
  label,
  description,
  children,
}: {
  id: string;
  label: string;
  description: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-6 px-4 py-3.5">
      <div className="min-w-0">
        <Label id={`${id}-label`} htmlFor={id} className="text-[13px]">
          {label}
        </Label>
        <p id={`${id}-description`} className="mt-0.5 text-xs text-muted-foreground">
          {description}
        </p>
      </div>
      {children}
    </div>
  );
}

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
