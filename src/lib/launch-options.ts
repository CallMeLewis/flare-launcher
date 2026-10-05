import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { Settings } from "./types";

type Toggle = "skipIntro" | "noSplash" | "noPause" | "windowed";

/** Game options offered as switches, each mapping to one DayZ startup flag. */
export const LAUNCH_OPTIONS: { key: Toggle; flag: string; label: MessageDescriptor; description: MessageDescriptor }[] =
  [
    {
      key: "skipIntro",
      flag: "-skipIntro",
      label: msg`Skip the intro`,
      description: msg`Goes straight to loading instead of playing the intro.`,
    },
    {
      key: "noSplash",
      flag: "-nosplash",
      label: msg`Skip the splash screens`,
      description: msg`Hides the logo screens shown while the game starts.`,
    },
    {
      key: "noPause",
      flag: "-noPause",
      label: msg`Keep running in the background`,
      description: msg`Stops the game from pausing when you switch to another window.`,
    },
    {
      key: "windowed",
      flag: "-window",
      label: msg`Windowed mode`,
      description: msg`Starts the game in a window instead of full screen.`,
    },
  ];

/** The extra startup flags the settings add to every launch. */
export function launchArgs(settings: Settings): string {
  const flags = LAUNCH_OPTIONS.filter((option) => settings[option.key]).map((option) => option.flag);
  const extra = settings.extraArgs.trim();
  return [...flags, ...(extra ? [extra] : [])].join(" ");
}
