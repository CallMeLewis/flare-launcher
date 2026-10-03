import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { LoaderCircle, MousePointerClick, SearchX, ServerCrash, Star } from "lucide-react";
import { toast } from "sonner";
import { AppSidebar, type View } from "@/components/app-sidebar";
import { ServerDetail } from "@/components/server-detail";
import { ServerTable } from "@/components/server-table";
import { ServerToolbar } from "@/components/server-toolbar";
import { SettingsDialog } from "@/components/settings-dialog";
import { TitleBar } from "@/components/title-bar";
import { Button } from "@/components/ui/button";
import { usePings } from "@/hooks/use-pings";
import { useServers } from "@/hooks/use-servers";
import { useAppMenuOffer } from "@/hooks/use-app-menu-offer";
import { useStoredState } from "@/hooks/use-stored-state";
import { backend, errorMessage } from "@/lib/backend";
import { launchArgs } from "@/lib/launch-options";
import { followTheme } from "@/lib/theme";
import {
  DEFAULT_FILTERS,
  DEFAULT_SORT,
  NO_FILTERS,
  activeFilterCount,
  filterServers,
  mapCounts,
  modCounts,
  pickSaved,
  pinFavourites,
  SORT_KEYS,
  sortServers,
  versionCounts,
  type Filters,
  type Sort,
} from "@/lib/filter";
import type { Install, PlayJob, ServerRow, Settings } from "@/lib/types";

const DEFAULT_SETTINGS: Settings = {
  profileName: "",
  dayzDir: "",
  extraArgs: "",
  uiScale: 1,
  theme: "system",
  skipIntro: true,
  noSplash: true,
  noPause: false,
  windowed: false,
  afterLaunch: "keep",
};
const MAX_RECENT = 30;

const onRefreshFailed = (message: string) => toast.error("Couldn't refresh the server list", { description: message });

