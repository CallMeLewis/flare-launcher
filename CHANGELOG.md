# Changelog

What changed in each version of Flare Launcher, newest first.

## 1.6.0 - 2026-10-27

- New Verified tag beside a server's name in the server list, and Verified owner in the server panel, for servers whose owners have proved they run them, which also show their full name where DayZ would cut it short. Server owners can verify theirs at flarelauncher.app/owners.
- New warning when a server runs a different version of DayZ than yours: a mark next to its name in the server list, a note in the server panel saying which is newer with Play anyway in place of Play, and a Same as mine choice under Game version in the Filters menu. Double-clicking such a server selects it rather than joining.
- New menu when you right-click a server in the list, with Play, Download mods only, favourites, Copy address and Copy join link. Load mods, next to Play, is now called Download mods only too.
- New join links: Copy join link, in a server's right-click menu or next to its address in the server panel, gives a link that opens the server in Flare Launcher, or offers the launcher to download when it isn't installed.
- Improved the server list: it now includes more servers, its player counts are more up to date, and Refresh is faster.
- Improved the look: a deeper navy in dark mode with matching light colours, clearer fonts for text and numbers, server and mod names in regular weight so long lists are easier to scan, and the current page marked with a green bar in the sidebar.
- The server panel now says how much a server's mods take to download before you join, and a download's progress now covers all of them.
- The server panel now sorts a server's mods into To download, Different from the server and Up to date when any need something, so the ones to deal with stand out.
- Improved the warning about a server running a different version of your mods: it's shorter, hovering a mod shows when it was updated on the Workshop, and the warning goes by itself within a minute of the server catching up.
- Improved mod downloads: they now stop with a message saying what happened when Steam closes or stops making progress, and one mod failing no longer stops the others.
- Improved the messages when mods can't be set up in the DayZ folder, such as when a folder of the same name is in the way.
- First-time setup now says whether DayZ was found, lets you choose its folder if it wasn't, and offers Discord activity.
- It's now clearer what your filters apply to: a line under your favourites at the top of All servers marks where the filtered servers start, and Favourites, Recent and LAN say that filters only apply to All servers.
- Remember password now says when the password will be saved and when it has been.
- Keyboard focus is now shown the same way on every button, field and control, and screen readers now read out the icons that show a mod's or a server's status.
- If something goes wrong in the launcher's window, it now offers to reload instead of staying blank.
- Fixed the mod version warning showing for some Linux servers that hold a mod's files twice, though they run the same version.

## 1.5.1 - 2026-10-18

- Each Settings section's title now stays at the top while you scroll.
- Dropdowns, such as Language in Settings > Launcher, now open below the box instead of on top of it.
- The sidebar is now a little wider.
- Fixed a mismatched arrow on the release notes card beside the update button.

## 1.5.0 - 2026-10-17

- New player count next to the server count above the server list: it adds up the players on the servers shown, so it changes as you filter or search.

## 1.4.0 - 2026-10-16

- New warning in the server panel when the server runs a different version of one of your mods, usually because it hasn't restarted since the mod was updated: the mod is marked in the list, and the warning above Play says the server may turn you away until it restarts.
- On Windows, the installer and the launcher are now signed, so Windows names the publisher instead of warning about an unknown one.
- Right-clicking no longer opens a browser menu with Back, Reload and Inspect; text fields still have Cut, Copy and Paste.

## 1.3.0 - 2026-10-13

- New Send report button when something fails, such as joining a server or downloading mods: you see the whole report and can add a note before sending it, and it never includes server names or addresses.
- New in Settings > About: who made the launcher, and a View on GitHub button.
- Improved the server address in the server panel: click anywhere on it to copy it, and it shows Copied once it's done.

## 1.2.1 - 2026-10-10

- Fixed some servers showing another country's flag, such as Bolivia's servers showing Bonaire's.
- Fixed the Country column sorting in an order that looked random: it now sorts by country name, matching the Filters menu.
- Fixed screen readers reading a server's country twice in the server panel and the Filters menu.

## 1.2.0 - 2026-10-07

