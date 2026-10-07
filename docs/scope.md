# What Flare Launcher is for

Read this before adding a feature. The launcher stays small on purpose: every feature has to be built for Windows and
Linux, translated into every language, tested on both and kept working, so each one costs more than it first appears
to.

## The core

Flare Launcher helps a player **find a DayZ server, get its mods and join it**. Everything it does should serve one of
those three steps:

- **Find:** the server list, search, filters, sorting, favourites, recent servers, the LAN list and adding a server by
  address.
- **Prepare:** the server panel's details, checking, downloading and updating mods, and the Mods page for keeping them
  in order.
- **Join:** Play, passwords, starting DayZ the right way on each platform, and the settings for how DayZ starts.

Around that sits what any desktop app needs: updating itself, languages, themes, interface size and first-time setup.

## What it won't do

These ideas come up, and the answer is no unless this document is changed first:

- No accounts, sign-in or online profiles of its own.
- No player tracking, play-time stats, leaderboards or histories of who is on a server.
- No chat, friends lists, groups or other social features.
- No server administration, RCON or hosting tools.
- No mod authoring, packing or publishing.
- No news, adverts, promoted servers or anything that ranks servers for reasons other than the player's own filters.
- No support for games other than DayZ.
- No features that only work on one platform, unless the other platform has no equivalent need.

## Questions to ask of a new feature

1. **Does it help a player find, prepare for or join a server?** If not, it needs a strong reason, and probably
   doesn't belong.
2. **Would players notice if it were missing?** Requests and problems players actually report count for more than
   ideas that would be nice to have.
3. **Can it live in something that already exists?** A filter, a column, a line in the server panel or a menu item
   is better than a new page, dialog or toolbar button.
4. **Does it need a setting?** Prefer a good default. Each setting is a decision handed to the player and another
   combination to test. Add one only when players genuinely want different things.
5. **What does it cost to keep?** Count the Windows and Linux code, the translations, any outside service or data file
   that has to be kept up to date, and what breaks if that service changes.
6. **Is it the simplest version that works?** Ship the smallest useful form first and grow it only when players ask.

A feature that fails the first question, or needs more than one of the others explained away, isn't added.

## Looking back

Features that are already there are not kept just because they exist. When one is rarely used, keeps breaking, or
costs more to maintain than it gives players, consider simplifying or removing it, with a release note saying what to
use instead.

Not every release needs something new. Releases of fixes, speed and clearer wording alone make the launcher better
without making it bigger.
