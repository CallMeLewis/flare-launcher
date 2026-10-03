import { useId, useLayoutEffect, useRef, useState } from "react";
import { Link, ListFilter, RefreshCw, Search, X } from "lucide-react";
import { FilterMenu } from "@/components/filter-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useActiveOption } from "@/hooks/use-active-option";
import { NO_FILTERS, filterChips, type FilterChip, type Filters, type Option } from "@/lib/filter";
import { cn } from "@/lib/utils";

const count = new Intl.NumberFormat();

type Props = {
  filters: Filters;
  onChange: (filters: Filters) => void;
  /** Saved lists only offer the search box. */
  filtersEnabled: boolean;
  maps: Option[];
  versions: Option[];
  /** Mods in the list, busiest first. */
  mods: Option[];
  shown: number;
  total: number;
  refreshing: boolean;
  onRefresh: () => void;
  /** What refreshing does in this list, for the button's label. */
  refreshLabel: string;
  onJoinByAddress: () => void;
};

export function ServerToolbar({
  filters,
  onChange,
  filtersEnabled,
  maps,
  versions,
  mods,
  shown,
  total,
  refreshing,
  onRefresh,
  refreshLabel,
  onJoinByAddress,
}: Props) {
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });
  const chips = filterChips(filters);
  const reset = () => onChange({ ...NO_FILTERS, search: filters.search });
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="border-b">
      <div className="flex items-center gap-2 px-4 py-3">
        <SmartSearch
          filters={filters}
          onChange={set}
          suggest={filtersEnabled}
          maps={maps}
          versions={versions}
          mods={mods}
        />

        {filtersEnabled && (
          <>
            <Popover open={menuOpen} onOpenChange={setMenuOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    "shrink-0 gap-1.5 px-2.5 text-[13px] font-normal",
                    chips.length > 0 && "border-primary/50 bg-primary/10 dark:border-primary/50 dark:bg-primary/10",
                  )}
                >
                  <ListFilter aria-hidden />
                  Filters
                  {chips.length > 0 && (
                    <span className="data min-w-4 rounded-full bg-primary px-1.5 text-[11px] leading-4 text-primary-foreground">
                      {chips.length}
                      <span className="sr-only"> on</span>
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" collisionPadding={12} className="w-[600px] p-0">
                <FilterMenu
                  filters={filters}
                  onChange={set}
                  maps={maps}
                  versions={versions}
                  mods={mods}
                  shown={shown}
                  canReset={chips.length > 0}
                  onReset={reset}
                />
              </PopoverContent>
            </Popover>
          </>
        )}

        {filtersEnabled && chips.length > 0 && (
          <ChipStrip
            chips={chips}
            onRemove={(chip) => set(chip.clear)}
            onClear={reset}
            onMore={() => setMenuOpen(true)}
          />
        )}

        <div className="ml-auto flex shrink-0 items-center gap-2 pl-2">
          <p className="text-xs whitespace-nowrap text-muted-foreground" aria-live="polite">
            <span className="data text-foreground">{count.format(shown)}</span>
            {shown !== total && <> of {count.format(total)}</>} {total === 1 ? "server" : "servers"}
          </p>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Join by address" onClick={onJoinByAddress}>
                <Link className="size-4" aria-hidden />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Join by address</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={refreshLabel}
                disabled={refreshing}
                onClick={onRefresh}
              >
                <RefreshCw
                  className={cn("size-4", refreshing && "animate-spin motion-reduce:animate-none")}
                  aria-hidden
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{refreshLabel}</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}

const CHIP_GAP = 6;

/**
 * The filters that are on, on one line. Chips that don't fit fold into a "+N more" chip that opens the Filters
 * menu, so the toolbar never grows a second row. Widths come from an invisible copy of every chip.
 */