- New Country column in the server list, showing each server's flag with the country's name on hover; filter by country in the Filters menu, and see it in the server panel.
- New in the server panel: how long until night falls, or until daylight at night, in real time.
- On Linux, new warning above Play when a system memory setting is too low for DayZ, which can make the game freeze, with the commands to fix it.
- New Spanish language, in Settings > Launcher.
- Improved colours in both themes: the sidebar, server panel and menus stand apart from the server list, search boxes and dropdowns have easier-to-see edges, and in light mode the green, amber and red status text is easier to read.
- Improved Linux support: DayZ is now found when Steam is installed as a Snap or as the older Debian and Ubuntu package, and the game now starts through the Flatpak version of Steam when that's where DayZ is installed.
- Improved French, German and American English wording in several places, including a shorter French perspective label in the server panel that was being cut off.
- On Linux, fixed the window freezing while a .deb or .rpm update asks for your password.
- Fixed the refresh button above the server list being cut off when the window is narrow.

## 1.1.6 - 2026-10-06

- On Windows, the installer now shows the Flare Launcher icon.
- The server list no longer stutters while pings come in when it's filtered or sorted by ping.
- Fixed Refresh not updating servers you added by address, which kept showing their old player count and mods until the launcher was restarted.
- Fixed DayZ sometimes starting twice when you joined a server that needs a password twice in quick succession.
- Fixed the server panel sometimes showing the mods of the server selected before, with the wrong number of mods to download next to Play.
- Fixed the Mods filter listing a mod twice when two Workshop mods share its name; choosing it now finds the servers running either one.
- Fixed Verify and Update on the Mods page sometimes never finishing for mods that were already up to date.
- Fixed a mod you unsubscribed from in the launcher staying off the Mods page after you subscribed to it again in Steam, until the launcher was restarted.
- Fixed switching the update channel in Settings > About sometimes offering the other channel's version.
- On Linux, fixed Settings > Launcher still offering Add to app menu after the launcher had been added, when your home folder's name contains symbols such as $.

## 1.1.5 - 2026-10-05

- The launcher now comes in English (UK), English (US), French and German, and follows your computer's language; choose another in Settings > Launcher > Language.
- New Discord activity: your Discord friends see that you're using Flare Launcher and when you're in game, but never which server you're on; turn it off in Settings > Launcher.
- The toolbar above the server list no longer runs out of room: Add server shows just its icon until the window is wide enough for its name.
- Fixed the warning about mods your favourite servers use ending in "and 2 mores" when unsubscribing.

## 1.1.4 - 2026-10-04

- New Mods page in the sidebar, listing every Workshop mod you're subscribed to with its size, when it was last updated and how many servers use it; search and sort them, update outdated mods, verify them to fix missing or incomplete files, or unsubscribe from the ones you no longer need.
- Settings are now split into Game, for how DayZ starts, and Launcher, for the launcher's look and behaviour, with first-time setup now in Settings > Launcher.

## 1.1.3 - 2026-10-04

- New first-time setup for your character name, intro screens, theme and what happens when DayZ starts; run it again from Settings > General.
- Servers that need a password can now remember it, show what you've typed, and join when you press Enter.
- Improved joining a server: a window now shows DayZ starting until the game opens.
- The Has players and Not full filters are now called Hide empty servers and Hide full servers.

## 1.1.2 - 2026-10-04

- Join by address is now the Add server button, with a plus icon, beside the refresh button, so it's easier to find.

## 1.1.1 - 2026-10-03

- New LAN list in the sidebar, showing the DayZ servers on your network with their mods, ready to join like any other server, even without an internet connection.
- New Join by address button next to the refresh button, for joining a server that isn't in the list by typing its address; favourites and recent servers added this way stay available.
- Play now shows what it is doing, from checking mods to waiting for DayZ to open, and the When DayZ starts setting in Settings > General now waits until the game is running.
- On Linux, fixed Play not starting DayZ from the AppImage on newer systems such as Ubuntu 25.04.
- On Linux, fixed Steam still showing you as playing DayZ after the launcher had finished downloading a server's mods.

