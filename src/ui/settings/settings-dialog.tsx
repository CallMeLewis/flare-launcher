import { useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "cn";
import { useFlare } from "../lib/flare";
import { Dialog, DialogContent, DialogTitle } from "../components/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/tabs";

export interface SettingsSection {
  id: string;
  label: string;
  icon: LucideIcon;
  /** What the section covers, under its title at the top of the pane. */
  description: string;
  /** Pinned to the bottom of the menu, as About is. */
  pinned?: boolean;
  /** Marks the section in the menu with a dot, for a setting that needs looking at, such as a folder not found. */
  attention?: boolean;
  content: ReactNode;
}

/**
 * Settings in a dialog: a menu of sections on the left, one shown at a time on the right under its title. Every Flare
 * app's settings look like this. `footer` sits under the pane, for an app whose settings save with a button rather
 * than as they change.
 */
export function SettingsDialog({
  open,
  onOpenChange,
  sections,
  section,
  onSectionChange,
  footer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sections: SettingsSection[];
  /** The section shown, for an app that opens Settings at one. Otherwise the dialog keeps track itself. */
  section?: string;
  onSectionChange?: (section: string) => void;
  footer?: ReactNode;
}) {
  const { app, t } = useFlare();
  const [chosen, setChosen] = useState(sections[0]?.id ?? "");
  const current = section ?? chosen;
  const change = (next: string) => {
    setChosen(next);
    onSectionChange?.(next);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className="h-[min(760px,calc(100vh-4rem))] gap-0 overflow-hidden p-0 sm:max-w-[60rem]"
      >
        <Tabs value={current} onValueChange={change} orientation="vertical" className="h-full min-h-0 gap-0">
          <div className="flex w-52 shrink-0 flex-col border-r bg-background/40">
            {/* As tall as each section's title on the right, so the two titles and the line under them meet. */}
            <div className="flex h-16 shrink-0 flex-col justify-center border-b px-5">
              <DialogTitle className="text-[15px] font-semibold">{t("Settings")}</DialogTitle>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {app.name} <span className="data">{app.version}</span>
              </p>
            </div>
            <TabsList className="h-auto w-full flex-1 flex-col items-stretch justify-start gap-0.5 bg-transparent p-3">
              {sections.map(({ id, label, icon: Icon, pinned, attention }) => (
                <TabsTrigger
                  key={id}
                  value={id}
                  className={cn(
                    pinned && "mt-auto",
                    "h-9 flex-none justify-start gap-2.5 px-2.5 text-[13px] font-normal text-muted-foreground after:hidden hover:text-foreground data-[state=active]:bg-accent data-[state=active]:font-medium data-[state=active]:text-foreground data-[state=active]:shadow-none dark:data-[state=active]:border-transparent dark:data-[state=active]:bg-accent [&[data-state=active]>svg]:text-primary",
                  )}
                >
                  <Icon className="size-4" aria-hidden />
                  {label}
                  {attention && (
                    <>
                      <span className="ml-auto size-1.5 rounded-full bg-danger" aria-hidden />
                      <span className="sr-only">{t("Needs attention")}</span>
                    </>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <div className="flex min-w-0 flex-1 flex-col">
            {sections.map(({ id, label, description: about, content }) => (
              <TabsContent key={id} value={id} className="flex min-h-0 flex-1 flex-col">
                {/* The section's title stays put while its settings scroll under it. */}
                <header className="flex h-16 shrink-0 flex-col justify-center border-b px-6 pr-14">
                  <h3 className="text-[15px] font-semibold">{label}</h3>
                  <p className="mt-0.5 text-[13px] text-muted-foreground">{about}</p>
                </header>
                <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-6 pr-14 text-sm">{content}</div>
              </TabsContent>
            ))}
            {footer && <div className="flex shrink-0 items-center justify-end gap-2 border-t px-6 py-3">{footer}</div>}
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
