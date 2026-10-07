import { useId, useState, type ReactNode } from "react";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { Search, X } from "lucide-react";
import { CountryFlag } from "@/components/country-flag";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useActiveOption } from "@/hooks/use-active-option";
import type { Filters, ModsFilter, Option, Perspective, ServerType, TimeOfDay } from "@/lib/filter";
import { countryName } from "@/lib/countries";
import { cn } from "@/lib/utils";

const ANY = "any";
const PINGS = [50, 100, 150];

type Props = {
  filters: Filters;
  onChange: (patch: Partial<Filters>) => void;
  maps: Option[];
  versions: Option[];
  /** Countries by code. */
  countries: Option[];
  mods: Option[];
  shown: number;
  /** Whether anything is narrowed, so Reset has something to do. */
  canReset: boolean;
  onReset: () => void;
};

/** Every filter, in groups, inside the Filters popover. */
export function FilterMenu({ filters, onChange, maps, versions, countries, mods, shown, canReset, onReset }: Props) {
  const { t, i18n } = useLingui();
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
                <SelectContent className="max-h-80">
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
                    {filters.version ? <span className="data text-xs">{filters.version}</span> : t`All versions`}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="max-h-80">
                  <SelectItem value={ANY}>
                    <Trans>All versions</Trans>
                  </SelectItem>
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
              <Select
                value={filters.country || ANY}
                onValueChange={(country) => onChange({ country: country === ANY ? "" : country })}
              >
                <SelectTrigger size="sm" aria-label={t`Country`} className="w-full text-[13px]">
                  <SelectValue>
                    {filters.country ? (
                      <span className="flex min-w-0 items-center gap-2">
                        <CountryFlag code={filters.country} decorative />
                        <span className="truncate">{countryName(filters.country, i18n.locale)}</span>
                      </span>
                    ) : (
                      t`All countries`
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="max-h-80">
                  <SelectItem value={ANY}>
                    <Trans>All countries</Trans>
                  </SelectItem>
                  {countries.map(({ value, count: servers }) => (
                    <SelectItem key={value} value={value}>
                      <CountryFlag code={value} decorative />
                      {countryName(value, i18n.locale)}
                      <span className="data ml-1 text-xs text-muted-foreground">{i18n.number(servers)}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
