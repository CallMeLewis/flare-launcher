import { useRef } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** Raises `vm.max_map_count` to what DayZ needs (as in `launch.rs`), now and after every restart. */
const COMMANDS = `echo "vm.max_map_count = 1048576" | sudo tee /etc/sysctl.d/dayz.conf
sudo sysctl --system`;

/** How to raise the system's memory map limit, which is too low for DayZ on some Linux systems. */
export function MapCountDialog({
  limit,
  open,
  onOpenChange,
  onDismiss,
}: {
  limit: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Stops the warning for good. */
  onDismiss: () => void;
}) {
  const { t, i18n } = useLingui();
  const current = i18n.number(limit);
  const copyButton = useRef<HTMLButtonElement>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(COMMANDS);
      toast.success(t`Commands copied`);
    } catch {
      toast.error(t`Couldn't copy the commands`);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-xl"
        // Not Don't show again, which comes first: pressing Enter shouldn't turn the warning off for good.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          copyButton.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-base">
            <Trans>Stop DayZ freezing</Trans>
          </DialogTitle>
          <DialogDescription className="text-[13px]">
            <Trans>
              This computer lets a program use up to {current} memory areas. DayZ needs more, so it can freeze in the
              main menu or soon after joining a server.
            </Trans>
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-w-0 flex-col gap-2">
          <p className="text-[13px]">
            <Trans>
              Run these commands in a terminal. The first keeps the new limit after a restart, the second applies it
              straight away.
            </Trans>
          </p>
          <pre className="data selectable overflow-x-auto rounded-md border bg-card p-3 text-xs leading-relaxed">
            {COMMANDS}
          </pre>
          <p className="text-xs text-muted-foreground">
            <Trans>They ask for your password. This warning goes away once the limit is raised.</Trans>
          </p>
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => {
              onDismiss();
              onOpenChange(false);
            }}
          >
            {t`Don't show again`}
          </Button>
          <Button ref={copyButton} variant="secondary" onClick={copy}>
            <Copy aria-hidden />
            <Trans>Copy the commands</Trans>
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <Trans>Close</Trans>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