## 1.1.0 - 2026-10-03

- New Linux version, as a .deb (Ubuntu, Debian, Mint), an .rpm (Fedora, openSUSE) or an AppImage for any other Linux, on Ubuntu 22.04, Debian 12 and newer: it uses your desktop's own title bar and buttons, and the AppImage offers to add itself to your app menu (also in Settings > General). DayZ runs through Steam's Proton, so install Proton BattlEye Runtime from your Steam library first.
- New light theme: choose Light, Dark or System in Settings > General. System is the default and follows this computer's light or dark setting, so choose Dark to keep the old look.
- New Filters menu next to the search, holding every filter in clear groups, with new ones for server type, ping, offline servers, time of day, BattlEye and mods a server must run. Filters that are on show as chips beside the search, each removable with one click.
- Search now suggests maps, mods and versions as you type; choose one to add it as a filter.
- Servers that stop answering now show as Offline, and favourite or recent servers that drop out of the server list stay in your lists marked Offline instead of disappearing.
- Checking for, downloading and installing updates no longer show pop-up messages: the update button shows how it is going, and its tooltip explains anything that went wrong.
- Settings > General is easier to read: settings are grouped like the rest of Settings, Interface size is a row of buttons, and it now says what an empty Character name does.
- The launcher is now called Flare Launcher, with a new icon. Your settings, favourites and recent servers are kept, and on Windows the old shortcuts are replaced with Flare Launcher ones.
- Favourites now always stay at the top of All servers, whatever filters are on; only the search narrows them.
- Installing a beta version now moves the launcher to the Beta update channel, so you are offered the next beta too. You can switch back in Settings > About.
- Fixed being kicked from a server for a corrupt or modified mod when that mod had been updated on the Workshop but Steam still had the old copy. Play and Load mods now download out-of-date mods as well as missing ones.

## 1.0.4 - 2026-10-03

- Clearer, more consistent wording across the launcher's messages, settings and tooltips, including a plainer explanation of ping.

## 1.0.3 - 2026-10-03

- Fixed updates after changing Update channel in Settings > About: an update downloaded from the channel you left is no longer offered to install, and an update that is already downloading no longer shows as available again.
- Security: servers whose address isn't valid are now left out of the server list, so a bad entry can't change how DayZ is started.

## 1.0.2 - 2026-10-03

- The Settings window is a little wider, and its update button says Up to Date when there is nothing new.
- Fixed two title bars showing at the top of the window after updating to 1.0.1.

## 1.0.1 - 2026-10-03

- The Settings window is bigger, and About is tidier: release notes open from What's new next to the version, and Check for updates automatically now sits at the top.
- Updates are clearer: About shows when the launcher last checked and how far a download has got, and a failed check shows in red with Try again, with a red dot on the update icon in the sidebar.
- The server list is easier to use with a keyboard: it shows an outline when you tab into it, you no longer tab through every favourite star, and screen readers announce the selected server.
- Small labels such as the 1PP tag and the mod names in search results are slightly larger and easier to read.
- The launcher now has its own dark title bar in place of the Windows one. Drag it to move the window, double-click it to maximise.
- Fixed the update icon spinning forever after the launcher had updated.
- Fixed double-clicking a server that needs a password starting DayZ without it. The launcher now asks for the password first.
- Fixed a modded server showing as vanilla when its mods couldn't be loaded (there is now a Try again button), and Play getting stuck on Checking mods.
- Fixed the update channel and automatic update setting looking saved when saving them had failed.

## 1.0.0 - 2026-10-03

- New server browser for thousands of DayZ servers: search by server name, map, IP or mod, filter by map, game version and mods, and keep favourites at the top.
- Live ping and player counts for the servers on screen. A ping marked ~ is an estimate, for servers that don't answer pings.
- Play downloads any mods a server needs through Steam, shows each one's progress, then joins the server. Load mods, next to Play, downloads them without starting DayZ.
- Settings for your character name, interface size, what the launcher does once DayZ starts, launch options such as skipping the intro, and the DayZ folder.
- The launcher checks for updates on its own and installs them when you choose.
