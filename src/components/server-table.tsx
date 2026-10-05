import { memo, useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp, Lock, Moon, Puzzle, Star, Sun } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { PingResult, Pings } from "@/hooks/use-pings";
import { isNight, matchedMod, type Sort, type SortKey } from "@/lib/filter";
import { mapName } from "@/lib/maps";
import type { ServerRow } from "@/lib/types";
import { cn } from "@/lib/utils";

const ROW_HEIGHT = 36;
// Narrow layouts drop the Time column so server names keep their room.
const COLUMNS =
  "grid grid-cols-[36px_minmax(0,1fr)_104px_116px_72px] lg:grid-cols-[36px_minmax(0,1fr)_112px_124px_76px_76px] 2xl:grid-cols-[36px_minmax(0,1fr)_168px_148px_96px_96px] items-center";
const TIME_COLUMN = "max-lg:hidden";

const HEADERS: {
  key: SortKey;
  label: MessageDescriptor;
  numeric?: boolean;
  descendingFirst?: boolean;
  hint?: MessageDescriptor;
}[] = [
  { key: "name", label: msg`Server` },
  { key: "map", label: msg`Map` },
  { key: "players", label: msg`Players`, descendingFirst: true },
  { key: "time", label: msg`Time` },
  {
    key: "ping",
    label: msg`Ping`,
    numeric: true,
    hint: msg`How long it takes to reach the server and back. Values marked ~ are estimates.`,
  },
];

function pingTone(pingMs: number): string {
  if (pingMs < 60) return "text-success";
  if (pingMs < 120) return "text-warning";
  return "text-danger";
}

type Props = {
  rows: ServerRow[];
  loading: boolean;
  sort: Sort;
  onSort: (sort: Sort) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onPlay: (row: ServerRow) => void;
  favourites: ReadonlySet<string>;
  /** Saved servers missing from the server list, shown from what was last known about them. */
  unlisted: ReadonlySet<string>;
  onToggleFavourite: (id: string) => void;
  pings: Pings;
  /** The current search, to show which mod a server was found through. */
  search: string;
  modNames: readonly string[];
  empty: ReactNode;
};

