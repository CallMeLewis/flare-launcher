import type { ReactNode } from "react";

/** An empty or error state: what happened, and the next thing to do. */
export function Message({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <span className="flex size-12 items-center justify-center rounded-xl border bg-muted/60 text-muted-foreground">
        {icon}
      </span>
      <div className="flex flex-col gap-1.5">
        <p className="text-[15px] font-semibold">{title}</p>
        <p className="max-w-xs text-[13px] leading-relaxed text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}
