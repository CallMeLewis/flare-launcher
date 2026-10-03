// Serves the download page. /download/windows and /download/linux send the browser to the newest build, so links to
// them never go stale. /thanks/windows and /thanks/linux are the thank-you page the Download button opens: it starts
// that download and shows the first-run steps. /changelog lists every published version's notes from CHANGELOG.md. /latest.json gives the page the version and size of each build (the
// update feed itself can't be read from the page). Everything else is a file from public/.

import changelogText from "../../CHANGELOG.md";
import { compareVersions, parseChangelog } from "../../scripts/changelog.mjs";

// The update feed: the GitHub release that holds the channel files, each pointing at its version's own release.
const FEED = "https://github.com/CallMeLewis/flare-launcher/releases/download/updater/latest.json";
const BETA_FEED = "https://github.com/CallMeLewis/flare-launcher/releases/download/updater/beta.json";

/** The page's name for each download, and the feed's. `linux` is the AppImage, which /download/linux has always
 * given. */
const PLATFORMS = {
  windows: "windows-x86_64",
  linux: "linux-x86_64-appimage",
  "linux-deb": "linux-x86_64-deb",
  "linux-rpm": "linux-x86_64-rpm",
};

const isPlatform = (name) => Object.hasOwn(PLATFORMS, name);

/** A channel's current release, cached at the edge for a minute so a new release shows up quickly. */
async function feedRelease(url) {
  const response = await fetch(url, { cf: { cacheTtl: 60, cacheEverything: true } });
  if (!response.ok) throw new Error(`The update feed answered ${response.status}`);
  return response.json();
}

/** The current stable release. */
const latestRelease = () => feedRelease(FEED);

const escapeHtml = (text) =>
  text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** The changelog page: every published version's notes from CHANGELOG.md, newest first. */
async function changelog() {
  // A section written for a release that isn't out yet stays hidden until that version is in a feed. If neither feed
  // can be read, every section shows.
  const versions = await Promise.all(
    [FEED, BETA_FEED].map((url) => feedRelease(url).then((release) => release.version, () => null)),
  );
  const newest = versions.filter(Boolean).sort(compareVersions).at(-1);
  const releases = parseChangelog(changelogText).filter((r) => !newest || compareVersions(r.version, newest) <= 0);
  // The file's introduction, between its title and the first version.
  const intro = changelogText
    .split(/^## /m)[0]
    .split(/\r?\n/)
    .filter((line) => line.trim() && !line.startsWith("#"))
    .join(" ");
  const formatDate = (date) =>
    new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const sections = releases
    .map(
      ({ version, date, items }) => `
      <section class="release" aria-labelledby="v${escapeHtml(version)}">
        <h2 id="v${escapeHtml(version)}">${escapeHtml(version)}${version.includes("-") ? ' <span class="chip">Beta</span>' : ""}</h2>
        ${date ? `<p class="release-date"><time datetime="${escapeHtml(date)}">${escapeHtml(formatDate(date))}</time></p>` : ""}
        <ul>${items.map((item) => `\n          <li>${escapeHtml(item)}</li>`).join("")}
        </ul>
      </section>`,
    )
    .join("");
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>What's new in Flare Launcher</title>
    <meta name="description" content="Every version of Flare Launcher and what changed in it." />
    <meta name="theme-color" content="#0B1120" media="(prefers-color-scheme: dark)" />
    <meta name="theme-color" content="#FFFFFF" media="(prefers-color-scheme: light)" />
    <link rel="icon" href="/icon.svg" type="image/svg+xml" />
    <link rel="icon" href="/favicon.png" type="image/png" sizes="32x32" />
    <link rel="stylesheet" href="/style.css" />
  </head>
  <body>
    <main class="changelog">
      <img class="logo" src="/icon.svg" alt="" width="64" height="64" />
      <h1>What's new</h1>
      <p class="tagline">${escapeHtml(intro)}</p>
${sections}
      <a class="switch" href="/">Back to the download page</a>
    </main>
  </body>
</html>
`;
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300" },
  });
}

/** A page in the download page's style, with a way back to it. */
function errorPage(status, title, message, headers = {}) {
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title} - Flare Launcher</title>
    <link rel="icon" href="/icon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="/style.css" />
  </head>
  <body>
    <main class="error">
      <img class="logo" src="/icon.svg" alt="" width="88" height="88" />
      <h1>${title}</h1>
      <p class="tagline">${message}</p>
      <a class="button" href="/">Back to the download page</a>
    </main>
  </body>
</html>
`;
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", ...headers },
  });
}