export function App() {
  const servers = useServers(onRefreshFailed);
  const pings = usePings();

  const [storedSettings, setSettings] = useStoredState("settings", DEFAULT_SETTINGS);
  // Settings saved by older versions lack newer fields.
  const settings = useMemo(() => ({ ...DEFAULT_SETTINGS, ...storedSettings }), [storedSettings]);
  const [favouriteIds, setFavouriteIds] = useStoredState<string[]>("favourites", []);
  const [recentIds, setRecentIds] = useStoredState<string[]>("recent", []);
  // The last known details of favourite and recent servers, to keep showing one that drops out of the server list.
  const [savedServers, setSavedServers] = useStoredState<Record<string, ServerRow>>("savedServers", {});
  const [storedSort, setSort] = useStoredState<Sort>("sort", DEFAULT_SORT);
  // A saved sort can name a column that no longer exists.
  const sort = SORT_KEYS.includes(storedSort.key) ? storedSort : DEFAULT_SORT;
  // Standing preferences such as ping are remembered between launches; search, map, version and mods start fresh.
  const [storedFilters, setStoredFilters] = useStoredState<Record<string, unknown>>("filters", {});
  const [sessionFilters, setSessionFilters] = useState<Filters>(DEFAULT_FILTERS);
  const filters = useMemo<Filters>(
    () => ({ ...sessionFilters, ...pickSaved(storedFilters) }),
    [sessionFilters, storedFilters],
  );
  const setFilters = useCallback(
    (next: Filters) => {
      setSessionFilters(next);
      setStoredFilters(pickSaved(next));
    },
    [setStoredFilters],
  );
  const [view, setView] = useState<View>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [install, setInstall] = useState<Install | null | undefined>(undefined);
  const [job, setJob] = useState<PlayJob | null>(null);
  const [installVersion, setInstallVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      backend
        .detectInstall(settings.dayzDir)
        .then((found) => !cancelled && setInstall(found))
        .catch(() => !cancelled && setInstall(null));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [settings.dayzDir]);

  useEffect(() => {
    backend.setInterfaceScale(settings.uiScale).catch(() => {});
  }, [settings.uiScale]);

  useEffect(() => followTheme(settings.theme), [settings.theme]);
  useAppMenuOffer();

  const favourites = useMemo(() => new Set(favouriteIds), [favouriteIds]);
  const recents = useMemo(() => new Set(recentIds), [recentIds]);
  const maps = useMemo(() => mapCounts(servers.rows), [servers.rows]);
  const versions = useMemo(() => versionCounts(servers.rows), [servers.rows]);
  const mods = useMemo(() => modCounts(servers.rows, servers.modNames), [servers.rows, servers.modNames]);
  const byId = useMemo(() => new Map(servers.rows.map((row) => [row.id, row])), [servers.rows]);

  useEffect(() => {
    if (servers.status !== "ready") return;
    setSavedServers((saved) => {
      const next: Record<string, ServerRow> = {};
      for (const id of new Set([...favouriteIds, ...recentIds])) {
        const row = byId.get(id);
        // Mod positions change with every refresh, so they aren't kept.
        const known = row ? { ...row, mods: [] } : saved[id];
        if (known) next[id] = known;
      }
      return next;
    });
  }, [servers.status, byId, favouriteIds, recentIds, setSavedServers]);

  // Saved servers missing from the server list, which leaves out servers that are offline.
  const unlistedRows = useMemo(
    () =>
      servers.status === "ready"
        ? Object.values(savedServers)
            .filter((row) => !byId.has(row.id) && (favourites.has(row.id) || recents.has(row.id)))
            .map((row) => ({ ...row, players: 0 }))
        : [],
    [servers.status, savedServers, byId, favourites, recents],
  );
  const unlisted = useMemo(() => new Set(unlistedRows.map((row) => row.id)), [unlistedRows]);

  const lists = useMemo<Record<View, ServerRow[]>>(() => {
    const unlistedFavourites = unlistedRows.filter((row) => favourites.has(row.id));
    return {
      all: [...servers.rows, ...unlistedFavourites],
      favourites: [...servers.rows.filter((row) => favourites.has(row.id)), ...unlistedFavourites],
      recent: [
        ...servers.rows.filter((row) => recents.has(row.id)),
        ...unlistedRows.filter((row) => recents.has(row.id)),
      ],
    };
  }, [servers.rows, unlistedRows, favourites, recents]);
  const inView = lists[view];
  const counts = { all: lists.all.length, favourites: lists.favourites.length, recent: lists.recent.length };

  // Saved lists show every server in them; only the search box narrows them.
  const search = useDeferredValue(filters.search);
  const applied = useMemo<Filters>(
    () => (view === "all" ? { ...filters, search } : { ...NO_FILTERS, search }),
    [view, filters, search],
  );
  const { get: getPing, request: requestPings } = pings;
  // The ping filters need results as they arrive, like sorting by ping does.
  const filteringByPing = view === "all" && (filters.maxPing !== null || filters.hideOffline);
  const filterPingVersion = filteringByPing ? pings.version : 0;
  const filtered = useMemo(() => {
    if (view !== "all") return filterServers(inView, applied, servers.modNames);
    // Favourites stay at the top of the full list whatever the filters, so one that empties or goes offline doesn't
    // vanish from it; only the search narrows them.
    return [
      ...filterServers(
        inView.filter((row) => favourites.has(row.id)),
        { ...NO_FILTERS, search },
        servers.modNames,
      ),
      ...filterServers(
        inView.filter((row) => !favourites.has(row.id)),
        applied,
        servers.modNames,
        getPing,
      ),
    ];
    // filterPingVersion is a dependency so ping filters update as results arrive.
  }, [view, inView, applied, search, favourites, servers.modNames, getPing, filterPingVersion]);

  const sortingByPing = sort.key === "ping";
  const pingVersion = sortingByPing ? pings.version : 0;
  const sorted = useMemo(
    () => sortServers(filtered, sort, (id) => getPing(id)?.pingMs),
    // pingVersion is a dependency so the order updates as results arrive.
    [filtered, sort, getPing, pingVersion],
  );
  // On the full list, favourites sit at the top in the chosen order.
  const listed = useMemo(
    () => (view === "all" ? pinFavourites(sorted, favourites) : sorted),
    [view, sorted, favourites],
  );

  // Ordering by ping needs a result for every listed server, not just those on screen.
  useEffect(() => {
    if (sortingByPing || filteringByPing) requestPings(filtered.map((row) => row.id));
  }, [sortingByPing, filteringByPing, filtered, requestPings]);

  const toggleFavourite = useCallback(
    (id: string) => setFavouriteIds((ids) => (ids.includes(id) ? ids.filter((other) => other !== id) : [...ids, id])),
    [setFavouriteIds],
  );

  // One join at a time: downloads whatever mods are missing, then starts the game,
  // unless the player only asked for the mods.
  const playing = useRef(false);
  const play = useCallback(
    async (server: ServerRow, password = "", startGame = true) => {
      if (playing.current) return;
      setSelectedId(server.id);
      if (unlisted.has(server.id)) {
        toast.info("This server is offline", {
          description: "It isn't in the server list right now. It comes back once the server is up again.",
        });
        return;
      }
      // Without its password the server turns the player away only after the mods download and DayZ starts.
      if (startGame && server.password && !password) {
        toast.info("This server needs a password", {
          description: "Enter it in the panel on the right, then select Play.",
        });
        requestAnimationFrame(() => document.getElementById("server-password")?.focus());
        return;
      }
      if (!install) {
        toast.error("DayZ wasn't found", { description: "Set the DayZ folder in Settings." });
        return;
      }
      playing.current = true;
      try {
        const mods = await backend.serverMods(server.id);
        const ids = mods.map((mod) => mod.steamWorkshopId);
        const installed = new Set(await backend.installedMods(settings.dayzDir, ids));
        const missing = ids.filter((id) => !installed.has(id));

        if (!startGame && missing.length === 0) {
          toast.info("Every mod is already up to date", { description: server.name });
          return;
        }

        if (missing.length > 0) {
          const queued = missing.map((id) => ({ id, status: "queued" as const, downloaded: 0, total: 0 }));
          setJob({ serverId: server.id, phase: "downloading", startsGame: startGame, progress: queued });
          const finished = await backend.downloadMods(missing, (progress) =>
            setJob((current) => current && { ...current, progress }),
          );
          setInstallVersion((version) => version + 1);
          if (!finished) {
            toast.info("Download cancelled", {
              description: "Steam will finish downloading these mods in the background.",
            });
            return;
          }
          if (!startGame) {
            const noun = missing.length === 1 ? "mod" : "mods";
            toast.success("Mods ready", { description: `${missing.length} ${noun} downloaded for ${server.name}` });
            return;
          }
        }

        setJob({ serverId: server.id, phase: "starting", startsGame: true, progress: [] });
        await backend.launch({
          serverId: server.id,
          dayzDir: settings.dayzDir || null,
          profileName: settings.profileName || null,
          password: password || null,
          extraArgs: launchArgs(settings) || null,
        });
        setRecentIds((ids) => [server.id, ...ids.filter((id) => id !== server.id)].slice(0, MAX_RECENT));
        toast.success("Starting DayZ", { description: server.name });
        if (settings.afterLaunch === "minimise") void backend.minimiseWindow();
        if (settings.afterLaunch === "close") void backend.closeWindow();
      } catch (e) {
        setInstallVersion((version) => version + 1);
        toast.error(startGame ? "Couldn't start DayZ" : "Couldn't download the mods", { description: errorMessage(e) });
      } finally {
        playing.current = false;
        setJob(null);
      }
    },
    [install, settings, setRecentIds, unlisted],
  );

  const selected = selectedId ? (byId.get(selectedId) ?? unlistedRows.find((row) => row.id === selectedId)) : undefined;
  const selectedPing = selected && pings.get(selected.id);

  return (
    <div className="flex h-full flex-col">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <AppSidebar view={view} onViewChange={setView} counts={counts} onOpenSettings={() => setSettingsOpen(true)} />

        <main className="flex min-w-0 flex-1 flex-col">
          {servers.status === "error" ? (
            <Message
              icon={<ServerCrash className="size-6" aria-hidden />}
              title="The server list couldn't be loaded"
              description={servers.error}
              action={
                <Button onClick={servers.refresh} disabled={servers.refreshing}>
                  {servers.refreshing ? (
                    <>
                      <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden />
                      Trying again…
                    </>
                  ) : (
                    "Try again"
                  )}
                </Button>
              }
            />
          ) : (
            <>
              <ServerToolbar
                filters={filters}
                onChange={setFilters}
                filtersEnabled={view === "all"}
                maps={maps}
                versions={versions}
                mods={mods}
                shown={listed.length}
                total={inView.length}
                refreshing={servers.refreshing}
                onRefresh={servers.refresh}
              />
              <ServerTable
                rows={listed}
                loading={servers.status === "loading"}
                sort={sort}
                onSort={setSort}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onPlay={play}
                favourites={favourites}
                unlisted={unlisted}
                onToggleFavourite={toggleFavourite}
                pings={pings}
                search={search}
                modNames={servers.modNames}
                empty={
                  inView.length === 0 && view !== "all" ? (
                    <Message
                      icon={<Star className="size-6" aria-hidden />}
                      title={view === "favourites" ? "No favourites yet" : "No recent servers"}
                      description={
                        view === "favourites"
                          ? "Star a server to keep it here."
                          : "Servers you join from the launcher show up here."
                      }
                      action={
                        <Button variant="secondary" onClick={() => setView("all")}>
                          Browse all servers
                        </Button>
                      }
                    />
                  ) : (
                    <Message
                      icon={<SearchX className="size-6" aria-hidden />}
                      title="No servers match"
                      description="Try a different search or fewer filters."
                      action={
                        activeFilterCount(applied) > 0 && (
                          <Button variant="secondary" onClick={() => setFilters({ ...NO_FILTERS })}>
                            Clear filters
                          </Button>
                        )
                      }
                    />
                  )
                }
              />
            </>
          )}
        </main>

        {selected ? (
          <ServerDetail
            server={selected}
            ping={selectedPing}
            offline={unlisted.has(selected.id) ? "unlisted" : selectedPing?.offline ? "not-answering" : null}
            install={install ?? null}
            dayzDir={settings.dayzDir}
            favourite={favourites.has(selected.id)}
            onToggleFavourite={toggleFavourite}
            job={job?.serverId === selected.id ? job : null}
            busy={job !== null}
            installVersion={installVersion}
            onPlay={play}
            onLoad={(server) => void play(server, "", false)}
            onCancelDownload={() => void backend.cancelModDownload()}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        ) : (
          <aside className="flex w-[300px] shrink-0 lg:w-[340px] xl:w-[400px] border-l bg-card">
            <Message
              icon={<MousePointerClick className="size-6" aria-hidden />}
              title="Pick a server"
              description="Select one to see its mods. Double-click to join straight away."
            />
          </aside>
        )}
      </div>

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={settings}
        onChange={setSettings}
        install={install}
      />
    </div>
  );
}

function Message({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <span className="text-muted-foreground">{icon}</span>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="max-w-xs text-[13px] text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}
