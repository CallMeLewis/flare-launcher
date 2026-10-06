import { i18n } from "@lingui/core";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_FILTERS,
  activeFilterCount,
  filterServers,
  mapCounts,
  matchedMod,
  filterChips,
  modCounts,
  pickSaved,
  pinFavourites,
  sortServers,
  versionCounts,
  type Filters,
} from "./filter";
import type { ServerRow } from "./types";

function server(overrides: Partial<ServerRow> & { id: string }): ServerRow {
  return {
    ip: overrides.id.split(":")[0],
    queryPort: 2303,
    gamePort: 2302,
    name: overrides.id,
    map: "chernarusplus",
    players: 10,
    maxPlayers: 60,
    password: false,
    firstPersonOnly: false,
    official: false,
    battlEye: true,
    version: "1.29",
    time: "12:00",
    timeAcceleration: null,
    modCount: 0,
    mods: [],
    ...overrides,
  };
}

const rows = [
  server({ id: "1.1.1.1:2303", name: "Rearmed EU4", players: 60, maxPlayers: 60, modCount: 20, time: "18:40" }),
  server({ id: "2.2.2.2:2303", name: "Vanilla Livonia", map: "enoch", players: 0, time: "06:10" }),
  server({
    id: "3.3.3.3:2303",
    name: "Hardcore 1PP",
    players: 25,
    firstPersonOnly: true,
    password: true,
    time: "23:05",
  }),
  server({
    id: "4.4.4.4:2303",
    name: "alpha namalsk",
    map: "namalsk",
    players: 25,
    modCount: 3,
    time: "09:00",
    version: "1.28.160123",
  }),
];

const filtered = (filters: Partial<Filters>) =>
  filterServers(rows, { ...DEFAULT_FILTERS, hasPlayers: false, ...filters }).map((r) => r.name);

