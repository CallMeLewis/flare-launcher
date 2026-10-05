import { useEffect, type ReactNode } from "react";
import { plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { Circle, CircleAlert, CircleCheck, CircleX, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { mapName } from "@/lib/maps";
import type { ServerRow } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * DayZ starting for a server, once its mods are ready. The launcher can follow it until the game opens; loading and
 * joining happen inside the game, where only DayZ's own loading screen shows how far it has got.
 */
export type GameStart = {
  server: ServerRow;
  modCount: number;
  /** `slow` when the game hasn't opened in time, `failed` when it couldn't be started. */
  stage: "starting" | "running" | "slow" | "failed";
  error?: string;
};

/** How long the finished dialog stays up before closing itself. */
const CLOSE_AFTER_MS = 4000;

type StepState = "done" | "current" | "pending" | "warning" | "error";

export function GameStartDialog({ start, onClose }: { start: GameStart | null; onClose: () => void }) {
  const { t } = useLingui();
  const stage = start?.stage;
  useEffect(() => {
    if (stage !== "running") return;
    const timer = setTimeout(onClose, CLOSE_AFTER_MS);
    return () => clearTimeout(timer);
  }, [stage, onClose]);

  if (!start) return null;
  const { server, modCount } = start;
  const name = server.name;
  const startState: StepState =
    stage === "starting" ? "current" : stage === "slow" ? "warning" : stage === "failed" ? "error" : "done";

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      {/* Darker than other dialogs: the app waits on the game while this is up. */}
      <DialogContent className="gap-5 sm:max-w-md" overlayClassName="bg-black/80">
        <div className="flex min-w-0 flex-col gap-1.5 pr-6">
          <DialogTitle className="text-base">
            <Trans>
              <span className="text-muted-foreground">Joining </span>
              <span className="break-words">{name}</span>
            </Trans>
          </DialogTitle>
          <DialogDescription className="data text-xs">
            {server.ip}:{server.gamePort} · {mapName(server.map)}
          </DialogDescription>
        </div>

        <ol className="flex flex-col gap-3" aria-live="polite">
          <Step
            state="done"
            title={t`Mods ready`}
            detail={
              modCount === 0
                ? t`This server doesn't need any mods.`
                : plural(modCount, { one: "# mod", other: "# mods" })
            }
          />
          <Step
            state={startState}
            title={t`Starting DayZ`}
            detail={
              stage === "slow"
                ? t`It hasn't opened yet. It may still be loading; if it doesn't open, check Steam for a message.`
                : stage === "failed"
                  ? start.error
                  : stage === "starting"
                    ? t`Steam and BattlEye check the game before it opens. This can take a minute.`
                    : undefined
            }
          />
          <Step
            state={stage === "running" ? "done" : "pending"}
            title={t`DayZ is open`}
            detail={stage === "running" ? t`It joins the server as soon as it has loaded.` : undefined}
          />
        </ol>

        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose}>
            {stage === "starting" ? <Trans>Hide</Trans> : <Trans>Close</Trans>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Step({ state, title, detail }: { state: StepState; title: string; detail?: string }) {
  const { t } = useLingui();
  const icons: Record<StepState, ReactNode> = {
    done: <CircleCheck className="size-4 text-success" aria-label={t`Done`} />,
    current: (
      <Loader2 className="size-4 animate-spin text-primary motion-reduce:animate-none" aria-label={t`In progress`} />
    ),
    pending: <Circle className="size-4 text-muted-foreground/60" aria-label={t`Not started`} />,
    warning: <CircleAlert className="size-4 text-warning" aria-label={t`Taking longer than usual`} />,
    error: <CircleX className="size-4 text-danger" aria-label={t`Failed`} />,
  };

  return (
    <li className="flex gap-3" aria-current={state === "current" ? "step" : undefined}>
      <span className="mt-px shrink-0">{icons[state]}</span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className={cn("text-sm font-medium", state === "pending" && "text-muted-foreground")}>{title}</span>
        {detail && (
          <span className={cn("text-xs text-muted-foreground", state === "error" && "text-danger")}>{detail}</span>
        )}
      </span>
    </li>
  );
}
