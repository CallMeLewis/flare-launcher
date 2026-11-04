import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import type { MessageDescriptor } from "@lingui/core";
import { msg, plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ArrowDown,
  ArrowUp,
  BadgeCheck,
  Copy,
  Download,
  Link2,
  Lock,
  Moon,
  Play,
  Puzzle,
  Star,
  StarOff,
  Sun,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/ui/components/button";
import { Skeleton } from "@/ui/components/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/ui/components/tooltip";
import type { PingResult, Pings } from "@/hooks/use-pings";
import { compareGameVersions, isNight, livePlayers, matchedMod, type Sort, type SortKey } from "@/lib/filter";
import { CountryFlag } from "@/components/country-flag";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { joinAddress } from "@/lib/format";
import { copyJoinLink } from "@/lib/share";
import { mapName } from "@/lib/maps";
import type { ServerRow } from "@/lib/types";
import { cn } from "@/lib/utils";

const ROW_HEIGHT = 36;
// Narrow layouts drop the Time column so server names keep their room. Players fits "124/127 +123", Time
// "06:19 ×12" and Ping "aprox. 247"; anything wider only pushes the numbers apart.
const COLUMNS =
  "grid grid-cols-[36px_minmax(0,1fr)_104px_64px_104px_72px] lg:grid-cols-[36px_minmax(0,1fr)_112px_68px_104px_88px_76px] 2xl:grid-cols-[36px_minmax(0,1fr)_168px_84px_120px_104px_84px] items-center";
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
  { key: "country", label: msg`Country` },
  { key: "players", label: msg`Players`, descendingFirst: true },
  { key: "time", label: msg`Time` },
  {
    key: "ping",
    label: msg`Ping`,
    numeric: true,
    hint: msg`How long it takes to reach the server and back, in milliseconds. Servers that don't answer pings show an estimate, marked est.`,
  },
];

function pingTone(pingMs: number): string {
  if (pingMs < 60) return "text-success/85";
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
  /** Downloads a server's mods without starting DayZ. */
  onLoadMods: (row: ServerRow) => void;
  favourites: ReadonlySet<string>;
  /** Saved servers missing from the server list, shown from what was last known about them. */
  unlisted: ReadonlySet<string>;
  onToggleFavourite: (id: string) => void;
  pings: Pings;
  /** The current search, to show which mod a server was found through. */
  search: string;
  modNames: readonly string[];
  /** The DayZ version on this computer, to mark servers running another. */
  gameVersion: string | null;
  /** A labelled line before the row at `at`, to set the pinned favourites apart from the servers the filters matched. */
  divider: { at: number; label: string } | null;
  empty: ReactNode;
};

const DIVIDER_HEIGHT = 28;

