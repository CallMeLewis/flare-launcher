import { useEffect, useState, type ReactNode } from "react";
import { cn } from "cn";
import { useFlare } from "../lib/flare";

async function appWindow() {
  const { isTauri } = await import("@tauri-apps/api/core");
  if (!isTauri()) return null;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  return getCurrentWindow();
}

/**
 * The window's own title bar, in place of the Windows one: the app's mark and name, then the caption buttons.
 * Dragging it moves the window, double-clicking it maximises, and the caption buttons follow Windows' size and
 * behaviour so the window still feels native. Closing goes through the usual close request, so an app that asks
 * before closing still asks.
 */
export function TitleBar({
  mark,
  markClassName = "bg-primary/15 text-primary",
}: {
  /** The app's mark, such as the flare from its icon, drawn in the current text colour at `size-3.5`. */
  mark: ReactNode;
  /** The tile behind the mark: the app's colour, faint, with the mark in it at full strength. */
  markClassName?: string;
}) {
  const { app, t } = useFlare();
  const maximised = useMaximised();

  return (
    <header className="flex h-8 shrink-0 items-center border-b bg-card select-none">
      {/* Drags only start on the element marked as the drag region, so the brand inside lets clicks pass through. */}
      <div data-tauri-drag-region className="flex h-full flex-1 items-center gap-2 pl-3">
        <span
          className={cn("pointer-events-none flex size-5 items-center justify-center rounded", markClassName)}
          aria-hidden
        >
          {mark}
        </span>
        <span className="pointer-events-none text-xs font-medium">{app.name}</span>
      </div>

      <div className="flex h-full">
        <CaptionButton label={t("Minimise")} onClick={() => void appWindow().then((w) => w?.minimize())}>
          <path d="M0 5.5 H10" />
        </CaptionButton>
        <CaptionButton
          label={maximised ? t("Restore down") : t("Maximise")}
          onClick={() => void appWindow().then((w) => w?.toggleMaximize())}
        >
          {maximised ? (
            <>
              <rect x={0.5} y={2.5} width={7} height={7} rx={1} />
              <path d="M2.5 2.5 V1.5 Q2.5 0.5 3.5 0.5 H8.5 Q9.5 0.5 9.5 1.5 V6.5 Q9.5 7.5 8.5 7.5 H7.5" />
            </>
          ) : (
            <rect x={0.5} y={0.5} width={9} height={9} rx={1} />
          )}
        </CaptionButton>
        <CaptionButton label={t("Close")} close onClick={() => void appWindow().then((w) => w?.close())}>
          <path d="M0.5 0.5 L9.5 9.5 M9.5 0.5 L0.5 9.5" />
        </CaptionButton>
      </div>
    </header>
  );
}

function CaptionButton({
  label,
  close,
  onClick,
  children,
}: {
  label: string;
  close?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      // Out of the Tab order, like the Windows caption buttons; Alt+F4 and Win+arrow keys still work.
      tabIndex={-1}
      onClick={onClick}
      className={cn(
        "flex h-full w-[46px] items-center justify-center text-muted-foreground transition-colors duration-100",
        close ? "hover:bg-caption-close hover:text-white" : "hover:bg-accent hover:text-foreground",
      )}
    >
      <svg
        viewBox="0 0 10 10"
        className="size-2.5 overflow-visible"
        fill="none"
        stroke="currentColor"
        strokeWidth={1}
        aria-hidden
      >
        {children}
      </svg>
    </button>
  );
}

/** Whether the window is maximised, so the middle button can offer to restore it. */
function useMaximised(): boolean {
  const [maximised, setMaximised] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let stop: (() => void) | undefined;
    void appWindow().then(async (w) => {
      if (!w || cancelled) return;
      const update = () => void w.isMaximized().then((value) => !cancelled && setMaximised(value));
      update();
      const unlisten = await w.onResized(update);
      if (cancelled) unlisten();
      else stop = unlisten;
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);
  return maximised;
}
