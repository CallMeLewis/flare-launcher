import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { backend } from "@/lib/backend";

/** Confirmation before a downloaded update installs. The installer runs silently, so this is the only prompt. */
export function InstallUpdateDialog({
  version,
  open,
  onOpenChange,
}: {
  version: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Install version {version}?</AlertDialogTitle>
          <AlertDialogDescription>
            Flare Launcher will close, install the update in the background and open again in a few seconds. If DayZ is
            running, it will keep running.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Not now</AlertDialogCancel>
          <AlertDialogAction
            // A failed install shows on the update icon.
            onClick={() => void backend.installUpdate().catch(() => {})}
          >
            Install and restart
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