export function ServerTable({
  rows,
  loading,
  sort,
  onSort,
  selectedId,
  onSelect,
  onPlay,
  onLoadMods,
  favourites,
  unlisted,
  onToggleFavourite,
  pings,
  search,
  modNames,
  gameVersion,
  divider,
  empty,
}: Props) {
  const { t, i18n } = useLingui();
  const scroller = useRef<HTMLDivElement>(null);
  // The server the right-click menu is for.
  const [menuRow, setMenuRow] = useState<ServerRow | null>(null);
  const dividerAt = divider?.at ?? null;
  // What each place in the list holds: a server, or `null` for the divider.
  const places = useMemo(
    () => (dividerAt === null ? rows : [...rows.slice(0, dividerAt), null, ...rows.slice(dividerAt)]),
    [rows, dividerAt],
  );
  // Keyed by server, so the virtualizer works out the places again when the divider moves.
  const getItemKey = useCallback((index: number) => places[index]?.id ?? "divider", [places]);
  const virtualizer = useVirtualizer({
    count: places.length,
    getScrollElement: () => scroller.current,
    estimateSize: (index) => (places[index] === null ? DIVIDER_HEIGHT : ROW_HEIGHT),
    getItemKey,
    overscan: 12,
  });
  const items = virtualizer.getVirtualItems();
  const first = items[0]?.index ?? 0;
  const last = items[items.length - 1]?.index ?? -1;
  /** Where the server at `index` in `rows` sits in the list, past the divider. */
  const placeOf = (index: number) => (dividerAt !== null && index >= dividerAt ? index + 1 : index);

  // Ping the rows on screen once scrolling settles.
  const { request } = pings;
  useEffect(() => {
    if (last < first) return;
    const timer = setTimeout(() => {
      request(
        places
          .slice(first, last + 1)
          .filter((row) => row !== null)
          .map((row) => row.id),
        true,
      );
    }, 200);
    return () => clearTimeout(timer);
  }, [places, first, last, request]);

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
      case "ContextMenu":
      case "F10":
        if (event.key === "F10" && !event.shiftKey) return;
        event.preventDefault();
        if (current >= 0) openMenuAt(rows[current].id);
        return;
      default:
        return;
    }
    event.preventDefault();
    onSelect(rows[next].id);
    virtualizer.scrollToIndex(placeOf(next));
  }

  /** From the keyboard, opens the menu under the selected row as if it had been right-clicked. */
  function openMenuAt(id: string) {
    const element = document.getElementById(`server-${id}`);
    if (!element) return;
    const box = element.getBoundingClientRect();
    element.dispatchEvent(
      new window.MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: box.left + 48,
        clientY: box.bottom,
      }),
    );
  }

  /** Right-clicking a row selects it and opens the menu for it. Anywhere else, such as the headers, opens nothing. */
  function onContextMenu(event: MouseEvent<HTMLDivElement>) {
    const element = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-server-id]") : null;
    const row = element && rows.find((r) => r.id === element.dataset.serverId);
    if (!row) {
      event.preventDefault();
      return;
    }
    setMenuRow(row);
    onSelect(row.id);
  }

  async function copyAddress(row: ServerRow) {
    try {
      await navigator.clipboard.writeText(joinAddress(row));
      toast.success(t`Address copied`);
    } catch {
      toast.error(t`Couldn't copy the address`);
    }
  }

  const menuFavourite = menuRow ? favourites.has(menuRow.id) : false;

  return (
    <ContextMenu onOpenChange={(open) => !open && setMenuRow(null)}>
      {/* A grid, so the selected row is announced. It takes focus as a whole and arrow keys move the selection. */}
      <ContextMenuTrigger asChild onContextMenu={onContextMenu}>
        <div
          role="grid"
          aria-label={t`Servers`}
          aria-readonly
          aria-rowcount={places.length + 1}
          tabIndex={0}
          aria-activedescendant={selectedId ? `server-${selectedId}` : undefined}
          onKeyDown={onKeyDown}
          className="flex min-h-0 flex-1 flex-col focus-visible:outline-2 focus-visible:-outline-offset-2"
        >
          {/* An empty list has nothing to sort, so its message stands alone. */}
          <div
            role="rowgroup"
            className={cn(
              "overflow-y-hidden border-b bg-card/60 [scrollbar-gutter:stable]",
              !loading && rows.length === 0 && "hidden",
            )}
          >
            <div
              role="row"
              className={cn(COLUMNS, "h-8 text-[11px] font-medium tracking-wider text-muted-foreground uppercase")}
            >
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
                    <Skeleton className="h-3.5 w-6" />
                    <Skeleton className="h-3.5 w-12" />
                    <Skeleton className={cn("h-3.5 w-12", TIME_COLUMN)} />
                    <span />
                  </div>
                ))}
              </div>
            ) : rows.length === 0 ? (
              <div className="flex min-h-full flex-col">{empty}</div>
            ) : (
              <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
                {items.map((item) => {
                  const row = places[item.index];
                  if (row === null) {
                    return (
                      <div
                        key="divider"
                        role="row"
                        aria-rowindex={item.index + 2}
                        style={{ transform: `translateY(${item.start}px)`, height: DIVIDER_HEIGHT }}
                        className="absolute inset-x-0 top-0 flex items-center border-b border-border/50 bg-card/60 pl-9 text-xs text-muted-foreground"
                      >
                        <div role="gridcell" aria-colspan={HEADERS.length + 1}>
                          {divider?.label}
                        </div>
                      </div>
                    );
                  }
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
                      gameVersion={gameVersion}
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
      </ContextMenuTrigger>
      {menuRow && (
        <ContextMenuContent aria-label={menuRow.name} className="min-w-48">
          <ContextMenuItem onSelect={() => onPlay(menuRow)}>
            <Play aria-hidden />
            <Trans>Play</Trans>
          </ContextMenuItem>
          <ContextMenuItem disabled={menuRow.modCount === 0} onSelect={() => onLoadMods(menuRow)}>
            <Download aria-hidden />
            <Trans>Download mods only</Trans>
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={() => onToggleFavourite(menuRow.id)}>
            {menuFavourite ? <StarOff aria-hidden /> : <Star aria-hidden />}
            {menuFavourite ? <Trans>Remove from favourites</Trans> : <Trans>Add to favourites</Trans>}
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => void copyAddress(menuRow)}>
            <Copy aria-hidden />
            <Trans>Copy address</Trans>
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => void copyJoinLink(menuRow)}>
            <Link2 aria-hidden />
            <Trans>Copy join link</Trans>
          </ContextMenuItem>
        </ContextMenuContent>
      )}
    </ContextMenu>
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
  gameVersion: string | null;
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
  gameVersion,
  onSelect,
  onPlay,
  onToggleFavourite,
}: RowProps) {
  // Also re-renders the memoised row when the language changes.
  const { t, i18n } = useLingui();
  const name = row.name;
  // Only a server that changes the speed of time says so.
  const speed =
    row.timeAcceleration && row.timeAcceleration !== 1 && !unlisted ? i18n.number(row.timeAcceleration) : null;
  const offline = unlisted || ping?.offline === true;
  // Players waiting in DayZ's login queue: when the server is full, and on any server just after a restart.
  const queue = !offline && ping?.queue ? ping.queue : 0;
  // The server's own count once it has answered, as the list's can be well out of date, and the queue beside it is
  // the server's own too.
  const { players, maxPlayers } = livePlayers(row, ping);
  const TimeIcon = isNight(row.time) ? Moon : Sun;
  const version = row.version;
  const versionDiffers = compareGameVersions(version, gameVersion);
  const versionNote =
    versionDiffers === -1
      ? t`Runs an older version of DayZ (${version}) than this computer (${gameVersion})`
      : versionDiffers === 1
        ? t`Runs a newer version of DayZ (${version}) than this computer (${gameVersion})`
        : null;

  return (
    <div
      id={`server-${row.id}`}
      data-server-id={row.id}
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

      <div role="gridcell" className="flex min-w-0 items-center gap-2 pr-3">
        <span className={cn("truncate", selected && "font-medium")} title={row.name}>
          {row.name}
        </span>
        {/* The marks line up in one column down the list, just before the space kept for Play. */}
        <span className="ml-auto flex min-w-0 shrink-0 items-center gap-2 pl-1">
          {row.verified && (
            <span
              title={t`Verified owner: they've proved they run this server.`}
              className="flex shrink-0 items-center gap-1 rounded border border-verified/40 bg-verified/10 pr-1.5 pl-1 text-[11px] leading-4 font-semibold text-verified uppercase"
            >
              <BadgeCheck className="size-3" aria-hidden />
              <Trans>Verified</Trans>
            </span>
          )}
          {versionNote && (
            <span className="shrink-0 text-warning" title={versionNote}>
              <TriangleAlert className="size-3" role="img" aria-label={versionNote} />
            </span>
          )}
          {row.password && (
            <span className="shrink-0 text-warning" title={t`Password protected`}>
              <Lock className="size-3" role="img" aria-label={t`Password protected`} />
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
              className="flex max-w-40 min-w-0 items-center gap-1 rounded border border-primary/30 bg-primary/10 px-1.5 text-xs leading-4 text-foreground/85"
            >
              <Puzzle className="size-3 shrink-0 text-primary" aria-hidden />
              <span className="truncate">{modMatch}</span>
            </span>
          )}
        </span>
        {/*
          Shown on hover, but always laid out, so it never covers the marks before it and names don't shift when it
          appears. Out of the Tab order like the star: Enter on the list plays the selected server.
        */}
        <Button
          size="xs"
          tabIndex={-1}
          onClick={(event) => {
            event.stopPropagation();
            onPlay(row);
          }}
          onDoubleClick={(event) => event.stopPropagation()}
          className="invisible group-hover:visible"
        >
          <Play fill="currentColor" aria-hidden />
          <Trans>Play</Trans>
        </Button>
      </div>

      <div role="gridcell" className="truncate pr-3 text-muted-foreground" title={mapName(row.map)}>
        {mapName(row.map)}
      </div>

      <div role="gridcell" className="flex items-center gap-1.5 pr-3">
        {row.country && (
          <>
            <CountryFlag code={row.country} />
            <span className="data text-[11px] text-muted-foreground" aria-hidden>
              {row.country}
            </span>
          </>
        )}
      </div>

      <div role="gridcell" className="flex items-center gap-2 pr-3">
        {unlisted ? (
          <span className="data w-[52px] text-right text-xs text-muted-foreground">–</span>
        ) : (
          <span className="data w-[52px] text-right text-xs">
            {players}
            <span className="text-muted-foreground">/{maxPlayers}</span>
          </span>
        )}
        {queue > 0 && <QueueValue queue={queue} short />}
      </div>

      <div role="gridcell" className={cn("flex items-center gap-1.5 text-muted-foreground", TIME_COLUMN)}>
        {row.time && !unlisted && (
          <>
            <TimeIcon className="size-3" role="img" aria-label={isNight(row.time) ? t`Night` : t`Day`} />
            <span className="data text-xs">{row.time}</span>
            {speed && (
              <span className="data text-[11px] text-muted-foreground/80" title={t`${speed}× speed`}>
                ×{speed}
              </span>
            )}
          </>
        )}
      </div>

      <div role="gridcell" className="data pr-3 text-right text-xs">
        <PingValue ping={ping} offline={offline} unit={false} />
      </div>
    </div>
  );
});

