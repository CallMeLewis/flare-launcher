import { useId, useState, type ReactNode } from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useActiveOption } from "@/hooks/use-active-option";
import type { Filters, ModsFilter, Option, Perspective, ServerType, TimeOfDay } from "@/lib/filter";
import { cn } from "@/lib/utils";

const ANY = "any";
const PINGS = [50, 100, 150];
const count = new Intl.NumberFormat();

type Props = {
  filters: Filters;
  onChange: (patch: Partial<Filters>) => void;
  maps: Option[];
  versions: Option[];
  mods: Option[];
  shown: number;
  /** Whether anything is narrowed, so Reset has something to do. */
  canReset: boolean;
  onReset: () => void;
};

/** Every filter, in groups, inside the Filters popover. */
export function FilterMenu({ filters, onChange, maps, versions, mods, shown, canReset, onReset }: Props) {
  return (
    <div className="flex max-h-[min(640px,var(--radix-popover-content-available-height))] flex-col">
      <div className="grid min-h-0 grid-cols-2 overflow-y-auto">
        <div className="border-r">
          <Group title="Server">
            <Field label="Map">
              <Select value={filters.map || ANY} onValueChange={(map) => onChange({ map: map === ANY ? "" : map })}>
                <SelectTrigger size="sm" aria-label="Map" className="w-full text-[13px]">
                  <SelectValue>{filters.map || "All maps"}</SelectValue>
                </SelectTrigger>
                <SelectContent className="max-h-80">
                  <SelectItem value={ANY}>All maps</SelectItem>
                  {maps.map(({ value, count: servers }) => (
                    <SelectItem key={value} value={value}>
                      {value}
                      <span className="data ml-1 text-xs text-muted-foreground">{count.format(servers)}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Game version">
              <Select
                value={filters.version || ANY}
                onValueChange={(version) => onChange({ version: version === ANY ? "" : version })}
              >
                <SelectTrigger size="sm" aria-label="Game version" className="w-full text-[13px]">
                  <SelectValue>
                    {filters.version ? <span className="data text-xs">{filters.version}</span> : "All versions"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="max-h-80">
                  <SelectItem value={ANY}>All versions</SelectItem>
                  {versions.map(({ value, count: servers }) => (
                    <SelectItem key={value} value={value}>
                      <span className="data text-xs">{value}</span>
                      <span className="data ml-1 text-xs text-muted-foreground">{count.format(servers)}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Server type">
              <Segmented<ServerType>
                label="Server type"
                value={filters.serverType}
                onChange={(serverType) => onChange({ serverType })}
                options={[
                  ["any", "Any"],
                  ["official", "Official"],
                  ["community", "Community"],
                ]}
              />
            </Field>
          </Group>

          <Group title="Players">
            <Check
              label="Has players"
              checked={filters.hasPlayers}
              onChange={(hasPlayers) => onChange({ hasPlayers })}
            />
            <Check label="Not full" checked={filters.notFull} onChange={(notFull) => onChange({ notFull })} />
          </Group>

          <Group title="Connection">
            <Field label="Ping">
              <Segmented<string>
                label="Ping"
                value={filters.maxPing === null ? ANY : String(filters.maxPing)}
                onChange={(value) => onChange({ maxPing: value === ANY ? null : Number(value) })}
                options={[[ANY, "Any"], ...PINGS.map((ms): [string, string] => [String(ms), `< ${ms} ms`])]}
              />
            </Field>
            <Check
              label="Hide offline servers"
              hint="Servers that stop answering"
              checked={filters.hideOffline}
              onChange={(hideOffline) => onChange({ hideOffline })}
            />
          </Group>
        </div>

        <div>
          <Group title="Gameplay">
            <Field label="Perspective">
              <Segmented<Perspective>
                label="Perspective"
                value={filters.perspective}
                onChange={(perspective) => onChange({ perspective })}
                options={[
                  ["any", "Any"],
                  ["first", "1PP only"],
                  ["third", "3PP allowed"],
                ]}
              />
            </Field>
            <Field label="Time of day">
              <Segmented<TimeOfDay>
                label="Time of day"
                value={filters.timeOfDay}
                onChange={(timeOfDay) => onChange({ timeOfDay })}
                options={[
                  ["any", "Any"],
                  ["day", "Day"],
                  ["night", "Night"],
                ]}
              />
            </Field>
          </Group>

          <Group title="Mods">
            <Segmented<ModsFilter>
              label="Mods"
              value={filters.mods}
              onChange={(value) => onChange({ mods: value, ...(value === "vanilla" && { requiredMods: [] }) })}
              options={[
                ["any", "Any"],
                ["modded", "Modded"],
                ["vanilla", "Vanilla"],
              ]}
            />
            <ModPicker
              mods={mods}
              chosen={filters.requiredMods}
              disabled={filters.mods === "vanilla"}
              onChange={(requiredMods) => onChange({ requiredMods, ...(requiredMods.length > 0 && { mods: "any" }) })}
            />
          </Group>

          <Group title="Access">
            <Check
              label="No password"
              checked={filters.noPassword}
              onChange={(noPassword) => onChange({ noPassword })}
            />
            <Check
              label="BattlEye on"
              hint="The anti-cheat DayZ uses"
              checked={filters.battlEye}
              onChange={(battlEye) => onChange({ battlEye })}
            />
          </Group>
        </div>
      </div>

      <div className="flex items-center justify-between border-t px-4 py-2.5">
        <p className="text-xs text-muted-foreground" aria-live="polite">
          <span className="data text-foreground">{count.format(shown)}</span> {shown === 1 ? "server" : "servers"} match
        </p>
        <Button variant="ghost" size="sm" disabled={!canReset} onClick={onReset} className="h-7 text-xs">
          Reset filters
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
        Must run
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
          placeholder={disabled ? "Not for vanilla servers" : "Search mods"}
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
        <ul id={`${id}-list`} role="listbox" aria-label="Mods" className="flex flex-col rounded-md border p-1">
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
              <span className="data ml-auto shrink-0 text-xs text-muted-foreground">{count.format(mod.count)}</span>
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
                aria-label={`Remove ${name}`}
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
