import { memo, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ArrowDown,
  ArrowUp,
  CircleAlert,
  CircleCheck,
  CircleX,
  Clock,
  Download,
  ExternalLink,
  FolderSearch,
  LoaderCircle,
  PackageX,
  RefreshCw,
  Search,
  SearchX,
  ShieldCheck,
  Star,
  Trash2,
  X,
} from "lucide-react";
import type { MessageDescriptor } from "@lingui/core";
import { msg, plural } from "@lingui/core/macro";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { toast } from "sonner";
import { Message } from "@/components/message";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { SubscribedModsState } from "@/hooks/use-subscribed-mods";
import { backend, errorMessage } from "@/lib/backend";
import { downloadFraction, formatBytes } from "@/lib/format";
import {
  canVerify,
  DEFAULT_MOD_SORT,
  filterMods,
  modName,
  modState,
  needsDownload,
  sortMods,
  type ModJob,
  type ModSort,
  type ModSortKey,
} from "@/lib/mods";
import type { ModProgress, SubscribedMod } from "@/lib/types";
import { cn } from "@/lib/utils";

const ROW_HEIGHT = 36;
// On wide screens the names stop growing and the spare room goes after the last column, so each mod's details stay
// within reading distance of its name.
const COLUMNS =
  "grid grid-cols-[40px_minmax(0,1fr)_84px_92px_124px_164px_44px] 2xl:grid-cols-[40px_minmax(0,44rem)_152px_144px_176px_196px_48px_1fr] items-center";

// Updated reads left to right, so it starts a little after the right-aligned sizes rather than running into them.
const UPDATED_GAP = "pl-4 2xl:pl-6";

const HEADERS: {
  key: ModSortKey;
  label: MessageDescriptor;
  numeric?: boolean;
  descendingFirst?: boolean;
  hint?: MessageDescriptor;
}[] = [
  { key: "name", label: msg`Mod` },
  {
    key: "servers",
    label: msg`Servers`,
    numeric: true,
    descendingFirst: true,
    hint: msg`How many servers in the server list run this mod.`,
  },
  { key: "size", label: msg`Size`, numeric: true, descendingFirst: true },
  {
    key: "updated",
    label: msg`Updated`,
    descendingFirst: true,
    hint: msg`When the mod was last updated on the Workshop.`,
  },
  { key: "status", label: msg`Status` },
];

// Each language's own medium date, such as 24 Sept 2026 or 24.09.2026, so it fits the column in all of them.
const DATE_FORMAT: Intl.DateTimeFormatOptions = { dateStyle: "medium" };

type Props = {
  state: SubscribedModsState;
  /** `undefined` while DayZ is still being looked for. */
  searchingForDayz: boolean;
  /** How many servers run each mod, by Workshop id; `null` until the server list loads. */
  servers: ReadonlyMap<number, number> | null;
  /** The favourite servers running each mod, by Workshop id. */
  favouritesUsing: ReadonlyMap<number, string[]>;
  /** The update or verify in progress, if there is one. */
  job: ModJob | null;
  /** True while mods are downloading or a server is being joined, so nothing else can talk to Steam. */
  busy: boolean;
  onUpdate: (ids: number[]) => void;
  onVerify: (ids: number[]) => void;
  onCancelUpdate: () => void;
  /** Resolves once Steam has unsubscribed; rejects with a message to show. */
  onUnsubscribe: (ids: number[]) => Promise<void>;
  onOpenSettings: () => void;
  onBrowseServers: () => void;
};

