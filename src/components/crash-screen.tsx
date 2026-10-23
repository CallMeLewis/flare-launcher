import { Component, type ErrorInfo, type ReactNode } from "react";
import { TitleBar } from "@flare/ui";
import { Button } from "@flare/ui/ui/button";
import { useLingui } from "@lingui/react/macro";
import { TriangleAlert } from "lucide-react";
import { AppMark } from "@/components/app-mark";
import { Message } from "@/components/message";
import { backend, hasSystemTitleBar } from "@/lib/backend";

/**
 * Catches an error that would otherwise leave an empty window, logs it for the next problem report and offers to
 * reload. Saved settings, favourites and filters survive the reload.
 */
export class CrashBoundary extends Component<{ children: ReactNode }, { crashed: boolean }> {
  state = { crashed: false };

  static getDerivedStateFromError() {
    return { crashed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    void backend.logInterfaceError(`${message}${info.componentStack ?? ""}`);
  }

  render() {
    return this.state.crashed ? <CrashScreen /> : this.props.children;
  }
}

function CrashScreen() {
  const { t } = useLingui();
  return (
    <div className="flex h-full flex-col">
      {/* Without the launcher's own title bar, the window couldn't be moved or closed on Windows. */}
      {!hasSystemTitleBar && <TitleBar mark={<AppMark className="size-3.5" />} />}
      <Message
        icon={<TriangleAlert className="size-6" aria-hidden />}
        title={t`Something went wrong`}
        description={t`The launcher ran into a problem it couldn't recover from. Reload to carry on: your settings and favourites are kept.`}
        action={<Button onClick={() => window.location.reload()}>{t`Reload`}</Button>}
      />
    </div>
  );
}
