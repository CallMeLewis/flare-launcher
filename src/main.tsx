import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { activateLocale, resolveLocale, savedLanguage } from "@/lib/i18n";
import { paintTheme, savedTheme } from "@/lib/theme";
import "./globals.css";

paintTheme(savedTheme());

// The language is loaded before the first draw, so the interface never shows in another one first.
void activateLocale(resolveLocale(savedLanguage())).then(() =>
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <I18nProvider i18n={i18n}>
        <TooltipProvider delayDuration={300}>
          <App />
          <Toaster position="bottom-center" />
        </TooltipProvider>
      </I18nProvider>
    </StrictMode>,
  ),
);