/**
 * How full a server is, as a thin bar under its player count in the detail panel. Full servers fill it in the warning
 * colour; the count above it says the same in numbers.
 */
export function Fill({ players, maxPlayers, className }: { players: number; maxPlayers: number; className?: string }) {
  const fraction = maxPlayers > 0 ? Math.min(players / maxPlayers, 1) : 0;
  const full = maxPlayers > 0 && players >= maxPlayers;
  return (
    <span className={cn("block h-0.5 w-full overflow-hidden rounded-full bg-control", className)} aria-hidden>
      <span
        className={cn("block h-full rounded-full", full ? "bg-warning/60" : "bg-muted-foreground/45")}
        style={{ width: `${Math.max(fraction * 100, players > 0 ? 6 : 0)}%` }}
      />
    </span>
  );
}

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

/**
 * How many players are waiting in DayZ's login queue: "+12" in the list, where the hover says what it is, and
 * "12 queued" where there's room.
 */
export function QueueValue({
  queue,
  short = false,
  muted = false,
}: {
  queue: number;
  short?: boolean;
  /** Muted where something beside it already marks the server as full, such as the detail panel's bar. */
  muted?: boolean;
}) {
  const { t } = useLingui();
  const label = t`${plural(queue, { one: "# player", other: "# players" })} waiting to join`;
  if (short) {
    return (
      <span className="data text-xs whitespace-nowrap text-warning" title={label}>
        <span aria-hidden>+{queue}</span>
        <span className="sr-only">{label}</span>
      </span>
    );
  }
  return (
    <span
      className={cn("text-[11px] font-medium whitespace-nowrap", muted ? "text-muted-foreground" : "text-warning")}
      title={label}
    >
      <Trans comment="Players waiting in a server's login queue, kept as short as possible">
        <span className="data text-xs">{queue}</span> queued
      </Trans>
    </span>
  );
}

