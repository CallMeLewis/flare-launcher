import { useId, useState, type ReactNode } from "react";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { ChevronDown, Search, X } from "lucide-react";
import { CountryFlag } from "@/components/country-flag";
import { Button } from "@flare/ui/ui/button";
import { Checkbox } from "@flare/ui/ui/checkbox";
import { Input } from "@flare/ui/ui/input";
import { Label } from "@flare/ui/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@flare/ui/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@flare/ui/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@flare/ui/ui/toggle-group";
import { useActiveOption } from "@/hooks/use-active-option";
import {
  MY_VERSION,
  compareGameVersions,
  type Filters,
  type ModsFilter,
  type Option,
  type Perspective,
  type ServerType,
  type TimeOfDay,
} from "@/lib/filter";
import { CONTINENT_NAMES, CONTINENTS, continentOfCountry } from "@/lib/continents";
import { countryName } from "@/lib/countries";
import { cn } from "@/lib/utils";

const ANY = "any";
const PINGS = [50, 100, 150];

type Props = {
  filters: Filters;
  onChange: (patch: Partial<Filters>) => void;
  maps: Option[];
  versions: Option[];
  /** The DayZ version on this computer, for Same as mine. */
  gameVersion: string | null;
  /** Countries by code. */
  countries: Option[];
  mods: Option[];
  shown: number;
  /** Whether anything is narrowed, so Reset has something to do. */
  canReset: boolean;
  onReset: () => void;
};

