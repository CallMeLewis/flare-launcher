import type { LucideIcon } from "lucide-react";
import { Settings } from "lucide-react";
import { cn } from "cn";
import { useFlare } from "../lib/flare";
import { Button } from "../components/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/tooltip";
import { UpdateButton } from "../updates/update-button";

export interface SidebarItem<Id extends string> {
  id: Id;
  label: string;
  icon: LucideIcon;
  /** Shown on the right in the numbers font, such as a count or a percentage, while the labels show. */
  badge?: string;
  /** What the badge means to a screen reader, such as "42% done". */
  badgeLabel?: string;
  /** Marks the page with a pulsing dot while it's working, such as building, also when the sidebar is folded. */
  busy?: boolean;
}

export interface SidebarSection<Id extends string> {
  /** Names the section's navigation for screen readers. */
  label: string;
  items: SidebarItem<Id>[];
}

/**
 * The app's sidebar: its pages in sections, with Settings and the update button at the bottom. 224px wide, and folded
 * to 56px of icons by itself below 1280px; there is no toggle to manage. The app's name and mark sit in the title bar
 * above.
 */
export function AppSidebar<Id extends string>({
  sections,
  active,
  onSelect,
  onOpenSettings,
}: {
  sections: SidebarSection<Id>[];
  active: Id;
  onSelect: (id: Id) => void;
  onOpenSettings: () => void;
}) {
  const { t } = useFlare();
  const link = ({ id, label, icon: Icon, badge, badgeLabel, busy }: SidebarItem<Id>) => {
    const current = id === active;
    return (
      <button
        key={id}
        type="button"
        aria-current={current ? "page" : undefined}
        title={label}
        onClick={() => onSelect(id)}
        className={cn(
          "relative flex h-9 items-center justify-center gap-2.5 rounded-md text-[13px] transition-colors duration-150 focus-visible:outline-2 xl:justify-start xl:px-2.5",
          // The current page is marked by a bar on its left edge, so the mark reads as a place rather than a colour.
          current
            ? "bg-accent font-medium text-foreground before:absolute before:top-2 before:bottom-2 before:left-0 before:w-0.5 before:rounded-full before:bg-primary"
            : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
        )}
      >
        <Icon className="size-4" aria-hidden />
        <span className="min-w-0 truncate max-xl:sr-only">{label}</span>
        {badge !== undefined && (
          <span
            className={cn(
              "data ml-auto rounded px-1.5 text-[11px] leading-5 max-xl:hidden",
              current ? "bg-background/60 text-foreground" : "text-muted-foreground",
            )}
            aria-label={badgeLabel}
          >
            {badge}
          </span>
        )}
        {busy && (
          <span
            className={cn(
              "size-1.5 animate-pulse rounded-full bg-warning motion-reduce:animate-none max-xl:absolute max-xl:top-2 max-xl:right-2",
              badge === undefined && "xl:ml-auto",
            )}
          >
            <span className="sr-only">{t("Working")}</span>
          </span>
        )}
      </button>
    );
  };

  return (
    <aside className="flex w-14 shrink-0 flex-col border-r bg-card xl:w-56">
      {sections.map((section, index) => (
        <nav
          key={section.label}
          aria-label={section.label}
          className={cn(
            "flex flex-col gap-0.5",
            index === 0 ? "px-2 pt-3" : "mx-2 mt-3 border-t pt-3 xl:border-t-0 xl:pt-2",
          )}
        >
          {/* Named on screen once there's room for the labels; the folded sidebar keeps its divider instead. */}
          <h2
            aria-hidden
            className="px-2.5 pt-1 pb-1.5 text-[11px] font-medium tracking-wider text-muted-foreground uppercase max-xl:hidden"
          >
            {section.label}
          </h2>
          {section.items.map(link)}
        </nav>
      ))}

      {/* Settings and the update button share one row; folded, they stack to fit the narrow sidebar. */}
      <div className="mt-auto flex items-center justify-between gap-1 border-t p-2 max-xl:flex-col">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("Settings")}
              onClick={onOpenSettings}
              className="text-muted-foreground hover:text-foreground"
            >
              <Settings className="size-5" aria-hidden />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">{t("Settings")}</TooltipContent>
        </Tooltip>
        <UpdateButton />
      </div>
    </aside>
  );
}