/** A server's ping, coloured by how good it is. `unit` adds "ms", left off in the list, whose header says it. */
export function PingValue({
  ping,
  offline = false,
  unit = true,
}: {
  ping: PingResult | undefined;
  offline?: boolean;
  unit?: boolean;
}) {
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
  const value = (
    <span className={pingTone(ping.pingMs)}>
      {ping.pingMs}
      {unit && <span className="ml-0.5 text-muted-foreground">ms</span>}
    </span>
  );
  if (!ping.estimated) return value;
  // Coloured like a real ping. Worked out from the fastest of several status replies, it usually lands within 10 ms of
  // one. A server whose DDoS protection answered for it (it skipped the challenge DayZ servers send) gets its own
  // tooltip, as the protection can answer from much closer than the server: a US server can read 6 ms from the UK.
  return (
    <span className="whitespace-nowrap">
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            onClick={(event) => event.stopPropagation()}
            className="mr-1 cursor-help font-sans text-[11px] text-muted-foreground"
          >
            <Trans comment="Short for estimated, before a ping the launcher had to estimate. Kept as short as possible">
              est.
            </Trans>
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-64">
          {ping.cached ? (
            <Trans>
              This server doesn't answer pings, and its DDoS protection answered the status request for it, so the
              server may be much further away than this.
            </Trans>
          ) : (
            <Trans>
              This server doesn't answer pings, so this is estimated from how quickly it answers status requests.
              Servers behind DDoS protection may answer from somewhere closer than the server itself.
            </Trans>
          )}
        </TooltipContent>
      </Tooltip>
      {value}
    </span>
  );
}