export function ModsPage({
  state,
  searchingForDayz,
  servers,
  favouritesUsing,
  job,
  busy,
  onUpdate,
  onVerify,
  onCancelUpdate,
  onUnsubscribe,
  onOpenSettings,
  onBrowseServers,
}: Props) {
  const { t, i18n } = useLingui();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<ModSort>(DEFAULT_MOD_SORT);
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  // Kept after the dialog closes, so its text stays put while it fades out.
  const [confirming, setConfirming] = useState<{ mods: SubscribedMod[]; open: boolean }>({ mods: [], open: false });

  const mods = useMemo(() => state.mods ?? [], [state.mods]);
  const counts = useMemo(() => servers ?? new Map<number, number>(), [servers]);
  const rows = useMemo(() => sortMods(filterMods(mods, search), sort, counts), [mods, search, sort, counts]);
  const toUpdate = useMemo(() => mods.filter(needsDownload), [mods]);
  const toVerify = useMemo(() => mods.filter(canVerify), [mods]);
  const totalSize = mods.reduce((sum, mod) => sum + (mod.size ?? 0), 0);
  // The Workshop answered for none of them, so updates can't be checked.
  const workshopUnreachable = mods.length > 0 && mods.every((mod) => mod.latestUpdatedAt === null && !mod.removed);

  // Mods that have gone, unsubscribed or no longer listed, can't stay selected.
  useEffect(() => {
    setSelected((current) => {
      const present = new Set(mods.map((mod) => mod.id));
      const kept = [...current].filter((id) => present.has(id));
      return kept.length === current.size ? current : new Set(kept);
    });
  }, [mods]);

  const selectedMods = mods.filter((mod) => selected.has(mod.id));
  const toggle = (id: number) =>
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const shownSelected = rows.filter((mod) => selected.has(mod.id)).length;
  const toggleAllShown = () =>
    setSelected((current) => {
      const next = new Set(current);
      if (shownSelected === rows.length) for (const mod of rows) next.delete(mod.id);
      else for (const mod of rows) next.add(mod.id);
      return next;
    });

  const progressById = useMemo(() => new Map(job?.progress.map((p) => [p.id, p])), [job]);

  let body: React.ReactNode;
  if (searchingForDayz || (state.status === "loading" && state.mods === null)) {
    body = <LoadingRows />;
  } else if (state.status === "error") {
    body = (
      <Message
        icon={<CircleAlert className="size-6" aria-hidden />}
        title={t`Your mods couldn't be read`}
        description={state.error}
        action={
          <Button onClick={() => void state.refresh()} disabled={state.refreshing}>
            <Trans>Try again</Trans>
          </Button>
        }
      />
    );
  } else if (state.mods === null) {
    body = (
      <Message
        icon={<FolderSearch className="size-6" aria-hidden />}
        title={t`DayZ wasn't found`}
        description={t`Your mods are listed once the launcher knows where DayZ is. Choose its folder in Settings.`}
        action={
          <Button variant="secondary" onClick={onOpenSettings}>
            <Trans>Open Settings</Trans>
          </Button>
        }
      />
    );
  } else if (mods.length === 0) {
    body = (
      <Message
        icon={<PackageX className="size-6" aria-hidden />}
        title={t`You're not subscribed to any mods`}
        description={t`When you join a server, the mods it needs are subscribed to and show up here.`}
        action={
          <Button variant="secondary" onClick={onBrowseServers}>
            <Trans>Browse servers</Trans>
          </Button>
        }
      />
    );
  } else {
    body = (
      <ModTable
        rows={rows}
        sort={sort}
        onSort={setSort}
        selected={selected}
        onToggle={toggle}
        allShownSelected={rows.length > 0 && shownSelected === rows.length}
        someShownSelected={shownSelected > 0}
        onToggleAllShown={toggleAllShown}
        servers={servers}
        favouritesUsing={favouritesUsing}
        progressById={progressById}
        empty={
          <Message
            icon={<SearchX className="size-6" aria-hidden />}
            title={t`No mods match`}
            description={t`Try a different name or Workshop ID.`}
            action={
              <Button variant="secondary" onClick={() => setSearch("")}>
                <Trans>Clear search</Trans>
              </Button>
            }
          />
        }
      />
    );
  }

  const listed = state.mods !== null && mods.length > 0 && !searchingForDayz;
  const selectedCount = i18n.number(selectedMods.length);
  const shown = i18n.number(rows.length);
  const modCount = mods.length;
  const updateCount = toUpdate.length;

  return (
    <main className="flex min-w-0 flex-1 flex-col">
      <div className="border-b">
        <div className="flex h-14 items-center gap-2 px-4">
          <div className="relative w-[26rem] min-w-40">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              aria-label={t`Search mods`}
              autoComplete="off"
              spellCheck={false}
              placeholder={t`Search mods by name or Workshop ID`}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              disabled={!listed}
              className="h-8 pr-8 pl-8 text-[13px] [&::-webkit-search-cancel-button]:hidden"
            />
            {search && (
              <button
                type="button"
                aria-label={t`Clear search`}
                onClick={() => setSearch("")}
                className="absolute top-1/2 right-1 flex size-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-2"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            )}
          </div>

          {selectedMods.length > 0 && (
            <div className="flex shrink-0 items-center gap-2 pl-1">
              <span className="text-xs whitespace-nowrap text-muted-foreground" aria-live="polite">
                <Trans>
                  <span className="data text-foreground">{selectedCount}</span> selected
                </Trans>
              </span>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 px-2.5 text-[13px] font-normal"
                disabled={busy}
                onClick={() => setConfirming({ mods: selectedMods, open: true })}
              >
                <Trash2 aria-hidden />
                <Trans>Unsubscribe</Trans>
              </Button>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="rounded text-xs text-muted-foreground underline-offset-2 transition-colors duration-150 hover:text-foreground hover:underline focus-visible:outline-2"
              >
                <Trans>Clear selection</Trans>
              </button>
            </div>
          )}

          <div className="ml-auto flex shrink-0 items-center gap-2 pl-2">
            {listed && (
              <p className="text-xs whitespace-nowrap text-muted-foreground" aria-live="polite">
                {rows.length === mods.length ? (
                  <Plural
                    value={modCount}
                    one={
                      <Trans>
                        <span className="data text-foreground">#</span> mod
                      </Trans>
                    }
                    other={
                      <Trans>
                        <span className="data text-foreground">#</span> mods
                      </Trans>
                    }
                  />
                ) : (
                  <Plural
                    value={modCount}
                    one={
                      <Trans>
                        <span className="data text-foreground">{shown}</span> of # mod
                      </Trans>
                    }
                    other={
                      <Trans>
                        <span className="data text-foreground">{shown}</span> of # mods
                      </Trans>
                    }
                  />
                )}
                <span className="max-xl:hidden">
                  {" · "}
                  <span className="data">{formatBytes(totalSize)}</span>
                </span>
              </p>
            )}
            {toUpdate.length > 0 && !job && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 px-2.5 text-[13px] font-normal"
                disabled={busy}
                onClick={() => onUpdate(toUpdate.map((mod) => mod.id))}
              >
                <Download aria-hidden />
                <Plural value={updateCount} one="Update # mod" other="Update # mods" />
              </Button>
            )}
            {toVerify.length > 0 && !job && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 px-2.5 text-[13px] font-normal"
                    disabled={busy}
                    onClick={() => onVerify(toVerify.map((mod) => mod.id))}
                  >
                    <ShieldCheck aria-hidden />
                    <Trans>Verify mods</Trans>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <Trans>Have Steam check your mods' files and download again any that are missing</Trans>
                </TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label={t`Check your mods again`}
                  disabled={state.refreshing || searchingForDayz}
                  onClick={() => void state.refresh()}
                >
                  <RefreshCw
                    className={cn("size-4", state.refreshing && "animate-spin motion-reduce:animate-none")}
                    aria-hidden
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <Trans>Check your mods again</Trans>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        {job && <JobStatus job={job} onCancel={onCancelUpdate} />}
        {listed && workshopUnreachable && !job && (
          <p className="flex items-center gap-2 border-t px-4 py-2 text-xs text-muted-foreground">
            <CircleAlert className="size-3.5 shrink-0 text-warning" aria-hidden />
            <Trans>The Steam Workshop couldn't be reached, so your mods weren't checked for updates.</Trans>
          </p>
        )}
      </div>

      {body}

      <UnsubscribeDialog
        mods={confirming.mods}
        open={confirming.open}
        favouritesUsing={favouritesUsing}
        onClose={() => setConfirming((current) => ({ ...current, open: false }))}
        onConfirm={async (ids) => {
          try {
            await onUnsubscribe(ids);
            setSelected((current) => new Set([...current].filter((id) => !ids.includes(id))));
            const unsubscribed = ids.length;
            toast.success(
              unsubscribed === 1
                ? t`Unsubscribed`
                : t`Unsubscribed from ${plural(unsubscribed, { one: "# mod", other: "# mods" })}`,
              { description: t`Steam removes the files from this computer shortly.` },
            );
          } catch (e) {
            toast.error(t`Couldn't unsubscribe`, { description: errorMessage(e) });
          } finally {
            setConfirming((current) => ({ ...current, open: false }));
          }
        }}
      />
    </main>
  );
}

