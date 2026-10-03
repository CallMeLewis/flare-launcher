import type { Settings } from "./types";

type Toggle = "skipIntro" | "noSplash" | "noPause" | "windowed";

/** Game options offered as switches, each mapping to one DayZ startup flag. */
export const LAUNCH_OPTIONS: { key: Toggle; flag: string; label: string; description: string }[] = [
  {
    key: "skipIntro",
    flag: "-skipIntro",
    label: "Skip the intro",
    description: "Goes straight to loading instead of playing the intro.",
  },
  {
    key: "noSplash",
    flag: "-nosplash",
    label: "Skip the splash screens",
    description: "Hides the logo screens shown while the game starts.",
  },
  {
    key: "noPause",
    flag: "-noPause",
    label: "Keep running in the background",
    description: "Stops the game from pausing when you switch to another window.",
  },
  {
    key: "windowed",
    flag: "-window",
    label: "Windowed mode",
    description: "Starts the game in a window instead of full screen.",
  },
];

/** The extra startup flags the settings add to every launch. */
export function launchArgs(settings: Settings): string {
  const flags = LAUNCH_OPTIONS.filter((option) => settings[option.key]).map((option) => option.flag);
  const extra = settings.extraArgs.trim();
  return [...flags, ...(extra ? [extra] : [])].join(" ");
}
