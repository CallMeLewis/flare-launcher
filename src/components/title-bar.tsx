import { useEffect, useState, type ReactNode } from "react";
import { backend, hasSystemTitleBar } from "@/lib/backend";
import { cn } from "@/lib/utils";

/**
 * The window's own title bar, in place of the Windows one. Dragging it moves the window, double-clicking it
 * maximises, and the caption buttons follow Windows' size and behaviour so the window still feels native.
 * Hidden when the window has the system title bar instead, as it does on Linux.
 */
export function TitleBar() {
  const maximised = useMaximised();
  if (hasSystemTitleBar) return null;

  return (
    <header className="flex h-8 shrink-0 items-center border-b bg-card select-none">
      {/* Drags only start on the element marked as the drag region, so the brand inside lets clicks pass through. */}
      <div data-tauri-drag-region className="flex h-full flex-1 items-center gap-2 pl-3">
        <span className="pointer-events-none flex size-5 items-center justify-center rounded bg-primary/15 text-primary">
          <FlareMark className="size-3.5" />
        </span>
        <span className="pointer-events-none text-xs font-medium text-muted-foreground">Flare Launcher</span>
      </div>

      <div className="flex h-full">
        <CaptionButton label="Minimise" onClick={() => void backend.minimiseWindow()}>
          <path d="M0 5.5 H10" />
        </CaptionButton>
        <CaptionButton
          label={maximised ? "Restore down" : "Maximise"}
          onClick={() => void backend.toggleMaximiseWindow()}
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
        <CaptionButton label="Close" close onClick={() => void backend.closeWindow()}>
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
    const update = () => void backend.isWindowMaximised().then((value) => !cancelled && setMaximised(value));
    update();
    void backend.onWindowResized(update).then((unlisten) => {
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

/** The flare from the app icon, without its frame, in the current text colour. */
function FlareMark({ className }: { className?: string }) {
  return (
    <svg viewBox="207 137 700 700" className={className} aria-hidden>
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth={60}>
        <path d="M262 806 Q 300 590 470 552" strokeOpacity={0.5} />
        <path d="M590 265V168M706.7 313.3l68.6-68.6M755 430h97M706.7 546.7l68.6 68.6M590 595v97M425 430h-97M473.3 313.3l-68.6-68.6" />
      </g>
      <circle cx={590} cy={430} r={100} fill="currentColor" />
    </svg>
  );
}
