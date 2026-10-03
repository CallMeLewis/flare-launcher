import { Clock, List, Network, Settings as SettingsIcon, Star, type LucideIcon } from "lucide-react";
import { UpdateButton } from "@/components/update-button";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type View = "all" | "favourites" | "recent" | "lan";

const count = new Intl.NumberFormat();

type Props = {
  view: View;
  onViewChange: (view: View) => void;
  counts: Record<View, number>;
  onOpenSettings: () => void;
};

export function AppSidebar({ view, onViewChange, counts, onOpenSettings }: Props) {
  const items: { view: View; label: string; icon: LucideIcon }[] = [
    { view: "all", label: "All servers", icon: List },
    { view: "favourites", label: "Favourites", icon: Star },
    { view: "recent", label: "Recent", icon: Clock },
    { view: "lan", label: "LAN", icon: Network },
  ];

  return (
    <aside className="flex w-14 shrink-0 flex-col border-r bg-card xl:w-48">
      {/* The app's name and logo sit in the title bar above. */}
      <nav aria-label="Server lists" className="flex flex-col gap-0.5 px-2 pt-3">
        {items.map(({ view: item, label, icon: Icon }) => {
          const active = item === view;
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
              <span className="data ml-auto text-xs text-muted-foreground max-xl:hidden">
                {count.format(counts[item])}
              </span>
            </button>
          );
        })}
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