type TableProps = {
  rows: SubscribedMod[];
  sort: ModSort;
  onSort: (sort: ModSort) => void;
  selected: ReadonlySet<number>;
  onToggle: (id: number) => void;
  allShownSelected: boolean;
  someShownSelected: boolean;
  onToggleAllShown: () => void;
  servers: ReadonlyMap<number, number> | null;
  favouritesUsing: ReadonlyMap<number, string[]>;
  progressById: ReadonlyMap<number, ModProgress>;
  empty: React.ReactNode;
};

function ModTable({
  rows,
  sort,
  onSort,
  selected,
  onToggle,
  allShownSelected,
  someShownSelected,
  onToggleAllShown,
  servers,
  favouritesUsing,
  progressById,
  empty,
}: TableProps) {
  const { t, i18n } = useLingui();
  const scroller = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });
  // The row the arrow keys are on. Space selects it.
  const [activeId, setActiveId] = useState<number | null>(null);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget || rows.length === 0) return;
    const current = rows.findIndex((mod) => mod.id === activeId);
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
      case " ":
        event.preventDefault();
        if (current >= 0) onToggle(rows[current].id);
        return;
      default:
        return;
    }
    event.preventDefault();
    setActiveId(rows[next].id);
    virtualizer.scrollToIndex(next);
  }

  return (
    <div
      role="grid"
      aria-label={t`Your mods`}
      aria-multiselectable
      aria-readonly
      aria-rowcount={rows.length + 1}
      tabIndex={0}
      aria-activedescendant={activeId !== null ? `mod-${activeId}` : undefined}
      onKeyDown={onKeyDown}
      onFocus={(event) => {
        if (event.target === event.currentTarget && activeId === null && rows.length > 0) setActiveId(rows[0].id);
      }}
      className="flex min-h-0 flex-1 flex-col focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset"
    >
      <div role="rowgroup" className="overflow-y-hidden border-b bg-card/60 [scrollbar-gutter:stable]">
        <div role="row" className={cn(COLUMNS, "h-8 text-xs font-medium text-muted-foreground")}>
          <div role="columnheader" className="flex justify-center">
            <Checkbox
              tabIndex={-1}
              aria-label={allShownSelected ? t`Deselect every mod shown` : t`Select every mod shown`}
              checked={allShownSelected ? true : someShownSelected ? "indeterminate" : false}
              onCheckedChange={onToggleAllShown}
              disabled={rows.length === 0}
            />
          </div>
          {HEADERS.map((header) => {
            const active = sort.key === header.key;
            const Arrow = sort.descending ? ArrowDown : ArrowUp;
            return (
              <div
                key={header.key}
                role="columnheader"
                aria-sort={active ? (sort.descending ? "descending" : "ascending") : "none"}
                className={cn("flex", header.numeric && "justify-end pr-4", header.key === "updated" && UPDATED_GAP)}
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
                    "-mx-1 flex h-8 items-center gap-1 rounded-sm px-1 transition-colors duration-150 hover:text-foreground focus-visible:outline-2",
                    active && "text-foreground",
                  )}
                >
                  {i18n._(header.label)}
                  {active && <Arrow className="size-3" aria-hidden />}
                </button>
              </div>
            );
          })}
          <div role="columnheader" aria-label={t`Workshop page`} />
        </div>
      </div>

      <div ref={scroller} role="rowgroup" className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        {rows.length === 0 ? (
          empty
        ) : (
          <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((item) => {
              const mod = rows[item.index];
              return (
                <ModRow
                  key={mod.id}
                  mod={mod}
                  index={item.index}
                  top={item.start}
                  selected={selected.has(mod.id)}
                  active={mod.id === activeId}
                  servers={servers === null ? null : (servers.get(mod.id) ?? 0)}
                  favourites={favouritesUsing.get(mod.id)}
                  progress={progressById.get(mod.id)}
                  onToggle={onToggle}
                  onActivate={setActiveId}
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
  mod: SubscribedMod;
  index: number;
  top: number;
  selected: boolean;
  active: boolean;
  /** `null` until the server list loads. */
  servers: number | null;
  favourites: string[] | undefined;
  progress: ModProgress | undefined;
  onToggle: (id: number) => void;
  onActivate: (id: number) => void;
};

const ModRow = memo(function ModRow({
  mod,
  index,
  top,
  selected,
  active,
  servers,
  favourites,
  progress,
  onToggle,
  onActivate,
}: RowProps) {
  const { t, i18n } = useLingui();
  const formatDate = (seconds: number) => i18n.date(new Date(seconds * 1000), DATE_FORMAT);
  const name = modName(mod);
  const outdated = modState(mod) === "outdated";
  const updated = mod.latestUpdatedAt ?? mod.updatedAt;
  const copyDate = mod.updatedAt === null ? "" : formatDate(mod.updatedAt);
  const toggle = () => {
    onActivate(mod.id);
    onToggle(mod.id);
  };
  // Clicks on the row's own controls don't also toggle it.
  const stop = (event: MouseEvent) => event.stopPropagation();

  return (
    <div
      id={`mod-${mod.id}`}
      role="row"
      aria-rowindex={index + 2}
      aria-selected={selected}
      onClick={toggle}
      style={{ transform: `translateY(${top}px)`, height: ROW_HEIGHT }}
      className={cn(
        COLUMNS,
        "group absolute inset-x-0 top-0 cursor-default border-b border-border/50 text-[13px] transition-colors duration-100",
        selected ? "bg-row-selected" : cn("hover:bg-row-hover", index % 2 === 1 && "bg-row-stripe"),
        active && "shadow-[inset_2px_0_0_var(--primary)]",
      )}
    >
      <div role="gridcell" className="flex justify-center" onClick={stop}>
        <Checkbox tabIndex={-1} aria-label={t`Select ${name}`} checked={selected} onCheckedChange={toggle} />
      </div>

      <div role="gridcell" className="flex min-w-0 items-center gap-2 pr-4">
        <span className={cn("truncate font-medium", mod.name === null && "text-muted-foreground")} title={name}>
          {name}
        </span>
      </div>

      <div role="gridcell" className="data flex items-center justify-end gap-1.5 pr-4 text-xs">
        {favourites && favourites.length > 0 && <FavouritesStar favourites={favourites} />}
        {servers === null ? (
          <span className="text-muted-foreground/50">···</span>
        ) : (
          <span className={cn(servers === 0 && "text-muted-foreground")}>{i18n.number(servers)}</span>
        )}
      </div>

      <div role="gridcell" className="data pr-4 text-right text-xs">
        {mod.size === null || !mod.installed ? <span className="text-muted-foreground">–</span> : formatBytes(mod.size)}
      </div>

      <div
        role="gridcell"
        className={cn("data truncate pr-3 text-xs text-muted-foreground", UPDATED_GAP)}
        title={
          outdated && mod.updatedAt !== null
            ? t`Your copy is from ${copyDate}`
            : mod.removed
              ? t`When your copy was published`
              : undefined
        }
      >
        {updated === null ? "–" : formatDate(updated)}
      </div>

      <div role="gridcell" className="min-w-0 pr-3">
        <ModStatus mod={mod} progress={progress} />
      </div>

      <div role="gridcell" className="flex justify-center" onClick={stop}>
        <Button
          variant="ghost"
          size="icon-xs"
          tabIndex={-1}
          aria-label={t`Open ${name} in the Steam Workshop`}
          title={t`Open in the Steam Workshop`}
          onClick={() =>
            backend
              .openWorkshopPage(mod.id)
              .catch((e) => toast.error(t`Couldn't open the Workshop page`, { description: errorMessage(e) }))
          }
          className="text-muted-foreground/70 hover:text-foreground group-hover:text-muted-foreground"
        >
          <ExternalLink aria-hidden />
        </Button>
      </div>
    </div>
  );
});

function FavouritesStar({ favourites }: { favourites: string[] }) {
  const { t } = useLingui();
  const names = favourites.join(", ");
  const favouriteCount = favourites.length;
  return (
    <span title={t`Your favourite servers that use it: ${names}`} className="text-warning">
      <Star
        className="size-3"
        fill="currentColor"
        aria-label={t`Used by ${plural(favouriteCount, { one: "# favourite server", other: "# favourite servers" })}`}
      />
    </span>
  );
}

function ModStatus({ mod, progress }: { mod: SubscribedMod; progress: ModProgress | undefined }) {
  const { t } = useLingui();
  const line = (icon: React.ReactNode, label: string, tone?: string, title?: string) => (
    <span className={cn("flex min-w-0 items-center gap-1.5 text-xs", tone)} title={title}>
      {icon}
      <span className="truncate">{label}</span>
    </span>
  );

  if (progress) {
    switch (progress.status) {
      case "downloading": {
        const percent = progress.total > 0 ? Math.floor((progress.downloaded / progress.total) * 100) : null;
        return line(
          <LoaderCircle className="size-3.5 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden />,
          percent === null ? t`Starting` : t`Downloading ${percent}%`,
          "text-foreground",
        );
      }
      case "queued":
        return line(<Clock className="size-3.5 shrink-0" aria-hidden />, t`Waiting`, "text-muted-foreground");
      case "failed":
        return line(<CircleX className="size-3.5 shrink-0" aria-hidden />, t`Download failed`, "text-danger");
      case "installed":
        return line(<CircleCheck className="size-3.5 shrink-0" aria-hidden />, t`Up to date`, "text-success");
    }
  }

  switch (modState(mod)) {
    case "missing":
      return line(
        <CircleAlert className="size-3.5 shrink-0" aria-hidden />,
        t`Not downloaded`,
        "text-warning",
        t`Steam hasn't downloaded this mod to this computer yet.`,
      );
    case "outdated":
      return line(<CircleAlert className="size-3.5 shrink-0" aria-hidden />, t`Update available`, "text-warning");
    case "removed":
      return line(
        <CircleX className="size-3.5 shrink-0" aria-hidden />,
        t`Not on the Workshop`,
        "text-muted-foreground",
        t`It was removed from the Workshop or made private. Your copy still works, but it won't get updates.`,
      );
    case "current":
      return line(<CircleCheck className="size-3.5 shrink-0" aria-hidden />, t`Up to date`, "text-success");
  }
}

function JobStatus({ job: { kind, progress }, onCancel }: { job: ModJob; onCancel: () => void }) {
  const { t } = useLingui();
  const verifying = kind === "verify";
  const done = progress.filter((p) => p.status === "installed").length;
  // Steam only reports sizes for the mods it is downloading right now.
  const active = progress.filter((p) => p.status === "downloading");
  const downloaded = active.reduce((sum, p) => sum + p.downloaded, 0);
  const total = active.reduce((sum, p) => sum + p.total, 0);
  const count = progress.length;
  const downloadedSize = formatBytes(downloaded);
  const totalSize = formatBytes(total);

  return (
    <div className="flex items-center gap-4 border-t px-4 py-2.5">
      <span className="shrink-0 text-[13px] font-medium">
        {verifying ? <Trans>Verifying mods</Trans> : <Trans>Updating mods</Trans>}
      </span>
      <Progress
        value={downloadFraction(progress) * 100}
        aria-label={verifying ? t`Mod verify progress` : t`Mod update progress`}
        className="flex-1"
      />
      <span className="data shrink-0 text-xs text-muted-foreground" aria-live="polite">
        <Trans>
          {done} of {count}
        </Trans>
        {" · "}
        {total > 0 ? t`${downloadedSize} of ${totalSize}` : verifying ? t`Checking files` : t`Waiting for Steam`}
      </span>
      <Button variant="secondary" size="sm" onClick={onCancel}>
        <Trans>Cancel</Trans>
      </Button>
    </div>
  );
}

function UnsubscribeDialog({
  mods: list,
  open,
  favouritesUsing,
  onClose,
  onConfirm,
}: {
  mods: SubscribedMod[];
  open: boolean;
  favouritesUsing: ReadonlyMap<number, string[]>;
  onClose: () => void;
  onConfirm: (ids: number[]) => Promise<void>;
}) {
  const { t, i18n } = useLingui();
  const [working, setWorking] = useState(false);

  const one = list.length === 1;
  const size = list.reduce((sum, mod) => sum + (mod.installed ? (mod.size ?? 0) : 0), 0);
  const needed = list.filter((mod) => (favouritesUsing.get(mod.id)?.length ?? 0) > 0);
  const favouriteServers = [...new Set(needed.flatMap((mod) => favouritesUsing.get(mod.id) ?? []))];
  const name = one ? modName(list[0]) : "";
  const modCount = list.length;
  const freed = formatBytes(size);
  const usedCount = i18n.number(needed.length);
  const names = favouriteServers.slice(0, 3).join(", ");
  const more = favouriteServers.length - 3;

  return (
    <AlertDialog open={open} onOpenChange={(open) => !open && !working && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {one
              ? t`Unsubscribe from ${name}?`
              : t`Unsubscribe from ${plural(modCount, { one: "# mod", other: "# mods" })}?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {one ? (
              size > 0 ? (
                <Trans>
                  Steam removes it from this computer, freeing <span className="data">{freed}</span>. A server that
                  needs it downloads it again when you join.
                </Trans>
              ) : (
                <Trans>
                  Steam removes it from this computer. A server that needs it downloads it again when you join.
                </Trans>
              )
            ) : size > 0 ? (
              <Trans>
                Steam removes them from this computer, freeing <span className="data">{freed}</span>. A server that
                needs them downloads them again when you join.
              </Trans>
            ) : (
              <Trans>
                Steam removes them from this computer. A server that needs them downloads them again when you join.
              </Trans>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {needed.length > 0 && (
          <p className="flex gap-2 rounded-md border border-warning/25 bg-warning/10 p-2.5 text-xs leading-relaxed text-foreground/90">
            <Star className="mt-0.5 size-3.5 shrink-0 text-warning" fill="currentColor" aria-hidden />
            <span>
              {one
                ? more > 0
                  ? t`Your favourite servers use it: ${names} and ${plural(more, { one: "# more", other: "# more" })}.`
                  : t`Your favourite servers use it: ${names}.`
                : more > 0
                  ? t`Your favourite servers use ${usedCount} of these: ${names} and ${plural(more, { one: "# more", other: "# more" })}.`
                  : t`Your favourite servers use ${usedCount} of these: ${names}.`}
            </span>
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={working}>
            {one ? <Trans>Keep it</Trans> : <Trans>Keep them</Trans>}
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={working}
            onClick={(event) => {
              // Stays open until Steam answers.
              event.preventDefault();
              setWorking(true);
              void onConfirm(list.map((mod) => mod.id)).finally(() => setWorking(false));
            }}
          >
            {working ? (
              <>
                <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden />
                <Trans>Unsubscribing…</Trans>
              </>
            ) : (
              <Trans>Unsubscribe</Trans>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function LoadingRows() {
  const { t } = useLingui();
  return (
    <div aria-busy="true" aria-label={t`Loading your mods`} className="min-h-0 flex-1 overflow-hidden">
      <div className="h-8 border-b bg-card/60" />
      {Array.from({ length: 14 }, (_, i) => (
        <div key={i} className={cn(COLUMNS, "h-9 border-b border-border/50")}>
          <span />
          <Skeleton className="h-3.5" style={{ width: `${30 + ((i * 37) % 40)}%` }} />
          <Skeleton className="ml-auto mr-4 h-3.5 w-8" />
          <Skeleton className="ml-auto mr-4 h-3.5 w-14" />
          <Skeleton className="h-3.5 w-20" />
          <Skeleton className="h-3.5 w-24" />
          <span />
        </div>
      ))}
    </div>
  );
}