/** Every filter, in groups, inside the Filters popover. */
export function FilterMenu({
  filters,
  onChange,
  maps,
  versions,
  gameVersion,
  countries,
  mods,
  shown,
  canReset,
  onReset,
}: Props) {
  const { t, i18n } = useLingui();
  const sameAsMine = versions.reduce(
    (servers, { value, count }) => servers + (compareGameVersions(value, gameVersion) === 0 ? count : 0),
    0,
  );
  return (
    <div className="flex max-h-[min(640px,var(--radix-popover-content-available-height))] flex-col">
      <div className="grid min-h-0 grid-cols-2 overflow-y-auto">
        <div className="border-r">
          <Group title={t`Server`}>
            <Field label={t`Map`}>
              <Select value={filters.map || ANY} onValueChange={(map) => onChange({ map: map === ANY ? "" : map })}>
                <SelectTrigger size="sm" aria-label={t`Map`} className="w-full text-[13px]">
                  <SelectValue>{filters.map || t`All maps`}</SelectValue>
                </SelectTrigger>
                <SelectContent className="max-h-80 border-input">
                  <SelectItem value={ANY}>
                    <Trans>All maps</Trans>
                  </SelectItem>
                  {maps.map(({ value, count: servers }) => (
                    <SelectItem key={value} value={value}>
                      {value}
                      <span className="data ml-1 text-xs text-muted-foreground">{i18n.number(servers)}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t`Game version`}>
              <Select
                value={filters.version || ANY}
                onValueChange={(version) => onChange({ version: version === ANY ? "" : version })}
              >
                <SelectTrigger size="sm" aria-label={t`Game version`} className="w-full text-[13px]">
                  <SelectValue>
                    {filters.version === MY_VERSION ? (
                      t`Same as mine`
                    ) : filters.version ? (
                      <span className="data text-xs">{filters.version}</span>
                    ) : (
                      t`All versions`
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="max-h-80 border-input">
                  <SelectItem value={ANY}>
                    <Trans>All versions</Trans>
                  </SelectItem>
                  {gameVersion && (
                    <SelectItem value={MY_VERSION}>
                      <Trans>
                        Same as mine <span className="data text-xs">({gameVersion})</span>
                      </Trans>
                      <span className="data ml-1 text-xs text-muted-foreground">{i18n.number(sameAsMine)}</span>
                    </SelectItem>
                  )}
                  {versions.map(({ value, count: servers }) => (
                    <SelectItem key={value} value={value}>
                      <span className="data text-xs">{value}</span>
                      <span className="data ml-1 text-xs text-muted-foreground">{i18n.number(servers)}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t`Country`}>
              <CountryPicker
                countries={countries}
                chosen={filters.countries}
                onChange={(chosen) => onChange({ countries: chosen })}
              />
            </Field>
            <Field label={t`Server type`}>
              <Segmented<ServerType>
                label={t`Server type`}
                value={filters.serverType}
                onChange={(serverType) => onChange({ serverType })}
                options={[
                  ["any", t`Any`],
                  ["official", t`Official`],
                  ["community", t`Community`],
                ]}
              />
            </Field>
          </Group>

          <Group title={t`Players`}>
            <Check
              label={t`Hide empty servers`}
              checked={filters.hasPlayers}
              onChange={(hasPlayers) => onChange({ hasPlayers })}
            />
            <Check
              label={t`Hide full servers`}
              checked={filters.notFull}
              onChange={(notFull) => onChange({ notFull })}
            />
          </Group>

          <Group title={t`Connection`}>
            <Field label={t`Ping`}>
              <Segmented<string>
                label={t`Ping`}
                value={filters.maxPing === null ? ANY : String(filters.maxPing)}
                onChange={(value) => onChange({ maxPing: value === ANY ? null : Number(value) })}
                options={[[ANY, t`Any`], ...PINGS.map((ms): [string, string] => [String(ms), t`< ${ms} ms`])]}
              />
            </Field>
            <Check
              label={t`Hide offline servers`}
              hint={t`Servers that stop answering`}
              checked={filters.hideOffline}
              onChange={(hideOffline) => onChange({ hideOffline })}
            />
          </Group>
        </div>

        <div>
          <Group title={t`Gameplay`}>
            <Field label={t`Perspective`}>
              <Segmented<Perspective>
                label={t`Perspective`}
                value={filters.perspective}
                onChange={(perspective) => onChange({ perspective })}
                options={[
                  ["any", t`Any`],
                  ["first", t`1PP only`],
                  ["third", t`3PP allowed`],
                ]}
              />
            </Field>
            <Field label={t`Time of day`}>
              <Segmented<TimeOfDay>
                label={t`Time of day`}
                value={filters.timeOfDay}
                onChange={(timeOfDay) => onChange({ timeOfDay })}
                options={[
                  ["any", t`Any`],
                  ["day", t`Day`],
                  ["night", t`Night`],
                ]}
              />
            </Field>
          </Group>

          <Group title={t`Mods`}>
            <Segmented<ModsFilter>
              label={t`Mods`}
              value={filters.mods}
              onChange={(value) => onChange({ mods: value, ...(value === "vanilla" && { requiredMods: [] }) })}
              options={[
                ["any", t`Any`],
                ["modded", t`Modded`],
                ["vanilla", t`Vanilla`],
              ]}
            />
            <ModPicker
              mods={mods}
              chosen={filters.requiredMods}
              disabled={filters.mods === "vanilla"}
              onChange={(requiredMods) => onChange({ requiredMods, ...(requiredMods.length > 0 && { mods: "any" }) })}
            />
          </Group>

          <Group title={t`Access`}>
            <Check
              label={t`No password`}
              checked={filters.noPassword}
              onChange={(noPassword) => onChange({ noPassword })}
            />
            <Check
              label={t`BattlEye on`}
              hint={t`The anti-cheat DayZ uses`}
              checked={filters.battlEye}
              onChange={(battlEye) => onChange({ battlEye })}
            />
          </Group>
        </div>
      </div>

      <div className="flex items-center justify-between border-t px-4 py-2.5">
        <p className="text-xs text-muted-foreground" aria-live="polite">
          <Plural
            value={shown}
            one={
              <Trans>
                <span className="data text-foreground">#</span> server match
              </Trans>
            }
            other={
              <Trans>
                <span className="data text-foreground">#</span> servers match
              </Trans>
            }
          />
        </p>
        <Button variant="ghost" size="sm" disabled={!canReset} onClick={onReset} className="h-7 text-xs">
          <Trans>Reset filters</Trans>
        </Button>
      </div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3 border-b px-4 py-3.5 last:border-b-0">
      <h3 id={id} className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-muted-foreground" aria-hidden>
        {label}
      </span>
      {children}
    </div>
  );
}

function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: [T, string][];
}) {
  return (
    <ToggleGroup
      type="single"
      aria-label={label}
      value={value}
      // Choosing the current option again would clear it; one is always chosen.
      onValueChange={(next) => next && onChange(next as T)}
      className="flex w-full"
    >
      {options.map(([option, text]) => (
        <ToggleGroupItem key={option} value={option} className="min-w-0 flex-1 px-1.5">
          {text}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

function Check({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-2.5">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(state) => onChange(state === true)}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="mt-px"
      />
      <div className="flex flex-col gap-0.5">
        <Label htmlFor={id} className="text-[13px] leading-4 font-normal">
          {label}
        </Label>
        {hint && (
          <span id={`${id}-hint`} className="text-xs text-muted-foreground">
            {hint}
          </span>
        )}
      </div>
    </div>
  );
}

const MOD_SUGGESTIONS = 6;

/** Picks mods a server has to run, by typing part of a name. */
function ModPicker({
  mods,
  chosen,
  disabled,
  onChange,
}: {
  mods: Option[];
  chosen: string[];
  disabled: boolean;
  onChange: (chosen: string[]) => void;
}) {
  const { t, i18n } = useLingui();
  const id = useId();
  const [text, setText] = useState("");
  const term = text.trim().toLowerCase();
  const matches = term
    ? mods
        .filter((mod) => !chosen.includes(mod.value) && mod.value.toLowerCase().includes(term))
        .slice(0, MOD_SUGGESTIONS)
    : [];
  const choose = (index: number) => {
    onChange([...chosen, matches[index].value]);
    setText("");
  };
  const { active, setActive, onKeyDown } = useActiveOption(matches.length, choose, () => setText(""));

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs text-muted-foreground">
        <Trans>Must run</Trans>
      </label>
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          id={id}
          role="combobox"
          aria-expanded={matches.length > 0}
          aria-controls={`${id}-list`}
          aria-activedescendant={active >= 0 ? `${id}-${active}` : undefined}
          aria-autocomplete="list"
          autoComplete="off"
          spellCheck={false}
          placeholder={disabled ? t`Not for vanilla servers` : t`Search mods`}
          disabled={disabled}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setActive(-1);
          }}
          onKeyDown={onKeyDown}
          className="h-8 pl-8 text-[13px]"
        />
      </div>
      {matches.length > 0 && (
        <ul id={`${id}-list`} role="listbox" aria-label={t`Mods`} className="flex flex-col rounded-md border p-1">
          {matches.map((mod, index) => (
            <li
              key={mod.value}
              id={`${id}-${index}`}
              role="option"
              aria-selected={index === active}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(index)}
              onMouseEnter={() => setActive(index)}
              className={cn(
                "flex h-7 cursor-pointer items-center gap-2 rounded-sm px-2 text-[13px]",
                index === active && "bg-accent",
              )}
            >
              <span className="truncate">{mod.value}</span>
              <span className="data ml-auto shrink-0 text-xs text-muted-foreground">{i18n.number(mod.count)}</span>
            </li>
          ))}
        </ul>
      )}
      {chosen.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {chosen.map((name) => (
            <span
              key={name}
              className="flex h-6 max-w-full items-center gap-1 rounded-full border border-primary/35 bg-primary/10 pr-0.5 pl-2.5 text-xs"
            >
              <span className="truncate" title={name}>
                {name}
              </span>
              <button
                type="button"
                aria-label={t`Remove ${name}`}
                onClick={() => onChange(chosen.filter((other) => other !== name))}
                className="flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:outline-2"
              >
                <X className="size-3" aria-hidden />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

const HEADING = "text-[11px] font-medium tracking-wide text-muted-foreground uppercase";

/**
 * Picks the countries a server has to be in. Each continent with servers in the list sits at the top, to choose or
 * clear all its countries at once, including ones with no servers yet; the countries themselves follow, A to Z.
 */
function CountryPicker({
  countries,
  chosen,
  onChange,
}: {
  countries: Option[];
  chosen: string[];
  onChange: (chosen: string[]) => void;
}) {
  const { t, i18n } = useLingui();
  const id = useId();
  const picked = new Set(chosen);
  const name = (code: string) => countryName(code, i18n.locale);
  const continentName = (code: string) => i18n._(CONTINENT_NAMES[code]);

  const continents = new Map<string, { servers: number; listed: string[] }>();
  for (const { value, count } of countries) {
    const continent = continentOfCountry(value);
    if (!continent) continue;
    const entry = continents.get(continent) ?? { servers: 0, listed: [] };
    entry.servers += count;
    entry.listed.push(value);
    continents.set(continent, entry);
  }
  const continentRows = [...continents]
    .map(([code, { servers, listed }]) => {
      const some = listed.some((country) => picked.has(country));
      const all = listed.every((country) => picked.has(country));
      return { code, servers, checked: all ? true : some ? ("indeterminate" as const) : false };
    })
    .sort((a, b) => continentName(a.code).localeCompare(continentName(b.code), undefined, { sensitivity: "base" }));

  const toggleContinent = (continent: string, on: boolean) => {
    const codes = new Set(CONTINENTS[continent]);
    const rest = chosen.filter((code) => !codes.has(code));
    onChange(on ? [...rest, ...codes] : rest);
  };
  const toggleCountry = (code: string, on: boolean) =>
    onChange(on ? [...chosen, code] : chosen.filter((other) => other !== code));

  // Whole continents by name, then the other countries, as the chips above the list show them.
  const whole = Object.entries(CONTINENTS).filter(([, codes]) => codes.every((code) => picked.has(code)));
  const inWhole = new Set(whole.flatMap(([, codes]) => codes));
  const single = chosen.length === 1 ? chosen[0] : null;
  const summary = [
    ...whole.map(([continent]) => continentName(continent)),
    ...chosen.filter((code) => !inWhole.has(code)).map(name),
  ];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-label={t`Country`}
          className="w-full justify-between gap-2 px-3 text-[13px] font-normal"
        >
          <span className="flex min-w-0 items-center gap-2">
            {single && <CountryFlag code={single} decorative />}
            <span className="truncate">{summary.length > 0 ? summary.join(", ") : t`All countries`}</span>
          </span>
          <ChevronDown className="size-4 shrink-0 opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        collisionPadding={12}
        className="flex max-h-[min(420px,var(--radix-popover-content-available-height))] w-72 flex-col border-input p-0"
      >
        <div className="flex min-h-0 flex-col overflow-y-auto p-1.5">
          <div role="group" aria-labelledby={`${id}-continents`} className="flex flex-col gap-0.5 border-b pb-1.5">
            <div className="flex h-6 shrink-0 items-center justify-between px-1.5">
              <span id={`${id}-continents`} className={HEADING}>
                <Trans>Continents</Trans>
              </span>
              {chosen.length > 0 && (
                <Button variant="ghost" size="sm" onClick={() => onChange([])} className="h-6 px-2 text-xs">
                  <Trans>Clear selection</Trans>
                </Button>
              )}
            </div>
            {continentRows.map(({ code, servers, checked }) => (
              <PickRow
                key={code}
                checked={checked}
                onChange={(on) => toggleContinent(code, on)}
                label={continentName(code)}
                count={i18n.number(servers)}
              />
            ))}
          </div>
          <div role="group" aria-labelledby={`${id}-countries`} className="flex flex-col gap-0.5 pt-1.5">
            <div className="flex h-6 shrink-0 items-center px-1.5">
              <span id={`${id}-countries`} className={HEADING}>
                <Trans>Countries</Trans>
              </span>
            </div>
            {countries.map(({ value, count }) => (
              <PickRow
                key={value}
                checked={picked.has(value)}
                onChange={(on) => toggleCountry(value, on)}
                icon={<CountryFlag code={value} decorative />}
                label={name(value)}
                count={i18n.number(count)}
              />
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function PickRow({
  checked,
  onChange,
  icon,
  label,
  count,
}: {
  checked: boolean | "indeterminate";
  onChange: (checked: boolean) => void;
  icon?: ReactNode;
  label: string;
  count: string;
}) {
  const id = useId();
  return (
    <div className="flex h-7 shrink-0 items-center gap-2 rounded-sm px-1.5 hover:bg-accent">
      <Checkbox id={id} checked={checked} onCheckedChange={(state) => onChange(state === true)} />
      <Label htmlFor={id} className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-[13px] font-normal">
        {icon}
        <span className="truncate">{label}</span>
        <span className="data ml-auto shrink-0 text-xs text-muted-foreground">{count}</span>
      </Label>
    </div>
  );
}
