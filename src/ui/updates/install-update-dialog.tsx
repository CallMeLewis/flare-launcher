import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import { useFlare } from "../lib/flare";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../components/alert-dialog";
import { updates } from "./api";

/**
 * Confirmation before a downloaded update installs. The installer runs silently, so this is the only prompt. While
 * the app is busy, its `useInstallNotice` adds a warning and can change the install button.
 */
export function InstallUpdateDialog({
  version,
  open,
  onOpenChange,
}: {
  version: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { app, t, useInstallNotice } = useFlare();
  const notice = useInstallNotice();
  // The app closes once the installer starts, so this only ends if starting it fails.
  const [installing, setInstalling] = useState(false);

  function install() {
    setInstalling(true);
    // A failed install shows on the update icon.
    void updates.install().catch(() => {
      setInstalling(false);
      onOpenChange(false);
    });
  }

  const description = t("{app} will close, install the update in the background and open again in a few seconds.", {
    app: app.name,
  });
  return (
    <AlertDialog open={open} onOpenChange={(next) => !installing && onOpenChange(next)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("Install version {version}?", { version })}</AlertDialogTitle>
          <AlertDialogDescription>
            {description}
            {notice?.note && ` ${notice.note}`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={installing}>{t("Not now")}</AlertDialogCancel>
          <AlertDialogAction
            variant={notice?.destructive ? "destructive" : "default"}
            disabled={installing}
            onClick={(event) => {
              // Stays open with a spinner until the app closes.
              event.preventDefault();
              install();
            }}
          >
            {installing && <LoaderCircle className="animate-spin" aria-hidden />}
            {installing ? t("Installing…") : (notice?.confirmLabel ?? t("Install and restart"))}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
