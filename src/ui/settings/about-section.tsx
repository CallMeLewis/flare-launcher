import type { ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import { useFlare } from "../lib/flare";
import { Button } from "../components/button";
import type { UpdaterText } from "../updates/types";
import { UpdatesSettings } from "../updates/updates-settings";

/**
 * Settings > About in every Flare app: the app's icon, name, what it does and who made it, then its updates. `children`
 * come after, for the app's own facts (such as the engine it runs), and `credits` last, for the notices its licences
 * ask for.
 */
export function AboutSection({
  icon,
  tagline,
  author = "CallMeLewis",
  onOpenProject,
  onReport,
  children,
  credits,
}: {
  /** The app's icon, at least 112px across. */
  icon: string;
  /** What the app does, in one line. */
  tagline: string;
  author?: string;
  /** Opens the app's GitHub page. */
  onOpenProject: () => void;
  /** Adds "Send report" to a failed update. */
  onReport?: (message: UpdaterText) => void;
  children?: ReactNode;
  credits?: ReactNode;
}) {
  const { app, t } = useFlare();
  return (
    <>
      <div className="flex items-center gap-4 rounded-lg border bg-card p-4">
        <img src={icon} alt="" className="size-14 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold">{app.name}</p>
          <p className="text-[13px] text-muted-foreground">{tagline}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("Made by {author}", { author })}</p>
        </div>
        <Button variant="outline" size="sm" className="shrink-0" onClick={onOpenProject}>
          <ExternalLink aria-hidden />
          {t("View on GitHub")}
        </Button>
      </div>

      <UpdatesSettings onReport={onReport} />

      {children}

      {credits && <div className="flex flex-col gap-1 text-xs text-muted-foreground">{credits}</div>}
    </>
  );
}
