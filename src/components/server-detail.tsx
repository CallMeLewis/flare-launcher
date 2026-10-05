import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  ChevronDown,
  CircleAlert,
  CircleCheck,
  CircleX,
  Clock,
  Copy,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Play,
  Star,
} from "lucide-react";
import { toast } from "sonner";
import { PingValue } from "@/components/server-table";
import { isNight } from "@/lib/filter";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  const { t, i18n } = useLingui();
  const [mods, setMods] = useState<Mod[] | null>(null);
  const [installed, setInstalled] = useState<ReadonlySet<number> | null>(null);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  // Whether the password store holds a password for this server.
  const [saved, setSaved] = useState(false);
  const [storeAvailable, setStoreAvailable] = useState(true);
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

  useEffect(() => {
    backend
      .passwordStoreAvailable()
      .then(setStoreAvailable)
      .catch(() => setStoreAvailable(false));
  }, []);

  // Only a different server resets the password, not loading the same server's mods again. A remembered one fills in.
  useEffect(() => {
    let cancelled = false;
    setPassword("");
    setShowPassword(false);
    setRemember(false);
    setSaved(false);
    if (!server.password) return;
    backend
      .savedPassword(server.id)
      .then((stored) => {
        if (cancelled || stored === null) return;
        // Anything typed while it loaded wins.
        setPassword((typed) => typed || stored);
        setRemember(true);
        setSaved(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [server.id, server.password]);

  // Unticking Remember forgets the password straight away; ticking it saves the password when the player joins.
  const changeRemember = (checked: boolean) => {
    setRemember(checked);
    if (checked || !saved) return;
    backend
      .forgetPassword(server.id)
      .then(() => setSaved(false))
      .catch((e) => toast.error(t`Couldn't forget the password`, { description: errorMessage(e) }));
  };

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
  const canPlay = canCheckMods && !checking && !busy;
  const speed = server.timeAcceleration ? i18n.number(server.timeAcceleration) : "";

  /** Play, from the button or Enter in the password field. Saves the password first when Remember is ticked. */
  function join() {
    if (!canPlay) return;
    if (server.password && remember && password) {
      backend
        .savePassword(server.id, password)
        .then(() => setSaved(true))
        .catch((e) => toast.error(t`Couldn't remember the password`, { description: errorMessage(e) }));
    }
    onPlay(server, password);
  }

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(address);
      toast.success(t`Address copied`);
    } catch {
      toast.error(t`Couldn't copy the address`);
    }
  }

  return (
    <aside
      aria-label={t`Server details`}
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
            aria-label={favourite ? t`Remove from favourites` : t`Add to favourites`}
            aria-pressed={favourite}
            onClick={() => onToggleFavourite(server.id)}
            className={cn("-mt-1 -mr-1 shrink-0", favourite && "text-warning hover:text-warning")}
          >
            <Star className="size-4" fill={favourite ? "currentColor" : "none"} aria-hidden />
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <code className="data selectable text-xs text-muted-foreground">{address}</code>
          <Button variant="ghost" size="icon-xs" aria-label={t`Copy address`} onClick={copyAddress}>
            <Copy aria-hidden />
          </Button>
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-b p-4">
        <Stat label={t`Players`}>
          {unlisted ? (
            <span className="data">–</span>
          ) : (
            <span className="data">
              {players}
              <span className="text-muted-foreground">/{maxPlayers}</span>
            </span>
          )}
        </Stat>
        <Stat label={t`Ping`}>
          <span className="data">
            <PingValue ping={ping} offline={offline !== null} />
          </span>
        </Stat>
        <Stat label={t`Map`}>{mapName(server.map)}</Stat>
        <Stat label={t`In-game time`}>
          {/* What an unlisted server last reported is long out of date. */}
          <span className="data">{(!unlisted && server.time) || "–"}</span>
          {server.time && !unlisted && (
            <span className="ml-1.5 text-xs text-muted-foreground">
              {isNight(server.time) ? t`Night` : t`Day`}
              {server.timeAcceleration ? ` · ${t`${speed}× speed`}` : ""}
            </span>
          )}
        </Stat>
        <Stat label={t`Perspective`}>{server.firstPersonOnly ? t`First person only` : t`First and third person`}</Stat>
        <Stat label={t`Version`}>
          <span className="data">{server.version || "–"}</span>
        </Stat>
      </dl>

      <section aria-labelledby="mods-heading" className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-baseline justify-between px-4 pt-4 pb-2">
          <h3 id="mods-heading" className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            <Trans>Mods</Trans>
            {mods && mods.length > 0 && <span className="data ml-1.5">{mods.length}</span>}
          </h3>
          {mods && mods.length > 0 && installed && !downloading && (
            <p className={cn("text-xs", missing > 0 ? "text-warning" : "text-success")} aria-live="polite">
              {missing > 0
                ? t`${plural(missing, { one: "# to download", other: "# to download" })}`
                : t`All up to date`}
            </p>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {unlisted ? (
            <p className="px-2 py-1 text-[13px] text-muted-foreground">
              <Trans>The mods show again once the server is back in the list.</Trans>
            </p>
          ) : mods === null ? (
            <div className="flex flex-col gap-2 px-2 py-1" aria-busy="true">
              {Array.from({ length: Math.min(server.modCount, 8) }, (_, i) => (
                <Skeleton key={i} className="h-4" style={{ width: `${45 + ((i * 29) % 40)}%` }} />
              ))}
            </div>
          ) : modsFailed ? (
            <div className="flex flex-col items-start gap-2 px-2 py-1">
              <p className="text-[13px] text-muted-foreground">
                <Trans>Couldn't load this server's mods.</Trans>
              </p>
              <Button variant="secondary" size="sm" onClick={() => setModsAttempt((n) => n + 1)}>
                <Trans>Try again</Trans>
              </Button>
            </div>
          ) : mods.length === 0 ? (
            <p className="px-2 py-1 text-[13px] text-muted-foreground">
              <Trans>This is a vanilla server. No mods needed.</Trans>
            </p>
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
              ? t`This server isn't in the server list right now, so it's probably offline. It comes back once the server is up again.`
              : t`This server isn't answering, so it's probably offline or restarting. You can still try to join.`}
          </Notice>
        )}
        {install === null && (
          <Notice>
            <Trans>
              DayZ wasn't found on this computer.{" "}
              <button
                type="button"
                onClick={onOpenSettings}
                className="font-medium text-foreground underline underline-offset-2"
              >
                Set the DayZ folder
              </button>{" "}
              to play.
            </Trans>
          </Notice>
        )}

        {server.password && !downloading && (
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="server-password" className="text-xs text-muted-foreground">
                <Lock className="size-3" aria-hidden />
                <Trans>Server password</Trans>
              </Label>
              <div className="relative">
                <Input
                  id="server-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="off"
                  spellCheck={false}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
                    event.preventDefault();
                    join();
                  }}
                  aria-describedby="server-password-hint"
                  className="h-8 pr-9"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => setShowPassword((shown) => !shown)}
                  aria-label={showPassword ? t`Hide password` : t`Show password`}
                  title={showPassword ? t`Hide password` : t`Show password`}
                  className="absolute top-1 right-1 text-muted-foreground"
                >
                  {showPassword ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
                </Button>
              </div>
              <span id="server-password-hint" className="text-xs text-muted-foreground">
                <Trans>If it&rsquo;s wrong, the server turns you away once DayZ has loaded.</Trans>
              </span>
            </div>
            <div className="flex items-start gap-2.5">
              <Checkbox
                id="remember-password"
                checked={remember}
                disabled={!storeAvailable}
                onCheckedChange={(state) => changeRemember(state === true)}
                aria-describedby={storeAvailable ? undefined : "remember-password-hint"}
                className="mt-px"
              />
              <div className="flex flex-col gap-0.5">
                <Label htmlFor="remember-password" className="text-[13px] leading-4 font-normal">
                  <Trans>Remember password</Trans>
                </Label>
                {!storeAvailable && (
                  <span id="remember-password-hint" className="text-xs text-muted-foreground">
                    <Trans>Needs a password store on this computer, such as GNOME Keyring or KWallet.</Trans>
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {downloading ? (
          <DownloadStatus progress={downloading} startsGame={job?.startsGame ?? true} onCancel={onCancelDownload} />
        ) : (
          <div className="flex">
            <Button
              size="lg"
              disabled={!canPlay}
              onClick={join}
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
                ? t`Starting DayZ…`
                : job || checking
                  ? t`Checking mods`
                  : missing > 0
                    ? t`${plural(missing, { one: "Download # mod and play", other: "Download # mods and play" })}`
                    : t`Play`}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="lg"
                  aria-label={t`More options`}
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
                    <span className="text-[13px] font-medium">
                      <Trans>Load mods</Trans>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {missing > 0
                        ? t`${plural(missing, {
                            one: "Download the # missing or out-of-date mod without starting DayZ.",
                            other: "Download the # missing or out-of-date mods without starting DayZ.",
                          })}`
                        : t`Every mod for this server is installed and up to date.`}
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
  const { t } = useLingui();
  const name = mod.name;
  const status = progress?.status ?? (installed === null ? null : installed ? "installed" : "missing");
  const percent = progress && progress.total > 0 ? Math.floor((progress.downloaded / progress.total) * 100) : null;

  return (
    <li className="group flex h-8 items-center gap-2 rounded-md px-2 text-[13px] hover:bg-accent/50">
      {status === "installed" ? (
        <CircleCheck className="size-3.5 shrink-0 text-success" aria-label={t`Installed`} />
      ) : status === "missing" ? (
        <CircleAlert className="size-3.5 shrink-0 text-warning" aria-label={t`Missing or out of date`} />
      ) : status === "downloading" ? (
        <Loader2
          className="size-3.5 shrink-0 animate-spin text-primary motion-reduce:animate-none"
          aria-label={t`Downloading`}
        />
      ) : status === "queued" ? (
        <Clock className="size-3.5 shrink-0 text-muted-foreground" aria-label={t`Waiting to download`} />
      ) : status === "failed" ? (
        <CircleX className="size-3.5 shrink-0 text-danger" aria-label={t`Download failed`} />
      ) : (
        <span className="size-3.5 shrink-0" />
      )}
      <span className="min-w-0 flex-1 truncate" title={mod.name}>
        {mod.name}
      </span>
      {status === "downloading" || status === "queued" ? (
        <span className="data shrink-0 text-xs text-muted-foreground">
          {status === "queued" ? t`Waiting` : percent === null ? t`Starting` : `${percent}%`}
        </span>
      ) : (
        <Button
          variant="ghost"
          size="xs"
          aria-label={t`Open ${name} in the Steam Workshop`}
          onClick={() =>
            backend
              .openWorkshopPage(mod.steamWorkshopId)
              .catch((e) => toast.error(t`Couldn't open the Workshop page`, { description: errorMessage(e) }))
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
  const { t } = useLingui();
  const done = progress.filter((p) => p.status === "installed").length;
  // Steam only reports sizes for the mods it is downloading right now.
  const active = progress.filter((p) => p.status === "downloading");
  const downloaded = active.reduce((sum, p) => sum + p.downloaded, 0);
  const total = active.reduce((sum, p) => sum + p.total, 0);
  const count = progress.length;
  const downloadedSize = formatBytes(downloaded);
  const totalSize = formatBytes(total);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between text-[13px]">
          <span className="font-medium">
            {startsGame ? t`Downloading mods, then starting DayZ` : t`Downloading mods`}
          </span>
          <span className="data text-xs text-muted-foreground" aria-live="polite">
            <Trans>
              {done} of {count}
            </Trans>
          </span>
        </div>
        <Progress value={downloadFraction(progress) * 100} aria-label={t`Mod download progress`} />
        <p className="data text-xs text-muted-foreground">
          {total > 0 ? t`${downloadedSize} of ${totalSize}` : t`Waiting for Steam`}
        </p>
      </div>
      <Button variant="secondary" onClick={onCancel} className="w-full">
        <Trans>Cancel</Trans>
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
