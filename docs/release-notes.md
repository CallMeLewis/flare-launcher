# Writing release notes

Follow these when writing or editing release notes, which every version bump needs.

## Where they live

Every version's notes are a section of [`CHANGELOG.md`](../CHANGELOG.md), newest at the top:

```
## 1.2.0 - 2026-11-14

- New ...
- Fixed ...
```

- The heading is `## ` and the version, then ` - ` and the release date (YYYY-MM-DD).
- The build stops if the version in `package.json` has no section, or the section has no bullets.
- The launcher shows the running version's section in Settings > About, and the release puts it in the update
  feed so the launcher can show it when the update is offered. The download page's changelog lists every section.
- A beta gets its own section (`## 1.2.0-beta.1`) while it is current. When the stable version ships, write its
  section fresh for someone coming from the last stable version, and delete the beta sections: each beta build
  already carries its own notes.

## Format

The app only shows the lines that start with `- `, as plain text in a bulleted list. So:

- One bullet per line, starting with `- `. Headings, blank lines, wrapped lines and anything else are dropped.
- No Markdown inside a bullet: `**bold**`, `` `code` `` and links appear as the raw characters. Write
  Settings > Folders, not **Settings > Folders**.
- There are no category headings. Order the bullets by category instead (see below).

## Writing them

Release notes are for players using the launcher, not for the people developing it.

- Describe what changed from the player's point of view: what they can now do, what behaves differently, or what
  problem is gone. Lead with the result, not how it was built.
  Prefer "Mods a server needs now download while you watch, then the game starts on its own." over "Added Steamworks
  UGC subscription and polling of item download state."
- Use plain language and the launcher's own words (button labels, filter names, Settings > Game). No
  developer terms, internal names, error codes, ticket numbers or file, class or variable names.
- Don't name other launchers or services, including where the server list comes from.
- When a change only affects one platform, say so: "On Linux, ...".
- Keep each bullet to one sentence where practical, with a second only when it adds important context.
- Be specific and factual. No "various improvements", "general bug fixes" or "improved performance" when you know what
  actually improved, no marketing language, and don't exaggerate how big a change is.
- Leave out anything players can't notice: refactoring, dependency updates, tests, CI, build and packaging changes,
  developer tooling.

## One bullet per change

A change appears once, however much work went into it. A new feature gets one bullet that says what it does, including
its knock-on effects elsewhere (a new column in the server list, a new prompt when joining). The same kind of change in
many places is one bullet too: clearer wording across several settings pages is one bullet, not one per page.

Prefer "Search now also finds servers by the mods they run, and shows which mod matched." over two bullets, one for
searching by mod name and one for showing the matched mod.

The test: would the player consider this a separate change? If not, merge it. Don't combine unrelated changes just
because they were made together, either.

## Categories and order

Order the bullets in these categories, skipping empty ones, and start each with a word that makes its category clear
where it helps ("New ...", "Fixed ...", "Removed ..."):

1. **Action needed**: changes that need the player to do something. They go first, start with "Action needed:", and
   say what changed, who it affects and what to do, on one line. For example: "Action needed: the DayZ folder setting
   has been reset. If DayZ isn't found through Steam, choose its folder again in Settings > Folders."
2. **Added**: new features, options or capabilities. "New Load mods option next to Play, to download a server's mods
   without starting DayZ."
3. **Improved**: existing features that work better, faster or more conveniently. "Ping now shows the real network
   delay instead of how long a server takes to answer."
4. **Changed**: existing behaviour that intentionally works differently, not just better.
5. **Fixed**: describe the problem the player saw, not the bug. "Fixed Play staying greyed out after the missing mods
   had finished downloading", not "Fixed stale installVersion dependency in the mod check."
6. **Removed**: say what to use instead, where there is an alternative.
7. **Security**: what players should know, without details that could create a risk.

## Final check

- Is every bullet something a player can notice, written without technical wording?
- Does any feature name (Play, Load mods, Settings...) appear in more than one bullet? Merge them.
- Is any other launcher or service named? Remove it.
- Are the bullets in category order, with any "Action needed:" first?
- Does every bullet start with `- `, sit on one line and contain no Markdown?
