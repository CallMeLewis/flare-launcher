import { useLingui } from "@lingui/react/macro";
import { countryName } from "@/lib/countries";
import { cn } from "@/lib/utils";

// Each flag is its own file in the build, so only the flags on screen load. Only countries' flags are taken: the
// regions' flags, such as GB-SCT, would otherwise be read as other countries' codes.
const FLAGS = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>("/node_modules/country-flag-icons/3x2/[A-Z][A-Z].svg", {
      eager: true,
      query: "?url",
      import: "default",
    }),
  ).map(([path, url]) => [path.slice(-6, -4), url]),
);

/** A country's flag, named on hover and to screen readers. Its code when there is no flag for it. */
export function CountryFlag({ code, className }: { code: string; className?: string }) {
  const { i18n } = useLingui();
  const name = countryName(code, i18n.locale);
  const flag = FLAGS[code];
  if (!flag) {
    return (
      <span title={name} className={cn("data text-xs text-muted-foreground", className)}>
        {code}
      </span>
    );
  }
  return (
    <img
      src={flag}
      alt={name}
      title={name}
      draggable={false}
      // The outline keeps white flags visible on a light background.
      className={cn(
        "inline-block h-3 w-[18px] shrink-0 rounded-[2px] outline outline-1 outline-foreground/15",
        className,
      )}
    />
  );
}
