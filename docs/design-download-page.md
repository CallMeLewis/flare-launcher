# Download page design

How the download page in `site/` differs from the launcher's [design](design.md). It's a minimal single column, cut
down to the one job: no nav, screenshots, feature list or footer.

## Layout

One centred column, 480px wide: icon, name, tagline ("Find a server. Get the mods. Jump straight in."), one large
download button, the version, size and requirement under it, then a link to the other platform. On phones the button
fills the width.

The button opens a thank-you page (`/thanks/windows` or `/thanks/linux`) in the same column: "Thanks for downloading",
a line saying the download starts in a moment with a "download it again" link, the next steps for that platform in a
bordered box, the requirement line and a link back.

On Linux, an arrow joined to the right of the download button opens a menu of every Linux format: `.deb` (Ubuntu,
Debian, Mint, Pop!_OS), `.rpm` (Fedora, openSUSE, Nobara) and AppImage (Steam Deck, Arch and any other Linux). Each
entry shows the format in Fira Code and who it is for, and the main button's format is marked Recommended. The main
button gives `.deb` or `.rpm` when the browser names Ubuntu-like or Fedora-like distributions (Firefox there does), and
the AppImage otherwise. Choosing an entry goes straight to its download. The menu is a `<details>` element, so it
works with the keyboard and without JavaScript; Escape and clicking elsewhere close it.

Under the version line, a "What's new in <version>" link opens the changelog page (`/changelog`): a wider
640px column with the changelog's introduction, then one bordered card per published version (version in Fira Code,
a Beta chip on betas, the date, the notes as a list), newest first, and a link back.

## Differences from the launcher

- Larger type: 16px body, 17px button and tagline, 32px title (28px on phones). It's a page, not a dense tool.
- Button 52px tall. Green still means "good to go": it is only the download button.
- Colours, fonts, 1px borders, flat surfaces and focus rings are as in [design.md](design.md). Light and dark follow the
  system.

## Behaviour

- Shows Windows or Linux from the browser's platform. Phones and tablets are told to open the page on a computer;
  other computers (macOS, ChromeOS) are told the launcher runs on Windows and Linux. On both, the button turns into an
  outlined secondary button, so it no longer looks like the next step, and Windows is shown.
- `#windows` and `#linux` in the address pick a platform, so a link can point at one. Back and Forward step between
  them; going back to the plain address returns to the detected platform.
- Switching platform is announced to screen readers through a hidden status line. Nothing is announced on load.
- The thank-you page starts the download itself after a second (a meta refresh the worker fills in, so it works
  without JavaScript) and names the real file. Windows steps: open the installer, get past the unsigned-installer
  warning, open it from the Start menu. Linux steps: allow it to run (naming the setting on Ubuntu and on KDE and
  Steam Deck), double-click, then choose Add when the launcher offers to add itself to the app menu, with the terminal
  command as an alternative.
- A missing or unavailable download shows a page in the same style with a button back to the download page.
- Without JavaScript the Windows button and the Linux link still lead to the thank-you page and the download.
