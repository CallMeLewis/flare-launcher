import type { ReactNode } from "react";
import { TitleBar } from "./title-bar";

/**
 * The window's layout in every Flare app: the title bar across the top, then the sidebar beside the page. The page is
 * the app's own: usually a `<main>` that fills the rest of the row (`flex min-w-0 flex-1`), with any detail panel
 * beside it or status bar under it.
 */
export function AppShell({
  mark,
  markClassName,
  systemTitleBar = false,
  sidebar,
  children,
}: {
  /** The app's mark for the title bar. */
  mark: ReactNode;
  markClassName?: string;
  /** The window has the system's title bar instead of this app's own, as on Linux. */
  systemTitleBar?: boolean;
  sidebar: ReactNode;
  /** Laid out in the row beside the sidebar. */
  children: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col">
      {!systemTitleBar && <TitleBar mark={mark} markClassName={markClassName} />}
      <div className="flex min-h-0 flex-1">
        {sidebar}
        {children}
      </div>
    </div>
  );
}