export function ServerTable({
  rows,
  loading,
  sort,
  onSort,
  selectedId,
  onSelect,
  onPlay,
  favourites,
  unlisted,
  onToggleFavourite,
  pings,
  search,
  modNames,
  empty,
}: Props) {
  const { t, i18n } = useLingui();
  const scroller = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });
  const items = virtualizer.getVirtualItems();
  const first = items[0]?.index ?? 0;
  const last = items[items.length - 1]?.index ?? -1;

  // Ping the rows on screen once scrolling settles.
  const { request } = pings;
  useEffect(() => {
    if (last < first) return;
    const timer = setTimeout(() => {
      request(
        rows.slice(first, last + 1).map((row) => row.id),
        true,
      );
    }, 200);
    return () => clearTimeout(timer);
  }, [rows, first, last, request]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    // Keys pressed on a sort header belong to that button, not the list.
    if (event.target !== event.currentTarget || rows.length === 0) return;
    const current = rows.findIndex((row) => row.id === selectedId);
    let next: number;
    switch (event.key) {
      case "ArrowDown":
        next = Math.min(current + 1, rows.length - 1);
        break;
      case "ArrowUp":
        next = Math.max(current - 1, 0);
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = rows.length - 1;
        break;
      case "Enter":
        if (current >= 0) onPlay(rows[current]);
        return;
      default:
        return;
    }
    event.preventDefault();
    onSelect(rows[next].id);
    virtualizer.scrollToIndex(next);
  }

  return (
    // A grid, so the selected row is announced. It takes focus as a whole and arrow keys move the selection.
    <div
      role="grid"
      aria-label={t`Servers`}
      aria-readonly
      aria-rowcount={rows.length + 1}
      tabIndex={0}
      aria-activedescendant={selectedId ? `server-${selectedId}` : undefined}
      onKeyDown={onKeyDown}
      className="flex min-h-0 flex-1 flex-col focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset"
    >
      <div role="rowgroup" className="overflow-y-hidden border-b bg-card/60 [scrollbar-gutter:stable]">
        <div role="row" className={cn(COLUMNS, "h-8 text-xs font-medium text-muted-foreground")}>
          <div role="columnheader" aria-label={t`Favourite`} />
          {HEADERS.map((header) => {
            const active = sort.key === header.key;
            const Arrow = sort.descending ? ArrowDown : ArrowUp;
            return (
              <div
                key={header.key}
                role="columnheader"
                aria-sort={active ? (sort.descending ? "descending" : "ascending") : "none"}
                className={cn("flex", header.numeric && "justify-end pr-3", header.key === "time" && TIME_COLUMN)}
              >
                <button
                  type="button"
                  title={header.hint && i18n._(header.hint)}
                  onClick={() =>
                    onSort({
                      key: header.key,
                      descending: active ? !sort.descending : Boolean(header.descendingFirst),
                    })
                  }
                  className={cn(
                    "flex h-8 items-center gap-1 rounded-sm px-1 -mx-1 transition-colors duration-150 hover:text-foreground focus-visible:outline-2",
                    active && "text-foreground",
                  )}
                >
                  {i18n._(header.label)}
                  {active && <Arrow className="size-3" aria-hidden />}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div ref={scroller} role="rowgroup" className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        {loading ? (
          <div aria-busy="true" aria-label={t`Loading servers`}>
            {Array.from({ length: 18 }, (_, i) => (
              <div key={i} className={cn(COLUMNS, "h-9 border-b border-border/50")}>
                <span />
                <Skeleton className="h-3.5" style={{ width: `${35 + ((i * 37) % 45)}%` }} />
                <Skeleton className="h-3.5 w-16" />
                <Skeleton className="h-3.5 w-20" />
                <Skeleton className={cn("h-3.5 w-12", TIME_COLUMN)} />
                <span />
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          empty
        ) : (
          <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
            {items.map((item) => {
              const row = rows[item.index];
              return (
                <Row
                  key={row.id}
                  row={row}
                  index={item.index}
                  top={item.start}
                  selected={row.id === selectedId}
                  favourite={favourites.has(row.id)}
                  unlisted={unlisted.has(row.id)}
                  ping={pings.get(row.id)}
                  modMatch={search ? matchedMod(row, search, modNames) : null}
                  onSelect={onSelect}
                  onPlay={onPlay}
                  onToggleFavourite={onToggleFavourite}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

type RowProps = {
  row: ServerRow;
  index: number;
  top: number;
  selected: boolean;
  favourite: boolean;
  unlisted: boolean;
  ping: PingResult | undefined;
  modMatch: string | null;
  onSelect: (id: string) => void;
  onPlay: (row: ServerRow) => void;
  onToggleFavourite: (id: string) => void;
};

const Row = memo(function Row({
  row,
  index,
  top,
  selected,
  favourite,
  unlisted,
  ping,
  modMatch,
  onSelect,
  onPlay,
  onToggleFavourite,
}: RowProps) {
  // Also re-renders the memoised row when the language changes.
  const { t } = useLingui();
  const name = row.name;
  const offline = unlisted || ping?.offline === true;
  const full = row.maxPlayers > 0 && row.players >= row.maxPlayers;
  const fill = row.maxPlayers > 0 ? Math.min(row.players / row.maxPlayers, 1) : 0;
  const TimeIcon = isNight(row.time) ? Moon : Sun;

  return (
    <div
      id={`server-${row.id}`}
      role="row"
      aria-rowindex={index + 2}
      aria-selected={selected}
      onClick={() => onSelect(row.id)}
      onDoubleClick={() => onPlay(row)}
      style={{ transform: `translateY(${top}px)`, height: ROW_HEIGHT }}
      className={cn(
        COLUMNS,
        "group absolute inset-x-0 top-0 border-b border-border/50 text-[13px] transition-colors duration-100",
        selected
          ? "bg-row-selected shadow-[inset_2px_0_0_var(--primary)]"
          : cn("hover:bg-row-hover", index % 2 === 1 && "bg-row-stripe"),
        // Dimmed past the star, which stays as clear as on any other row.
        offline && "[&>*:not(:first-child)]:opacity-60",
      )}
    >
      <div role="gridcell" className="flex justify-center">
        {/* Out of the Tab order so the list is one stop; the detail panel has the same star for keyboard users. */}
        <button
          type="button"
          tabIndex={-1}
          aria-label={favourite ? t`Remove ${name} from favourites` : t`Add ${name} to favourites`}
          aria-pressed={favourite}
          onClick={(event) => {
            event.stopPropagation();
            onToggleFavourite(row.id);
          }}
          onDoubleClick={(event) => event.stopPropagation()}
          className={cn(
            "flex size-7 items-center justify-center rounded-md transition-colors duration-150 focus-visible:outline-2",
            favourite
              ? "text-warning"
              : "text-muted-foreground/70 hover:text-foreground group-hover:text-muted-foreground",
          )}
        >
          <Star className="size-3.5" fill={favourite ? "currentColor" : "none"} aria-hidden />
        </button>
      </div>

      <div role="gridcell" className="flex min-w-0 items-center gap-2 pr-4">
        <span className="truncate font-medium" title={row.name}>
          {row.name}
        </span>
        {row.password && (
          <span className="shrink-0 text-warning" title={t`Password protected`}>
            <Lock className="size-3" aria-label={t`Password protected`} />
          </span>
        )}
        {row.firstPersonOnly && (
          <Tag title={t`First person only`}>
            <Trans>1PP</Trans>
          </Tag>
        )}
        {row.official && (
          <Tag title={t`Official server`}>
            <Trans>Official</Trans>
          </Tag>
        )}
        {modMatch && (
          <span
            title={t`Runs the mod ${modMatch}`}
            className="flex max-w-[45%] min-w-0 shrink-0 items-center gap-1 rounded border border-primary/30 bg-primary/10 px-1.5 text-xs leading-4 text-foreground/85"
          >
            <Puzzle className="size-3 shrink-0 text-primary" aria-hidden />
            <span className="truncate">{modMatch}</span>
          </span>
        )}
      </div>

      <div role="gridcell" className="truncate pr-3 text-muted-foreground" title={mapName(row.map)}>
        {mapName(row.map)}
      </div>

      <div role="gridcell" className="flex items-center gap-2 pr-3">
        {unlisted ? (
          <span className="data w-[52px] text-right text-xs text-muted-foreground">–</span>
        ) : (
          <span className={cn("data w-[52px] text-right text-xs", full && "text-warning")}>
            {row.players}
            <span className="text-muted-foreground">/{row.maxPlayers}</span>
          </span>
        )}
        <span className="h-1 w-12 overflow-hidden rounded-full bg-muted" aria-hidden>
          <span
            className={cn("block h-full rounded-full", full ? "bg-warning" : "bg-primary")}
            style={{ width: `${fill * 100}%` }}
          />
        </span>
      </div>

      <div role="gridcell" className={cn("flex items-center gap-1.5 text-muted-foreground", TIME_COLUMN)}>
        {row.time && !unlisted && (
          <>
            <TimeIcon className="size-3" aria-label={isNight(row.time) ? t`Night` : t`Day`} />
            <span className="data text-xs">{row.time}</span>
          </>
        )}
      </div>

      <div role="gridcell" className="data pr-3 text-right text-xs">
        <PingValue ping={ping} offline={offline} />
      </div>
    </div>
  );
});

function Tag({ title, children }: { title: string; children: ReactNode }) {
  return (
    <span
      title={title}
      className="shrink-0 rounded border border-border bg-muted/60 px-1 text-[11px] leading-4 font-medium text-muted-foreground uppercase"
    >
      {children}
    </span>
  );
}

export function PingValue({ ping, offline = false }: { ping: PingResult | undefined; offline?: boolean }) {
  const { t } = useLingui();
  if (offline) {
    return (
      <span
        className="font-sans text-muted-foreground"
        title={t`This server isn't answering, so it's probably offline or restarting.`}
      >
        <Trans>Offline</Trans>
      </span>
    );
  }
  if (!ping) return <span className="text-muted-foreground/50">···</span>;
  if (ping.pingMs === null) {
    return (
      <span className="text-muted-foreground" title={t`No response`}>
        –
      </span>
    );
  }
  return (
    <span
      className={pingTone(ping.pingMs)}
      title={
        ping.estimated
          ? t`This server doesn't answer pings, so this is how long it took to answer a status request. That's usually a little higher than the real ping.`
          : undefined
      }
    >
      {ping.estimated && <span className="text-muted-foreground">~</span>}
      {ping.pingMs}
      <span className="ml-0.5 text-muted-foreground">ms</span>
    </span>
  );
}
