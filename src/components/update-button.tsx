import { useState } from "react";
import { RefreshCw } from "lucide-react";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { InstallUpdateDialog } from "@/components/install-update-dialog";
import { ReleaseNotesList } from "@/components/release-notes";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useUpdateStatus } from "@/hooks/use-update-status";
import { backend } from "@/lib/backend";
import { backendText } from "@/lib/backend-messages";
import { releaseNoteItems } from "@/lib/release-notes";
import type { UpdateStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

function label(status: UpdateStatus): MessageDescriptor {
  switch (status.state) {
    case "checking":
      return msg`Checking for updates…`;
    case "available": {
      const version = status.version;
      return msg`Download version ${version}`;
    }
    case "downloading": {
      const percent = Math.floor(status.percent);
      return msg`Downloading update… ${percent}%`;
    }
    case "ready": {
      const version = status.version;
      return msg`Restart to update to version ${version}`;
    }
    case "error": {
      const message = backendText(status.message);
      return msg`${message} Select to try again.`;
    }
    default:
      return msg`Check for updates`;
  }
}

/**
 * One icon button that walks through the whole update: check, download (with a filling ring), then restart to
 * install. Hidden in development builds, which cannot update themselves.
 */
export function UpdateButton() {
  const { i18n, t } = useLingui();
  const status = useUpdateStatus();
  const [confirmOpen, setConfirmOpen] = useState(false);
  if (status.state === "unsupported") return null;

  const busy = status.state === "checking" || status.state === "downloading";
  const text = i18n._(label(status));
  // What the new version changes, shown with the label while it is on offer (hover or keyboard focus).
  const notes = "notes" in status ? releaseNoteItems(status.notes) : [];

  // No toasts: the icon shows how each step went, and its tooltip says what happened.
  function onClick() {
    if (busy) return;
    if (status.state === "available") void backend.downloadUpdate();
    else if (status.state === "ready") setConfirmOpen(true);
    else void backend.checkForUpdates();
  }

  return (
    <>
      {/* A short delay so the release notes don't pop up while the pointer is just passing over. */}
      <Tooltip delayDuration={500}>
        <TooltipTrigger asChild>
          {/* aria-disabled rather than disabled while busy, so the tooltip still shows progress. */}
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "shrink-0 rounded-full text-muted-foreground hover:text-foreground aria-disabled:cursor-default",
              (status.state === "available" || status.state === "ready") && "text-foreground",
            )}
            aria-label={text}
            aria-disabled={busy || undefined}
            onClick={onClick}
          >
            <UpdateIcon status={status} />
          </Button>
        </TooltipTrigger>
        {notes.length > 0 ? (
          <TooltipContent
            side="right"
            align="end"
            className="block max-w-sm bg-popover px-3.5 py-3 text-popover-foreground shadow-md ring-1 ring-border **:data-[slot=tooltip-arrow]:bg-popover **:data-[slot=tooltip-arrow]:fill-popover"
          >
            <p className="font-semibold">{text}</p>
            <p className="mt-2 font-medium opacity-80">
              <Trans>What's new</Trans>
            </p>
            <ReleaseNotesList items={notes} className="mt-1 leading-relaxed" />
          </TooltipContent>
        ) : (
          <TooltipContent side="right">{text}</TooltipContent>
        )}
      </Tooltip>
      {/* Announces state changes without reading out every percent of the download. */}
      <span className="sr-only" aria-live="polite">
        {status.state === "downloading"
          ? t`Downloading update`
          : busy || status.state === "available" || status.state === "ready"
            ? text
            : ""}
      </span>

      {status.state === "ready" && (
        <InstallUpdateDialog version={status.version} open={confirmOpen} onOpenChange={setConfirmOpen} />
      )}
    </>
  );
}

// Circle the download ring is drawn on, in the 30x30 icon box.
const RING_RADIUS = 14;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

function UpdateIcon({ status }: { status: UpdateStatus }) {
  if (status.state === "ready") {
    // Restart arrow with a check badge.
    return (
      <svg viewBox="0 0 26 26" className="size-6 text-primary" fill="currentColor" aria-hidden>
        <path
          fillRule="evenodd"
          d="M18,3 V9 H12 V7.5 H15.9 A7,7 0 1 0 9,19 V20.5 A8.5,8.5 0 1 1 16.5,5.8 V3 Z M24,18 A6,6 0 1 1 12,18 A6,6 0 1 1 24,18 Z M14.5,18 L17,20.5 L21.5,16 L20.5,15 L17,18.5 L15.5,17 Z"
        />
      </svg>
    );
  }

  if (status.state === "available" || status.state === "downloading") {
    const percent = status.state === "downloading" ? Math.min(100, Math.max(0, status.percent)) : null;
    return (
      <svg viewBox="0 0 30 30" className="size-8" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
        {percent !== null && (
          <>
            <circle cx={15} cy={15} r={RING_RADIUS} opacity={0.25} />
            {/* Starts at the top and fills clockwise. A butt cap at 0% keeps the empty arc from showing as a dot. */}
            <circle
              cx={15}
              cy={15}
              r={RING_RADIUS}
              strokeLinecap={percent > 0 ? "round" : "butt"}
              strokeDasharray={RING_LENGTH}
              strokeDashoffset={RING_LENGTH * (1 - percent / 100)}
              transform="rotate(-90 15 15)"
              // Progress arrives a few times a second: a linear glide keeps the ring moving between reports.
              className="stroke-primary transition-[stroke-dashoffset] duration-1000 ease-linear motion-reduce:transition-none"
            />
          </>
        )}
        <path
          d="M12,4.5 V14.5 M7.5,10 L12,14.5 L16.5,10 M5.5,15 V18.5 Q5.5,19.5 6.5,19.5 H17.5 Q18.5,19.5 18.5,18.5 V15"
          transform="translate(3 3)"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {percent === null && <circle cx={22} cy={8} r={3} className="fill-primary stroke-none" />}
      </svg>
    );
  }

  return (
    <span className="relative">
      <RefreshCw
        aria-hidden
        className={cn(
          "size-5",
          status.state === "checking" && "animate-spin [animation-duration:1s] motion-reduce:animate-none",
        )}
      />
      {/* The last check failed: a red dot, like the green one that marks an update on offer. */}
      {status.state === "error" && (
        <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-danger" aria-hidden />
      )}
    </span>
  );
}
