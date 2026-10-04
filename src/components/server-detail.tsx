import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ChevronDown,
  CircleAlert,
  CircleCheck,
  CircleX,
  Clock,
  Copy,
  Download,
  ExternalLink,
  Loader2,
  Lock,
  Play,
  Star,
} from "lucide-react";
import { toast } from "sonner";
import { PingValue } from "@/components/server-table";
import { isNight } from "@/lib/filter";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import type { PingResult } from "@/hooks/use-pings";
import { backend, errorMessage } from "@/lib/backend";
import { downloadFraction, formatBytes } from "@/lib/format";
import { mapName } from "@/lib/maps";
import type { Install, Mod, ModProgress, PlayJob, ServerRow } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  server: ServerRow;
  ping: PingResult | undefined;
  /** `null` when DayZ could not be located, so mods cannot be checked. */
  /**
   * Why the server looks offline: missing from the server list, or listed but not answering. A listed server may
   * just be restarting, so it can still be joined.
   */
  offline: "unlisted" | "not-answering" | null;
  install: Install | null;
  dayzDir: string;
  favourite: boolean;
  onToggleFavourite: (id: string) => void;
  /** The join in progress for this server, if there is one. */
  job: PlayJob | null;
  /** True while any server is being joined, so a second join can't start. */
  busy: boolean;
  /** Changes when mods finish downloading, to re-check what is installed. */
  installVersion: number;
  onPlay: (server: ServerRow, password: string) => void;
  /** Downloads the missing mods without starting the game. */
  onLoad: (server: ServerRow) => void;
  onCancelDownload: () => void;
  onOpenSettings: () => void;
};

