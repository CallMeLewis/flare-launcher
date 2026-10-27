import { useEffect, useState, type ReactNode } from "react";
import {
  AboutSection,
  AppearanceSettings,
  SettingRow,
  SettingsDialog as FlareSettingsDialog,
  SettingsGroup,
} from "@flare/ui";
import {
  CircleAlert,
  CircleCheck,
  FolderOpen,
  Info,
  Monitor,
  Moon,
  Gamepad2,
  SlidersHorizontal,
  Sun,
  type LucideIcon,
} from "lucide-react";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { toast } from "sonner";
import { Button } from "@flare/ui/ui/button";
import { Input } from "@flare/ui/ui/input";
import { Label } from "@flare/ui/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@flare/ui/ui/select";
import { Switch } from "@flare/ui/ui/switch";
import { backend, errorMessage, isPreview } from "@/lib/backend";
import { addToAppMenu } from "@/hooks/use-app-menu-offer";
import { LOCALES } from "@/lib/i18n";
import { LAUNCH_OPTIONS, launchArgs } from "@/lib/launch-options";
import { openReport } from "@/lib/report";
import type { AppMenu, Install, Language, Settings, Theme } from "@/lib/types";
import appIcon from "../../src-tauri/icons/128x128@2x.png";

/** Shown in Settings > About. A name, so it's left out of translation. */
const AUTHOR = "CallMeLewis";
export const THEMES: { value: Theme; label: MessageDescriptor; icon: LucideIcon }[] = [
  { value: "light", label: msg`Light`, icon: Sun },
  { value: "dark", label: msg`Dark`, icon: Moon },
  { value: "system", label: msg`System`, icon: Monitor },
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

/** Settings, in the dialog every Flare app shares. Its sections are sorted by one question: does it change DayZ, or the launcher? */
export function SettingsDialog({ open, onOpenChange, settings, onChange, install, onRunSetup }: Props) {
  const { t, i18n } = useLingui();
  const set = (patch: Partial<Settings>) => onChange({ ...settings, ...patch });

  return (
    <FlareSettingsDialog
      open={open}
      onOpenChange={onOpenChange}
      sections={[
        {
          id: "game",
          label: t`Game`,
          icon: Gamepad2,
          description: t`How DayZ starts when you join a server.`,
          content: (
            <>
              <SettingsGroup title={t`In game`}>
                <SettingRow
                  id="profile-name"
                  label={t`Character name`}
                  description={t`The name other players see. Leave it empty to keep the one set in DayZ.`}
                >
                  <Input
                    id="profile-name"
                    aria-describedby="profile-name-description"
                    placeholder={t`Name set in DayZ`}
                    autoComplete="off"
                    spellCheck={false}
                    value={settings.profileName}
                    onChange={(event) => set({ profileName: event.target.value })}
                    className="w-60 shrink-0"
                  />
                </SettingRow>
              </SettingsGroup>
              <SettingsGroup title={t`Startup`}>
                {LAUNCH_OPTIONS.map((option) => (
                  <SettingRow
                    key={option.key}
                    id={`option-${option.key}`}
                    label={i18n._(option.label)}
                    description={
                      <>
                        {i18n._(option.description)}{" "}
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
                label={t`Extra parameters`}
                hint={t`Any other DayZ startup parameters, separated by spaces.`}
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
                <p className="text-xs font-medium text-muted-foreground">
                  <Trans>Added to the command line</Trans>
                </p>
                <code className="data selectable rounded-md border bg-background/60 px-3 py-2 text-xs break-all text-foreground/85">
                  {launchArgs(settings) || (
                    <span className="text-muted-foreground">
                      <Trans>Nothing extra</Trans>
                    </span>
                  )}
                </code>
                <p className="text-xs text-muted-foreground">
                  <Trans>The server address, its mods and your character name are added automatically.</Trans>
                </p>
              </div>
            </>
          ),
        },
        {
          id: "launcher",
          label: t`Launcher`,
          icon: SlidersHorizontal,
          description: t`How the launcher looks and behaves on this computer.`,
          content: (
            <>
              <AppearanceSettings
                theme={settings.theme}
                onThemeChange={(theme) => set({ theme })}
                scale={settings.uiScale}
                onScaleChange={(uiScale) => set({ uiScale })}
              >
                <SettingRow id="language" label={t`Language`} description={t`The language the launcher is shown in.`}>
                  <Select value={settings.language} onValueChange={(value) => set({ language: value as Language })}>
                    <SelectTrigger id="language" aria-describedby="language-description" className="w-60 shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="system">
                        <Trans>Match this computer</Trans>
                      </SelectItem>
                      {LOCALES.map(({ value, name }) => (
                        <SelectItem key={value} value={value}>
                          {name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </SettingRow>
              </AppearanceSettings>
              <SettingsGroup title={t`Behaviour`}>
                <SettingRow
                  id="after-launch"
                  label={t`When DayZ starts`}
                  description={t`What the launcher does once the game is running.`}
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
                      <SelectItem value="keep">
                        <Trans>Keep the launcher open</Trans>
                      </SelectItem>
                      <SelectItem value="minimise">
                        <Trans>Minimise the launcher</Trans>
                      </SelectItem>
                      <SelectItem value="close">
                        <Trans>Close the launcher</Trans>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </SettingRow>
                <SettingRow
                  id="discord-status"
                  label={t`Discord activity`}
                  description={
                    settings.afterLaunch === "close"
                      ? t`Lets your Discord friends see you're using Flare Launcher. It closes when DayZ starts, so they won't see when you're in game.`
                      : t`Lets your Discord friends see you're using Flare Launcher and when you're in game. Never which server you're on.`
                  }
                >
                  <Switch
                    id="discord-status"
                    aria-describedby="discord-status-description"
                    checked={settings.discordStatus}
                    onCheckedChange={(checked) => set({ discordStatus: checked })}
                  />
                </SettingRow>
                <AppMenuRow />
              </SettingsGroup>
              <SettingsGroup title={t`Setup`}>
                <SettingRow
                  id="run-setup"
                  label={t`First-time setup`}
                  description={t`Go through the choices offered when the launcher was first opened.`}
                >
                  <Button
                    id="run-setup"
                    variant="outline"
                    size="sm"
                    aria-describedby="run-setup-description"
                    onClick={onRunSetup}
                  >
                    <Trans>Run setup again</Trans>
                  </Button>
                </SettingRow>
              </SettingsGroup>
            </>
          ),
        },
        {
          id: "folders",
          label: t`Folders`,
          icon: FolderOpen,
          description: t`Where DayZ and its mods live on this computer.`,
          content: <FoldersSection open={open} settings={settings} onChange={set} install={install} />,
        },
        {
          id: "about",
          label: t`About`,
          icon: Info,
          description: t`Version, updates and release notes.`,
          pinned: true,
          content: <About />,
        },
      ]}
    />
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
  const { t } = useLingui();
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

  function reveal(folder: "game" | "workshop") {
    backend
      .openFolder(settings.dayzDir, folder)
      .catch((e) => toast.error(t`Couldn't open the folder`, { description: errorMessage(e) }));
  }

  return (
    <>
      <DayzFolderField id="dayz-dir" settings={settings} onChange={onChange} install={install} />

      {install && (
        <>
          <Field id="workshop-dir" label={t`Workshop mods`}>
            <code id="workshop-dir" className="data selectable text-xs break-all text-muted-foreground">
              {install.workshopDir}
            </code>
            {modCount !== null && (
              <p className="text-xs text-muted-foreground">
                {/* Plain outer spans: Lingui only keeps a plural form's words translatable inside an element. */}
                <Trans>
                  <Plural
                    value={modCount}
                    one={
                      <span>
                        <span className="data text-foreground">#</span> mod
                      </span>
                    }
                    other={
                      <span>
                        <span className="data text-foreground">#</span> mods
                      </span>
                    }
                  />{" "}
                  downloaded. Steam keeps the ones you're subscribed to up to date.
                </Trans>
              </p>
            )}
          </Field>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => reveal("game")}>
              <FolderOpen aria-hidden />
              <Trans>Open DayZ folder</Trans>
            </Button>
            <Button variant="secondary" size="sm" onClick={() => reveal("workshop")}>
              <FolderOpen aria-hidden />
              <Trans>Open mods folder</Trans>
            </Button>
          </div>
        </>
      )}
    </>
  );
}

/** The DayZ folder: found through Steam, or one the player chose. First-time setup shows it too when DayZ isn't found. */
export function DayzFolderField({
  id,
  settings,
  onChange,
  install,
}: {
  id: string;
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  install: Install | null | undefined;
}) {
  const { t } = useLingui();

  async function browse() {
    try {
      const chosen = await backend.pickFolder(t`Choose the DayZ folder`, install?.dayzDir ?? settings.dayzDir);
      if (chosen) onChange({ dayzDir: chosen });
    } catch (e) {
      toast.error(t`Couldn't open the folder picker`, { description: errorMessage(e) });
    }
  }

  return (
    <Field id={id} label={t`DayZ folder`}>
      <div className="flex gap-2">
        <Input
          id={id}
          placeholder={t`Found automatically from Steam`}
          autoComplete="off"
          spellCheck={false}
          value={settings.dayzDir}
          onChange={(event) => onChange({ dayzDir: event.target.value })}
          className="data text-xs"
        />
        {!isPreview && (
          <Button variant="secondary" onClick={browse} className="shrink-0">
            <Trans>Browse</Trans>
          </Button>
        )}
      </div>
      {install ? (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <CircleCheck className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden />
          <span className="selectable break-all">
            {settings.dayzDir ? t`Using this folder.` : t`Found through Steam at ${{ folder: install.dayzDir }}`}
          </span>
        </p>
      ) : (
        install === null && (
          <p className="flex items-start gap-1.5 text-xs text-warning">
            <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {settings.dayzDir
              ? t`DayZ_x64.exe isn't in that folder. Choose the folder DayZ is installed in.`
              : t`DayZ wasn't found through Steam. Choose the folder it is installed in.`}
          </p>
        )
      )}
      {settings.dayzDir && (
        <button
          type="button"
          onClick={() => onChange({ dayzDir: "" })}
          className="self-start text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          <Trans>Find it through Steam instead</Trans>
        </button>
      )}
    </Field>
  );
}

function About() {
  const { t } = useLingui();

  function openProjectPage() {
    backend.openProjectPage().catch((e) => {
      toast.error(t`Couldn't open GitHub`, { description: errorMessage(e) });
    });
  }

  return (
    <AboutSection
      icon={appIcon}
      tagline={t`Find a DayZ server, get its mods and play.`}
      author={AUTHOR}
      onOpenProject={openProjectPage}
      onReport={(message) => openReport("update", message)}
      credits={
        // DB-IP's licence (CC BY 4.0) asks for this credit.
        <p>
          <Trans>Server countries come from IP Geolocation by DB-IP (db-ip.com), under CC BY 4.0.</Trans>
        </p>
      }
    />
  );
}

/** Linux only: whether the launcher is in the app menu, with a button to add or remove it. Hidden elsewhere. */
function AppMenuRow() {
  const { t } = useLingui();
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
      toast.success(t`Removed from the app menu`, {
        description: t`The launcher stays in your Applications folder.`,
      });
    } catch (error) {
      toast.error(t`Couldn't remove Flare Launcher from the app menu`, { description: errorMessage(error) });
    }
    await refresh();
    setBusy(false);
  }

  const description = !menu.added
    ? t`Open Flare Launcher from your app menu like any other app. The file moves to your Applications folder.`
    : menu.ours
      ? t`Flare Launcher is in your app menu.`
      : t`Flare Launcher is in your app menu, added by another app. Remove it there.`;
  return (
    <SettingRow id="app-menu" label={t`App menu`} description={description}>
      {!menu.added ? (
        <Button
          id="app-menu"
          variant="outline"
          size="sm"
          aria-describedby="app-menu-description"
          disabled={busy}
          onClick={add}
        >
          <Trans>Add to app menu</Trans>
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
          <Trans>Remove</Trans>
        </Button>
      ) : null}
    </SettingRow>
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
