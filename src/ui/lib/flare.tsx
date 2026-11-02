import { createContext, useContext, type ReactNode } from "react";
import { setPretendRelease } from "../updates/api";

/** Values for a message's `{name}` placeholders. */
export type Values = Record<string, string | number>;

/**
 * Turns one of the shared components' English messages into the text to show. Every message is a literal in the
 * components (listed in `MESSAGES`), so an app with translations can look it up by its English, as Flare Launcher does
 * for its backend's text.
 */
export type Translate = (message: string, values?: Values) => string;

/** The app the shared components are part of. */
export interface FlareApp {
  /** Its name as shown, such as "Flare Navgen". */
  name: string;
  version: string;
  /** The running version's release notes, from its section of CHANGELOG.md. */
  releaseNotes: string[];
}

/** What the install prompt adds while the app is busy, such as a warning that installing ends a running job. */
export interface InstallNotice {
  /** A sentence added to the prompt's description. */
  note?: string;
  /** Replaces "Install and restart", such as "Install and end the run". */
  confirmLabel?: string;
  /** Shows the install button in the destructive colour, for when installing cuts work off. */
  destructive?: boolean;
}

export interface FlareConfig {
  app: FlareApp;
  /** Defaults to the English messages with their values filled in. */
  translate?: Translate;
  /** For times and dates. Defaults to British English. */
  locale?: string;
  /**
   * A hook the install prompt calls, so it can follow what the app is doing while it's open. Pass the same function on
   * every render, as with any hook.
   */
  useInstallNotice?: () => InstallNotice | null;
}

/** Fills `{name}` placeholders in with their values. */
export function fill(message: string, values?: Values): string {
  if (!values) return message;
  return message.replace(/\{(\w+)\}/g, (match, name: string) => (name in values ? String(values[name]) : match));
}

const noNotice = () => null;

const FlareContext = createContext<Required<FlareConfig> | null>(null);

/** Gives the shared components the app's name, version and wording. Put it around the app. */
export function FlareProvider({ children, ...config }: FlareConfig & { children: ReactNode }) {
  const value: Required<FlareConfig> = {
    translate: fill,
    locale: "en-GB",
    useInstallNotice: noNotice,
    ...config,
  };
  // Development builds pretend to update to the next version, with this one's notes.
  setPretendRelease(config.app.version, config.app.releaseNotes);
  return <FlareContext.Provider value={value}>{children}</FlareContext.Provider>;
}

/** The app's `translate`, or English where there is no provider, for the basic components such as dialogs. */
export function useTranslate(): Translate {
  return useContext(FlareContext)?.translate ?? fill;
}

export function useFlare(): Required<FlareConfig> & { t: Translate } {
  const config = useContext(FlareContext);
  if (!config) throw new Error("The shared Flare components need a FlareProvider around them.");
  return { ...config, t: config.translate };
}
