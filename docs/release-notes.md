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

- One bullet per line, starting with `- `. Headings, blank lines and anything else are dropped.
- No Markdown inside a bullet: `**bold**`, `` `code` `` and links appear as the raw characters. Write
  Settings > Folders, not **Settings > Folders**.
- There are no category headings. Instead, order the bullets by category (see below), so related changes sit together.

## Who they are for

Release notes are written for players using the launcher, not for the people developing it. They explain what has
changed, what has improved and what has been fixed, in a way that is useful to them.

## Core rules

### Write for the user

Describe changes from the user's point of view: what they can now do, what behaves differently, or what problem is gone.

Prefer:

> Mods a server needs now download while you watch, then the game starts on its own.

Instead of:

> Added Steamworks UGC subscription and polling of item download state.

Leave out implementation details unless they genuinely help the user.

### Keep it simple

Use clear, natural language. Avoid:

- Developer terminology
- Internal architecture details
- Commit or pull request descriptions
- Ticket numbers
- Class, method, file or variable names
- Error codes
- Unnecessary technical explanations

Use the words the launcher already uses (button labels, filter names, settings such as Settings > Launch options).

Don't name other launchers or services, including where the server list comes from. Describe what the launcher does on
its own terms.

### Do not repeat the same change

A feature or improvement normally appears only once. Do not write several bullets for different technical parts of
the same user-facing change; if several pieces of work lead to the same outcome, combine them into one bullet.
The same kind of change made in many places is one bullet too: clearer wording across several settings pages is one
bullet, not one per page or per setting.

A new feature gets one bullet, however much it does: say what it does inside that bullet. Its knock-on
effects elsewhere in the launcher (a new column in the server list, a new prompt when joining) belong in that same bullet
too, not in a bullet of their own. A release that collects several betas is written fresh for someone coming from the
last stable version: do not paste the beta bullets together, as the same page will then appear several times.

Prefer:

> Search now also finds servers by the mods they run, and shows which mod matched.

Instead of:

> Search now finds servers by mod name.
> Rows found through a mod show the mod's name.

Before adding another bullet about a feature, ask:

> Would the user consider this a separate change?

If not, merge it with the existing bullet.

### One clear idea per bullet

Each bullet describes one user-facing change or one closely related outcome. Do not combine unrelated changes just
because they were made together.

Keep each bullet to one sentence where practical. Use a second sentence only when it adds important context.

### Explain the result, not the implementation

Lead with what changed for the user. Where useful, briefly say why it matters.

Prefer:

> The server list now loads faster when you open the launcher.

Instead of:

> Cached the server list response and deferred row rendering.

### Only include meaningful user-facing changes

Release notes are not a Git changelog. Leave out, unless they have a visible effect for the user:

- Code refactoring and cleanup
- Dependency updates
- Test changes
- CI, build and packaging changes
- Internal tooling and developer-only changes

## Categories and order

Order the bullets in this order, skipping categories with no changes:

1. **Action needed** - changes that require the user to do something (see below).
2. **Added** - new features, options or capabilities.
   Example: New Load mods option next to Play, to download a server's mods without starting DayZ.
3. **Improved** - existing features that now work better, faster or more conveniently, without changing their purpose.
   Example: Ping now shows the real network delay instead of how long a server takes to answer.
4. **Changed** - existing behaviour that now intentionally works differently (not just better).
5. **Fixed** - things that behaved incorrectly and now behave correctly. Describe the problem the user saw, not the
   underlying bug.
   Prefer: Fixed Play staying greyed out after the missing mods had finished downloading.
   Instead of: Fixed stale installVersion dependency in the mod check.
6. **Removed** - features or behaviour that are gone. Mention what to use instead, where there is an alternative.
7. **Security** - security changes users should know about, without details that could create a risk.

Start a bullet with a word that makes its category clear where it helps ("New ...", "Fixed ...", "Removed ...").

## Action needed and breaking changes

Changes that need the user to do something must not be hidden inside an ordinary bullet. Put them first, starting
with "Action needed:", and say:

1. What has changed
2. Who it affects
3. What they need to do

Keep it on one line like any other bullet (a wrapped second line would be dropped). For example:

- Action needed: the DayZ folder setting has been reset. If DayZ isn't found through Steam, choose its folder again in Settings > Folders.

## Writing style

Release notes should be short, easy to scan, specific, factual, in plain language and consistent with the app's
wording.

Avoid vague entries such as:

- Various improvements
- General bug fixes
- Improved performance
- Fixed some issues

Say what actually improved whenever you know it. No marketing language, and do not exaggerate how big a change is.

## Final check

Before building or publishing, check:

- Is every bullet relevant to a player?
- Does each bullet describe a change or benefit they can notice?
- Could any technical wording be removed?
- Is another launcher or service named anywhere? Remove it.
- Are several bullets describing the same feature? Could related bullets be combined into one clearer one?
- Take each feature name in turn (Play, Load mods, Settings...): does it appear in more than one bullet? If so, merge them.
- Is each bullet in the right category, and are the bullets in category order?
- Have internal-only changes been removed?
- Are required actions called out first, starting with "Action needed:"?
- Can someone understand each bullet without knowing how it was built?
- Does every bullet start with `- ` and contain no Markdown formatting?
