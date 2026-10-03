import { useSyncExternalStore } from "react";
import { backend } from "./backend";
import type { Theme } from "./types";

const systemDark = window.matchMedia("(prefers-color-scheme: dark)");
const listeners = new Set<() => void>();

const isDark = () => document.documentElement.classList.contains("dark");

function setDark(dark: boolean) {
  if (dark === isDark()) return;
  document.documentElement.classList.toggle("dark", dark);
  listeners.forEach((listener) => listener());
}

/**
 * The theme saved in Settings, read before the page first draws so it never flashes in the other one. Matches the
 * key and default App uses for settings.
 */
export function savedTheme(): Theme {
  try {
    const theme = (JSON.parse(localStorage.getItem("settings") ?? "{}") as { theme?: unknown }).theme;
    return theme === "light" || theme === "dark" ? theme : "system";
  } catch {
    return "system";
  }
}

/** Colours the page for a theme straight away, without touching the window. */
export function paintTheme(theme: Theme) {
  setDark(theme === "dark" || (theme === "system" && systemDark.matches));
}

/** Puts the page and the window in a theme and keeps them there. Returns a function that stops following it. */
export function followTheme(theme: Theme): () => void {
  const sync = () => backend.setWindowTheme(theme === "system" ? null : theme).catch(() => {});
  paintTheme(theme);
  void sync();
  const onSystemChange = () => {
    if (theme === "system") paintTheme(theme);
    // On Linux the window takes on the system's look when it changes, whatever was chosen; put it back.
    else void sync();
  };
  systemDark.addEventListener("change", onSystemChange);
  return () => systemDark.removeEventListener("change", onSystemChange);
}

/** Whether the page is showing dark right now. */
export function useDarkTheme(): boolean {
  return useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, isDark);
}
