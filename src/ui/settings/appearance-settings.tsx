import type { ReactNode } from "react";
import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { useFlare } from "../lib/flare";
import { ToggleGroup, ToggleGroupItem } from "../components/toggle-group";
import { SettingRow, SettingsGroup } from "./settings-group";

export type Theme = "light" | "dark" | "system";

/** The interface sizes on offer, as a share of the normal size. */
export const INTERFACE_SCALES = [0.9, 1, 1.1, 1.25, 1.5];

const THEMES: { value: Theme; icon: LucideIcon }[] = [
  { value: "light", icon: Sun },
  { value: "dark", icon: Moon },
  { value: "system", icon: Monitor },
];

/** Shows the window at a size (from `INTERFACE_SCALES`) by zooming its webview. Needs `core:webview:allow-set-webview-zoom`. */
export async function setInterfaceScale(scale: number): Promise<void> {
  const { isTauri } = await import("@tauri-apps/api/core");
  if (!isTauri()) return;
  const { getCurrentWebview } = await import("@tauri-apps/api/webview");
  await getCurrentWebview().setZoom(scale);
}

/**
 * The Appearance group of Settings: the theme and the interface size. The app keeps both, applies the theme and calls
 * `setInterfaceScale` when the size changes. `children` are the app's own rows, shown first, such as its language.
 */
export function AppearanceSettings({
  theme,
  onThemeChange,
  scale,
  onScaleChange,
  children,
}: {
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  scale: number;
  onScaleChange: (scale: number) => void;
  children?: ReactNode;
}) {
  const { t } = useFlare();
  const names: Record<Theme, string> = { light: t("Light"), dark: t("Dark"), system: t("System") };
  return (
    <SettingsGroup title={t("Appearance")}>
      {children}
      <SettingRow id="theme" label={t("Theme")} description={t("Light or dark, or System to match this computer.")}>
        <ToggleGroup
          type="single"
          aria-labelledby="theme-label"
          aria-describedby="theme-description"
          value={theme}
          // Selecting the current theme again would clear it; a theme is always chosen.
          onValueChange={(value) => value && onThemeChange(value as Theme)}
          className="shrink-0"
        >
          {THEMES.map(({ value, icon: Icon }) => (
            <ToggleGroupItem
              key={value}
              // The label clicks the chosen theme, which focuses it and leaves it chosen.
              id={value === theme ? "theme" : undefined}
              value={value}
              className="gap-1.5"
            >
              <Icon className="size-3.5" aria-hidden />
              {names[value]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </SettingRow>
      <SettingRow
        id="ui-scale"
        label={t("Interface size")}
        description={t("Makes text and controls larger or smaller.")}
      >
        {/* Every size on show, so the current one is clear and any other is one click away. */}
        <ToggleGroup
          type="single"
          aria-labelledby="ui-scale-label"
          aria-describedby="ui-scale-description"
          value={String(scale)}
          // Selecting the current size again would clear it; a size is always chosen.
          onValueChange={(value) => value && onScaleChange(Number(value))}
          className="shrink-0"
        >
          {INTERFACE_SCALES.map((option) => (
            <ToggleGroupItem
              key={option}
              // The label clicks the chosen size, which focuses it and leaves it chosen.
              id={option === scale ? "ui-scale" : undefined}
              value={String(option)}
              className="data"
            >
              {Math.round(option * 100)}%
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </SettingRow>
    </SettingsGroup>
  );
}