function ChipStrip({
  chips,
  onRemove,
  onClear,
  onMore,
}: {
  chips: FilterChip[];
  onRemove: (chip: FilterChip) => void;
  onClear: () => void;
  onMore: () => void;
}) {
  const strip = useRef<HTMLDivElement>(null);
  const measure = useRef<HTMLUListElement>(null);
  const [fit, setFit] = useState({ shown: chips.length, clear: true });

  useLayoutEffect(() => {
    const container = strip.current;
    const copies = measure.current;
    if (!container || !copies) return;
    const update = () => {
      const widths = [...copies.children].map((child) => (child as HTMLElement).offsetWidth + CHIP_GAP);
      const [clearWidth, moreWidth] = widths.splice(-2);
      const room = container.clientWidth + CHIP_GAP;
      const total = (count: number) => widths.slice(0, count).reduce((sum, width) => sum + width, 0);
      const fitting = (reserve: number) => {
        let shown = chips.length;
        while (shown > 0 && total(shown) + (shown < chips.length ? moreWidth : 0) + reserve > room) shown -= 1;
        return shown;
      };
      // Clear all goes first when room is short: chips matter more, and the menu has Reset filters.
      const withClear = fitting(clearWidth);
      const withoutClear = fitting(0);
      const clear =
        withClear === withoutClear &&
        total(withClear) + (withClear < chips.length ? moreWidth : 0) + clearWidth <= room;
      const shown = clear ? withClear : withoutClear;
      setFit((last) => (last.shown === shown && last.clear === clear ? last : { shown, clear }));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, [chips]);

  const hidden = chips.length - fit.shown;
  return (
    <div ref={strip} className="relative flex min-w-52 flex-1 items-center overflow-hidden pl-1">
      <ul aria-label="Filters on" className="flex items-center gap-1.5 whitespace-nowrap">
        {chips.slice(0, fit.shown).map((chip) => (
          <Chip key={chip.key} chip={chip} onRemove={() => onRemove(chip)} />
        ))}
        {hidden > 0 && (
          <li>
            <button
              type="button"
              onClick={onMore}
              aria-label={`${hidden} more ${hidden === 1 ? "filter" : "filters"} on, open Filters`}
              className="flex h-6 items-center rounded-full border bg-muted px-2.5 text-xs transition-colors duration-150 hover:bg-accent focus-visible:outline-2"
            >
              +{hidden} more
            </button>
          </li>
        )}
        {fit.clear && (
          <li>
            <ClearAll onClick={onClear} />
          </li>
        )}
      </ul>
      {/* Laid out but never seen or reached, only measured. */}
      <ul ref={measure} aria-hidden inert className="invisible absolute top-0 left-0 flex gap-1.5 whitespace-nowrap">
        {chips.map((chip) => (
          <Chip key={chip.key} chip={chip} onRemove={() => {}} />
        ))}
        <li>
          <ClearAll onClick={() => {}} />
        </li>
        <li className="flex h-6 items-center rounded-full border px-2.5 text-xs">+{chips.length} more</li>
      </ul>
    </div>
  );
}

function Chip({ chip, onRemove }: { chip: FilterChip; onRemove: () => void }) {
  return (
    <li className="flex h-6 max-w-72 shrink-0 items-center gap-1 rounded-full border bg-muted pr-0.5 pl-2.5 text-xs">
      {chip.prefix && <span className="shrink-0 text-muted-foreground">{chip.prefix}</span>}
      <span className="truncate" title={chip.label}>
        {chip.label}
      </span>
      <button
        type="button"
        aria-label={`Remove filter: ${chip.prefix ? `${chip.prefix} ` : ""}${chip.label}`}
        onClick={onRemove}
        className="flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:outline-2"
      >
        <X className="size-3" aria-hidden />
      </button>
    </li>
  );
}

function ClearAll({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="ml-1 rounded text-xs text-muted-foreground underline-offset-2 transition-colors duration-150 hover:text-foreground hover:underline focus-visible:outline-2"
    >
      Clear all
    </button>
  );
}

type Suggestion = { kind: string; label: string; count?: number; patch: Partial<Filters> };

const SUGGESTIONS_PER_KIND = { map: 3, mod: 4, version: 2 };

/** Suggestions for what has been typed: maps, mods and versions that can become filters. */
function suggestionsFor(
  term: string,
  filters: Filters,
  maps: Option[],
  versions: Option[],
  mods: Option[],
): Suggestion[] {
  const matching = (options: Option[], limit: number, skip: (value: string) => boolean) =>
    options.filter(({ value }) => !skip(value) && value.toLowerCase().includes(term)).slice(0, limit);
  return [
    ...matching(maps, SUGGESTIONS_PER_KIND.map, (map) => map === filters.map).map((option) => ({
      kind: "Map",
      label: option.value,
      count: option.count,
      patch: { map: option.value },
    })),
    ...(filters.mods === "vanilla"
      ? []
      : matching(mods, SUGGESTIONS_PER_KIND.mod, (mod) => filters.requiredMods.includes(mod)).map((option) => ({
          kind: "Mod",
          label: option.value,
          count: option.count,
          patch: { requiredMods: [...filters.requiredMods, option.value] },
        }))),
    // Only a number looks like a version; letters would match nothing useful.
    ...(/^\d/.test(term)
      ? matching(versions, SUGGESTIONS_PER_KIND.version, (version) => version === filters.version).map((option) => ({
          kind: "Version",
          label: option.value,
          count: option.count,
          patch: { version: option.value },
        }))
      : []),
  ];
}

/**
 * The search box. Typing at least two letters also offers maps, mods and versions; choosing one turns it into a
 * filter, shown as a chip, and clears what was typed. Enter on its own keeps the typed text as a plain search.
 */
function SmartSearch({
  filters,
  onChange,
  suggest,
  maps,
  versions,
  mods,
}: {
  filters: Filters;
  onChange: (patch: Partial<Filters>) => void;
  suggest: boolean;
  maps: Option[];
  versions: Option[];
  mods: Option[];
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const term = filters.search.trim().toLowerCase();
  const suggestions = open && suggest && term.length >= 2 ? suggestionsFor(term, filters, maps, versions, mods) : [];
  const choose = (index: number) => {
    onChange({ ...suggestions[index].patch, search: "" });
    setOpen(false);
  };
  const { active, setActive, onKeyDown } = useActiveOption(suggestions.length, choose, () => setOpen(false));

  return (
    <div className="relative w-[26rem] min-w-40">
      <Search
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        type="search"
        role="combobox"
        aria-label="Search servers"
        aria-expanded={suggestions.length > 0}
        aria-controls={`${id}-list`}
        aria-activedescendant={active >= 0 ? `${id}-${active}` : undefined}
        aria-autocomplete="list"
        autoComplete="off"
        spellCheck={false}
        placeholder={suggest ? "Search servers, maps or mods" : "Search name, map, IP or mod"}
        value={filters.search}
        onChange={(event) => {
          onChange({ search: event.target.value });
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        className="h-8 pr-8 pl-8 text-[13px] [&::-webkit-search-cancel-button]:hidden"
      />
      {filters.search && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange({ search: "" })}
          className="absolute top-1/2 right-1 flex size-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-2"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      )}
      {suggestions.length > 0 && (
        <div className="absolute inset-x-0 top-full z-50 mt-1 rounded-lg border bg-popover p-1 shadow-lg">
          <ul id={`${id}-list`} role="listbox" aria-label="Add a filter">
            {suggestions.map((suggestion, index) => (
              <li
                key={`${suggestion.kind}:${suggestion.label}`}
                id={`${id}-${index}`}
                role="option"
                aria-selected={index === active}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(index)}
                onMouseEnter={() => setActive(index)}
                className={cn(
                  "flex h-8 cursor-pointer items-center gap-3 rounded-md px-2 text-[13px]",
                  index === active && "bg-accent",
                )}
              >
                <span className="w-14 shrink-0 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                  {suggestion.kind}
                </span>
                <span className={cn("truncate", suggestion.kind === "Version" && "data text-xs")}>
                  {suggestion.label}
                </span>
                {suggestion.count !== undefined && (
                  <span className="data ml-auto shrink-0 text-xs text-muted-foreground">
                    {count.format(suggestion.count)} {suggestion.count === 1 ? "server" : "servers"}
                  </span>
                )}
              </li>
            ))}
          </ul>
          <p className="border-t px-2 pt-1.5 pb-1 text-[11px] text-muted-foreground">
            Choose one to add it as a filter, or press Enter to search names for “{filters.search.trim()}”.
          </p>
        </div>
      )}
    </div>
  );
}
