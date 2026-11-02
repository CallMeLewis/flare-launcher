import { useEffect, useState } from "react";
import { CircleAlert, CircleCheck, Download, LoaderCircle, RefreshCw, RotateCcw } from "lucide-react";
import { cn } from "cn";
import { useFlare, type Translate } from "../lib/flare";
import { SettingRow, SettingsGroup } from "../settings/settings-group";
import { Button } from "../components/button";
import { Progress } from "../components/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/select";
import { Switch } from "../components/switch";
import { updates } from "./api";
import { InstallUpdateDialog } from "./install-update-dialog";
import { releaseNoteItems } from "./notes";
import { ReleaseNotesLink } from "./release-notes";
import type { UpdateChannel, UpdateSettings, UpdateStatus, UpdaterText } from "./types";
import { useUpdateStatus } from "./use-update-status";

/** The line under the version: plain unless there is an update to act on or something went wrong. */
function describeUpdate(status: UpdateStatus, t: Translate, appName: string, locale: string): string {
  switch (status.state) {
    case "unsupported":
      return t("The version you're running. This copy can't update itself.");
    case "idle":
      return t("The version you're running.");
    case "checking":
      return t("Checking for updates…");
    case "upToDate": {
      const time = new Date(status.checkedAt).toLocaleTimeString(locale, { timeStyle: "short" });
      return t("You have the latest version. Last checked at {time}.", { time });
    }
    case "available":
      return t("Version {version} is available.", { version: status.version });
    case "downloading":
      return t("Downloading version {version}… {percent}%", {
        version: status.version,
        percent: Math.floor(status.percent),
      });
    case "ready":
      return t("Version {version} is ready to install. {app} restarts to finish.", {
        version: status.version,
        app: appName,
      });
    case "error":
      return t(status.message.message, status.message.values);
  }
}

/**
 * The one button beside the version. It stays the same element as the update moves along, and is only marked busy
 * rather than disabled, so keyboard focus stays on it while it checks or downloads.
 */
