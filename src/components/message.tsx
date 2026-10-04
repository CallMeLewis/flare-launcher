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
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <span className="text-muted-foreground">{icon}</span>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="max-w-xs text-[13px] text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}
