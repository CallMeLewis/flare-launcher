import type { ReactNode } from "react";
import { FlareProvider, type InstallNotice } from "@flare/ui";
import { useLingui } from "@lingui/react/macro";
import { backendText } from "@/lib/backend-messages";

/** The shared interface's messages (SHARED_MESSAGES) in the launcher's language, looked up by their English. */
function translate(message: string, values?: Record<string, string | number>): string {
  return backendText({ message, values: values ?? {} });
}

/** What the update's install prompt adds: the game isn't closed with the launcher. */
function useInstallNotice(): InstallNotice {
  const { t } = useLingui();
  return { note: t`If DayZ is running, it will keep running.` };
}

/**
 * Gives the Flare apps' shared interface (@flare/ui) the launcher's name, version and notes, in the player's language.
 * Inside the I18nProvider, so it follows a change of language.
 */
export function SharedInterface({ children }: { children: ReactNode }) {
  const { i18n } = useLingui();
  return (
    <FlareProvider
      app={{ name: "Flare Launcher", version: __APP_VERSION__, releaseNotes: __APP_RELEASE_NOTES__ }}
      translate={translate}
      locale={i18n.locale}
      useInstallNotice={useInstallNotice}
    >
      {children}
    </FlareProvider>
  );
}