describe("filterServers", () => {
  it("hides empty servers by default", () => {
    expect(filterServers(rows, DEFAULT_FILTERS).map((r) => r.name)).not.toContain("Vanilla Livonia");
  });

  it("matches every search term against name, address and map name", () => {
    expect(filtered({ search: "livonia" })).toEqual(["Vanilla Livonia"]);
    expect(filtered({ search: "ALPHA nam" })).toEqual(["alpha namalsk"]);
    expect(filtered({ search: "3.3.3.3" })).toEqual(["Hardcore 1PP"]);
    expect(filtered({ search: "rearmed livonia" })).toEqual([]);
  });

  it("finds servers by the name of a mod they run", () => {
    const modNames = ["CF", "DayZ-Expansion-Core", "Mag Obfuscation"];
    const modded = [
      server({ id: "1.1.1.1:2303", name: "Rearmed EU4", modCount: 2, mods: [0, 1] }),
      server({ id: "2.2.2.2:2303", name: "Namalsk Expansion PvE", map: "namalsk", modCount: 1, mods: [0] }),
      server({ id: "3.3.3.3:2303", name: "Hardcore", modCount: 1, mods: [2] }),
    ];
    const search = (text: string) =>
      filterServers(modded, { ...DEFAULT_FILTERS, hasPlayers: false, search: text }, modNames).map((r) => r.name);

    expect(search("expansion")).toEqual(["Rearmed EU4", "Namalsk Expansion PvE"]);
    expect(search("mag obf")).toEqual(["Hardcore"]);
    // Terms can match the server and its mods in any combination.
    expect(search("rearmed cf")).toEqual(["Rearmed EU4"]);
    expect(search("hardcore expansion")).toEqual([]);

    expect(matchedMod(modded[0], "expansion", modNames)).toBe("DayZ-Expansion-Core");
    // Matching through the server's own name needs no mod to explain it.
    expect(matchedMod(modded[1], "expansion", modNames)).toBeNull();
    expect(matchedMod(modded[2], "", modNames)).toBeNull();
  });

  it("applies each toggle", () => {
    expect(filtered({ notFull: true })).not.toContain("Rearmed EU4");
    expect(filtered({ noPassword: true })).not.toContain("Hardcore 1PP");
    expect(filtered({ perspective: "first" })).toEqual(["Hardcore 1PP"]);
    expect(filtered({ perspective: "third" })).not.toContain("Hardcore 1PP");
    expect(filtered({ map: "Livonia" })).toEqual(["Vanilla Livonia"]);
    expect(filtered({ version: "1.28.160123" })).toEqual(["alpha namalsk"]);
    expect(filtered({ mods: "vanilla" })).toEqual(["Vanilla Livonia", "Hardcore 1PP"]);
    expect(filtered({ mods: "modded" })).toEqual(["Rearmed EU4", "alpha namalsk"]);
    expect(filtered({ timeOfDay: "night" })).toEqual(["Hardcore 1PP"]);
    expect(filtered({ timeOfDay: "day" })).toEqual(["Rearmed EU4", "Vanilla Livonia", "alpha namalsk"]);
  });

  it("filters by server type and BattlEye", () => {
    const mixed = [
      server({ id: "1.1.1.1:2303", name: "Official", official: true }),
      server({ id: "2.2.2.2:2303", name: "No BattlEye", battlEye: false }),
    ];
    const names = (filters: Partial<Filters>) =>
      filterServers(mixed, { ...DEFAULT_FILTERS, ...filters }).map((r) => r.name);
    expect(names({ serverType: "official" })).toEqual(["Official"]);
    expect(names({ serverType: "community" })).toEqual(["No BattlEye"]);
    expect(names({ battlEye: true })).toEqual(["Official"]);
  });

  it("needs every required mod, matched by name", () => {
    const modNames = ["CF", "Expansion"];
    const modded = [
      server({ id: "1.1.1.1:2303", name: "Both", modCount: 2, mods: [0, 1] }),
      server({ id: "2.2.2.2:2303", name: "CF only", modCount: 1, mods: [0] }),
    ];
    const names = (requiredMods: string[]) =>
      filterServers(modded, { ...DEFAULT_FILTERS, requiredMods }, modNames).map((r) => r.name);
    expect(names(["CF"])).toEqual(["Both", "CF only"]);
    expect(names(["CF", "Expansion"])).toEqual(["Both"]);
    expect(names(["Gone from the list"])).toEqual([]);
  });

  it("counts every Workshop mod sharing a required mod's name", () => {
    const modNames = ["Code Lock", "Code Lock"];
    const modded = [
      server({ id: "1.1.1.1:2303", name: "First", modCount: 1, mods: [0] }),
      server({ id: "2.2.2.2:2303", name: "Second", modCount: 1, mods: [1] }),
    ];
    const names = filterServers(modded, { ...DEFAULT_FILTERS, requiredMods: ["Code Lock"] }, modNames).map(
      (r) => r.name,
    );
    expect(names).toEqual(["First", "Second"]);
  });

  it("keeps servers not pinged yet until their ping is known", () => {
    const reach = {
      "1.1.1.1:2303": { pingMs: 40, offline: false },
      "3.3.3.3:2303": { pingMs: 140, offline: false },
      "4.4.4.4:2303": { pingMs: null, offline: true },
    } as Record<string, { pingMs: number | null; offline: boolean }>;
    const names = (filters: Partial<Filters>) =>
      filterServers(rows, { ...DEFAULT_FILTERS, hasPlayers: false, ...filters }, [], (id) => reach[id]).map(
        (r) => r.name,
      );
    expect(names({ maxPing: 100 })).toEqual(["Rearmed EU4", "Vanilla Livonia"]);
    expect(names({ hideOffline: true })).toEqual(["Rearmed EU4", "Vanilla Livonia", "Hardcore 1PP"]);
  });
});

describe("sortServers", () => {
  const names = (
    key: Parameters<typeof sortServers>[1]["key"],
    descending: boolean,
    pings: Record<string, number | null> = {},
  ) => sortServers(rows, { key, descending }, (id) => pings[id]).map((r) => r.name);

  it("sorts by players, leaving the input untouched", () => {
    expect(names("players", true)[0]).toBe("Rearmed EU4");
    expect(names("players", false)[0]).toBe("Vanilla Livonia");
    expect(rows[0].name).toBe("Rearmed EU4");
  });

  it("sorts names without regard to case", () => {
    expect(names("name", false)).toEqual(["alpha namalsk", "Hardcore 1PP", "Rearmed EU4", "Vanilla Livonia"]);
  });

  it("sorts by in-game time", () => {
    expect(names("time", false)).toEqual(["Vanilla Livonia", "alpha namalsk", "Rearmed EU4", "Hardcore 1PP"]);
  });

  it("keeps servers without a ping at the bottom in both directions", () => {
    const pings = { "1.1.1.1:2303": 80, "3.3.3.3:2303": 20, "4.4.4.4:2303": null };
    expect(names("ping", false, pings).slice(0, 2)).toEqual(["Hardcore 1PP", "Rearmed EU4"]);
    expect(names("ping", true, pings).slice(0, 2)).toEqual(["Rearmed EU4", "Hardcore 1PP"]);
  });
});

