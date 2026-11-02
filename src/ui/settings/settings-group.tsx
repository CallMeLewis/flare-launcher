import { useId, type ReactNode } from "react";
import { Label } from "../components/label";

/** A section's title and what it covers, at the top of a settings page. */
export function SectionHeading({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h3 className="text-[15px] font-semibold">{title}</h3>
      <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>
    </div>
  );
}

/** A titled card of setting rows. */
export function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h4 id={id} className="text-sm font-semibold">
        {title}
      </h4>
      <div className="flex flex-col divide-y rounded-lg border bg-card">{children}</div>
    </section>
  );
}

/**
 * One setting: what it is and what it does on the left, its control on the right. The control is passed in, so it
 * points `aria-describedby` at `<id>-description` itself; a group of buttons uses `<id>-label` as its name.
 */
export function SettingRow({
  id,
  label,
  description,
  children,
}: {
  id: string;
  label: string;
  description: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-6 px-4 py-3.5">
      <div className="min-w-0">
        <Label id={`${id}-label`} htmlFor={id} className="text-[13px]">
          {label}
        </Label>
        <p id={`${id}-description`} className="mt-0.5 text-xs text-muted-foreground">
          {description}
        </p>
      </div>
      {children}
    </div>
  );
}

/** A setting that is only shown, such as a version: its name and description on the left, its value on the right. */
export function InfoRow({ label, description, value }: { label: string; description: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-6 px-4 py-3.5">
      <div className="min-w-0">
        <p className="text-[13px] leading-none font-medium">{label}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      <span className="data selectable shrink-0 text-xs text-muted-foreground">{value}</span>
    </div>
  );
}
