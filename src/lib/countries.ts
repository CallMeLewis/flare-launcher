const names = new Map<string, Intl.DisplayNames>();

/** A country's name in `locale`, from its two-letter code, such as Germany for `DE`. The code when there isn't one. */
export function countryName(code: string, locale: string): string {
  let display = names.get(locale);
  if (!display) {
    display = new Intl.DisplayNames([locale], { type: "region", fallback: "code" });
    names.set(locale, display);
  }
  try {
    return display.of(code) ?? code;
  } catch {
    return code;
  }
}
