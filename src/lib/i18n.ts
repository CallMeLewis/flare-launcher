import { i18n } from "@lingui/core";
import type { Language, Locale } from "./types";

/** The languages the launcher comes in, each named in itself. Their catalogues are in `src/locales`. */
export const LOCALES: { value: Locale; name: string }[] = [
  { value: "en-GB", name: "English (UK)" },
  { value: "en-US", name: "English (US)" },
  { value: "fr", name: "Français" },
  { value: "de", name: "Deutsch" },
];
/** What the interface is written in, and what any other language falls back to. */
const SOURCE_LOCALE: Locale = "en-GB";

/**
 * The locale to show for a Language setting: the chosen one, or for System the first of the computer's languages the
 * launcher has. A language it has in another region counts, so English from Australia or Ireland gets British English.
 */
export function resolveLocale(language: Language, preferred: readonly string[] = navigator.languages): Locale {
  if (language !== "system") return language;
  for (const tag of preferred) {
    const exact = LOCALES.find(({ value }) => value.toLowerCase() === tag.toLowerCase());
    if (exact) return exact.value;
    const base = tag.split("-")[0].toLowerCase();
    const sameLanguage = LOCALES.find(({ value }) => value.split("-")[0] === base);
    if (sameLanguage) return sameLanguage.value;
  }
  return SOURCE_LOCALE;
}

/**
 * The Language setting saved in Settings, read before the page first draws so it never shows in another language
 * first. Matches the key and default App uses for settings.
 */
export function savedLanguage(): Language {
  try {
    const language = (JSON.parse(localStorage.getItem("settings") ?? "{}") as { language?: unknown }).language;
    return LOCALES.find(({ value }) => value === language)?.value ?? "system";
  } catch {
    return "system";
  }
}

let requested: Locale | undefined;

/** Loads a language's catalogue, packaged with the app as a file of its own, and switches the interface to it. */
export async function activateLocale(locale: Locale): Promise<void> {
  requested = locale;
  if (i18n.locale === locale) return;
  const { messages } = await import(`../locales/${locale}.po`);
  // A later choice wins over one still loading.
  if (requested !== locale) return;
  i18n.loadAndActivate({ locale, messages });
  document.documentElement.lang = locale;
}

/** Follows a Language setting, including changes to the computer's languages for System. Returns a stop function. */
export function followLanguage(language: Language): () => void {
  void activateLocale(resolveLocale(language));
  if (language !== "system") return () => {};
  const onChange = () => void activateLocale(resolveLocale(language));
  window.addEventListener("languagechange", onChange);
  return () => window.removeEventListener("languagechange", onChange);
}