function UpdateAction({ status, onRestart }: { status: UpdateStatus; onRestart: () => void }) {
  const { t } = useFlare();
  const busy = status.state === "checking" || status.state === "downloading";
  let icon = <RefreshCw aria-hidden />;
  let text = t("Check for updates");
  let action: () => void = () => void updates.check();
  let primary = false;
  switch (status.state) {
    case "unsupported":
      return null;
    case "checking":
      icon = <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden />;
      text = t("Checking…");
      break;
    case "upToDate":
      // Still checks again when selected.
      icon = <CircleCheck aria-hidden />;
      text = t("Up to date");
      break;
    case "error":
      text = t("Try again");
      break;
    case "available":
      icon = <Download aria-hidden />;
      text = t("Download version {version}", { version: status.version });
      action = () => void updates.download();
      primary = true;
      break;
    case "downloading":
      icon = <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden />;
      text = t("Downloading…");
      break;
    case "ready":
      icon = <RotateCcw aria-hidden />;
      text = t("Restart to update");
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

/** Why a change didn't save, from the updater's text or anything else it threw. */
function failure(error: unknown, t: Translate): string {
  const text = error as Partial<UpdaterText> | null;
  if (text && typeof text.message === "string" && text.values) return t(text.message, text.values);
  return String(error);
}

/**
 * The Updates group for the About section of Settings: checking automatically, the version with its release notes
 * and the update action, and the update channel. `onReport` adds a "Send report" link to a failed update.
 */
export function UpdatesSettings({ onReport }: { onReport?: (message: UpdaterText) => void }) {
  const { app, t, locale } = useFlare();
  const status = useUpdateStatus();
  // The version the install dialog was opened for, so it closes rather than carrying on for a newer one that replaces
  // it, as on the update button.
  const [confirmFor, setConfirmFor] = useState<string | null>(null);
  const [settings, setSettings] = useState<UpdateSettings | null>(null);
  const [saveError, setSaveError] = useState<{ setting: "autoCheck" | "channel"; message: string } | null>(null);
  const updateNotes = "notes" in status ? releaseNoteItems(status.notes) : [];
  const updateVersion = "version" in status ? status.version : undefined;

  useEffect(() => {
    void updates.settings().then(setSettings);
  }, []);

  function change(setting: "autoCheck" | "channel", next: UpdateSettings, save: () => Promise<unknown>) {
    const previous = settings;
    setSettings(next);
    setSaveError(null);
    save().catch((error: unknown) => {
      setSettings(previous);
      setSaveError({ setting, message: failure(error, t) });
    });
  }

  function errorFor(setting: "autoCheck" | "channel") {
    return saveError?.setting === setting ? (
      <span className="text-danger">{t("That didn't save: {error}", { error: saveError.message })}</span>
    ) : null;
  }

  return (
    <SettingsGroup title={t("Updates")}>
      <SettingRow
        id="auto-update-check"
        label={t("Check for updates automatically")}
        description={errorFor("autoCheck") ?? t("When {app} starts and every few hours.", { app: app.name })}
      >
        <Switch
          id="auto-update-check"
          aria-describedby="auto-update-check-description"
          checked={settings?.autoCheck ?? true}
          disabled={!settings}
          onCheckedChange={(autoCheck) =>
            settings && change("autoCheck", { ...settings, autoCheck }, () => updates.setAutoCheck(autoCheck))
          }
        />
      </SettingRow>

      <div className="flex flex-col gap-3 px-4 py-3.5">
        <div className="flex items-center justify-between gap-6">
          <div className="min-w-0">
            <p className="flex flex-wrap items-baseline gap-x-2 text-[13px] font-medium">
              {t("Version")}
              <span className="data selectable text-xs font-normal text-muted-foreground">{app.version}</span>
              {app.releaseNotes.length > 0 && (
                <ReleaseNotesLink
                  version={app.version}
                  items={app.releaseNotes}
                  description={t("The changes in the version you are running.")}
                />
              )}
            </p>
            <p
              className={cn("mt-0.5 text-xs", status.state === "error" ? "text-danger" : "text-muted-foreground")}
              aria-live="polite"
            >
              {status.state === "error" && <CircleAlert className="mr-1 inline size-3.5 align-[-2px]" aria-hidden />}
              {describeUpdate(status, t, app.name, locale)}
              {status.state === "error" && onReport && (
                <>
                  {" "}
                  <Button
                    variant="link"
                    className="h-auto p-0 text-xs font-normal"
                    onClick={() => onReport(status.message)}
                  >
                    {t("Send report")}
                  </Button>
                </>
              )}
              {updateVersion && updateNotes.length > 0 && (
                <>
                  {" "}
                  <ReleaseNotesLink
                    label={t("See what's new")}
                    version={updateVersion}
                    items={updateNotes}
                    description={t("The changes in the update waiting for you.")}
                  />
                </>
              )}
            </p>
          </div>
          <div className="shrink-0">
            <UpdateAction status={status} onRestart={() => updateVersion && setConfirmFor(updateVersion)} />
            {status.state === "ready" && (
              <InstallUpdateDialog
                version={status.version}
                open={confirmFor === status.version}
                onOpenChange={(open) => setConfirmFor(open ? status.version : null)}
              />
            )}
          </div>
        </div>
        {status.state === "downloading" && (
          <Progress
            value={status.percent}
            className="h-2 [&>*]:duration-1000 [&>*]:ease-linear motion-reduce:[&>*]:transition-none"
            aria-label={t("Update download progress")}
          />
        )}
      </div>

      <SettingRow
        id="update-channel"
        label={t("Update channel")}
        description={errorFor("channel") ?? t("Stable releases, or beta builds with newer changes.")}
      >
        <Select
          value={settings?.channel}
          disabled={!settings}
          onValueChange={(value) => {
            const channel = value as UpdateChannel;
            // Saving also checks the new channel; the result shows in the version row.
            if (settings) change("channel", { ...settings, channel }, () => updates.setChannel(channel));
          }}
        >
          <SelectTrigger id="update-channel" aria-describedby="update-channel-description" className="w-32 shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="stable">{t("Stable")}</SelectItem>
            <SelectItem value="beta">{t("Beta")}</SelectItem>
          </SelectContent>
        </Select>
      </SettingRow>
    </SettingsGroup>
  );
}