async function download(platform) {
  if (!isPlatform(platform)) return errorPage(404, "There's no download here", "Choose your download on the main page.");
  try {
    const key = PLATFORMS[platform];
    const url = (await latestRelease()).platforms?.[key]?.url;
    if (!url) throw new Error(`The feed has no ${key} build`);
    return new Response(null, { status: 302, headers: { Location: url, "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(error);
    return errorPage(503, "The download isn't available right now", "Please try again in a minute.", {
      "Retry-After": "60",
    });
  }
}

/** The build's file name, such as Flare-Launcher-1.1.0.AppImage, from its address in the feed. */
const fileName = (url) => decodeURIComponent(new URL(url).pathname.split("/").pop());

/** The thank-you page for one platform: public/thanks.html, filled in so it works without JavaScript. */
async function thanks(request, env, platform) {
  if (!isPlatform(platform)) return Response.redirect(new URL("/", request.url), 302);
  const page = await env.ASSETS.fetch(new URL("/thanks", request.url));
  // Without the feed the page still works, naming the file in general terms.
  const url = await latestRelease()
    .then((release) => release.platforms?.[PLATFORMS[platform]]?.url)
    .catch(() => null);
  const file = url ? fileName(url) : null;
  let rewriter = new HTMLRewriter()
    .on("body", { element: (body) => body.setAttribute("data-platform", platform) })
    .on("#autostart", { element: (meta) => meta.setAttribute("content", `1;url=/download/${platform}`) })
    .on("#again", { element: (link) => link.setAttribute("href", `/download/${platform}`) });
  if (file) {
    rewriter = rewriter
      .on(".file", { element: (span) => span.setInnerContent(file) })
      .on("#chmod", { element: (code) => code.setInnerContent(`chmod +x ${file}`) })
      .on("#apt", { element: (code) => code.setInnerContent(`sudo apt install ./${file}`) })
      .on("#dnf", { element: (code) => code.setInnerContent(`sudo dnf install ./${file}`) });
  }
  const response = rewriter.transform(page);
  const headers = new Headers(response.headers);
  // Every visit starts a download, so the page is never served from a cache.
  headers.set("Cache-Control", "no-store");
  return new Response(response.body, { status: response.status, headers });
}

async function latest() {
  try {
    const release = await latestRelease();
    const builds = await Promise.all(
      Object.entries(PLATFORMS).map(async ([platform, key]) => {
        const url = release.platforms?.[key]?.url;
        if (!url) return [platform, null];
        const head = await fetch(url, { method: "HEAD", cf: { cacheTtl: 3600, cacheEverything: true } });
        return [platform, { size: Number(head.headers.get("Content-Length")) || null, file: fileName(url) }];
      }),
    );
    return Response.json(
      { version: release.version, ...Object.fromEntries(builds) },
      { headers: { "Cache-Control": "public, max-age=60" } },
    );
  } catch (error) {
    console.error(error);
    return Response.json({ error: "unavailable" }, { status: 503 });
  }
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (request.method === "GET" || request.method === "HEAD") {
      const match = pathname.match(/^\/download\/([a-z-]+)\/?$/);
      if (match) return download(match[1]);
      if (pathname === "/latest.json") return latest();
      if (pathname === "/changelog" || pathname === "/changelog/") return changelog();
      const thanksMatch = pathname.match(/^\/thanks(?:\/([a-z-]*))?\/?$/);
      if (thanksMatch) return thanks(request, env, thanksMatch[1]);
    }
    return env.ASSETS.fetch(request);
  },
};
