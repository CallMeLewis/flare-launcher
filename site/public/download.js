// Offers the download for the visitor's system, and fills in the version and size of the current release. On Linux,
// the main button gives the format that best suits the visitor's distribution, and the arrow beside it lists them all.

const PLATFORMS = {
  windows: { label: "Windows", requirement: "Windows 10 and 11, 64-bit" },
  linux: { label: "Linux", requirement: "AppImage, for any 64-bit Linux" },
  "linux-deb": { label: "Linux", requirement: ".deb, for Ubuntu, Debian and Mint" },
  "linux-rpm": { label: "Linux", requirement: ".rpm, for Fedora and openSUSE" },
};

const release = fetch("/latest.json")
  .then((response) => (response.ok ? response.json() : null))
  .catch(() => null);

/** "windows" or "linux", "phone" for phones and tablets, or null for other computers (macOS, ChromeOS). */
function detectPlatform() {
  const ua = navigator.userAgent;
  // iPads ask for the desktop site and report themselves as a Mac, but have a touch screen.
  const iPad = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  if (iPad || navigator.userAgentData?.mobile || /Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return "phone";
  if (/CrOS/.test(ua)) return null;
  const platform = navigator.userAgentData?.platform || navigator.platform || ua;
  if (/Win/i.test(platform)) return "windows";
  if (/Linux|X11|BSD/i.test(platform)) return "linux";
  return null;
}

/**
 * The Linux download that best suits this visitor. Only some browsers say which distribution they run on (Firefox on
 * Ubuntu and Fedora does), so anything else gets the AppImage, which runs everywhere.
 */
function linuxFormat() {
  const ua = navigator.userAgent;
  if (/Ubuntu|Debian|Mint|Pop!_OS|elementary|Zorin/i.test(ua)) return "linux-deb";
  if (/Fedora|openSUSE|SUSE|Red Hat|CentOS|Rocky|AlmaLinux|Nobara/i.test(ua)) return "linux-rpm";
  return "linux";
}

function formatSize(bytes) {
  const mb = bytes / 1024 / 1024;
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

const isLinux = (platform) => platform.startsWith("linux");
const other = (platform) => (isLinux(platform) ? "windows" : linuxFormat());

async function show(platform) {
  const { label, requirement } = PLATFORMS[platform];
  document.getElementById("download").dataset.platform = platform;
  document.getElementById("button").href = `/thanks/${platform}`;
  document.getElementById("button-label").textContent = `Download for ${label}`;
  const formats = document.getElementById("formats");
  formats.hidden = !isLinux(platform);
  formats.open = false;
  for (const link of formats.querySelectorAll("a[data-format]")) {
    if (link.dataset.format === platform) link.setAttribute("aria-current", "true");
    else link.removeAttribute("aria-current");
  }
  const switchLink = document.getElementById("switch");
  switchLink.href = `#${other(platform)}`;
  switchLink.textContent = `Download for ${PLATFORMS[other(platform)].label} instead`;

  const meta = document.getElementById("meta");
  meta.textContent = requirement;
  const latest = await release;
  if (!latest?.version || document.getElementById("download").dataset.platform !== platform) return;
  document.getElementById("whats-new").textContent = `What's new in ${latest.version}`;
  const size = latest[platform]?.size;
  meta.textContent = [`Version ${latest.version}`, size && formatSize(size), requirement].filter(Boolean).join(" · ");
}

const detected = detectPlatform();
const supported = detected === "windows" || detected === "linux";
const fromHash = () => (location.hash.slice(1) in PLATFORMS ? location.hash.slice(1) : null);
/** What the page shows with no platform in the address. */
const initial = detected === "linux" ? linuxFormat() : supported ? detected : "windows";

document.body.dataset.supported = String(supported);
const notice = document.getElementById("notice");
notice.hidden = supported;
if (detected === "phone") {
  notice.textContent = "Open this page on your computer to download. The launcher runs on Windows and Linux.";
} else if (!supported) {
  notice.textContent = "The launcher runs on Windows and Linux computers.";
}

show(fromHash() ?? initial);

// Also runs on Back and Forward, so going back to the plain address returns to the detected platform.
window.addEventListener("hashchange", () => {
  const platform = fromHash() ?? initial;
  show(platform);
  document.getElementById("status").textContent = `Showing the ${PLATFORMS[platform].label} download.`;
});

// The format menu closes on Escape, putting focus back on its arrow, and when clicking anywhere else.
const formats = document.getElementById("formats");
formats.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && formats.open) {
    formats.open = false;
    formats.querySelector("summary").focus();
  }
});
document.addEventListener("click", (event) => {
  if (formats.open && !formats.contains(event.target)) formats.open = false;
});
