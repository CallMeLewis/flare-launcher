import { useEffect, useState } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { SettingRow, SettingsGroup, THEMES } from "@/components/settings-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { addToAppMenu, markAppMenuOffered } from "@/hooks/use-app-menu-offer";
import { backend } from "@/lib/backend";
import type { Settings, Theme } from "@/lib/types";
import appIcon from "../../src-tauri/icons/128x128@2x.png";

type Props = {
  open: boolean;
  settings: Settings;
  onChange: (settings: Settings) => void;
  onDone: () => void;
};

/**
 * The few choices worth making before the first game, shown once. Each applies as it's made, like Settings, so leaving
 * at any point keeps what was chosen and every other setting keeps its default.
 */
export function FirstRunDialog({ open, settings, onChange, onDone }: Props) {
  const { t, i18n } = useLingui();
  const set = (patch: Partial<Settings>) => onChange({ ...settings, ...patch });
  // Only an AppImage that isn't in the app menu yet is offered it, and it's added on finishing: adding may move the
  // launcher and reopen it.
  const [offerAppMenu, setOfferAppMenu] = useState(false);
  const [addAppMenu, setAddAppMenu] = useState(true);
  useEffect(() => {
    if (!open) return;
    backend
      .appMenuStatus()
      .then((menu) => setOfferAppMenu(menu.supported && !menu.added))
      .catch(() => setOfferAppMenu(false));
  }, [open]);

  const finish = () => {
    if (offerAppMenu) {
      // Answered here, so the launcher doesn't offer it again.
      markAppMenuOffered();
      if (addAppMenu) void addToAppMenu();
    }
    onDone();
  };

  const skipIntro = settings.skipIntro && settings.noSplash;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && finish()}>
      <DialogContent className="gap-6 sm:max-w-xl" showCloseButton={false}>
        <div className="flex items-center gap-4">
          <img src={appIcon} alt="" className="size-12 shrink-0" />
          <div className="flex flex-col gap-1">
            <DialogTitle className="text-lg">
              <Trans>Welcome to Flare Launcher</Trans>
            </DialogTitle>
            <DialogDescription className="text-[13px]">
              <Trans>A few choices before your first game. You can change any of them later in Settings.</Trans>
            </DialogDescription>
          </div>
        </div>

        <SettingsGroup title={t`In game`}>
          <SettingRow
            id="setup-profile-name"
            label={t`Character name`}
            description={t`The name other players see. Leave it empty to keep the one set in DayZ.`}
          >
            <Input
              id="setup-profile-name"
              aria-describedby="setup-profile-name-description"
              placeholder={t`Name set in DayZ`}
              autoComplete="off"
              spellCheck={false}
              value={settings.profileName}
              onChange={(event) => set({ profileName: event.target.value })}
              className="w-52 shrink-0"
            />
          </SettingRow>
          <SettingRow
            id="setup-skip-intro"
            label={t`Skip the intro and splash screens`}
            description={t`DayZ goes straight to loading when it starts.`}
          >
            <Switch
              id="setup-skip-intro"
              aria-describedby="setup-skip-intro-description"
              checked={skipIntro}
              onCheckedChange={(checked) => set({ skipIntro: checked, noSplash: checked })}
            />
          </SettingRow>
        </SettingsGroup>

        <SettingsGroup title={t`Launcher`}>
          <SettingRow
            id="setup-theme"
            label={t`Theme`}
            description={t`Light or dark, or System to match this computer.`}
          >
            <ToggleGroup
              type="single"
              aria-labelledby="setup-theme-label"
              aria-describedby="setup-theme-description"
              value={settings.theme}
              // Selecting the current theme again would clear it; a theme is always chosen.
              onValueChange={(value) => value && set({ theme: value as Theme })}
              className="shrink-0"
            >
              {THEMES.map(({ value, label, icon: Icon }) => (
                <ToggleGroupItem
                  key={value}
                  id={value === settings.theme ? "setup-theme" : undefined}
                  value={value}
                  className="gap-1.5"
                >
                  <Icon className="size-3.5" aria-hidden />
                  {i18n._(label)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </SettingRow>
          <SettingRow
            id="setup-after-launch"
            label={t`When DayZ starts`}
            description={t`What the launcher does once the game is running.`}
          >
            <Select
              value={settings.afterLaunch}
              onValueChange={(value) => set({ afterLaunch: value as Settings["afterLaunch"] })}
            >
              <SelectTrigger
                id="setup-after-launch"
                aria-describedby="setup-after-launch-description"
                className="w-52 shrink-0"
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
          {offerAppMenu && (
            <SettingRow
              id="setup-app-menu"
              label={t`Add to the app menu`}
              description={t`Open Flare Launcher like any other app. The file moves to your Applications folder.`}
            >
              <Switch
                id="setup-app-menu"
                aria-describedby="setup-app-menu-description"
                checked={addAppMenu}
                onCheckedChange={setAddAppMenu}
              />
            </SettingRow>
          )}
        </SettingsGroup>

        <div className="flex justify-end">
          <Button onClick={finish}>
            <Trans>Start browsing</Trans>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
