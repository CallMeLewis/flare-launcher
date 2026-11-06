import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** An empty or error state: what happened, and the next thing to do. */
export function Message({
  icon,
  title,
  description,
  action,
  quiet = false,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
  /** A hint rather than a state, such as the panel waiting for a server to be picked: softer, so it doesn't compete. */
  quiet?: boolean;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <span
        className={cn(
          "flex items-center justify-center rounded-xl border text-muted-foreground",
          quiet ? "size-10 bg-transparent" : "size-12 bg-muted/60",
        )}
      >
        {icon}
      </span>
      <div className="flex flex-col gap-1.5">
        <p className={cn(quiet ? "text-sm font-medium text-muted-foreground" : "text-[15px] font-semibold")}>{title}</p>
        <p className="max-w-xs text-[13px] leading-relaxed text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}
