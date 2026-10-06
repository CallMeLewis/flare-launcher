# Changelog

What changed in each version of Flare Launcher, newest first.

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
