import { Clock, List, Network, Package, Settings as SettingsIcon, Star, type LucideIcon } from "lucide-react";
import { UpdateButton } from "@/components/update-button";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type View = "all" | "favourites" | "recent" | "lan" | "mods";

const count = new Intl.NumberFormat();

type Props = {
  view: View;
  onViewChange: (view: View) => void;
  /** `null` for a list whose size isn't known yet. */
  counts: Record<View, number | null>;
  onOpenSettings: () => void;
};

type Item = { view: View; label: string; icon: LucideIcon };

const SERVER_LISTS: Item[] = [
  { view: "all", label: "All servers", icon: List },
  { view: "favourites", label: "Favourites", icon: Star },
  { view: "recent", label: "Recent", icon: Clock },
  { view: "lan", label: "LAN", icon: Network },
];
const LIBRARY: Item[] = [{ view: "mods", label: "Mods", icon: Package }];

export function AppSidebar({ view, onViewChange, counts, onOpenSettings }: Props) {
  const link = ({ view: item, label, icon: Icon }: Item) => {
    const active = item === view;
    const itemCount = counts[item];
    return (
      <button
        key={item}
        type="button"
        aria-current={active ? "page" : undefined}
        title={label}
        onClick={() => onViewChange(item)}
        className={cn(
          "flex h-9 items-center justify-center gap-2.5 rounded-md text-[13px] transition-colors duration-150 focus-visible:outline-2 xl:justify-start xl:px-2.5",
          active
            ? "bg-accent font-medium text-foreground"
            : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
        )}
      >
        <Icon className={cn("size-4", active && "text-primary")} aria-hidden />
        <span className="max-xl:sr-only">{label}</span>
        {itemCount !== null && (
          <span className="data ml-auto text-xs text-muted-foreground max-xl:hidden">{count.format(itemCount)}</span>
        )}
      </button>
    );
  };

  return (
    <aside className="flex w-14 shrink-0 flex-col border-r bg-card xl:w-48">
      {/* The app's name and logo sit in the title bar above. */}
      <nav aria-label="Server lists" className="flex flex-col gap-0.5 px-2 pt-3">
        {SERVER_LISTS.map(link)}
      </nav>
      <nav aria-label="Your library" className="mx-2 mt-3 flex flex-col gap-0.5 border-t pt-3">
        {LIBRARY.map(link)}
      </nav>

      {/* Settings and the update button share one row; folded, they stack to fit the narrow sidebar. */}
      <div className="mt-auto flex items-center justify-between gap-1 border-t p-2 max-xl:flex-col">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Settings"
              onClick={onOpenSettings}
              className="text-muted-foreground hover:text-foreground"
            >
              <SettingsIcon className="size-5" aria-hidden />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Settings</TooltipContent>
        </Tooltip>
        <UpdateButton />
      </div>
    </aside>
  );
}