export function ServerDetail({
  server,
  ping,
  offline,
  install,
  dayzDir,
  favourite,
  onToggleFavourite,
  job,
  busy,
  installVersion,
  onPlay,
  onLoad,
  onCancelDownload,
  onOpenSettings,
}: Props) {
  const [mods, setMods] = useState<Mod[] | null>(null);
  const [installed, setInstalled] = useState<ReadonlySet<number> | null>(null);
  const [password, setPassword] = useState("");
  // The mod list couldn't be loaded; bumping modsAttempt loads it again.
  const [modsFailed, setModsFailed] = useState(false);
  const [modsAttempt, setModsAttempt] = useState(0);
  // Which mods are installed couldn't be checked. Play still works: joining checks the mods again.
  const [checkFailed, setCheckFailed] = useState(false);

  const unlisted = offline === "unlisted";
  const canCheckMods = install !== null && !unlisted;

  useEffect(() => {
    let cancelled = false;
    setMods(null);
    setInstalled(null);
    setModsFailed(false);
    setCheckFailed(false);
    // Only the server list knows a server's mods.
    if (unlisted) return;
    backend
      .serverMods(server.id)
      .then((list) => !cancelled && setMods(list))
      .catch(() => {
        if (cancelled) return;
        setMods([]);
        setModsFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [server.id, modsAttempt, unlisted]);

  // Only a different server clears the password, not loading the same server's mods again.
  useEffect(() => setPassword(""), [server.id]);

  const checkMods = useCallback(async () => {
    if (!mods || !canCheckMods) return;
    const ids = await backend
      .installedMods(
        dayzDir,
        mods.map((mod) => mod.steamWorkshopId),
      )
      .catch(() => null);
    setCheckFailed(!ids);
    if (ids) setInstalled(new Set(ids));
    // installVersion is a dependency so a finished download triggers a re-check.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [mods, canCheckMods, dayzDir, installVersion]);

  // Also re-check when the window regains focus, in case mods changed in Steam.
  useEffect(() => {
    void checkMods();
    window.addEventListener("focus", checkMods);
    return () => window.removeEventListener("focus", checkMods);
  }, [checkMods]);

  const downloading = job?.phase === "downloading" ? job.progress : null;
  const progressById = useMemo(() => new Map(downloading?.map((p) => [p.id, p])), [downloading]);

  const missing = mods && installed ? mods.filter((mod) => !installed.has(mod.steamWorkshopId)).length : 0;
  const checking = canCheckMods && !checkFailed && (mods === null || (mods.length > 0 && installed === null));
  const address = `${server.ip}:${server.gamePort}`;
  const players = ping?.players ?? server.players;
  const maxPlayers = ping?.maxPlayers ?? server.maxPlayers;

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(address);
      toast.success("Address copied");
    } catch {
      toast.error("Couldn't copy the address");
    }
  }

  return (
    <aside
      aria-label="Server details"
      className="flex w-[300px] shrink-0 lg:w-[340px] xl:w-[400px] flex-col border-l bg-card"
    >
      <header className="flex flex-col gap-3 border-b p-4">
        <div className="flex items-start gap-2">
          <h2
            title={server.name}
            className="selectable line-clamp-3 min-w-0 flex-1 text-[15px] leading-snug font-semibold break-words"
          >
            {server.name}
          </h2>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={favourite ? "Remove from favourites" : "Add to favourites"}
            aria-pressed={favourite}
            onClick={() => onToggleFavourite(server.id)}
            className={cn("-mt-1 -mr-1 shrink-0", favourite && "text-warning hover:text-warning")}
          >
            <Star className="size-4" fill={favourite ? "currentColor" : "none"} aria-hidden />
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <code className="data selectable text-xs text-muted-foreground">{address}</code>
          <Button variant="ghost" size="icon-xs" aria-label="Copy address" onClick={copyAddress}>
            <Copy aria-hidden />
          </Button>
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-b p-4">
        <Stat label="Players">
          {unlisted ? (
            <span className="data">–</span>
          ) : (
            <span className="data">
              {players}
              <span className="text-muted-foreground">/{maxPlayers}</span>
            </span>
          )}
        </Stat>
        <Stat label="Ping">
          <span className="data">
            <PingValue ping={ping} offline={offline !== null} />
          </span>
        </Stat>
        <Stat label="Map">{mapName(server.map)}</Stat>
        <Stat label="In-game time">
          {/* What an unlisted server last reported is long out of date. */}
          <span className="data">{(!unlisted && server.time) || "–"}</span>
          {server.time && !unlisted && (
            <span className="ml-1.5 text-xs text-muted-foreground">
              {isNight(server.time) ? "Night" : "Day"}
              {server.timeAcceleration ? ` · ${server.timeAcceleration}× speed` : ""}
            </span>
          )}
        </Stat>
        <Stat label="Perspective">{server.firstPersonOnly ? "First person only" : "First and third person"}</Stat>
        <Stat label="Version">
          <span className="data">{server.version || "–"}</span>
        </Stat>
      </dl>

      <section aria-labelledby="mods-heading" className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-baseline justify-between px-4 pt-4 pb-2">
          <h3 id="mods-heading" className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Mods
            {mods && mods.length > 0 && <span className="data ml-1.5">{mods.length}</span>}
          </h3>
          {mods && mods.length > 0 && installed && !downloading && (
            <p className={cn("text-xs", missing > 0 ? "text-warning" : "text-success")} aria-live="polite">
              {missing > 0 ? `${missing} to download` : "All up to date"}
            </p>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {unlisted ? (
            <p className="px-2 py-1 text-[13px] text-muted-foreground">
              The mods show again once the server is back in the list.
            </p>
          ) : mods === null ? (
            <div className="flex flex-col gap-2 px-2 py-1" aria-busy="true">
              {Array.from({ length: Math.min(server.modCount, 8) }, (_, i) => (
                <Skeleton key={i} className="h-4" style={{ width: `${45 + ((i * 29) % 40)}%` }} />
              ))}
            </div>
          ) : modsFailed ? (
            <div className="flex flex-col items-start gap-2 px-2 py-1">
              <p className="text-[13px] text-muted-foreground">Couldn't load this server's mods.</p>
              <Button variant="secondary" size="sm" onClick={() => setModsAttempt((n) => n + 1)}>
                Try again
              </Button>
            </div>
          ) : mods.length === 0 ? (
            <p className="px-2 py-1 text-[13px] text-muted-foreground">This is a vanilla server. No mods needed.</p>
          ) : (
            <ul className="flex flex-col">
              {mods.map((mod) => (
                <ModRow
                  key={mod.steamWorkshopId}
                  mod={mod}
                  installed={installed ? installed.has(mod.steamWorkshopId) : null}
                  progress={progressById.get(mod.steamWorkshopId)}
                />
              ))}
            </ul>
          )}
        </div>
      </section>

      <footer className="flex flex-col gap-3 border-t p-4">
        {offline && (
          <Notice>
            {unlisted
              ? "This server isn't in the server list right now, so it's probably offline. It comes back once the server is up again."
              : "This server isn't answering, so it's probably offline or restarting. You can still try to join."}
          </Notice>
        )}
        {install === null && (
          <Notice>
            DayZ wasn't found on this computer.{" "}
            <button
              type="button"
              onClick={onOpenSettings}
              className="font-medium text-foreground underline underline-offset-2"
            >
              Set the DayZ folder
            </button>{" "}
            to play.
          </Notice>
        )}

        {server.password && !downloading && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="server-password" className="text-xs text-muted-foreground">
              <Lock className="size-3" aria-hidden />
              Server password
            </Label>
            <Input
              id="server-password"
              type="password"
              autoComplete="off"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="h-8"
            />
          </div>
        )}

        {downloading ? (
          <DownloadStatus progress={downloading} startsGame={job?.startsGame ?? true} onCancel={onCancelDownload} />
        ) : (
          <div className="flex">
            <Button
              size="lg"
              disabled={!canCheckMods || checking || busy}
              onClick={() => onPlay(server, password)}
              // While joining this server the button shows progress, so it isn't greyed out like a disabled one.
              className={cn("min-w-0 flex-1 rounded-r-none font-semibold", job && "disabled:opacity-100")}
            >
              {job || checking ? (
                <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />
              ) : missing > 0 ? (
                <Download aria-hidden />
              ) : (
                <Play fill="currentColor" aria-hidden />
              )}
              {job?.phase === "starting"
                ? "Starting DayZ…"
                : job || checking
                  ? "Checking mods"
                  : missing > 0
                    ? `Download ${missing} ${missing === 1 ? "mod" : "mods"} and play`
                    : "Play"}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="lg"
                  aria-label="More options"
                  disabled={!canCheckMods || checking || busy}
                  className="rounded-l-none border-l border-primary-foreground/25 px-3"
                >
                  <ChevronDown aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="top" className="w-72">
                <DropdownMenuItem
                  disabled={missing === 0}
                  onSelect={() => onLoad(server)}
                  className="items-start gap-2.5 py-2"
                >
                  <Download className="mt-0.5" aria-hidden />
                  <span className="flex flex-col gap-0.5">
                    <span className="text-[13px] font-medium">Load mods</span>
                    <span className="text-xs text-muted-foreground">
                      {missing > 0
                        ? `Download the ${missing} missing or out-of-date ${missing === 1 ? "mod" : "mods"} without starting DayZ.`
                        : "Every mod for this server is installed and up to date."}
                    </span>
                  </span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </footer>
    </aside>
  );
}

function ModRow({
  mod,
  installed,
  progress,
}: {
  mod: Mod;
  /** `null` while unknown. */
  installed: boolean | null;
  progress: ModProgress | undefined;
}) {
  const status = progress?.status ?? (installed === null ? null : installed ? "installed" : "missing");
  const percent = progress && progress.total > 0 ? Math.floor((progress.downloaded / progress.total) * 100) : null;

  return (
    <li className="group flex h-8 items-center gap-2 rounded-md px-2 text-[13px] hover:bg-accent/50">
      {status === "installed" ? (
        <CircleCheck className="size-3.5 shrink-0 text-success" aria-label="Installed" />
      ) : status === "missing" ? (
        <CircleAlert className="size-3.5 shrink-0 text-warning" aria-label="Missing or out of date" />
      ) : status === "downloading" ? (
        <Loader2
          className="size-3.5 shrink-0 animate-spin text-primary motion-reduce:animate-none"
          aria-label="Downloading"
        />
      ) : status === "queued" ? (
        <Clock className="size-3.5 shrink-0 text-muted-foreground" aria-label="Waiting to download" />
      ) : status === "failed" ? (
        <CircleX className="size-3.5 shrink-0 text-danger" aria-label="Download failed" />
      ) : (
        <span className="size-3.5 shrink-0" />
      )}
      <span className="min-w-0 flex-1 truncate" title={mod.name}>
        {mod.name}
      </span>
      {status === "downloading" || status === "queued" ? (
        <span className="data shrink-0 text-xs text-muted-foreground">
          {status === "queued" ? "Waiting" : percent === null ? "Starting" : `${percent}%`}
        </span>
      ) : (
        <Button
          variant="ghost"
          size="xs"
          aria-label={`Open ${mod.name} in the Steam Workshop`}
          onClick={() =>
            backend
              .openWorkshopPage(mod.steamWorkshopId)
              .catch((e) => toast.error("Couldn't open the Workshop page", { description: errorMessage(e) }))
          }
          className="shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
        >
          <ExternalLink aria-hidden />
        </Button>
      )}
    </li>
  );
}

function DownloadStatus({
  progress,
  startsGame,
  onCancel,
}: {
  progress: ModProgress[];
  /** Whether DayZ starts once the mods are in. */
  startsGame: boolean;
  onCancel: () => void;
}) {
  const done = progress.filter((p) => p.status === "installed").length;
  // Steam only reports sizes for the mods it is downloading right now.
  const active = progress.filter((p) => p.status === "downloading");
  const downloaded = active.reduce((sum, p) => sum + p.downloaded, 0);
  const total = active.reduce((sum, p) => sum + p.total, 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between text-[13px]">
          <span className="font-medium">
            {startsGame ? "Downloading mods, then starting DayZ" : "Downloading mods"}
          </span>
          <span className="data text-xs text-muted-foreground" aria-live="polite">
            {done} of {progress.length}
          </span>
        </div>
        <Progress value={downloadFraction(progress) * 100} aria-label="Mod download progress" />
        <p className="data text-xs text-muted-foreground">
          {total > 0 ? `${formatBytes(downloaded)} of ${formatBytes(total)}` : "Waiting for Steam"}
        </p>
      </div>
      <Button variant="secondary" onClick={onCancel} className="w-full">
        Cancel
      </Button>
    </div>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate text-[13px]">{children}</dd>
    </div>
  );
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <p className="flex gap-2 rounded-md border border-warning/25 bg-warning/10 p-2.5 text-xs leading-relaxed text-foreground/90">
      <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
      <span>{children}</span>
    </p>
  );
}
