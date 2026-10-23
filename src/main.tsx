import { blockWebviewMenu } from "@flare/ui";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { CrashBoundary } from "@/components/crash-screen";
import { SharedInterface } from "@/components/shared-interface";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@flare/ui/ui/tooltip";
import { backend } from "@/lib/backend";
import { activateLocale, resolveLocale, savedLanguage } from "@/lib/i18n";
import { paintTheme, savedTheme } from "@/lib/theme";
import "./globals.css";

paintTheme(savedTheme());

// The web view's own menu (Back, Reload, Inspect) has no place in a desktop app. Text fields keep theirs, for pasting
// an address or password.
blockWebviewMenu();

// Errors outside React's drawing, such as a failed promise nothing waited for, are logged for the next problem report.
window.addEventListener("error", (event) => void backend.logInterfaceError(String(event.error ?? event.message)));
window.addEventListener("unhandledrejection", (event) => void backend.logInterfaceError(String(event.reason)));

// The language is loaded before the first draw, so the interface never shows in another one first. If it can't be
// loaded, British English is, rather than leaving the window empty.
void activateLocale(resolveLocale(savedLanguage()))
  .catch(() => activateLocale("en-GB"))
  .catch(() => {})
  .then(() =>
    createRoot(document.getElementById("root")!).render(
      <StrictMode>
        <I18nProvider i18n={i18n}>
          <SharedInterface>
            <CrashBoundary>
              <TooltipProvider delayDuration={300}>
                <App />
                <Toaster position="bottom-center" />
              </TooltipProvider>
            </CrashBoundary>
          </SharedInterface>
        </I18nProvider>
      </StrictMode>,
    ),
  );