describe("helpers", () => {
  it("lists maps A to Z by display name, merging variants of one map", () => {
    const withGloom = [
      ...rows,
      server({ id: "5.5.5.5:2303", map: "chernarusplusgloom" }),
      server({ id: "6.6.6.6:2303", map: "" }),
    ];
    expect(mapCounts(withGloom)).toEqual([
      { value: "Chernarus", count: 3 },
      { value: "Livonia", count: 1 },
      { value: "Namalsk", count: 1 },
    ]);
    expect(filterServers(withGloom, { ...DEFAULT_FILTERS, hasPlayers: false, map: "Chernarus" })).toHaveLength(3);
  });

  it("lists versions newest first, comparing numbers rather than text", () => {
    const mixed = [
      ...rows,
      server({ id: "7.7.7.7:2303", version: "1.9.100" }),
      server({ id: "8.8.8.8:2303", version: "" }),
    ];
    expect(versionCounts(mixed).map((v) => v.value)).toEqual(["1.29", "1.28.160123", "1.9.100"]);
    expect(versionCounts(mixed)[0].count).toBe(3);
  });

  it("counts active filters", () => {
    expect(activeFilterCount(DEFAULT_FILTERS)).toBe(1);
    expect(
      activeFilterCount({ ...DEFAULT_FILTERS, search: " x ", map: "Livonia", version: "1.29", mods: "modded" }),
    ).toBe(5);
  });
});

describe("pickSaved", () => {
  it("keeps only the remembered filters", () => {
    expect(pickSaved({ ...DEFAULT_FILTERS, notFull: true, maxPing: 80, map: "Livonia", search: "x" })).toEqual({
      hasPlayers: true,
      notFull: true,
      maxPing: 80,
      hideOffline: false,
      perspective: "any",
      serverType: "any",
      noPassword: false,
      battlEye: false,
    });
  });

  it("falls back to the defaults for missing or malformed values", () => {
    expect(pickSaved({ hasPlayers: false, noPassword: "yes", maxPing: -5, perspective: "sideways" })).toMatchObject({
      hasPlayers: false,
      noPassword: false,
      maxPing: null,
      perspective: "any",
    });
  });

  it("carries over the first person toggle older versions saved", () => {
    expect(pickSaved({ firstPersonOnly: true }).perspective).toBe("first");
  });
});

describe("filterChips", () => {
  it("lists what narrows the list, each with what removing it changes", () => {
    const chips = filterChips({ ...DEFAULT_FILTERS, map: "Livonia", maxPing: 80, requiredMods: ["CF", "Expansion"] });
    const text = (label: (typeof chips)[number]["label"]) => (typeof label === "string" ? label : i18n._(label));
    expect(chips.map((chip) => [chip.prefix ? i18n._(chip.prefix) : "", text(chip.label)])).toEqual([
      ["Map", "Livonia"],
      ["", "Hide empty"],
      ["Ping", "under 80 ms"],
      ["Mod", "CF"],
      ["Mod", "Expansion"],
    ]);
    expect(chips[3].clear).toEqual({ requiredMods: ["Expansion"] });
  });

  it("counts mods by how many servers run them, busiest first", () => {
    const modded = [server({ id: "1.1.1.1:2303", mods: [0, 1] }), server({ id: "2.2.2.2:2303", mods: [1] })];
    expect(modCounts(modded, ["CF", "Expansion"])).toEqual([
      { value: "Expansion", count: 2 },
      { value: "CF", count: 1 },
    ]);
  });

  it("counts Workshop mods sharing a name as one mod", () => {
    const modded = [server({ id: "1.1.1.1:2303", mods: [0, 1] }), server({ id: "2.2.2.2:2303", mods: [1] })];
    expect(modCounts(modded, ["Code Lock", "Code Lock"])).toEqual([{ value: "Code Lock", count: 2 }]);
  });
});

describe("pinFavourites", () => {
  it("puts favourites first without reordering either group", () => {
    const names = pinFavourites(rows, new Set(["4.4.4.4:2303", "2.2.2.2:2303"])).map((r) => r.name);
    expect(names).toEqual(["Vanilla Livonia", "alpha namalsk", "Rearmed EU4", "Hardcore 1PP"]);
  });

  it("returns the same list when nothing is a favourite", () => {
    expect(pinFavourites(rows, new Set())).toBe(rows);
  });
});
