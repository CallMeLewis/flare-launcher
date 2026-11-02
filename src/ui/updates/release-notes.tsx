import { cn } from "cn";
import { useFlare } from "../lib/flare";
import { Button } from "../components/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../components/dialog";

/** Release notes as a bulleted list. Always plain text: the notes in the update feed are not signed. */
export function ReleaseNotesList({ items, className }: { items: string[]; className?: string }) {
  return (
    <ul className={cn("list-disc space-y-1 pl-4", className)}>
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  );
}

/** A small "What's new" link that opens a version's release notes. */
export function ReleaseNotesLink({
  version,
  items,
  description,
  label,
}: {
  version: string;
  items: string[];
  description?: string;
  label?: string;
}) {
  const { t } = useFlare();
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="link" className="h-auto p-0 text-xs font-normal">
          {label ?? t("What's new")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("What's new in version {version}", { version })}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto pr-1">
          <ReleaseNotesList items={items} className="space-y-2 text-sm leading-relaxed" />
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">{t("Close")}</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
